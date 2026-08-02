import { describe, it, expect } from 'vitest';
import { base64FromBytes, bytesFromBase64 } from '../base64';

// Design correction 3: these helpers deliberately duplicate the 12 private
// lines in `offline-crypto.ts` rather than importing from it — that module
// is a KAT-pinned, zero-import leaf for the live offline-auth path and must
// not gain a new consumer on a change whose whole risk is crypto drift.
describe('base64 — round-trip fixed vector', () => {
  it('round-trips a fixed 48-byte vector including 0x00 and 0xFF', () => {
    const bytes = new Uint8Array(48);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i === 0 ? 0x00 : i === bytes.length - 1 ? 0xff : i;
    }

    const encoded = base64FromBytes(bytes);
    const decoded = bytesFromBase64(encoded);

    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it('produces the exact known Base64 string for a small fixed vector', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x10, 0x20]);
    expect(base64FromBytes(bytes)).toBe('AP8QIA==');
    expect(Array.from(bytesFromBase64('AP8QIA=='))).toEqual([0x00, 0xff, 0x10, 0x20]);
  });
});
