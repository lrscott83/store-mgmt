import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { StoreCurrencyConfigService } from '~/shared/lib/store-currency-config-service';

vi.mock('~/shared/lib/stores/cart-store', () => ({
  useCartStore: vi.fn(),
}));

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
  OrderOfflineService: vi.fn().mockImplementation(() => ({ createOrder: createOrderMock })),
}));

let mockProductLookup: Record<string, Product | undefined> = {};
vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getProductById: vi.fn(async (id: string) => {
      const product = mockProductLookup[id];
      return product
        ? { data: product, succeeded: true, message: '', actionCode: 200, errors: [] }
        : { data: null, succeeded: false, message: '', actionCode: 400, errors: [] };
    }),
  })),
}));

const alertMocks = vi.hoisted(() => ({
  showBlockingError: vi.fn(),
  showAcknowledgeError: vi.fn(),
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
}));
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: alertMocks.showBlockingError,
  showAcknowledgeError: alertMocks.showAcknowledgeError,
}));
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: alertMocks.showToastSuccess,
  showToastError: alertMocks.showToastError,
}));

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

let mockChannelRates: ChannelRate[] = [];
const getStorageChannelRatesMock = vi.hoisted(() => vi.fn());
vi.mock('~/management/channel-rates/lib/services/channel-rate-offline-service', () => ({
  ChannelRateOfflineService: class {
    constructor(_storeId: string) {
      void _storeId;
    }
    getStorageChannelRates(): ChannelRate[] {
      return getStorageChannelRatesMock();
    }
  },
}));
getStorageChannelRatesMock.mockImplementation(() => mockChannelRates);

import { useCartStore } from '~/shared/lib/stores/cart-store';
import { CartShell } from '../cart-shell';
import { EModules, OrderType, PaymentType, SalePaymentMethod, Currency } from '@store-mgmt/domain';
import type { ChannelRate, Product } from '@store-mgmt/domain';

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
    salePaymentMethod: SalePaymentMethod.Efectivo,
    setSalePaymentMethod: vi.fn(),
    isCredit: false,
    clientName: '',
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
  fireEvent.click(screen.getByRole('button', { name: /carrito/i }));
}

describe('CartShell — passes the sale snapshot to createOrder (2026-10-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11] };
    mockChannelRates = [];
    mockProductLookup = {};
  });

  it('no MultiMonedas: threads an identity line snapshot + sale rate + cash/change/store', async () => {
    const product = makeProduct({ price: 5, currency: Currency.CUP });
    mockCartState({
      items: [{ product, quantity: 1 }],
      total: vi.fn().mockReturnValue(5),
      cartCurrency: () => Currency.CUP,
    });
    renderCartShell();
    openCart();
    fireEvent.change(screen.getByLabelText('Pago'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    const snapshot = createOrderMock.mock.calls[0][8];

    expect(snapshot.saleCurrencyRate).toBeNull();
    expect(snapshot.tenderedAmount).toBe(10);
    expect(snapshot.change).toBe(5);
    expect(snapshot.storeId).toBe('s1');
    expect(snapshot.lineSnapshots).toHaveLength(1);
    expect(snapshot.lineSnapshots[0]).toMatchObject({
      originalUnitPrice: 5,
      originalCurrency: Currency.CUP,
      conversionRate: 1,
      conversionRateId: null,
      conversionRateEffectiveFrom: null,
    });
  });

  it('MultiMonedas: threads the converted line original + the sale-currency rate snapshot', async () => {
    mockUser = { selectedStoreId: 's1', storeModuleIds: [11, EModules.MultiMonedas] };
    new StoreCurrencyConfigService('s1').setSellCurrency(Currency.USD);
    mockChannelRates = [
      {
        method: SalePaymentMethod.Efectivo,
        currency: Currency.CUP,
        buyValue: 350,
        sellValue: 350,
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      },
    ];
    const cup = makeProduct({ id: 'cup-1', name: 'Pan', price: 350, currency: Currency.CUP });
    mockCartState({
      items: [{ product: cup, quantity: 2 }],
      total: vi.fn().mockReturnValue(700),
      cartCurrency: () => Currency.CUP,
    });
    renderCartShell();
    openCart();
    fireEvent.change(screen.getByLabelText('Pago'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    const snapshot = createOrderMock.mock.calls[0][8];

    expect(snapshot.lineSnapshots[0]).toMatchObject({
      originalUnitPrice: 350,
      originalCurrency: Currency.CUP,
      conversionRate: 350,
    });
    // Sale currency USD has no persisted row → the synthetic pivot (value 1, no id).
    expect(snapshot.saleCurrencyRate).toEqual({ value: 1, id: null, effectiveFrom: null });
    expect(snapshot.tenderedAmount).toBe(2);
    expect(snapshot.change).toBe(0);
    expect(snapshot.storeId).toBe('s1');
  });
});
