import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EModules } from '@store-mgmt/domain';
import type { ChartData, TopProduct } from '~/sales/lib/services/order-offline-service';

// ─── Global mocks ─────────────────────────────────────────────────────────────

function makeUser(storeModuleIds: number[] = []) {
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
  };
}

let mockUser = makeUser([EModules.Expenses, EModules.Credits]);

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

const { mockOrderService, mockExpenseService, mockSaleCreditService, mockCurrencyService } = vi.hoisted(() => ({
  // Typed so a mock return value that drifts from the real view model is a
  // typecheck failure. An untyped vi.fn() let a TopProduct without its `id`
  // through, which surfaced only as a React "unique key prop" warning on
  // stderr while the test still passed.
  mockOrderService: {
    getLastMonthSales: vi.fn<() => ChartData[]>().mockReturnValue([]),
    getLastMonthSaleProfits: vi.fn<() => ChartData[]>().mockReturnValue([]),
    getActiveOrdersPriceToday: vi.fn().mockReturnValue(0),
    getActiveOrdersPriceYesterday: vi.fn().mockReturnValue(0),
    getActiveOrdersProfitToday: vi.fn().mockReturnValue(0),
    getActiveOrdersProfitYesterday: vi.fn().mockReturnValue(0),
    getTopProductsProfitInLastMonth: vi.fn<() => TopProduct[]>().mockReturnValue([]),
    getTopProductsSaleQuantityInLastMonth: vi.fn<() => TopProduct[]>().mockReturnValue([]),
  },
  mockExpenseService: {
    getActiveExpensesPriceToday: vi.fn().mockReturnValue(0),
    getActiveExpensesPriceYesterday: vi.fn().mockReturnValue(0),
  },
  mockSaleCreditService: {
    getActiveUnpaidSaleCreditsPriceToday: vi.fn().mockReturnValue(0),
    getActiveUnpaidSaleCreditsPriceYesterday: vi.fn().mockReturnValue(0),
  },
  mockCurrencyService: {
    getCurrentCurrency: vi.fn().mockReturnValue({ currency: 'CUP', rate: 370 }),
    setCurrency: vi.fn(),
  },
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => mockOrderService),
}));

vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => mockExpenseService),
}));

vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => mockSaleCreditService),
}));

vi.mock('~/statistics/lib/services/currency-service', () => mockCurrencyService);

// Mock lazy chart components to avoid recharts in tests
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function resetAllMocks() {
  vi.clearAllMocks();
  mockUser = makeUser([EModules.Expenses, EModules.Credits]);
  mockOrderService.getLastMonthSales.mockReturnValue([]);
  mockOrderService.getLastMonthSaleProfits.mockReturnValue([]);
  mockOrderService.getActiveOrdersPriceToday.mockReturnValue(0);
  mockOrderService.getActiveOrdersPriceYesterday.mockReturnValue(0);
  mockOrderService.getActiveOrdersProfitToday.mockReturnValue(0);
  mockOrderService.getActiveOrdersProfitYesterday.mockReturnValue(0);
  mockOrderService.getTopProductsProfitInLastMonth.mockReturnValue([]);
  mockOrderService.getTopProductsSaleQuantityInLastMonth.mockReturnValue([]);
  mockExpenseService.getActiveExpensesPriceToday.mockReturnValue(0);
  mockExpenseService.getActiveExpensesPriceYesterday.mockReturnValue(0);
  mockSaleCreditService.getActiveUnpaidSaleCreditsPriceToday.mockReturnValue(0);
  mockSaleCreditService.getActiveUnpaidSaleCreditsPriceYesterday.mockReturnValue(0);
  mockCurrencyService.getCurrentCurrency.mockReturnValue({ currency: 'CUP', rate: 370 });
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

import { DashboardPage } from '../dashboard';

describe('DashboardPage — smoke render', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('renders without crashing', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the dashboard header title (Angular parity: DASHBOARD.HEADER)', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de Control' })).toBeInTheDocument();
  });

  it('renders the sales chart section', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('sales-chart')).toBeInTheDocument();
  });

  it('renders the profit chart section', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('profit-chart')).toBeInTheDocument();
  });

  it('shows the sales chart section heading', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    // getByRole('heading', ...) disambiguates from the new "Ventas Hoy" KPI card title
    // (an <h5>, not a section <h2>) added by the dashboard rework.
    expect(screen.getByRole('heading', { level: 2, name: /Ventas/i })).toBeInTheDocument();
  });

  it('shows the profit chart section heading', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    // Disambiguates from the new "Ganancias Hoy" KPI card title (an <h5>).
    expect(screen.getByRole('heading', { level: 2, name: /Ganancia/i })).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2a — currency selector
// ═══════════════════════════════════════════════════════════════════════════════

describe('DashboardPage — currency selector (Angular dashboard.component.html:9-20)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('renders a CUP/USD select seeded from getCurrentCurrency()', () => {
    mockCurrencyService.getCurrentCurrency.mockReturnValue({ currency: 'USD', rate: 400 });
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    const select = screen.getByLabelText(/moneda/i) as HTMLSelectElement;
    expect(select.value).toBe('USD');
  });

  it('does NOT show the rate input when currency is CUP', () => {
    mockCurrencyService.getCurrentCurrency.mockReturnValue({ currency: 'CUP', rate: 370 });
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.queryByPlaceholderText(/1 usd/i)).not.toBeInTheDocument();
  });

  it('selecting USD reveals a rate number input', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/moneda/i), { target: { value: 'USD' } });
    expect(screen.getByPlaceholderText(/1 usd/i)).toBeInTheDocument();
  });

  it('changing the currency calls setCurrency with the new currency and current rate', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/moneda/i), { target: { value: 'USD' } });
    expect(mockCurrencyService.setCurrency).toHaveBeenCalledWith({ currency: 'USD', rate: 370 });
  });

  it('changing the rate calls setCurrency with the current currency and new rate', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/moneda/i), { target: { value: 'USD' } });
    fireEvent.change(screen.getByPlaceholderText(/1 usd/i), { target: { value: '400' } });
    expect(mockCurrencyService.setCurrency).toHaveBeenLastCalledWith({ currency: 'USD', rate: 400 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2b — KPI cards
// ═══════════════════════════════════════════════════════════════════════════════

describe('DashboardPage — KPI cards (Angular dashboard.component.html:24-84)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('always renders "Ventas Hoy" as (priceToday/divisor).toFixed(2)', () => {
    mockOrderService.getActiveOrdersPriceToday.mockReturnValue(125.5);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Ventas Hoy')).toBeInTheDocument();
    expect(screen.getByText('125.50')).toBeInTheDocument();
  });

  it('renders "Gastos Hoy" ONLY when hasExpensesModuleAvailable is true', () => {
    mockUser = makeUser([EModules.Expenses]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Gastos Hoy')).toBeInTheDocument();
  });

  it('does NOT render "Gastos Hoy" when hasExpensesModuleAvailable is false', () => {
    mockUser = makeUser([]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.queryByText('Gastos Hoy')).not.toBeInTheDocument();
  });

  it('renders "Créditos Por Cobrar" ONLY when hasCreditsModuleAvailable is true', () => {
    mockUser = makeUser([EModules.Credits]);
    mockSaleCreditService.getActiveUnpaidSaleCreditsPriceToday.mockReturnValue(50);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Créditos Por Cobrar')).toBeInTheDocument();
    expect(screen.getByText('50.00')).toBeInTheDocument();
  });

  it('does NOT render "Créditos Por Cobrar" when hasCreditsModuleAvailable is false', () => {
    mockUser = makeUser([]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.queryByText('Créditos Por Cobrar')).not.toBeInTheDocument();
  });

  it('"Ganancias Hoy" subtracts expenseToday from profitToday when hasExpensesModule is true', () => {
    mockUser = makeUser([EModules.Expenses]);
    mockOrderService.getActiveOrdersProfitToday.mockReturnValue(100);
    mockExpenseService.getActiveExpensesPriceToday.mockReturnValue(30);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Ganancias Hoy')).toBeInTheDocument();
    expect(screen.getByText('70.00')).toBeInTheDocument();
  });

  it('"Ganancias Hoy" is the raw profitToday when hasExpensesModule is false', () => {
    mockUser = makeUser([]);
    mockOrderService.getActiveOrdersProfitToday.mockReturnValue(100);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('100.00')).toBeInTheDocument();
  });

  it('trend class is text-success when actual >= anterior', () => {
    mockOrderService.getActiveOrdersPriceToday.mockReturnValue(100);
    mockOrderService.getActiveOrdersPriceYesterday.mockReturnValue(50);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Ventas Hoy').closest('div')?.querySelector('.text-success')).toBeTruthy();
  });

  it('trend class is text-danger when actual < anterior', () => {
    mockOrderService.getActiveOrdersPriceToday.mockReturnValue(30);
    mockOrderService.getActiveOrdersPriceYesterday.mockReturnValue(50);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Ventas Hoy').closest('div')?.querySelector('.text-danger')).toBeTruthy();
  });

  it('trend class is text-secondary when actual === anterior', () => {
    mockOrderService.getActiveOrdersPriceToday.mockReturnValue(50);
    mockOrderService.getActiveOrdersPriceYesterday.mockReturnValue(50);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Ventas Hoy').closest('div')?.querySelector('.text-secondary')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2c — top-products lists
// ═══════════════════════════════════════════════════════════════════════════════

describe('DashboardPage — top-products lists (Angular dashboard.component.html:127-163)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('top-profit list renders name + (value/divisor).toFixed(2) sufijo', () => {
    mockOrderService.getTopProductsProfitInLastMonth.mockReturnValue([
      { id: 'p1', name: 'Producto Uno', value: 200 },
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Producto Uno')).toBeInTheDocument();
    expect(screen.getByText('200.00 CUP')).toBeInTheDocument();
  });

  it('top-sale-quantity list renders name + raw value (no currency suffix)', () => {
    mockOrderService.getTopProductsSaleQuantityInLastMonth.mockReturnValue([
      { id: 'p2', name: 'Producto Dos', value: 15 },
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText('Producto Dos')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2d — regression: charts still render
// ═══════════════════════════════════════════════════════════════════════════════

describe('DashboardPage — regression: charts still render after the KPI/currency/top-products rework', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('SalesChart still receives getLastMonthSales() data', () => {
    mockOrderService.getLastMonthSales.mockReturnValue([
      { label: new Date(), value: 10 },
      { label: new Date(), value: 20 },
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('sales-chart')).toHaveTextContent('sales-chart(2)');
  });

  it('ProfitChart still receives getLastMonthSaleProfits() data', () => {
    mockOrderService.getLastMonthSaleProfits.mockReturnValue([
      { label: new Date(), value: 5 },
    ]);
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('profit-chart')).toHaveTextContent('profit-chart(1)');
  });
});

// REGRESSION GUARD (presentation-parity-bucket-b, KEEP — spec "Statistics charts remain
// recharts"): SalesChart/ProfitChart (recharts) stay as an accepted intentional divergence
// from Angular's plain Día|Ventas/Ganancias tables, and batch-1 KPI/currency/top-products
// parity stays intact alongside them.
describe('DashboardPage — REGRESSION (bucket-b, KEEP): charts + KPI/currency/top-products coexist', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  it('renders SalesChart and ProfitChart components (not plain Día|Ventas/Ganancias tables) alongside KPI cards, currency selector, and top-products sections', () => {
    mockOrderService.getLastMonthSales.mockReturnValue([{ label: new Date(), value: 10 }]);
    mockOrderService.getLastMonthSaleProfits.mockReturnValue([{ label: new Date(), value: 5 }]);
    mockOrderService.getTopProductsProfitInLastMonth.mockReturnValue([
      { id: 'p1', name: 'Ron', value: 100 },
    ]);
    mockOrderService.getTopProductsSaleQuantityInLastMonth.mockReturnValue([
      { id: 'p1', name: 'Ron', value: 20 },
    ]);

    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    // Chart components render (recharts wrappers), no plain table markup replaced them.
    expect(screen.getByTestId('sales-chart')).toBeInTheDocument();
    expect(screen.getByTestId('profit-chart')).toBeInTheDocument();

    // KPI cards still render.
    expect(screen.getByText(/Ventas Hoy/i)).toBeInTheDocument();

    // Currency selector still renders.
    expect(screen.getByLabelText(/moneda/i)).toBeInTheDocument();

    // Top-products sections still render.
    expect(screen.getAllByText('Ron').length).toBeGreaterThan(0);
  });
});
