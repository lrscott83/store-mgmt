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

import { CurrencyFilter } from '../currency-filter';

function userWith(storeModuleIds: number[]) {
  return { id: 'u1', storeModuleIds };
}

function renderFilter(
  currencies: Currency[],
  value: Currency,
  onChange = vi.fn(),
): ReturnType<typeof vi.fn> {
  render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <CurrencyFilter currencies={currencies} value={value} onChange={onChange} />
    </IntlProvider>,
  );
  return onChange;
}

function optionLabels(): string[] {
  return screen.getAllByRole('option').map((option) => option.textContent ?? '');
}

describe('CurrencyFilter', () => {
  beforeEach(() => {
    mockUser = userWith([2, 3, EModules.MultiMonedas]);
  });

  it('renders nothing with a single currency even when the module is active', () => {
    renderFilter([Currency.USD], Currency.USD);
    expect(screen.queryByTestId('currency-filter')).not.toBeInTheDocument();
  });

  it('renders nothing when the MultiMonedas module is inactive', () => {
    mockUser = userWith([2, 3]);
    renderFilter([Currency.USD, Currency.EUR], Currency.USD);
    expect(screen.queryByTestId('currency-filter')).not.toBeInTheDocument();
  });

  it('renders the centered row with the label before the select and the agreed options', () => {
    renderFilter([Currency.USD, Currency.EUR, Currency.CUP], Currency.USD);

    const wrapper = screen.getByTestId('currency-filter');
    expect(wrapper.className).toContain('justify-center');
    expect(wrapper.className).toContain('items-center');

    const label = screen.getByText('Moneda');
    const select = screen.getByTestId('currency-filter-select');
    expect(label.tagName).toBe('LABEL');
    expect(select.previousElementSibling).toBe(label);

    expect(optionLabels()).toEqual(['USD', 'EUR', 'CUP']);
    expect((select as HTMLSelectElement).value).toBe(String(Currency.USD));
  });

  it('calls onChange with the chosen currency', () => {
    const onChange = renderFilter([Currency.USD, Currency.EUR], Currency.USD);

    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });

    expect(onChange).toHaveBeenCalledWith(Currency.EUR);
  });
});
