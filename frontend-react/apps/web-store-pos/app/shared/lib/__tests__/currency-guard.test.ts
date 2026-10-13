import { describe, expect, it } from 'vitest';
import { productCurrency } from '../currency-guard';
import { Currency } from '@store-mgmt/domain';

// The "one currency per sale" guard (guardCurrency + its blocking popup) was
// RETIRED by owner decision on 2026-10-13 — mixing currencies in a sale is
// always allowed. Only the currency-reading helper survives here, because
// multipayments/cart-line-conversion.ts still needs the product's own currency.
// The retirement is pinned behaviorally by sale.test.tsx ("mixed currencies are
// always allowed") and end-to-end by e2e/multimonedas.spec.ts MMF4.
describe('productCurrency', () => {
  it('absent currency defaults to CUP', () => {
    expect(productCurrency({})).toBe(Currency.CUP);
  });

  it('keeps the product currency when present', () => {
    expect(productCurrency({ currency: Currency.USD })).toBe(Currency.USD);
  });

  it('keeps every non-CUP currency verbatim', () => {
    for (const currency of [
      Currency.USD,
      Currency.EUR,
      Currency.CLA,
      Currency.MLC,
      Currency.CAD,
      Currency.MXN,
    ]) {
      expect(productCurrency({ currency })).toBe(currency);
    }
  });
});