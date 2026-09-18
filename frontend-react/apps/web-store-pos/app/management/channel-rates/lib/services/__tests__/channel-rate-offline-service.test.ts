import { beforeEach, describe, expect, it } from 'vitest';
import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import { ChannelRateOfflineErrors, ChannelRateOfflineService } from '../channel-rate-offline-service';

const storeId = 's1';
const storageKey = `lizoft.store-channelRates-${storeId}`;

function at(iso: string): Date {
  return new Date(iso);
}

function register(
  service: ChannelRateOfflineService,
  overrides: Partial<{
    method: SalePaymentMethod;
    currency: Currency;
    value: number;
    effectiveFrom: Date;
  }> = {},
) {
  return service.registerRate({
    method: SalePaymentMethod.Efectivo,
    currency: Currency.CUP,
    value: 700,
    effectiveFrom: at('2026-09-01T00:00:00.000Z'),
    ...overrides,
  });
}

describe('ChannelRateOfflineService', () => {
  let service: ChannelRateOfflineService;

  beforeEach(() => {
    localStorage.clear();
    service = new ChannelRateOfflineService(storeId);
  });

  describe('registerRate (alta)', () => {
    it('appends a rate with a generated id, audit date and the requested channel', () => {
      const result = register(service, { value: 700, effectiveFrom: at('2026-09-01T00:00:00.000Z') });

      expect(result.succeeded).toBe(true);
      expect(result.data?.id).toBeTruthy();
      expect(result.data?.method).toBe(SalePaymentMethod.Efectivo);
      expect(result.data?.currency).toBe(Currency.CUP);
      expect(result.data?.value).toBe(700);
      expect(result.data?.effectiveFrom).toBeInstanceOf(Date);
      expect(result.data?.createdDate).toBeInstanceOf(Date);
      expect(service.getStorageChannelRates()).toHaveLength(1);
    });

    it('persists the row so a fresh instance reads it back', () => {
      register(service);

      const fresh = new ChannelRateOfflineService(storeId);
      expect(fresh.getStorageChannelRates()).toHaveLength(1);
      expect(fresh.getStorageChannelRates()[0].value).toBe(700);
    });

    it('rejects a non-positive or non-finite value without writing', () => {
      const zero = register(service, { value: 0 });
      expect(zero.succeeded).toBe(false);
      expect(zero.errors).toEqual([ChannelRateOfflineErrors.InvalidValue]);

      const negative = register(service, { value: -3 });
      expect(negative.succeeded).toBe(false);

      const infinite = register(service, { value: Number.POSITIVE_INFINITY });
      expect(infinite.succeeded).toBe(false);

      const nan = register(service, { value: Number.NaN });
      expect(nan.succeeded).toBe(false);

      expect(service.getStorageChannelRates()).toEqual([]);
    });
  });

  describe('getRateAt (tasa vigente por momento)', () => {
    it('picks the row in force at `at`, not the newest overall', () => {
      register(service, { value: 700, effectiveFrom: at('2026-09-01T00:00:00.000Z') });
      register(service, { value: 750, effectiveFrom: at('2026-09-10T00:00:00.000Z') });

      const early = service.getRateAt(
        SalePaymentMethod.Efectivo,
        Currency.CUP,
        at('2026-09-05T00:00:00.000Z'),
      );
      expect(early.succeeded).toBe(true);
      expect(early.data?.value).toBe(700 * 1_000_000);

      const late = service.getRateAt(
        SalePaymentMethod.Efectivo,
        Currency.CUP,
        at('2026-09-10T00:00:00.000Z'),
      );
      expect(late.data?.value).toBe(750 * 1_000_000);
    });

    it('returns the typed RateNotFound error when no row is in force yet', () => {
      register(service, { effectiveFrom: at('2026-09-10T00:00:00.000Z') });

      const result = service.getRateAt(
        SalePaymentMethod.Efectivo,
        Currency.CUP,
        at('2026-09-01T00:00:00.000Z'),
      );
      expect(result.succeeded).toBe(false);
      expect(result.errors[0].code).toBe('ChannelRate.RateNotFound');
    });

    it('falls back to the same currency of another channel', () => {
      register(service, {
        method: SalePaymentMethod.Zelle,
        currency: Currency.CUP,
        value: 720,
        effectiveFrom: at('2026-09-01T00:00:00.000Z'),
      });

      const result = service.getRateAt(
        SalePaymentMethod.Efectivo,
        Currency.CUP,
        at('2026-09-05T00:00:00.000Z'),
      );
      expect(result.succeeded).toBe(true);
      expect(result.data?.value).toBe(720 * 1_000_000);
      expect(result.data?.method).toBe(SalePaymentMethod.Zelle);
    });
  });

  describe('append-only', () => {
    it('keeps the first row untouched when a second rate for the same channel is registered', () => {
      const first = register(service, { value: 700, effectiveFrom: at('2026-09-01T00:00:00.000Z') });
      register(service, { value: 750, effectiveFrom: at('2026-09-10T00:00:00.000Z') });

      const rows = service.getStorageChannelRates();
      expect(rows).toHaveLength(2);
      const storedFirst = rows.find((r) => r.id === first.data!.id)!;
      expect(storedFirst.value).toBe(700);
      expect(storedFirst.effectiveFrom.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('does not expose update or delete methods', () => {
      const api = service as unknown as Record<string, unknown>;
      expect(api.update).toBeUndefined();
      expect(api.updateValue).toBeUndefined();
      expect(api.delete).toBeUndefined();
      expect(api.remove).toBeUndefined();
    });

    it('a rejected registration leaves existing rows byte-identical', () => {
      register(service);
      const rawBefore = localStorage.getItem(storageKey);

      register(service, { value: 0 });

      expect(localStorage.getItem(storageKey)).toBe(rawBefore);
    });
  });

  describe('addImportedChannelRate (import seam)', () => {
    it('appends a row and revives its date fields', () => {
      const result = service.addImportedChannelRate({
        id: 'imported-1',
        method: SalePaymentMethod.Zelle,
        currency: Currency.USD,
        value: 1,
        effectiveFrom: '2026-09-01T00:00:00.000Z' as unknown as Date,
        createdDate: '2026-09-01T00:00:00.000Z' as unknown as Date,
      });

      expect(result.succeeded).toBe(true);
      const rows = service.getStorageChannelRates();
      expect(rows).toHaveLength(1);
      expect(rows[0].effectiveFrom).toBeInstanceOf(Date);
      expect(rows[0].effectiveFrom.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(rows[0].createdDate).toBeInstanceOf(Date);
    });

    it('skips an id that is already present — no duplicate, no overwrite', () => {
      const first = register(service, { value: 700 });
      const rawBefore = localStorage.getItem(storageKey);

      const result = service.addImportedChannelRate({
        id: first.data!.id,
        method: SalePaymentMethod.Efectivo,
        currency: Currency.CUP,
        value: 999,
        effectiveFrom: at('2026-09-01T00:00:00.000Z'),
      });

      expect(result.succeeded).toBe(true);
      expect(service.getStorageChannelRates()).toHaveLength(1);
      expect(service.getStorageChannelRates()[0].value).toBe(700);
      expect(localStorage.getItem(storageKey)).toBe(rawBefore);
    });

    it('derives a deterministic id when the incoming row has none', () => {
      const row = {
        method: SalePaymentMethod.Transferencia,
        currency: Currency.MLC,
        value: 350,
        effectiveFrom: at('2026-09-01T00:00:00.000Z'),
      };

      service.addImportedChannelRate(row);
      service.addImportedChannelRate(row);

      const rows = service.getStorageChannelRates();
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('2-4-2026-09-01T00:00:00.000Z');
    });
  });

  describe('persistence and date revival across instances', () => {
    it('revives effectiveFrom/createdDate to Date on load', () => {
      register(service, { effectiveFrom: at('2026-09-01T12:30:00.000Z') });

      const fresh = new ChannelRateOfflineService(storeId);
      const row = fresh.getStorageChannelRates()[0];
      expect(row.effectiveFrom).toBeInstanceOf(Date);
      expect(row.effectiveFrom.toISOString()).toBe('2026-09-01T12:30:00.000Z');
      expect(row.createdDate).toBeInstanceOf(Date);
    });

    it('a fresh instance keeps registering on top of the stored rows', () => {
      register(service, { value: 700, effectiveFrom: at('2026-09-01T00:00:00.000Z') });

      const fresh = new ChannelRateOfflineService(storeId);
      register(fresh, { value: 750, effectiveFrom: at('2026-09-10T00:00:00.000Z') });

      // The writing instance sees its own append; a third instance loads both
      // rows from storage. (A non-empty in-memory cache is NOT invalidated by
      // another instance's write — the canonical exchange-rate service behaves
      // the same way; every route builds its own instance per operation.)
      expect(fresh.getStorageChannelRates()).toHaveLength(2);
      const third = new ChannelRateOfflineService(storeId);
      expect(third.getStorageChannelRates()).toHaveLength(2);
    });

    it('auto-initialises a genuinely absent key to an empty register', () => {
      expect(service.getStorageChannelRates()).toEqual([]);
      expect(localStorage.getItem(storageKey)).toBe('[]');
    });

    it('does not leak rows across stores', () => {
      register(service);

      const otherStore = new ChannelRateOfflineService('s2');
      expect(otherStore.getStorageChannelRates()).toEqual([]);
    });
  });
});
