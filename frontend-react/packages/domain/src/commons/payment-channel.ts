import { Currency } from '../enums';
import type { SalePaymentMethod } from '../enums';
import { paymentMethodOptionsForCurrency } from './payment-pricing';

/**
 * payment-channels-and-multipayment (ODD 2026-09-23, T1) — canonical channel
 * catalogue.
 *
 * A CHANNEL is a (method, currency) pair that actually exists for a sale:
 * Zelle only pays in USD, MLC/CLA only move by Transferencia, EUR/CAD/MXN only
 * pay in cash. The valid pairs are exactly the per-currency catalogue already
 * owned by `paymentMethodOptionsForCurrency` — this module does NOT restate
 * that table, it enumerates it, so the two can never drift apart.
 */
export interface PaymentChannel {
  readonly method: SalePaymentMethod;
  readonly currency: Currency;
}

/** Numeric members of `Currency`, in enum value order (CUP, USD, EUR, CLA, MLC, CAD, MXN). */
const CATALOGUE_CURRENCIES: readonly Currency[] = Object.values(Currency).filter(
  (value): value is Currency => typeof value === 'number',
);

/** Every valid channel, grouped by currency in enum value order. */
export const PAYMENT_CHANNELS: readonly PaymentChannel[] = CATALOGUE_CURRENCIES.flatMap(
  (currency) => paymentMethodOptionsForCurrency(currency).map((method) => ({ method, currency })),
);

/**
 * Stable, collision-free key of a channel: `${currency}|${method}` (mirrors the
 * `PaymentPricingKey` convention). Both components are enum numbers, so the
 * delimiter makes the key unambiguous.
 */
export function channelKey(method: SalePaymentMethod, currency: Currency | number): string {
  return `${Number(currency)}|${Number(method)}`;
}

const VALID_CHANNEL_KEYS: ReadonlySet<string> = new Set(
  PAYMENT_CHANNELS.map((channel) => channelKey(channel.method, channel.currency)),
);

/**
 * True only for a pair that exists in the catalogue. Rejects non-existent
 * combinations such as Zelle+CUP or Efectivo+MLC, so no caller can register a
 * channel that the store does not have.
 */
export function isValidChannel(method: SalePaymentMethod, currency: Currency | number): boolean {
  return VALID_CHANNEL_KEYS.has(channelKey(method, currency));
}
