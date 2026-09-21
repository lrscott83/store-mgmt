import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, OrderType, PaymentType } from '@store-mgmt/domain';
import type { Expense, Order, SaleCredit } from '@store-mgmt/domain';
import type { StoreRangeSummary } from '~/shared/lib/multistore/multi-store-aggregator';
import { CuadrePorFechasPage } from '../cuadre-por-fechas';

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

// Per-store summaries returned by the read-only aggregator (no real storage/DEK touched).
const storeSummaries = vi.hoisted(() => ({
  byStore: {} as Record<string, unknown>,
}));
vi.mock('~/shared/lib/multistore/multi-store-aggregator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/shared/lib/multistore/multi-store-aggregator')>();
  return {
    ...actual,
    unwrapStoreDek: vi.fn().mockResolvedValue(new Uint8Array([1])),
    computeStoreRangeSummary: vi.fn((storeId: string) => storeSummaries.byStore[storeId]),
  };
});

const fixtures = vi.hoisted(() => ({
  ordersBetween: [] as Order[],
  salesTotal: 0,
  grossProfit: 0,
  categories: [] as unknown[],
  expenses: [] as Expense[],
  unpaidCredits: [] as SaleCredit[],
  paidCredits: [] as SaleCredit[],
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersPriceBetweenDates: vi.fn(() => fixtures.salesTotal),
    getActiveOrdersProfitBetweenDates: vi.fn(() => fixtures.grossProfit),
    getActiveOrdersBetween: vi.fn(() => fixtures.ordersBetween),
    getCategoryCartItemsViewBetweenDates: vi.fn(() => ({
      data: fixtures.categories,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    })),
  })),
}));
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getActiveExpensesBetween: vi.fn(() => fixtures.expenses),
  })),
}));
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getUnPaidSaleCreditsBetween: vi.fn(() => fixtures.unpaidCredits),
    getPaidSaleCreditsBetween: vi.fn(() => fixtures.paidCredits),
  })),
}));
vi.mock('~/sales/components/category-stats', () => ({
  CategoryStats: ({ category }: { category: { id: string; name: string } }) => (
    <div data-testid={`category-stats-${category.id}`}>{category.name}</div>
  ),
}));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderItems: [],
    total: 100,
    itemsCount: 1,
    date: new Date(),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  } as Order;
}

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <CuadrePorFechasPage />
    </IntlProvider>,
  );
}

function generate() {
  fireEvent.change(screen.getByTestId('cuadre-start-date'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByTestId('cuadre-end-date'), { target: { value: '2026-09-07' } });
  fireEvent.click(screen.getByTestId('cuadre-generate'));
}

describe('CuadrePorFechasPage — MultiMonedas totals', () => {
  beforeEach(() => {
    multiStore.enabled = false;
    multiStore.stores = [];
    storeSummaries.byStore = {};
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    fixtures.ordersBetween = [];
    fixtures.salesTotal = 0;
    fixtures.grossProfit = 0;
    fixtures.categories = [];
    fixtures.expenses = [];
    fixtures.unpaidCredits = [];
    fixtures.paidCredits = [];
  });

  it('gate OFF: keeps the legacy mixed total ($35)', async () => {
    fixtures.salesTotal = 35;
    fixtures.categories = [
      { id: 'cat1', name: 'Bebidas', order: 1, total: 35, itemsCount: 2, productItems: [] },
    ];
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByTestId('cuadre-card-title')).toBeTruthy());
    expect(screen.getAllByText('$35').length).toBeGreaterThan(0);
  });

  it('gate ON: the Cuadre total is per currency, never mixed', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.salesTotal = 35;
    fixtures.ordersBetween = [
      makeOrder({ id: 'usd', total: 30, currency: Currency.USD }),
      makeOrder({ id: 'eur', total: 5, currency: Currency.EUR }),
    ];
    fixtures.categories = [
      { id: 'cat1', name: 'Bebidas', order: 1, total: 35, itemsCount: 2, productItems: [] },
    ];
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByTestId('cuadre-card-title')).toBeTruthy());
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('$35')).toBeNull();
  });
});

function makeStoreSummary(overrides: Partial<StoreRangeSummary> = {}): StoreRangeSummary {
  return {
    salesTotal: 0,
    expensesTotal: 0,
    grossProfit: 0,
    netProfit: 0,
    categories: [],
    expenses: [],
    saleCredits: [],
    paidSaleCredits: [],
    salesCashTotal: 0,
    salesCardTotal: 0,
    expensesCashTotal: 0,
    paidCreditsCashTotal: 0,
    salesEntries: [],
    grossProfitEntries: [],
    salesCashEntries: [],
    salesCardEntries: [],
    ...overrides,
  };
}

describe('CuadrePorFechasPage — MultiMonedas in multi-store mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    multiStore.enabled = true;
    multiStore.stores = [
      { id: 's1', name: 'Tienda A' },
      { id: 's2', name: 'Tienda B' },
    ];
    storeSummaries.byStore = {};
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
  });

  function seedTwoStores() {
    storeSummaries.byStore = {
      s1: makeStoreSummary({
        salesTotal: 30,
        grossProfit: 10,
        netProfit: 10,
        salesEntries: [{ amount: 30, currency: Currency.USD }],
        grossProfitEntries: [{ amount: 10, currency: Currency.USD }],
      }),
      s2: makeStoreSummary({
        salesTotal: 5,
        grossProfit: 3,
        netProfit: 3,
        salesEntries: [{ amount: 5, currency: Currency.EUR }],
        grossProfitEntries: [{ amount: 3, currency: Currency.EUR }],
      }),
    };
  }

  it('gate OFF: aggregate KPIs keep the legacy mixed totals ($35 / $13)', async () => {
    seedTwoStores();
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByText('Ganancias Bruta')).toBeTruthy());
    // Aggregate sales = 30 + 5 = $35; gross/net = 10 + 3 = $13 (never a mixed display here).
    expect(screen.getAllByText('$35').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$13').length).toBeGreaterThan(0);
  });

  it('gate ON: aggregate KPIs and per-store totals are per currency, never mixed', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    seedTwoStores();
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByText('Ganancias Bruta')).toBeTruthy());
    // Sales KPI: USD 30 primary + EUR 5 chip. Gross/Net + per-store "Ganancias": USD 10 / EUR 3.
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10 USD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('$35')).toBeNull();
    expect(screen.queryByText('$13')).toBeNull();
  });
});
