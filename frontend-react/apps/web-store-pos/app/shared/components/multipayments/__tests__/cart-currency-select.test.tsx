import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Currency, EModules } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

let mockUser: unknown = null;
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) =>
    typeof selector === 'function' ? selector({ user: mockUser }) : { user: mockUser },
}));

let mockItems: Array<{ product: { currency?: Currency } }> = [];
vi.mock('~/shared/lib/stores/cart-store', () => ({
  useCartStore: (selector?: (s: { items: unknown[] }) => unknown) =>
    typeof selector === 'function' ? selector({ items: mockItems }) : { items: mockItems },
}));

import { CartCurrencySelect } from '../cart-currency-select';

const USER_ID = 'u1';

function userWith(storeModuleIds: number[]) {
  return { id: USER_ID, storeModuleIds };
}

function itemWith(currency?: Currency) {
  return { product: { currency } };
}

function renderSelect(value: Currency, onChange = vi.fn()) {
  render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <CartCurrencySelect value={value} onChange={onChange} testId="cart-currency-select" />
    </IntlProvider>,
  );
  return onChange;
}

function optionLabels(): string[] {
  return screen.getAllByRole('option').map((option) => option.textContent ?? '');
}

describe('CartCurrencySelect (module 16 gate)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = userWith([2, 3]);
    mockItems = [];
  });

  it('renders nothing without the MultiPayments module', () => {
    renderSelect(Currency.CUP);
    expect(screen.queryByTestId('cart-currency-select')).not.toBeInTheDocument();
  });

  it('renders nothing for a null user or a user without storeModuleIds', () => {
    mockUser = null;
    renderSelect(Currency.CUP);
    expect(screen.queryByTestId('cart-currency-select')).not.toBeInTheDocument();

    mockUser = { id: USER_ID };
    renderSelect(Currency.CUP);
    expect(screen.queryByTestId('cart-currency-select')).not.toBeInTheDocument();
  });

  it('renders the selector with CUP and USD for a store with module 16', () => {
    mockUser = userWith([EModules.MultiPayments]);
    renderSelect(Currency.CUP);

    const select = screen.getByTestId('cart-currency-select');
    expect(select).toBeInTheDocument();
    expect(optionLabels()).toEqual(['CUP', 'USD']);
  });

  it('appends the currencies present in the cart, deduplicated', () => {
    mockUser = userWith([EModules.MultiPayments]);
    mockItems = [
      itemWith(Currency.CUP),
      itemWith(Currency.USD),
      itemWith(Currency.EUR),
      itemWith(Currency.EUR),
      itemWith(undefined),
    ];
    renderSelect(Currency.CUP);

    expect(optionLabels()).toEqual(['CUP', 'USD', 'EUR']);
  });

  it('persists the selected currency for the user', () => {
    mockUser = userWith([EModules.MultiPayments]);
    const onChange = renderSelect(Currency.CUP);

    fireEvent.change(screen.getByTestId('cart-currency-select'), { target: { value: '1' } });

    expect(localStorage.getItem(`lizoft.cart-currency-${USER_ID}`)).toBe('1');
    expect(onChange).toHaveBeenCalledWith(Currency.USD);
  });
});
