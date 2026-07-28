import { describe, it, expect } from 'vitest';
import {
  sha256Base64,
  pbkdf2Base64,
  verifyOfflinePassword,
  PBKDF2_HASH,
  PBKDF2_KEY_BYTES,
  PBKDF2_SALT_BYTES,
  PBKDF2_ITERATIONS,
} from '../offline-crypto';

// Design D2 / spec offline-roster-bundle "Verifier parameters are pinned by
// known-answer vectors": these constants must never silently drift between
// frontend and backend — a KAT break is the drift detector, not a locked-out
// user.
describe('offline-crypto — pinned constants (D2)', () => {
  it('pins the algorithm, key length, salt length, and iteration count', () => {
    expect(PBKDF2_HASH).toBe('SHA-256');
    expect(PBKDF2_KEY_BYTES).toBe(32);
    expect(PBKDF2_SALT_BYTES).toBe(16);
    expect(PBKDF2_ITERATIONS).toBe(210_000);
  });
});

describe('sha256Base64 — known-answer vector', () => {
  it('hashes "test" to the pinned Base64 SHA-256 digest', async () => {
    const result = await sha256Base64('test');
    expect(result).toBe('n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=');
  });
});

describe('pbkdf2Base64 — determinism + output shape', () => {
  const fixedSalt = 'AAAAAAAAAAAAAAAAAAAAAA=='; // 16 zero bytes, Base64

  it('is deterministic for the same input/salt/iterations', async () => {
    const a = await pbkdf2Base64('n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=', fixedSalt, 210_000);
    const b = await pbkdf2Base64('n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=', fixedSalt, 210_000);
    expect(a).toBe(b);
  });

  it('produces a 32-byte derived key', async () => {
    const derived = await pbkdf2Base64('n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=', fixedSalt, 210_000);
    expect(atob(derived)).toHaveLength(32);
  });
});

describe('verifyOfflinePassword — accepts only the matching password', () => {
  const fixedSalt = 'AAAAAAAAAAAAAAAAAAAAAA==';

  it('returns true for the correct password and false for a wrong one', async () => {
    const preHash = await sha256Base64('secret');
    const hash = await pbkdf2Base64(preHash, fixedSalt, 210_000);
    const verifier = { hash, salt: fixedSalt, iterations: 210_000 };

    await expect(verifyOfflinePassword('secret', verifier)).resolves.toBe(true);
    await expect(verifyOfflinePassword('wrong', verifier)).resolves.toBe(false);
  });
});
