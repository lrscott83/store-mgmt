import { describe, expect, it } from 'vitest';
import { Currency } from '@store-mgmt/domain';
import { presentCurrencies } from '../currency-totals';

describe('presentCurrencies — distinct currencies in the agreed order', () => {
  it('empty input yields no currencies', () => {
    expect(presentCurrencies([])).toEqual([]);
  });

  it('a single currency yields just that currency', () => {
    expect(presentCurrencies([{ amount: 1, currency: Currency.EUR }])).toEqual([Currency.EUR]);
  });

  it('mixed USD/EUR/CUP come out in the fixed agreed order', () => {
    expect(
      presentCurrencies([
        { amount: 5, currency: Currency.CUP },
        { amount: 3, currency: Currency.EUR },
        { amount: 10, currency: Currency.USD },
      ]),
    ).toEqual([Currency.USD, Currency.EUR, Currency.CUP]);
  });

  it('duplicates collapse into a single occurrence', () => {
    expect(
      presentCurrencies([
        { amount: 10, currency: Currency.USD },
        { amount: 2, currency: Currency.USD },
        { amount: 1, currency: Currency.EUR },
      ]),
    ).toEqual([Currency.USD, Currency.EUR]);
  });

  it('an absent currency resolves to CUP and shares its bucket', () => {
    expect(
      presentCurrencies([
        { amount: 10, currency: Currency.USD },
        { amount: 5 },
        { amount: 7, currency: Currency.CUP },
      ]),
    ).toEqual([Currency.USD, Currency.CUP]);
  });
});
