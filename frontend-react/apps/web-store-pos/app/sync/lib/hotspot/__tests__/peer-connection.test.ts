import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createOffer,
  acceptOffer,
  completeConnection,
  createPeerConnection,
  waitForIceGatheringComplete,
  waitForDataChannel,
  waitForChannelOpen,
  DATA_CHANNEL_LABEL,
} from '../peer-connection';

interface LocalDescription {
  readonly type: string;
  readonly sdp: string;
}

class MockDataChannel extends EventTarget {
  readyState: RTCDataChannelState = 'connecting';

  constructor(
    readonly label: string,
    readonly options: RTCDataChannelInit | undefined,
  ) {
    super();
  }

  open(): void {
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }
}

// Minimal fake RTCPeerConnection: records calls and lets the test drive the
// ICE-gathering state machine, which is the only async contract this module
// owns. The real loopback lives in the Playwright E2E (T10).
class MockPeerConnection extends EventTarget {
  static instances: MockPeerConnection[] = [];

  iceGatheringState: RTCIceGatheringState = 'new';
  localDescription: LocalDescription | null = null;
  readonly config: RTCConfiguration;
  readonly dataChannels: MockDataChannel[] = [];
  readonly remoteDescriptions: LocalDescription[] = [];
  closed = false;

  constructor(config?: RTCConfiguration) {
    super();
    this.config = config ?? {};
    MockPeerConnection.instances.push(this);
  }

  getConfiguration(): RTCConfiguration {
    return this.config;
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    const channel = new MockDataChannel(label, options);
    this.dataChannels.push(channel);
    return channel as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\n' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = { type: desc.type ?? '', sdp: desc.sdp ?? '' };
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescriptions.push({ type: desc.type ?? '', sdp: desc.sdp ?? '' });
  }

  close(): void {
    this.closed = true;
  }

  completeIceGathering(): void {
    this.iceGatheringState = 'complete';
    this.dispatchEvent(new Event('icegatheringstatechange'));
  }
}

describe('peer-connection', () => {
  beforeEach(() => {
    MockPeerConnection.instances = [];
    vi.stubGlobal('RTCPeerConnection', MockPeerConnection);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a connection with no ICE server (LAN only, no STUN)', () => {
    const connection = createPeerConnection();
    expect(connection.getConfiguration().iceServers).toEqual([]);
  });

  it('createOffer opens one ordered data channel and exposes the raw SDP', async () => {
    const offerPromise = createOffer();
    await vi.waitFor(() => {
      expect(MockPeerConnection.instances[0]?.localDescription).not.toBeNull();
    });
    const connection = MockPeerConnection.instances[0];

    expect(connection.dataChannels).toHaveLength(1);
    expect(connection.dataChannels[0].label).toBe(DATA_CHANNEL_LABEL);
    expect(connection.dataChannels[0].options).toEqual({ ordered: true });

    connection.completeIceGathering();
    const started = await offerPromise;
    expect(started.sdp).toBe('v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n');
  });

  it('does not resolve the offer until ICE gathering is complete', async () => {
    const offerPromise = createOffer();
    await vi.waitFor(() => {
      expect(MockPeerConnection.instances[0]?.localDescription).not.toBeNull();
    });
    const connection = MockPeerConnection.instances[0];

    let settled = false;
    void offerPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    connection.completeIceGathering();
    await offerPromise;
    expect(settled).toBe(true);
  });

  it('acceptOffer applies the offer SDP and exposes the raw answer SDP', async () => {
    const offerSdp = 'v=0\r\no=- 9 8 IN IP4 127.0.0.1\r\n';
    const acceptPromise = acceptOffer(offerSdp, {
      iceGatheringTimeoutMs: 2000,
      dataChannelTimeoutMs: 200,
    });
    await vi.waitFor(() => {
      expect(MockPeerConnection.instances[0]?.localDescription).not.toBeNull();
    });
    const connection = MockPeerConnection.instances[0];

    expect(connection.remoteDescriptions).toEqual([{ type: 'offer', sdp: offerSdp }]);

    connection.completeIceGathering();
    const accepted = await acceptPromise;
    expect(accepted.sdp).toBe('v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\n');

    // No peer opens the data channel in this unit test: the awaiting promise
    // must fail fast instead of leaving a dangling timer.
    await expect(accepted.channel).rejects.toThrow(/data channel/i);
  });

  it('completeConnection applies the answer as the remote description', async () => {
    const connection = createPeerConnection();
    const answerSdp = 'v=0\r\no=- 5 6 IN IP4 127.0.0.1\r\n';
    await completeConnection(connection, answerSdp);
    expect(MockPeerConnection.instances[0].remoteDescriptions).toEqual([
      { type: 'answer', sdp: answerSdp },
    ]);
  });

  it('waitForIceGatheringComplete resolves immediately when already complete', async () => {
    const connection = createPeerConnection();
    MockPeerConnection.instances[0].iceGatheringState = 'complete';
    await expect(waitForIceGatheringComplete(connection)).resolves.toBeUndefined();
  });

  it('waitForIceGatheringComplete rejects when gathering never completes', async () => {
    const connection = createPeerConnection();
    await expect(waitForIceGatheringComplete(connection, 10)).rejects.toThrow(/ICE gathering/i);
  });

  it('waitForDataChannel resolves with the channel the peer opens', async () => {
    const connection = createPeerConnection();
    const channelPromise = waitForDataChannel(connection);
    const channel = { label: DATA_CHANNEL_LABEL } as unknown as RTCDataChannel;
    connection.dispatchEvent(
      Object.assign(new Event('datachannel'), { channel }) as unknown as RTCDataChannelEvent,
    );
    await expect(channelPromise).resolves.toBe(channel);
  });

  it('waitForChannelOpen resolves once the channel is open', async () => {
    const channel = new MockDataChannel(DATA_CHANNEL_LABEL, undefined);
    const opened = waitForChannelOpen(channel as unknown as RTCDataChannel);
    channel.open();
    await expect(opened).resolves.toBeUndefined();
  });

  it('waitForChannelOpen rejects when the channel never opens', async () => {
    const channel = new MockDataChannel(DATA_CHANNEL_LABEL, undefined);
    await expect(waitForChannelOpen(channel as unknown as RTCDataChannel, 10)).rejects.toThrow(
      /open/i,
    );
  });
});
