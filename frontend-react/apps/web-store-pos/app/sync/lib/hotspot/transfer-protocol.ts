// Transfer protocol for the hotspot device-to-device transfer (plan §3.4).
//
// Wire format on the data channel:
//   1. one text frame  — JSON metadata `{ name, size, sha256, kind }`
//   2. N binary frames — the payload in CHUNK_SIZE pieces
//
// The receiver knows the transfer is complete when it has `size` bytes, so no
// end-of-transmission frame is needed. v1 has no resumption: a failed transfer
// simply restarts (exports are a few MB).
//
// Note: `crypto.subtle` has no streaming digest, so the SHA-256 is computed
// over the whole payload (sender) or the reassembled buffer (receiver) rather
// than incrementally. Acceptable for a few MB; a true streaming digest would
// need a third-party incremental SHA-256.
import { splitIntoChunks } from './chunker';

export const DEFAULT_BUFFER_LOW_THRESHOLD = 64 * 1024;
export const DEFAULT_HIGH_WATER_MARK = 512 * 1024;
export const DEFAULT_TRANSFER_TIMEOUT_MS = 120_000;
/**
 * Guards the receiver's memory: it accumulates every chunk before verifying the
 * digest (crypto.subtle has no streaming digest), so an unbounded transfer is a
 * real OOM risk. Exports are a few MB; 64 MB is far above anything legitimate.
 */
export const MAX_TRANSFER_BYTES = 64 * 1024 * 1024;

/** Thrown when a payload exceeds {@link MAX_TRANSFER_BYTES}. */
export class TransferTooLargeError extends Error {
  constructor() {
    super('Transfer exceeds the maximum allowed size');
    this.name = 'TransferTooLargeError';
  }
}

/** Throws {@link TransferTooLargeError} when `size` exceeds the cap. */
export function assertTransferSize(size: number): void {
  if (size > MAX_TRANSFER_BYTES) throw new TransferTooLargeError();
}

export interface TransferMetadata {
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
  readonly kind: string;
}

export interface TransferProgress {
  readonly transferred: number;
  readonly total: number;
}

export interface TransferSource {
  readonly name: string;
  readonly kind: string;
  readonly bytes: Uint8Array;
}

export interface SendTransferOptions {
  readonly onProgress?: (progress: TransferProgress) => void;
  readonly bufferLowThreshold?: number;
  readonly highWaterMark?: number;
}

export interface ReceiveTransferOptions {
  readonly onProgress?: (progress: TransferProgress) => void;
  readonly timeoutMs?: number;
}

export interface ReceivedTransfer {
  readonly metadata: TransferMetadata;
  readonly bytes: Uint8Array;
  readonly verified: boolean;
}

/** Sends the metadata frame and then every chunk, honouring backpressure. */
export async function sendTransfer(
  channel: RTCDataChannel,
  source: TransferSource,
  options: SendTransferOptions = {},
): Promise<void> {
  const total = source.bytes.length;
  assertTransferSize(total);
  const metadata: TransferMetadata = {
    name: source.name,
    size: total,
    kind: source.kind,
    sha256: await sha256Base64(source.bytes),
  };

  channel.bufferedAmountLowThreshold =
    options.bufferLowThreshold ?? DEFAULT_BUFFER_LOW_THRESHOLD;
  const highWaterMark = options.highWaterMark ?? DEFAULT_HIGH_WATER_MARK;

  channel.send(JSON.stringify(metadata));
  options.onProgress?.({ transferred: 0, total });

  let transferred = 0;
  for (const chunk of splitIntoChunks(source.bytes)) {
    await waitForBufferDrain(channel, highWaterMark);
    channel.send(chunk);
    transferred += chunk.length;
    options.onProgress?.({ transferred, total });
  }
}

/** Reassembles a transfer and reports whether the digest matched. */
export function receiveTransfer(
  channel: RTCDataChannel,
  options: ReceiveTransferOptions = {},
): Promise<ReceivedTransfer> {
  channel.binaryType = 'arraybuffer';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS;

  return new Promise<ReceivedTransfer>((resolve, reject) => {
    let metadata: TransferMetadata | null = null;
    const chunks: Uint8Array[] = [];
    let transferred = 0;
    let settled = false;

    const detach = () => {
      clearTimeout(timer);
      channel.removeEventListener('message', onMessage);
      channel.removeEventListener('error', onError);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      detach();
      reject(error);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      detach();
      void (async () => {
        const bytes = concatChunks(chunks);
        const sha256 = await sha256Base64(bytes);
        const received = metadata as TransferMetadata;
        resolve({ metadata: received, bytes, verified: sha256 === received.sha256 });
      })().catch(fail);
    };

    const onError = () => fail(new Error('The data channel failed during transfer'));

    async function handleMessage(event: MessageEvent): Promise<void> {
      const data = event.data as string | ArrayBuffer;
      if (typeof data === 'string') {
        metadata = parseMetadata(data);
        assertTransferSize(metadata.size);
        options.onProgress?.({ transferred: 0, total: metadata.size });
        if (metadata.size === 0) succeed();
        return;
      }
      const chunk = new Uint8Array(data);
      chunks.push(chunk);
      transferred += chunk.length;
      options.onProgress?.({ transferred, total: metadata?.size ?? transferred });
      if (metadata && transferred >= metadata.size) succeed();
    }

    const onMessage = (event: MessageEvent) => {
      void handleMessage(event).catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error(String(error)));
      });
    };

    const timer = setTimeout(() => fail(new Error('Transfer timed out')), timeoutMs);

    channel.addEventListener('message', onMessage);
    channel.addEventListener('error', onError);
  });
}

function waitForBufferDrain(channel: RTCDataChannel, highWaterMark: number): Promise<void> {
  if (channel.bufferedAmount <= highWaterMark) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onLow = () => {
      channel.removeEventListener('bufferedamountlow', onLow);
      resolve();
    };
    channel.addEventListener('bufferedamountlow', onLow);
  });
}

function parseMetadata(raw: string): TransferMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid transfer metadata');
  }
  if (!isTransferMetadata(parsed)) throw new Error('Invalid transfer metadata');
  return parsed;
}

function isTransferMetadata(value: unknown): value is TransferMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.sha256 === 'string' &&
    typeof candidate.kind === 'string'
  );
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}
