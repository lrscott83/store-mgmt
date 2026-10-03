import { beforeEach, describe, expect, it } from 'vitest';
import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { toLocalDayKey } from '~/shared/lib/date-utils';
import { ChannelRateOfflineService } from '../services/channel-rate-offline-service';
import {
  migrateExchangeRatesToChannelRates,
  type ExchangeRatesRetirementOutcome,
} from '../migrate-exchange-rates-to-channel-rates';

const STORE = 's1';
const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
const REGISTER_KEY = StorageKeys.entityKey('exchangeRates', STORE);
const ANCHOR_KEY = StorageKeys.EXCHANGE_RATES_FIRST_LOGIN;

/** One row of the retired daily register: one calendar day, one value. */
function day(dayKey: string, value: number) {
  const [year, month, dayOfMonth] = dayKey.split('-').map(Number);
  return { id: dayKey, date: new Date(year, month - 1, dayOfMonth), value };
}

function seedRegister(rows: ReturnType<typeof day>[]): void {
  localStorage.setItem(REGISTER_KEY, JSON.stringify(rows));
}

function readRegister(): Array<{ id: string; value: number }> {
  const raw = localStorage.getItem(REGISTER_KEY);
  return raw === null ? [] : (JSON.parse(raw) as Array<{ id: string; value: number }>);
}

function readChannelRates() {
  return new ChannelRateOfflineService(STORE).getStorageChannelRates();
}

/** Runs the migration and returns its outcome — the four documented outcomes. */
function run(hasMultiMonedas: boolean, storeId: string = STORE): ExchangeRatesRetirementOutcome {
  return migrateExchangeRatesToChannelRates(storeId, hasMultiMonedas);
}

describe('migrateExchangeRatesToChannelRates', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('no store — nothing is touched', () => {
    it('returns no-store for an empty store id and writes nothing', () => {
      seedRegister([day('2026-09-01', 400)]);
      localStorage.setItem(ANCHOR_KEY, '2026-09-01');

      expect(run(true, '')).toBe('no-store');

      expect(readRegister()).toHaveLength(1);
      expect(localStorage.getItem(ANCHOR_KEY)).toBe('2026-09-01');
      expect(readChannelRates()).toEqual([]);
    });

    it('returns no-store for the empty GUID', () => {
      seedRegister([day('2026-09-01', 400)]);

      expect(run(true, EMPTY_GUID)).toBe('no-store');

      expect(readRegister()).toHaveLength(1);
    });
  });

  describe('empty register — the idempotency marker', () => {
    it('does nothing at all when the key is absent', () => {
      localStorage.setItem(ANCHOR_KEY, '2026-09-01');

      expect(run(true)).toBe('empty');

      expect(localStorage.getItem(REGISTER_KEY)).toBeNull();
      expect(localStorage.getItem(ANCHOR_KEY)).toBe('2026-09-01');
      expect(readChannelRates()).toEqual([]);
    });

    it('does nothing when the key holds an empty array, even without MultiMonedas', () => {
      seedRegister([]);

      expect(run(false)).toBe('empty');

      expect(readRegister()).toEqual([]);
      expect(readChannelRates()).toEqual([]);
    });

    it('a second call after a migration is a no-op (no duplicate rows)', () => {
      seedRegister([day('2026-09-01', 400), day('2026-09-02', 500)]);

      expect(run(true)).toBe('migrated');
      const afterFirst = readChannelRates().length;

      expect(run(true)).toBe('empty');
      expect(readChannelRates()).toHaveLength(afterFirst);
    });
  });

  describe('migrated — MultiMonedas available', () => {
    it('writes one row per VALUE CHANGE and wipes the register and the anchor', () => {
      localStorage.setItem(ANCHOR_KEY, '2026-09-01');
      seedRegister([
        day('2026-09-01', 400),
        day('2026-09-02', 400),
        day('2026-09-03', 450),
        day('2026-09-04', 450),
        day('2026-09-05', 450),
        day('2026-09-06', 500),
      ]);

      expect(run(true)).toBe('migrated');

      const rates = readChannelRates();
      expect(rates).toHaveLength(3);
      expect(rates.map((r) => r.buyValue)).toEqual([400, 450, 500]);
      expect(rates.map((r) => r.sellValue)).toEqual([400, 450, 500]);
      expect(rates.every((r) => r.method === SalePaymentMethod.Efectivo)).toBe(true);
      expect(rates.every((r) => r.currency === Currency.CUP)).toBe(true);
      // effectiveFrom = the FIRST day of each run, at local midnight.
      expect(rates.map((r) => toLocalDayKey(r.effectiveFrom))).toEqual([
        '2026-09-01',
        '2026-09-03',
        '2026-09-06',
      ]);
      expect(rates.every((r) => r.effectiveFrom.getHours() === 0)).toBe(true);

      expect(localStorage.getItem(REGISTER_KEY)).toBeNull();
      expect(localStorage.getItem(ANCHOR_KEY)).toBeNull();
    });

    it('covers every day of the register — no history is lost to the run grouping', () => {
      const rows = [day('2026-09-01', 400), day('2026-09-02', 400), day('2026-09-03', 450)];
      seedRegister(rows);

      run(true);

      // Each run row stands for every day it spans: 2 days at 400 + 1 day at 450.
      const daysCovered = [
        ...readChannelRates(),
      ].reduce((total, rate) => total + rows.filter((r) => r.value === rate.buyValue).length, 0);
      expect(daysCovered).toBe(rows.length);
    });

    it('a GAP in the days breaks a run even when the value is identical', () => {
      seedRegister([day('2026-09-01', 400), day('2026-09-05', 400)]);

      expect(run(true)).toBe('migrated');

      const rates = readChannelRates();
      expect(rates).toHaveLength(2);
      expect(rates.map((r) => toLocalDayKey(r.effectiveFrom))).toEqual([
        '2026-09-01',
        '2026-09-05',
      ]);
    });

    it('sorts ascending by date even when the stored rows are out of order', () => {
      seedRegister([day('2026-09-03', 450), day('2026-09-01', 400), day('2026-09-02', 400)]);

      expect(run(true)).toBe('migrated');

      expect(readChannelRates().map((r) => r.buyValue)).toEqual([400, 450]);
    });

    it('revives date strings written by an older reader', () => {
      localStorage.setItem(
        REGISTER_KEY,
        JSON.stringify([{ id: '2026-09-01', date: '2026-09-01T00:00:00.000Z', value: 400 }]),
      );

      expect(run(true)).toBe('migrated');

      expect(readChannelRates()).toHaveLength(1);
      expect(readChannelRates()[0].effectiveFrom).toBeInstanceOf(Date);
    });

    it('an existing row on ANOTHER channel does not block the migration', () => {
      const svc = new ChannelRateOfflineService(STORE);
      svc.registerRate({
        method: SalePaymentMethod.Zelle,
        currency: Currency.CUP,
        buyValue: 400,
        sellValue: 400,
        effectiveFrom: new Date(2026, 8, 1),
      });
      seedRegister([day('2026-09-01', 400)]);

      expect(run(true)).toBe('migrated');

      const rates = readChannelRates();
      expect(rates).toHaveLength(2);
      expect(rates.some((r) => r.method === SalePaymentMethod.Efectivo)).toBe(true);
    });
  });

  describe('wiped without MultiMonedas', () => {
    it('wipes the register and the anchor and writes no channel rate', () => {
      localStorage.setItem(ANCHOR_KEY, '2026-09-01');
      seedRegister([day('2026-09-01', 400), day('2026-09-02', 450)]);

      expect(run(false)).toBe('wiped-without-multimonedas');

      expect(localStorage.getItem(REGISTER_KEY)).toBeNull();
      expect(localStorage.getItem(ANCHOR_KEY)).toBeNull();
      expect(readChannelRates()).toEqual([]);
    });
  });

  describe('skipped on conflict — an existing Efectivo/CUP row wins', () => {
    it('writes NOTHING, leaves the existing rows untouched, and still wipes the register', () => {
      const svc = new ChannelRateOfflineService(STORE);
      const existing = svc.registerRate({
        method: SalePaymentMethod.Efectivo,
        currency: Currency.CUP,
        buyValue: 999,
        sellValue: 999,
        effectiveFrom: new Date(2026, 7, 1),
      });
      localStorage.setItem(ANCHOR_KEY, '2026-09-01');
      seedRegister([day('2026-09-01', 400), day('2026-09-02', 450)]);

      expect(run(true)).toBe('skipped-conflict');

      const rates = readChannelRates();
      expect(rates).toHaveLength(1);
      expect(rates[0].id).toBe(existing.data?.id);
      expect(rates[0].buyValue).toBe(999);
      expect(rates[0].effectiveFrom).toEqual(new Date(2026, 7, 1));

      expect(localStorage.getItem(REGISTER_KEY)).toBeNull();
      expect(localStorage.getItem(ANCHOR_KEY)).toBeNull();
    });

    it('a DEACTIVATED Efectivo/CUP row still counts as a conflict', () => {
      const svc = new ChannelRateOfflineService(STORE);
      const existing = svc.registerRate({
        method: SalePaymentMethod.Efectivo,
        currency: Currency.CUP,
        buyValue: 999,
        sellValue: 999,
        effectiveFrom: new Date(2026, 7, 1),
      });
      svc.setChannelRateActive(existing.data?.id ?? '', false);
      seedRegister([day('2026-09-01', 400)]);

      expect(run(true)).toBe('skipped-conflict');

      expect(readChannelRates()).toHaveLength(1);
    });
  });

  describe('never destroys what it did not migrate', () => {
    it('surfaces an unreadable register and leaves the bytes in place', () => {
      localStorage.setItem(ANCHOR_KEY, '2026-09-01');
      localStorage.setItem(REGISTER_KEY, '{ this is not json');

      expect(() => run(true)).toThrow();

      expect(localStorage.getItem(REGISTER_KEY)).toBe('{ this is not json');
      expect(localStorage.getItem(ANCHOR_KEY)).toBe('2026-09-01');
      expect(readChannelRates()).toEqual([]);
    });

    it('refuses to wipe a register carrying a value the destination cannot store', () => {
      localStorage.setItem(ANCHOR_KEY, '2026-09-01');
      seedRegister([day('2026-09-01', 400), day('2026-09-02', 0)]);

      expect(() => run(true)).toThrow();

      // No half-written history, and the register is still there to be inspected.
      expect(readChannelRates()).toEqual([]);
      expect(readRegister()).toHaveLength(2);
      expect(localStorage.getItem(ANCHOR_KEY)).toBe('2026-09-01');
    });
  });
});
