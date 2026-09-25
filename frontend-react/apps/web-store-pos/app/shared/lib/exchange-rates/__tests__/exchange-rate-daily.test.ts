// The daily USD→MN register's device-local anchor — the one piece of state
// that decides which days the register has to contain.
//
// Two promises are encoded here, and both are user-visible:
//   1. the anchor means "the first day the STORE OWNER authenticated on this
//      device", so it is stamped ONCE (first login wins, forever) and only by
//      an owner. An employee's first login must not shorten the register;
//   2. the register "grows every day even without navigating to the view", so
//      the backfill runs at auth time and is idempotent — a second run must add
//      nothing, or every login would duplicate the whole history.
//
// Integration-style on purpose: REAL `localStorage`, the REAL anchor key, and
// the REAL `ExchangeRateOfflineService` reached through the module's own
// dynamic `import()` — nothing is mocked, so a break in the lazy import or in
// the service's storage seam shows up here rather than in the field.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExchangeRate, UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../../storage/storage-keys';
import { fromLocalDayKey, toLocalDayKey } from '../../date-utils';
import { ExchangeRateOfflineService } from '~/management/exchange-rates/lib/services/exchange-rate-offline-service';
import { ensureExchangeRateDailyRecords, getExchangeRateAnchor } from '../exchange-rate-daily';

const STORE = 's1';
const OTHER_STORE = 's2';
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

// A frozen "now" so the register's length is a number, not a race with the
// wall clock: only `Date` is faked, so promises (the lazy import) behave.
const NOW = new Date(2026, 8, 25, 15, 30, 0);
const TODAY_KEY = '2026-09-25';

function owner(overrides: Partial<UserModel> = {}): UserModel {
  return {
    isOwnerAdmin: true,
    selectedStoreId: STORE,
    ...overrides,
  } as UserModel;
}

function register(storeId: string): ExchangeRate[] {
  return new ExchangeRateOfflineService(storeId).getStorageExchangeRates();
}

function dayKeys(storeId: string): string[] {
  return register(storeId)
    .map((rate) => rate.id)
    .sort();
}

function valuesByDay(storeId: string): Record<string, number> {
  return Object.fromEntries(register(storeId).map((rate) => [rate.id, rate.value]));
}

/**
 * Seeds a register straight into storage, the way a backup import or a previous
 * session would leave it. No DEK is set in this file, so `encryptEntity` takes
 * its "encryption not provisioned" branch and stores the JSON as-is — the same
 * bytes a plain reader sees, which is what the backfill has to cope with.
 */
function seedRegister(storeId: string, rows: Array<{ id: string; value: number }>): void {
  const payload: ExchangeRate[] = rows.map((row) => ({
    id: row.id,
    date: fromLocalDayKey(row.id),
    value: row.value,
  }));
  localStorage.setItem(StorageKeys.entityKey('exchangeRates', storeId), JSON.stringify(payload));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getExchangeRateAnchor — reading the stamped day', () => {
  it('falls back to today when no anchor was ever stamped', () => {
    const anchor = getExchangeRateAnchor();

    expect(anchor).toBeInstanceOf(Date);
    expect(toLocalDayKey(anchor)).toBe(TODAY_KEY);
  });

  it('reads the stamped day back as that day\'s LOCAL midnight', () => {
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-09-01');

    const anchor = getExchangeRateAnchor();

    expect(toLocalDayKey(anchor)).toBe('2026-09-01');
    expect(anchor.getHours()).toBe(0);
    expect(anchor.getMinutes()).toBe(0);
    expect(anchor.getSeconds()).toBe(0);
    expect(anchor.getMilliseconds()).toBe(0);
  });

  it('is device-scoped: a store switch does not move the anchor', () => {
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-09-01');

    // One origin-wide key, read by the view and by both backfill entry points.
    expect(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN).toBe('exchangeRatesFirstLogin');
    expect(toLocalDayKey(getExchangeRateAnchor())).toBe('2026-09-01');
  });

  it('is a pure read — repeated calls never stamp or move the anchor', () => {
    expect(toLocalDayKey(getExchangeRateAnchor())).toBe(TODAY_KEY);
    expect(toLocalDayKey(getExchangeRateAnchor())).toBe(TODAY_KEY);

    expect(localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN)).toBeNull();
  });

  it('falls back to today again once the anchor is cleared', () => {
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-09-01');
    localStorage.removeItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN);

    expect(toLocalDayKey(getExchangeRateAnchor())).toBe(TODAY_KEY);
  });
});

describe('ensureExchangeRateDailyRecords — who may stamp the anchor', () => {
  it('does nothing for a null user', async () => {
    await ensureExchangeRateDailyRecords(null);

    expect(localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN)).toBeNull();
    expect(register(STORE)).toEqual([]);
  });

  it('does nothing for a non-owner — the anchor means the OWNER\'s first login', async () => {
    await ensureExchangeRateDailyRecords(owner({ isOwnerAdmin: false }));

    expect(localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN)).toBeNull();
    expect(localStorage.getItem(StorageKeys.entityKey('exchangeRates', STORE))).toBeNull();
  });

  it('does nothing without a selected store', async () => {
    await ensureExchangeRateDailyRecords(owner({ selectedStoreId: null as unknown as string }));

    expect(localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN)).toBeNull();
  });

  it('does nothing for the empty GUID — an unassigned store is not a store', async () => {
    await ensureExchangeRateDailyRecords(owner({ selectedStoreId: EMPTY_GUID }));

    expect(localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN)).toBeNull();
    expect(localStorage.getItem(StorageKeys.entityKey('exchangeRates', EMPTY_GUID))).toBeNull();
  });

  it('stamps today on the owner\'s first login and backfills from there', async () => {
    await ensureExchangeRateDailyRecords(owner());

    expect(localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN)).toBe(TODAY_KEY);
    expect(dayKeys(STORE)).toEqual([TODAY_KEY]);
  });

  it('never re-stamps: a later login keeps the first-login day', async () => {
    await ensureExchangeRateDailyRecords(owner());

    vi.setSystemTime(new Date(2026, 8, 30, 9, 0, 0));
    await ensureExchangeRateDailyRecords(owner());

    expect(localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN)).toBe(TODAY_KEY);
    // …and the register has grown to cover the days in between.
    expect(dayKeys(STORE)).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ]);
  });
});

describe('ensureExchangeRateDailyRecords — the register it maintains', () => {
  it('is empty on a device that has never stamped an anchor', () => {
    expect(register(STORE)).toEqual([]);
  });

  it('backfills one record per local day from the anchor through today', async () => {
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-09-20');

    await ensureExchangeRateDailyRecords(owner());

    expect(dayKeys(STORE)).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
  });

  it('a day with no record yet inherits the previous day\'s value, and the first defaults to 1', async () => {
    // Seeded with only the first two days, so the backfill has to create the
    // rest: the step function is visible where it is actually computed.
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-09-20');
    seedRegister(STORE, [
      { id: '2026-09-20', value: 1 },
      { id: '2026-09-21', value: 520 },
    ]);

    await ensureExchangeRateDailyRecords(owner());

    const values = valuesByDay(STORE);
    expect(values['2026-09-20']).toBe(1);
    expect(values['2026-09-21']).toBe(520);
    // Every day created after the edit inherits it: the register is a step
    // function, not a per-day independent series.
    expect(values['2026-09-22']).toBe(520);
    expect(values['2026-09-25']).toBe(520);
  });

  it('a backfilled day is editable in place and keeps its day key', async () => {
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-09-24');
    await ensureExchangeRateDailyRecords(owner());

    new ExchangeRateOfflineService(STORE).updateValue('2026-09-25', 640);

    expect(dayKeys(STORE)).toEqual(['2026-09-24', '2026-09-25']);
    expect(valuesByDay(STORE)['2026-09-25']).toBe(640);
  });

  it('is idempotent: logging in again adds nothing and edits nothing', async () => {
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-09-20');
    await ensureExchangeRateDailyRecords(owner());
    new ExchangeRateOfflineService(STORE).updateValue('2026-09-22', 777);
    const before = new ExchangeRateOfflineService(STORE).getStorageExchangeRates();

    await ensureExchangeRateDailyRecords(owner());

    const after = new ExchangeRateOfflineService(STORE).getStorageExchangeRates();
    expect(after).toHaveLength(before.length);
    expect(after.find((r) => r.id === '2026-09-22')?.value).toBe(777);
  });

  it('writes only the owner\'s store — another store\'s register is untouched', async () => {
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-09-20');
    seedRegister(OTHER_STORE, [{ id: '2026-09-01', value: 999 }]);

    await ensureExchangeRateDailyRecords(owner());

    expect(dayKeys(STORE)).toHaveLength(6);
    expect(dayKeys(OTHER_STORE)).toEqual(['2026-09-01']);
    expect(valuesByDay(OTHER_STORE)['2026-09-01']).toBe(999);
  });

  it('adds nothing when the anchor is in the future — the clock moved backwards', async () => {
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, '2026-10-05');

    await ensureExchangeRateDailyRecords(owner());

    expect(register(STORE)).toEqual([]);
  });
});

describe('ensureExchangeRateDailyRecords — fire-and-forget at authentication', () => {
  it('never blocks login: a storage failure is swallowed', async () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    await expect(ensureExchangeRateDailyRecords(owner())).resolves.toBeUndefined();

    setItemSpy.mockRestore();
  });
});
