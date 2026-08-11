// design §2 "storage/dek-bootstrap.ts — NEW, async, memoised" + §7 (real
// WebCrypto + fake-indexeddb, no crypto mocks, for the recovery-path
// tests). `import 'fake-indexeddb/auto'` first line.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bootstrapDeviceDek, wrapDekForDevice, unwrapDekFromDevice } from '../dek-bootstrap';
import { writeDeviceDekTable } from '../device-dek-table';
import { getOrCreateDeviceKey } from '../device-key-store';
import { getDek, getDekStoreId, clearDek } from '../data-key-store';

describe('dek-bootstrap — wrapDekForDevice / unwrapDekFromDevice round trip', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('unwraps exactly what was wrapped, byte-for-byte', async () => {
    const deviceKey = await getOrCreateDeviceKey();
    const originalDek = crypto.getRandomValues(new Uint8Array(32));

    const wrap = await wrapDekForDevice(originalDek, deviceKey!);
    const recovered = await unwrapDekFromDevice(wrap, deviceKey!);

    expect(Array.from(recovered)).toEqual(Array.from(originalDek));
  });
});

describe('dek-bootstrap — bootstrapDeviceDek recovers the DEK (task 4.1)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    clearDek();
  });

  it('device wrap present + device key present -> getDek() non-null, exact original bytes', async () => {
    const deviceKey = await getOrCreateDeviceKey();
    expect(deviceKey).not.toBeNull();

    const originalDek = crypto.getRandomValues(new Uint8Array(32));
    const wrap = await wrapDekForDevice(originalDek, deviceKey!);

    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'local',
      storeId: 's1',
      device: wrap,
      users: {},
    });

    await bootstrapDeviceDek();

    expect(getDek()).not.toBeNull();
    expect(Array.from(getDek()!)).toEqual(Array.from(originalDek));
    expect(getDekStoreId()).toBe('s1');
  });

  it('already unlocked this page load (getDek() non-null) -> returns immediately, DEK unchanged', async () => {
    const already = crypto.getRandomValues(new Uint8Array(32));
    const { setDek } = await import('../data-key-store');
    setDek(already, 's9');

    // Table intentionally points at a DIFFERENT store/wrap to prove the
    // early-return branch is what ran, not a real recovery.
    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'local',
      storeId: 's1',
      device: null,
      users: {},
    });

    await bootstrapDeviceDek();

    expect(Array.from(getDek()!)).toEqual(Array.from(already));
    expect(getDekStoreId()).toBe('s9');
  });
});

describe('dek-bootstrap — device key missing (task 4.3, F4 half 1)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory(); // fresh, empty DB -> getDeviceKey() resolves null
    localStorage.clear();
    clearDek();
  });

  it('getDek() stays null, no throw', async () => {
    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'local',
      storeId: 's1',
      device: { wrappedDek: 'garbage', wrapIv: 'garbage' },
      users: {},
    });

    await expect(bootstrapDeviceDek()).resolves.toBeUndefined();
    expect(getDek()).toBeNull();
  });

  it('no table at all -> getDek() stays null, no throw', async () => {
    await expect(bootstrapDeviceDek()).resolves.toBeUndefined();
    expect(getDek()).toBeNull();
  });
});

describe('dek-bootstrap — single-flight memo (task 4.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
  });

  afterEach(() => {
    vi.doUnmock('../device-key-store');
    vi.resetModules();
  });

  it('called twice concurrently observes the key-open path (getDeviceKey) exactly once', async () => {
    const getDeviceKeyMock = vi.fn().mockResolvedValue(null);
    vi.doMock('../device-key-store', () => ({ getDeviceKey: getDeviceKeyMock }));

    const { writeDeviceDekTable: write } = await import('../device-dek-table');
    const { clearDek: clear } = await import('../data-key-store');
    const { bootstrapDeviceDek: bootstrap } = await import('../dek-bootstrap');

    clear();
    write({
      formatVersion: 1,
      dekSource: 'local',
      storeId: 's1',
      device: { wrappedDek: 'ct', wrapIv: 'iv' },
      users: {},
    });

    await Promise.all([bootstrap(), bootstrap()]);

    expect(getDeviceKeyMock).toHaveBeenCalledTimes(1);
  });
});
