import { describe, it, expect, beforeEach } from 'vitest';
import {
  readDeviceDekTable,
  writeDeviceDekTable,
  hasDeviceDekWrap,
  clearDeviceDekTable,
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
