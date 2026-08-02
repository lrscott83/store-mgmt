// Zero-import leaf module (design §2 module map). Deliberately duplicates
// the 12 private lines already living in `offline/offline-crypto.ts` rather
// than importing from it — design correction 3: `offline-crypto.ts` is a
// KAT-pinned, zero-import leaf for the LIVE offline-auth path and must not
// gain a new consumer on a change whose whole risk is crypto drift.

export function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
