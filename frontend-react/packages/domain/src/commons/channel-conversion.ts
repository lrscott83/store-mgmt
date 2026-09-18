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

/** A rate ready for integer math: `value` is always integer millionths. */
export interface ResolvedChannelRate {
  /** Moneda-por-USD in integer millionths (value * 1e6). */
  value: number;
  /** Channel method that resolved the rate; absent on a currency-only USD pivot. */
  method?: SalePaymentMethod;
  currency: Currency;
  id?: string;
  effectiveFrom?: Date;
}

/**
 * HALF-UP integer division — the single rounding point of the module.
 * `2 * r >= denominator` rounds an exact half away from zero.
 */
export function divideHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    throw new Error('divideHalfUp: denominator must be positive.');
  }
  const q = Math.floor(numerator / denominator);
  const r = numerator - q * denominator;
  return 2 * r >= denominator ? q + 1 : q;
}

function success<T>(data: T): DataResult<T> {
  return new DataResult<T>(data, true, []);
}

function rateNotFound<T>(): DataResult<T> {
  return new DataResult<T>(undefined, false, [ChannelRateErrors.RateNotFound] as BaseError[]);
}

/**
 * A stored row is usable only when its `value` is a finite number greater than
 * zero. The write guards reject such rows, but a row written before those
 * guards existed (or by a caller that bypassed them) must never reach
 * `divideHalfUp` as a 0/NaN denominator: the cascade ignores it and falls
 * through to the typed `ChannelRateErrors.RateNotFound`.
 */
function isUsableRate(row: ChannelRate): boolean {
  return Number.isFinite(row.value) && row.value > 0;
}

function toResolved(rate: ChannelRate): ResolvedChannelRate {
  return {
    id: rate.id,
    method: rate.method,
    currency: rate.currency,
    value: Math.round(rate.value * RATE_MICRO),
    effectiveFrom: rate.effectiveFrom,
  };
}

function latestAtOrBefore(rates: readonly ChannelRate[], at: Date): ChannelRate | undefined {
  const atTime = at.getTime();
  let best: ChannelRate | undefined;
  for (const row of rates) {
    const time = row.effectiveFrom.getTime();
    if (time > atTime) continue;
    if (!best || time >= best.effectiveFrom.getTime()) best = row;
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
  const source = resolveChannelRate(rates, method, currency, at);

  if (Number(currency) === Number(toCurrency)) {
    if (source.succeeded) {
      return success(divideHalfUp(amountCents * source.data!.value, source.data!.value));
    }
    return success(amountCents);
  }

  const target = resolveCurrencyRate(rates, toCurrency, at);

  if (!source.succeeded) return rateNotFound<number>();
  if (!target.succeeded) return rateNotFound<number>();
  return success(divideHalfUp(amountCents * target.data!.value, source.data!.value));
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
  const source = resolveCurrencyRate(rates, fromCurrency, at);
  const target = resolveCurrencyRate(rates, toCurrency, at);

  if (Number(fromCurrency) === Number(toCurrency)) {
    if (source.succeeded && target.succeeded) {
      return success(divideHalfUp(amountCents * target.data!.value, source.data!.value));
    }
    return success(amountCents);
  }

  if (!source.succeeded) return rateNotFound<number>();
  if (!target.succeeded) return rateNotFound<number>();
  return success(divideHalfUp(amountCents * target.data!.value, source.data!.value));
}
