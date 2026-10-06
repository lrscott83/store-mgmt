import { describe, expect, it } from 'vitest';
import { ChannelRateErrors, Currency, SalePaymentMethod } from '@store-mgmt/domain';
import type { ChannelRate } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { convertCartLines } from '../cart-line-conversion';

const AT = new Date('2026-09-18T12:00:00.000Z');

/** Rate row: `buyValue`/`sellValue` are units of `currency` per 1 USD. */
function rate(currency: Currency, value: number): ChannelRate {
  return {
    method: SalePaymentMethod.Efectivo,
    currency,
    buyValue: value,
    sellValue: value,
    effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
  };
}

function item(id: string, currency: Currency | undefined, price: number, quantity = 1): CartItem {
  return {
    product: {
      id,
      name: id,
      price,
      ...(currency !== undefined ? { currency } : {}),
    } as CartItem['product'],
    quantity,
  };
}

describe('convertCartLines — convierte cada línea a la moneda de la venta', () => {
  it('same-currency lines are identity even without any rate', () => {
    const result = convertCartLines([item('eur-1', Currency.EUR, 7.77, 3)], Currency.EUR, [], AT);
    expect(result.firstError).toBeNull();
    expect(result.lines[0].convertedUnitPrice).toBe(7.77);
    expect(result.lines[0].fromCurrency).toBe(Currency.EUR);
    expect(result.total).toBe(23.31);
  });

  it('converts a mixed cart (USD + CUP) to the sale currency (USD)', () => {
    const rates = [rate(Currency.CUP, 350)];
    const result = convertCartLines(
      [item('usd-1', Currency.USD, 10, 1), item('cup-1', Currency.CUP, 350, 2)],
      Currency.USD,
      rates,
      AT,
    );

    expect(result.firstError).toBeNull();
    expect(result.lines.map((l) => l.productId)).toEqual(['usd-1', 'cup-1']);
    // USD line: identity.
    expect(result.lines[0].convertedUnitPrice).toBe(10);
    // CUP line: 350 CUP / 350 (moneda-por-USD) = 1 USD.
    expect(result.lines[1].convertedUnitPrice).toBe(1);
    // 10×1 + 1×2 = 12 USD.
    expect(result.total).toBe(12);
  });

  it('an absent product currency defaults to CUP (domain default)', () => {
    const rates = [rate(Currency.CUP, 350)];
    const result = convertCartLines([item('implicit', undefined, 350, 1)], Currency.USD, rates, AT);
    expect(result.lines[0].fromCurrency).toBe(Currency.CUP);
    expect(result.lines[0].convertedUnitPrice).toBe(1);
  });

  it('a cross-currency line without a resolvable rate is a typed error, never a silent 0', () => {
    const result = convertCartLines([item('cup-1', Currency.CUP, 350, 1)], Currency.USD, [], AT);
    expect(result.lines[0].convertedUnitPrice).toBeNull();
    expect(result.lines[0].error).toEqual(ChannelRateErrors.RateNotFound);
    expect(result.firstError).toEqual(ChannelRateErrors.RateNotFound);
    // The unconvertible line is excluded from the total — no silent zero.
    expect(result.total).toBe(0);
  });

  it('keeps converting the convertible lines and reports the first typed error', () => {
    const rates = [rate(Currency.CUP, 350)];
    const result = convertCartLines(
      [item('usd-1', Currency.USD, 10, 1), item('eur-1', Currency.EUR, 5, 1)],
      Currency.USD,
      rates,
      AT,
    );
    // USD line converts (identity); EUR has no resolvable rate.
    expect(result.lines[0].convertedUnitPrice).toBe(10);
    expect(result.lines[1].convertedUnitPrice).toBeNull();
    expect(result.total).toBe(10);
    expect(result.firstError).toEqual(ChannelRateErrors.RateNotFound);
  });

  it('rounds the converted unit price HALF-UP through the domain conversion', () => {
    // 333 CUP at 350 CUP/USD → 33300/350 = 95.14… cents → 95 cents → 0.95 USD.
    const rates = [rate(Currency.CUP, 350)];
    const result = convertCartLines([item('cup-1', Currency.CUP, 333, 1)], Currency.USD, rates, AT);
    expect(result.lines[0].convertedUnitPrice).toBe(0.95);
  });
});

/** Rate row with an explicit id, to pin the persisted provenance fields. */
function identifiedRate(currency: Currency, value: number, id: string): ChannelRate {
  return {
    method: SalePaymentMethod.Efectivo,
    currency,
    id,
    buyValue: value,
    sellValue: value,
    effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
  };
}

describe('convertCartLines — sale snapshot (original price, used rate, sale-currency rate)', () => {
  it('same-currency line: original price/currency exposed, conversionRate 1 with no provenance', () => {
    const result = convertCartLines([item('eur-1', Currency.EUR, 7.77, 3)], Currency.EUR, [], AT);
    const line = result.lines[0];

    expect(line.originalUnitPrice).toBe(7.77);
    expect(line.originalCurrency).toBe(Currency.EUR);
    expect(line.conversionRate).toBe(1);
    expect(line.conversionRateId).toBeNull();
    expect(line.conversionRateEffectiveFrom).toBeNull();
  });

  it('cross-currency line: keeps the original price/currency and the ORIGINAL currency rate used', () => {
    const rates = [identifiedRate(Currency.CUP, 350, 'rate-cup')];
    const result = convertCartLines([item('cup-1', Currency.CUP, 350, 2)], Currency.USD, rates, AT);
    const line = result.lines[0];

    // 350 CUP → 1 USD, but the line keeps that it WAS 350 CUP and the rate was 350 CUP/USD.
    expect(line.convertedUnitPrice).toBe(1);
    expect(line.originalUnitPrice).toBe(350);
    expect(line.originalCurrency).toBe(Currency.CUP);
    expect(line.conversionRate).toBe(350);
    expect(line.conversionRateId).toBe('rate-cup');
    expect(line.conversionRateEffectiveFrom).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });

  it('exposes the sale-currency rate (value + provenance) shared by every line', () => {
    const rates = [identifiedRate(Currency.CUP, 350, 'rate-cup')];
    const result = convertCartLines([item('usd-1', Currency.USD, 10, 1)], Currency.CUP, rates, AT);

    expect(result.saleCurrencyRate).toEqual({
      value: 350,
      id: 'rate-cup',
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    });
  });

  it('a sale currency with a resolvable persisted row reports it; unresolvable non-USD is null', () => {
    const rates = [identifiedRate(Currency.CUP, 350, 'rate-cup')];
    // EUR has no row and is not the synthetic USD pivot → no sale-currency rate.
    const result = convertCartLines([item('cup-1', Currency.CUP, 350, 1)], Currency.EUR, rates, AT);
    expect(result.saleCurrencyRate).toBeNull();
  });

  it('the USD sale currency resolves through the synthetic pivot (value 1, no provenance)', () => {
    const result = convertCartLines([item('usd-1', Currency.USD, 10, 1)], Currency.USD, [], AT);
    expect(result.saleCurrencyRate).toEqual({
      value: 1,
      id: null,
      effectiveFrom: null,
    });
  });

  it('an unconvertible line keeps its original price/currency but reports no applied rate', () => {
    const result = convertCartLines([item('cup-1', Currency.CUP, 350, 1)], Currency.USD, [], AT);
    const line = result.lines[0];
    expect(line.originalUnitPrice).toBe(350);
    expect(line.originalCurrency).toBe(Currency.CUP);
    expect(line.conversionRate).toBeNull();
    expect(line.conversionRateId).toBeNull();
    expect(line.conversionRateEffectiveFrom).toBeNull();
  });
});
