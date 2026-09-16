import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { OwnerStoreWithPlan } from '@store-mgmt/domain';

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
    // Canonical plan price (plan 2026-09-15): Pago costs 2,000 originally, the
    // discount takes it to 2,000 — no strikethrough by default.
    planPrice: 2000,
    planCurrentPrice: 2000,
    modules: [],
    ...overrides,
  };
}

describe('OwnerStoreCard — disapproved stores (planType Gratis)', () => {
  it('hides price and next-due date on a disapproved store (null canonical price)', async () => {
    const { OwnerStoreCard } = await import('../owner-store-card');
    render(
      <Wrapper>
        <OwnerStoreCard
          store={makeOwnerStore({
            id: 'ds1',
            approved: false,
            planType: 'Gratis',
            planPrice: null,
            planCurrentPrice: null,
            paymentStartDate: '2026-01-10',
            nextDueDate: null,
          })}
          onEdit={vi.fn()}
          onEditPlan={vi.fn()}
        />
      </Wrapper>,
    );

    // Plan name always renders, even for disapproved stores.
    expect(screen.getByText(/Plan: Gratis/)).toBeInTheDocument();
    // The backend nulled the canonical price — no price or next-due date may leak.
    expect(screen.queryByTestId('owner-store-price-ds1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('owner-store-price-original-ds1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('owner-store-next-due-ds1')).not.toBeInTheDocument();
  });
});

describe('OwnerStoreCard — approved stores (canonical price)', () => {
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
            planPrice: 2000,
            planCurrentPrice: 2000,
          })}
          onEdit={vi.fn()}
          onEditPlan={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText(/Plan: Pago/)).toBeInTheDocument();
    expect(screen.getByTestId('owner-store-price-a1')).toHaveTextContent('2,000 USD');
    expect(screen.getByTestId('owner-store-next-due-a1')).toBeInTheDocument();
  });

  it('strikes the original through when the canonical price is discounted', async () => {
    const { OwnerStoreCard } = await import('../owner-store-card');
    render(
      <Wrapper>
        <OwnerStoreCard
          store={makeOwnerStore({
            id: 'a4',
            planType: 'Superior',
            planPrice: 2000,
            planCurrentPrice: 1000,
            nextDueDate: '2026-10-31',
          })}
          onEdit={vi.fn()}
          onEditPlan={vi.fn()}
        />
      </Wrapper>,
    );
    const original = screen.getByTestId('owner-store-price-original-a4');
    expect(original).toHaveTextContent('2,000');
    expect(original.className).toContain('line-through');
    expect(screen.getByTestId('owner-store-price-a4')).toHaveTextContent('1,000 USD');
  });

  it('renders no price line when the canonical price is null (missing/inactive plan)', async () => {
    const { OwnerStoreCard } = await import('../owner-store-card');
    render(
      <Wrapper>
        <OwnerStoreCard
          store={makeOwnerStore({
            id: 'a5',
            planType: 'Pago',
            planPrice: null,
            planCurrentPrice: null,
          })}
          onEdit={vi.fn()}
          onEditPlan={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText(/Plan: Pago/)).toBeInTheDocument();
    expect(screen.queryByTestId('owner-store-price-a5')).not.toBeInTheDocument();
    expect(screen.queryByTestId('owner-store-price-original-a5')).not.toBeInTheDocument();
  });
});
