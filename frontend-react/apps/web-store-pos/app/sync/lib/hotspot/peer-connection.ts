// WebRTC engine for the hotspot device-to-device transfer
// (plan docs/deploy/2026-09-09-device-to-device-file-transfer-plan.md §3.1–3.2).
//
// Non-trickle signaling: the offer/answer is only encoded once ICE gathering
// has finished, so the complete SDP (host/mDNS candidates only) fits in one QR
// code. No STUN/TURN is configured — both devices are on the hotspot LAN, so
// there is nothing to discover beyond local candidates.
import { decodeSdp, encodeSdp } from './sdp-codec';

export const DATA_CHANNEL_LABEL = 'hotspot-transfer';
export const SIGNALING_TIMEOUT_MS = 10_000;

const RTC_CONFIG: RTCConfiguration = { iceServers: [] };

export interface PeerTiming {
  readonly iceGatheringTimeoutMs?: number;
  readonly dataChannelTimeoutMs?: number;
}

export interface StartedOffer {
  readonly connection: RTCPeerConnection;
  readonly channel: RTCDataChannel;
  readonly encodedOffer: string;
}

export interface AcceptedOffer {
  readonly connection: RTCPeerConnection;
  readonly channel: Promise<RTCDataChannel>;
  readonly encodedAnswer: string;
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(RTC_CONFIG);
}

/** Emitter side: open the channel, build the offer, and encode it for the QR. */
export async function createOffer(timing: PeerTiming = {}): Promise<StartedOffer> {
  const connection = createPeerConnection();
  const channel = connection.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  await waitForIceGatheringComplete(connection, timing.iceGatheringTimeoutMs);
  return { connection, channel, encodedOffer: await encodeSdp(localSdp(connection)) };
}

/** Receiver side: apply the scanned offer, answer it, and encode the answer. */
export async function acceptOffer(
  encodedOffer: string,
  timing: PeerTiming = {},
): Promise<AcceptedOffer> {
  const connection = createPeerConnection();
  // Register the listener BEFORE applying the offer so the event is never missed.
  const channel = waitForDataChannel(connection, timing.dataChannelTimeoutMs);
  await connection.setRemoteDescription({ type: 'offer', sdp: await decodeSdp(encodedOffer) });
  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  await waitForIceGatheringComplete(connection, timing.iceGatheringTimeoutMs);
  return { connection, channel, encodedAnswer: await encodeSdp(localSdp(connection)) };
}

/** Emitter side: apply the scanned answer, which opens the data channel. */
export async function completeConnection(
  connection: RTCPeerConnection,
  encodedAnswer: string,
): Promise<void> {
  await connection.setRemoteDescription({ type: 'answer', sdp: await decodeSdp(encodedAnswer) });
}

export function waitForIceGatheringComplete(
  connection: RTCPeerConnection,
  timeoutMs = SIGNALING_TIMEOUT_MS,
): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      connection.removeEventListener('icegatheringstatechange', onChange);
      if (error) reject(error);
      else resolve();
    };
    const onChange = () => {
      if (connection.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(
      () => finish(new Error('ICE gathering did not complete in time')),
      timeoutMs,
    );
    connection.addEventListener('icegatheringstatechange', onChange);
  });
}

export function waitForDataChannel(
  connection: RTCPeerConnection,
  timeoutMs = SIGNALING_TIMEOUT_MS,
): Promise<RTCDataChannel> {
  return new Promise<RTCDataChannel>((resolve, reject) => {
    const finish = (error: Error | null, channel?: RTCDataChannel) => {
      clearTimeout(timer);
      connection.removeEventListener('datachannel', onDataChannel);
      if (error) reject(error);
      else resolve(channel as RTCDataChannel);
    };
    const onDataChannel = (event: RTCDataChannelEvent) => finish(null, event.channel);
    const timer = setTimeout(
      () => finish(new Error('The remote peer never opened the data channel')),
      timeoutMs,
    );
    connection.addEventListener('datachannel', onDataChannel);
  });
}

function localSdp(connection: RTCPeerConnection): string {
  const sdp = connection.localDescription?.sdp;
  if (!sdp) throw new Error('Peer connection has no local description');
  return sdp;
}
