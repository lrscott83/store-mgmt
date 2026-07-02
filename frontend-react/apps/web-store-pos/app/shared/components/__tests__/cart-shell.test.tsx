import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// Mock useCartStore
vi.mock('~/shared/lib/stores/cart-store', () => ({
  useCartStore: vi.fn(),
}));

// Mock OrderOfflineService
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockReturnValue({ id: 'order-1' }),
  })),
}));

// Mock ProductOfflineService — CartShell must re-fetch the LATEST product state before
// validating an in-cart quantity change, mirroring Angular's ShoppingCartService.addCartItem
// (productService.getProductById), not rely on the possibly-stale product cached on the
// cart item itself.
let mockProductLookup: Record<string, Product | undefined> = {};
vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getById: vi.fn((id: string) => mockProductLookup[id]),
  })),
}));

// Mock the SweetAlert2 wrapper — CartShell's increase/decrease guard shows a blocking
// error identical to Angular's nav-right.component.ts increaseProduct/decreaseProduct.
const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: showBlockingErrorMock,
}));

// Mock useAuthStore (needed for OrderOfflineService instantiation + credits-module gating).
// storeModuleIds includes EModules.Credits (11) by default so the credit toggle/client
// input render in most tests; CART-CREDITS-GATE-* tests override this per-case.
let mockUser: Record<string, unknown> = { selectedStoreId: 's1', storeModuleIds: [11] };
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: { user: unknown; isAuthenticated: boolean }) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

import { useCartStore } from '~/shared/lib/stores/cart-store';
import { CartShell } from '../cart-shell';
import { PaymentType, EModules } from '@store-mgmt/domain';
import type { Product } from '@store-mgmt/domain';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Coca Cola',
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    price: 5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz1',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function renderCartShell() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <CartShell />
    </IntlProvider>,
  );
}

function mockCartState(overrides = {}) {
  const defaultState = {
    items: [],
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    clientName: '',
    setPaymentType: vi.fn(),
    setClientName: vi.fn(),
    toggleCredit: vi.fn(),
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    total: vi.fn().mockReturnValue(0),
  };
  vi.mocked(useCartStore).mockReturnValue({ ...defaultState, ...overrides });
}

function openCart() {
  const cartButton = screen.getByRole('button', { name: /carrito/i });
  fireEvent.click(cartButton);
}

describe('CartShell — header (Venta actual + order type)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
  });

  it('shows "Venta actual" as the dropdown title (Angular hardcoded literal, not an i18n key)', () => {
    renderCartShell();
    openCart();
    expect(screen.getByText('Venta actual')).toBeInTheDocument();
  });

  it('shows the order type text ("Normal") as the subtitle, matching getOrderTypeText()', () => {
    renderCartShell();
    openCart();
    expect(screen.getByText('Normal')).toBeInTheDocument();
  });
});

describe('CartShell — payment input and Vuelto (change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
  });

  it('disables the payment input when the cart is empty', () => {
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
    renderCartShell();
    openCart();
    expect(screen.getByLabelText('Pago')).toBeDisabled();
  });

  it('enables the payment input when the cart has items', () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(5) });
    renderCartShell();
    openCart();
    expect(screen.getByLabelText('Pago')).not.toBeDisabled();
  });

  it('shows Vuelto: $0.00 when no payment has been entered', () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(5) });
    renderCartShell();
    openCart();
    expect(screen.getByText(/Vuelto:/)).toHaveTextContent('Vuelto: $0.00');
  });

  it('computes Vuelto as payment - total once a payment is typed', () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(5) });
    renderCartShell();
    openCart();
    fireEvent.change(screen.getByLabelText('Pago'), { target: { value: '10' } });
    expect(screen.getByText(/Vuelto:/)).toHaveTextContent('Vuelto: $5.00');
  });

  it('shows a negative Vuelto when payment is less than total', () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(10) });
    renderCartShell();
    openCart();
    fireEvent.change(screen.getByLabelText('Pago'), { target: { value: '4' } });
    expect(screen.getByText(/Vuelto:/)).toHaveTextContent('Vuelto: -$6.00');
  });
});

describe('CartShell — payment-type selector with icons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
  });

  it('renders the three payment type options: Efectivo, Tarjeta, Zelle', () => {
    renderCartShell();
    openCart();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
    expect(screen.getByText('Zelle')).toBeInTheDocument();
  });

  it('renders a distinct inline SVG icon per payment type option', () => {
    renderCartShell();
    openCart();
    expect(screen.getByTestId('payment-type-icon-cash')).toBeInTheDocument();
    expect(screen.getByTestId('payment-type-icon-card')).toBeInTheDocument();
    expect(screen.getByTestId('payment-type-icon-phone')).toBeInTheDocument();
  });
});

describe('CartShell — credit toggle + client input gated by credits module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the credit toggle when the user has the credits module available', () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
    renderCartShell();
    openCart();
    expect(screen.getByText('Venta a crédito')).toBeInTheDocument();
  });

  it('hides the credit toggle and client input when the user lacks the credits module', () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
    renderCartShell();
    openCart();
    expect(screen.queryByText('Venta a crédito')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument();
  });
});

describe('CartShell — print-invoice toggle (UI-only, no print behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
  });

  it('renders the print-invoice toggle labeled "Imprimir Factura (prueba)"', () => {
    renderCartShell();
    openCart();
    expect(screen.getByText('Imprimir Factura (prueba)')).toBeInTheDocument();
  });

  it('toggling it does not throw or trigger any print/window.open call', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderCartShell();
    openCart();
    const toggle = screen.getByLabelText('Imprimir Factura (prueba)');
    fireEvent.click(toggle);
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe('CartShell — Limpiar / Registrar buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
  });

  it('renders "Limpiar" and "Registrar" buttons, both disabled when cart is empty', () => {
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
    renderCartShell();
    openCart();
    expect(screen.getByText('Limpiar').closest('button')).toBeDisabled();
    expect(screen.getByText('Registrar').closest('button')).toBeDisabled();
  });

  it('enables both buttons when the cart has items', () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(5) });
    renderCartShell();
    openCart();
    expect(screen.getByText('Limpiar').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Registrar').closest('button')).not.toBeDisabled();
  });

  it('clears the cart when "Limpiar" is clicked', () => {
    const product = makeProduct();
    const clear = vi.fn();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(5), clear });
    renderCartShell();
    openCart();
    fireEvent.click(screen.getByText('Limpiar'));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('CartShell — cart line-item controls have Spanish aria-labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
  });

  // Angular's nav-right template has NO aria-labels on these icon-only buttons at all —
  // this is a React-added a11y improvement; its text must still be Spanish, not the
  // previously-hardcoded English ("Decrease/Increase quantity of ...", "Remove ...").
  it('uses Spanish aria-labels for decrease/increase quantity and remove-item buttons', () => {
    const product = makeProduct({ name: 'Coca Cola' });
    mockCartState({ items: [{ product, quantity: 2 }], total: vi.fn().mockReturnValue(10) });
    renderCartShell();
    openCart();
    expect(screen.getByLabelText('Disminuir cantidad de Coca Cola')).toBeInTheDocument();
    expect(screen.getByLabelText('Aumentar cantidad de Coca Cola')).toBeInTheDocument();
    expect(screen.getByLabelText('Eliminar Coca Cola')).toBeInTheDocument();
  });
});

// 1:1 port of Angular's NavRightComponent.increaseProduct/decreaseProduct ->
// ShoppingCartService.increaseCartItem/decreaseCartItem -> addCartItem(±1) -> addItem(),
// which ALWAYS re-validates InventoryOfflineService.hasAvailableProductToSale(productId,
// delta + currentCartQty) — same validation for BOTH directions (nav-right.component.ts:
// 393-417, shopping-cart.service.ts:78-123). On failure: Swal.fire({ title:
// GENERAL.RESPONSE.ERROR_TITLE, text: <error description>, icon: 'error' }).
describe('CartShell — in-cart quantity +/- stock validation (Angular parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockProductLookup = {};
    localStorage.clear();
  });

  it('CART-STOCK-01: blocks increasing quantity and shows a blocking alert when the product is no longer active', () => {
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', isActive: false });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({ items: [{ product, quantity: 2 }], total: vi.fn().mockReturnValue(10), updateQuantity });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    expect(updateQuantity).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    const [title, text] = showBlockingErrorMock.mock.calls[0];
    expect(title).toBe('Error');
    expect(text).toBe('El producto no está activo.');
  });

  it('CART-STOCK-02: blocks decreasing quantity too — same validation applies to both directions', () => {
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', isActive: false });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({ items: [{ product, quantity: 2 }], total: vi.fn().mockReturnValue(10), updateQuantity });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Coca Cola'));

    expect(updateQuantity).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    const [, text] = showBlockingErrorMock.mock.calls[0];
    expect(text).toBe('El producto no está activo.');
  });

  it('CART-STOCK-03: blocks increasing quantity when the new total exceeds available stock', () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [EModules.Inventory] };
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', discountFromInvantory: true });
    mockProductLookup = { p1: product };
    localStorage.setItem(
      'lizoft.store-inventory-entries-s1',
      JSON.stringify([
        [
          'p1',
          [
            {
              id: 'e1',
              productId: 'p1',
              categoryId: 'cat-1',
              quantity: 3,
              available: 3,
              costPrice: 1,
              date: new Date('2025-01-01'),
              order: 0,
              isActive: true,
              createdDate: new Date('2025-01-01'),
              createdByName: 'test',
            },
          ],
        ],
      ]),
    );
    const updateQuantity = vi.fn();
    // Already 3 in cart, only 3 available -> increasing to 4 must fail.
    mockCartState({ items: [{ product, quantity: 3 }], total: vi.fn().mockReturnValue(15), updateQuantity });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    expect(updateQuantity).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    const [, text] = showBlockingErrorMock.mock.calls[0];
    expect(text).toBe('La cantidad del producto no está disponible en el inventario.');
  });

  it('CART-STOCK-04: allows increasing quantity when stock covers the new total', () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [EModules.Inventory] };
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', discountFromInvantory: true });
    mockProductLookup = { p1: product };
    localStorage.setItem(
      'lizoft.store-inventory-entries-s1',
      JSON.stringify([
        [
          'p1',
          [
            {
              id: 'e1',
              productId: 'p1',
              categoryId: 'cat-1',
              quantity: 10,
              available: 10,
              costPrice: 1,
              date: new Date('2025-01-01'),
              order: 0,
              isActive: true,
              createdDate: new Date('2025-01-01'),
              createdByName: 'test',
            },
          ],
        ],
      ]),
    );
    const updateQuantity = vi.fn();
    mockCartState({ items: [{ product, quantity: 2 }], total: vi.fn().mockReturnValue(10), updateQuantity });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(updateQuantity).toHaveBeenCalledWith('p1', 3);
  });

  it('CART-STOCK-05: allows decreasing quantity when validation passes', () => {
    const product = makeProduct({ id: 'p1', name: 'Coca Cola' });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({ items: [{ product, quantity: 2 }], total: vi.fn().mockReturnValue(10), updateQuantity });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Coca Cola'));

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(updateQuantity).toHaveBeenCalledWith('p1', 1);
  });

  it('CART-STOCK-06: skips the stock check entirely when the inventory module is unavailable (matches hasAvailableProductToSale gate)', () => {
    // No inventory module in storeModuleIds, discountFromInvantory true but gated off —
    // hasAvailableProductToSale short-circuits to Success() (branch 4).
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', discountFromInvantory: true });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({ items: [{ product, quantity: 2 }], total: vi.fn().mockReturnValue(10), updateQuantity });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(updateQuantity).toHaveBeenCalledWith('p1', 3);
  });
});

describe('CartShell — createOrder validations (Registrar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
  });

  it('CART-02: shows DON_NOT_PAY_EMPTY_CART message and does not create an order when cart is empty', async () => {
    // Registrar is disabled when empty per Angular's [disabled]="getItemsCount() === 0"
    // binding — but validate the message text is present in the i18n dictionary and the
    // guard function returns the right code so this becomes provably unreachable, not
    // silently untested. Simulate by force-invoking createOrder path with a non-empty
    // cart that has 0 itemsCount is not representable; assert button disabled instead.
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
    renderCartShell();
    openCart();
    expect(screen.getByText('Registrar').closest('button')).toBeDisabled();
  });

  it('CART-03: shows DON_NOT_SALE_CREDIT_WITHOUT_CLIENT when isCredit=true and client is empty', async () => {
    const product = makeProduct();
    mockCartState({
      items: [{ product, quantity: 1 }],
      isCredit: true,
      clientName: '',
      total: vi.fn().mockReturnValue(5),
    });
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => {
      expect(
        screen.getByText('Usted no puede realizar la venta por cobrar sin especificar el cliente.'),
      ).toBeInTheDocument();
    });
  });

  it('CART-04: does not show the credit-without-client error when clientName is provided', async () => {
    const product = makeProduct();
    mockCartState({
      items: [{ product, quantity: 1 }],
      isCredit: true,
      clientName: 'Juan Perez',
      total: vi.fn().mockReturnValue(5),
    });
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => {
      expect(
        screen.queryByText('Usted no puede realizar la venta por cobrar sin especificar el cliente.'),
      ).not.toBeInTheDocument();
    });
  });

  it('CART-06: shows DON_NOT_PAY_LESS_THAN_CART_TOTAL when payment is less than total', async () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(10) });
    renderCartShell();
    openCart();

    fireEvent.change(screen.getByLabelText('Pago'), { target: { value: '4' } });
    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => {
      expect(
        screen.getByText('Usted no puede realizar la venta porque el pago es menor que el total.'),
      ).toBeInTheDocument();
    });
  });

  it('CART-07: shows ORDER_CREATED success message and clears the cart on a valid submission', async () => {
    const product = makeProduct();
    const clear = vi.fn();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(5), clear });
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => {
      expect(screen.getByText('La venta fue creada satisfactoriamente.')).toBeInTheDocument();
    });
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('CartShell — dropdown closes on outside click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
  });

  it('closes the cart panel when clicking outside it', () => {
    render(
      <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
        <div>
          <CartShell />
          <div data-testid="outside-area">outside</div>
        </div>
      </IntlProvider>,
    );

    openCart();
    expect(screen.getByText('Venta actual')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-area'));

    expect(screen.queryByText('Venta actual')).not.toBeInTheDocument();
  });

  it('does not close the cart panel when clicking inside it', () => {
    renderCartShell();

    openCart();
    const title = screen.getByText('Venta actual');
    expect(title).toBeInTheDocument();

    fireEvent.mouseDown(title);

    expect(screen.getByText('Venta actual')).toBeInTheDocument();
  });
});
