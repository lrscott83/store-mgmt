import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readEntityOrThrow, EntityUnreadableError } from '../read-entity-or-throw';
import { MissingDataKeyError } from '../entity-crypto';
import { setDek, clearDek } from '../data-key-store';

const KEY = 'lizoft.store-product-categories-s1';

// jsdom does not guarantee a global `Buffer`; base64-encode via `btoa` instead
// (same approach as `storage/base64.ts`'s `base64FromBytes`).
function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

describe('readEntityOrThrow', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the key is absent — a genuinely new store', () => {
    expect(readEntityOrThrow(KEY, (json) => JSON.parse(json))).toBeNull();
  });

  it('returns the parsed value for readable plaintext', () => {
    localStorage.setItem(KEY, '[["a",{"id":"a"}]]');
    expect(readEntityOrThrow(KEY, (json) => new Map(JSON.parse(json)))).toEqual(
      new Map([['a', { id: 'a' }]]),
    );
  });

  it('lets the parse callback veto with null, without treating it as a failure', () => {
    localStorage.setItem(KEY, '{}');
    expect(readEntityOrThrow(KEY, (json) => (json === '{}' ? null : JSON.parse(json)))).toBeNull();
  });

  it('propagates MissingDataKeyError unchanged, so the policy can tell the two failures apart', () => {
    localStorage.setItem(KEY, 'enc:v1:AAAA');
    expect(() => readEntityOrThrow(KEY, (json) => JSON.parse(json))).toThrow(MissingDataKeyError);
  });

  it('wraps a decrypt failure that is NOT a missing key in EntityUnreadableError', () => {
    setDek(new Uint8Array(32), 's1');
    // A well-formed envelope whose GCM tag cannot verify under this key.
    localStorage.setItem(KEY, 'enc:v1:' + base64FromBytes(new Uint8Array(60)));
    expect(() => readEntityOrThrow(KEY, (json) => JSON.parse(json))).toThrow(EntityUnreadableError);
  });

  it('wraps a parse failure in EntityUnreadableError', () => {
    localStorage.setItem(KEY, 'not json at all');
    expect(() =>
      readEntityOrThrow(KEY, (json) => JSON.parse(json) as unknown),
    ).toThrow(EntityUnreadableError);
  });

  it('NEVER writes to storage on any failure path', () => {
    localStorage.setItem(KEY, 'enc:v1:AAAA');
    const before = localStorage.getItem(KEY);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(() => readEntityOrThrow(KEY, (json) => JSON.parse(json))).toThrow();
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe(before);
  });
});
