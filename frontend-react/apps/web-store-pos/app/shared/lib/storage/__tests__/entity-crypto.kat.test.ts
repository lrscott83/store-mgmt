import { describe, it, expect, beforeEach } from 'vitest';
import { decryptEntity } from '../entity-crypto';
import { setDek, clearDek } from '../data-key-store';
import { bytesFromBase64 } from '../base64';
import kat from './__fixtures__/entity-crypto-kat.json';

// Second KAT (design §6/§12): a frozen `enc:v1:` sample + fixed DEK +
// expected plaintext. Confirms the envelope layout (enc:v1: +
// base64(iv‖ciphertext‖tag)) stays stable across releases — a value
// written by today's code must remain readable by every future version.
// No interop partner needed (frontend-only), so this pins REGRESSION, not
// discovery: it should already pass given a correct encryptEntity/
// decryptEntity implementation.
describe('entity-crypto — frozen enc:v1: envelope KAT', () => {
  beforeEach(() => clearDek());

  it('decrypts the frozen sample to the exact original plaintext', () => {
    setDek(bytesFromBase64(kat.dekBase64), 's1');
    expect(decryptEntity(kat.stored)).toBe(kat.plaintext);
  });
});
