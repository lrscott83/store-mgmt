import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { StoreModulePricingReadRow } from '@store-mgmt/domain';
import { CollectionModuleBreakdownModal } from '../collection-module-breakdown-modal';

function makeModule(
  overrides: Partial<StoreModulePricingReadRow> = {},
): StoreModulePricingReadRow {
  return {
    moduleId: 1,
    name: 'Ventas',
    isActive: true,
    priceIncluded: false,
    price: 100,
    discountPrice: 0,
    percentDiscountPrice: 0,
    currentPrice: 100,
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function renderModal(
  props: Partial<React.ComponentProps<typeof CollectionModuleBreakdownModal>> = {},
) {
  return render(
    <Wrapper>
      <CollectionModuleBreakdownModal
        open
        storeId="s1"
        storeName="Store One"
        rows={[]}
        loading={false}
        error={undefined}
        onClose={() => {}}
        {...props}
      />
    </Wrapper>,
  );
}

describe('CollectionModuleBreakdownModal — billable rows only', () => {
  it('renders the rows that contribute to the amount and omits inactive and price-included rows', () => {
    renderModal({
      rows: [
        makeModule({ moduleId: 1, name: 'Ventas', price: 100, currentPrice: 100 }),
        makeModule({ moduleId: 2, name: 'Inactivo', isActive: false, price: 200, currentPrice: 200 }),
        makeModule({
          moduleId: 3,
          name: 'Incluido',
          priceIncluded: true,
          price: 300,
          currentPrice: 300,
        }),
      ],
    });

    expect(screen.getByTestId('collection-breakdown-table')).toBeInTheDocument();
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(screen.queryByText('Inactivo')).toBeNull();
    expect(screen.queryByText('Incluido')).toBeNull();
    expect(screen.getByTestId('collection-breakdown-total')).toHaveTextContent('$100');
  });

  it('renders the struck-through base total only when the current total is below the base total', () => {
    const withDiscount = renderModal({
      rows: [
        makeModule({
          moduleId: 1,
          name: 'Ventas',
          price: 300,
          discountPrice: 30,
          currentPrice: 270,
        }),
      ],
    });

    const base = screen.getByTestId('collection-breakdown-total-base');
    expect(base).toHaveTextContent('$300');
    expect(base.className).toContain('line-through');
    expect(screen.getByTestId('collection-breakdown-total')).toHaveTextContent('$270');

    withDiscount.unmount();
    renderModal({
      rows: [makeModule({ moduleId: 1, name: 'Ventas', price: 300, currentPrice: 300 })],
    });

    expect(screen.queryByTestId('collection-breakdown-total-base')).toBeNull();
    expect(screen.getByTestId('collection-breakdown-total')).toHaveTextContent('$300');
  });
});

describe('CollectionModuleBreakdownModal — states', () => {
  it('shows the translated spinner label while loading', () => {
    renderModal({ loading: true });

    expect(
      screen.getByLabelText(esMessages['BILLING.COLLECTIONS.MODULE_BREAKDOWN_LOADING']),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('collection-breakdown-table')).toBeNull();
  });

  it('shows a role="alert" error message', () => {
    renderModal({ error: 'No se pudieron cargar los módulos.' });

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los módulos.');
  });

  it('shows the translated empty state when no row contributes to the amount', () => {
    renderModal({
      rows: [makeModule({ moduleId: 2, name: 'Inactivo', isActive: false })],
    });

    expect(
      screen.getByText(esMessages['BILLING.COLLECTIONS.MODULE_BREAKDOWN_EMPTY']),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('collection-breakdown-table')).toBeNull();
  });
});
