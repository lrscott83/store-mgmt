// Zero-import (besides @noble/ciphers) leaf module (design §2 module map).
//
// THIS IS THE ONLY MODULE IN THE APP THAT IMPORTS @noble/ciphers. Both the
// DEK unwrap (`offline/dek-unwrap.ts`) and the entity envelope
// (`storage/entity-crypto.ts`) funnel through the two functions below, so
// the 16-byte tag length and the `ciphertext‖tag` byte layout physically
// cannot diverge between the two callers (design §1, ratified decision 3).
//
// `gcm()` from `@noble/ciphers/aes.js` is a *synchronous*, single-use
// cipher factory: each call below constructs a fresh instance for one
// encrypt/decrypt operation. Its `decrypt` throws on tag mismatch (GHASH
// tag verification failure) — that throw is exactly what the AES-GCM
// known-answer test below pins.
import { gcm } from '@noble/ciphers/aes.js';

export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BYTES = 16;

/**
 * AES-256-GCM encrypt. Returns `ciphertext‖tag` (tag last, `AES_GCM_TAG_BYTES`
 * long) — the layout both callers agree on.
 */
export function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return gcm(key, iv).encrypt(plaintext);
}

/**
 * AES-256-GCM decrypt. `ciphertextWithTag` MUST be `ciphertext‖tag`. Throws
 * on tag mismatch (tampered/corrupt ciphertext or wrong key) — callers rely
 * on this throwing, never returning garbage plaintext.
 */
export function aesGcmDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertextWithTag: Uint8Array,
): Uint8Array {
  return gcm(key, iv).decrypt(ciphertextWithTag);
}
