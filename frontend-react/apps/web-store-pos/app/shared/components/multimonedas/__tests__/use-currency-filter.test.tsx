import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Currency, EModules } from '@store-mgmt/domain';

let mockUser: unknown = null;
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) =>
    typeof selector === 'function' ? selector({ user: mockUser }) : { user: mockUser },
}));

import { useCurrencyFilter } from '../use-currency-filter';

function userWith(storeModuleIds: number[]) {
  return { id: 'u1', storeModuleIds };
}

describe('useCurrencyFilter', () => {
  beforeEach(() => {
    mockUser = userWith([2, 3, EModules.MultiMonedas]);
  });

  it('is hidden with a single currency', () => {
    const { result } = renderHook(() => useCurrencyFilter([Currency.USD]));
    expect(result.current.visible).toBe(false);
    expect(result.current.currency).toBeNull();
  });

  it('is hidden when the MultiMonedas module is inactive even with 2+ currencies', () => {
    mockUser = userWith([2, 3]);
    const { result } = renderHook(() => useCurrencyFilter([Currency.USD, Currency.EUR]));
    expect(result.current.visible).toBe(false);
    expect(result.current.currency).toBeNull();
  });

  it('is visible and defaults to the first currency when active with 2+ currencies', () => {
    const { result } = renderHook(() => useCurrencyFilter([Currency.USD, Currency.EUR]));
    expect(result.current.visible).toBe(true);
    expect(result.current.currency).toBe(Currency.USD);
    expect(result.current.currencies).toEqual([Currency.USD, Currency.EUR]);
  });

  it('preserves a selection that stays present across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ currencies }: { currencies: Currency[] }) => useCurrencyFilter(currencies),
      { initialProps: { currencies: [Currency.USD, Currency.EUR, Currency.CUP] } },
    );

    act(() => result.current.setCurrency(Currency.EUR));
    expect(result.current.currency).toBe(Currency.EUR);

    rerender({ currencies: [Currency.USD, Currency.EUR, Currency.CUP] });
    expect(result.current.currency).toBe(Currency.EUR);
  });

  it('falls back to the first currency when the selection disappears', () => {
    const { result, rerender } = renderHook(
      ({ currencies }: { currencies: Currency[] }) => useCurrencyFilter(currencies),
      { initialProps: { currencies: [Currency.USD, Currency.EUR] } },
    );

    act(() => result.current.setCurrency(Currency.EUR));
    expect(result.current.currency).toBe(Currency.EUR);

    rerender({ currencies: [Currency.USD, Currency.CUP] });
    expect(result.current.currency).toBe(Currency.USD);
  });
});
