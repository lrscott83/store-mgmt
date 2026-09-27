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

  it('gate OFF: keeps the legacy mixed total (35\u00A0CUP)', async () => {
    fixtures.salesTotal = 35;
    fixtures.categories = [
      { id: 'cat1', name: 'Bebidas', order: 1, total: 35, itemsCount: 2, productItems: [] },
    ];
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByTestId('cuadre-card-title')).toBeTruthy());
    expect(screen.getAllByText('35 CUP').length).toBeGreaterThan(0);
    // Sin el módulo no hay filtro de moneda.
    expect(screen.queryByTestId('currency-filter')).toBeNull();
  });

  it('gate ON + 2 monedas: el filtro aparece y la vista queda en la moneda elegida', async () => {
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

    // Filtro visible; moneda inicial = primera del orden acordado (USD).
    expect(screen.getByTestId('currency-filter')).toBeTruthy();
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('5 EUR')).toBeNull();
    // Las opciones NO se recalculan con el filtro aplicado: siguen presentes las dos.
    const select = screen.getByTestId('currency-filter-select') as HTMLSelectElement;
    expect(select.options.length).toBe(2);

    // Cambiar a EUR vuelve a mostrar la otra moneda sin perder el filtro.
    fireEvent.change(select, { target: { value: String(Currency.EUR) } });
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter')).toBeTruthy();
  });

  it('gate ON + 1 moneda: sin filtro y se muestra la moneda real', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.salesTotal = 30;
    fixtures.ordersBetween = [makeOrder({ id: 'usd', total: 30, currency: Currency.USD })];
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByTestId('cuadre-card-title')).toBeTruthy());

    expect(screen.queryByTestId('currency-filter')).toBeNull();
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
  });

  it('la grilla de KPIs es de 4 columnas en desktop y 2 en móvil', async () => {
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByTestId('cuadre-kpi-grid')).toBeTruthy());
    const grid = screen.getByTestId('cuadre-kpi-grid');
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
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
    orders: [],
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

  it('gate OFF: aggregate KPIs keep the legacy mixed totals (35\u00A0CUP / 13\u00A0CUP)', async () => {
    seedTwoStores();
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByText('Ganancias Bruta')).toBeTruthy());
    expect(screen.getAllByText('35 CUP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('13 CUP').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('currency-filter')).toBeNull();
  });

  it('gate ON + 2 monedas: agregado y paneles en UNA moneda (sin mezclar)', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    seedTwoStores();
    renderPage();
    generate();
    await waitFor(() => expect(screen.getByText('Ganancias Bruta')).toBeTruthy());

    // Filtro visible; por defecto USD: el agregado solo muestra el total USD (30) y
    // la ganancia (10). Nada de EUR ni del mezclado 35/13 CUP.
    expect(screen.getByTestId('currency-filter')).toBeTruthy();
    expect(screen.getAllByText('30 USD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10 USD').length).toBeGreaterThan(0);
    expect(screen.queryByText('5 EUR')).toBeNull();
    expect(screen.queryByText('35 CUP')).toBeNull();
    expect(screen.queryByText('13 CUP')).toBeNull();

    // Cambiar a EUR deja el agregado y los paneles solo en EUR.
    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(screen.getAllByText('5 EUR').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('30 USD')).toBeNull();
  });
});
