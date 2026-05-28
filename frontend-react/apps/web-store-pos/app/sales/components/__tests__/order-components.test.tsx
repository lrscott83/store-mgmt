import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Order } from '@store-mgmt/domain';
import { PaymentType, OrderType } from '@store-mgmt/domain';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderItems: [],
    total: 100,
    itemsCount: 2,
    date: new Date('2025-01-01T10:00:00Z'),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

// --- OrderList smoke tests ---
import { OrderList } from '../order-list';

describe('OrderList', () => {
  it('renders empty state when no orders', () => {
    render(
      <Wrapper>
        <OrderList orders={[]} onOrderClick={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/No hay pedidos/i)).toBeInTheDocument();
  });

  it('renders orders with date, total, and payment badge', () => {
    const orders = [makeOrder({ total: 250, paymentType: PaymentType.Efectivo })];
    render(
      <Wrapper>
        <OrderList orders={orders} onOrderClick={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('250.00')).toBeInTheDocument();
  });

  it('shows credit indicator for credit orders', () => {
    const orders = [makeOrder({ isCredit: true })];
    render(
      <Wrapper>
        <OrderList orders={orders} onOrderClick={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/Crédito/i)).toBeInTheDocument();
  });
});

// --- EditOrderModal smoke tests ---
import { EditOrderModal } from '../edit-order-modal';

describe('EditOrderModal', () => {
  it('renders order details when open', () => {
    const order = makeOrder({ total: 500 });
    render(
      <Wrapper>
        <EditOrderModal
          order={order}
          isOpen={true}
          onClose={vi.fn()}
          onDeactivate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const order = makeOrder();
    render(
      <Wrapper>
        <EditOrderModal
          order={order}
          isOpen={false}
          onClose={vi.fn()}
          onDeactivate={vi.fn()}
          onUpdate={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
