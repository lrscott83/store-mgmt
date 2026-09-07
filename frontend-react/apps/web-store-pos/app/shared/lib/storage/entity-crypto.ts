// design §7 — the ciphertext envelope on disk:
//   enc:v1:<base64( iv(12) ‖ ciphertext(n) ‖ tag(16) )>
//
// This is the FRONTEND-OWNED envelope (self-contained: iv travels inside
// the blob), deliberately different from the backend's `wrappedDek` wire
// layout (ct‖tag with a separate wrapIv field) — see aes-gcm.ts's header
// and design §1's "layout warning". Both funnel through the same
// `aesGcmEncrypt`/`aesGcmDecrypt` primitives.
//
// Design §1, decision 2: `encryptEntity` checks `getDek()` FIRST, before
// `isEncryptionProvisioned()`. A non-null DEK proves provisioning by
// construction (it can only come from a v2 unwrap). `decryptEntity`
// dispatches on the `enc:v1:` marker before anything else. The
// "roster never imported" path therefore costs one function call and ZERO
// storage reads on encrypt, and one `String.startsWith` on decrypt —
// optional encryption is free, not merely correct.
import { aesGcmEncrypt, aesGcmDecrypt, AES_GCM_IV_BYTES } from './aes-gcm';
import { base64FromBytes, bytesFromBase64 } from './base64';
import { getDek } from './data-key-store';
import { isEncryptionProvisioned } from '../offline/roster-store';
import { hasDeviceDekWrap } from './device-dek-table';

export const ENTITY_ENVELOPE_PREFIX = 'enc:v1:';

export class MissingDataKeyError extends Error {
  readonly name = 'MissingDataKeyError';
  constructor(message = 'Encryption is provisioned but no data key is set in memory') {
    super(message);
    Object.setPrototypeOf(this, MissingDataKeyError.prototype);
  }
}

/**
 * Safe by construction, not by luck (design §7): every stored value is
 * `JSON.stringify(...)` output — it begins with `[`, `{`, or is the
 * literal sentinel `'{}'`/`'[]'`. The byte sequence `enc:` cannot begin a
 * JSON document, so a false positive is impossible.
 */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(ENTITY_ENVELOPE_PREFIX);
}

/**
 * `encryptEntity(plaintext)`, in order (design §1/§7 — the hard constraint
 * from the entity-at-rest-encryption spec; device-wrapped-dek design §4
 * narrows step 2):
 *   1. DEK present in memory -> encrypt: `enc:v1:` + base64(iv‖ct‖tag),
 *      fresh random 12-byte iv. Checked FIRST — the roster is never read
 *      on this path.
 *   1b. EMPTY-PAYLOAD SHORT-CIRCUIT (valid-session fix, 2026-09-06): the
 *      JSON sentinels `'[]'` and `'{}'` (an empty collection — what every
 *      repository's auto-init writes for a fresh store) are stored as
 *      PLAINTEXT even with a DEK. Ciphertext proves "this device once had
 *      a key" and gated the unlock hijack on it; a fresh store whose only
 *      encrypted values are empty ones was indistinguishable from a store
 *      with real encrypted data, so its valid session got hijacked to
 *      /login on every reload (user report 2026-09-06). An empty payload
 *      protects nothing — nothing to protect, no ciphertext needed.
 *      `decryptEntity`'s marker dispatch already returns plaintext
 *      unchanged, so reading stays uniform.
 *   2. else not encryption-provisioned (roster) AND this device holds no
 *      device wrap table -> return plaintext unchanged, NEVER throw. This
 *      is the permanent, first-class "absence of encryption" mode (hard
 *      constraint, engram obs #1549), narrowed by device-wrapped-dek to its
 *      only honest meaning: no DEK, and this device has never held one —
 *      the pre-bootstrap window. A device that has never completed a login
 *      (no roster wrap, no device wrap table) behaves exactly as before
 *      this change.
 *   3. else (provisioned — by roster OR by an established device wrap —
 *      but locked) -> throw MissingDataKeyError. Without this line a device
 *      already holding `enc:v1:` values would silently write plaintext
 *      over them during a failed bootstrap; the unlock gate is what should
 *      prevent reaching this branch in normal use.
 */
const EMPTY_PAYLOAD_SENTINELS = new Set(['[]', '{}']);

export function encryptEntity(plaintext: string): string {
  // Step 1b — EMPTY-PAYLOAD SHORT-CIRCUIT, ahead of everything else: the
  // JSON sentinels '[]' and '{}' (an empty collection — what every
  // repository's auto-init writes for a fresh store) are ALWAYS stored as
  // plaintext, with or without a DEK, locked or unlocked. Ciphertext
  // presence gated the unlock hijack; a fresh store whose only encrypted
  // values would be empty ones was indistinguishable from one holding real
  // encrypted data, so its valid session got hijacked to /login on every
  // reload (user report 2026-09-06). An empty payload protects nothing —
  // no ciphertext needed. decryptEntity's marker dispatch already passes
  // plaintext through unchanged, so reading stays uniform.
  if (EMPTY_PAYLOAD_SENTINELS.has(plaintext)) {
    return plaintext;
  }
  const dek = getDek();
  if (dek !== null) {
    const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
    const ciphertextWithTag = aesGcmEncrypt(dek, iv, new TextEncoder().encode(plaintext));
    const envelope = new Uint8Array(iv.length + ciphertextWithTag.length);
    envelope.set(iv, 0);
    envelope.set(ciphertextWithTag, iv.length);
    return ENTITY_ENVELOPE_PREFIX + base64FromBytes(envelope);
  }
  if (!isEncryptionProvisioned() && !hasDeviceDekWrap()) {
    return plaintext;
  }
  throw new MissingDataKeyError();
}

/**
 * `decryptEntity(stored)`:
 *   - `null` in -> `null` out.
 *   - no `enc:v1:` marker -> return unchanged, PERMANENT passthrough (never
 *     removed or time-boxed), so a partially migrated device (some keys
 *     ciphertext, some plaintext) is always readable with no special case.
 *   - marked + no DEK -> `MissingDataKeyError`.
 *   - marked + DEK -> decrypt; a GCM tag failure (corrupt/tampered
 *     ciphertext with a valid DEK) propagates raw, same as today's
 *     corrupt-JSON degrade path.
 */
export function decryptEntity(stored: string | null): string | null {
  if (stored === null) return null;
  if (!isEncrypted(stored)) return stored;

  const dek = getDek();
  if (dek === null) {
    throw new MissingDataKeyError();
  }

  const envelope = bytesFromBase64(stored.slice(ENTITY_ENVELOPE_PREFIX.length));
  const iv = envelope.slice(0, AES_GCM_IV_BYTES);
  const ciphertextWithTag = envelope.slice(AES_GCM_IV_BYTES);
  const plaintext = aesGcmDecrypt(dek, iv, ciphertextWithTag);
  return new TextDecoder().decode(plaintext);
}
