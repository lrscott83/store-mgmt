import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { StorePaymentMethodsConfigService } from '~/shared/lib/payment-methods/store-payment-methods-config-service';

// Mock useCartStore
vi.mock('~/shared/lib/stores/cart-store', () => ({
  useCartStore: vi.fn(),
}));

// Mock OrderOfflineService — hoisted createOrder mock so tests can assert on the
// positional args CartShell threads into it (esp. the `details` arg, WU3).
const createOrderMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    data: { id: 'order-1' },
    succeeded: true,
    message: '',
    actionCode: 200,
    errors: [],
  }),
);
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    createOrder: createOrderMock,
  })),
}));

// Mock ProductOfflineService — CartShell must re-fetch the LATEST product state before
// validating an in-cart quantity change, mirroring Angular's ShoppingCartService.addCartItem
// (productService.getProductById), not rely on the possibly-stale product cached on the
// cart item itself.
let mockProductLookup: Record<string, Product | undefined> = {};
vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    // Async category-C surface (Phase 2 slice 6): getProductById resolves an envelope —
    // success(product) when found, failure otherwise (mirrors ProductErrors.NotExists).
    getProductById: vi.fn(async (id: string) => {
      const product = mockProductLookup[id];
      return product
        ? { data: product, succeeded: true, message: '', actionCode: 200, errors: [] }
        : { data: null, succeeded: false, message: '', actionCode: 400, errors: [] };
    }),
  })),
}));

// Mock the SweetAlert2 wrapper — CartShell's increase/decrease guard shows a blocking
// error identical to Angular's nav-right.component.ts increaseProduct/decreaseProduct.
const showBlockingErrorMock = vi.hoisted(() => vi.fn());
// T4 (Angular parity, nav-right.component.ts:164/177/190 createOrder validation guards):
// blocking info Swals, mocked via the shared wrapper rather than asserting inline DOM text.
const showAcknowledgeErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: showBlockingErrorMock,
  showAcknowledgeError: showAcknowledgeErrorMock,
}));

// TOAST-CALLSITES #2/#3 (toast-notifications-parity): Angular's createOrder success
// (toastrService.success, nav-right.component.ts:213) and NEW failure toast
// (toastrService.error, :222) now go through the shared toast helper, not Swal/inline state.
const showToastSuccessMock = vi.hoisted(() => vi.fn());
const showToastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: showToastSuccessMock,
  showToastError: showToastErrorMock,
}));

// Mock useAuthStore (needed for OrderOfflineService instantiation + credits-module gating).
// storeModuleIds includes EModules.Credits (11) by default so the credit toggle/client
// input render in most tests; CART-CREDITS-GATE-* tests override this per-case.
let mockUser: Record<string, unknown> = { selectedStoreId: 's1', storeModuleIds: [11] };
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn(
    (selector?: (s: { user: unknown; isAuthenticated: boolean }) => unknown) => {
      const state = { user: mockUser, isAuthenticated: true };
      if (typeof selector === 'function') return selector(state);
      return state;
    },
  );
  return { useAuthStore };
});

// MultiPayments (módulo 16): MultiPaymentList lee el registro de tasas de la tienda.
// Los tests lo dejan vacío (las rutas misma-moneda no necesitan tasa) y evitan el
// almacenamiento cifrado real.
let mockChannelRates: ChannelRate[] = [];
vi.mock('~/management/channel-rates/lib/services/channel-rate-offline-service', () => ({
  ChannelRateOfflineService: class {
    constructor(_storeId: string) {
      void _storeId;
    }
    getStorageChannelRates(): ChannelRate[] {
      return mockChannelRates;
    }
  },
}));

import { useCartStore } from '~/shared/lib/stores/cart-store';
import { CartShell } from '../cart-shell';
import {
  DEFAULT_PAYMENT_PRICING,
  PaymentType,
  OrderType,
  EModules,
  SalePaymentMethod,
  Currency,
  channelKey,
} from '@store-mgmt/domain';
import type { ChannelRate, Product } from '@store-mgmt/domain';
import type { MultiPaymentRow } from '~/shared/components/multipayments/multi-payment-list';

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
    orderType: OrderType.Normal,
    orderDescription: '',
    paymentType: PaymentType.Efectivo,
    // payment-methods-percent-tax: el carrito ahora lee el método real de la venta.
    salePaymentMethod: SalePaymentMethod.Efectivo,
    setSalePaymentMethod: vi.fn(),
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

  it('shows the LIVE store order type as the subtitle, not a hardcoded "Normal" (Angular parity: nav-right.component.ts getOrderTypeText() reads shoppingCartService.getOrderType() live)', () => {
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0), orderType: OrderType.Mayorista });
    renderCartShell();
    openCart();
    expect(screen.getByText('Mayorista')).toBeInTheDocument();
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
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

  it('shows Vuelto: $0 when no payment has been entered', () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(5) });
    renderCartShell();
    openCart();
    expect(screen.getByText(/Vuelto:/)).toHaveTextContent(/Vuelto:\s+0\s+CUP/);
  });

  it('computes Vuelto as payment - total once a payment is typed', () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(5) });
    renderCartShell();
    openCart();
    fireEvent.change(screen.getByLabelText('Pago'), { target: { value: '10' } });
    expect(screen.getByText(/Vuelto:/)).toHaveTextContent(/Vuelto:\s+5\s+CUP/);
  });

  it('shows a negative Vuelto when payment is less than total', () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(10) });
    renderCartShell();
    openCart();
    fireEvent.change(screen.getByLabelText('Pago'), { target: { value: '4' } });
    expect(screen.getByText(/Vuelto:/)).toHaveTextContent(/Vuelto:\s+-6\s+CUP/);
  });
});

describe('CartShell — payment-type selector with icons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
  });

  it('renders the CUP payment-method options as radio buttons: Efectivo, Transferencia (CUP) — Tarjeta reemplazada (plan 2026-09-17)', () => {
    renderCartShell();
    openCart();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
    // Tarjeta reemplazada por Transferencia en TODO el selector (datos históricos
    // Tarjeta se leen como Transferencia-CUP).
    expect(screen.queryByText('Tarjeta')).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('renders payment-method options as text-only radios (no per-type SVG icon, 2026-09-21)', () => {
    renderCartShell();
    openCart();
    // Text-only: no icons in the selector at all — neither cash nor card nor phone.
    expect(screen.queryByTestId('payment-type-icon-cash')).not.toBeInTheDocument();
    expect(screen.queryByTestId('payment-type-icon-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('payment-type-icon-phone')).not.toBeInTheDocument();
    // The labels themselves are still there.
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Transferencia (CUP)')).toBeInTheDocument();
  });
});

describe('CartShell — credit toggle + client input gated by credits module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the credit toggle as a switch labeled "Crédito" (Angular GENERAL.CREDIT parity)', () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
    renderCartShell();
    openCart();
    // Angular uses mat-slide-toggle + label "Crédito" (not a checkbox / "Venta a crédito")
    expect(screen.getByRole('switch', { name: 'Crédito' })).toBeInTheDocument();
    expect(screen.queryByText('Venta a crédito')).not.toBeInTheDocument();
  });

  it('hides the credit toggle and client input when the user lacks the credits module', () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
    renderCartShell();
    openCart();
    expect(screen.queryByRole('switch', { name: 'Crédito' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument();
  });
});

describe('CartShell — print-invoice toggle (UI-only, no print behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
  });

  it('renders the print-invoice toggle as a switch labeled "Imprimir Factura (prueba)"', () => {
    renderCartShell();
    openCart();
    expect(screen.getByText('Imprimir Factura (prueba)')).toBeInTheDocument();
    // Angular uses mat-slide-toggle — parity means a switch, not a checkbox
    expect(screen.getByRole('switch', { name: 'Imprimir Factura (prueba)' })).toBeInTheDocument();
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
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
    });
    renderCartShell();
    openCart();
    expect(screen.getByText('Limpiar').closest('button')).not.toBeDisabled();
    expect(screen.getByText('Registrar').closest('button')).not.toBeDisabled();
  });

  it('clears the cart when "Limpiar" is clicked', () => {
    const product = makeProduct();
    const clear = vi.fn();
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      clear,
    });
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

describe('CartShell — line-item layout (2026-09-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
  });

  // User request: the quantity belongs NEXT TO THE PRICE in parens ("Precio: $1 234 (10)"),
  // and the +/- controls sit flush against the right edge with minimal margin.
  it('shows the quantity next to the price in parens, NOT appended to the name', () => {
    const product = makeProduct({ name: 'Coca Cola', price: 5 });
    mockCartState({ items: [{ product, quantity: 10 }], total: vi.fn().mockReturnValue(50) });
    renderCartShell();
    openCart();

    const name = screen.getByText('Coca Cola');
    expect(name).toBeInTheDocument();
    expect(name).not.toHaveTextContent('(10)');
    // Price line: "Precio: " label (es.ts:259) + formatted unit price + " (quantity)".
    expect(screen.getByText(/Precio:\s+5\s+CUP \(10\)/)).toBeInTheDocument();
    // Line subtotal is still present (price × quantity) inside the product row.
    const row = name.closest('li');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent(/50\s+CUP/);
  });

  it('renders the +/- controls as the last element of the row so they align to the right', () => {
    const product = makeProduct({ name: 'Coca Cola' });
    mockCartState({ items: [{ product, quantity: 2 }], total: vi.fn().mockReturnValue(10) });
    renderCartShell();
    openCart();

    const row = screen.getByText('Coca Cola').closest('li');
    expect(row).not.toBeNull();
    // The quantity-controls group (containing the increase button) must be the rightmost child.
    const increase = screen.getByLabelText('Aumentar cantidad de Coca Cola');
    expect(row?.lastElementChild).toContainElement(increase);
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

  it('CART-STOCK-01: blocks increasing quantity and shows a blocking alert when the product is no longer active', async () => {
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', isActive: false });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product, quantity: 2 }],
      total: vi.fn().mockReturnValue(10),
      updateQuantity,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalledTimes(1));
    expect(updateQuantity).not.toHaveBeenCalled();
    const [title, text] = showBlockingErrorMock.mock.calls[0];
    expect(title).toBe('Error');
    expect(text).toBe('El producto no está activo.');
  });

  it('CART-STOCK-02: blocks decreasing quantity too — same validation applies to both directions', async () => {
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', isActive: false });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product, quantity: 2 }],
      total: vi.fn().mockReturnValue(10),
      updateQuantity,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Coca Cola'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalledTimes(1));
    expect(updateQuantity).not.toHaveBeenCalled();
    const [, text] = showBlockingErrorMock.mock.calls[0];
    expect(text).toBe('El producto no está activo.');
  });

  it('CART-STOCK-03: blocks increasing quantity when the new total exceeds available stock', async () => {
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
    mockCartState({
      items: [{ product, quantity: 3 }],
      total: vi.fn().mockReturnValue(15),
      updateQuantity,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalledTimes(1));
    expect(updateQuantity).not.toHaveBeenCalled();
    const [, text] = showBlockingErrorMock.mock.calls[0];
    // 2026-09-07: the stock ceiling is appended so the merchant sees how many
    // units are actually available (user-mandated message change).
    expect(text).toBe(
      'La cantidad del producto no está disponible en el inventario.\nDisponibles en inventario: 3.',
    );
  });

  it('CART-STOCK-04: allows increasing quantity when stock covers the new total', async () => {
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
    mockCartState({
      items: [{ product, quantity: 2 }],
      total: vi.fn().mockReturnValue(10),
      updateQuantity,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('p1', 3));
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('CART-STOCK-05: allows decreasing quantity when validation passes', async () => {
    const product = makeProduct({ id: 'p1', name: 'Coca Cola' });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product, quantity: 2 }],
      total: vi.fn().mockReturnValue(10),
      updateQuantity,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Coca Cola'));

    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('p1', 1));
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('CART-STOCK-06: skips the stock check entirely when the inventory module is unavailable (matches hasAvailableProductToSale gate)', async () => {
    // No inventory module in storeModuleIds, discountFromInvantory true but gated off —
    // hasAvailableProductToSale short-circuits to Success() (branch 4).
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', discountFromInvantory: true });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product, quantity: 2 }],
      total: vi.fn().mockReturnValue(10),
      updateQuantity,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('p1', 3));
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Venta mayorista en el carrito — floor del menor rango + re-tier de precio
// (2026-09-07): el − no puede dejar la línea por debajo del menor rango (la
// elimina), y los ± recalculan el unitPrice al rango aplicable.
// ═══════════════════════════════════════════════════════════════════════════

describe('CartShell — wholesale cart floor rule + tier repricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    localStorage.clear();
  });

  /** Producto mayorista: packSize 24, rangos 1→$9, 11→$8, retail $10. */
  function makeWholesaleBeer(): Product {
    return makeProduct({
      id: 'beer-1',
      name: 'Cerveza',
      price: 10,
      wholesaleEnabled: true,
      wholesalePackSize: 24,
      wholesaleTiers: [
        { minPacks: 1, pricePerUnit: 9 },
        { minPacks: 11, pricePerUnit: 8 },
      ],
    });
  }

  it('WS-CART-01: − en el mínimo del primer rango (minPacks 1) elimina la línea del carrito', async () => {
    const product = makeWholesaleBeer();
    mockProductLookup = { 'beer-1': product };
    const removeItem = vi.fn();
    const updateQuantity = vi.fn();
    // 1 paquete (24 unidades) en carrito, primer rango minPacks 1 → packs-1 = 0 < 1.
    mockCartState({
      items: [{ product, quantity: 24, price: 9 }],
      total: vi.fn().mockReturnValue(216),
      removeItem,
      updateQuantity,
      orderType: OrderType.Mayorista,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Cerveza'));

    await waitFor(() => expect(removeItem).toHaveBeenCalledWith('beer-1'));
    expect(updateQuantity).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('WS-CART-02: − cuando el resultado queda bajo el mínimo de un primer rango > 1 elimina la línea', async () => {
    const product = makeProduct({
      id: 'beer-1',
      name: 'Cerveza',
      price: 10,
      wholesaleEnabled: true,
      wholesalePackSize: 24,
      wholesaleTiers: [{ minPacks: 5, pricePerUnit: 9 }], // primer rango en 5
    });
    mockProductLookup = { 'beer-1': product };
    const removeItem = vi.fn();
    const updateQuantity = vi.fn();
    // 5 paquetes en carrito → packs-1 = 4 < 5 → elimina.
    mockCartState({
      items: [{ product, quantity: 120, price: 9 }], // 5 × 24
      total: vi.fn().mockReturnValue(1080),
      removeItem,
      updateQuantity,
      orderType: OrderType.Mayorista,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Cerveza'));

    await waitFor(() => expect(removeItem).toHaveBeenCalledWith('beer-1'));
    expect(updateQuantity).not.toHaveBeenCalled();
  });

  it('WS-CART-03: − por encima del mínimo reduce y recalcula el precio al rango aplicable', async () => {
    const product = makeWholesaleBeer();
    mockProductLookup = { 'beer-1': product };
    const updateQuantity = vi.fn();
    // 12 paquetes (288 unidades) a $8 (rango 11+) → −1 = 11 paquetes, sigue en
    // rango 11+ → precio $8; el assert clave es que el precio se pasa al store.
    mockCartState({
      items: [{ product, quantity: 288, price: 8 }],
      total: vi.fn().mockReturnValue(2304),
      updateQuantity,
      orderType: OrderType.Mayorista,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Cerveza'));

    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('beer-1', 264, 8));
  });

  it('WS-CART-04: + cruza al rango superior y recalcula el unitPrice al del rango nuevo', async () => {
    const product = makeWholesaleBeer();
    mockProductLookup = { 'beer-1': product };
    const updateQuantity = vi.fn();
    // 10 paquetes (240 unidades) a $9 → +1 = 11 paquetes cruza al rango 11+ ($8).
    mockCartState({
      items: [{ product, quantity: 240, price: 9 }],
      total: vi.fn().mockReturnValue(2160),
      updateQuantity,
      orderType: OrderType.Mayorista,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Cerveza'));

    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('beer-1', 264, 8));
  });

  it('WS-CART-05: − cruzando hacia abajo de rango recalcula el unitPrice al rango menor', async () => {
    const product = makeWholesaleBeer();
    mockProductLookup = { 'beer-1': product };
    const updateQuantity = vi.fn();
    // 11 paquetes (264 unidades) a $8 → −1 = 10 paquetes, cae del rango 11 al 1 → $9.
    mockCartState({
      items: [{ product, quantity: 264, price: 8 }],
      total: vi.fn().mockReturnValue(2112),
      updateQuantity,
      orderType: OrderType.Mayorista,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Cerveza'));

    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('beer-1', 240, 9));
  });

  it('WS-CART-06: + en un producto normal actualiza la cantidad SIN tocar el precio', async () => {
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', price: 5 });
    mockProductLookup = { p1: product };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product, quantity: 2 }],
      total: vi.fn().mockReturnValue(10),
      updateQuantity,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Coca Cola'));

    // Producto sin config mayorista: updateQuantity va SIN tercer argumento.
    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('p1', 3));
    expect(updateQuantity.mock.calls[0].length).toBe(2);
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

  // T4 (Angular parity, nav-right.component.ts:190): blocking info Swal, not an inline banner.
  it('CART-03: shows DON_NOT_SALE_CREDIT_WITHOUT_CLIENT via showAcknowledgeError (icon info) when isCredit=true and client is empty', async () => {
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
      expect(showAcknowledgeErrorMock).toHaveBeenCalledWith({
        title: 'Información',
        message: 'Usted no puede realizar la venta por cobrar sin especificar el cliente.',
        confirmButtonText: 'Ok',
        icon: 'info',
      });
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
      expect(showAcknowledgeErrorMock).not.toHaveBeenCalled();
    });
  });

  // T4 (Angular parity, nav-right.component.ts:177): blocking info Swal, not an inline banner.
  it('CART-06: shows DON_NOT_PAY_LESS_THAN_CART_TOTAL via showAcknowledgeError (icon info) when payment is less than total', async () => {
    const product = makeProduct();
    mockCartState({ items: [{ product, quantity: 1 }], total: vi.fn().mockReturnValue(10) });
    renderCartShell();
    openCart();

    fireEvent.change(screen.getByLabelText('Pago'), { target: { value: '4' } });
    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => {
      expect(showAcknowledgeErrorMock).toHaveBeenCalledWith({
        title: 'Información',
        message: 'Usted no puede realizar la venta porque el pago es menor que el total.',
        confirmButtonText: 'Ok',
        icon: 'info',
      });
    });
  });

  it('CART-07: closes the cart popup, shows the ORDER_CREATED success toast (with "Éxito" title), and clears the cart on a valid submission', async () => {
    const product = makeProduct();
    const clear = vi.fn();
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      clear,
    });
    renderCartShell();
    openCart();
    expect(screen.getByText('Venta actual')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => {
      expect(showToastSuccessMock).toHaveBeenCalledWith(
        'La venta fue creada satisfactoriamente.',
        'Éxito',
      );
    });
    expect(clear).toHaveBeenCalledTimes(1);
    // Angular fires the success toast FIRST, then clears the cart (nav-right.component.ts:213-221:
    // toastrService.success(...) precedes clearShoppingCart()). Assert that ordering here.
    expect(showToastSuccessMock.mock.invocationCallOrder[0]).toBeLessThan(
      clear.mock.invocationCallOrder[0],
    );
    // Sale registered -> the cart popup closes (Angular ngbDropdown autoClose parity).
    expect(screen.queryByText('Venta actual')).not.toBeInTheDocument();
  });

  // TOAST-CALLSITES #3 (NEW behavior, toast-notifications-parity): Angular's createOrder
  // `else` branch (nav-right.component.ts:222-225) fires `toastrService.error(ORDER_NOT_CREATED,
  // ...)` when `response.succeeded` is false. Previously React had no equivalent (generic
  // inline `GENERAL.ERROR`) — this closes that functional gap.
  it('CART-08: shows the ORDER_NOT_CREATED error toast (with "Error" title) when createOrder resolves succeeded:false, without closing the cart or clearing it', async () => {
    const product = makeProduct();
    const clear = vi.fn();
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      clear,
    });
    createOrderMock.mockResolvedValueOnce({
      data: null,
      succeeded: false,
      message: '',
      actionCode: 400,
      errors: [],
    });
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => {
      expect(showToastErrorMock).toHaveBeenCalledWith(
        'Ocurrío un error creando la venta. Por favor, vuelva a intentarlo y si persiste contacte al equipo de soporte técnico.',
        'Error',
      );
    });
    expect(clear).not.toHaveBeenCalled();
    // The cart panel stays open — Angular's failure branch never calls closeCartDropdown().
    expect(screen.getByText('Venta actual')).toBeInTheDocument();
    // The old generic inline error surface is gone.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // T2.0 verification finding (toast-notifications-parity): Angular's `.subscribe((response) =>
  // {...})` in nav-right.component.ts registers ONLY a `next` handler — no RxJS error callback
  // — and OrderOfflineService.createOrder (order-offline.service.ts:42-65) always resolves via
  // `Success$(order)` and never emits an Observable error. Angular therefore has NO
  // user-facing feedback for a thrown/rejected createOrder call; it is not a code path Angular
  // exercises. Per design ADR-4's non-negotiable ("never a raw err.message, no persisted
  // banner"), React's catch branch mirrors that absence of feedback rather than assuming the
  // same error toast as the succeeded:false branch (a deviation from the design's literal
  // assumption, flagged in the apply report).
  it("CART-09 (T2.0 finding): a thrown/rejected createOrder shows NO toast (mirrors Angular's absent error handler) and leaks no raw err.message", async () => {
    const product = makeProduct();
    const clear = vi.fn();
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      clear,
    });
    createOrderMock.mockRejectedValueOnce(new Error('raw boom, do not leak me'));
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => {
      expect(createOrderMock).toHaveBeenCalledTimes(1);
    });
    expect(showToastSuccessMock).not.toHaveBeenCalled();
    expect(showToastErrorMock).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/raw boom/)).not.toBeInTheDocument();
  });

  // WU3 — createOrder must thread the cart store's orderDescription into the `details`
  // arg (5th positional), mirroring Angular nav-right.component.ts:208 passing
  // shoppingCartService.getOrderDescription() to orderService.createOrder().
  it('CART-DESC-01: threads store.orderDescription into createOrder details arg', async () => {
    const product = makeProduct();
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      orderDescription: 'entrega tarde',
    });
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    expect(createOrderMock.mock.calls[0][4]).toBe('entrega tarde');
  });

  it("CART-DESC-02: passes '' (not undefined) as details when orderDescription is default", async () => {
    const product = makeProduct();
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      orderDescription: '',
    });
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    expect(createOrderMock.mock.calls[0][4]).toBe('');
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

// ═══════════════════════════════════════════════════════════════════════════
// Carrito mayorista — badge, línea y paso de +/- en paquetes (2026-09-06)
// ═══════════════════════════════════════════════════════════════════════════

describe('CartShell — venta mayorista mostrada en paquetes', () => {
  const beer = makeProduct({
    id: 'beer',
    name: 'Cerveza',
    price: 700,
    wholesaleEnabled: true,
    wholesalePackSize: 24,
    wholesaleUnitLabel: 'caja',
    wholesaleTiers: [{ minPacks: 1, pricePerUnit: 660 }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockProductLookup = {};
    localStorage.clear();
  });

  it('el badge del carrito cuenta paquetes: 72 unidades = 3 cajas', () => {
    mockCartState({
      items: [{ product: beer, quantity: 72 }],
      total: vi.fn().mockReturnValue(47520),
      orderType: OrderType.Mayorista,
    });
    renderCartShell();
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('3');
  });

  it('la línea del carrito muestra la cantidad en cajas y el precio de la caja', () => {
    // 2 cajas a 660/unidad → precio de caja 660 × 24 = 15 840.
    mockCartState({
      items: [{ product: beer, quantity: 48, price: 660 }],
      total: vi.fn().mockReturnValue(31680),
      orderType: OrderType.Mayorista,
    });
    renderCartShell();
    openCart();
    expect(screen.getByText(/Cajas: 2 · Precio:\s+15\s+840\s+CUP/)).toBeInTheDocument();
    // Ya no se muestra la cantidad en unidades entre paréntesis.
    expect(screen.queryByText(/\(48\)/)).not.toBeInTheDocument();
  });

  it('el botón + agrega un paquete: +24 unidades con un click (y re-tier del precio)', async () => {
    mockProductLookup = { beer };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product: beer, quantity: 48 }],
      total: vi.fn().mockReturnValue(31680),
      updateQuantity,
      orderType: OrderType.Mayorista,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Cerveza'));

    // 48 + 24 = 72 units = 3 packs; the tier price (660) is re-threaded on
    // every wholesale ± (2026-09-07 re-tier rule).
    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('beer', 72, 660));
  });

  it('el botón − quita un paquete: −24 unidades con un click (y re-tier del precio)', async () => {
    mockProductLookup = { beer };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product: beer, quantity: 48 }],
      total: vi.fn().mockReturnValue(31680),
      updateQuantity,
      orderType: OrderType.Mayorista,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Cerveza'));

    // 48 - 24 = 24 units = 1 pack; still >= minPacks 1, so the line stays and
    // the tier price (660) is re-threaded (2026-09-07 re-tier rule).
    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('beer', 24, 660));
  });

  it('un carrito normal sigue mostrando unidades y precio unitario (sin regresión)', () => {
    const normal = makeProduct({ id: 'n1', name: 'Dulce', price: 5 });
    mockCartState({
      items: [{ product: normal, quantity: 10 }],
      total: vi.fn().mockReturnValue(50),
    });
    renderCartShell();
    openCart();
    expect(screen.getByText(/Precio:\s+5\s+CUP \(10\)/)).toBeInTheDocument();
  });

  it('el badge de un carrito normal sigue contando unidades', () => {
    const normal = makeProduct({ id: 'n1', name: 'Dulce', price: 5 });
    mockCartState({
      items: [{ product: normal, quantity: 10 }],
      total: vi.fn().mockReturnValue(50),
    });
    renderCartShell();
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('10');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Venta NORMAL con producto mayorista (cart-wholesale-by-order-type, 2026-09-23):
// el modo lo define el orderType del carrito, no la config del producto — un
// producto mayorista vendido en venta normal se comporta como retail (unidades,
// precio unitario, paso ±1, sin piso de paquetes ni re-tier).
// ═══════════════════════════════════════════════════════════════════════════

describe('CartShell — venta NORMAL con producto mayorista', () => {
  /** Producto mayorista: packSize 24, rangos 1→$9, 11→$8, retail $10. */
  const wholesaleBeer = makeProduct({
    id: 'beer-1',
    name: 'Cerveza',
    price: 10,
    wholesaleEnabled: true,
    wholesalePackSize: 24,
    wholesaleTiers: [
      { minPacks: 1, pricePerUnit: 9 },
      { minPacks: 11, pricePerUnit: 8 },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockProductLookup = {};
    localStorage.clear();
  });

  it('el badge cuenta UNIDADES: 1 unidad del producto mayorista → badge 1 y "Registrar" habilitado', () => {
    mockCartState({
      items: [{ product: wholesaleBeer, quantity: 1 }],
      total: vi.fn().mockReturnValue(10),
    });
    renderCartShell();
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('1');
    openCart();
    expect(screen.getByText('Registrar').closest('button')).not.toBeDisabled();
  });

  it('la línea muestra el formato retail "Precio: $10 (1)", no "Cajas: 0"', () => {
    mockCartState({
      items: [{ product: wholesaleBeer, quantity: 1 }],
      total: vi.fn().mockReturnValue(10),
    });
    renderCartShell();
    openCart();
    expect(screen.getByText(/Precio:\s+10\s+CUP \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Cajas:/)).not.toBeInTheDocument();
  });

  it('+ mueve la cantidad de a 1 unidad SIN precio mayorista (sin re-tier)', async () => {
    mockProductLookup = { 'beer-1': wholesaleBeer };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product: wholesaleBeer, quantity: 1 }],
      total: vi.fn().mockReturnValue(10),
      updateQuantity,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Cerveza'));

    // 1 + 1 = 2 unidades; sin tercer argumento (no se re-tier el precio).
    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('beer-1', 2));
    expect(updateQuantity.mock.calls[0].length).toBe(2);
  });

  it('− mueve la cantidad de a 1 unidad; al llegar a 0 la línea se elimina (qty <= 0 del store)', async () => {
    mockProductLookup = { 'beer-1': wholesaleBeer };
    const updateQuantity = vi.fn();
    const removeItem = vi.fn();
    mockCartState({
      items: [{ product: wholesaleBeer, quantity: 1 }],
      total: vi.fn().mockReturnValue(10),
      updateQuantity,
      removeItem,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Disminuir cantidad de Cerveza'));

    // 1 - 1 = 0 → updateQuantity(id, 0): la implementación del store elimina la
    // línea (qty <= 0 → removeItem), sin piso de paquetes ni re-tier.
    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('beer-1', 0));
    expect(updateQuantity.mock.calls[0].length).toBe(2);
    expect(removeItem).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('el MISMO producto en venta MAYORISTA conserva el paso por paquetes con re-tier', async () => {
    mockProductLookup = { 'beer-1': wholesaleBeer };
    const updateQuantity = vi.fn();
    mockCartState({
      items: [{ product: wholesaleBeer, quantity: 24, price: 9 }],
      total: vi.fn().mockReturnValue(216),
      updateQuantity,
      orderType: OrderType.Mayorista,
    });

    renderCartShell();
    openCart();
    fireEvent.click(screen.getByLabelText('Aumentar cantidad de Cerveza'));

    // 24 + 24 = 48 unidades = 2 paquetes; tier 1 → $9.
    await waitFor(() => expect(updateQuantity).toHaveBeenCalledWith('beer-1', 48, 9));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MultiPayments (módulo 16) — la lista reemplaza el bloque legacy de pago y
// gobierna el submit de la venta (plan 2026-09-18, T7).
// ═══════════════════════════════════════════════════════════════════════════

describe('CartShell — multi-payment list (módulo 16)', () => {
  const MULTI_PAYMENTS_STORE_MODULES = [11, EModules.MultiPayments];

  function paymentRow(overrides: Partial<MultiPaymentRow> = {}): MultiPaymentRow {
    return {
      id: 'row-1',
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      amount: 5,
      ...overrides,
    };
  }

  function mockMultiPaymentCart(overrides = {}) {
    const product = makeProduct({ price: 5 });
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { selectedStoreId: 's1', storeModuleIds: MULTI_PAYMENTS_STORE_MODULES };
    mockChannelRates = [];
    mockProductLookup = {};
  });

  it('renders the multi-payment list and hides the legacy method radios / amount input', () => {
    mockMultiPaymentCart({ payments: [paymentRow()] });
    renderCartShell();
    openCart();

    expect(screen.getByTestId('multi-payment-list')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pago')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('keeps the legacy payment block when module 16 is absent (regression guard)', () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockMultiPaymentCart();
    renderCartShell();
    openCart();

    expect(screen.queryByTestId('multi-payment-list')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pago')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
  });

  it('each row picks its channel with a single select (method + currency), not two', () => {
    mockMultiPaymentCart({ payments: [paymentRow({ amount: 5 })] });
    renderCartShell();
    openCart();

    expect(screen.queryByTestId('multi-payment-method')).not.toBeInTheDocument();
    expect(screen.queryByTestId('multi-payment-currency')).not.toBeInTheDocument();
    const select = screen.getByTestId('multi-payment-channel') as HTMLSelectElement;
    expect(select.value).toBe(channelKey(SalePaymentMethod.Efectivo, Currency.CUP));
    const labels = [...select.options].map((option) => option.textContent ?? '');
    expect(labels).toContain('Efectivo');
    expect(labels).toContain('Transferencia (CUP)');
  });

  it('T22/A2: siembra el primer canal del catálogo de la venta (MLC → Transferencia)', async () => {
    const setPayments = vi.fn();
    mockUser = { id: 'u1', selectedStoreId: 's1', storeModuleIds: MULTI_PAYMENTS_STORE_MODULES };
    localStorage.setItem('lizoft.cart-currency-u1', String(Currency.MLC));
    const product = makeProduct({ price: 5, currency: Currency.MLC });
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      cartCurrency: () => Currency.MLC,
      payments: [],
      setPayments,
    });
    renderCartShell();
    openCart();

    await waitFor(() => expect(setPayments).toHaveBeenCalledTimes(1));
    const rows = setPayments.mock.calls[0][0] as MultiPaymentRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      method: SalePaymentMethod.Transferencia,
      currency: Currency.MLC,
      amount: 5,
    });
  });

  it('submitting with payments passes the converted OrderPayment[] and derives the legacy method from the first payment', async () => {
    const payments = [
      paymentRow({ id: 'row-1', method: SalePaymentMethod.Transferencia, amount: 5 }),
    ];
    mockMultiPaymentCart({ payments });
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    const args = createOrderMock.mock.calls[0];
    // 7th positional (index 6): the authoritative method, from the FIRST payment.
    expect(args[6]).toBe(SalePaymentMethod.Transferencia);
    // 8th positional (index 7): the persisted payments (amounts in order-currency
    // UNITS, decision A — the same unit as Order.total, NOT integer cents).
    expect(args[7]).toEqual([
      {
        method: SalePaymentMethod.Transferencia,
        currency: Currency.CUP,
        amount: 5,
        rateApplied: 1,
        rateMethod: null,
        rateCurrency: null,
        rateEffectiveFrom: null,
        amountInOrderCurrency: 5,
      },
    ]);
  });

  it('disables the submit while a paid sale is not covered by the payments', () => {
    mockMultiPaymentCart({ payments: [paymentRow({ amount: 1 })] });
    renderCartShell();
    openCart();

    expect(screen.getByText('Registrar').closest('button')).toBeDisabled();
  });

  it('enables the submit once the payments cover the total', () => {
    mockMultiPaymentCart({ payments: [paymentRow({ amount: 5 })] });
    renderCartShell();
    openCart();

    expect(screen.getByText('Registrar').closest('button')).not.toBeDisabled();
  });

  it('T5: siembra una fila Efectivo por el total cuando no hay pagos', async () => {
    const setPayments = vi.fn();
    mockMultiPaymentCart({ payments: [], setPayments });
    renderCartShell();
    openCart();

    await waitFor(() => expect(setPayments).toHaveBeenCalledTimes(1));
    const rows = setPayments.mock.calls[0][0] as MultiPaymentRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      amount: 5,
    });
  });

  it('T5: no re-siembra cuando ya hay filas', () => {
    const setPayments = vi.fn();
    mockMultiPaymentCart({ payments: [paymentRow({ amount: 5 })], setPayments });
    renderCartShell();
    openCart();

    expect(setPayments).not.toHaveBeenCalled();
  });

  it('T6: "Agregar pago" abre el popup de canales', () => {
    mockMultiPaymentCart({ payments: [paymentRow({ amount: 5 })] });
    renderCartShell();
    openCart();

    fireEvent.click(screen.getByTestId('multi-payment-add'));
    expect(screen.getByTestId('multi-payment-add-dialog')).toBeInTheDocument();
  });

  it('T7: el botón "Cobrar" ya no existe (el registro va por "Registrar")', () => {
    mockMultiPaymentCart({ payments: [paymentRow({ amount: 5 })] });
    renderCartShell();
    openCart();

    expect(screen.queryByTestId('multi-payment-settle')).not.toBeInTheDocument();
    expect(screen.getByText('Registrar')).toBeInTheDocument();
  });

  // Decision 8 (ratified 2026-09-18): with multi-pago active the total the UI displays,
  // guards and submits is the UNPRICED line sum — a priced payment method must NOT
  // change it (otherwise the UI and the persisted order would disagree).
  it('decision 8: with module 16 a priced payment method does not change the multi-pay total (line sum)', () => {
    const pricingKey = `${Number(Currency.CUP)}|${SalePaymentMethod.Efectivo}`;
    // total() = 5 (line sum); a priced total would be 10, so a payment of 5 would leave
    // the sale short and block the submit if the pricing leaked into the multi-pay total.
    DEFAULT_PAYMENT_PRICING[pricingKey] = { percent: 100, tax: 0 };
    try {
      mockMultiPaymentCart({ payments: [paymentRow({ amount: 5 })] });
      renderCartShell();
      openCart();

      expect(screen.getByText('Registrar').closest('button')).not.toBeDisabled();
      expect(screen.getByTestId('multi-payment-remaining')).toHaveTextContent('0');
    } finally {
      delete DEFAULT_PAYMENT_PRICING[pricingKey];
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MultiPayments (módulo 16, T8) — carrito multi-moneda: cada línea se convierte
// a la moneda de la venta elegida antes de cobrar/registrar.
// ═══════════════════════════════════════════════════════════════════════════

describe('CartShell — mixed-currency cart conversion (módulo 16, T8)', () => {
  const MULTI_PAYMENTS_STORE_MODULES = [11, EModules.MultiPayments];

  function paymentRow(overrides: Partial<MultiPaymentRow> = {}): MultiPaymentRow {
    return {
      id: 'row-1',
      method: SalePaymentMethod.Efectivo,
      currency: Currency.USD,
      amount: 12,
      ...overrides,
    };
  }

  /** La moneda de la venta la fija la preferencia persistida del usuario (T6). */
  function setSaleCurrencyPreference(currency: Currency) {
    localStorage.setItem('lizoft.cart-currency-u1', String(currency));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'u1', selectedStoreId: 's1', storeModuleIds: MULTI_PAYMENTS_STORE_MODULES };
    // 350 CUP por 1 USD — CUP→USD resoluble, EUR no.
    mockChannelRates = [
      {
        method: SalePaymentMethod.Efectivo,
        currency: Currency.CUP,
        value: 350,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      },
    ];
    mockProductLookup = {};
  });

  it('T8-01: displays each line and the total converted to the sale currency (USD)', () => {
    setSaleCurrencyPreference(Currency.USD);
    const usdProduct = makeProduct({
      id: 'usd-1',
      name: 'Cafe',
      price: 10,
      currency: Currency.USD,
    });
    const cupProduct = makeProduct({
      id: 'cup-1',
      name: 'Pan',
      price: 350,
      currency: Currency.CUP,
    });
    mockCartState({
      items: [
        { product: usdProduct, quantity: 1 },
        { product: cupProduct, quantity: 2 },
      ],
      // Raw mixed-unit line sum — deliberately IGNORED once converted.
      total: vi.fn().mockReturnValue(710),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();

    // USD line subtotal is identity; the CUP line (350 CUP × 2) becomes 1 USD × 2.
    expect(screen.getByText(/^10\s+USD$/)).toBeInTheDocument();
    expect(screen.getByText(/^2\s+USD$/)).toBeInTheDocument();
    // Converted total: 10 + 2 = 12 USD (shown in the header and the multi-pay summary).
    expect(screen.getAllByText(/^12\s+USD$/).length).toBeGreaterThan(0);
  });

  it('T8-02: submits converted line prices/currency and the converted total in the sale currency', async () => {
    setSaleCurrencyPreference(Currency.USD);
    const usdProduct = makeProduct({
      id: 'usd-1',
      name: 'Cafe',
      price: 10,
      currency: Currency.USD,
    });
    const cupProduct = makeProduct({
      id: 'cup-1',
      name: 'Pan',
      price: 350,
      currency: Currency.CUP,
    });
    const cartItems = [
      { product: usdProduct, quantity: 1 },
      { product: cupProduct, quantity: 2 },
    ];
    mockCartState({
      items: cartItems,
      total: vi.fn().mockReturnValue(710),
      cartCurrency: () => Currency.CUP,
      payments: [paymentRow({ amount: 12 })],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();
    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    const orderItems = createOrderMock.mock.calls[0][0] as Array<{
      price: number;
      product: { id: string; currency: number };
    }>;
    expect(orderItems[0].price).toBe(10);
    expect(orderItems[0].product.currency).toBe(Currency.USD);
    // 350 CUP → 1 USD (350 CUP por USD).
    expect(orderItems[1].price).toBe(1);
    expect(orderItems[1].product.currency).toBe(Currency.USD);

    // The store's cart items are NEVER mutated by the conversion.
    expect(cartItems[1].product.currency).toBe(Currency.CUP);
  });

  it('T8-03 (T4): a sale currency that cannot convert the cart falls back to the native currency at load — never "0 USD"', () => {
    setSaleCurrencyPreference(Currency.USD);
    mockChannelRates = []; // no CUP rate → CUP→USD is not resolvable
    const cupProduct = makeProduct({
      id: 'cup-1',
      name: 'Pan',
      price: 350,
      currency: Currency.CUP,
    });
    mockCartState({
      items: [{ product: cupProduct, quantity: 1 }],
      total: vi.fn().mockReturnValue(350),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();

    // T4 load-time fallback: sale currency = native CUP, so there is no conversion
    // error and the total is the native amount — never a "0 USD".
    expect(screen.queryByTestId('cart-line-conversion-error')).not.toBeInTheDocument();
    expect(screen.queryByText(/^0\s+USD$/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/350\s+CUP/).length).toBeGreaterThan(0);
  });

  it('T8-04: without module 16 the cart items are passed unchanged (regression guard)', async () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    const product = makeProduct({ id: 'p1', name: 'Coca Cola', price: 5 });
    mockCartState({
      items: [{ product, quantity: 2 }],
      total: vi.fn().mockReturnValue(10),
      cartCurrency: () => Currency.CUP,
    });
    renderCartShell();
    openCart();
    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    const orderItems = createOrderMock.mock.calls[0][0] as Array<{ price?: number }>;
    // Untouched line: no converted price was stamped.
    expect(orderItems[0].price).toBeUndefined();
    expect(screen.queryByTestId('cart-line-conversion-error')).not.toBeInTheDocument();
  });
});

// ─── Config por-tienda en el catálogo del carrito (store-payment-methods-config,
//     2026-09-22) — catálogo = moneda → gate MultiMonedas → config ─────────────

describe('CartShell — método de pago según config de tienda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11, EModules.MultiMonedas] };
  });

  function renderUsdSale() {
    mockCartState({
      items: [],
      total: vi.fn().mockReturnValue(0),
      cartCurrency: () => Currency.USD,
    });
    renderCartShell();
    openCart();
  }

  it('USD + MultiMonedas sin config: catálogo completo con Zelle (default no-regresión)', () => {
    renderUsdSale();
    expect(screen.getByText('Zelle')).toBeInTheDocument();
    expect(screen.getByText('Transferencia (USD)')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('USD + MultiMonedas + Zelle desactivado en config: el radio Zelle desaparece', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Zelle,
      false,
    );
    renderUsdSale();
    expect(screen.queryByText('Zelle')).not.toBeInTheDocument();
    expect(screen.getByText('Transferencia (USD)')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('Zelle reactivado en config: el radio Zelle vuelve', () => {
    const svc = new StorePaymentMethodsConfigService('s1');
    svc.setMethodEnabled('s1', SalePaymentMethod.Zelle, false);
    svc.setMethodEnabled('s1', SalePaymentMethod.Zelle, true);
    renderUsdSale();
    expect(screen.getByText('Zelle')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('re-pinea a Efectivo cuando el método seleccionado se desactivó en config', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Zelle,
      false,
    );
    const setSalePaymentMethod = vi.fn();
    mockCartState({
      items: [],
      total: vi.fn().mockReturnValue(0),
      cartCurrency: () => Currency.USD,
      salePaymentMethod: SalePaymentMethod.Zelle,
      setSalePaymentMethod,
    });
    renderCartShell();
    openCart();
    // Zelle fuera del catálogo → el select vuelve al primer método disponible.
    expect(setSalePaymentMethod).toHaveBeenCalledWith(SalePaymentMethod.Efectivo);
  });

  it('CUP sin MultiMonedas + Transferencia desactivada: queda solo Efectivo', () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Transferencia,
      false,
    );
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockCartState({
      items: [],
      total: vi.fn().mockReturnValue(0),
      cartCurrency: () => Currency.CUP,
    });
    renderCartShell();
    openCart();
    expect(screen.queryByText('Transferencia (CUP)')).not.toBeInTheDocument();
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T3 — el selector "Moneda" sube a la fila del encabezado, antes de "Limpiar".
// ═══════════════════════════════════════════════════════════════════════════

describe('CartShell — T3: selector de moneda en la fila del encabezado', () => {
  const MULTI_PAYMENTS_STORE_MODULES = [11, EModules.MultiPayments];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'u1', selectedStoreId: 's1', storeModuleIds: MULTI_PAYMENTS_STORE_MODULES };
    mockChannelRates = [];
    mockProductLookup = {};
    mockCartState({
      items: [],
      total: vi.fn().mockReturnValue(0),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
    });
  });

  it('T3-01: el selector vive en la fila del encabezado, en el mismo grupo y antes de "Limpiar"', () => {
    renderCartShell();
    openCart();

    const select = screen.getByTestId('cart-currency-select');
    const limpiar = screen.getByText('Limpiar').closest('button');
    expect(limpiar).not.toBeNull();

    // Same toolbar group as "Limpiar"/"Registrar" — same visual row.
    expect(limpiar!.parentElement).toContainElement(select);
    // T15: the select has no wrapper of its own any more (the visible label was
    // removed); it is a direct child of the toolbar group.
    expect(select.parentElement).toBe(limpiar!.parentElement);
    // Rendered BEFORE "Limpiar" in DOM order.
    expect(
      select.compareDocumentPosition(limpiar!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Inside the header row that also holds "Venta actual" (no row of its own).
    const headerRow = screen.getByText('Venta actual').parentElement?.parentElement;
    expect(headerRow).toContainElement(select);
  });

  it('T15-01: el selector no muestra label visible, pero conserva su nombre accesible', () => {
    renderCartShell();
    openCart();

    const select = screen.getByLabelText('Moneda');
    expect(select).toBe(screen.getByTestId('cart-currency-select'));
    // The visible label text is gone from the header.
    expect(screen.queryByText('Moneda')).not.toBeInTheDocument();
  });

  it('T15-02: el encabezado es una sola fila con el select y los botones a la derecha', () => {
    renderCartShell();
    openCart();

    const headerRow = screen.getByText('Venta actual').parentElement?.parentElement;
    expect(headerRow).not.toBeNull();
    // Single row: no wrap on the header toolbar.
    expect(headerRow!.className).not.toContain('flex-wrap');

    const select = screen.getByTestId('cart-currency-select');
    const limpiar = screen.getByText('Limpiar').closest('button');
    const registrar = screen.getByText('Registrar').closest('button');
    const toolbar = select.parentElement;
    expect(toolbar).toBe(limpiar!.parentElement);
    expect(toolbar).toBe(registrar!.parentElement);
    // The toolbar group (select + both buttons) is the rightmost element of the row.
    expect(headerRow!.lastElementChild).toBe(toolbar);
  });

  it('T3-02: sin el módulo 16 el selector no existe y el encabezado sigue intacto', () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    renderCartShell();
    openCart();

    expect(screen.queryByTestId('cart-currency-select')).not.toBeInTheDocument();
    expect(screen.getByText('Venta actual')).toBeInTheDocument();
    expect(screen.getByText('Limpiar')).toBeInTheDocument();
    expect(screen.getByText('Registrar')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T4 — el cambio de moneda se bloquea si alguna línea no puede convertirse.
// ═══════════════════════════════════════════════════════════════════════════

describe('CartShell — T4: bloqueo del cambio de moneda', () => {
  const MULTI_PAYMENTS_STORE_MODULES = [11, EModules.MultiPayments];

  function setSaleCurrencyPreference(currency: Currency) {
    localStorage.setItem('lizoft.cart-currency-u1', String(currency));
  }

  function cupRate(): ChannelRate {
    return {
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      value: 350,
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'u1', selectedStoreId: 's1', storeModuleIds: MULTI_PAYMENTS_STORE_MODULES };
    mockChannelRates = [];
    mockProductLookup = {};
  });

  it('T4-01: con una línea sin tasa, elegir otra moneda no cambia el select y muestra el aviso', () => {
    const cupProduct = makeProduct({
      id: 'cup-1',
      name: 'Pan',
      price: 350,
      currency: Currency.CUP,
    });
    mockCartState({
      items: [{ product: cupProduct, quantity: 1 }],
      total: vi.fn().mockReturnValue(350),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();

    const select = screen.getByTestId('cart-currency-select') as HTMLSelectElement;
    expect(select.value).toBe(String(Currency.CUP));

    fireEvent.change(select, { target: { value: String(Currency.USD) } });

    // Rejected: the selector stays on CUP and nothing is persisted.
    expect(select.value).toBe(String(Currency.CUP));
    expect(localStorage.getItem('lizoft.cart-currency-u1')).toBeNull();
    // Clear message naming the culprit line and currencies.
    const alert = screen.getByTestId('cart-currency-change-error');
    expect(alert).toHaveTextContent('USD');
    expect(alert).toHaveTextContent('Pan');
    expect(alert).toHaveTextContent('CUP');
    // Total never renders "0 <currency>".
    expect(screen.queryByText(/^0\s+USD$/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/350\s+CUP/).length).toBeGreaterThan(0);
  });

  it('T4-02: con tasa disponible el cambio se permite y convierte', () => {
    mockChannelRates = [cupRate()];
    const cupProduct = makeProduct({
      id: 'cup-1',
      name: 'Pan',
      price: 350,
      currency: Currency.CUP,
    });
    mockCartState({
      items: [{ product: cupProduct, quantity: 1 }],
      total: vi.fn().mockReturnValue(350),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();

    const select = screen.getByTestId('cart-currency-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: String(Currency.USD) } });

    expect(select.value).toBe(String(Currency.USD));
    expect(localStorage.getItem('lizoft.cart-currency-u1')).toBe(String(Currency.USD));
    // 350 CUP / 350 = 1 USD, shown in the total and the line.
    expect(screen.getAllByText(/^1\s+USD$/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('cart-currency-change-error')).not.toBeInTheDocument();
  });

  it('T4-03: una preferencia persistida que no convierte cae a la moneda nativa al cargar (nunca "0 USD")', () => {
    setSaleCurrencyPreference(Currency.USD);
    mockChannelRates = [];
    const cupProduct = makeProduct({
      id: 'cup-1',
      name: 'Pan',
      price: 350,
      currency: Currency.CUP,
    });
    mockCartState({
      items: [{ product: cupProduct, quantity: 1 }],
      total: vi.fn().mockReturnValue(350),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();

    expect(screen.queryByTestId('cart-line-conversion-error')).not.toBeInTheDocument();
    expect(screen.queryByText(/^0\s+USD$/)).not.toBeInTheDocument();
    const select = screen.getByTestId('cart-currency-select') as HTMLSelectElement;
    expect(select.value).toBe(String(Currency.CUP));
    expect(screen.getAllByText(/350\s+CUP/).length).toBeGreaterThan(0);
  });

  it('T4-04: un carrito mixto que la moneda nativa no puede convertir conserva el bloqueo duro', () => {
    const usdProduct = makeProduct({
      id: 'usd-1',
      name: 'Cafe',
      price: 10,
      currency: Currency.USD,
    });
    const eurProduct = makeProduct({
      id: 'eur-1',
      name: 'Vino',
      price: 5,
      currency: Currency.EUR,
    });
    mockCartState({
      items: [
        { product: usdProduct, quantity: 1 },
        { product: eurProduct, quantity: 1 },
      ],
      total: vi.fn().mockReturnValue(15),
      cartCurrency: () => Currency.USD,
      payments: [],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();

    // Native USD cannot convert the EUR line (no rate) → hard block stays.
    const error = screen.getByTestId('cart-line-conversion-error');
    expect(error).toHaveAttribute('data-error-code', 'ChannelRate.RateNotFound');
    expect(screen.getByText('Registrar').closest('button')).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T17 — "Limpiar" vuelve la moneda de la venta a CUP y descarta el aviso.
// ═══════════════════════════════════════════════════════════════════════════

describe('CartShell — T17: Limpiar reinicia la moneda a CUP', () => {
  const MULTI_PAYMENTS_STORE_MODULES = [11, EModules.MultiPayments];

  function setSaleCurrencyPreference(currency: Currency) {
    localStorage.setItem('lizoft.cart-currency-u1', String(currency));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'u1', selectedStoreId: 's1', storeModuleIds: MULTI_PAYMENTS_STORE_MODULES };
    mockChannelRates = [];
    mockProductLookup = {};
  });

  it('T17-01: tras "Limpiar" el selector vuelve a CUP y la preferencia se persiste en CUP', () => {
    setSaleCurrencyPreference(Currency.USD);
    mockChannelRates = [
      {
        method: SalePaymentMethod.Efectivo,
        currency: Currency.CUP,
        value: 350,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      },
    ];
    const cupProduct = makeProduct({ id: 'cup-1', name: 'Pan', price: 350, currency: Currency.CUP });
    mockCartState({
      items: [{ product: cupProduct, quantity: 1 }],
      total: vi.fn().mockReturnValue(350),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();

    const select = screen.getByTestId('cart-currency-select') as HTMLSelectElement;
    expect(select.value).toBe(String(Currency.USD));

    fireEvent.click(screen.getByText('Limpiar'));

    expect(select.value).toBe(String(Currency.CUP));
    expect(localStorage.getItem('lizoft.cart-currency-u1')).toBe(String(Currency.CUP));
    expect(screen.queryByTestId('cart-currency-change-error')).not.toBeInTheDocument();
  });

  it('T17-02: tras "Limpiar" el aviso de cambio bloqueado desaparece', () => {
    const cupProduct = makeProduct({ id: 'cup-1', name: 'Pan', price: 350, currency: Currency.CUP });
    mockCartState({
      items: [{ product: cupProduct, quantity: 1 }],
      total: vi.fn().mockReturnValue(350),
      cartCurrency: () => Currency.CUP,
      payments: [],
      setPayments: vi.fn(),
    });
    renderCartShell();
    openCart();

    // No rate → choosing USD is rejected and the alert appears.
    fireEvent.change(screen.getByTestId('cart-currency-select'), {
      target: { value: String(Currency.USD) },
    });
    expect(screen.getByTestId('cart-currency-change-error')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Limpiar'));

    expect(screen.queryByTestId('cart-currency-change-error')).not.toBeInTheDocument();
  });
});
