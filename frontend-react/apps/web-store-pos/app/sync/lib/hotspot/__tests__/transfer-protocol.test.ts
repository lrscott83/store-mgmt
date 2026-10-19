import { describe, it, expect, vi } from 'vitest';
import {
  sendTransfer,
  receiveTransfer,
  assertTransferSize,
  MAX_TRANSFER_BYTES,
  TransferTooLargeError,
  type TransferMetadata,
} from '../transfer-protocol';
import { CHUNK_SIZE, splitIntoChunks } from '../chunker';

// Fake RTCDataChannel: records what is sent and lets the test drive inbound
// messages and backpressure. The real channel behaviour is exercised by the
// Playwright E2E (T10).
class MockDataChannel extends EventTarget {
  binaryType: RTCDataChannel['binaryType'] = 'blob';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  readonly sent: Array<string | ArrayBufferLike> = [];

  send(data: string | ArrayBufferLike | ArrayBufferView): void {
    if (typeof data === 'string') {
      this.sent.push(data);
      return;
    }
    if (data instanceof ArrayBuffer) {
      this.sent.push(data.slice(0));
      return;
    }
    const view = data as ArrayBufferView;
    this.sent.push(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }

  emitMessage(data: string | ArrayBufferLike): void {
    this.dispatchEvent(Object.assign(new Event('message'), { data }));
  }

  emitLow(): void {
    this.dispatchEvent(new Event('bufferedamountlow'));
  }
}

const asChannel = (channel: MockDataChannel) => channel as unknown as RTCDataChannel;

async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function makeBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 31 + 7) % 256;
  return bytes;
}

describe('splitIntoChunks', () => {
  it('uses 16 KiB chunks and a short final chunk', () => {
    expect(CHUNK_SIZE).toBe(16 * 1024);
    const chunks = splitIntoChunks(makeBytes(40_000));
    expect(chunks.map((chunk) => chunk.length)).toEqual([CHUNK_SIZE, CHUNK_SIZE, 40_000 - 2 * CHUNK_SIZE]);
  });

  it('returns no chunks for an empty payload', () => {
    expect(splitIntoChunks(new Uint8Array(0))).toEqual([]);
  });
});

describe('sendTransfer', () => {
  it('sends the metadata frame first, then every chunk', async () => {
    const channel = new MockDataChannel();
    const bytes = makeBytes(40_000);

    await sendTransfer(asChannel(channel), { name: 'roster.smcabundle', kind: 'roster', bytes });

    expect(typeof channel.sent[0]).toBe('string');
    const metadata = JSON.parse(channel.sent[0] as string) as TransferMetadata;
    expect(metadata).toEqual({
      name: 'roster.smcabundle',
      size: 40_000,
      kind: 'roster',
      sha256: await sha256Base64(bytes),
    });
    expect(channel.sent).toHaveLength(4); // metadata + 3 chunks
  });

  it('reports progress up to the full size', async () => {
    const channel = new MockDataChannel();
    const progress: number[] = [];

    await sendTransfer(
      asChannel(channel),
      { name: 'x', kind: 'roster', bytes: makeBytes(40_000) },
      { onProgress: (p) => progress.push(p.transferred) },
    );

    expect(progress.at(-1)).toBe(40_000);
  });

  it('waits for the buffer to drain before sending the next chunk', async () => {
    const channel = new MockDataChannel();
    channel.bufferedAmount = 1_000_000;

    const transferring = sendTransfer(
      asChannel(channel),
      { name: 'x', kind: 'roster', bytes: makeBytes(40_000) },
      { highWaterMark: 100, bufferLowThreshold: 50 },
    );

    await vi.waitFor(() => expect(channel.sent).toHaveLength(1)); // metadata only
    expect(channel.bufferedAmountLowThreshold).toBe(50);

    channel.bufferedAmount = 0;
    channel.emitLow();
    await transferring;

    expect(channel.sent).toHaveLength(4);
  });
});

describe('receiveTransfer', () => {
  it('reassembles the payload and verifies the digest', async () => {
    const bytes = makeBytes(40_000);
    const metadata: TransferMetadata = {
      name: 'roster.smcabundle',
      size: bytes.length,
      kind: 'roster',
      sha256: await sha256Base64(bytes),
    };
    const channel = new MockDataChannel();
    const receiving = receiveTransfer(asChannel(channel), { timeoutMs: 1000 });

    channel.emitMessage(JSON.stringify(metadata));
    for (const chunk of splitIntoChunks(bytes)) {
      channel.emitMessage(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
    }

    const result = await receiving;
    expect(result.metadata).toEqual(metadata);
    expect(Array.from(result.bytes)).toEqual(Array.from(bytes));
    expect(result.verified).toBe(true);
  });

  it('flags a corrupted stream as unverified', async () => {
    const bytes = makeBytes(1000);
    const channel = new MockDataChannel();
    const receiving = receiveTransfer(asChannel(channel), { timeoutMs: 1000 });

    channel.emitMessage(
      JSON.stringify({
        name: 'x',
        size: bytes.length,
        kind: 'roster',
        sha256: await sha256Base64(makeBytes(999)),
      } satisfies TransferMetadata),
    );
    channel.emitMessage(bytes.buffer);

    await expect(receiving).resolves.toMatchObject({ verified: false });
  });

  it('rejects when the transfer never completes', async () => {
    const channel = new MockDataChannel();
    await expect(receiveTransfer(asChannel(channel), { timeoutMs: 10 })).rejects.toThrow(
      /timed out/i,
    );
  });

  it('rejects on malformed metadata', async () => {
    const channel = new MockDataChannel();
    const receiving = receiveTransfer(asChannel(channel), { timeoutMs: 1000 });
    channel.emitMessage('not json');
    await expect(receiving).rejects.toThrow(/metadata/i);
  });
});

describe('size limit', () => {
  it('accepts a payload at the cap and rejects one above it', () => {
    expect(() => assertTransferSize(MAX_TRANSFER_BYTES)).not.toThrow();
    expect(() => assertTransferSize(MAX_TRANSFER_BYTES + 1)).toThrow(TransferTooLargeError);
  });

  it('rejects an inbound metadata frame that exceeds the cap', async () => {
    const channel = new MockDataChannel();
    const receiving = receiveTransfer(asChannel(channel), { timeoutMs: 1000 });
    channel.emitMessage(
      JSON.stringify({ name: 'x', size: MAX_TRANSFER_BYTES + 1, sha256: 'x', kind: 'roster' }),
    );
    await expect(receiving).rejects.toThrow(TransferTooLargeError);
  });
});
