import { describe, expect, it } from 'vitest';
import { Currency, SalePaymentMethod } from '../../enums';
import type { ChannelRate } from '../../models/channel-rate';
import { ChannelRateErrors } from '../../errors/channel-rate-errors';
import {
  RATE_MICRO,
  convertLineAmount,
  convertPaymentAmount,
  divideHalfUp,
  resolveChannelRate,
  resolveCurrencyRate,
} from '../channel-conversion';

const AT = new Date('2026-09-18T12:00:00.000Z');

function makeRate(
  currency: Currency,
  value: number,
  effectiveFrom: string,
  method: SalePaymentMethod = SalePaymentMethod.Efectivo,
): ChannelRate {
  return { method, currency, value, effectiveFrom: new Date(effectiveFrom) };
}

describe('divideHalfUp — the single rounding point', () => {
  it('rounds an exact half up', () => {
    expect(divideHalfUp(3, 2)).toBe(2);
    expect(divideHalfUp(1, 2)).toBe(1);
  });

  it('rounds below half down and keeps exact results exact', () => {
    expect(divideHalfUp(1, 3)).toBe(0);
    expect(divideHalfUp(4, 2)).toBe(2);
  });
});

describe('resolveChannelRate — cascade exact channel → same currency → USD pivot → error', () => {
  it('(a) takes the latest exact-channel row with effectiveFrom <= at', () => {
    const rates = [
      makeRate(Currency.CUP, 300, '2026-09-01', SalePaymentMethod.Transferencia),
      makeRate(Currency.CUP, 350, '2026-09-15', SalePaymentMethod.Transferencia),
      makeRate(Currency.CUP, 400, '2026-12-01', SalePaymentMethod.Transferencia),
    ];
    const result = resolveChannelRate(rates, SalePaymentMethod.Transferencia, Currency.CUP, AT);
    expect(result.succeeded).toBe(true);
    expect(result.data?.value).toBe(350 * RATE_MICRO);
    expect(result.data?.id).toBeUndefined();
  });

  it('(b) falls back to another channel of the same currency', () => {
    const rates = [makeRate(Currency.CUP, 340, '2026-09-01', SalePaymentMethod.Efectivo)];
    const result = resolveChannelRate(rates, SalePaymentMethod.Zelle, Currency.CUP, AT);
    expect(result.succeeded).toBe(true);
    expect(result.data?.value).toBe(340 * RATE_MICRO);
    expect(result.data?.method).toBe(SalePaymentMethod.Efectivo);
  });

  it('(c) returns the synthetic USD pivot (value 1e6, no id/effectiveFrom)', () => {
    const result = resolveChannelRate([], SalePaymentMethod.Efectivo, Currency.USD, AT);
    expect(result.succeeded).toBe(true);
    expect(result.data?.value).toBe(1_000_000);
    expect(result.data?.id).toBeUndefined();
    expect(result.data?.effectiveFrom).toBeUndefined();
    expect(result.data?.currency).toBe(Currency.USD);
    expect(result.data?.method).toBe(SalePaymentMethod.Efectivo);
  });

  it('(d) returns a typed error for a non-USD currency with nothing to resolve', () => {
    const result = resolveChannelRate([], SalePaymentMethod.Efectivo, Currency.EUR, AT);
    expect(result.succeeded).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors).toEqual([ChannelRateErrors.RateNotFound]);
  });

  it('never returns 0/null as a resolved rate', () => {
    const resolved = resolveChannelRate(
      [makeRate(Currency.EUR, 1.25, '2026-09-01')],
      SalePaymentMethod.Efectivo,
      Currency.EUR,
      AT,
    );
    expect(resolved.data?.value).toBeGreaterThan(0);
    const pivot = resolveChannelRate([], SalePaymentMethod.Zelle, Currency.USD, AT);
    expect(pivot.data?.value).toBeGreaterThan(0);
  });

  it('resolveCurrencyRate resolves any method of the currency, else USD pivot, else error', () => {
    const rates = [makeRate(Currency.CUP, 700, '2026-09-01', SalePaymentMethod.Transferencia)];
    expect(resolveCurrencyRate(rates, Currency.CUP, AT).data?.value).toBe(700 * RATE_MICRO);
    expect(resolveCurrencyRate([], Currency.USD, AT).data?.value).toBe(1_000_000);
    expect(resolveCurrencyRate([], Currency.EUR, AT).succeeded).toBe(false);
  });
});

describe('convertPaymentAmount — channel conversion with one HALF-UP rounding', () => {
  it('USD cash in a USD order is unchanged without any rate rows', () => {
    const result = convertPaymentAmount(12000, SalePaymentMethod.Efectivo, Currency.USD, Currency.USD, [], AT);
    expect(result.succeeded).toBe(true);
    expect(result.data).toBe(12000);
  });

  it('converts EUR→CUP via the USD pivot (EUR=1, CUP=350 → 10 EUR = 3500 CUP)', () => {
    const rates = [
      makeRate(Currency.EUR, 1, '2026-09-01'),
      makeRate(Currency.CUP, 350, '2026-09-01'),
    ];
    const result = convertPaymentAmount(1000, SalePaymentMethod.Efectivo, Currency.EUR, Currency.CUP, rates, AT);
    expect(result.data).toBe(350_000);
  });

  it('rounds an exact half-cent boundary up', () => {
    const rates = [makeRate(Currency.EUR, 2, '2026-09-01'), makeRate(Currency.CUP, 3, '2026-09-01')];
    const result = convertPaymentAmount(1, SalePaymentMethod.Efectivo, Currency.EUR, Currency.CUP, rates, AT);
    expect(result.data).toBe(2);
  });

  it('keeps cents exact with a 6-decimal rate (no float artifacts)', () => {
    const rates = [makeRate(Currency.CUP, 1.234567, '2026-09-01')];
    const result = convertPaymentAmount(
      1_000_000,
      SalePaymentMethod.Efectivo,
      Currency.USD,
      Currency.CUP,
      rates,
      AT,
    );
    expect(result.data).toBe(1_234_567);
  });

  it('applies the rates for a same-currency conversion (identity)', () => {
    const withRate = convertPaymentAmount(
      555,
      SalePaymentMethod.Transferencia,
      Currency.EUR,
      Currency.EUR,
      [makeRate(Currency.EUR, 1.5, '2026-09-01', SalePaymentMethod.Transferencia)],
      AT,
    );
    expect(withRate.data).toBe(555);
  });

  it('is identity for a same-currency conversion with no rate rows at all', () => {
    const result = convertPaymentAmount(555, SalePaymentMethod.Transferencia, Currency.EUR, Currency.EUR, [], AT);
    expect(result.succeeded).toBe(true);
    expect(result.data).toBe(555);
  });

  it('is identity when another method has a newer rate for the same currency', () => {
    const rates = [
      makeRate(Currency.EUR, 1.5, '2026-09-01', SalePaymentMethod.Efectivo),
      makeRate(Currency.EUR, 1.8, '2026-09-10', SalePaymentMethod.Transferencia),
    ];
    const result = convertPaymentAmount(555, SalePaymentMethod.Efectivo, Currency.EUR, Currency.EUR, rates, AT);
    expect(result.succeeded).toBe(true);
    expect(result.data).toBe(555);
  });

  it('returns a typed error for a cross-currency conversion with no resolvable rate (never 1×1)', () => {
    const result = convertPaymentAmount(100, SalePaymentMethod.Efectivo, Currency.EUR, Currency.CUP, [], AT);
    expect(result.succeeded).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors).toEqual([ChannelRateErrors.RateNotFound]);
  });
});

describe('convertLineAmount — channel-independent currency conversion (RF-09)', () => {
  it('converts CUP→USD through the USD pivot', () => {
    const rates = [makeRate(Currency.CUP, 350, '2026-09-01', SalePaymentMethod.Transferencia)];
    const result = convertLineAmount(1000, Currency.CUP, Currency.USD, rates, AT);
    expect(result.data).toBe(3);
  });

  it('converts EUR→CUP with rates of any method', () => {
    const rates = [makeRate(Currency.EUR, 1, '2026-09-01'), makeRate(Currency.CUP, 350, '2026-09-01')];
    const result = convertLineAmount(1000, Currency.EUR, Currency.CUP, rates, AT);
    expect(result.data).toBe(350_000);
  });

  it('is identity for same currency without rates and a typed error across currencies without rates', () => {
    expect(convertLineAmount(777, Currency.EUR, Currency.EUR, [], AT).data).toBe(777);
    const missing = convertLineAmount(777, Currency.EUR, Currency.CUP, [], AT);
    expect(missing.succeeded).toBe(false);
    expect(missing.errors).toEqual([ChannelRateErrors.RateNotFound]);
  });
});
