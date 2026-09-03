import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Order } from '@store-mgmt/domain';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import { OrderList } from '../order-list';

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
    orderItems: [
      {
        productId: 'prod-1',
        productName: 'Coca Cola',
        categoryId: 'cat-1',
        categoryName: 'Bebidas',
        name: 'Coca Cola',
        quantity: 2,
        price: 1000,
        productBusinessId: 'biz-1',
        productCosts: [],
        order: 1,
      },
    ],
    total: 2000,
    itemsCount: 2,
    date: new Date('2025-01-01T10:30:00'),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

describe('OrderList — list/table parity sweep (WU6)', () => {
  it('keeps the outer panel border (regression guard: mirrors mat-expansion-panel)', () => {
    const { container } = render(
      <Wrapper>
        <OrderList orders={[makeOrder()]} readOnly />
      </Wrapper>,
    );
    const panel = container.querySelector('[data-testid="order-panel-toggle-order-1"]')
      ?.parentElement as HTMLElement;
    expect(panel.className).toMatch(/rounded-lg/);
    expect(panel.className).toMatch(/\bborder\b/);
    expect(panel.className).toMatch(/border-border/);
  });

  it('does not render a payment-type icon SVG (only the chevron remains)', () => {
    const { container } = render(
      <Wrapper>
        <OrderList orders={[makeOrder()]} readOnly />
      </Wrapper>,
    );
    // The chevron toggle icon is the only SVG expected to remain (list-parity removes
    // the local PaymentTypeIcon, not the shared ChevronDownIcon).
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('renders the order total using formatCurrency (thousands separator)', () => {
    render(
      <Wrapper>
        <OrderList orders={[makeOrder({ total: 2000 })]} readOnly />
      </Wrapper>,
    );
    expect(screen.getByText('$2 000')).toBeInTheDocument();
  });

  it('still expands to show order items on toggle click', () => {
    render(
      <Wrapper>
        <OrderList orders={[makeOrder()]} readOnly />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-order-1'));
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
  });
});
