import type { Currency, SalePaymentMethod } from '../enums';

/**
 * multipayments (plan 2026-09-18) — one payment line of a sale. The channel is
 * `method` + `currency`; `rateApplied` and its provenance fields are FROZEN at
 * payment time so later rate rows never rewrite history. Amounts are integer
 * cents; `amountInOrderCurrency` is the converted amount in the order currency.
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
