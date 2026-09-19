import type { Currency, SalePaymentMethod } from '../enums';

/**
 * multipayments (plan 2026-09-18) — one payment line of a sale. The channel is
 * `method` + `currency`; `rateApplied` and its provenance fields are FROZEN at
 * payment time so later rate rows never rewrite history.
 *
 * UNIT CONTRACT (ratified owner decision A, 2026-09-18): the persisted amounts
 * are expressed in the order currency's UNITS with 2 decimals — the SAME unit as
 * `Order.total` and the backend mirror column (`decimal(18,2)`), NOT integer
 * cents. `amountInOrderCurrency` is the converted amount under the same rule.
 */
export interface OrderPayment {
  method: SalePaymentMethod; // channel = method + currency
  currency: Currency;
  amount: number; // in the payment's currency
  rateApplied: number; // frozen, moneda-por-USD
  rateMethod?: SalePaymentMethod | null;
  rateCurrency?: Currency | null;
  rateEffectiveFrom?: Date | null;
  amountInOrderCurrency: number; // frozen conversion into the order currency
}
