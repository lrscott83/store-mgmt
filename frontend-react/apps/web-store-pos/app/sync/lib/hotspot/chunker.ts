// Binary chunking for the hotspot transfer (plan §3.4).
//
// 16 KiB is safe under the SCTP limit of every Chromium version the v1 matrix
// covers (D1) and keeps each `RTCDataChannel.send` well under any browser cap.

export const CHUNK_SIZE = 16 * 1024;

/** Views over `bytes`, each at most `chunkSize` long. No copying. */
export function splitIntoChunks(bytes: Uint8Array, chunkSize = CHUNK_SIZE): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return chunks;
}
