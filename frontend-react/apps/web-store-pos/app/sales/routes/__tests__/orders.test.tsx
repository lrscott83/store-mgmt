import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import type { InventoryEntry, Order, Product } from '@store-mgmt/domain';
import { toLocalDayKey } from '~/shared/lib/date-utils';
import { OrdersPage } from '../orders';

// --- Mutable in-memory fixtures, controlled per-test ---

const fixtures = vi.hoisted(() => ({
  orders: [] as Order[],
  products: [] as Product[],
  entries: {} as Record<string, InventoryEntry[]>,
  generateRows: vi.fn(),
  exportPdf: vi.fn(),
  showBlockingInfo: vi.fn(),
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

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingInfo: fixtures.showBlockingInfo,
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
    // Local noon — the LOCAL calendar day is unambiguous in any timezone.
    date: new Date(2026, 0, 1, 12, 0, 0),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(2026, 0, 1, 12, 0, 0),
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
    createdDate: new Date(2026, 0, 1, 12, 0, 0),
    createdByName: 'test',
    ...overrides,
  };
}

describe('OrdersPage — per-day inventory-at-sale-price export', () => {
  beforeEach(() => {
    fixtures.orders = [];
    fixtures.products = [];
    fixtures.entries = {};
    fixtures.generateRows.mockReset().mockReturnValue({ rows: [], suspectProductNames: [] });
    fixtures.exportPdf.mockReset().mockResolvedValue(undefined);
    fixtures.showBlockingInfo.mockReset();
  });

  it('renders one gear options menu per day group header', () => {
    fixtures.orders = [
      makeOrder({ id: 'o1', date: new Date(2026, 0, 1, 12, 0, 0) }),
      makeOrder({ id: 'o2', date: new Date(2026, 0, 2, 12, 0, 0) }),
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

  it('groups by LOCAL calendar day — two evening orders on the same local day fall in ONE group', () => {
    // 22:00 and 23:30 local on Jan 1: at a negative UTC offset the first one would be
    // stored under TOMORROW's UTC key — the local grouping must keep both under Jan 1.
    fixtures.orders = [
      makeOrder({ id: 'o1', date: new Date(2026, 0, 1, 22, 0, 0) }),
      makeOrder({ id: 'o2', date: new Date(2026, 0, 1, 23, 30, 0) }),
    ];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    expect(screen.getByTestId('day-actions-toggle-2026-01-01')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^day-actions-toggle-/)).toHaveLength(1);
    expect(screen.getByTestId('date-panel-toggle-2026-01-01')).toBeInTheDocument();
  });

  it('clicking the menu item exports that day group\'s report with the correct local day and filename', async () => {
    fixtures.orders = [
      makeOrder({ id: 'o1', date: new Date(2026, 0, 1, 12, 0, 0) }),
      makeOrder({ id: 'oInactive', date: new Date(2026, 0, 1, 11, 0, 0), isActive: false }),
      makeOrder({ id: 'o2', date: new Date(2026, 0, 2, 12, 0, 0) }),
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

    const generateInput = fixtures.generateRows.mock.calls[0][0] as {
      orders: Order[];
      inventories: Map<string, InventoryEntry[]>;
      day: Date;
    };
    // The generator receives the LOCAL noon Date whose local key matches the group.
    expect(toLocalDayKey(generateInput.day)).toBe('2026-01-01');
    expect(generateInput.inventories).toBeInstanceOf(Map);
    expect(generateInput.inventories.get('p1')).toEqual(fixtures.entries['p1'] ?? []);
    // The report counts ALL active orders (isActive only), matching the today report —
    // the inactive order is excluded; day filtering happens inside the pure function.
    expect(generateInput.orders.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(fixtures.exportPdf).toHaveBeenCalledWith(expect.anything(), '2026-01-01_ipv.pdf');
    // No suspects → no warning.
    expect(fixtures.showBlockingInfo).not.toHaveBeenCalled();
  });

  it('menu items use distinct local keys/filenames per day group', async () => {
    fixtures.orders = [
      makeOrder({ id: 'o1', date: new Date(2026, 0, 1, 12, 0, 0) }),
      makeOrder({ id: 'o2', date: new Date(2026, 0, 2, 12, 0, 0) }),
    ];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-02'));
    fireEvent.click(screen.getByTestId('day-report-button-2026-01-02'));

    await waitFor(() => expect(fixtures.exportPdf).toHaveBeenCalledTimes(1));

    const generateInput = fixtures.generateRows.mock.calls[0][0] as { day: Date };
    expect(toLocalDayKey(generateInput.day)).toBe('2026-01-02');
    expect(fixtures.exportPdf).toHaveBeenCalledWith(expect.anything(), '2026-01-02_ipv.pdf');
  });

  it('surfaces suspect products via the blocking warning with the i18n message', async () => {
    fixtures.orders = [makeOrder({ id: 'o1', date: new Date(2026, 0, 1, 12, 0, 0) })];
    fixtures.products = [makeProduct()];
    fixtures.generateRows.mockReturnValue({ rows: [], suspectProductNames: ['Ron', 'Vodka'] });

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-01'));
    fireEvent.click(screen.getByTestId('day-report-button-2026-01-01'));

    await waitFor(() => expect(fixtures.showBlockingInfo).toHaveBeenCalledTimes(1));
    expect(fixtures.showBlockingInfo).toHaveBeenCalledWith(
      'Información',
      'El stock de estos productos pudo ser editado después de ese día: Ron, Vodka',
    );
    // The PDF still exports with the suspect row data.
    await waitFor(() => expect(fixtures.exportPdf).toHaveBeenCalledTimes(1));
  });
});