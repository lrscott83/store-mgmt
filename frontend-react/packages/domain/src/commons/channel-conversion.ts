import { Currency } from '../enums';
import type { SalePaymentMethod } from '../enums';
import type { BaseError } from '../models/base';
import type { ChannelRate } from '../models/channel-rate';
import { ChannelRateErrors } from '../errors/channel-rate-errors';
import { DataResult } from './result';

/**
 * multipayments (plan 2026-09-18) — pure conversion helpers over `ChannelRate`.
 *
 * Integer math only: amounts are integer CENTS (2dp) and rates are integer
 * MILLIONTHS (6dp, value * 1e6). `divideHalfUp` is the ONLY rounding and runs
 * once at the end of each conversion, so no intermediate float artifact leaks
 * into a result.
 *
 * Cascade (ratified decision 4): exact channel → same currency (any method) →
 * synthetic USD pivot (value 1e6, never replicated as a persisted row) → typed
 * error. A rate is never silently substituted with 0/null.
 */

/** Scale of the normalized integer rate representation (6 decimals). */
export const RATE_MICRO = 1_000_000;

/** Synthetic pivot value for USD when no persisted row resolves. */
const USD_PIVOT_MICRO = 1_000_000;

/** A rate ready for integer math: `buyValue` and `sellValue` are always integer millionths. */
export interface ResolvedChannelRate {
  /** Buy value in integer millionths (buyValue * 1e6). */
  buyValue: number;
  /** Sell value in integer millionths (sellValue * 1e6). */
  sellValue: number;
  /** Channel method that resolved the rate; absent on a currency-only USD pivot. */
  method?: SalePaymentMethod;
  currency: Currency;
  id?: string;
  effectiveFrom?: Date;
}

/**
 * HALF-UP integer division — the single rounding point of the module.
 * Rounds HALF-UP AWAY FROM ZERO for every sign: the magnitude is rounded with
 * `2 * r >= denominator` and the sign is re-applied, so an exact negative half
 * (-3/2) rounds to -2 — not toward +infinity. A non-positive denominator throws.
 */
export function divideHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    throw new Error('divideHalfUp: denominator must be positive.');
  }
  const negative = numerator < 0;
  const magnitude = Math.abs(numerator);
  const q = Math.floor(magnitude / denominator);
  const r = magnitude - q * denominator;
  const rounded = 2 * r >= denominator ? q + 1 : q;
  if (rounded === 0) return 0;
  return negative ? -rounded : rounded;
}

function success<T>(data: T): DataResult<T> {
  return new DataResult<T>(data, true, []);
}

function rateNotFound<T>(): DataResult<T> {
  return new DataResult<T>(undefined, false, [ChannelRateErrors.RateNotFound] as BaseError[]);
}

/**
 * A stored row is usable only when it is not deactivated (`isActive !== false`
 * — absent means active, T19b) and its `value` is a finite number greater than
 * zero. The write guards reject bad values, but a row written before those
 * guards existed (or by a caller that bypassed them) must never reach
 * `divideHalfUp` as a 0/NaN denominator; an inactive row must never resolve at
 * all. Both are ignored and fall through to the typed
 * `ChannelRateErrors.RateNotFound`.
 */
function isUsableRate(row: ChannelRate): boolean {
  return (
    row.isActive !== false &&
    Number.isFinite(row.buyValue) &&
    row.buyValue > 0 &&
    Number.isFinite(row.sellValue) &&
    row.sellValue > 0
  );
}

function toResolved(rate: ChannelRate): ResolvedChannelRate {
  return {
    id: rate.id,
    method: rate.method,
    currency: rate.currency,
    buyValue: Math.round(rate.buyValue * RATE_MICRO),
    sellValue: Math.round(rate.sellValue * RATE_MICRO),
    effectiveFrom: rate.effectiveFrom,
  };
}

/**
 * Total order over rate rows, so the winner never depends on caller array order:
 * (1) `effectiveFrom` ascending (later wins), then (2) `createdDate` ascending
 * (absent = epoch 0), then (3) `id` lexicographically (absent = empty string).
 * The maximum wins. `id` is compared by code unit, not locale, to stay stable.
 */
function compareRates(a: ChannelRate, b: ChannelRate): number {
  const byEffectiveFrom = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
  if (byEffectiveFrom !== 0) return byEffectiveFrom;

  const aCreated = a.createdDate ? a.createdDate.getTime() : 0;
  const bCreated = b.createdDate ? b.createdDate.getTime() : 0;
  if (aCreated !== bCreated) return aCreated - bCreated;

  const aId = a.id ?? '';
  const bId = b.id ?? '';
  if (aId === bId) return 0;
  return aId < bId ? -1 : 1;
}

/**
 * Latest row effective at or before `at`, resolved under `compareRates` so two
 * rows sharing an `effectiveFrom` resolve identically regardless of the order
 * the caller passes them in. The caller's array is never mutated.
 */
function latestAtOrBefore(rates: readonly ChannelRate[], at: Date): ChannelRate | undefined {
  const atTime = at.getTime();
  let best: ChannelRate | undefined;
  for (const row of rates) {
    if (row.effectiveFrom.getTime() > atTime) continue;
    if (!best || compareRates(row, best) > 0) best = row;
  }
  return best;
}

function latestWithCurrency(
  rates: readonly ChannelRate[],
  currency: Currency | number,
  at: Date,
): ChannelRate | undefined {
  return latestAtOrBefore(
    rates.filter((row) => isUsableRate(row) && Number(row.currency) === Number(currency)),
    at,
  );
}

/**
 * Channel cascade for a concrete payment channel:
 * (a) latest row with exact method + currency and effectiveFrom <= at;
 * (b) else latest row of the same currency (any method);
 * (c) else the synthetic USD pivot when the currency is USD;
 * (d) else `ChannelRateErrors.RateNotFound`.
 */
export function resolveChannelRate(
  rates: readonly ChannelRate[],
  method: SalePaymentMethod,
  currency: Currency,
  at: Date,
): DataResult<ResolvedChannelRate> {
  const exact = latestAtOrBefore(
    rates.filter(
      (row) =>
        isUsableRate(row) &&
        Number(row.method) === Number(method) &&
        Number(row.currency) === Number(currency),
    ),
    at,
  );
  if (exact) return success(toResolved(exact));

  const sameCurrency = latestWithCurrency(rates, currency, at);
  if (sameCurrency) return success(toResolved(sameCurrency));

  if (Number(currency) === Number(Currency.USD)) {
    // Synthetic pivot: no id/effectiveFrom — never fabricate persisted values.
    return success({ value: USD_PIVOT_MICRO, method, currency: Currency.USD });
  }

  return rateNotFound<ResolvedChannelRate>();
}

/**
 * Channel-independent cascade (RF-09, used by line conversion):
 * latest row of the currency (any method) → synthetic USD pivot → typed error.
 */
export function resolveCurrencyRate(
  rates: readonly ChannelRate[],
  currency: Currency,
  at: Date,
): DataResult<ResolvedChannelRate> {
  const anyMethod = latestWithCurrency(rates, currency, at);
  if (anyMethod) return success(toResolved(anyMethod));

  if (Number(currency) === Number(Currency.USD)) {
    return success({ value: USD_PIVOT_MICRO, currency: Currency.USD });
  }

  return rateNotFound<ResolvedChannelRate>();
}

/**
 * Converts an amount (integer cents) paid through a channel into the order
 * currency (integer cents). A same-currency conversion applies the SAME
 * resolved rate on both sides, so it is an exact algebraic identity even when
 * another method has a newer rate for that currency; when the currency has no
 * resolvable rate at all the amount is returned unchanged. A cross-currency
 * conversion without a resolvable rate is a typed error — never a silent 1×1.
 */
export function convertPaymentAmount(
  amountCents: number,
  method: SalePaymentMethod,
  currency: Currency,
  toCurrency: Currency,
  rates: readonly ChannelRate[],
  at: Date,
): DataResult<number> {
  if (Number(currency) === Number(toCurrency)) {
    return success(amountCents);
  }

  const source = resolveChannelRate(rates, method, currency, at);
  const target = resolveCurrencyRate(rates, toCurrency, at);

  if (!source.succeeded) return rateNotFound<number>();
  if (!target.succeeded) return rateNotFound<number>();

  // Cross-currency conversion via USD pivot:
  // - Converting FROM a non-USD currency: divide by buyValue (bank buys the source currency)
  // - Converting TO a non-USD currency: multiply by sellValue (bank sells the target currency)
  const amountInUsd = Number(currency) === Number(Currency.USD)
    ? amountCents
    : divideHalfUp(amountCents * RATE_MICRO, source.data!.buyValue);

  const result = Number(toCurrency) === Number(Currency.USD)
    ? amountInUsd
    : divideHalfUp(amountInUsd * target.data!.sellValue, RATE_MICRO);

  return success(result);
}

/**
 * Channel-independent line conversion (RF-09): resolves source and target by
 * currency only (latest any method → USD pivot → typed error). Same rules as
 * `convertPaymentAmount` for same-currency and missing-rate cases.
 */
export function convertLineAmount(
  amountCents: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  rates: readonly ChannelRate[],
  at: Date,
): DataResult<number> {
  if (Number(fromCurrency) === Number(toCurrency)) {
    return success(amountCents);
  }

  const source = resolveCurrencyRate(rates, fromCurrency, at);
  const target = resolveCurrencyRate(rates, toCurrency, at);

  if (!source.succeeded) return rateNotFound<number>();
  if (!target.succeeded) return rateNotFound<number>();

  // Cross-currency conversion via USD pivot:
  // - Converting FROM a non-USD currency: divide by buyValue (bank buys the source currency)
  // - Converting TO a non-USD currency: multiply by sellValue (bank sells the target currency)
  const amountInUsd = Number(fromCurrency) === Number(Currency.USD)
    ? amountCents
    : divideHalfUp(amountCents * RATE_MICRO, source.data!.buyValue);

  const result = Number(toCurrency) === Number(Currency.USD)
    ? amountInUsd
    : divideHalfUp(amountInUsd * target.data!.sellValue, RATE_MICRO);

  return success(result);
}
