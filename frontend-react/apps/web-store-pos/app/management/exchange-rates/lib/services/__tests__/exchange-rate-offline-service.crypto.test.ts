import { beforeEach, describe, expect, it } from 'vitest';
import { fromLocalDayKey } from '~/shared/lib/date-utils';
import { ExchangeRateOfflineService } from '../exchange-rate-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-exchangeRates-${storeId}`;

function v2Bundle(): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 999_999_999_999,
    formatVersion: 2,
    storeId,
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: storeId,
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
        wrappedDek: 'ct',
        wrapSalt: 'salt',
        wrapIv: 'iv',
      },
    ],
  };
}

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

describe('exchange-rate-offline-service — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', () => {
    const service = new ExchangeRateOfflineService(storeId);
    expect(service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 3))).toBe(3);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();

    expect(service.getStorageExchangeRates()).toHaveLength(3);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext, service read round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const service = new ExchangeRateOfflineService(storeId);
    expect(service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 3))).toBe(3);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    const fresh = new ExchangeRateOfflineService(storeId);
    const rates = fresh.getStorageExchangeRates();
    expect(rates).toHaveLength(3);
    expect(rates.map((rate) => rate.id)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(rates[0].value).toBe(1);
    expect(rates[0].date).toBeInstanceOf(Date);
    expect(rates[0].date.getTime()).toBe(fromLocalDayKey('2026-08-01').getTime());
    expect(fresh.getStorageExchangeRatesJson()).not.toContain('enc:v1:');
  });

  it('the empty-register auto-init stays the plaintext "[]" sentinel even with a DEK (empty payload protects nothing)', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const service = new ExchangeRateOfflineService(storeId);
    expect(service.getStorageExchangeRates()).toEqual([]);

    expect(localStorage.getItem(storageKey)).toBe('[]');
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    new ExchangeRateOfflineService(storeId).backfillDailyRecords(
      localDate(2026, 8, 1),
      localDate(2026, 8, 3),
    );

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned
    const lockedService = new ExchangeRateOfflineService(storeId);
    expect(() => lockedService.getStorageExchangeRates()).toThrow(MissingDataKeyError);
    expect(() => lockedService.getStorageExchangeRatesJson()).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });

  it('a provisioned-but-locked write throws on the encrypt seam, ciphertext unchanged (by design)', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const service = new ExchangeRateOfflineService(storeId);
    service.backfillDailyRecords(localDate(2026, 8, 1), localDate(2026, 8, 3));

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned; writing plaintext over ciphertext is impossible
    expect(() => service.updateValue('2026-08-01', 500)).toThrow(MissingDataKeyError);
    expect(() =>
      service.addImportedExchangeRate({
        id: '2026-08-04',
        date: localDate(2026, 8, 4),
        value: 1,
      }),
    ).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });
});
