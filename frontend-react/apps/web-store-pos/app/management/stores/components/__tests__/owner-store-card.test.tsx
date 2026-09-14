import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Module, OwnerStoreWithPlan } from '@store-mgmt/domain';
import { OwnerStoreCard } from '../owner-store-card';

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
});
