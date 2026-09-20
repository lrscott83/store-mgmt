import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, ExpenseType, OrderType, PaymentType } from '@store-mgmt/domain';
import type { Expense, Order, OrderItem, SaleCredit } from '@store-mgmt/domain';
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

describe('TodayStatsPage — MultiMonedas per-currency net', () => {
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
    expect((await screen.findAllByText('$35')).length).toBeGreaterThan(0);
  });

  it('gate ON: the net total is combined PER currency (USD 30−10=20, EUR 5−2=3)', async () => {
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

    // Net: USD 30 − 10 = 20 (primary), EUR 5 − 2 = 3 (chip). Never the mixed $23.
    // The EUR 3 also appears in the cash panel (EUR 5 sales − EUR 2 expenses).
    expect((await screen.findAllByText('20 USD')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('$23')).toBeNull();
  });
});
