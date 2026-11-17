import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    // A failed call must never be described as "this store has no modules": that empty-state
    // sentence is billing information, and it would be false.
    expect(screen.queryByText(esMessages['BILLING.COLLECTIONS.MODULE_BREAKDOWN_EMPTY'])).toBeNull();
    expect(screen.queryByTestId('collection-breakdown-table')).toBeNull();
  });

  it('shows only the alert when a failure arrives with rows already in hand', () => {
    renderModal({
      error: 'No se pudieron cargar los módulos.',
      rows: [makeModule({ moduleId: 1, name: 'Ventas', price: 100, currentPrice: 100 })],
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-breakdown-table')).toBeNull();
    expect(screen.queryByText('Ventas')).toBeNull();
    expect(screen.queryByText(esMessages['BILLING.COLLECTIONS.MODULE_BREAKDOWN_EMPTY'])).toBeNull();
    expect(screen.queryByTestId('collection-breakdown-total')).toBeNull();
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

describe('CollectionModuleBreakdownModal — dismissal', () => {
  it('calls onClose from the header close button', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    // Two controls share the translated "close" name: the header icon button (aria-label)
    // and the footer button (visible text). The header one comes first in DOM order.
    const closeButtons = screen.getAllByRole('button', {
      name: esMessages['GENERAL.CLOSE'],
    });
    expect(closeButtons).toHaveLength(2);

    fireEvent.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the overlay itself is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the content panel is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByTestId('collection-breakdown-store'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
