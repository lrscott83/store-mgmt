import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Module, OwnerStoreWithPlan } from '@store-mgmt/domain';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeOwnerStore(overrides: Partial<OwnerStoreWithPlan> = {}): OwnerStoreWithPlan {
  return {
    id: 'os1',
    name: 'My Store',
    isActive: true,
    approved: true,
    paymentStartDate: '2026-01-10',
    nextDueDate: '2026-03-10',
    planType: 'Pago',
    modules: [],
    ...overrides,
  };
}

function paidModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 2,
    name: 'Statistics',
    price: 2000,
    currentPrice: 2000,
    priceIncluded: false,
    discountText: '',
    selected: true,
    ...overrides,
  };
}

describe('OwnerStoreCard — disapproved stores (planType Gratis)', () => {
  it('hides price and next-due date on a disapproved store even with paid snapshot modules', async () => {
    const { OwnerStoreCard } = await import('../owner-store-card');
    render(
      <Wrapper>
        <OwnerStoreCard
          store={makeOwnerStore({
            id: 'ds1',
            approved: false,
            planType: 'Gratis',
            paymentStartDate: '2026-01-10',
            nextDueDate: null,
          })}
          modules={[paidModule()]}
          onEdit={vi.fn()}
          onEditPlan={vi.fn()}
        />
      </Wrapper>,
    );
    // Plan name always renders, even for disapproved stores.
    expect(screen.getByText(/Plan: Gratis/)).toBeInTheDocument();
    // The paid snapshot must NOT leak a price or next-due date.
    expect(screen.queryByTestId('owner-store-price-ds1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('owner-store-price-original-ds1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('owner-store-next-due-ds1')).not.toBeInTheDocument();
  });
});

describe('OwnerStoreCard — approved stores (control)', () => {
  it('shows price and next-due date on an approved paid store', async () => {
    const { OwnerStoreCard } = await import('../owner-store-card');
    render(
      <Wrapper>
        <OwnerStoreCard
          store={makeOwnerStore({
            id: 'a1',
            approved: true,
            planType: 'Pago',
            paymentStartDate: '2026-01-10',
            nextDueDate: '2026-03-10',
          })}
          modules={[paidModule()]}
          onEdit={vi.fn()}
          onEditPlan={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText(/Plan: Pago/)).toBeInTheDocument();
    expect(screen.getByTestId('owner-store-price-a1')).toHaveTextContent('2,000 USD');
    expect(screen.getByTestId('owner-store-next-due-a1')).toBeInTheDocument();
  });

  it('sums ONLY the store-selected paid modules — catalog leftovers never inflate the price (price-parity plan CAUSA-1)', async () => {
    const { OwnerStoreCard } = await import('../owner-store-card');
    // Merged-catalog shape for a Pago store: Statistics selected @100 (the
    // store's snapshot) + Warehouses/MultiStores NOT selected with catalog
    // prices — a Superior-only set the store does NOT have. The card total
    // must stay 100, not 100 + catalog leftovers.
    render(
      <Wrapper>
        <OwnerStoreCard
          store={makeOwnerStore({ id: 'a2', planType: 'Pago' })}
          modules={[
            paidModule({ id: 2, name: 'Statistics', price: 100, currentPrice: 100, selected: true }),
            paidModule({ id: 13, name: 'Warehouses', price: 500, currentPrice: 500, selected: false }),
            paidModule({ id: 14, name: 'MultiStores', price: 500, currentPrice: 500, selected: false }),
          ]}
          onEdit={vi.fn()}
          onEditPlan={vi.fn()}
        />
      </Wrapper>,
    );
    // Anchored: '1,100 USD' (catalog leftovers summed in) must NOT pass —
    // substring matching would let it slip through '100 USD'.
    expect(screen.getByTestId('owner-store-price-a2')).toHaveTextContent(/^100 USD$/);
  });

  it('renders no price line when no paid module is selected (free store against the full catalog)', async () => {
    const { OwnerStoreCard } = await import('../owner-store-card');
    render(
      <Wrapper>
        <OwnerStoreCard
          store={makeOwnerStore({ id: 'a3', planType: 'Gratis', nextDueDate: null })}
          modules={[
            paidModule({ id: 13, name: 'Warehouses', price: 500, currentPrice: 500, selected: false }),
          ]}
          onEdit={vi.fn()}
          onEditPlan={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByTestId('owner-store-price-a3')).not.toBeInTheDocument();
  });
});
