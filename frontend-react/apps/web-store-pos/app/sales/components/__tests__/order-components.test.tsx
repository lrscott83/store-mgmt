import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    orderItems: [{ productId: 'p1', productName: 'Coca-Cola', categoryId: 'c1', categoryName: 'Bebidas', name: 'Coca-Cola', quantity: 2, price: 50, productBusinessId: '', productCosts: [], order: 0 }],
    total: 100,
    itemsCount: 2,
    date: new Date('2025-01-01T10:30:00Z'),
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

// --- OrderList (accordion of orders, matches Angular's order-list.component) ---
import { OrderList } from '../order-list';

describe('OrderList', () => {
  it('renders one collapsed panel per order with time, items count, and total', () => {
    const orders = [makeOrder({ id: 'o1', total: 250 })];
    render(
      <Wrapper>
        <OrderList orders={orders} />
      </Wrapper>,
    );
    expect(screen.getByTestId('order-panel-toggle-o1')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument(); // getOrderTotal from orderItems, not order.total
  });

  it('expands a panel on click and reveals order items', () => {
    const orders = [makeOrder({ id: 'o1' })];
    render(
      <Wrapper>
        <OrderList orders={orders} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-o1'));
    expect(screen.getByText('Coca-Cola')).toBeInTheDocument();
  });

  it('does not show edit/delete actions when readOnly (default)', () => {
    const orders = [makeOrder({ id: 'o1' })];
    render(
      <Wrapper>
        <OrderList orders={orders} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-o1'));
    expect(screen.queryByTestId('edit-order-button')).toBeNull();
    expect(screen.queryByTestId('deactivate-order-button')).toBeNull();
  });

  it('shows edit/delete actions when readOnly is false', () => {
    const orders = [makeOrder({ id: 'o1' })];
    render(
      <Wrapper>
        <OrderList orders={orders} readOnly={false} onEditOrder={vi.fn()} onDeactivateOrder={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-o1'));
    expect(screen.getByTestId('edit-order-button')).toBeInTheDocument();
    expect(screen.getByTestId('deactivate-order-button')).toBeInTheDocument();
  });

  it('calls onEditOrder when Editar is clicked', () => {
    const onEditOrder = vi.fn();
    const order = makeOrder({ id: 'o1' });
    render(
      <Wrapper>
        <OrderList orders={[order]} readOnly={false} onEditOrder={onEditOrder} onDeactivateOrder={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-o1'));
    fireEvent.click(screen.getByTestId('edit-order-button'));
    expect(onEditOrder).toHaveBeenCalledWith(order);
  });

  it('requires a second click to confirm deactivate', () => {
    const onDeactivateOrder = vi.fn();
    const order = makeOrder({ id: 'o1' });
    render(
      <Wrapper>
        <OrderList orders={[order]} readOnly={false} onEditOrder={vi.fn()} onDeactivateOrder={onDeactivateOrder} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-o1'));
    fireEvent.click(screen.getByTestId('deactivate-order-button'));
    expect(onDeactivateOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('deactivate-order-button'));
    expect(onDeactivateOrder).toHaveBeenCalledWith(order);
  });

  it('does not show deactivate action for inactive orders', () => {
    const orders = [makeOrder({ id: 'o1', isActive: false })];
    render(
      <Wrapper>
        <OrderList orders={orders} readOnly={false} onEditOrder={vi.fn()} onDeactivateOrder={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-o1'));
    expect(screen.getByTestId('edit-order-button')).toBeInTheDocument();
    expect(screen.queryByTestId('deactivate-order-button')).toBeNull();
  });
});

// --- EditOrderModal (matches Angular's edit-order-modal.component: payment-type only) ---
import { EditOrderModal } from '../edit-order-modal';

describe('EditOrderModal', () => {
  it('renders the Angular literal title (SALE_CREDIT.PAYMENT_CREDIT) when open', () => {
    const order = makeOrder();
    render(
      <Wrapper>
        <EditOrderModal order={order} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Venta por Cobrar')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const order = makeOrder();
    render(
      <Wrapper>
        <EditOrderModal order={order} isOpen={false} onClose={vi.fn()} onUpdate={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a payment-type radio group defaulted to the order current type', () => {
    const order = makeOrder({ paymentType: PaymentType.Tarjeta });
    render(
      <Wrapper>
        <EditOrderModal order={order} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />
      </Wrapper>,
    );
    const tarjetaRadio = screen.getByRole('radio', { name: 'Tarjeta' }) as HTMLInputElement;
    expect(tarjetaRadio.checked).toBe(true);
  });

  it('calls onUpdate with the selected payment type and closes on Actualizar', () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    const order = makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo });
    render(
      <Wrapper>
        <EditOrderModal order={order} isOpen={true} onClose={onClose} onUpdate={onUpdate} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Zelle' }));
    fireEvent.click(screen.getByTestId('edit-order-update-button'));
    expect(onUpdate).toHaveBeenCalledWith('o1', PaymentType.Zelle);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without updating on Cerrar', () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    const order = makeOrder();
    render(
      <Wrapper>
        <EditOrderModal order={order} isOpen={true} onClose={onClose} onUpdate={onUpdate} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-order-close-button'));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
