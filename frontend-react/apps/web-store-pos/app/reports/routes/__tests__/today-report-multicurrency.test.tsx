import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, OrderType, PaymentType } from '@store-mgmt/domain';
import type { Order, OrderItem } from '@store-mgmt/domain';
import type { InventoryTodaySaleRow } from '~/reports/lib/pdf/inventory-today-sale-pdf';
import { TodayReportPage } from '../today-report';

// Auth gate controlled per test — module OFF by default (matches a non-MultiMonedas user).
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

const fixtures = vi.hoisted(() => ({
  orders: [] as Order[],
  rows: [] as InventoryTodaySaleRow[],
}));

// The report reads today's ACTIVE orders through the offline service (summary +
// currency options). Mock the service only — the aggregation under test
// (computeTodayReport / presentCurrencies) runs for real.
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersInDay: vi.fn(() => fixtures.orders),
  })),
}));

// The PDF row generator is mocked: this suite asserts on the row data handed to
// the generator, never on PDF bytes.
vi.mock('~/reports/lib/pdf/generate-product-rows', () => ({
  generateProductRows: vi.fn(() => fixtures.rows),
}));

const exportPdf = vi.hoisted(() => vi.fn());
vi.mock('~/reports/lib/pdf/inventory-today-sale-pdf', () => ({
  exportInventoryTodaySalePdf: (...args: unknown[]) => exportPdf(...args),
}));

// Constructed only inside handleGenerateReport — stub so the button never touches
// real localStorage; the generator itself is mocked above.
vi.mock('~/sales/lib/repositories/product-repository', () => ({
  ProductRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({})),
}));

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'p1',
    productName: 'Ron',
    categoryId: 'c1',
    categoryName: 'Bebidas',
    name: 'Ron',
    quantity: 1,
    price: 0,
    productBusinessId: 'biz-1',
    productCosts: [],
    order: 1,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    orderItems: [makeOrderItem()],
    total: 0,
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

function makeRow(currency: Currency, productName: string): InventoryTodaySaleRow {
  return {
    productId: `p-${productName}`,
    productName,
    currency,
    unit: 'U',
    inicio: 0,
    entrada: 0,
    disponible: 0,
    vendido: 0,
    precioVenta: 0,
    importeVenta: 0,
    costoUnitario: 0,
    costoTotal: 0,
    cpVenta: 0,
    final: 0,
    importeFinal: 0,
  };
}

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <TodayReportPage />
    </IntlProvider>,
  );
}

describe('TodayReportPage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    exportPdf.mockClear();
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    // Mixed-currency day: 30 USD + 5 EUR.
    fixtures.orders = [
      makeOrder({ id: 'usd', currency: Currency.USD, orderItems: [makeOrderItem({ price: 30 })] }),
      makeOrder({ id: 'eur', currency: Currency.EUR, orderItems: [makeOrderItem({ price: 5 })] }),
    ];
    fixtures.rows = [makeRow(Currency.USD, 'Ron USD'), makeRow(Currency.EUR, 'Ron EUR')];
  });

  it('gate OFF: mantiene el total mezclado rotulado CUP y sin filtro', () => {
    renderPage();
    expect(screen.getAllByText('35 CUP').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: resumen y PDF solo de la moneda elegida (USD por defecto)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    renderPage();

    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('5 EUR')).toBeNull();
    expect(screen.queryByText('35 CUP')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Inventario a precio de venta/i }));

    await waitFor(() => expect(exportPdf).toHaveBeenCalledTimes(1));
    expect(exportPdf.mock.calls[0][0]).toEqual([makeRow(Currency.USD, 'Ron USD')]);
  });

  it('gate ON + 2 monedas: cambiar el select cambia resumen, filas y PDF, y el filtro sigue visible', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    renderPage();

    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });

    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Inventario a precio de venta/i }));

    await waitFor(() => expect(exportPdf).toHaveBeenCalledTimes(1));
    expect(exportPdf.mock.calls[0][0]).toEqual([makeRow(Currency.EUR, 'Ron EUR')]);
  });

  it('gate ON + 1 moneda: sin filtro, resumen en ESA moneda y PDF completo', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.orders = [
      makeOrder({ id: 'usd-1', currency: Currency.USD, orderItems: [makeOrderItem({ price: 30 })] }),
      makeOrder({ id: 'usd-2', currency: Currency.USD, orderItems: [makeOrderItem({ price: 5 })] }),
    ];
    fixtures.rows = [makeRow(Currency.USD, 'Ron USD')];

    renderPage();

    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
    expect(screen.getAllByText('35 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('35 CUP')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Inventario a precio de venta/i }));

    await waitFor(() => expect(exportPdf).toHaveBeenCalledTimes(1));
    expect(exportPdf.mock.calls[0][0]).toEqual([makeRow(Currency.USD, 'Ron USD')]);
  });

  it('gate ON + 1 moneda extranjera (sin datos CUP): el resumen NO se rotula CUP', () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.orders = [
      makeOrder({ id: 'eur', currency: Currency.EUR, orderItems: [makeOrderItem({ price: 12 })] }),
    ];
    fixtures.rows = [makeRow(Currency.EUR, 'Ron EUR')];

    renderPage();

    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
    expect(screen.getAllByText('12 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('12 CUP')).toBeNull();
  });
});
