import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Order } from '@store-mgmt/domain';
import { Currency, EModules, PaymentType, OrderType, SalePaymentMethod } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { StorePaymentMethodsConfigService } from '~/shared/lib/payment-methods/store-payment-methods-config-service';

// Angular's order-item-list.component.ts:35-44 (deactivateOrder confirm) and :49-53
// (edit-order-modal's Swal error branch) both use SweetAlert2 — mock the shared wrapper
// module (not window.confirm/alert or raw Swal) so tests control resolution deterministically.
const confirmDialogMock = vi.fn();
const showBlockingErrorMock = vi.fn();
const showAcknowledgeErrorMock = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  showAcknowledgeError: (...args: unknown[]) => showAcknowledgeErrorMock(...args),
}));

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
        productId: 'p1',
        productName: 'Coca-Cola',
        categoryId: 'c1',
        categoryName: 'Bebidas',
        name: 'Coca-Cola',
        quantity: 2,
        price: 50,
        productBusinessId: '',
        productCosts: [],
        order: 0,
      },
    ],
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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders one collapsed panel per order with time, items count, and total', () => {
    const orders = [makeOrder({ id: 'o1', total: 250 })];
    render(
      <Wrapper>
        <OrderList orders={orders} />
      </Wrapper>,
    );
    expect(screen.getByTestId('order-panel-toggle-o1')).toBeInTheDocument();
    expect(screen.getByText('100 CUP')).toBeInTheDocument(); // getOrderTotal from orderItems, not order.total
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

  it('does not show the actions gear or any action buttons when readOnly (default)', () => {
    const orders = [makeOrder({ id: 'o1' })];
    render(
      <Wrapper>
        <OrderList orders={orders} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-o1'));
    expect(screen.queryByTestId('order-panel-actions-toggle-o1')).toBeNull();
    expect(screen.queryByTestId('edit-order-button')).toBeNull();
    expect(screen.queryByTestId('deactivate-order-button')).toBeNull();
  });

  // Gear en cabecera (petición del owner 2026-09-18): entre el precio y la flecha,
  // visible SIN expandir. Cabecera = [toggle hora+precio] [gear] [flecha] — sin
  // botones anidados (DOM inválido): tres controles hermanos en la fila.
  it('shows the gear in the collapsed panel header when readOnly is false, between the price and the chevron', () => {
    const orders = [makeOrder({ id: 'o1' })];
    render(
      <Wrapper>
        <OrderList
          orders={orders}
          readOnly={false}
          onEditOrder={vi.fn()}
          onDeactivateOrder={vi.fn()}
        />
      </Wrapper>,
    );
    const toggle = screen.getByTestId('order-panel-toggle-o1');
    const gear = screen.getByTestId('order-panel-actions-toggle-o1');
    const chevronBtn = screen.getByTestId('order-panel-chevron-o1');
    const header = toggle.parentElement!;
    const kids = Array.from(header.children);
    expect(kids[0]).toBe(toggle);
    expect(kids[kids.length - 1]).toBe(chevronBtn);
    const gearWrapper = gear.parentElement!;
    expect(kids.indexOf(gearWrapper)).toBeGreaterThan(kids.indexOf(toggle));
    expect(kids.indexOf(gearWrapper)).toBeLessThan(kids.indexOf(chevronBtn));
    // El precio vive dentro del toggle: el gear le sigue en la fila.
    expect(toggle.textContent).toContain('100\u00A0CUP');
    // El menú nace cerrado: sin opciones hasta abrir el gear.
    expect(screen.queryByTestId('edit-order-button')).toBeNull();
  });

  it('opens the gear menu with Editar and Eliminar items with their intent colors and icons', () => {
    const orders = [makeOrder({ id: 'o1' })];
    render(
      <Wrapper>
        <OrderList
          orders={orders}
          readOnly={false}
          onEditOrder={vi.fn()}
          onDeactivateOrder={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-actions-toggle-o1'));
    const editItem = screen.getByRole('menuitem', { name: 'Editar' });
    const deleteItem = screen.getByRole('menuitem', { name: 'Eliminar' });
    // Mismos testids que los botones antiguos (E2E + mocks establecidos).
    expect(editItem).toHaveAttribute('data-testid', 'edit-order-button');
    expect(deleteItem).toHaveAttribute('data-testid', 'deactivate-order-button');
    // Colores por intención (ADR-2): editar primario, eliminar peligro.
    expect(editItem.className).toContain('text-primary');
    expect(deleteItem.className).toContain('text-danger');
    // Iconos por intención: lápiz para editar, papelera para eliminar.
    expect(editItem.querySelector('svg')).not.toBeNull();
    expect(deleteItem.querySelector('svg')).not.toBeNull();
    const editPath = editItem.querySelector('svg path')?.getAttribute('d') ?? '';
    const deletePath = deleteItem.querySelector('svg path')?.getAttribute('d') ?? '';
    // EditIcon arranca con el trazo de lápiz; TrashIcon con el de papelera.
    expect(editPath).toContain('16.862 4.487');
    expect(deletePath).not.toContain('16.862 4.487');
  });

  it('does NOT render action buttons inside the expanded panel', () => {
    const orders = [makeOrder({ id: 'o1' })];
    render(
      <Wrapper>
        <OrderList
          orders={orders}
          readOnly={false}
          onEditOrder={vi.fn()}
          onDeactivateOrder={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-toggle-o1'));
    // El panel expandido muestra la tabla de items — sin botones de acción.
    expect(screen.getByText('Coca-Cola')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-order-button')).toBeNull();
    expect(screen.queryByTestId('deactivate-order-button')).toBeNull();
  });

  it('calls onEditOrder when Editar is clicked via the gear menu', () => {
    const onEditOrder = vi.fn();
    const order = makeOrder({ id: 'o1' });
    render(
      <Wrapper>
        <OrderList
          orders={[order]}
          readOnly={false}
          onEditOrder={onEditOrder}
          onDeactivateOrder={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-actions-toggle-o1'));
    fireEvent.click(screen.getByTestId('edit-order-button'));
    expect(onEditOrder).toHaveBeenCalledWith(order);
  });

  // Angular: Swal.fire({ title: GENERAL.DELETE_CONFIRM_TITLE, text: GENERAL
  // .DELETE_CONFIRM_MESSAGE_A with name=TODAY_ORDERS.TEXT, icon: 'question',
  // showCancelButton: true, confirmButtonColor: '#3456ff', cancelButtonColor: '#dc3545',
  // confirmButtonText: GENERAL.YES, cancelButtonText: GENERAL.NO }) — only runs
  // deactivateOrder when `result.isConfirmed` (order-item-list.component.ts:34-53).
  it('shows a SweetAlert2 confirm dialog and only deactivates when confirmed', async () => {
    const onDeactivateOrder = vi.fn().mockReturnValue(true);
    const order = makeOrder({ id: 'o1' });
    confirmDialogMock.mockResolvedValue(true);
    render(
      <Wrapper>
        <OrderList
          orders={[order]}
          readOnly={false}
          onEditOrder={vi.fn()}
          onDeactivateOrder={onDeactivateOrder}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-actions-toggle-o1'));
    fireEvent.click(screen.getByTestId('deactivate-order-button'));
    expect(confirmDialogMock).toHaveBeenCalledWith({
      title: 'Confirmación para eliminar',
      message: '¿Está seguro que desea eliminar esta Venta?',
      confirmButtonText: 'Si',
      cancelButtonText: 'No',
    });
    await waitFor(() => expect(onDeactivateOrder).toHaveBeenCalledWith(order));
  });

  it('does not deactivate when the SweetAlert2 confirm dialog is cancelled', async () => {
    const onDeactivateOrder = vi.fn();
    const order = makeOrder({ id: 'o1' });
    confirmDialogMock.mockResolvedValue(false);
    render(
      <Wrapper>
        <OrderList
          orders={[order]}
          readOnly={false}
          onEditOrder={vi.fn()}
          onDeactivateOrder={onDeactivateOrder}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-actions-toggle-o1'));
    fireEvent.click(screen.getByTestId('deactivate-order-button'));
    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalled());
    expect(onDeactivateOrder).not.toHaveBeenCalled();
  });

  // Angular: order-item-list.component.ts:46-52 — on deactivateOrder failure, calls
  // showErrorMessage(["La venta no pudo ser cancelada. ..."]) -> Swal.fire({ title:
  // GENERAL.ERROR, text: TODAY_ORDERS.ERROR_DELETING_ORDER with the joined literal,
  // icon: 'error', confirmButtonText: GENERAL.OK }).
  it('shows the Angular error dialog when the deactivate callback reports failure', async () => {
    const onDeactivateOrder = vi.fn().mockReturnValue(false);
    const order = makeOrder({ id: 'o1' });
    confirmDialogMock.mockResolvedValue(true);
    render(
      <Wrapper>
        <OrderList
          orders={[order]}
          readOnly={false}
          onEditOrder={vi.fn()}
          onDeactivateOrder={onDeactivateOrder}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-actions-toggle-o1'));
    fireEvent.click(screen.getByTestId('deactivate-order-button'));
    await waitFor(() =>
      expect(showAcknowledgeErrorMock).toHaveBeenCalledWith({
        title: 'Error',
        message:
          'Ocurrió un error eliminando la venta. La venta no pudo ser cancelada. Inténtelo más tarde y si persiste el problema contacte al soporte técnico.',
        confirmButtonText: 'Ok',
      }),
    );
  });

  // Orden inactiva: el gear sigue disponible pero el menú solo muestra Editar
  // (Eliminar queda oculto, misma regla de Angular para isActive=false).
  it('does not show deactivate action for inactive orders (gear menu shows only Editar)', () => {
    const orders = [makeOrder({ id: 'o1', isActive: false })];
    render(
      <Wrapper>
        <OrderList
          orders={orders}
          readOnly={false}
          onEditOrder={vi.fn()}
          onDeactivateOrder={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('order-panel-actions-toggle-o1'));
    expect(screen.getByTestId('edit-order-button')).toBeInTheDocument();
    expect(screen.queryByTestId('deactivate-order-button')).toBeNull();
  });

  // Parity fix (collapsible-panel-chevron-parity), reubicado (2026-09-18): la flecha
  // es el tercer control de la fila y rota (rotate-180) iff el panel está expandido.
  it('renders a chevron control after the gear that rotates iff the panel is expanded', () => {
    const orders = [makeOrder({ id: 'o1' })];
    render(
      <Wrapper>
        <OrderList orders={orders} />
      </Wrapper>,
    );
    const chevronSvg = () =>
      screen.getByTestId('order-panel-chevron-o1').querySelector('svg');
    expect(chevronSvg()).toBeInTheDocument();
    expect(chevronSvg()?.getAttribute('class') ?? '').not.toContain('rotate-180');
    const toggle = screen.getByTestId('order-panel-toggle-o1');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(chevronSvg()?.getAttribute('class') ?? '').toContain('rotate-180');
  });
});

// --- EditOrderModal (matches Angular's edit-order-modal.component: payment-type only) ---
import { EditOrderModal } from '../edit-order-modal';

describe('EditOrderModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

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
    // El radio se muestra como "Transferencia (CUP)" (plan 2026-09-17: Tarjeta reemplazada).
    const tarjetaRadio = screen.getByRole('radio', {
      name: 'Transferencia (CUP)',
    }) as HTMLInputElement;
    expect(tarjetaRadio.checked).toBe(true);
  });

  it('calls onUpdate with the selected payment type and closes on Actualizar', () => {
    const onUpdate = vi.fn().mockReturnValue(true);
    const onClose = vi.fn();
    const order = makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo });
    render(
      <Wrapper>
        <EditOrderModal order={order} isOpen={true} onClose={onClose} onUpdate={onUpdate} />
      </Wrapper>,
    );
    // Zelle removed from the options; Tarjeta mostrada como Transferencia (CUP).
    fireEvent.click(screen.getByRole('radio', { name: 'Transferencia (CUP)' }));
    fireEvent.click(screen.getByTestId('edit-order-update-button'));
    expect(onUpdate).toHaveBeenCalledWith('o1', PaymentType.Tarjeta);
    expect(onClose).toHaveBeenCalled();
  });

  it('no longer offers Zelle as a payment option (visual removal only, enum intact)', () => {
    const order = makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo });
    render(
      <Wrapper>
        <EditOrderModal order={order} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByRole('radio', { name: 'Zelle' })).not.toBeInTheDocument();
  });

  // Angular: edit-order-modal.component.ts:39-54 — on `updateTodayOrder` failure, Swal.fire({
  // icon: 'error', title: GENERAL.ERROR, text: dataEntry.errors[0].description }), modal
  // stays open (no `closeModal()` call in the else branch).
  it('shows a blocking error and does NOT close when onUpdate reports failure', () => {
    const onUpdate = vi.fn().mockReturnValue(false);
    const onClose = vi.fn();
    const order = makeOrder({ id: 'o1' });
    render(
      <Wrapper>
        <EditOrderModal order={order} isOpen={true} onClose={onClose} onUpdate={onUpdate} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-order-update-button'));
    expect(onClose).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'La orden no existe');
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

  // Angular: edit-order-modal.component.html:19-26 — mat-fab extended Close/
  // Actualizar buttons carry `close`/`edit` mat-icons; header close is a
  // glyph button (not a literal "✕" text character).
  describe('CloseIcon/EditIcon parity (edit-order-modal.component.html:19-26)', () => {
    it('renders CloseIcon (svg) in the header close control, not a literal "✕" character', () => {
      const order = makeOrder();
      render(
        <Wrapper>
          <EditOrderModal order={order} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />
        </Wrapper>,
      );
      // Both the header glyph button and the footer fab now share the
      // "Cerrar" accessible name — the header one is the first in DOM order.
      const [headerClose] = screen.getAllByRole('button', { name: 'Cerrar' });
      expect(headerClose).not.toHaveTextContent('✕');
      expect(headerClose.querySelector('svg')).not.toBeNull();
    });

    it('renders a CloseIcon svg inside the footer close button', () => {
      const order = makeOrder();
      render(
        <Wrapper>
          <EditOrderModal order={order} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />
        </Wrapper>,
      );
      expect(screen.getByTestId('edit-order-close-button').querySelector('svg')).not.toBeNull();
    });

    it('renders an EditIcon svg (not SaveIcon) inside the footer update button', () => {
      const order = makeOrder();
      render(
        <Wrapper>
          <EditOrderModal order={order} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />
        </Wrapper>,
      );
      const path = screen
        .getByTestId('edit-order-update-button')
        .querySelector('svg path')
        ?.getAttribute('d');
      // EditIcon's distinctive path opening — SaveIcon's path starts "M5 21h14a2...".
      expect(path).toContain('16.862 4.487');
    });
  });
});

// ─── Config por-tienda en el modal de edición de órdenes (store-payment-methods-
//     config, 2026-09-22) — catálogo = moneda → gate MultiMonedas → config ─────
describe('EditOrderModal — método de pago según config de tienda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null });
  });

  function renderEditOrderModal(orderOverrides: Partial<Order> = {}) {
    render(
      <Wrapper>
        <EditOrderModal order={makeOrder(orderOverrides)} isOpen={true} onClose={vi.fn()} onUpdate={vi.fn()} />
      </Wrapper>,
    );
  }

  it('Tarjeta histórico + Transferencia desactivada en config: radio sentinel al final, checked', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Transferencia,
      false,
    );
    useAuthStore.setState({
      user: { id: 'u1', selectedStoreId: 's1', storeModuleIds: [EModules.MultiMonedas] } as never,
    });
    renderEditOrderModal({ paymentType: PaymentType.Tarjeta });
    const radioNames = (): string[] =>
      Array.from(screen.getAllByRole('radio')).map(
        (r) => (r as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? '',
      );
    expect(radioNames()).toEqual(['Efectivo', 'Transferencia (CUP)']);
    const sentinel = screen.getByRole('radio', { name: 'Transferencia (CUP)' }) as HTMLInputElement;
    expect(sentinel.checked).toBe(true);
  });

  it('USD + MultiMonedas sin config: catálogo completo con Zelle (default no-regresión)', () => {
    useAuthStore.setState({
      user: { id: 'u1', selectedStoreId: 's1', storeModuleIds: [EModules.MultiMonedas] } as never,
    });
    renderEditOrderModal({ currency: Currency.USD });
    expect(screen.getByRole('radio', { name: 'Efectivo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Zelle' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Transferencia (USD)' })).toBeInTheDocument();
  });

  it('USD + Zelle desactivado en config: el radio Zelle desaparece', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Zelle,
      false,
    );
    useAuthStore.setState({
      user: { id: 'u1', selectedStoreId: 's1', storeModuleIds: [EModules.MultiMonedas] } as never,
    });
    renderEditOrderModal({ currency: Currency.USD });
    expect(screen.queryByRole('radio', { name: 'Zelle' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Efectivo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Transferencia (USD)' })).toBeInTheDocument();
  });
});
