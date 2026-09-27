import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('OrdersPage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    multiStore.enabled = false;
    multiStore.stores = [];
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    fixtures.orders = [];
  });

  it('gate OFF: mantiene el total mezclado legacy y sin filtro', () => {
    fixtures.orders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    expect(screen.getAllByText('35 CUP').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: muestra el filtro y solo la moneda por defecto (USD)', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.orders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    // La moneda no elegida no se mezcla: ni chips ni suma combinada.
    expect(screen.queryByText('5 EUR')).toBeNull();
    expect(screen.queryByText('35 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia los datos y el filtro sigue visible', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.orders = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    renderPage();
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });

  it('gate ON + 1 moneda: sin filtro y sin filtrar (todos los datos visibles)', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.orders = [
      makeOrder({ id: 'usd-1', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'usd-2', total: 5, currency: Currency.USD }),
    ];
    renderPage();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
    expect(screen.getAllByText('35 USD').length).toBeGreaterThan(0);
  });
});

describe('OrdersPage — filtro de moneda en modo multi-store', () => {
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

  it('gate OFF: mantiene el total agregado legacy entre tiendas (35\u00A0CUP) y sin filtro', async () => {
    seedTwoStores();
    renderPage();
    expect(await screen.findByText('35 CUP')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: el agregado y los paneles quedan en la moneda por defecto (USD)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    seedTwoStores();
    renderPage();
    await screen.findByTestId('currency-filter-select');
    // Solo se ve USD: la tienda con EUR queda vacía (0 USD), nunca la suma 35 CUP.
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('5 EUR')).toBeNull();
    expect(screen.queryByText('35 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia el agregado y los paneles', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    seedTwoStores();
    renderPage();
    await screen.findByTestId('currency-filter-select');
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });
});
