import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import type { InventoryEntry, Order, OrderItem, Product } from '@store-mgmt/domain';
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
    // Local calendar-day window — same day-part comparison as fromLocalDayKey + localDayRange.
    getOrdersInDay: vi.fn((date: Date) =>
      fixtures.orders.filter((o) => {
        const d = new Date(o.date);
        return (
          d.getFullYear() === date.getFullYear() &&
          d.getMonth() === date.getMonth() &&
          d.getDate() === date.getDate()
        );
      }),
    ),
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

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'p1',
    productName: 'Ron',
    categoryId: 'c1',
    categoryName: 'Bebidas',
    name: 'Ron',
    quantity: 1,
    price: 10,
    productBusinessId: 'biz-1',
    productCosts: [],
    order: 1,
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

describe('OrdersPage — per-day sales summary popup (gear menu)', () => {
  beforeEach(() => {
    fixtures.orders = [];
    fixtures.products = [];
    fixtures.entries = {};
    fixtures.generateRows.mockReset().mockReturnValue({ rows: [], suspectProductNames: [] });
    fixtures.exportPdf.mockReset().mockResolvedValue(undefined);
    fixtures.showBlockingInfo.mockReset();
  });

  it('renders a "Resumen de ventas del día" option in each day gear menu', () => {
    fixtures.orders = [makeOrder({ id: 'o1', date: new Date(2026, 0, 1, 12, 0, 0) })];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-01'));
    expect(screen.getByText('Resumen de ventas del día')).toBeInTheDocument();
  });

  it('opens a popup with that day order count, revenue, cost and profit (title carries the day)', () => {
    fixtures.orders = [
      makeOrder({
        id: 'o1',
        date: new Date(2026, 0, 1, 12, 0, 0),
        orderItems: [
          makeOrderItem({
            quantity: 2,
            price: 10,
            productCosts: [{ inventoryId: 'i1', quantity: 2, costPrice: 4 }],
          }),
        ],
      }),
      makeOrder({
        id: 'o2',
        date: new Date(2026, 0, 1, 15, 0, 0),
        orderItems: [
          makeOrderItem({
            quantity: 1,
            price: 5,
            productCosts: [{ inventoryId: 'i2', quantity: 1, costPrice: 1 }],
          }),
        ],
      }),
      // Another day — must NOT leak into the 01-01 popup.
      makeOrder({
        id: 'o3',
        date: new Date(2026, 0, 2, 12, 0, 0),
        orderItems: [makeOrderItem({ quantity: 1, price: 100, productCosts: [] })],
      }),
    ];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-01'));
    fireEvent.click(screen.getByTestId('day-summary-button-2026-01-01'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Resumen de ventas del 01/01/2026')).toBeInTheDocument();
    // Revenue: 2*10 + 1*5 = 25; Cost: 2*4 + 1*1 = 9; Profit: 16.
    expect(within(dialog).getByText('2')).toBeInTheDocument();
    expect(within(dialog).getByText('$25')).toBeInTheDocument();
    expect(within(dialog).getByText('$9')).toBeInTheDocument();
    expect(within(dialog).getByText('$16')).toBeInTheDocument();
  });

  it('excludes inactive orders from the day summary (isActive filter, matching the today report)', () => {
    fixtures.orders = [
      makeOrder({
        id: 'oActive',
        date: new Date(2026, 0, 1, 12, 0, 0),
        orderItems: [
          makeOrderItem({
            quantity: 1,
            price: 10,
            productCosts: [{ inventoryId: 'i1', quantity: 1, costPrice: 4 }],
          }),
        ],
      }),
      makeOrder({
        id: 'oInactive',
        date: new Date(2026, 0, 1, 11, 0, 0),
        isActive: false,
        orderItems: [makeOrderItem({ quantity: 5, price: 100, productCosts: [] })],
      }),
    ];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-01'));
    fireEvent.click(screen.getByTestId('day-summary-button-2026-01-01'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('1')).toBeInTheDocument();
    expect(within(dialog).getByText('$10')).toBeInTheDocument();
    expect(within(dialog).getByText('$4')).toBeInTheDocument();
    expect(within(dialog).getByText('$6')).toBeInTheDocument();
  });

  it('ignores the page payment filter — the popup reports the whole day, like the today report', () => {
    fixtures.orders = [
      makeOrder({
        id: 'oEfectivo',
        date: new Date(2026, 0, 1, 12, 0, 0),
        paymentType: PaymentType.Efectivo,
        orderItems: [
          makeOrderItem({
            quantity: 1,
            price: 10,
            productCosts: [{ inventoryId: 'i1', quantity: 1, costPrice: 3 }],
          }),
        ],
      }),
      makeOrder({
        id: 'oTarjeta',
        date: new Date(2026, 0, 1, 13, 0, 0),
        paymentType: PaymentType.Tarjeta,
        orderItems: [
          makeOrderItem({
            quantity: 1,
            price: 20,
            productCosts: [{ inventoryId: 'i2', quantity: 1, costPrice: 8 }],
          }),
        ],
      }),
    ];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    // Filter the page to Tarjeta only — the day group still exists (one order).
    fireEvent.click(screen.getByText('Tarjeta'));
    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-01'));
    fireEvent.click(screen.getByTestId('day-summary-button-2026-01-01'));

    const dialog = screen.getByRole('dialog');
    // Both orders of the day: revenue 10 + 20 = 30, cost 3 + 8 = 11, profit 19.
    expect(within(dialog).getByText('2')).toBeInTheDocument();
    expect(within(dialog).getByText('$30')).toBeInTheDocument();
    expect(within(dialog).getByText('$11')).toBeInTheDocument();
    expect(within(dialog).getByText('$19')).toBeInTheDocument();
  });

  it('closes the popup via the close buttons', () => {
    fixtures.orders = [makeOrder({ id: 'o1', date: new Date(2026, 0, 1, 12, 0, 0) })];

    render(
      <Wrapper>
        <OrdersPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('day-actions-toggle-2026-01-01'));
    fireEvent.click(screen.getByTestId('day-summary-button-2026-01-01'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Both the header X and the footer button carry GENERAL.CLOSE ('Cerrar').
    const closeButtons = within(dialog).getAllByRole('button', { name: 'Cerrar' });
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(closeButtons[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});