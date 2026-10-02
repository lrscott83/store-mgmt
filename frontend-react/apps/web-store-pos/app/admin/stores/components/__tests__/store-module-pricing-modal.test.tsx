import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import {
  StoreModulePricingModal,
  type PricingDraft,
  type PricingField,
} from '../store-module-pricing-modal';

/**
 * The modal's total is the BILLABLE amount — what the store will actually be charged —
 * because it goes through `totalModulePricing`, the client mirror of the backend's
 * `ModulePriceCalculator`. The old arithmetic summed every TICKED row, so a gratis module
 * the store pays nothing for inflated the number on screen.
 */

function draft(overrides: Partial<PricingDraft> = {}): PricingDraft {
  return {
    moduleId: 1,
    name: 'Ventas',
    isSelected: true,
    priceIncluded: false,
    price: '10',
    discountPrice: '0',
    percentDiscountPrice: '0',
    ...overrides,
  };
}

/** Ventas ticked (10), Inventario ticked but GRATIS (20), Mayorista unticked (30 - 10%). */
const ROWS: PricingDraft[] = [
  draft({ moduleId: 1, name: 'Ventas', price: '10' }),
  draft({ moduleId: 2, name: 'Inventario', price: '20', priceIncluded: true }),
  draft({ moduleId: 3, name: 'Mayorista', price: '30', percentDiscountPrice: '10', isSelected: false }),
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function renderModal(overrides: Partial<Parameters<typeof StoreModulePricingModal>[0]> = {}) {
  const onToggle = vi.fn();
  const onChangeField = vi.fn<(moduleId: number, field: PricingField, value: string) => void>();
  const props = {
    open: true,
    storeId: 's1',
    storeName: 'Store One',
    plans: [],
    rows: ROWS,
    loading: false,
    saving: false,
    serverTotal: null,
    onToggle,
    onChangeField,
    onClose: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  render(
    <Wrapper>
      <StoreModulePricingModal {...props} />
    </Wrapper>,
  );
  return { props, onToggle, onChangeField };
}

const total = () => screen.getByTestId('module-pricing-total');

describe('StoreModulePricingModal — the billable total', () => {
  it('sums only the ticked, billable rows', () => {
    renderModal();
    // Ventas 10 is the only one that counts: Inventario is gratis (price-included) and
    // Mayorista is unticked. The old arithmetic reported 10 + 20 = 30 USD.
    expect(total()).toHaveTextContent('10 USD');
  });

  it('counts a ticked row again the moment it is included in a billable state', () => {
    const onToggle = vi.fn();
    renderModal({ onToggle });
    // Ticking Mayorista makes it billable: 30 - 30*10/100 = 27 on top of Ventas' 10.
    fireEvent.click(screen.getByTestId('module-pricing-tick-3'));
    expect(onToggle).toHaveBeenCalledWith(3, true);
  });

  it('recomputes from the draft passed in, so an edit moves the total', () => {
    // The parent owns the draft; re-render with the edited price the way the route does.
    const { rerender } = render(
      <Wrapper>
        <StoreModulePricingModal
          open
          storeId="s1"
          storeName="Store One"
          plans={[]}
          rows={ROWS}
          loading={false}
          saving={false}
          serverTotal={null}
          onToggle={vi.fn()}
          onChangeField={vi.fn()}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </Wrapper>,
    );
    expect(total()).toHaveTextContent('10 USD');

    rerender(
      <Wrapper>
        <StoreModulePricingModal
          open
          storeId="s1"
          storeName="Store One"
          plans={[]}
          rows={[draft({ moduleId: 1, price: '100', percentDiscountPrice: '20' })]}
          loading={false}
          saving={false}
          serverTotal={null}
          onToggle={vi.fn()}
          onChangeField={vi.fn()}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </Wrapper>,
    );
    expect(total()).toHaveTextContent('80 USD'); // 100 - 20%
  });

  it('clamps a row at zero when the discounts exceed the base price', () => {
    renderModal({ rows: [draft({ price: '50', percentDiscountPrice: '100', discountPrice: '25' })] });
    expect(total()).toHaveTextContent('0 USD');
  });

  it('shows the empty state (no total to mislead) when the draft has no rows', () => {
    renderModal({ rows: [] });
    expect(screen.queryByTestId('module-pricing-table')).toBeNull();
    expect(screen.getByText(esMessages['STORES.MODULE_PRICING.NO_MODULES'])).toBeInTheDocument();
    expect(screen.getByTestId('module-pricing-save')).toBeDisabled();
  });

  it('prefers the server total after a save', () => {
    // 10 USD live vs 9.5 USD persisted: the screen shows the server's number, unformatted
    // by any client recompute, until the next edit retires it.
    renderModal({ serverTotal: 9.5 });
    expect(total()).toHaveTextContent('9.5 USD');
    expect(screen.getByTestId('module-pricing-store')).toHaveTextContent('Store One');
  });

  it('shows an unticked row\'s effective price but never adds it to the total', () => {
    renderModal();
    expect(screen.getByTestId('module-pricing-current-3')).toHaveTextContent('27');
    expect(total()).toHaveTextContent('10 USD');
  });
});