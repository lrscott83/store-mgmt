import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import type { InventoryEntry, Order, Product } from '@store-mgmt/domain';
import { OrdersPage } from '../orders';

// --- Mutable in-memory fixtures, controlled per-test ---

const fixtures = vi.hoisted(() => ({
  orders: [] as Order[],
  products: [] as Product[],
  entries: {} as Record<string, InventoryEntry[]>,
  generateRows: vi.fn(),
  exportPdf: vi.fn(),
}));

// --- Global mocks ---

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1', storeModuleIds: [] as number[] }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getStorageOrders: vi.fn(() => fixtures.orders),
  })),
}));

vi.mock('~/sales/lib/repositories/product-repository', () => ({
  ProductRepository: vi.fn().mockImplementation(() => ({
    getAvailableProducts: vi.fn(() => fixtures.products),
  })),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getProductInventoriesByProductId: vi.fn((productId: string) => fixtures.entries[productId] ?? []),
  })),
}));

vi.mock('~/reports/lib/pdf/generate-product-rows-for-date', () => ({
  generateProductRowsForDate: fixtures.generateRows,
}));

vi.mock('~/reports/lib/pdf/inventory-today-sale-pdf', () => ({
  exportInventoryTodaySalePdf: fixtures.exportPdf,
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
    orderItems: [],
    total: 100,
    itemsCount: 2,
    date: new Date('2026-01-01T10:00:00Z'),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date('2026-01-01T10:00:00Z'),
    createdByName: 'test',
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Ron',
    categoryId: 'c1',
    categoryName: 'Bebidas',
    price: 10,
    order: 1,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2026-01-01T10:00:00Z'),
    createdByName: 'test',
    ...overrides,
  };
}

describe('OrdersPage — per-day inventory-at-sale-price export', () => {
  beforeEach(() => {
    fixtures.orders = [];
    fixtures.products = [];
    fixtures.entries = {};
    fixtures.generateRows.mockReset().mockReturnValue([]);
    fixtures.exportPdf.mockReset().mockResolvedValue(undefined);
  });

  it('renders one gear options menu per day group header', () => {
    fixtures.orders = [
      makeOrder({ id: 'o1', date: new Date('2026-01-01T10:00:00Z') }),
      makeOrder({ id: 'o2', date: new Date('2026-01-02T10:00:00Z') }),
    ];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    expect(screen.getByTestId('day-actions-toggle-2026-01-01')).toBeInTheDocument();
    expect(screen.getByTestId('day-actions-toggle-2026-01-02')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^day-actions-toggle-/)).toHaveLength(2);
  });

  it('clicking the menu item exports that day group\'s report with the correct dayKey and filename', async () => {
    fixtures.orders = [
      makeOrder({ id: 'o1', date: new Date('2026-01-01T10:00:00Z') }),
      makeOrder({ id: 'oInactive', date: new Date('2026-01-01T11:00:00Z'), isActive: false }),
      makeOrder({ id: 'o2', date: new Date('2026-01-02T10:00:00Z') }),
    ];
    fixtures.products = [makeProduct()];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-01'));

    // The single menu item reuses the existing REPORT.INVENTORY_TODAY_SALE label.
    expect(screen.getByText('Inventario a precio de venta')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('day-report-button-2026-01-01'));

    await waitFor(() => expect(fixtures.exportPdf).toHaveBeenCalledTimes(1));

    expect(fixtures.generateRows).toHaveBeenCalledWith(
      expect.objectContaining({ dayKey: '2026-01-01' }),
    );
    const generateInput = fixtures.generateRows.mock.calls[0][0] as { orders: Order[] };
    // The report counts ALL active orders (isActive only), matching the today report —
    // the inactive order is excluded; day filtering happens inside the pure function.
    expect(generateInput.orders.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(fixtures.exportPdf).toHaveBeenCalledWith(expect.anything(), '2026-01-01_ipv.pdf');
  });

  it('menu items use distinct dayKeys/filenames per day group', async () => {
    fixtures.orders = [
      makeOrder({ id: 'o1', date: new Date('2026-01-01T10:00:00Z') }),
      makeOrder({ id: 'o2', date: new Date('2026-01-02T10:00:00Z') }),
    ];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-02'));
    fireEvent.click(screen.getByTestId('day-report-button-2026-01-02'));

    await waitFor(() => expect(fixtures.exportPdf).toHaveBeenCalledTimes(1));

    expect(fixtures.generateRows).toHaveBeenCalledWith(
      expect.objectContaining({ dayKey: '2026-01-02' }),
    );
    expect(fixtures.exportPdf).toHaveBeenCalledWith(expect.anything(), '2026-01-02_ipv.pdf');
  });
});