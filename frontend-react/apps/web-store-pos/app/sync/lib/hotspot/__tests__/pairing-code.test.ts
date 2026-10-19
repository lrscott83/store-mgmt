import { describe, it, expect } from 'vitest';
import {
  generatePairingCode,
  generatePairingSalt,
  pairingProof,
  verifyPairingProof,
  PAIRING_CODE_DIGITS,
} from '../pairing-code';

describe('generatePairingCode', () => {
  it('always returns exactly 6 decimal digits', () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePairingCode()).toMatch(/^\d{6}$/);
    }
  });

  it('is not a constant', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generatePairingCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('exposes the digit count as a single source of truth', () => {
    expect(PAIRING_CODE_DIGITS).toBe(6);
  });
});

describe('generatePairingSalt', () => {
  it('produces 16 random bytes, base64-encoded', () => {
    const salt = generatePairingSalt();
    expect(atob(salt)).toHaveLength(16);
    expect(generatePairingSalt()).not.toBe(salt);
  });
});

describe('pairingProof', () => {
  it('is deterministic for the same code and salt', async () => {
    const salt = generatePairingSalt();
    await expect(pairingProof('123456', salt)).resolves.toBe(await pairingProof('123456', salt));
  });

  it('produces a 32-byte base64 proof', async () => {
    expect(atob(await pairingProof('123456', generatePairingSalt()))).toHaveLength(32);
  });

  it('changes with the salt (so a captured proof is session-bound)', async () => {
    const [a, b] = await Promise.all([
      pairingProof('123456', generatePairingSalt()),
      pairingProof('123456', generatePairingSalt()),
    ]);
    expect(a).not.toBe(b);
  });
});

describe('verifyPairingProof', () => {
  it('accepts the matching code and rejects any other', async () => {
    const salt = generatePairingSalt();
    const proof = await pairingProof('482913', salt);

    await expect(verifyPairingProof('482913', salt, proof)).resolves.toBe(true);
    await expect(verifyPairingProof('482914', salt, proof)).resolves.toBe(false);
    await expect(verifyPairingProof('000000', salt, proof)).resolves.toBe(false);
  });

  it('rejects a proof replayed against a different session salt', async () => {
    const proof = await pairingProof('482913', generatePairingSalt());
    await expect(verifyPairingProof('482913', generatePairingSalt(), proof)).resolves.toBe(false);
  });
});
