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

// Mock useAuthStore (needed for OrderOfflineService instantiation)
vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

import { useCartStore } from '~/shared/lib/stores/cart-store';
import { CartShell } from '../cart-shell';
import { PaymentType } from '@store-mgmt/domain';
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

describe('CartShell — submit action validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CART-01: Create order button exists', () => {
    it('shows "Crear pedido" button when cart has items', () => {
      const product = makeProduct();
      mockCartState({
        items: [{ product, quantity: 2 }],
        total: vi.fn().mockReturnValue(10),
      });
      renderCartShell();
      // Open the cart dropdown
      const cartButton = screen.getByRole('button', { name: /carrito/i });
      fireEvent.click(cartButton);
      expect(screen.getByText('Crear pedido')).toBeTruthy();
    });
  });

  describe('CART-02: Empty cart validation', () => {
    it('does not show the "Crear pedido" button when cart is empty', () => {
      mockCartState({ items: [], total: vi.fn().mockReturnValue(0) });
      renderCartShell();
      const cartButton = screen.getByRole('button', { name: /carrito/i });
      fireEvent.click(cartButton);
      // Payment controls section is hidden when empty — no "Crear pedido"
      expect(screen.queryByText('Crear pedido')).toBeNull();
    });
  });

  describe('CART-03: Credit + empty client name validation', () => {
    it('shows error when isCredit=true and clientName is empty on submit attempt', async () => {
      const product = makeProduct();
      mockCartState({
        items: [{ product, quantity: 1 }],
        isCredit: true,
        clientName: '',
        total: vi.fn().mockReturnValue(5),
      });
      renderCartShell();
      const cartButton = screen.getByRole('button', { name: /carrito/i });
      fireEvent.click(cartButton);

      const createButton = screen.getByText('Crear pedido');
      fireEvent.click(createButton);

      await waitFor(() => {
        // Error message for empty client name should appear
        expect(
          screen.getByText(/nombre del cliente es requerido/i),
        ).toBeTruthy();
      });
    });
  });

  describe('CART-04: Submit with valid credit order', () => {
    it('does not show client name error when clientName is provided', async () => {
      const product = makeProduct();
      mockCartState({
        items: [{ product, quantity: 1 }],
        isCredit: true,
        clientName: 'Juan Perez',
        total: vi.fn().mockReturnValue(5),
      });
      renderCartShell();
      const cartButton = screen.getByRole('button', { name: /carrito/i });
      fireEvent.click(cartButton);

      const createButton = screen.getByText('Crear pedido');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(
          screen.queryByText(/nombre del cliente es requerido/i),
        ).toBeNull();
      });
    });
  });
});

describe('CartShell — CART-05: dropdown closes on outside click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const cartButton = screen.getByRole('button', { name: /carrito/i });
    fireEvent.click(cartButton);
    expect(screen.getByText('Carrito')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-area'));

    expect(screen.queryByText('Carrito')).not.toBeInTheDocument();
  });

  it('does not close the cart panel when clicking inside it', () => {
    renderCartShell();

    const cartButton = screen.getByRole('button', { name: /carrito/i });
    fireEvent.click(cartButton);
    const title = screen.getByText('Carrito');
    expect(title).toBeInTheDocument();

    fireEvent.mouseDown(title);

    expect(screen.getByText('Carrito')).toBeInTheDocument();
  });
});
