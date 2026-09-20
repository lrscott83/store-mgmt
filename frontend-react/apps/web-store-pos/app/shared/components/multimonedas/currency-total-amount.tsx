import type { ReactElement } from 'react';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import {
  groupAmountsByCurrency,
  orderCurrencyTotals,
  type CurrencyAmount,
} from '~/shared/lib/currency-totals';

/**
 * "Primary amount + per-currency chips" — the shared presentational piece the
 * non-dashboard views reuse to show a total that NEVER mixes currencies when the
 * MultiMonedas module is active (docs/plans/2026-09-17-multimonedas-module-plan.md
 * §6). It renders FRAGMENT CONTENT on purpose: each view keeps its own outer
 * `<span className=… whitespace-nowrap>`, so with the gate OFF the DOM is
 * byte-identical to the legacy single-`formatCurrency(total)` output.
 *
 * The gate does NOT live here either: the view decides (`hasMultiMonedasAvailable`)
 * and passes `multiMonedas`. Grouping/order is delegated to `currency-totals`.
 */
export interface CurrencyTotalAmountProps {
  /** The legacy single total — rendered verbatim when `multiMonedas` is false. */
  legacyTotal: number;
  /** One entry per money row; `currency` absent = CUP (DEFAULT_CURRENCY). */
  entries: readonly CurrencyAmount[];
  /** When false, this component degrades to the exact legacy single-total output. */
  multiMonedas: boolean;
}

export function CurrencyTotalAmount({
  legacyTotal,
  entries,
  multiMonedas,
}: CurrencyTotalAmountProps): ReactElement {
  if (!multiMonedas) return <>{formatCurrency(legacyTotal)}</>;

  const totals = orderCurrencyTotals(groupAmountsByCurrency(entries));
  if (totals.length === 0) return <>{formatCurrency(legacyTotal)}</>;

  const [primary, ...rest] = totals;
  return (
    <>
      <span className="whitespace-nowrap">
        {formatMoneyWithCurrency(primary.amount, primary.currency)}
      </span>
      {rest.length > 0 && (
        <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle">
          {rest.map((total) => (
            <span
              key={total.currency}
              className="rounded-full border border-border px-1.5 py-0.5 text-xs font-normal text-text-muted whitespace-nowrap"
            >
              {formatMoneyWithCurrency(total.amount, total.currency)}
            </span>
          ))}
        </span>
      )}
    </>
  );
}
