import { beforeEach, describe, expect, it } from 'vitest';
import { ExchangeRateErrors } from '@store-mgmt/domain';
import { fromLocalDayKey } from '~/shared/lib/date-utils';
import { ExchangeRateOfflineService } from '../exchange-rate-offline-service';

const storeId = 'test-store';

/** Local-midnight helper the tests use as the backfill `today` anchor. */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

describe('ExchangeRateOfflineService', () => {
  let service: ExchangeRateOfflineService;

  beforeEach(() => {
    localStorage.clear();
    service = new ExchangeRateOfflineService(storeId);
  });

  // ─── read ───
  describe('getStorageExchangeRates', () => {
    it('returns an empty array when the store has no records', () => {
      expect(service.getStorageExchangeRates()).toEqual([]);
    });

    it('persists and revives records across instances', () => {
      const added = service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 3));
      expect(added).toBe(3);

      const fresh = new ExchangeRateOfflineService(storeId);
      const rates = fresh.getStorageExchangeRates();
      expect(rates).toHaveLength(3);
      // date is revived to a real Date instance.
      expect(rates[0].date).toBeInstanceOf(Date);
      expect(rates[0].date.getTime()).toBe(fromLocalDayKey('2026-08-01').getTime());
    });
  });

  // ─── backfillDailyRecords ───
  describe('backfillDailyRecords', () => {
    it('creates one record per day from the anchor through today, defaulting to 1', () => {
      const added = service.backfillDailyRecords(
        localDate(2026, 8, 1),
        localDate(2026, 8, 4),
      );
      expect(added).toBe(4);

      const rates = service.getStorageExchangeRates();
      expect(rates.map((r) => r.id)).toEqual([
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
        '2026-08-04',
      ]);
      for (const rate of rates) {
        expect(rate.value).toBe(1);
      }
    });

    it('carries the previous day value forward to each new day', () => {
      service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 1));
      const edited = service.updateValue('2026-08-01', 120);
      expect(edited.succeeded).toBe(true);

      const added = service.backfillDailyRecords(
        localDate(2026, 8, 1),
        localDate(2026, 8, 3),
      );
      expect(added).toBe(2);

      const rates = service.getStorageExchangeRates();
      expect(rates.map((r) => [r.id, r.value])).toEqual([
        ['2026-08-01', 120],
        ['2026-08-02', 120],
        ['2026-08-03', 120],
      ]);
    });

    it('an edit does NOT cascade to later already-created days; only the immediately previous day feeds a new record', () => {
      // 08-01..08-03 were auto-created with value 1 BEFORE the owner edited
      // 08-02 to 150. Per spec each new day copies the PREVIOUS day's value at
      // creation time, so the historical 08-03 stays 1 and the new 08-04/08-05
      // inherit from 08-03 — editing is per-day and never rewrites history.
      service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 3));
      service.updateValue('2026-08-02', 150);

      const added = service.backfillDailyRecords(
        localDate(2026, 8, 1),
        localDate(2026, 8, 5),
      );
      expect(added).toBe(2);

      const rates = service.getStorageExchangeRates();
      expect(rates.map((r) => [r.id, r.value])).toEqual([
        ['2026-08-01', 1],
        ['2026-08-02', 150],
        ['2026-08-03', 1],
        ['2026-08-04', 1],
        ['2026-08-05', 1],
      ]);
    });

    it('is idempotent: a second run adds nothing', () => {
      service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 3));
      const added = service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 3));
      expect(added).toBe(0);
      expect(service.getStorageExchangeRates()).toHaveLength(3);
    });

    it('extends backward to older records brought in by an import', () => {
      // Device B imported a backup whose earliest record predates this
      // device's anchor — backfill must keep that history contiguous.
      service.addImportedExchangeRate({
        id: '2026-07-30',
        date: fromLocalDayKey('2026-07-30'),
        value: 200,
      });

      const added = service.backfillDailyRecords(
        localDate(2026, 8, 1),
        localDate(2026, 8, 2),
      );
      expect(added).toBe(3);

      const rates = service.getStorageExchangeRates();
      expect(rates.map((r) => [r.id, r.value])).toEqual([
        ['2026-07-30', 200],
        ['2026-07-31', 200],
        ['2026-08-01', 200],
        ['2026-08-02', 200],
      ]);
    });

    it('does nothing when the anchor is in the future', () => {
      const added = service.backfillDailyRecords(
        localDate(2026, 9, 1),
        localDate(2026, 8, 1),
      );
      expect(added).toBe(0);
      expect(service.getStorageExchangeRates()).toEqual([]);
    });
  });

  // ─── updateValue ───
  describe('updateValue', () => {
    it('edits the value of an existing day and returns succeeded=true', () => {
      service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 2));
      const result = service.updateValue('2026-08-01', 125.5);

      expect(result.succeeded).toBe(true);
      expect(result.data?.value).toBe(125.5);
      expect(result.data?.updatedDate).toBeInstanceOf(Date);
      expect(result.data?.updatedByName).toBeDefined();
    });

    it('returns NotExists for an unknown day id and never throws', () => {
      const result = service.updateValue('1999-01-01', 10);
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([ExchangeRateErrors.NotExists]);
    });
  });

  // ─── import seams ───
  describe('addImportedExchangeRate / updateImportedExchangeRate', () => {
    it('appends an imported record', () => {
      const res = service.addImportedExchangeRate({
        id: '2026-08-01',
        date: fromLocalDayKey('2026-08-01'),
        value: 300,
      });
      expect(res.succeeded).toBe(true);
      expect(service.getStorageExchangeRates()).toHaveLength(1);
    });

    it('merges the value of an existing record by id (upsert on import)', () => {
      service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 1));
      const res = service.updateImportedExchangeRate({
        id: '2026-08-01',
        date: fromLocalDayKey('2026-08-01'),
        value: 320,
      });
      expect(res.succeeded).toBe(true);
      expect(service.getStorageExchangeRates()[0].value).toBe(320);
    });
  });
});
