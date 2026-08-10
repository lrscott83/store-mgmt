// design §6 — the crypto path end to end, diffed against
// `StoreKeyWrapService.cs` / `StoreDataKeyProvider.cs` line by line:
//
//   0. DEK derivation (HKDF-SHA256) — server-side only, never touched here.
//   1. preHash = Base64(SHA256(UTF8(password)))         — `sha256Base64`, reused verbatim from offline-crypto.ts.
//   2. KEK = PBKDF2-HMAC-SHA256(UTF8(preHash), wrapSalt, DEK_WRAP_ITERATIONS, 32B) — `pbkdf2Base64`, reused verbatim.
//   3. dek = AES-256-GCM decrypt(KEK, wrapIv, wrappedDek)  — wrappedDek = ct‖tag (48B = 32 ct + 16 tag).
//   4. assert dek.length === 32, else DekUnwrapError.
//
// Step 2's input is the Base64 STRING from step 1 (UTF-8 bytes of that
// text), NOT the raw password and NOT the raw digest bytes — this matches
// `Encoding.UTF8.GetBytes(preHash)` on the backend exactly, where `preHash`
// is the decrypted `User.OfflinePasswordPreHash` (NOT `User.Password`, the
// Argon2id PHC string — see offline-password-verifier design D1).
//
// device-wrapped-dek design D3 (Q2, engram #2117): `wrapDekWithPassword`
// below is the MINT direction of the same steps 1-3 run backwards
// (encrypt instead of decrypt, fresh random salt/iv instead of stored
// ones), living in this same file and sharing `DEK_WRAP_ITERATIONS` so the
// two directions cannot drift apart — see the constant's own comment.
import { sha256Base64, pbkdf2Base64, PBKDF2_SALT_BYTES } from './offline-crypto';
import { aesGcmDecrypt, aesGcmEncrypt, AES_GCM_IV_BYTES } from '../storage/aes-gcm';
import { bytesFromBase64, base64FromBytes } from '../storage/base64';

// StoreKeyWrapService.cs:15-41 — NOT carried on the wire, unlike
// `verifier.iterations` (which travels per-user in the roster bundle and
// can be rotated server-side). The wrap's iteration count is hardcoded on
// both sides with zero protocol protection — the single highest-drift-risk
// constant in this change. The KAT (`dek-unwrap.kat.test.ts`) is its only
// defense: any drift here breaks that test.
export const DEK_WRAP_ITERATIONS = 210_000;

export class DekUnwrapError extends Error {
  readonly name = 'DekUnwrapError';
  constructor(message = 'Failed to unwrap the data encryption key') {
    super(message);
    Object.setPrototypeOf(this, DekUnwrapError.prototype);
  }
}

export interface WrappedDekEntry {
  wrappedDek: string;
  wrapSalt: string;
  wrapIv: string;
}

/**
 * Unwraps a user's DEK from their roster wrap entry using their password.
 * Any failure along the way (wrong password, roster wrapped under an older
 * password, parameter drift, tampered bundle, wrong DEK length) surfaces as
 * `DekUnwrapError` — never a raw AES-GCM tag-mismatch error or a silently
 * wrong-length key.
 */
export async function unwrapDek(password: string, entry: WrappedDekEntry): Promise<Uint8Array> {
  try {
    const preHash = await sha256Base64(password);
    const kekBase64 = await pbkdf2Base64(preHash, entry.wrapSalt, DEK_WRAP_ITERATIONS);
    const kek = bytesFromBase64(kekBase64);
    const iv = bytesFromBase64(entry.wrapIv);
    const wrapped = bytesFromBase64(entry.wrappedDek);
    const dek = aesGcmDecrypt(kek, iv, wrapped);
    if (dek.length !== 32) {
      throw new DekUnwrapError();
    }
    return dek;
  } catch (err) {
    if (err instanceof DekUnwrapError) throw err;
    throw new DekUnwrapError();
  }
}

/**
 * D3 / Q2 (engram #2117) — the client-minted MINT direction, deliberately
 * living in this same module and sharing `DEK_WRAP_ITERATIONS` with
 * `unwrapDek` above, so the two directions cannot drift apart. Produces a
 * `WrappedDekEntry` in the EXACT shape the backend emits
 * (`StoreKeyWrapService.cs`), so `unwrapDek()` stays the single unwrap path
 * for backend-issued and client-issued wraps alike.
 *
 * `fixedSaltIv` is exposed ONLY for the KAT pin (`dek-unwrap.kat.test.ts`)
 * — production callers never pass it, always minting fresh random values.
 */
export async function wrapDekWithPassword(
  password: string,
  dek: Uint8Array,
  fixedSaltIv?: { wrapSalt: string; wrapIv: string },
): Promise<WrappedDekEntry> {
  const wrapSalt =
    fixedSaltIv?.wrapSalt ?? base64FromBytes(crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES)));
  const wrapIv =
    fixedSaltIv?.wrapIv ?? base64FromBytes(crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES)));

  const preHash = await sha256Base64(password);
  const kekBase64 = await pbkdf2Base64(preHash, wrapSalt, DEK_WRAP_ITERATIONS);
  const kek = bytesFromBase64(kekBase64);
  const iv = bytesFromBase64(wrapIv);
  const wrappedDek = base64FromBytes(aesGcmEncrypt(kek, iv, dek));

  return { wrappedDek, wrapSalt, wrapIv };
}
