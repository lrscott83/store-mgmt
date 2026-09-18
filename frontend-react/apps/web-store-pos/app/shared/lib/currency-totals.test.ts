import { describe, expect, it } from 'vitest';
import { Currency } from '@store-mgmt/domain';
import { groupAmountsByCurrency, orderCurrencyTotals, resolveCurrency } from './currency-totals';

describe('currency-totals — grouping never sums across currencies', () => {
  it('groups amounts by currency and defaults an absent currency to CUP', () => {
    const totals = groupAmountsByCurrency([
      { amount: 10, currency: Currency.USD },
      { amount: 5, currency: Currency.USD },
      { amount: 100 },
      { amount: 30, currency: Currency.EUR },
      { amount: 7, currency: Currency.CUP },
    ]);

    expect(totals).toEqual([
      { currency: Currency.USD, label: 'USD', amount: 15 },
      { currency: Currency.CUP, label: 'CUP', amount: 107 },
      { currency: Currency.EUR, label: 'EUR', amount: 30 },
    ]);
  });

  it('empty input yields no rows in either helper', () => {
    expect(groupAmountsByCurrency([])).toEqual([]);
    expect(orderCurrencyTotals([])).toEqual([]);
  });

  it('resolveCurrency falls back to CUP only when the currency is absent', () => {
    expect(resolveCurrency(undefined)).toBe(Currency.CUP);
    expect(resolveCurrency(Currency.USD)).toBe(Currency.USD);
    expect(resolveCurrency(Currency.EUR)).toBe(Currency.EUR);
  });
});

describe('currency-totals — display order rule', () => {
  it('orders USD → EUR → CUP first (fixed), then the rest by amount DESC', () => {
    const ordered = orderCurrencyTotals([
      { currency: Currency.MLC, amount: 500 },
      { currency: Currency.CUP, amount: 1 },
      { currency: Currency.EUR, amount: 2 },
      { currency: Currency.USD, amount: 3 },
      { currency: Currency.CAD, amount: 900 },
      { currency: Currency.MXN, amount: 50 },
    ]);

    expect(ordered.map((total) => total.currency)).toEqual([
      Currency.USD,
      Currency.EUR,
      Currency.CUP,
      Currency.CAD,
      Currency.MLC,
      Currency.MXN,
    ]);
  });

  it('the fixed priority beats the amount (EUR before a larger CUP)', () => {
    const ordered = orderCurrencyTotals([
      { currency: Currency.CUP, amount: 10_000 },
      { currency: Currency.EUR, amount: 1 },
    ]);

    expect(ordered.map((total) => total.currency)).toEqual([Currency.EUR, Currency.CUP]);
  });

  it('without priority currencies the highest amount leads', () => {
    const ordered = orderCurrencyTotals([
      { currency: Currency.MXN, amount: 50 },
      { currency: Currency.CLA, amount: 400 },
      { currency: Currency.MLC, amount: 100 },
    ]);

    expect(ordered.map((total) => total.currency)).toEqual([
      Currency.CLA,
      Currency.MLC,
      Currency.MXN,
    ]);
  });

  it('ties keep the input order (stable tie-break, identical across runs)', () => {
    const input = [
      { currency: Currency.MXN, amount: 100 },
      { currency: Currency.CLA, amount: 100 },
      { currency: Currency.MLC, amount: 100 },
    ];

    expect(orderCurrencyTotals(input).map((total) => total.currency)).toEqual([
      Currency.MXN,
      Currency.CLA,
      Currency.MLC,
    ]);
    expect(orderCurrencyTotals(input).map((total) => total.currency)).toEqual([
      Currency.MXN,
      Currency.CLA,
      Currency.MLC,
    ]);
  });

  it('preserves the extra fields of the rows it orders', () => {
    const ordered = orderCurrencyTotals([
      { currency: Currency.CUP, amount: 10, extra: 'cup' },
      { currency: Currency.USD, amount: 1, extra: 'usd' },
    ]);

    expect(ordered).toEqual([
      { currency: Currency.USD, amount: 1, extra: 'usd' },
      { currency: Currency.CUP, amount: 10, extra: 'cup' },
    ]);
  });
});
