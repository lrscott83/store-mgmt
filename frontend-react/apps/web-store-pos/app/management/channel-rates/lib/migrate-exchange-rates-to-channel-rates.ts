import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';
import { addDays, fromLocalDayKey, startOfDay, toLocalDayKey } from '~/shared/lib/date-utils';
import { ChannelRateOfflineService } from './services/channel-rate-offline-service';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/**
 * What one call did. Every branch is observable so the caller (and the test)
 * can tell "migrated the history" from "there was nothing to do" — the last
 * two are the ones a silent `void` would hide.
 */
export type ExchangeRatesRetirementOutcome =
  | 'no-store'
  | 'empty'
  | 'migrated'
  | 'wiped-without-multimonedas'
  | 'skipped-conflict';

/** One row of the retired daily register, as it sits in localStorage. */
interface StoredDailyRate {
  id?: string;
  date: Date | string;
  value: number;
}

/** The same row with its date revived — what the grouping works on. */
interface DailyRate {
  date: Date;
  value: number;
}

/** A run of CONSECUTIVE days sharing one value — one destination row. */
interface Run {
  value: number;
  /** Local midnight of the run's FIRST day — the row's `effectiveFrom`. */
  firstDay: Date;
}

/**
 * Raised when the register holds a value the destination cannot store (the
 * channel-rate service rejects non-finite / non-positive values). Thrown
 * BEFORE any write so the migration either happens whole or not at all.
 */
export class ExchangeRatesRetirementError extends Error {
  readonly name = 'ExchangeRatesRetirementError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ExchangeRatesRetirementError.prototype);
  }
}

/**
 * Resolves the retired "Cambio USD a MN" daily register
 * (retire-exchange-rates-register). Four outcomes, no new `localStorage` key:
 *
 * - **migrated** — the store HAS MultiMonedas: every run of consecutive days
 *   sharing one value became one `ChannelRate` on Efectivo/CUP with
 *   `buyValue === sellValue` and `effectiveFrom` = the run's first day. The
 *   register is then wiped.
 * - **skipped-conflict** — the store ALREADY has an Efectivo/CUP row (the
 *   owner has been keeping rates by hand). Those rows are the real source of
 *   truth, so nothing is written and nothing is interleaved; the register is
 *   wiped anyway, exactly as spec'd.
 * - **wiped-without-multimonedas** — the store has NO MultiMonedas, so there
 *   is no register that can hold these values: the register is wiped.
 * - **empty** — nothing to do. An empty register IS the idempotency marker
 *   (there is no "already migrated" flag), so every later call short-circuits
 *   here.
 *
 * Safety contract: a read or write that throws leaves the register bytes and
 * the anchor exactly as they were and lets the error surface. The wipe happens
 * only after a completed read plus a completed write (or the explicit no-
 * MultiMonedas branch), so this never destroys history it failed to migrate.
 */
export function migrateExchangeRatesToChannelRates(
  storeId: string,
  hasMultiMonedas: boolean,
): ExchangeRatesRetirementOutcome {
  if (!storeId || storeId === EMPTY_GUID) return 'no-store';

  const register = readDailyRegister(storeId);
  if (register.length === 0) return 'empty';

  if (!hasMultiMonedas) {
    wipeDailyRegister(storeId);
    return 'wiped-without-multimonedas';
  }

  const runs = toRuns(register);
  const channelRates = new ChannelRateOfflineService(storeId);

  const existing = channelRates.getStorageChannelRates();
  const conflicts = existing.some(
    (rate) => rate.method === SalePaymentMethod.Efectivo && rate.currency === Currency.CUP,
  );
  if (conflicts) {
    wipeDailyRegister(storeId);
    return 'skipped-conflict';
  }

  for (const run of runs) {
    const result = channelRates.registerRate({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      buyValue: run.value,
      sellValue: run.value,
      effectiveFrom: run.firstDay,
    });
    if (!result.succeeded) {
      throw new ExchangeRatesRetirementError(
        `ChannelRateOfflineService rejected the migration of day ${toLocalDayKey(run.firstDay)}: ${result.errors[0]?.code ?? 'unknown'}`,
      );
    }
  }

  wipeDailyRegister(storeId);
  return 'migrated';
}

/**
 * Reads the raw register. Throws (via `readEntityOrThrow`) when the stored
 * bytes are unreadable or the data key is missing — the caller must NOT wipe
 * in that state.
 */
function readDailyRegister(storeId: string): DailyRate[] {
  const stored = readEntityOrThrow<StoredDailyRate[]>(
    StorageKeys.entityKey('exchangeRates', storeId),
    (json) => (json ? (JSON.parse(json) as StoredDailyRate[]) : null),
  );
  return (stored ?? []).map((row) => ({ date: new Date(row.date), value: row.value }));
}

/** Removes this store's register and the device-wide first-login anchor. */
function wipeDailyRegister(storeId: string): void {
  localStorage.removeItem(StorageKeys.entityKey('exchangeRates', storeId));
  localStorage.removeItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN);
}

/**
 * Collapses the register into one row per VALUE CHANGE: sorted ascending by
 * date, every maximal run of CONSECUTIVE days (the next row's local day key is
 * exactly one day after the previous row's) carrying the same value becomes a
 * single run anchored on its first day. A gap in the days breaks the run even
 * when the value repeats, because the register's own contract is one row per
 * calendar day.
 *
 * Every value is validated BEFORE any write, so a register carrying an
 * unstorable value aborts the whole migration instead of leaving half the
 * history in the destination and wiping the source.
 */
function toRuns(register: DailyRate[]): Run[] {
  const sorted = [...register].sort((a, b) => a.date.getTime() - b.date.getTime());
  const runs: Run[] = [];
  let previousDayKey: string | null = null;

  for (const row of sorted) {
    const day = startOfDay(row.date);
    const dayKey = toLocalDayKey(day);
    const continuesPreviousDay =
      previousDayKey !== null &&
      toLocalDayKey(addDays(fromLocalDayKey(previousDayKey), 1)) === dayKey;

    const current = runs[runs.length - 1];
    if (!current || !continuesPreviousDay || current.value !== row.value) {
      runs.push({ value: row.value, firstDay: day });
    }
    previousDayKey = dayKey;
  }

  for (const run of runs) {
    if (!Number.isFinite(run.value) || run.value <= 0) {
      throw new ExchangeRatesRetirementError(
        `The retired daily register holds a value the channel-rate register cannot store: ${String(run.value)}`,
      );
    }
  }

  return runs;
}
