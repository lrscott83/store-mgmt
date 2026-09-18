import type { Currency, SalePaymentMethod } from '../enums';

/**
 * multipayments (plan 2026-09-18) — append-only rate register, one row per
 * channel (method + currency) and effective moment. `value` is expressed as
 * units of `currency` per 1 USD (moneda-por-USD); the integer math in
 * `commons/channel-conversion.ts` normalizes it to millionths (value * 1e6).
 *
 * Rows are never edited or deleted: a new effective moment means a new row.
 */
export interface ChannelRate {
  id?: string;
  method: SalePaymentMethod;
  currency: Currency;
  /** Units of `currency` per 1 USD (moneda-por-USD). */
  value: number;
  effectiveFrom: Date;
  createdDate?: Date;
}
