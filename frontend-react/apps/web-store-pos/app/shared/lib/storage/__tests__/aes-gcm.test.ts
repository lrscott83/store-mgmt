import { describe, it, expect } from 'vitest';
import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
} from '../aes-gcm';

// Fixed key/iv/plaintext triple, cross-checked against Node's built-in
// `crypto.createCipheriv('aes-256-gcm', ...)` to confirm this is the ONE
// AES-GCM implementation both DEK-unwrap and entity-crypto funnel through
// (design §1) — tag length and `ct‖tag` layout are pinned here, once, for
// both callers.
const KEY = new Uint8Array(32).fill(0x01);
const IV = new Uint8Array(12).fill(0x02);
const PLAINTEXT = new TextEncoder().encode('known plaintext value 123');
const CT_WITH_TAG_HEX =
  '6cb8a63e2477b191b2a5d2bc39dfb692d4d4bd9a8e91bc43ee144738c7a28a9fd2c3f372099a30c82d';

function bytesFromHex(hex: string): Uint8Array {
  const matches = hex.match(/../g) ?? [];
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

describe('aes-gcm — pinned constants', () => {
  it('pins the 12-byte IV and 16-byte tag lengths', () => {
    expect(AES_GCM_IV_BYTES).toBe(12);
    expect(AES_GCM_TAG_BYTES).toBe(16);
  });
});

describe('aesGcmDecrypt — known-answer vector', () => {
  it('decrypts a fixed key/iv/ct‖tag triple to the expected plaintext bytes', () => {
    const ctWithTag = bytesFromHex(CT_WITH_TAG_HEX);
    const result = aesGcmDecrypt(KEY, IV, ctWithTag);
    expect(new TextDecoder().decode(result)).toBe('known plaintext value 123');
  });

  it('throws when one byte of the tag is flipped', () => {
    const ctWithTag = bytesFromHex(CT_WITH_TAG_HEX);
    const tampered = ctWithTag.slice();
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => aesGcmDecrypt(KEY, IV, tampered)).toThrow();
  });
});

describe('aesGcmEncrypt — matches the same known-answer vector', () => {
  it('produces the exact ct‖tag bytes for the fixed key/iv/plaintext', () => {
    const result = aesGcmEncrypt(KEY, IV, PLAINTEXT);
    expect(Array.from(result)).toEqual(Array.from(bytesFromHex(CT_WITH_TAG_HEX)));
  });

  it('round-trips through aesGcmDecrypt', () => {
    const ctWithTag = aesGcmEncrypt(KEY, IV, PLAINTEXT);
    const decrypted = aesGcmDecrypt(KEY, IV, ctWithTag);
    expect(Array.from(decrypted)).toEqual(Array.from(PLAINTEXT));
  });
});
