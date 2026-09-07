import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Order } from '@store-mgmt/domain';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import { OrderItemList } from '../order-item-list';

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
    date: new Date('2025-01-01'),
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

describe('OrderItemList — list/table parity sweep (WU6)', () => {
  it('renders rows without a per-row border', () => {
    const { container } = render(
      <Wrapper>
        <OrderItemList order={makeOrder()} readOnly />
      </Wrapper>,
    );
    const row = container.querySelector('tr') as HTMLElement;
    expect(row.className).not.toMatch(/border-b/);
  });

  it('renders quantity as plain text, not a chip', () => {
    render(
      <Wrapper>
        <OrderItemList order={makeOrder()} readOnly />
      </Wrapper>,
    );
    const qty = screen.getByText('2');
    expect(qty.className).not.toMatch(/rounded-full/);
    expect(qty.className).toMatch(/font-semibold/);
    expect(qty.className).toMatch(/text-primary/);
  });

  it('renders the line total using formatCurrency (thousands separator)', () => {
    render(
      <Wrapper>
        <OrderItemList order={makeOrder()} readOnly />
      </Wrapper>,
    );
    expect(screen.getByText('$2 000')).toBeInTheDocument();
  });
});

describe('OrderItemList — a price never wraps across lines (no-cut invariant)', () => {
  it('renders the line total inside a whitespace-nowrap span', () => {
    render(
      <Wrapper>
        <OrderItemList order={makeOrder()} readOnly />
      </Wrapper>,
    );
    // getByText normalizes NBSP to a regular space, so the text matcher is the
    // pre-NBSP shape; the structural assertion below is the actual invariant.
    const total = screen.getByText('$2 000');
    expect(total.className).toMatch(/whitespace-nowrap/);
  });

  it('uses the NBSP-grouped formatter output for grouped amounts', () => {
    render(
      <Wrapper>
        <OrderItemList
          order={makeOrder({
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
          })}
          readOnly
        />
      </Wrapper>,
    );
    // 2 × 23 456.70 = 46 913.40 — getByText normalizes the DOM's NBSP to a
    // regular space, so the matcher uses the plain-space shape; the byte-level
    // NBSP guarantee itself is pinned in format-currency.test.ts.
    const total = screen.getByText('$46 913.40');
    expect(total.className).toMatch(/whitespace-nowrap/);
  });
});
