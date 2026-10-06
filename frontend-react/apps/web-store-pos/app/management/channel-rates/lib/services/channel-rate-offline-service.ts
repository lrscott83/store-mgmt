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
import {
  notifyDataChanged,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

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
  RateNotFound: {
    code: 'ChannelRate.RowNotFound',
    description: 'No se encontró la tasa solicitada.',
  },
} as const satisfies Record<string, BaseError>;

/** Input of `registerRate` — the service assigns the id and the audit date. */
export interface RegisterChannelRateInput {
  method: SalePaymentMethod;
  currency: Currency;
  /** Buy value: units of `currency` per 1 USD (bank buys currency). */
  buyValue: number;
  /** Sell value: units of `currency` per 1 USD (bank sells currency). */
  sellValue: number;
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
  /**
   * Global data revision at the moment `rates` was loaded from storage. A HIGHER current
   * revision means another instance mutated store-local data and this snapshot is stale,
   * so it must be re-read — hence the `>` comparison and not `!==`: the instance that just
   * wrote stamps this with the revision its own pending notice will produce, so it must
   * never look stale relative to its own write. `?? -1` makes "never stamped" always
   * stale, forcing the first read. Read imperatively from the zustand store — a service
   * must not subscribe to it.
   */
  private ratesRevision: number | undefined;

  constructor(private readonly storeId: string) {}

  getStorageChannelRates(): ChannelRate[] {
    const revision = useDataRevisionStore.getState().revision;
    if (
      !this.rates ||
      this.rates.length === 0 ||
      this.getCurrentStorageKey() !== this.lastRatesKey ||
      revision > (this.ratesRevision ?? -1)
    ) {
      this.rates = this.getRatesFromLocalStorage();
      this.ratesRevision = revision;
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
    if (!Number.isFinite(input.buyValue) || input.buyValue <= 0) {
      return new DataResult<ChannelRate>(undefined, false, [
        ChannelRateOfflineErrors.InvalidValue,
      ]);
    }
    if (!Number.isFinite(input.sellValue) || input.sellValue <= 0) {
      return new DataResult<ChannelRate>(undefined, false, [
        ChannelRateOfflineErrors.InvalidValue,
      ]);
    }

    const rate: ChannelRate = {
      id: crypto.randomUUID(),
      method: input.method,
      currency: input.currency,
      buyValue: input.buyValue,
      sellValue: input.sellValue,
      effectiveFrom: new Date(input.effectiveFrom),
      createdDate: new Date(),
    };
    this.getStorageChannelRates().push(rate);
    this.setRatesLocalStorage(this.rates!);
    return new DataResult<ChannelRate>(rate, true, []);
  }

  /**
   * Sets the active state of a stored row by id (T19b). This is the ONE
   * mutation of the register, and it is deliberately narrow: it changes only
   * `isActive`, never the channel, value or effective moment — the append-only
   * contract protects a rate's economic content, not a reversible usability
   * flag. A row written before this field existed carries no `isActive` and is
   * treated as active; reactivating writes `isActive: true` explicitly. An
   * unknown id writes nothing and returns a failed `Result`.
   */
  setChannelRateActive(id: string, isActive: boolean): Result {
    const rates = this.getStorageChannelRates();
    const index = rates.findIndex((rate) => rate.id === id);
    if (index < 0) {
      return Result.Failure([ChannelRateOfflineErrors.RateNotFound]);
    }

    rates[index] = { ...rates[index], isActive };
    this.setRatesLocalStorage(rates);
    return Result.Success();
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
    const revived = this.reviveRateDates(rate);
    // Migration: rows written before buy/sell existed carry only `value`.
    // Set buyValue = sellValue = value so old data converts correctly.
    if (revived.buyValue === undefined && revived.sellValue === undefined) {
      const legacyValue = (revived as unknown as { value?: number }).value;
      if (!Number.isFinite(legacyValue) || legacyValue === undefined || legacyValue <= 0) {
        return Result.Failure([ChannelRateOfflineErrors.InvalidValue]);
      }
      revived.buyValue = legacyValue;
      revived.sellValue = legacyValue;
    }
    if (!Number.isFinite(revived.buyValue) || revived.buyValue <= 0) {
      return Result.Failure([ChannelRateOfflineErrors.InvalidValue]);
    }
    if (!Number.isFinite(revived.sellValue) || revived.sellValue <= 0) {
      return Result.Failure([ChannelRateOfflineErrors.InvalidValue]);
    }

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
    return `${rate.method}-${rate.currency}-${rate.buyValue}-${rate.sellValue}-${rate.effectiveFrom.toISOString()}`;
  }

  /**
   * The ONLY `localStorage.setItem` in this class, so every write — append,
   * activate/deactivate and import — passes through here. Notifying at this door is what
   * makes "a write cannot happen without a notice" structural instead of a rule each
   * mutation has to remember. Stamping with the returned revision keeps THIS instance
   * from re-reading the register it just persisted, while every other instance still
   * carries the previous stamp and reloads.
   *
   * `initializing` is the ONE case that does not notify: seeding a genuinely empty store
   * is not a change to data that anyone could be holding a stale photo of — there was
   * nothing there. Notifying would bump the revision, invalidate the very cache the
   * auto-init just filled, and make the next read decrypt the whole entity again, on
   * every cold instance of every service.
   */
  private setRatesLocalStorage(rates: ChannelRate[], initializing = false): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(rates)));
    if (initializing) return;
    this.ratesRevision = notifyDataChanged();
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

    this.setRatesLocalStorage([], true);
    return [];
  }

  private reviveRateDates(rate: ChannelRate): ChannelRate {
    const revived = { ...rate } as Record<string, unknown>;
    for (const field of ['effectiveFrom', 'createdDate']) {
      const value = revived[field];
      if (typeof value === 'string') revived[field] = new Date(value);
    }
    // Migration: rows written before buy/sell existed carry only `value`.
    if (revived.buyValue === undefined && revived.sellValue === undefined) {
      const legacyValue = revived.value;
      if (typeof legacyValue === 'number') {
        revived.buyValue = legacyValue;
        revived.sellValue = legacyValue;
      }
    }
    return revived as unknown as ChannelRate;
  }
}
