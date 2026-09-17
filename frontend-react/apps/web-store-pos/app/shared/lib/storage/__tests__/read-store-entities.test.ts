import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingExplicitDekError } from '../entity-crypto';

// The repo's established testing convention: jsdom localStorage, real crypto
// (aes-gcm tests already use WebCrypto), device-key-store mocked for the
// unwrap path (IndexedDB is unavailable in jsdom).
const getDeviceKeyMock = vi.fn<() => Promise<CryptoKey | null>>();

vi.mock('../device-key-store', () => ({
  getDeviceKey: (...args: unknown[]) => getDeviceKeyMock(...(args as [])),
  getOrCreateDeviceKey: vi.fn(),
  deleteDeviceKey: vi.fn(),
  DEVICE_KEY_DB: 'lizoft-device-key',
  DEVICE_KEY_STORE: 'keys',
  DEVICE_KEY_ID: 'device-dek-key',
}));
import { decryptEntityWithDek, encryptEntity, MissingDataKeyError } from '../entity-crypto';
import {
  getStoresWithLocalDek,
  readStoreEntities,
  unwrapStoreDekForStore,
} from '../read-store-entities';
import {
  clearDeviceDekTable,
  readDeviceDekTable,
  writeDeviceDekTable,
} from '../device-dek-table';
import { setDek, clearDek, getDek } from '../data-key-store';
import { wrapDekForDevice } from '../dek-bootstrap';

// ─── decryptEntityWithDek ──────────────────────────────────────────────────

describe('decryptEntityWithDek', () => {
  it('decrypts a payload encrypted by encryptEntity with the same DEK', () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    setDek(dek, 'store-1');
    try {
      const stored = encryptEntity(JSON.stringify([{ id: 'a' }]));
      expect(decryptEntityWithDek(stored, dek)).toBe(JSON.stringify([{ id: 'a' }]));
    } finally {
      clearDek();
    }
  });

  it('passes plaintext through unchanged (no enc:v1: marker) even with a null DEK', () => {
    expect(decryptEntityWithDek('[]', null)).toBe('[]');
    expect(decryptEntityWithDek('{"a":1}', null)).toBe('{"a":1}');
  });

  it('returns null for null input', () => {
    expect(decryptEntityWithDek(null, null)).toBeNull();
  });

  it('throws MissingExplicitDekError (not MissingDataKeyError) for marked payload with null DEK', () => {
    const dekA = crypto.getRandomValues(new Uint8Array(32));
    setDek(dekA, 'store-1');
    let stored: string;
    try {
      stored = encryptEntity('[1,2,3]');
    } finally {
      clearDek();
    }
    expect(() => decryptEntityWithDek(stored, null)).toThrow(MissingExplicitDekError);
    expect(() => decryptEntityWithDek(stored, null)).not.toThrow(MissingDataKeyError);
  });

  it('leaves the global-DEK API untouched: decryptEntity still throws MissingDataKeyError when no global DEK', async () => {
    const { decryptEntity } = await import('../entity-crypto');
    const dek = crypto.getRandomValues(new Uint8Array(32));
    setDek(dek, 'store-1');
    const stored = encryptEntity('{"x":9}');
    clearDek();
    expect(() => decryptEntity(stored)).toThrow(MissingDataKeyError);
  });
});

// ─── unwrapStoreDekForStore ────────────────────────────────────────────────

describe('unwrapStoreDekForStore', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    getDeviceKeyMock.mockReset();
  });

  it('returns null with no table', async () => {
    getDeviceKeyMock.mockResolvedValue(null);
    await expect(unwrapStoreDekForStore('store-b')).resolves.toBeNull();
  });

  it('returns null for a store without a device wrap (v1 table / never provisioned)', async () => {
    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'roster',
      storeId: 'store-a',
      device: null,
      users: {},
    });
    getDeviceKeyMock.mockResolvedValue({} as CryptoKey);
    await expect(unwrapStoreDekForStore('store-b')).resolves.toBeNull();
  });

  it('returns null when the device key is unavailable (IndexedDB failure)', async () => {
    const dekB = crypto.getRandomValues(new Uint8Array(32));
    const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const wrap = await wrapDekForDevice(dekB, deviceKey);
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: 'store-a',
      device: null,
      users: {},
      stores: { 'store-b': { device: wrap } },
    });
    getDeviceKeyMock.mockResolvedValue(null);
    await expect(unwrapStoreDekForStore('store-b')).resolves.toBeNull();
  });

  it('round-trips: unwraps store B DEK from its per-store device wrap', async () => {
    const dekB = crypto.getRandomValues(new Uint8Array(32));
    const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const wrap = await wrapDekForDevice(dekB, deviceKey);
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: 'store-a',
      device: null,
      users: {},
      stores: { 'store-b': { device: wrap } },
    });
    getDeviceKeyMock.mockResolvedValue(deviceKey);

    const unwrapped = await unwrapStoreDekForStore('store-b');
    expect(unwrapped).not.toBeNull();
    expect(Array.from(unwrapped!)).toEqual(Array.from(dekB));
  });

  it('returns the in-memory DEK for the SELECTED store (no re-derivation)', async () => {
    const dekA = crypto.getRandomValues(new Uint8Array(32));
    setDek(dekA, 'store-a');
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: 'store-a',
      device: null,
      users: {},
      stores: {},
    });
    getDeviceKeyMock.mockResolvedValue(null);
    await expect(unwrapStoreDekForStore('store-a')).resolves.toBe(dekA);
  });

  it('returns null when the stored wrap is corrupt for this device key', async () => {
    const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const dekB = crypto.getRandomValues(new Uint8Array(32));
    const wrap = await wrapDekForDevice(dekB, otherKey); // wrapped under a DIFFERENT key
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: 'store-a',
      device: null,
      users: {},
      stores: { 'store-b': { device: wrap } },
    });
    getDeviceKeyMock.mockResolvedValue(deviceKey);
    await expect(unwrapStoreDekForStore('store-b')).resolves.toBeNull();
  });
});

// ─── readStoreEntities ─────────────────────────────────────────────────────

describe('readStoreEntities', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });

  it('returns [] for an absent key', () => {
    expect(readStoreEntities('orders', 'store-x', null)).toEqual([]);
  });

  it('returns [] on corrupt JSON (never throws)', () => {
    localStorage.setItem('lizoft.store-orders-store-x', '{not-json');
    expect(readStoreEntities('orders', 'store-x', null)).toEqual([]);
  });

  it('returns [] when payload is encrypted but DEK is null (never throws)', () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    setDek(dek, 'store-1');
    const stored = encryptEntity('[{"id":"o1"}]');
    clearDek();
    localStorage.setItem('lizoft.store-orders-store-x', stored);
    expect(readStoreEntities('orders', 'store-x', null)).toEqual([]);
  });

  it('round-trips two stores with DIFFERENT DEKs — each store readable only with its own DEK', () => {
    const dekA = crypto.getRandomValues(new Uint8Array(32));
    const dekB = crypto.getRandomValues(new Uint8Array(32));

    setDek(dekA, 'store-a');
    const payloadA = encryptEntity(JSON.stringify([{ id: 'order-a1' }]));
    localStorage.setItem('lizoft.store-orders-store-a', payloadA);

    setDek(dekB, 'store-b');
    const payloadB = encryptEntity(JSON.stringify([{ id: 'order-b1' }]));
    localStorage.setItem('lizoft.store-orders-store-b', payloadB);

    clearDek();

    expect(readStoreEntities<{ id: string }>('orders', 'store-a', dekA).map((o) => o.id)).toEqual([
      'order-a1',
    ]);
    expect(readStoreEntities<{ id: string }>('orders', 'store-b', dekB).map((o) => o.id)).toEqual([
      'order-b1',
    ]);
    // Cross-DEK read fails closed (GCM tag mismatch degrades to []).
    expect(readStoreEntities<{ id: string }>('orders', 'store-a', dekB)).toEqual([]);
  });

  it('returns [] for non-array JSON payloads', () => {
    localStorage.setItem('lizoft.store-orders-store-x', '{"a":1}');
    expect(readStoreEntities('orders', 'store-x', null)).toEqual([]);
  });
});

// ─── getStoresWithLocalDek ─────────────────────────────────────────────────

describe('getStoresWithLocalDek', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty set with no table', () => {
    expect(getStoresWithLocalDek().size).toBe(0);
  });

  it('includes the selected store plus every per-store wrap entry', () => {
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: 'store-a',
      device: null,
      users: {},
      stores: { 'store-b': { device: { wrappedDek: 'x', wrapIv: 'y' } } },
    });
    const ids = getStoresWithLocalDek();
    expect(ids.has('store-a')).toBe(true);
    expect(ids.has('store-b')).toBe(true);
    expect(readDeviceDekTable()?.formatVersion).toBe(2);
    clearDeviceDekTable();
  });
});

// Sanity: getDek import used by the selected-store path is the real one.
describe('read-store-entities smoke', () => {
  it('getDek reflects data-key-store state', () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    setDek(dek, 'store-a');
    expect(getDek()).toBe(dek);
    clearDek();
    expect(getDek()).toBeNull();
  });
});
