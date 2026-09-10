import { describe, it, expect, beforeEach } from 'vitest';
import {
  readDeviceDekTable,
  writeDeviceDekTable,
  hasDeviceDekWrap,
  clearDeviceDekTable,
  retargetDeviceWrapStore,
  DEVICE_DEK_KEY,
  type DeviceDekTable,
} from '../device-dek-table';

function makeTable(overrides: Partial<DeviceDekTable> = {}): DeviceDekTable {
  return {
    formatVersion: 1,
    dekSource: 'local',
    storeId: 's1',
    device: { wrappedDek: 'ct', wrapIv: 'iv' },
    users: {},
    ...overrides,
  };
}

describe('device-dek-table — readDeviceDekTable / hasDeviceDekWrap (task 2.1)', () => {
  beforeEach(() => localStorage.clear());

  it('returns null and does not throw when no table is stored', () => {
    expect(readDeviceDekTable()).toBeNull();
    expect(hasDeviceDekWrap()).toBe(false);
  });

  it('returns null on non-JSON stored content', () => {
    localStorage.setItem(DEVICE_DEK_KEY, 'not-json{{{');
    expect(readDeviceDekTable()).toBeNull();
    expect(hasDeviceDekWrap()).toBe(false);
  });

  it('returns null on a wrong-shape stored value (missing required fields)', () => {
    localStorage.setItem(DEVICE_DEK_KEY, JSON.stringify({ formatVersion: 1 }));
    expect(readDeviceDekTable()).toBeNull();
    expect(hasDeviceDekWrap()).toBe(false);
  });

  it('a well-shaped table with a device wrap round-trips and hasDeviceDekWrap is true', () => {
    localStorage.setItem(DEVICE_DEK_KEY, JSON.stringify(makeTable()));
    expect(readDeviceDekTable()).toEqual(makeTable());
    expect(hasDeviceDekWrap()).toBe(true);
  });

  it('a well-shaped table with only a user wrap (no device wrap) is still hasDeviceDekWrap true', () => {
    const table = makeTable({
      device: null,
      users: { ana: { wrappedDek: 'ct', wrapSalt: 'salt', wrapIv: 'iv' } },
    });
    localStorage.setItem(DEVICE_DEK_KEY, JSON.stringify(table));
    expect(hasDeviceDekWrap()).toBe(true);
  });

  it('a well-shaped table with neither a device wrap nor any user wraps is hasDeviceDekWrap false', () => {
    const table = makeTable({ device: null, users: {} });
    localStorage.setItem(DEVICE_DEK_KEY, JSON.stringify(table));
    expect(hasDeviceDekWrap()).toBe(false);
  });
});

describe('device-dek-table — writeDeviceDekTable / clearDeviceDekTable round-trip (task 2.3)', () => {
  beforeEach(() => localStorage.clear());

  it('writes and reads back the exact table', () => {
    const table = makeTable({ dekSource: 'roster', storeId: 's2' });
    writeDeviceDekTable(table);
    expect(readDeviceDekTable()).toEqual(table);
  });

  it('clearDeviceDekTable removes it — subsequent read is null', () => {
    writeDeviceDekTable(makeTable());
    expect(readDeviceDekTable()).not.toBeNull();

    clearDeviceDekTable();

    expect(readDeviceDekTable()).toBeNull();
    expect(hasDeviceDekWrap()).toBe(false);
  });
});

describe('device-dek-table — v2 per-store wraps + retargetDeviceWrapStore (seamless-store-switch)', () => {
  beforeEach(() => localStorage.clear());

  function makeV2Table(overrides: Partial<DeviceDekTable> = {}): DeviceDekTable {
    return makeTable({
      formatVersion: 2,
      dekSource: 'login-response',
      stores: {
        s1: { device: { wrappedDek: 'ct-s1', wrapIv: 'iv-s1' } },
        s2: { device: { wrappedDek: 'ct-s2', wrapIv: 'iv-s2' } },
      },
      ...overrides,
    });
  }

  it('a v2 table with per-store wraps round-trips intact', () => {
    const table = makeV2Table();
    writeDeviceDekTable(table);
    expect(readDeviceDekTable()).toEqual(table);
  });

  it('a LEGACY v1 table (no stores field) still reads as valid', () => {
    const table = makeTable();
    writeDeviceDekTable(table);
    expect(readDeviceDekTable()).toEqual(table);
    expect(hasDeviceDekWrap()).toBe(true);
  });

  it('a v2 table with a malformed stores entry is rejected', () => {
    localStorage.setItem(
      DEVICE_DEK_KEY,
      JSON.stringify({
        ...makeV2Table(),
        stores: { s9: { device: { wrappedDek: 42, wrapIv: 'iv' } } },
      }),
    );
    expect(readDeviceDekTable()).toBeNull();
  });

  it('retarget copies the store wrap into device + storeId and persists', () => {
    writeDeviceDekTable(makeV2Table());    expect(retargetDeviceWrapStore('s2')).toBe(true);

    const table = readDeviceDekTable()!;
    expect(table.storeId).toBe('s2');
    expect(table.device).toEqual({ wrappedDek: 'ct-s2', wrapIv: 'iv-s2' });
    // The per-store map is untouched — switching back must stay possible.
    expect(table.stores?.s1).toEqual({ device: { wrappedDek: 'ct-s1', wrapIv: 'iv-s1' } });
  });

  it('retarget returns false WITHOUT writing when the store has no wrap', () => {
    writeDeviceDekTable(makeV2Table());

    expect(retargetDeviceWrapStore('s999')).toBe(false);

    // Byte-for-byte unchanged: the active wrap still points at s1.
    const table = readDeviceDekTable()!;
    expect(table.storeId).toBe('s1');
    expect(table.device).toEqual({ wrappedDek: 'ct', wrapIv: 'iv' });
  });

  it('retarget returns false on a v1 table and on a missing table', () => {
    writeDeviceDekTable(makeTable());
    expect(retargetDeviceWrapStore('s1')).toBe(false);

    clearDeviceDekTable();
    expect(retargetDeviceWrapStore('s1')).toBe(false);
  });
});
