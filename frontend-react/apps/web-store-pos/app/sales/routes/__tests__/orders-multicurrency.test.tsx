import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, OrderType, PaymentType } from '@store-mgmt/domain';
import type { Order } from '@store-mgmt/domain';
import { readStoreOrders } from '~/shared/lib/multistore/multi-store-aggregator';
import { OrdersPage } from '../orders';

const auth = vi.hoisted(() => ({
  state: {
    user: { selectedStoreId: 's1', storeModuleIds: [] as number[] },
    isAuthenticated: true,
  },
}));
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof auth.state) => unknown) =>
    typeof selector === 'function' ? selector(auth.state) : auth.state,
  ),
}));

// Multi-store gate — OFF by default (matches the real hook for a non-owner), ON per test.
const multiStore = vi.hoisted(() => ({
  enabled: false,
  stores: [] as { id: string; name: string }[],
}));
vi.mock('~/shared/lib/hooks/use-multi-store', () => ({
  useMultiStore: () => ({ enabled: multiStore.enabled, stores: multiStore.stores }),
}));

vi.mock('~/shared/lib/multistore/multi-store-aggregator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/shared/lib/multistore/multi-store-aggregator')>();
  return {
    ...actual,
    unwrapStoreDek: vi.fn().mockResolvedValue(new Uint8Array([1])),
    readStoreOrders: vi.fn().mockReturnValue([]),
  };
});

const fixtures = vi.hoisted(() => ({ orders: [] as Order[] }));
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getStorageOrders: vi.fn(() => fixtures.orders),
  })),
}));

vi.mock('~/sales/lib/repositories/product-repository', () => ({
  ProductRepository: vi.fn().mockImplementation(() => ({ getAvailableProducts: vi.fn(() => []) })),
}));
vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getProductInventoriesByProductId: vi.fn(() => []),
  })),
}));
vi.mock('~/reports/lib/pdf/generate-product-rows-for-date', () => ({
  generateProductRowsForDate: vi.fn(),
}));
vi.mock('~/reports/lib/pdf/inventory-today-sale-pdf', () => ({
  exportInventoryTodaySalePdf: vi.fn(),
}));
vi.mock('~/shared/lib/blocking-alert', () => ({ showBlockingInfo: vi.fn() }));
vi.mock('../components/order-list', () => ({ OrderList: () => null }));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderItems: [],
    total: 100,
    itemsCount: 1,
    date: new Date(2026, 0, 1, 12, 0, 0),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(2026, 0, 1, 12, 0, 0),
    createdByName: 'test',
    ...overrides,
  } as Order;
}

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <OrdersPage />
    </IntlProvider>,
  );
}

describe('OrdersPage — MultiMonedas history total', () => {
  beforeEach(() => {
    multiStore.enabled = false;
    multiStore.stores = [];
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    fixtures.orders = [];
  });

  it('gate OFF: keeps the legacy mixed total', () => {
    fixtures.orders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    expect(screen.getAllByText('35 CUP').length).toBeGreaterThan(0);
  });

  it('gate ON: primary + chips, never the mixed sum', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.orders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('35 CUP')).toBeNull();
  });
});

describe('OrdersPage — MultiMonedas header in multi-store mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    multiStore.enabled = true;
    multiStore.stores = [
      { id: 's1', name: 'Tienda A' },
      { id: 's2', name: 'Tienda B' },
    ];
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    fixtures.orders = [];
    vi.mocked(readStoreOrders).mockReturnValue([]);
  });

  function seedTwoStores() {
    vi.mocked(readStoreOrders).mockImplementation((storeId) =>
      storeId === 's1'
        ? [makeOrder({ id: 'usd', total: 30, currency: Currency.USD })]
        : [makeOrder({ id: 'eur', total: 5, currency: Currency.EUR })],
    );
  }

  it('gate OFF: keeps the legacy aggregate header total across stores (35 CUP)', async () => {
    seedTwoStores();
    renderPage();
    expect(await screen.findByText('35 CUP')).toBeInTheDocument();
  });

  it('gate ON: the aggregate header total is per currency, never mixed', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    seedTwoStores();
    renderPage();
    // Cross-store aggregation still groups by currency: USD 30 primary + EUR 5 chip.
    expect(await screen.findByText('30 USD')).toBeInTheDocument();
    expect(screen.getByText('5 EUR')).toBeInTheDocument();
    expect(screen.queryByText('35 CUP')).toBeNull();
  });
});
