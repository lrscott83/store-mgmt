// Zero-import leaf module (design D1) — plain Web Crypto wrappers used to
// derive and verify the offline roster's per-user password verifier.
//
// Design D2: these constants are the ONLY parameters that cannot drift
// silently between frontend and backend. `iterations`/`salt` travel WITH the
// bundle (per-user, in `OfflineVerifier`) and can be rotated server-side
// without a frontend release; the algorithm, derived-key length, and
// pre-hash convention below are frozen and pinned by known-answer test
// vectors (see `__tests__/offline-crypto.test.ts`) — a KAT break must fail a
// test, never lock out a user silently.
export const PBKDF2_HASH = 'SHA-256';
export const PBKDF2_KEY_BYTES = 32;
export const PBKDF2_SALT_BYTES = 16;
export const PBKDF2_ITERATIONS = 210_000; // generation-time default only

export interface OfflineVerifierLike {
  hash: string;
  salt: string;
  iterations: number;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** SHA-256 of the UTF-8 bytes of `text`, Base64-encoded. */
export async function sha256Base64(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64FromBytes(new Uint8Array(digest));
}

/**
 * PBKDF2-HMAC-SHA256 over the UTF-8 bytes of `input`, Base64-encoded. `input`
 * is expected to already be the pre-hash (`Base64(SHA256(password))`), not
 * the raw password — see `verifyOfflinePassword`.
 */
export async function pbkdf2Base64(
  input: string,
  saltBase64: string,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: bytesFromBase64(saltBase64),
      iterations,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    PBKDF2_KEY_BYTES * 8,
  );
  return base64FromBytes(new Uint8Array(derivedBits));
}

/**
 * Verifies `password` against a stored `OfflineVerifier` (hash/salt/
 * iterations pinned per-user, per-bundle). Never throws — a mismatch simply
 * resolves false.
 */
export async function verifyOfflinePassword(
  password: string,
  verifier: OfflineVerifierLike,
): Promise<boolean> {
  const preHash = await sha256Base64(password);
  const derived = await pbkdf2Base64(preHash, verifier.salt, verifier.iterations);
  return derived === verifier.hash;
}
