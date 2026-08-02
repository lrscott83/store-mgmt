import { describe, it, expect } from 'vitest';
import { unwrapDek, DekUnwrapError, DEK_WRAP_ITERATIONS } from '../dek-unwrap';
import { pbkdf2Base64, sha256Base64 } from '../offline-crypto';
import { aesGcmDecrypt } from '../../storage/aes-gcm';
import { bytesFromBase64 } from '../../storage/base64';
import kat from './__fixtures__/dek-kat.json';

// design §6 — the crypto path end to end, diffed against
// StoreKeyWrapService.cs / StoreDataKeyProvider.cs line by line. The
// fixture's "_header.provenance" is "node-transcription" (PLACEHOLDER, not
// backend-proven) — see apply-progress.md for the WU3.3 deferral.
describe('dek-unwrap — known-answer vector (fallback, node-transcription)', () => {
  it('unwrapDek(knownPassword, fixtureEntry) equals the fixture expected 32-byte DEK', async () => {
    const dek = await unwrapDek(kat.password, {
      wrappedDek: kat.wrappedDek,
      wrapSalt: kat.wrapSalt,
      wrapIv: kat.wrapIv,
    });

    const expected = Uint8Array.from(atob(kat.expectedDekBase64), (c) => c.charCodeAt(0));
    expect(Array.from(dek)).toEqual(Array.from(expected));
    expect(dek.length).toBe(32);
  });

  it('rejects with DekUnwrapError for a wrong password', async () => {
    await expect(
      unwrapDek('wrong password', {
        wrappedDek: kat.wrappedDek,
        wrapSalt: kat.wrapSalt,
        wrapIv: kat.wrapIv,
      }),
    ).rejects.toThrow(DekUnwrapError);
  });

  it('pins DEK_WRAP_ITERATIONS at 210_000 — the KAT fails if it drifts', async () => {
    expect(DEK_WRAP_ITERATIONS).toBe(210_000);
    expect(kat.iterations).toBe(210_000);
  });

  it('a different iteration count derives a different KEK and fails to unwrap the fixture (proves the constant is load-bearing)', async () => {
    // DEK_WRAP_ITERATIONS itself is a `const` (correctly not mutable at
    // runtime — see design §6, it must never be configurable). This
    // reproduces what an iteration-count drift would do: derive the KEK
    // with a DIFFERENT count than the one the fixture was wrapped under,
    // and confirm the mismatched KEK cannot open the fixture's wrappedDek.
    const driftedIterations = DEK_WRAP_ITERATIONS + 1;
    const preHash = await sha256Base64(kat.password);
    const driftedKekBase64 = await pbkdf2Base64(preHash, kat.wrapSalt, driftedIterations);
    const driftedKek = bytesFromBase64(driftedKekBase64);

    expect(() =>
      aesGcmDecrypt(driftedKek, bytesFromBase64(kat.wrapIv), bytesFromBase64(kat.wrappedDek)),
    ).toThrow();
  });
});
