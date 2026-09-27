import { Currency, DEFAULT_CURRENCY } from '@store-mgmt/domain';
import { currencyLabel } from '~/shared/lib/format-money-with-currency';

/**
 * Currency-aware monetary aggregation — the shared piece of the multi-currency
 * rule (docs/plans/2026-09-17-dashboard-moneda-plan.md):
 *
 *   - every amount carries its currency (`currency ?? DEFAULT_CURRENCY`);
 *   - amounts of DIFFERENT currencies are never summed together (the system has
 *     no conversion table, so a mixed sum would be meaningless);
 *   - display order is USD → EUR → CUP, then the remaining currencies by amount
 *     DESC (the "la de mayor monto" slot of the rule).
 *
 * The MultiMonedas gate does NOT live here: the view decides whether to apply
 * this grouping at all (`hasMultiMonedasAvailable(user)`); these helpers only
 * implement the grouping/order, so they stay testable and reusable.
 */

/** A monetary amount tagged with the currency it belongs to. */
export interface CurrencyAmount {
  amount: number;
  /** Absent = CUP (`DEFAULT_CURRENCY`), matching the domain default. */
  currency?: Currency;
}

/** A per-currency total — `amount` never mixes currencies. */
export interface CurrencyTotal {
  currency: Currency;
  /** Display code (USD, EUR, CUP, …) — the app's single mapping (`currencyLabel`). */
  label: string;
  amount: number;
}

/** Fixed priority of the primary currency (plan §2.2): USD → EUR → CUP. */
const CURRENCY_PRIORITY: readonly Currency[] = [Currency.USD, Currency.EUR, Currency.CUP];

/** `currency ?? DEFAULT_CURRENCY` — an absent currency is the domain default (CUP). */
export function resolveCurrency(currency?: Currency): Currency {
  return currency ?? DEFAULT_CURRENCY;
}

/**
 * Non-empty rows for display: an empty aggregation (no money at all) shows as a
 * single 0 CUP row instead of falling back to the legacy `$`-prefixed total.
 * Pass its result to `CurrencyTotalAmount`/`MultiStoreTotal` whenever the rows
 * come from a possibly-empty list (headers follow filters).
 */
export function nonEmptyCurrencyRows(entries: readonly CurrencyAmount[]): CurrencyAmount[] {
  return entries.length > 0 ? [...entries] : [{ amount: 0 }];
}

/**
 * Sums amounts by currency (`currency ?? DEFAULT_CURRENCY`). Each currency gets
 * its own row; rows keep first-seen order — run them through
 * {@link orderCurrencyTotals} for the agreed display order.
 */
export function groupAmountsByCurrency(entries: readonly CurrencyAmount[]): CurrencyTotal[] {
  const totals = new Map<Currency, number>();
  for (const entry of entries) {
    const currency = resolveCurrency(entry.currency);
    totals.set(currency, (totals.get(currency) ?? 0) + entry.amount);
  }
  return [...totals.entries()].map(([currency, amount]) => ({
    currency,
    label: currencyLabel(currency),
    amount,
  }));
}

/**
 * Display order of the agreed rule: the present currencies of USD → EUR → CUP
 * come first in that fixed order, then every remaining currency by amount DESC.
 * Ties keep the input order (stable tie-break), so the result is deterministic
 * for a given input.
 *
 * Generic over any `{ currency, amount }` row so callers can order richer rows
 * (per-currency KPI groups) without losing their extra fields.
 */
export function orderCurrencyTotals<T extends { currency: Currency; amount: number }>(
  totals: readonly T[],
): T[] {
  return totals
    .map((total, index) => ({ total, index }))
    .sort((a, b) => {
      const priority = priorityRank(a.total.currency) - priorityRank(b.total.currency);
      if (priority !== 0) return priority;
      return b.total.amount - a.total.amount || a.index - b.index;
    })
    .map((entry) => entry.total);
}

/** Rank of the fixed-priority currencies; every other currency shares the last rank. */
function priorityRank(currency: Currency): number {
  const index = CURRENCY_PRIORITY.indexOf(currency);
  return index === -1 ? CURRENCY_PRIORITY.length : index;
}

/**
 * Distinct currencies of `entries` in the agreed display order.
 *
 * Call this on the view's **UNFILTERED** data set: the filter's option list must
 * not depend on the filter's own selection, or picking a currency would shrink
 * the list and hide the control the user needs to switch back. Reuses
 * {@link groupAmountsByCurrency} + {@link orderCurrencyTotals}, so the order is
 * exactly USD → EUR → CUP → rest by amount DESC.
 */
export function presentCurrencies(entries: readonly CurrencyAmount[]): Currency[] {
  return orderCurrencyTotals(groupAmountsByCurrency(entries)).map((total) => total.currency);
}
