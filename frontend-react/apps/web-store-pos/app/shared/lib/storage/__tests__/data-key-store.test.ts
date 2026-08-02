import { describe, it, expect, beforeEach } from 'vitest';
import { setDek, getDek, getDekStoreId, clearDek } from '../data-key-store';

// design §11 — the DEK is a module-level `let`, never persisted anywhere.
// This is the entire threat model (design §1): a storage dump that yields
// both key and ciphertext is obfuscation, not encryption.
describe('data-key-store — memory-only lifecycle', () => {
  beforeEach(() => clearDek());

  it('getDek() is null before any setDek', () => {
    expect(getDek()).toBeNull();
    expect(getDekStoreId()).toBeNull();
  });

  it('returns the exact bytes after setDek', () => {
    const dek = new Uint8Array(32).fill(0x42);
    setDek(dek, 'store-1');
    expect(Array.from(getDek() ?? [])).toEqual(Array.from(dek));
    expect(getDekStoreId()).toBe('store-1');
  });

  it('is null again after clearDek()', () => {
    setDek(new Uint8Array(32).fill(0x42), 'store-1');
    clearDek();
    expect(getDek()).toBeNull();
    expect(getDekStoreId()).toBeNull();
  });

  // Flagged per apply-progress's own defect rule (task 4.2): this test
  // should already pass given a correctly memory-only 4.1 implementation.
  // Written anyway because it asserts a NEGATIVE — the DEK's absence of
  // persistence — that is easy to silently break in a later refactor.
  it('no storage key (localStorage or sessionStorage) ever carries the DEK', () => {
    localStorage.clear();
    sessionStorage.clear();

    const dek = new Uint8Array(32);
    for (let i = 0; i < dek.length; i++) dek[i] = (i * 7 + 3) % 256;
    setDek(dek, 'store-1');

    let binary = '';
    for (let i = 0; i < dek.length; i++) binary += String.fromCharCode(dek[i]);
    const dekBase64 = btoa(binary);

    for (const key of Object.keys(localStorage)) {
      expect(localStorage.getItem(key) ?? '').not.toContain(dekBase64);
    }
    for (const key of Object.keys(sessionStorage)) {
      expect(sessionStorage.getItem(key) ?? '').not.toContain(dekBase64);
    }
  });
});
