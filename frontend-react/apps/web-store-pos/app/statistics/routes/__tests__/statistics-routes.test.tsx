import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Expense, Order, OrderItem, SaleCredit } from '@store-mgmt/domain';
import { Currency, EModules, OrderType, PaymentType } from '@store-mgmt/domain';
import { addDays, formatLocalDate, startOfDay } from '~/shared/lib/date-utils';

// ─── Global mocks ─────────────────────────────────────────────────────────────

function makeUser(storeModuleIds: number[] = [], overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    fullName: 'Juan Pérez',
    email: 'juan@test.com',
    cellPhone: '+53511111',
    isActive: true,
    password: '',
    login: 'juan@test.com',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 35 * 24 * 60 * 60 * 1000,
    roles: [],
    featureIds: [],
    storeModuleIds,
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    ...overrides,
  };
}

const MODULES_WITH_EXPENSES_AND_CREDITS = [EModules.Expenses, EModules.Credits];

let mockUser = makeUser(MODULES_WITH_EXPENSES_AND_CREDITS);

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

// The dashboard reads each entity's FULL local array through the offline
// services, and the REAL range aggregator filters by window/currency — so these
// fixtures exercise the whole data path (not a stubbed metrics object).
const { mockOrderService, mockExpenseService, mockSaleCreditService, mockCurrencyService } =
  vi.hoisted(() => ({
    mockOrderService: { getStorageOrders: vi.fn<() => Order[]>(() => []) },
    mockExpenseService: { getStorageExpenses: vi.fn<() => Expense[]>(() => []) },
    mockSaleCreditService: { getStorageSaleCredits: vi.fn<() => SaleCredit[]>(() => []) },
    mockCurrencyService: {
      getCurrentCurrency: vi.fn(() => ({ currency: 'CUP', rate: 370 })),
      setCurrency: vi.fn(),
    },
  }));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn(() => mockOrderService),
}));

vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn(() => mockExpenseService),
}));

vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn(() => mockSaleCreditService),
}));

vi.mock('~/statistics/lib/services/currency-service', () => mockCurrencyService);

// Mock the lazy chart wrappers (recharts is not exercised in JSDOM).
vi.mock('~/statistics/components/sales-chart', () => ({
  SalesChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="sales-chart">sales-chart({data.length})</div>
  ),
}));

vi.mock('~/statistics/components/profit-chart', () => ({
  ProfitChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="profit-chart">profit-chart({data.length})</div>
  ),
}));

vi.mock('~/statistics/components/sparkline', () => ({
  KpiSparkline: ({ values }: { values: number[] }) => (
    <div data-testid="sparkline">sparkline({values.length})</div>
  ),
}));

vi.mock('~/statistics/components/donut-chart', () => ({
  DonutChart: ({ slices }: { slices: unknown[] }) => (
    <div data-testid="donut">donut({slices.length})</div>
  ),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── Fixtures (relative to today, so the default range always contains them) ──

function daysAgo(days: number, hour = 10): Date {
  const date = startOfDay(addDays(new Date(), -days));
  date.setHours(hour, 0, 0, 0);
  return date;
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'p1',
    productName: 'Café',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    name: 'Café',
    quantity: 1,
    price: 100,
    productBusinessId: 'b1',
    productCosts: [],
    order: 1,
    ...overrides,
  };
}

function makeOrder(id: string, overrides: Partial<Order> = {}): Order {
  const date = overrides.date ?? daysAgo(2);
  return {
    id,
    orderItems: [],
    total: 100,
    itemsCount: 1,
    date,
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  } as Order;
}

function makeExpense(id: string, overrides: Partial<Expense> = {}): Expense {
  const date = overrides.date ?? daysAgo(2);
  return {
    id,
    type: 1,
    total: 20,
    date,
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  } as Expense;
}

function makeCredit(id: string, overrides: Partial<SaleCredit> = {}): SaleCredit {
  const date = overrides.date ?? daysAgo(10);
  return {
    id,
    orderId: 'order-1',
    client: 'Ana',
    total: 30,
    date,
    paid: 0,
    isPaid: false,
    paidDate: undefined,
    paidType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  } as unknown as SaleCredit;
}

function resetAllMocks() {
  vi.clearAllMocks();
  mockUser = makeUser(MODULES_WITH_EXPENSES_AND_CREDITS);
  mockOrderService.getStorageOrders.mockReturnValue([]);
  mockExpenseService.getStorageExpenses.mockReturnValue([]);
  mockSaleCreditService.getStorageSaleCredits.mockReturnValue([]);
  mockCurrencyService.getCurrentCurrency.mockReturnValue({ currency: 'CUP', rate: 370 });
}

import { DashboardPage } from '../dashboard';
import { formatRangeLabel } from '../../lib/dashboard-breakdowns';

/** Range label the tables must show for the 7-day default ending yesterday. */
function defaultRangeLabel(): string {
  const yesterday = addDays(startOfDay(new Date()), -1);
  return formatRangeLabel(addDays(yesterday, -6), yesterday);
}

describe('DashboardPage — smoke render + header', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('renders without crashing and keeps the Panel de Control header', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de Control' })).toBeInTheDocument();
  });

  it('shows the selected business name from storeList', () => {
    mockUser = makeUser(MODULES_WITH_EXPENSES_AND_CREDITS, {
      storeList: [{ id: 's1', name: 'Mi Tienda', isActive: true }],
    });
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('dashboard-business-name')).toHaveTextContent('Mi Tienda');
  });

  it('omits the business name when the session carries no store list', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.queryByTestId('dashboard-business-name')).not.toBeInTheDocument();
  });
});

describe('DashboardPage — global date filter', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('starts on the 7-day default ending yesterday (tables show its label)', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getAllByText(defaultRangeLabel()).length).toBeGreaterThanOrEqual(2);
  });

  it('applies a custom range and "Limpiar" restores the default (never all history)', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2020-01-01' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2020-01-07' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-select'));
    fireEvent.click(screen.getByTestId('date-range-filter-button'));

    expect(screen.getAllByText('1/1 – 7/1').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(defaultRangeLabel())).not.toBeInTheDocument();

    // "Limpiar" applies an empty range → the dashboard restores its default.
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.click(screen.getByTestId('date-range-filter-clear'));

    expect(screen.getAllByText(defaultRangeLabel()).length).toBeGreaterThanOrEqual(2);
  });
});

describe('DashboardPage — KPI cards', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('renders the eight cards with their new titles (no "Hoy" anywhere)', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    const cards: [string, string][] = [
      ['kpi-sales', 'Ventas'],
      ['kpi-expenses', 'Gastos'],
      ['kpi-grossProfit', 'Ganancias Bruta'],
      ['kpi-netProfit', 'Ganancias'],
      ['kpi-marginPct', 'Margen %'],
      ['kpi-avgPerTxn', 'Promedio por transacción'],
      ['kpi-unitsPerTxn', 'Unidades/transacción'],
      ['kpi-credits', 'Créditos por cobrar'],
    ];
    for (const [testId, title] of cards) {
      expect(screen.getByTestId(testId)).toHaveTextContent(title);
    }
    expect(screen.queryByText(/Hoy/)).not.toBeInTheDocument();
  });

  it('hides Gastos/Créditos when their modules are off', () => {
    mockUser = makeUser([]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.queryByTestId('kpi-expenses')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kpi-credits')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-sales')).toBeInTheDocument();
  });

  it('shows Ventas as the sum of the window orders and Ganancias net of expenses', () => {
    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('o1', {
        total: 100,
        orderItems: [
          makeItem({
            price: 100,
            quantity: 1,
            productCosts: [{ inventoryId: 'i1', quantity: 1, costPrice: 40 }],
          }),
        ],
      }),
      makeOrder('o2', { total: 50, date: daysAgo(1) }),
    ]);
    mockExpenseService.getStorageExpenses.mockReturnValue([makeExpense('e1', { total: 20 })]);

    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    expect(screen.getByTestId('kpi-sales-value')).toHaveTextContent('150.00 CUP');
    expect(screen.getByTestId('kpi-expenses-value')).toHaveTextContent('20.00 CUP');
    // Ganancia bruta = 60 (only o1 has costs); Ganancias = 60 − 20.
    expect(screen.getByTestId('kpi-grossProfit-value')).toHaveTextContent('60.00 CUP');
    expect(screen.getByTestId('kpi-netProfit-value')).toHaveTextContent('40.00 CUP');
    // Margen % = 60 / 150 × 100.
    expect(screen.getByTestId('kpi-marginPct-value')).toHaveTextContent('40.00 %');
  });

  it('shows the global unpaid credit balance (no date filter)', () => {
    mockSaleCreditService.getStorageSaleCredits.mockReturnValue([
      makeCredit('c-old', { total: 30, date: daysAgo(60) }),
      makeCredit('c-paid', { total: 999, isPaid: true, paidDate: daysAgo(5) }),
      makeCredit('c-inactive', { total: 999, isActive: false }),
    ]);

    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    expect(screen.getByTestId('kpi-credits-value')).toHaveTextContent('30.00 CUP');
  });

  it('trend: success when the current period >= previous, danger when below', () => {
    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('current', { total: 100, date: daysAgo(2) }),
      makeOrder('previous', { total: 50, date: daysAgo(8) }),
    ]);
    const { unmount } = render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('kpi-sales-trend')).toHaveTextContent('vs anterior');
    expect(screen.getByTestId('kpi-sales-trend').className).toContain('text-success');
    unmount();

    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('current', { total: 30, date: daysAgo(2) }),
      makeOrder('previous', { total: 50, date: daysAgo(8) }),
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('kpi-sales-trend').className).toContain('text-danger');
  });

  it('trend: secondary (dash) when actual === previous', () => {
    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('current', { total: 50, date: daysAgo(2) }),
      makeOrder('previous', { total: 50, date: daysAgo(8) }),
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('kpi-sales-trend')).toHaveTextContent('–');
    expect(screen.getByTestId('kpi-sales-trend').className).toContain('text-secondary');
  });
});

// ─── Detail / trend / currency popups ─────────────────────────────────────────

describe('DashboardPage — popups', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('tapping the Ventas value opens the payment-method detail popup', () => {
    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('o1', { total: 100, paymentType: PaymentType.Efectivo }),
      makeOrder('o2', { total: 50, paymentType: PaymentType.Tarjeta, date: daysAgo(1) }),
    ]);

    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('kpi-sales-value'));

    const popup = screen.getByTestId('dashboard-popup');
    expect(popup).toHaveTextContent('Método de pago — CUP');
    expect(popup).toHaveTextContent('Efectivo');
    // Real channel: legacy Tarjeta resolves to Transferencia — never "Tarjeta".
    expect(popup).toHaveTextContent('Transferencia');
    expect(popup).not.toHaveTextContent('Tarjeta');
    expect(popup).toHaveTextContent('100.00 CUP (67%)');
  });

  it('the trend popup explains the comparison and shows the previous range dates', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('kpi-sales-trend'));

    const popup = screen.getByTestId('dashboard-popup');
    expect(popup).toHaveTextContent('vs anterior');
    expect(popup).toHaveTextContent('Rango anterior');
    // Previous window = the 7 days immediately before the selected range.
    const yesterday = addDays(startOfDay(new Date()), -1);
    expect(popup).toHaveTextContent(formatLocalDate(addDays(yesterday, -13)));
    expect(popup).toHaveTextContent(formatLocalDate(addDays(yesterday, -7)));
  });

  it('the Gastos popup lists the window expenses', () => {
    mockExpenseService.getStorageExpenses.mockReturnValue([
      makeExpense('e1', { total: 20, note: 'Transporte' }),
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('kpi-expenses-value'));
    const popup = screen.getByTestId('dashboard-popup');
    expect(popup).toHaveTextContent('Gastos del rango');
    expect(popup).toHaveTextContent('Transporte');
    expect(popup).toHaveTextContent('20.00 CUP');
  });

  it('the Créditos popup lists the unpaid credits (global, pre-window included)', () => {
    mockSaleCreditService.getStorageSaleCredits.mockReturnValue([
      makeCredit('c1', { total: 30, client: 'Ana', date: daysAgo(60) }),
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('kpi-credits-value'));
    const popup = screen.getByTestId('dashboard-popup');
    expect(popup).toHaveTextContent('Créditos sin pagar');
    expect(popup).toHaveTextContent('Ana');
    expect(popup).toHaveTextContent('30.00 CUP');
  });

  it('closes the popup with the close button', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('kpi-sales-value'));
    expect(screen.getByTestId('dashboard-popup')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('dashboard-popup')).not.toBeInTheDocument();
  });
});

describe('DashboardPage — currency rule (MultiMonedas)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('with 2+ currencies shows the "+" and lists every currency without conversion', () => {
    mockUser = makeUser([...MODULES_WITH_EXPENSES_AND_CREDITS, EModules.MultiMonedas]);
    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('cup', { total: 100 }),
      makeOrder('usd', { total: 50, currency: Currency.USD, date: daysAgo(1) }),
    ]);

    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    // USD wins the priority even with a smaller amount.
    expect(screen.getByTestId('kpi-sales-value')).toHaveTextContent('50 USD');
    const plus = screen.getByTestId('kpi-sales-currencies');
    expect(plus).toBeInTheDocument();

    fireEvent.click(plus);
    const popup = screen.getByTestId('dashboard-popup');
    expect(popup).toHaveTextContent('USD');
    expect(popup).toHaveTextContent('50 USD');
    expect(popup).toHaveTextContent('CUP');
    expect(popup).toHaveTextContent('100 CUP');
    expect(popup).toHaveTextContent('sin conversión');
  });

  it('with a single currency there is no "+"', () => {
    mockUser = makeUser([...MODULES_WITH_EXPENSES_AND_CREDITS, EModules.MultiMonedas]);
    mockOrderService.getStorageOrders.mockReturnValue([makeOrder('cup', { total: 100 })]);

    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    expect(screen.getByTestId('kpi-sales-value')).toHaveTextContent('100 CUP');
    expect(screen.queryByTestId('kpi-sales-currencies')).not.toBeInTheDocument();
  });
});

describe('DashboardPage — charts, donuts and tables', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('feeds both charts with the 7 daily buckets of the default range', () => {
    mockOrderService.getStorageOrders.mockReturnValue([makeOrder('o1', { total: 100 })]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('sales-chart')).toHaveTextContent('sales-chart(7)');
    expect(screen.getByTestId('profit-chart')).toHaveTextContent('profit-chart(7)');
  });

  it('renders both donuts with their breakdown slices', () => {
    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('o1', {
        total: 100,
        orderItems: [makeItem({ price: 100, quantity: 1, categoryName: 'Bebidas' })],
      }),
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    const donuts = screen.getAllByTestId('donut');
    expect(donuts).toHaveLength(2);
    expect(donuts[0]).toHaveTextContent('donut(1)');
    expect(donuts[1]).toHaveTextContent('donut(1)');
  });

  it('renders the two tables with stable titles, the range label and the order-types note', () => {
    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('o1', {
        total: 100,
        orderItems: [
          makeItem({
            price: 100,
            quantity: 1,
            productName: 'Ron',
            productCosts: [{ inventoryId: 'i1', quantity: 1, costPrice: 40 }],
          }),
        ],
      }),
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    expect(screen.getByText('Productos mayor ganancias')).toBeInTheDocument();
    expect(screen.getByText('Productos más vendidos')).toBeInTheDocument();
    expect(screen.getAllByText(defaultRangeLabel()).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText(
        'Incluye todos los tipos de venta (normal, mayorista, merma, ajuste, otro)',
      ),
    ).toHaveLength(2);
    // Both tables show the product (profit table + units table).
    expect(screen.getAllByText('Ron').length).toBeGreaterThanOrEqual(1);
    // The profit value appears in the KPI card and the profit table.
    expect(screen.getAllByText('60.00 CUP').length).toBeGreaterThanOrEqual(2);
  });

  it('currency chips appear only when the orders mix 2+ currencies', () => {
    mockUser = makeUser([...MODULES_WITH_EXPENSES_AND_CREDITS, EModules.MultiMonedas]);
    mockOrderService.getStorageOrders.mockReturnValue([
      makeOrder('cup', { total: 100 }),
      makeOrder('usd', { total: 50, currency: Currency.USD, date: daysAgo(1) }),
    ]);
    const { unmount } = render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    const chips = screen.getAllByRole('button', { name: /^(USD|CUP)$/ });
    expect(chips.length).toBeGreaterThanOrEqual(4); // 2 donut cards + 2 tables
    unmount();

    resetAllMocks();
    mockUser = makeUser([...MODULES_WITH_EXPENSES_AND_CREDITS, EModules.MultiMonedas]);
    mockOrderService.getStorageOrders.mockReturnValue([makeOrder('cup', { total: 100 })]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.queryByRole('button', { name: /^(USD|CUP)$/ })).not.toBeInTheDocument();
  });
});

describe('DashboardPage — legacy currency selector (without MultiMonedas)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('renders the CUP/USD selector seeded from getCurrentCurrency()', () => {
    mockCurrencyService.getCurrentCurrency.mockReturnValue({ currency: 'USD', rate: 400 });
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    const select = screen.getByLabelText(/moneda/i) as HTMLSelectElement;
    expect(select.value).toBe('USD');
    expect(screen.getByPlaceholderText(/1 usd/i)).toBeInTheDocument();
  });

  it('removes the selector when the MultiMonedas module is available', () => {
    mockUser = makeUser([...MODULES_WITH_EXPENSES_AND_CREDITS, EModules.MultiMonedas]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.queryByLabelText(/moneda/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/1 usd/i)).not.toBeInTheDocument();
  });

  it('converts the displayed values with the legacy rate when USD is selected', () => {
    mockOrderService.getStorageOrders.mockReturnValue([makeOrder('o1', { total: 370 })]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('kpi-sales-value')).toHaveTextContent('370.00 CUP');

    fireEvent.change(screen.getByLabelText(/moneda/i), { target: { value: 'USD' } });
    expect(screen.getByTestId('kpi-sales-value')).toHaveTextContent('1.00 USD');
  });
});

describe('DashboardPage — multi-store', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('renders the general view plus one panel per store, in alphabetical order', async () => {
    mockUser = makeUser([...MODULES_WITH_EXPENSES_AND_CREDITS, EModules.MultiStores], {
      isOwnerAdmin: true,
      storeList: [
        { id: 's2', name: 'Zeta', isActive: true },
        { id: 's1', name: 'Alfa', isActive: true },
      ],
    });

    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    const toggles = screen.getAllByTestId(/^multistore-panel-toggle-/);
    expect(toggles).toHaveLength(2);
    // Alphabetical order (no ranking between stores).
    expect(toggles[0]).toHaveTextContent('Alfa');
    expect(toggles[1]).toHaveTextContent('Zeta');
    // Header shows the global business name and the aggregated body is rendered
    // once the per-store DEK reads resolve.
    expect(screen.getByTestId('dashboard-business-name')).toHaveTextContent('Todas las tiendas');
    expect(await screen.findByTestId('sales-chart')).toBeInTheDocument();
  });
});
