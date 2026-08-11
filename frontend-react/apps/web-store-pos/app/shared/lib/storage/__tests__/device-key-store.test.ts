// design §2 "storage/device-key-store.ts — NEW, the only IndexedDB in the
// repo" + §7 "Test strategy per seam". `import 'fake-indexeddb/auto'` MUST
// be the first line of this file (per-file import, never in
// `vitest.setup.ts` — design §7's blast-radius rationale).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOrCreateDeviceKey,
  getDeviceKey,
  deleteDeviceKey,
  DEVICE_KEY_OPEN_TIMEOUT_MS,
} from '../device-key-store';

// Task 1.0 — blocking feasibility gate, not app behavior. `fake-indexeddb`
// needs a global `structuredClone`; whether vitest's jsdom environment here
// exposes one was explicitly flagged NOT VERIFIED by the design (§7).
describe('device-key-store — feasibility gate (task 1.0)', () => {
  it('globalThis.structuredClone is available under vitest+jsdom', () => {
    expect(typeof globalThis.structuredClone).toBe('function');
  });
});

describe('device-key-store — getOrCreateDeviceKey (task 1.1)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('returns the SAME key on a second call, extractable:false, raw export rejects', async () => {
    const key1 = await getOrCreateDeviceKey();
    const key2 = await getOrCreateDeviceKey();

    expect(key1).not.toBeNull();
    expect(key2).not.toBeNull();
    expect(key1!.extractable).toBe(false);
    // Comparing the CryptoKey objects by identity is not meaningful across
    // an IDB round-trip (structuredClone produces a new object), so prove
    // "same key" the only way that matters: it decrypts what the OTHER
    // instance encrypted.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1!, new TextEncoder().encode('probe'));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key2!, ciphertext);
    expect(new TextDecoder().decode(plaintext)).toBe('probe');

    await expect(crypto.subtle.exportKey('raw', key1!)).rejects.toThrow();
  });
});

describe('device-key-store — IndexedDB unavailable (task 1.3, F1)', () => {
  let originalIndexedDB: IDBFactory | undefined;

  beforeEach(() => {
    originalIndexedDB = globalThis.indexedDB;
    // @ts-expect-error — simulating the F1 failure mode (no IndexedDB global)
    delete globalThis.indexedDB;
  });

  afterEach(() => {
    globalThis.indexedDB = originalIndexedDB!;
  });

  it('getOrCreateDeviceKey() resolves null, never throws', async () => {
    await expect(getOrCreateDeviceKey()).resolves.toBeNull();
  });
});

describe('device-key-store — bounded open (task 1.5, F2 white-screen guard)', () => {
  let originalOpen: typeof indexedDB.open;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    originalOpen = indexedDB.open.bind(indexedDB);
    vi.useFakeTimers();
  });

  afterEach(() => {
    indexedDB.open = originalOpen;
    vi.useRealTimers();
  });

  it('resolves null within DEVICE_KEY_OPEN_TIMEOUT_MS when open() never settles', async () => {
    // Simulate a `blocked` open: a real IDBOpenDBRequest whose handlers are
    // never invoked (never `onsuccess`, never `onerror`, never `onblocked`
    // resolving anything) — exactly what happens when another tab holds the
    // database open.
    indexedDB.open = vi.fn(() => ({}) as IDBOpenDBRequest);

    const resultPromise = getOrCreateDeviceKey();
    let settled = false;
    resultPromise.then(() => {
      settled = true;
    });

    // Not yet timed out — must still be pending.
    await vi.advanceTimersByTimeAsync(DEVICE_KEY_OPEN_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toBeNull();
  });
});

describe('device-key-store — deleteDeviceKey (task 1.7)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('clears the record; a subsequent getOrCreateDeviceKey() mints a DIFFERENT key', async () => {
    const original = await getOrCreateDeviceKey();
    expect(original).not.toBeNull();

    await deleteDeviceKey();

    const afterDelete = await getDeviceKey();
    expect(afterDelete).toBeNull();

    const minted = await getOrCreateDeviceKey();
    expect(minted).not.toBeNull();

    // Prove it is a genuinely NEW key, not the same object round-tripped:
    // encrypt under the original, decrypt under the new one must FAIL.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      original!,
      new TextEncoder().encode('probe'),
    );
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, minted!, ciphertext),
    ).rejects.toThrow();
  });
});

describe('device-key-store — getDeviceKey never creates (task 1.9)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('resolves null on an empty DB and leaves the DB empty', async () => {
    await expect(getDeviceKey()).resolves.toBeNull();

    // The DB must stay empty — a subsequent getOrCreateDeviceKey() mint
    // proves nothing was pre-seeded by the read-only call above (if it had
    // minted, this would just return that same key; instead we assert the
    // read path took zero action by checking a fresh getDeviceKey() call
    // is STILL null).
    await expect(getDeviceKey()).resolves.toBeNull();
  });
});
