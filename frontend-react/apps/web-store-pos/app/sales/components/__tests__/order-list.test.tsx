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

describe('OrderList — money never wraps (no-cut invariant)', () => {
  it('renders the panel-header order total inside whitespace-nowrap', () => {
    const orders: Order[] = [
      makeOrder({
        orderItems: [
          {
            productId: 'prod-1',
            productName: 'Coca Cola',
            categoryId: 'cat-1',
            categoryName: 'Bebidas',
            name: 'Coca Cola',
            quantity: 2,
            price: 61728.39,
            productBusinessId: 'biz-1',
            productCosts: [],
            order: 1,
          },
        ],
      }),
    ];
    render(
      <Wrapper>
        <OrderList orders={orders} readOnly />
      </Wrapper>,
    );
    // Header total comes from getOrderTotal = Σ round2(price × qty).
    // 2 × 61 728.39 = 123 456.78 — NBSP-grouped by the formatter.
    const header = screen.getByText('$123 456.78');
    expect(header.className).toMatch(/whitespace-nowrap/);
  });

  it('renders every expanded order-item line total inside whitespace-nowrap', () => {
    render(
      <Wrapper>
        <OrderList
          orders={[
            makeOrder({
              orderItems: [
                {
                  productId: 'prod-1',
                  productName: 'Coca Cola',
                  categoryId: 'cat-1',
                  categoryName: 'Bebidas',
                  name: 'Coca Cola',
                  quantity: 2,
                  price: 23456.7,
                  productBusinessId: 'biz-1',
                  productCosts: [],
                  order: 1,
                },
              ],
            }),
          ]}
          readOnly
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-order-1'));
    // 2 × 23 456.70 = 46 913.40 — appears BOTH in the collapsed header total
    // and the expanded line total; every occurrence must carry the guard.
    const totals = screen.getAllByText('$46 913.40');
    expect(totals.length).toBeGreaterThan(0);
    for (const el of totals) {
      expect(el.className, 'every $46 913.40 must carry whitespace-nowrap').toMatch(
        /whitespace-nowrap/,
      );
    }
  });
});
