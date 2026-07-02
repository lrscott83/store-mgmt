import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { PaymentType, OrderType, ExpenseType, EModules } from '@store-mgmt/domain';
import type { Order, Expense, SaleCredit } from '@store-mgmt/domain';

// --- Mocks (mutable state — set per-test via mockAuthState.user.storeModuleIds) ---

const mockAuthState = {
  user: { selectedStoreId: 's1', storeModuleIds: [] as number[] },
  isAuthenticated: true,
};
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof mockAuthState) => unknown) => {
    if (typeof selector === 'function') return selector(mockAuthState);
    return mockAuthState;
  }),
}));

const mockGetActiveOrdersInDay = vi.fn().mockReturnValue([] as Order[]);
const mockGetCategoryCartItemsView = vi.fn().mockReturnValue([]);
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersInDay: mockGetActiveOrdersInDay,
    getCategoryCartItemsView: mockGetCategoryCartItemsView,
  })),
}));

const mockGetExpensesActiveToday = vi.fn().mockReturnValue([] as Expense[]);
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getActiveToday: mockGetExpensesActiveToday,
  })),
}));

const mockGetUnpaidCreatedToday = vi.fn().mockReturnValue([] as SaleCredit[]);
const mockGetPaidToday = vi.fn().mockReturnValue([] as SaleCredit[]);
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getUnpaidCreatedToday: mockGetUnpaidCreatedToday,
    getPaidToday: mockGetPaidToday,
  })),
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
    date: new Date(),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    type: ExpenseType.Otro,
    total: 20,
    date: new Date(),
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function makeCredit(overrides: Partial<SaleCredit> = {}): SaleCredit {
  return {
    id: 'credit-1',
    orderId: 'order-1',
    client: 'Ana',
    total: 50,
    date: new Date(),
    paid: 0,
    isPaid: false,
    isActive: true,
    paidDate: null as unknown as Date,
    paidType: null as unknown as PaymentType,
    note: '',
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

import { TodayStatsPage } from '../today-stats';

describe('TodayStatsPage (Angular today-stats.component.html 1:1 port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user.storeModuleIds = [];
    mockGetActiveOrdersInDay.mockReturnValue([]);
    mockGetCategoryCartItemsView.mockReturnValue([]);
    mockGetExpensesActiveToday.mockReturnValue([]);
    mockGetUnpaidCreatedToday.mockReturnValue([]);
    mockGetPaidToday.mockReturnValue([]);
  });

  it('renders the Angular header (Cuadre del día)', () => {
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(screen.getByText('Cuadre del día')).toBeInTheDocument();
  });

  it('renders a Resumen Efectivo panel with a Ventas row (Gastos row hidden — module unavailable)', () => {
    mockGetActiveOrdersInDay.mockReturnValue([
      makeOrder({ paymentType: PaymentType.Efectivo, isCredit: false, total: 100 }),
    ]);
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(screen.getByText('Resumen Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    // No expenses module available in default mock user -> Gastos row and panel hidden
    expect(screen.queryByText('Gastos')).toBeNull();
  });

  it('computes salesCashTotal from active orders with paymentType=Efectivo and isCredit=false', () => {
    mockGetActiveOrdersInDay.mockReturnValue([
      makeOrder({ id: 'o1', paymentType: PaymentType.Efectivo, isCredit: false, total: 100 }),
      makeOrder({ id: 'o2', paymentType: PaymentType.Tarjeta, isCredit: false, total: 999 }),
      makeOrder({ id: 'o3', paymentType: PaymentType.Efectivo, isCredit: true, total: 999 }),
    ]);
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    // salesCashTotal = 100 only (excludes card payment + credit sale)
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
  });

  it('renders a Ventas ({itemsCount} productos) panel using getCategoryCartItemsView totals', () => {
    mockGetCategoryCartItemsView.mockReturnValue([
      { id: 'cat1', name: 'Bebidas', order: 1, total: 30, itemsCount: 4, productItems: [] },
    ]);
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(screen.getByText('Ventas (4 productos)')).toBeInTheDocument();
  });

  it('does not render Gastos or Créditos panels when modules are unavailable', () => {
    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );
    expect(screen.queryByText(/^Gastos \(/)).toBeNull();
    expect(screen.queryByText(/^Créditos Por Cobrar/)).toBeNull();
    expect(screen.queryByText(/^Créditos Pagados/)).toBeNull();
  });
});

describe('TodayStatsPage — with Expenses + Credits modules available', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user.storeModuleIds = [EModules.Expenses, EModules.Credits];
    mockGetActiveOrdersInDay.mockReturnValue([]);
    mockGetCategoryCartItemsView.mockReturnValue([]);
  });

  it('renders Gastos and Créditos panels when the user has those modules', () => {
    mockGetExpensesActiveToday.mockReturnValue([makeExpense({ total: 15 })]);
    mockGetUnpaidCreatedToday.mockReturnValue([makeCredit({ total: 40 })]);
    mockGetPaidToday.mockReturnValue([makeCredit({ id: 'c2', isPaid: true, total: 60 })]);

    render(
      <Wrapper>
        <TodayStatsPage />
      </Wrapper>,
    );

    expect(screen.getByText('Gastos (1)')).toBeInTheDocument();
    expect(screen.getByText('Créditos Por Cobrar (1)')).toBeInTheDocument();
    // Angular's literal template bug: header shows getPaidSaleCreditsTotal() (a currency
    // sum), not a count, inside the "(...)" slot — preserved verbatim, see today-stats.tsx.
    expect(screen.getByText('Créditos Pagados (60)')).toBeInTheDocument();
  });
});
