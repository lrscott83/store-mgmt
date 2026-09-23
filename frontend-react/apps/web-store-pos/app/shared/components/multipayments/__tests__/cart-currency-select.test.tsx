import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

function renderSelect(
  value: Currency,
  onChange = vi.fn(),
  props: {
    canChange?: (currency: Currency) => boolean;
    onRejected?: (currency: Currency) => void;
  } = {},
) {
  render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <CartCurrencySelect
        value={value}
        onChange={onChange}
        testId="cart-currency-select"
        {...props}
      />
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

  it('falls back to CUP and notifies the parent when the value is not among the options', async () => {
    mockUser = userWith([EModules.MultiPayments]);
    mockItems = [itemWith(Currency.CUP)];
    // Persisted EUR with a CUP-only cart: EUR is not an option.
    const onChange = renderSelect(Currency.EUR);

    expect(optionLabels()).toEqual(['CUP', 'USD']);
    const select = screen.getByTestId('cart-currency-select') as HTMLSelectElement;
    expect(select.value).toBe(String(Currency.CUP));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(Currency.CUP);
    });
  });

  it('persists the selected currency for the user', () => {
    mockUser = userWith([EModules.MultiPayments]);
    const onChange = renderSelect(Currency.CUP);

    fireEvent.change(screen.getByTestId('cart-currency-select'), { target: { value: '1' } });

    expect(localStorage.getItem(`lizoft.cart-currency-${USER_ID}`)).toBe('1');
    expect(onChange).toHaveBeenCalledWith(Currency.USD);
  });
});

describe('CartCurrencySelect — T4: guard de cambio', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = userWith([EModules.MultiPayments]);
    mockItems = [];
  });

  it('T4-SEL-01: rechaza el cambio cuando canChange devuelve false (no persiste, no notifica, avisa)', () => {
    const onChange = vi.fn();
    const onRejected = vi.fn();
    const canChange = vi.fn().mockReturnValue(false);
    renderSelect(Currency.CUP, onChange, { canChange, onRejected });

    fireEvent.change(screen.getByTestId('cart-currency-select'), {
      target: { value: String(Currency.USD) },
    });

    expect(canChange).toHaveBeenCalledWith(Currency.USD);
    expect(onRejected).toHaveBeenCalledWith(Currency.USD);
    expect(onChange).not.toHaveBeenCalled();
    expect(localStorage.getItem(`lizoft.cart-currency-${USER_ID}`)).toBeNull();
    const select = screen.getByTestId('cart-currency-select') as HTMLSelectElement;
    expect(select.value).toBe(String(Currency.CUP));
  });

  it('T4-SEL-02: procede cuando canChange devuelve true (persiste y notifica)', () => {
    const onChange = vi.fn();
    const canChange = vi.fn().mockReturnValue(true);
    renderSelect(Currency.CUP, onChange, { canChange });

    fireEvent.change(screen.getByTestId('cart-currency-select'), {
      target: { value: String(Currency.USD) },
    });

    expect(canChange).toHaveBeenCalledWith(Currency.USD);
    expect(onChange).toHaveBeenCalledWith(Currency.USD);
    expect(localStorage.getItem(`lizoft.cart-currency-${USER_ID}`)).toBe(String(Currency.USD));
  });
});
