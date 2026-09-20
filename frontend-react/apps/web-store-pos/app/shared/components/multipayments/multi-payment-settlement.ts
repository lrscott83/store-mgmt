import {
  RATE_MICRO,
  convertPaymentAmount,
  resolveChannelRate,
  summarizePayments,
} from '@store-mgmt/domain';
import type { BaseError, ChannelRate, Currency, OrderPayment } from '@store-mgmt/domain';
import { round2 } from '~/shared/lib/money';
import type { MultiPaymentRow } from './multi-payment-list';

/**
 * multipayments (plan 2026-09-18, T7 wiring) — turns the editable rows of
 * `MultiPaymentList` into the persisted `OrderPayment` shape and reports whether
 * the sale is covered. The cart submit guard uses the same result the list uses
 * for its own settle guard, so the two can never disagree.
 *
 * Mirrors the list's own evaluation: rows with a non-positive amount are skipped
 * (never sent to the domain tally) and a row that cannot be converted is a typed
 * error — never a silent 0.
 *
 * UNIT BOUNDARY (ratified owner decision A, 2026-09-18): rows carry amounts in
 * currency UNITS. The domain conversion helpers require integer CENTS, so the
 * math runs in cents internally, but the persisted `OrderPayment` is written
 * back in UNITS — `amount` is the row's own amount in its currency's units and
 * `amountInOrderCurrency` is the converted amount in order-currency UNITS (the
 * same unit as `Order.total`, backend `decimal(18,2)`). `rateApplied` is the
 * source channel's moneda-por-USD rate with 6 decimals, matching
 * `OrderPayment`'s contract. A same-currency payment is an exact identity, so its
 * frozen rate is 1 with no provenance.
 */
export interface MultiPaymentSettlement {
  /** Usable rows converted to the persisted shape, in order. */
  readonly orderPayments: OrderPayment[];
  /** Remaining amount in order-currency CENTS; 0 means fully covered. */
  readonly remainingCents: number;
  /** First typed conversion error, or null when every usable row converted. */
  readonly firstError: BaseError | null;
}

export function settleMultiPayments(
  rows: readonly MultiPaymentRow[],
  orderCurrency: Currency,
  totalUnits: number,
  rates: readonly ChannelRate[],
  at: Date,
): MultiPaymentSettlement {
  const orderPayments: OrderPayment[] = [];
  // Parallel to `orderPayments`: the converted amounts in integer CENTS, kept
  // internal so the domain tally never receives the persisted UNITS.
  const convertedCents: number[] = [];
  let firstError: BaseError | null = null;

  for (const row of rows) {
    if (!Number.isFinite(row.amount) || row.amount <= 0) continue;

    // Inbound boundary: units -> cents, exactly as the list does.
    const amountCents = Math.round(row.amount * 100);
    const conversion = convertPaymentAmount(
      amountCents,
      row.method,
      row.currency,
      orderCurrency,
      rates,
      at,
    );
    if (!conversion.succeeded || conversion.data === undefined) {
      if (firstError === null) firstError = conversion.errors[0] ?? null;
      continue;
    }

    const sameCurrency = Number(row.currency) === Number(orderCurrency);
    const resolved = sameCurrency
      ? undefined
      : resolveChannelRate(rates, row.method, row.currency, at);
    const rate = resolved?.succeeded ? resolved.data : undefined;

    orderPayments.push({
      method: row.method,
      currency: row.currency,
      // Outbound boundary: persist UNITS, the same unit as Order.total.
      amount: row.amount,
      rateApplied: rate ? rate.value / RATE_MICRO : 1,
      rateMethod: rate?.method ?? null,
      rateCurrency: rate?.currency ?? null,
      rateEffectiveFrom: rate?.effectiveFrom ?? null,
      amountInOrderCurrency: round2(conversion.data / 100),
    });
    convertedCents.push(conversion.data);
  }

  const summary = summarizePayments(
    Math.round(totalUnits * 100),
    convertedCents.map((amountInOrderCurrency) => ({ amountInOrderCurrency })),
  );

  return { orderPayments, remainingCents: summary.remaining, firstError };
}
