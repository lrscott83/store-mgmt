import { describe, it, expect, beforeEach } from 'vitest';
import { getCurrentCurrency, setCurrency } from './currency-service';

// Mirrors Angular's `CurrencyService`
// (frontend/src/app/application/entries/currency.service.ts): stateless
// root-provided singleton, localStorage key `lizoft.store-currency`,
// default `{ currency: 'CUP', rate: 370 }` when nothing is stored.

const STORAGE_KEY = 'lizoft.store-currency';

describe('getCurrentCurrency', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default CUP/370 when nothing is stored', () => {
    expect(getCurrentCurrency()).toEqual({ currency: 'CUP', rate: 370 });
  });

  it('returns the persisted value when present', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ currency: 'USD', rate: 420 }));
    expect(getCurrentCurrency()).toEqual({ currency: 'USD', rate: 420 });
  });
});

describe('setCurrency', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists the given currency under the lizoft.store-currency key', () => {
    setCurrency({ currency: 'USD', rate: 400 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      currency: 'USD',
      rate: 400,
    });
  });

  it('round-trips through getCurrentCurrency', () => {
    setCurrency({ currency: 'USD', rate: 385 });
    expect(getCurrentCurrency()).toEqual({ currency: 'USD', rate: 385 });
  });

  it('does nothing when called with a falsy value (mirrors Angular `if (currency)` guard)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCurrency(null as any);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
