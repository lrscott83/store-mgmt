// Signaling codec for the hotspot device-to-device transfer (plan
// docs/deploy/2026-09-09-device-to-device-file-transfer-plan.md, option A).
//
// The SDP offer/answer must fit inside a QR code with no signaling server, so
// it is deflate-compressed and base45-encoded (RFC 9285). base45's alphabet is
// EXACTLY QR alphanumeric mode (0-9 A-Z space $ % * + - . / :), which keeps the
// payload in the densest QR encoding — that is why base45 wins over base58.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
// Space is a VALID base45 symbol (index 36) — only line noise may be stripped.
const LINE_NOISE = /[\t\r\n]+/g;

/** RFC 9285 base45 encoder. */
export function toBase45(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 1 < bytes.length; i += 2) {
    const n = bytes[i] * 256 + bytes[i + 1];
    out += ALPHABET[n % 45];
    out += ALPHABET[Math.floor(n / 45) % 45];
    out += ALPHABET[Math.floor(n / 2025)];
  }
  if (i < bytes.length) {
    const n = bytes[i];
    out += ALPHABET[n % 45];
    out += ALPHABET[Math.floor(n / 45)];
  }
  return out;
}

/**
 * RFC 9285 base45 decoder. Line noise (tab/CR/LF) is stripped first so a code
 * a user copied/pasted still decodes. Space is NOT stripped: it is a valid
 * base45 symbol, so removing it would corrupt the payload.
 */
export function fromBase45(encoded: string): Uint8Array {
  const source = encoded.replace(LINE_NOISE, '');
  const bytes: number[] = [];
  let i = 0;
  for (; i + 2 < source.length; i += 3) {
    const n =
      indexOf(source[i]) + indexOf(source[i + 1]) * 45 + indexOf(source[i + 2]) * 2025;
    if (n > 0xffff) throw new Error('Invalid base45 payload');
    bytes.push(Math.floor(n / 256), n % 256);
  }
  const remainder = source.length - i;
  if (remainder === 2) {
    const n = indexOf(source[i]) + indexOf(source[i + 1]) * 45;
    if (n > 0xff) throw new Error('Invalid base45 payload');
    bytes.push(n);
  } else if (remainder !== 0) {
    throw new Error('Invalid base45 payload');
  }
  return Uint8Array.from(bytes);
}

function indexOf(char: string): number {
  const value = ALPHABET.indexOf(char);
  if (value < 0) throw new Error('Invalid base45 character');
  return value;
}

/** Compress + base45-encode an SDP so it can travel inside a QR code. */
export async function encodeSdp(sdp: string): Promise<string> {
  return toBase45(await deflate(new TextEncoder().encode(sdp)));
}

/** Inverse of {@link encodeSdp}. Tolerates whitespace from copy/paste. */
export async function decodeSdp(encoded: string): Promise<string> {
  return new TextDecoder().decode(await inflate(fromBase45(encoded)));
}

type ByteTransform = TransformStream<Uint8Array, Uint8Array>;

async function pipeThrough(bytes: Uint8Array, stream: ByteTransform): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Start writing concurrently with the read: awaiting the write first could
  // deadlock once backpressure kicks in, because nothing drains the readable.
  const written = (async () => {
    await writer.write(bytes);
    await writer.close();
  })();
  const result = await collect(stream.readable);
  await written;
  return result;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new CompressionStream('deflate'));
}

function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new DecompressionStream('deflate'));
}
