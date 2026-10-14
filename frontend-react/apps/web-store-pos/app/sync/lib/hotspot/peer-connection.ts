// WebRTC engine for the hotspot device-to-device transfer
// (plan docs/deploy/2026-09-09-device-to-device-file-transfer-plan.md §3.1–3.2).
//
// Non-trickle signaling: the offer/answer is only exposed once ICE gathering
// has finished, so the complete SDP (host/mDNS candidates only) is ready to be
// packed into one QR code by `handshake.ts`. No STUN/TURN is configured — both
// devices are on the hotspot LAN, so there is nothing to discover beyond local
// candidates.
//
// This module deals in RAW SDP strings; encoding for the QR is `handshake.ts`'s
// job, so the payload is compressed exactly once.
export const DATA_CHANNEL_LABEL = 'hotspot-transfer';
export const SIGNALING_TIMEOUT_MS = 10_000;

const RTC_CONFIG: RTCConfiguration = { iceServers: [] };

/**
 * Raised when the handshake times out — gathering ICE, receiving the data
 * channel, or the channel opening. In practice this is the signature of the
 * hotspot's AP/client isolation blocking device-to-device traffic (plan §4), so
 * the UI maps it to that specific guidance rather than a generic failure.
 */
export class SignalingTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignalingTimeoutError';
  }
}

export interface PeerTiming {
  readonly iceGatheringTimeoutMs?: number;
  readonly dataChannelTimeoutMs?: number;
}

export interface StartedOffer {
  readonly connection: RTCPeerConnection;
  readonly channel: RTCDataChannel;
  readonly sdp: string;
}

export interface AcceptedOffer {
  readonly connection: RTCPeerConnection;
  readonly channel: Promise<RTCDataChannel>;
  readonly sdp: string;
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(RTC_CONFIG);
}

/** Emitter side: open the channel, build the offer, and expose its raw SDP. */
export async function createOffer(timing: PeerTiming = {}): Promise<StartedOffer> {
  const connection = createPeerConnection();
  const channel = connection.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  await waitForIceGatheringComplete(connection, timing.iceGatheringTimeoutMs);
  return { connection, channel, sdp: localSdp(connection) };
}

/** Receiver side: apply the offer SDP and expose the raw answer SDP. */
export async function acceptOffer(
  offerSdp: string,
  timing: PeerTiming = {},
): Promise<AcceptedOffer> {
  const connection = createPeerConnection();
  // Register the listener BEFORE applying the offer so the event is never missed.
  const channel = waitForDataChannel(connection, timing.dataChannelTimeoutMs);
  await connection.setRemoteDescription({ type: 'offer', sdp: offerSdp });
  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  await waitForIceGatheringComplete(connection, timing.iceGatheringTimeoutMs);
  return { connection, channel, sdp: localSdp(connection) };
}

/** Emitter side: apply the answer SDP, which opens the data channel. */
export async function completeConnection(
  connection: RTCPeerConnection,
  answerSdp: string,
): Promise<void> {
  await connection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
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
      () => finish(new SignalingTimeoutError('ICE gathering did not complete in time')),
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
      () => finish(new SignalingTimeoutError('The remote peer never opened the data channel')),
      timeoutMs,
    );
    connection.addEventListener('datachannel', onDataChannel);
  });
}

/** Resolves once the data channel is open (or rejects on timeout/close). */
export function waitForChannelOpen(
  channel: RTCDataChannel,
  timeoutMs = SIGNALING_TIMEOUT_MS,
): Promise<void> {
  if (channel.readyState === 'open') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      channel.removeEventListener('open', onOpen);
      if (error) reject(error);
      else resolve();
    };
    const onOpen = () => finish();
    const timer = setTimeout(
      () => finish(new SignalingTimeoutError('The data channel never opened')),
      timeoutMs,
    );
    channel.addEventListener('open', onOpen);
  });
}

function localSdp(connection: RTCPeerConnection): string {
  const sdp = connection.localDescription?.sdp;
  if (!sdp) throw new Error('Peer connection has no local description');
  return sdp;
}
