import { DataResult, Result, resolveChannelRate } from '@store-mgmt/domain';
import type {
  BaseError,
  ChannelRate,
  Currency,
  ResolvedChannelRate,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';

/**
 * Errors of the offline channel-rate register. Lives at the persistence
 * boundary (not in the domain error catalogue) because it is a write guard,
 * not a conversion rule: `resolveChannelRate` never validates its input —
 * this service does. Mirrors the `SynchronizerErrors` app-layer constant
 * pattern.
 */
export const ChannelRateOfflineErrors = {
  InvalidValue: {
    code: 'ChannelRate.InvalidValue',
    description: 'El valor de la tasa debe ser un número mayor que cero.',
  },
} as const satisfies Record<string, BaseError>;

/** Input of `registerRate` — the service assigns the id and the audit date. */
export interface RegisterChannelRateInput {
  method: SalePaymentMethod;
  currency: Currency;
  /** Units of `currency` per 1 USD (moneda-por-USD). */
  value: number;
  effectiveFrom: Date;
}

/**
 * ChannelRateOfflineService — per-store persistence of the append-only
 * channel-rate register (multipayments), inlined with the same shape as
 * `ExchangeRateOfflineService`/`ExpenseOfflineService`: encrypted plain-array
 * wire format, per-instance cache reloaded when empty or the store key
 * changes, auto-init on a genuinely empty read, date revival on load, and a
 * `readEntityOrThrow` read seam that returns `[]` only when the key is
 * genuinely absent but THROWS when the stored bytes are unreadable.
 *
 * APPEND-ONLY BY CONTRACT: there is no update and no delete method, on
 * purpose. A new effective moment is a NEW row; historical rows stay exactly
 * as written, and the import seam skips ids that are already present instead
 * of overwriting them.
 */
export class ChannelRateOfflineService {
  private rates: ChannelRate[] | null = null;
  private lastRatesKey: string | undefined;

  constructor(private readonly storeId: string) {}

  getStorageChannelRates(): ChannelRate[] {
    if (
      !this.rates ||
      this.rates.length === 0 ||
      this.getCurrentStorageKey() !== this.lastRatesKey
    ) {
      this.rates = this.getRatesFromLocalStorage();
    }
    return this.rates;
  }

  /** Raw stored-JSON read for the sync export (mirrors the exchange-rate reader seam). */
  getStorageChannelRatesJson(): string {
    return JSON.stringify(this.getStorageChannelRates());
  }

  /**
   * Appends a new rate row. A non-finite or non-positive `value` is rejected
   * with a failed `DataResult` (never throws, never writes). The id is a
   * fresh UUID and `createdDate` is stamped here — the register is
   * write-once.
   */
  registerRate(input: RegisterChannelRateInput): DataResult<ChannelRate> {
    if (!Number.isFinite(input.value) || input.value <= 0) {
      return new DataResult<ChannelRate>(undefined, false, [
        ChannelRateOfflineErrors.InvalidValue,
      ]);
    }

    const rate: ChannelRate = {
      id: crypto.randomUUID(),
      method: input.method,
      currency: input.currency,
      value: input.value,
      effectiveFrom: new Date(input.effectiveFrom),
      createdDate: new Date(),
    };
    this.getStorageChannelRates().push(rate);
    this.setRatesLocalStorage(this.rates!);
    return new DataResult<ChannelRate>(rate, true, []);
  }

  /**
   * The rate in force for `method` + `currency` at `at`, resolved by the
   * domain cascade (exact channel → same currency any method → synthetic USD
   * pivot → typed `ChannelRateErrors.RateNotFound`). Delegation only — the
   * register never substitutes a rate of its own.
   */
  getRateAt(
    method: SalePaymentMethod,
    currency: Currency,
    at: Date,
  ): DataResult<ResolvedChannelRate> {
    return resolveChannelRate(this.getStorageChannelRates(), method, currency, at);
  }

  /**
   * Import seam — appends a row (sync import). An invalid `value` (non-finite
   * or non-positive) is rejected with a failed `Result` and nothing is
   * written, mirroring `registerRate`. Missing ids are derived
   * deterministically from the channel + value + effective moment so
   * re-importing the same archive is a no-op; an id already present is
   * skipped, never overwritten. Incoming date fields are revived.
   */
  addImportedChannelRate(rate: ChannelRate): Result {
    if (!Number.isFinite(rate.value) || rate.value <= 0) {
      return Result.Failure([ChannelRateOfflineErrors.InvalidValue]);
    }

    const revived = this.reviveRateDates(rate);
    const id = revived.id ?? this.deriveRateId(revived);
    const rates = this.getStorageChannelRates();
    if (rates.some((r) => r.id === id)) return Result.Success();

    rates.push({ ...revived, id });
    this.setRatesLocalStorage(this.rates!);
    return Result.Success();
  }

  /**
   * Deterministic fallback id for rows that arrive without one:
   * `${method}-${currency}-${value}-${effectiveFrom ISO}`. The value is part
   * of the identity so two archive rows for the same channel + moment with
   * different values are preserved instead of collapsing into one. Mirrored
   * by the synchronizer's pre-check so both agree on what "already present"
   * means.
   */
  private deriveRateId(rate: ChannelRate): string {
    return `${rate.method}-${rate.currency}-${rate.value}-${rate.effectiveFrom.toISOString()}`;
  }

  private setRatesLocalStorage(rates: ChannelRate[]): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(rates)));
  }

  private getStorageKey(): string {
    this.lastRatesKey = this.getCurrentStorageKey();
    return this.lastRatesKey;
  }

  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('channelRates', this.storeId);
  }

  private getRatesFromLocalStorage(): ChannelRate[] {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json ? (JSON.parse(json) as ChannelRate[]).map((r) => this.reviveRateDates(r)) : null,
    );
    if (stored) return stored;

    this.setRatesLocalStorage([]);
    return [];
  }

  private reviveRateDates(rate: ChannelRate): ChannelRate {
    const revived = { ...rate } as Record<string, unknown>;
    for (const field of ['effectiveFrom', 'createdDate']) {
      const value = revived[field];
      if (typeof value === 'string') revived[field] = new Date(value);
    }
    return revived as unknown as ChannelRate;
  }
}
