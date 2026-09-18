import { divideHalfUp } from './channel-conversion';

/**
 * multipayments (plan 2026-09-18) — payment tally helpers (ratified decision 5:
 * overpayment is allowed and shown as change; a sale never closes below the
 * total; no credit). Amounts are integer cents; every result is rounded HALF-UP
 * at 2dp (cents) exactly once, at the end.
 */

/** Typed error shape for invalid tally input (same conventions as domain errors). */
export const PaymentTallyErrors = {
  NonPositiveAmount: {
    code: 'PaymentTally.NonPositiveAmount',
    description: 'El monto del pago debe ser mayor que cero.',
  },
} as const;

function roundCentsHalfUp(value: number): number {
  return divideHalfUp(value * 100, 100);
}

/**
 * Applies one incoming payment against the remaining amount.
 * `appliedAmount = min(remaining, incoming)`; the overflow is `changeAmount`.
 * A non-positive incoming amount is rejected (throws).
 */
export function applyPayment(
  remaining: number,
  incoming: number,
): { appliedAmount: number; changeAmount: number } {
  if (incoming <= 0) {
    throw new Error(
      `${PaymentTallyErrors.NonPositiveAmount.code}: ${PaymentTallyErrors.NonPositiveAmount.description}`,
    );
  }
  const appliedAmount = Math.min(remaining, incoming);
  return { appliedAmount, changeAmount: incoming - appliedAmount };
}

/**
 * Walks payments in order against a running remaining amount: each payment is
 * applied up to the remaining, and any overflow accumulates as change. `paid`
 * is the sum of all applied amounts; all three results are rounded HALF-UP at
 * 2dp (cents) once at the end.
 *
 * One rule for the module: a non-positive payment amount is rejected with the
 * typed `PaymentTallyErrors.NonPositiveAmount` error via `applyPayment` — never
 * silently ignored.
 */
export function summarizePayments(
  total: number,
  payments: Array<{ amountInOrderCurrency: number }>,
): { paid: number; remaining: number; change: number } {
  let remaining = total;
  let paid = 0;
  let change = 0;

  for (const payment of payments) {
    const { appliedAmount, changeAmount } = applyPayment(remaining, payment.amountInOrderCurrency);
    remaining -= appliedAmount;
    paid += appliedAmount;
    change += changeAmount;
  }

  return {
    paid: roundCentsHalfUp(paid),
    remaining: roundCentsHalfUp(remaining),
    change: roundCentsHalfUp(change),
  };
}
