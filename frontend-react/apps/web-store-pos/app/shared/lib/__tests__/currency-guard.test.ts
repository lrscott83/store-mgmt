import { describe, expect, it } from 'vitest';
import { guardCurrency, productCurrency } from '../currency-guard';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { Currency } from '@store-mgmt/domain';

function item(currency?: number, id = 'p1'): CartItem {
  return {
    product: {
      id,
      name: 'P',
      price: 10,
      ...(currency !== undefined ? { currency } : {}),
    } as CartItem['product'],
    quantity: 1,
  };
}

describe('productCurrency', () => {
  it('absent currency defaults to CUP', () => {
    expect(productCurrency({})).toBe(Currency.CUP);
  });

  it('keeps the product currency when present', () => {
    expect(productCurrency({ currency: Currency.USD })).toBe(Currency.USD);
  });
});

describe('guardCurrency', () => {
  it('empty cart always allows', () => {
    const result = guardCurrency({ items: [], requestedProduct: { currency: Currency.USD } });
    expect(result.succeeded).toBe(true);
  });

  it('same currency as cart allows (explicit)', () => {
    const result = guardCurrency({
      items: [item(Currency.USD, 'a')],
      requestedProduct: { currency: Currency.USD },
    });
    expect(result.succeeded).toBe(true);
  });

  it('same currency as cart allows (both implicit CUP)', () => {
    const result = guardCurrency({
      items: [item(undefined, 'a')],
      requestedProduct: {},
    });
    expect(result.succeeded).toBe(true);
  });

  it('different currency blocks with a descriptive error', () => {
    const result = guardCurrency({
      items: [item(Currency.CUP, 'a')],
      requestedProduct: { currency: Currency.USD },
    });
    expect(result.succeeded).toBe(false);
    expect(result.errors[0].description).toContain('CUP');
    expect(result.errors[0].description).toContain('USD');
  });

  it('reverse direction also blocks (USD cart, CUP product)', () => {
    const result = guardCurrency({
      items: [item(Currency.USD, 'a')],
      requestedProduct: {},
    });
    expect(result.succeeded).toBe(false);
  });

  it('each foreign pair blocks (EUR vs MLC)', () => {
    const result = guardCurrency({
      items: [item(Currency.EUR, 'a')],
      requestedProduct: { currency: Currency.MLC },
    });
    expect(result.succeeded).toBe(false);
  });

  it('still blocks when allowMixedCurrencies is explicitly false', () => {
    const result = guardCurrency({
      items: [item(Currency.CUP, 'a')],
      requestedProduct: { currency: Currency.USD },
      allowMixedCurrencies: false,
    });
    expect(result.succeeded).toBe(false);
  });
});

describe('guardCurrency — MultiPayments (módulo 16) lift', () => {
  it('allows mixing currencies when allowMixedCurrencies is true', () => {
    const result = guardCurrency({
      items: [item(Currency.CUP, 'a')],
      requestedProduct: { currency: Currency.USD },
      allowMixedCurrencies: true,
    });
    expect(result.succeeded).toBe(true);
  });

  it('allows the reverse mix (USD cart, CUP product) when lifted', () => {
    const result = guardCurrency({
      items: [item(Currency.USD, 'a')],
      requestedProduct: {},
      allowMixedCurrencies: true,
    });
    expect(result.succeeded).toBe(true);
  });
});
