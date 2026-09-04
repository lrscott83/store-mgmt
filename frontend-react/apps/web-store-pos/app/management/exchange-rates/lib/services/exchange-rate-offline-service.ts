import { DataResult, ExchangeRateErrors, Result } from '@store-mgmt/domain';
import type { ExchangeRate } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import { fromLocalDayKey, startOfDay, toLocalDayKey } from '~/shared/lib/date-utils';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';

/** Default value of the register — 1 USD = 1 MN until the owner edits it. */
export const DEFAULT_EXCHANGE_RATE_VALUE = 1;

/**
 * ExchangeRateOfflineService — persistence inlined per-store (same shape as
 * ExpenseOfflineService: encrypted plain-array wire format, per-instance cache
 * reloaded when empty or the store key changes, auto-init on genuinely empty
 * read, date revival on load).
 *
 * The register is AUTO-GENERATED, never manually created/deleted:
 * - `backfillDailyRecords` guarantees one record per local calendar day from
 *   the owner's first-login anchor through today; each missing day inherits
 *   the previous day's value and the very first day defaults to 1
 *   (daily-exchange-rate). Idempotent and import-friendly: days already
 *   present (including ones brought in by a backup import) are never
 *   overwritten.
 * - The UI's only write operation is `updateValue` (edit the value of any
 *   day). There is no create/delete path on purpose.
 */
export class ExchangeRateOfflineService {
  private rates: ExchangeRate[] | null = null;
  private lastRatesKey: string | undefined;

  constructor(private readonly storeId: string) {}

  getStorageExchangeRates(): ExchangeRate[] {
    if (
      !this.rates ||
      this.rates.length === 0 ||
      this.getCurrentStorageKey() !== this.lastRatesKey
    ) {
      this.rates = this.getRatesFromLocalStorage();
    }
    return this.rates;
  }

  /** Raw stored-JSON read for the sync export (mirrors the expenses reader seam). */
  getStorageExchangeRatesJson(): string {
    return JSON.stringify(this.getStorageExchangeRates());
  }

  /**
   * Ensures the register is contiguous from `anchor` (the owner's first login
   * day on this device, or an earlier day when a backup import brought older
   * records) through `today`. Each missing day is appended with the previous
   * day's value (defaulting to 1 for the very first day). Returns how many
   * records were added; never touches existing records.
   */
  backfillDailyRecords(anchor: Date, today: Date = new Date()): number {
    const rates = this.getStorageExchangeRates();
    const byDay = new Map(rates.map((r) => [r.id, r]));

    let startKey = toLocalDayKey(startOfDay(anchor));
    if (rates.length > 0) {
      const earliest = rates.reduce((min, r) => (r.id < min ? r.id : min), rates[0].id);
      if (earliest < startKey) startKey = earliest;
    }
    const endKey = toLocalDayKey(today);
    if (startKey > endKey) return 0;

    let lastValue = DEFAULT_EXCHANGE_RATE_VALUE;
    let added = 0;
    const day = fromLocalDayKey(startKey);
    for (;;) {
      const dayKey = toLocalDayKey(day);
      if (dayKey > endKey) break;

      const existing = byDay.get(dayKey);
      if (existing) {
        lastValue = existing.value;
      } else {
        rates.push({ id: dayKey, date: startOfDay(day), value: lastValue });
        added++;
      }
      day.setDate(day.getDate() + 1);
    }

    if (added > 0) this.setRatesLocalStorage(rates);
    return added;
  }

  /**
   * Edits the value of an existing day's record. The register is
   * edit-only by design: a missing id yields a sync `DataResult(undefined,
   * false, [ExchangeRateErrors.NotExists])` (never throws), mirroring
   * ExpenseOfflineService.update.
   */
  updateValue(id: string, value: number): DataResult<ExchangeRate> {
    const existing = this.getStorageExchangeRates().find((r) => r.id === id);
    if (!existing) {
      return new DataResult<ExchangeRate>(undefined, false, [ExchangeRateErrors.NotExists]);
    }
    existing.value = value;
    existing.updatedDate = new Date();
    existing.updatedByName = getCurrentUserLogin();
    this.setRatesLocalStorage(this.rates!);
    return new DataResult<ExchangeRate>(existing, true, []);
  }

  /** Import seam — appends a record (sync import; mirror of addImportedExpense). */
  addImportedExchangeRate(rate: ExchangeRate): Result {
    const imported: ExchangeRate = { ...rate, date: new Date(rate.date) };
    this.getStorageExchangeRates().push(imported);
    this.setRatesLocalStorage(this.rates!);
    return Result.Success();
  }

  /** Import seam — merges value/audit fields onto the record with the same id. */
  updateImportedExchangeRate(imported: ExchangeRate): Result {
    const existing = this.getStorageExchangeRates().find((r) => r.id === imported.id);
    if (existing) {
      existing.date = new Date(imported.date);
      existing.value = imported.value;
      existing.updatedDate = imported.updatedDate;
      existing.updatedByName = imported.updatedByName;
      this.setRatesLocalStorage(this.rates!);
    }
    return Result.Success();
  }

  private setRatesLocalStorage(rates: ExchangeRate[]): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(rates)));
  }

  private getStorageKey(): string {
    this.lastRatesKey = this.getCurrentStorageKey();
    return this.lastRatesKey;
  }

  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('exchangeRates', this.storeId);
  }

  private getRatesFromLocalStorage(): ExchangeRate[] {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json ? (JSON.parse(json) as ExchangeRate[]).map((r) => this.reviveRateDates(r)) : null,
    );
    if (stored) return stored;

    this.setRatesLocalStorage([]);
    return [];
  }

  private reviveRateDates(rate: ExchangeRate): ExchangeRate {
    const revived = { ...rate } as Record<string, unknown>;
    for (const field of ['date', 'updatedDate']) {
      const value = revived[field];
      if (typeof value === 'string') revived[field] = new Date(value);
    }
    return revived as unknown as ExchangeRate;
  }
}
