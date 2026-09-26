import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, ExpenseType, OrderType, PaymentType } from '@store-mgmt/domain';
import type { Expense, Order, OrderItem, SaleCredit } from '@store-mgmt/domain';
import { round2 } from '~/shared/lib/money';
import { TodayStatsPage } from '../today-stats';

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
  activeOrders: [] as Order[],
  categories: [] as unknown[],
  expenses: [] as Expense[],
  unpaidCredits: [] as SaleCredit[],
  paidCredits: [] as SaleCredit[],
}));

function envelope(data: unknown) {
  return { data, succeeded: true, message: '', actionCode: 200, errors: [] };
}

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getActiveOrdersInDay: vi.fn(() => fixtures.activeOrders),
    getCategoryCartItemsView: vi.fn(() => envelope(fixtures.categories)),
  })),
}));
vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getExpensesInDayObservable: vi.fn().mockImplementation(() => Promise.resolve(envelope(fixtures.expenses))),
  })),
}));
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getUnPaidSaleCreditsInDayObservable: vi
      .fn()
      .mockImplementation(() => Promise.resolve(envelope(fixtures.unpaidCredits))),
    getPaidSaleCreditsInDayObservable: vi
      .fn()
      .mockImplementation(() => Promise.resolve(envelope(fixtures.paidCredits))),
  })),
}));

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'p1',
    productName: 'Ron',
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    name: 'Ron',
    quantity: 1,
    price: 10,
    productBusinessId: 'b1',
    productCosts: [],
    order: 1,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
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

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
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
    id: 'c1',
    orderId: 'o1',
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

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <TodayStatsPage />
    </IntlProvider>,
  );
}

describe('TodayStatsPage — filtro de moneda (MultiMonedas)', () => {
  beforeEach(() => {
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    fixtures.activeOrders = [];
    fixtures.categories = [];
    fixtures.expenses = [];
    fixtures.unpaidCredits = [];
    fixtures.paidCredits = [];
  });

  it('gate OFF: keeps the legacy mixed header total', async () => {
    fixtures.activeOrders = [
      makeOrder({
        id: 'usd',
        total: 30,
        currency: Currency.USD,
        orderItems: [makeItem({ price: 30, currency: Currency.USD })],
      }),
      makeOrder({
        id: 'eur',
        total: 5,
        currency: Currency.EUR,
        orderItems: [makeItem({ price: 5, currency: Currency.EUR })],
      }),
    ];
    fixtures.categories = [
      { id: 'cat1', name: 'Bebidas', order: 1, total: 35, itemsCount: 2, productItems: [] },
    ];
    renderPage();
    expect((await screen.findAllByText('35 CUP')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
  });

  it('gate ON + 2 monedas: filtro visible y solo la moneda por defecto (USD)', async () => {
    auth.state.user.storeModuleIds = [
      EModules.MultiMonedas,
      EModules.Expenses,
      EModules.Credits,
    ];
    fixtures.activeOrders = [
      makeOrder({
        id: 'usd',
        total: 30,
        currency: Currency.USD,
        orderItems: [makeItem({ price: 30, currency: Currency.USD })],
      }),
      makeOrder({
        id: 'eur',
        total: 5,
        currency: Currency.EUR,
        orderItems: [makeItem({ price: 5, currency: Currency.EUR })],
      }),
    ];
    fixtures.categories = [
      { id: 'cat1', name: 'Bebidas', order: 1, total: 35, itemsCount: 2, productItems: [] },
    ];
    fixtures.expenses = [makeExpense({ id: 'e1', total: 2, currency: Currency.EUR })];
    fixtures.unpaidCredits = [makeCredit({ id: 'c1', total: 10, currency: Currency.USD })];

    renderPage();

    // Neto USD = 30 (ventas) − 10 (crédito) = 20; el gasto EUR queda fuera.
    expect(await screen.findByTestId('currency-filter-select')).toBeInTheDocument();
    expect((await screen.findAllByText('20 USD')).length).toBeGreaterThan(0);
    // La moneda no elegida no aparece: ni chips ni suma mezclada.
    expect(screen.queryByText('3 EUR')).toBeNull();
    expect(screen.queryByText('5 EUR')).toBeNull();
    expect(screen.queryByText('35 CUP')).toBeNull();
    expect(screen.queryByText('23 CUP')).toBeNull();
  });

  it('gate ON + 2 monedas: cambiar el select cambia filas y totales', async () => {
    auth.state.user.storeModuleIds = [
      EModules.MultiMonedas,
      EModules.Expenses,
      EModules.Credits,
    ];
    fixtures.activeOrders = [
      makeOrder({
        id: 'usd',
        total: 30,
        currency: Currency.USD,
        orderItems: [makeItem({ price: 30, currency: Currency.USD })],
      }),
      makeOrder({
        id: 'eur',
        total: 5,
        currency: Currency.EUR,
        orderItems: [makeItem({ price: 5, currency: Currency.EUR })],
      }),
    ];
    fixtures.categories = [
      { id: 'cat1', name: 'Bebidas', order: 1, total: 35, itemsCount: 2, productItems: [] },
    ];
    fixtures.expenses = [makeExpense({ id: 'e1', total: 2, currency: Currency.EUR })];
    fixtures.unpaidCredits = [makeCredit({ id: 'c1', total: 10, currency: Currency.USD })];

    renderPage();
    expect(await screen.findByTestId('currency-filter-select')).toBeInTheDocument();
    expect((await screen.findAllByText('20 USD')).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });

    // EUR: neto 5 − 2 = 3; el filtro sigue visible tras elegir.
    expect((await screen.findAllByText('3 EUR')).length).toBeGreaterThan(0);
    expect(screen.queryByText('20 USD')).toBeNull();
    expect(screen.getByTestId('currency-filter-select')).toBeInTheDocument();
  });

  it('gate ON + 1 moneda: sin filtro y sin filtrar', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    fixtures.activeOrders = [
      makeOrder({
        id: 'usd',
        total: 30,
        currency: Currency.USD,
        orderItems: [makeItem({ price: 30, currency: Currency.USD })],
      }),
    ];
    fixtures.categories = [
      { id: 'cat1', name: 'Bebidas', order: 1, total: 30, itemsCount: 1, productItems: [] },
    ];
    renderPage();
    expect(screen.queryByTestId('currency-filter-select')).not.toBeInTheDocument();
    expect((await screen.findAllByText('30 USD')).length).toBeGreaterThan(0);
  });
});

// ─── "Ventas" shared-source equivalence (R3-003) ────────────────────────────
// `getCategoryCartItemsView()` builds its category totals from the SAME active
// order items (round2(Σ round2(price×qty))) the per-currency `salesEntries` use.
// These tests pin that relationship: the gate-ON per-currency "Ventas" total is
// numerically equal to the gate-OFF legacy scalar, and both follow the ITEM sum
// (not `order.total`, which may include percent/tax).

/** Mirrors the service: category total = round2(Σ round2(price×qty)) over items. */
function categoriesFromOrders(orders: Order[]) {
  const items = orders.flatMap((order) => order.orderItems);
  const total = round2(items.reduce((sum, item) => sum + round2(item.price * item.quantity), 0));
  const itemsCount = items.reduce((sum, item) => sum + item.quantity, 0);
  return [{ id: 'cat1', name: 'Bebidas', order: 1, total, itemsCount, productItems: [] }];
}

/** Parses a rendered money string ("1 000.50 CUP", "30 USD") back to a number. */
function parseAmount(text: string): number {
  return Number(text.replace(/\u00A0/g, '').replace(/[^0-9.-]/g, ''));
}

/** The "Ventas" panel amount: gate-OFF one scalar, gate-ON primary + chips summed. */
function ventasTotal(): number {
  const button = screen.getByRole('button', { name: /Ventas \(\d+ productos\)/ });
  const amountSpan = button.querySelector('span.whitespace-nowrap.text-success') as HTMLElement;
  const leaves = [...amountSpan.querySelectorAll('span')].filter((s) => s.children.length === 0);
  const texts =
    leaves.length > 0 ? leaves.map((s) => s.textContent ?? '') : [amountSpan.textContent ?? ''];
  return texts.reduce((sum, text) => sum + parseAmount(text), 0);
}

describe('TodayStatsPage — "Ventas" shared-source equivalence (gate ON vs OFF)', () => {
  beforeEach(() => {
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    fixtures.activeOrders = [];
    fixtures.categories = [];
    fixtures.expenses = [];
    fixtures.unpaidCredits = [];
    fixtures.paidCredits = [];
  });

  it('gate ON + 2 monedas: "Ventas" sigue el filtro y la suma de ÍTEMS', () => {
    const orders = [
      makeOrder({
        id: 'usd',
        total: 30,
        currency: Currency.USD,
        orderItems: [makeItem({ price: 30, quantity: 1, currency: Currency.USD })],
      }),
      makeOrder({
        id: 'eur',
        total: 5,
        currency: Currency.EUR,
        orderItems: [makeItem({ price: 5, quantity: 1, currency: Currency.EUR })],
      }),
    ];
    fixtures.activeOrders = orders;
    fixtures.categories = categoriesFromOrders(orders);

    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    renderPage();

    // Moneda por defecto USD: solo los ítems USD (30), nunca el mezclado 35.
    expect(ventasTotal()).toBe(30);

    fireEvent.change(screen.getByTestId('currency-filter-select'), {
      target: { value: String(Currency.EUR) },
    });
    expect(ventasTotal()).toBe(5);
  });

  it('"Ventas" follows the ITEM sum, not order.total (gate OFF and ON)', () => {
    const order = makeOrder({
      id: 'o1',
      total: 100, // differs from the items' price×qty sum (30)
      currency: Currency.USD,
      orderItems: [makeItem({ price: 30, quantity: 1, currency: Currency.USD })],
    });
    fixtures.activeOrders = [order];
    fixtures.categories = categoriesFromOrders([order]);

    const first = renderPage();
    const legacy = ventasTotal();
    first.unmount();

    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    renderPage();
    const perCurrency = ventasTotal();

    expect(legacy).toBe(30); // item sum, not order.total (100)
    expect(perCurrency).toBe(30);
    expect(perCurrency).not.toBe(100);
  });
});
