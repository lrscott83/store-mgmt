import { beforeEach, describe, expect, it } from 'vitest';
import type { Expense, Order, OrderItem, SaleCredit, InventoryEntryCost } from '@store-mgmt/domain';
import { Currency, OrderType, PaymentType } from '@store-mgmt/domain';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';
import { clearDek, setDek } from '~/shared/lib/storage/data-key-store';
import {
  buildRangeBuckets,
  computeDashboardRange,
  computeMultiStoreDashboardRange,
  computeSingleStoreDashboardRange,
  localDaySpan,
  mergeDashboardRangeMetrics,
  previousRangeWindow,
  resolveGranularity,
} from './dashboard-range-aggregator';
import type { DashboardRangeMetrics, RangeWindow } from './dashboard-range-aggregator';

/** Default 7-day window of the plan: [2026-02-01, 2026-02-08). */
const WINDOW: RangeWindow = {
  start: new Date('2026-02-01T00:00:00'),
  end: new Date('2026-02-08T00:00:00'),
};

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
  const date = overrides.date ?? new Date('2026-02-02T10:00:00');
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
  const date = overrides.date ?? new Date('2026-02-02T10:00:00');
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
  const date = overrides.date ?? new Date('2026-02-02T10:00:00');
  return {
    id,
    orderId: 'order-1',
    client: 'Ana',
    total: 50,
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

function cost(costPrice: number, quantity = 1, currency?: Currency): InventoryEntryCost {
  return { inventoryId: 'inv-1', quantity, costPrice, currency };
}

describe('dashboard-range-aggregator — per-currency KPIs', () => {
  it('computes every KPI per currency and never sums amounts across currencies', () => {
    const orders = [
      makeOrder('usd-1', {
        currency: Currency.USD,
        total: 100,
        itemsCount: 2,
        orderItems: [
          makeItem({ price: 60, quantity: 1, productCosts: [cost(40)] }),
          makeItem({ price: 40, quantity: 1, productCosts: [cost(10)] }),
        ],
      }),
      makeOrder('cup-1', {
        total: 500,
        itemsCount: 5,
        orderItems: [makeItem({ price: 500, quantity: 1, productCosts: [cost(300)] })],
      }),
      makeOrder('cup-2', { total: 100, itemsCount: 1 }),
    ];

    const result = computeDashboardRange({
      orders,
      expenses: [],
      credits: [],
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });

    // USD wins the fixed priority even though CUP holds the larger amount.
    expect(result.groups.map((group) => group.currency)).toEqual([Currency.USD, Currency.CUP]);
    expect(result.primary?.currency).toBe(Currency.USD);

    const usd = result.groups[0];
    expect(usd.salesTotal).toBe(100);
    expect(usd.grossProfit).toBe(50);
    expect(usd.netProfit).toBe(50);
    expect(usd.marginPct).toBe(50);
    expect(usd.txnCount).toBe(1);
    expect(usd.avgPerTxn).toBe(100);
    expect(usd.unitsPerTxn).toBe(2);

    const cup = result.groups[1];
    expect(cup.salesTotal).toBe(600); // 500 + 100 — the USD 100 is NOT mixed in
    expect(cup.grossProfit).toBe(200);
    expect(cup.netProfit).toBe(200);
    expect(cup.txnCount).toBe(2);
    expect(cup.avgPerTxn).toBe(300);
    expect(cup.unitsPerTxn).toBe(3);
  });

  it('counts ALL order types (Normal, Mayorista, Merma, Ajuste, Otro)', () => {
    const orders = [
      OrderType.Normal,
      OrderType.Mayorista,
      OrderType.Merma,
      OrderType.Ajuste,
      OrderType.Otro,
    ].map((type, index) => makeOrder(`order-${index}`, { type, total: 10, itemsCount: 1 }));

    const result = computeDashboardRange({
      orders,
      expenses: [],
      credits: [],
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });

    expect(result.primary?.txnCount).toBe(5);
    expect(result.primary?.salesTotal).toBe(50);
  });

  it('ignores inactive orders and non-window instants (half-open boundaries)', () => {
    const orders = [
      makeOrder('start-boundary', { total: 1, date: WINDOW.start }),
      makeOrder('last-instant', { total: 10, date: new Date('2026-02-07T23:59:59') }),
      makeOrder('end-boundary', { total: 1000, date: WINDOW.end }),
      makeOrder('inactive', { total: 1000, isActive: false }),
      makeOrder('before', { total: 1000, date: new Date('2026-01-31T23:59:59') }),
    ];

    const result = computeDashboardRange({
      orders,
      expenses: [],
      credits: [],
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });

    expect(result.primary?.salesTotal).toBe(11);
    expect(result.primary?.txnCount).toBe(2);
  });

  it('guards margin/avg/units when there are no sales (expense-only currency)', () => {
    const result = computeDashboardRange({
      orders: [],
      expenses: [makeExpense('e1', { currency: Currency.USD, total: 30 })],
      credits: [],
      window: WINDOW,
      hasExpensesModule: true,
      hasCreditsModule: false,
    });

    expect(result.groups).toHaveLength(1);
    const usd = result.primary;
    expect(usd?.currency).toBe(Currency.USD);
    expect(usd?.salesTotal).toBe(0);
    expect(usd?.expensesTotal).toBe(30);
    expect(usd?.grossProfit).toBe(0);
    expect(usd?.netProfit).toBe(-30);
    expect(usd?.marginPct).toBe(0);
    expect(usd?.txnCount).toBe(0);
    expect(usd?.avgPerTxn).toBe(0);
    expect(usd?.unitsPerTxn).toBe(0);
  });

  it('applies the module gates: expenses out without Gastos, credits out without Créditos', () => {
    const result = computeDashboardRange({
      orders: [],
      expenses: [makeExpense('e1', { currency: Currency.USD, total: 30 })],
      credits: [makeCredit('c1', { currency: Currency.USD, total: 25 })],
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });

    expect(result.groups).toEqual([]);
    expect(result.primary).toBeUndefined();
    expect(result.creditsReceivable).toEqual([]);
    expect(result.creditsSeries).toEqual([]);
  });

  it('nets expenses only in their own currency group', () => {
    const orders = [
      makeOrder('cup-1', {
        total: 100,
        itemsCount: 1,
        orderItems: [makeItem({ price: 100, quantity: 1, productCosts: [cost(40)] })],
      }),
      makeOrder('usd-1', {
        currency: Currency.USD,
        total: 50,
        itemsCount: 1,
        orderItems: [makeItem({ price: 50, quantity: 1, productCosts: [cost(10)] })],
      }),
    ];
    const expenses = [
      makeExpense('e-cup', { total: 10 }),
      makeExpense('e-usd', { currency: Currency.USD, total: 5 }),
    ];

    const result = computeDashboardRange({
      orders,
      expenses,
      credits: [],
      window: WINDOW,
      hasExpensesModule: true,
      hasCreditsModule: false,
    });

    const usd = result.groups.find((group) => group.currency === Currency.USD);
    const cup = result.groups.find((group) => group.currency === Currency.CUP);
    expect(usd?.expensesTotal).toBe(5);
    expect(usd?.netProfit).toBe(35); // (50 − 10) − 5 — the CUP expense stays out
    expect(cup?.expensesTotal).toBe(10);
    expect(cup?.netProfit).toBe(50); // (100 − 40) − 10 — the USD expense stays out
  });

  it('falls back to CUP for orders/expenses without a currency', () => {
    const result = computeDashboardRange({
      orders: [makeOrder('o1', { total: 100 })],
      expenses: [makeExpense('e1', { total: 20 })],
      credits: [],
      window: WINDOW,
      hasExpensesModule: true,
      hasCreditsModule: false,
    });

    expect(result.primary?.currency).toBe(Currency.CUP);
    expect(result.primary?.salesTotal).toBe(100);
    expect(result.primary?.expensesTotal).toBe(20);
  });

  it('decision B1: profit entries follow the SALE currency even with mixed-currency costs', () => {
    const result = computeDashboardRange({
      orders: [
        makeOrder('usd-mixed', {
          currency: Currency.USD,
          total: 10,
          itemsCount: 1,
          orderItems: [makeItem({ price: 10, quantity: 1, productCosts: [cost(500)] })],
        }),
      ],
      expenses: [],
      credits: [],
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });

    expect(result.groups.map((group) => group.currency)).toEqual([Currency.USD]);
    expect(result.primary?.grossProfit).toBe(-490); // 10 − 500, no conversion
    expect(result.groups.some((group) => group.currency === Currency.CUP)).toBe(false);
  });

  it('returns an empty result with the window buckets still built (empty input)', () => {
    const result = computeDashboardRange({
      orders: [],
      expenses: [],
      credits: [],
      window: WINDOW,
      hasExpensesModule: true,
      hasCreditsModule: true,
    });

    expect(result.groups).toEqual([]);
    expect(result.primary).toBeUndefined();
    expect(result.previousGroups).toEqual([]);
    expect(result.previousPrimary).toBeUndefined();
    expect(result.series).toEqual([]);
    expect(result.creditsReceivable).toEqual([]);
    expect(result.creditsReceivablePrimary).toBeUndefined();
    expect(result.creditsSeries).toEqual([]);
    expect(result.buckets).toHaveLength(7);
  });
});

describe('dashboard-range-aggregator — previous period', () => {
  it('shifts the whole window back and reports the same metrics for it', () => {
    const window: RangeWindow = {
      start: new Date('2026-02-08T00:00:00'),
      end: new Date('2026-02-15T00:00:00'),
    };
    const orders = [
      makeOrder('previous', { total: 40, date: new Date('2026-02-03T10:00:00') }),
      makeOrder('current', { total: 100, date: new Date('2026-02-12T10:00:00') }),
    ];

    const result = computeDashboardRange({
      orders,
      expenses: [],
      credits: [],
      window,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });

    expect(result.previousWindow.start).toEqual(new Date('2026-02-01T00:00:00'));
    expect(result.previousWindow.end).toEqual(new Date('2026-02-08T00:00:00'));
    expect(result.primary?.salesTotal).toBe(100);
    expect(result.previousPrimary?.salesTotal).toBe(40);
    expect(result.previousPrimary?.txnCount).toBe(1);
  });

  it('crosses month boundaries by local calendar arithmetic', () => {
    const previous = previousRangeWindow({
      start: new Date('2026-03-03T00:00:00'),
      end: new Date('2026-03-10T00:00:00'),
    });

    expect(previous.start).toEqual(new Date('2026-02-24T00:00:00'));
    expect(previous.end).toEqual(new Date('2026-03-03T00:00:00'));
  });

  it('uses a half-open previous window: the boundary instant belongs to the current one', () => {
    const window: RangeWindow = {
      start: new Date('2026-02-08T00:00:00'),
      end: new Date('2026-02-15T00:00:00'),
    };
    const orders = [makeOrder('boundary', { total: 100, date: window.start })];

    const result = computeDashboardRange({
      orders,
      expenses: [],
      credits: [],
      window,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });

    expect(result.primary?.salesTotal).toBe(100);
    expect(result.previousGroups).toEqual([]);
  });
});

describe('dashboard-range-aggregator — Créditos por cobrar', () => {
  it('reports the GLOBAL unpaid balance per currency, with no date filter', () => {
    const credits = [
      makeCredit('old-cup', { total: 100, date: new Date('2026-01-05T10:00:00') }),
      makeCredit('old-usd', {
        currency: Currency.USD,
        total: 20,
        date: new Date('2026-01-06T10:00:00'),
      }),
      makeCredit('paid', {
        total: 999,
        date: new Date('2026-01-07T10:00:00'),
        isPaid: true,
        paidDate: new Date('2026-01-10T10:00:00'),
      }),
      makeCredit('inactive', {
        total: 888,
        date: new Date('2026-01-08T10:00:00'),
        isActive: false,
      }),
      makeCredit('no-currency', { total: 50, date: new Date('2026-01-09T10:00:00') }),
    ];

    const result = computeDashboardRange({
      orders: [],
      expenses: [],
      credits,
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: true,
    });

    // USD leads by priority even though CUP holds the larger balance; the
    // credits were created BEFORE the window and still count (it is a balance).
    expect(result.creditsReceivable).toEqual([
      { currency: Currency.USD, label: 'USD', amount: 20 },
      { currency: Currency.CUP, label: 'CUP', amount: 150 },
    ]);
    expect(result.creditsReceivablePrimary?.currency).toBe(Currency.USD);
  });

  it('reconstructs the balance at each bucket end (date / isPaid / paidDate)', () => {
    const credits = [
      makeCredit('pre-window', { total: 100, date: new Date('2026-01-20T10:00:00') }),
      makeCredit('paid-in-window', {
        total: 50,
        date: new Date('2026-02-03T10:00:00'),
        isPaid: true,
        paidDate: new Date('2026-02-05T10:00:00'),
      }),
      makeCredit('after-window', { total: 25, date: new Date('2026-02-09T10:00:00') }),
    ];

    const result = computeDashboardRange({
      orders: [],
      expenses: [],
      credits,
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: true,
    });

    const series = result.creditsSeries[0];
    expect(series.currency).toBe(Currency.CUP);
    expect(series.buckets.map((bucket) => bucket.balance)).toEqual([
      100, // ends Feb 2 — the Feb 3 credit is not created yet
      100, // ends Feb 3 — created at 10:00, bucket ends at 00:00
      150, // ends Feb 4 — created, still unpaid
      150, // ends Feb 5 — paid at 10:00, bucket ends at 00:00
      100, // ends Feb 6 — paid before the bucket end
      100, // ends Feb 7
      100, // ends Feb 8 — the Feb 9 credit never counts
    ]);
  });

  it('covers every currency with an unpaid balance, ordered by the rule', () => {
    const credits = [
      makeCredit('eur', { currency: Currency.EUR, total: 5 }),
      makeCredit('cup', { total: 700 }),
      makeCredit('mlc', { currency: Currency.MLC, total: 900 }),
    ];

    const result = computeDashboardRange({
      orders: [],
      expenses: [],
      credits,
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: true,
    });

    expect(result.creditsReceivable.map((total) => total.currency)).toEqual([
      Currency.EUR,
      Currency.CUP,
      Currency.MLC,
    ]);
    expect(result.creditsSeries.map((series) => series.currency)).toEqual([
      Currency.EUR,
      Currency.CUP,
      Currency.MLC,
    ]);
  });
});

describe('dashboard-range-aggregator — buckets and series', () => {
  it('builds 7 daily buckets for the default window', () => {
    const buckets = buildRangeBuckets(WINDOW);

    expect(resolveGranularity(WINDOW)).toBe('daily');
    expect(buckets).toHaveLength(7);
    expect(buckets[0].start).toEqual(WINDOW.start);
    expect(buckets[6].end).toEqual(WINDOW.end);
    expect(buckets[1].start).toEqual(new Date('2026-02-02T00:00:00'));
  });

  it('resolves the granularity at the 31/32/92/93-day boundaries', () => {
    const span = (start: string, end: string): RangeWindow => ({
      start: new Date(start),
      end: new Date(end),
    });

    expect(localDaySpan(span('2026-02-01T00:00:00', '2026-03-04T00:00:00'))).toBe(31);
    expect(resolveGranularity(span('2026-02-01T00:00:00', '2026-03-04T00:00:00'))).toBe('daily');
    expect(resolveGranularity(span('2026-02-01T00:00:00', '2026-03-05T00:00:00'))).toBe('weekly');
    expect(resolveGranularity(span('2026-01-01T00:00:00', '2026-04-03T00:00:00'))).toBe('weekly');
    expect(resolveGranularity(span('2026-01-01T00:00:00', '2026-04-04T00:00:00'))).toBe('monthly');
  });

  it('builds weekly Monday–Sunday buckets, clipped at the window edges', () => {
    // 32 days: [Sun 2026-02-01, Thu 2026-03-05).
    const window: RangeWindow = {
      start: new Date('2026-02-01T00:00:00'),
      end: new Date('2026-03-05T00:00:00'),
    };
    const buckets = buildRangeBuckets(window);

    expect(resolveGranularity(window)).toBe('weekly');
    expect(buckets).toHaveLength(6);
    // First bucket is the clipped Sunday; every full bucket runs Monday → Monday.
    expect(buckets[0]).toEqual({
      start: new Date('2026-02-01T00:00:00'),
      end: new Date('2026-02-02T00:00:00'),
    });
    expect(buckets[1]).toEqual({
      start: new Date('2026-02-02T00:00:00'),
      end: new Date('2026-02-09T00:00:00'),
    });
    expect(buckets[1].start.getDay()).toBe(1); // Monday
    expect(buckets[5]).toEqual({
      start: new Date('2026-03-02T00:00:00'),
      end: new Date('2026-03-05T00:00:00'),
    });
  });

  it('builds monthly calendar buckets, clipped at the window edges', () => {
    // 93 days: [Thu 2026-01-01, Sat 2026-04-04).
    const window: RangeWindow = {
      start: new Date('2026-01-01T00:00:00'),
      end: new Date('2026-04-04T00:00:00'),
    };
    const buckets = buildRangeBuckets(window);

    expect(resolveGranularity(window)).toBe('monthly');
    expect(buckets).toEqual([
      { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-02-01T00:00:00') },
      { start: new Date('2026-02-01T00:00:00'), end: new Date('2026-03-01T00:00:00') },
      { start: new Date('2026-03-01T00:00:00'), end: new Date('2026-04-01T00:00:00') },
      { start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-04T00:00:00') },
    ]);
  });

  it('emits a currency-aware series: values land in their own currency bucket only', () => {
    const orders = [
      makeOrder('cup-day-1', { total: 100, itemsCount: 2, date: new Date('2026-02-01T10:00:00') }),
      makeOrder('cup-day-3', { total: 50, itemsCount: 1, date: new Date('2026-02-03T10:00:00') }),
      makeOrder('usd-day-2', {
        currency: Currency.USD,
        total: 7,
        itemsCount: 1,
        date: new Date('2026-02-02T10:00:00'),
      }),
    ];

    const result = computeDashboardRange({
      orders,
      expenses: [],
      credits: [],
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });

    expect(result.series.map((series) => series.currency)).toEqual([Currency.USD, Currency.CUP]);

    const [usdSeries, cupSeries] = result.series;
    expect(usdSeries.buckets.map((bucket) => bucket.salesTotal)).toEqual([0, 7, 0, 0, 0, 0, 0]);
    expect(cupSeries.buckets.map((bucket) => bucket.salesTotal)).toEqual([100, 0, 50, 0, 0, 0, 0]);
    expect(cupSeries.buckets.map((bucket) => bucket.txnCount)).toEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(cupSeries.buckets.map((bucket) => bucket.avgPerTxn)).toEqual([100, 0, 50, 0, 0, 0, 0]);
    expect(cupSeries.buckets[0].unitsPerTxn).toBe(2);
  });

  it('series buckets carry the same net-profit math as the group totals', () => {
    const orders = [
      makeOrder('cup-1', {
        total: 100,
        itemsCount: 1,
        date: new Date('2026-02-02T10:00:00'),
        orderItems: [makeItem({ price: 100, quantity: 1, productCosts: [cost(40)] })],
      }),
    ];
    const expenses = [
      makeExpense('cup-expense', { total: 25, date: new Date('2026-02-02T12:00:00') }),
    ];

    const result = computeDashboardRange({
      orders,
      expenses,
      credits: [],
      window: WINDOW,
      hasExpensesModule: true,
      hasCreditsModule: false,
    });

    const bucket = result.series[0].buckets[1]; // Feb 2
    expect(bucket.grossProfit).toBe(60);
    expect(bucket.expensesTotal).toBe(25);
    expect(bucket.netProfit).toBe(35);
    expect(bucket.marginPct).toBe(60);
  });
});

describe('dashboard-range-aggregator — storage adapters', () => {
  const DEK_A = crypto.getRandomValues(new Uint8Array(32));

  function seedEncrypted(entity: string, storeId: string, dek: Uint8Array, data: unknown): void {
    setDek(dek, storeId);
    try {
      localStorage.setItem(
        `lizoft.store-${entity}-${storeId}`,
        encryptEntity(JSON.stringify(data)),
      );
    } finally {
      clearDek();
    }
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('multi-store adapter reads another store with its explicit DEK', () => {
    seedEncrypted('orders', 'store-a', DEK_A, [
      makeOrder('o1', {
        total: 100,
        date: new Date('2026-02-02T10:00:00'),
        orderItems: [makeItem({ price: 100, quantity: 1, productCosts: [cost(40)] })],
      }),
    ]);
    seedEncrypted('expenses', 'store-a', DEK_A, [
      makeExpense('e1', { total: 30, date: new Date('2026-02-02T10:00:00') }),
    ]);
    seedEncrypted('saleCredits', 'store-a', DEK_A, [
      makeCredit('c1', { total: 20, date: new Date('2026-01-05T10:00:00') }),
    ]);

    const result = computeMultiStoreDashboardRange('store-a', DEK_A, WINDOW, true, true);

    expect(result.primary?.salesTotal).toBe(100);
    expect(result.primary?.expensesTotal).toBe(30);
    expect(result.primary?.netProfit).toBe(30); // (100 − 40) − 30
    expect(result.creditsReceivable).toEqual([
      { currency: Currency.CUP, label: 'CUP', amount: 20 },
    ]);

    // Wrong DEK → tag mismatch → no data (fail closed).
    const wrongDek = computeMultiStoreDashboardRange(
      'store-a',
      crypto.getRandomValues(new Uint8Array(32)),
      WINDOW,
      true,
      true,
    );
    expect(wrongDek.groups).toEqual([]);
    expect(wrongDek.creditsReceivable).toEqual([]);
  });

  it('single-store adapter reads through the offline services (global DEK)', () => {
    setDek(DEK_A, 'store-a');
    try {
      localStorage.setItem(
        'lizoft.store-orders-store-a',
        encryptEntity(
          JSON.stringify([makeOrder('o1', { total: 100, date: new Date('2026-02-02T10:00:00') })]),
        ),
      );

      const result = computeSingleStoreDashboardRange('store-a', WINDOW, false, false);

      expect(result.primary?.salesTotal).toBe(100);
      expect(result.primary?.txnCount).toBe(1);
      expect(result.creditsReceivable).toEqual([]);
    } finally {
      clearDek();
    }
  });
});

describe('dashboard-range-aggregator — raw rows, credits trend and merge', () => {
  it('exposes the active window rows for the popups and gates them by module', () => {
    const orders = [
      makeOrder('in-window', { total: 100, date: new Date('2026-02-02T10:00:00') }),
      makeOrder('outside', { total: 999, date: new Date('2026-01-01T10:00:00') }),
      makeOrder('inactive', { total: 999, isActive: false }),
    ];
    const expenses = [
      makeExpense('expense-in', { total: 20, date: new Date('2026-02-03T10:00:00') }),
      makeExpense('expense-out', { total: 999, date: new Date('2026-01-01T10:00:00') }),
    ];
    const credits = [
      makeCredit('unpaid', { total: 30, date: new Date('2026-01-05T10:00:00') }),
      makeCredit('paid', { total: 999, isPaid: true, paidDate: new Date('2026-01-10T10:00:00') }),
    ];

    const withModules = computeDashboardRange({
      orders,
      expenses,
      credits,
      window: WINDOW,
      hasExpensesModule: true,
      hasCreditsModule: true,
    });
    expect(withModules.orders.map((order) => order.id)).toEqual(['in-window']);
    expect(withModules.expenses.map((expense) => expense.id)).toEqual(['expense-in']);
    expect(withModules.unpaidCredits.map((credit) => credit.id)).toEqual(['unpaid']);

    const withoutModules = computeDashboardRange({
      orders,
      expenses,
      credits,
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: false,
    });
    expect(withoutModules.orders.map((order) => order.id)).toEqual(['in-window']);
    expect(withoutModules.expenses).toEqual([]);
    expect(withoutModules.unpaidCredits).toEqual([]);
  });

  it('previousCreditsReceivable is the unpaid balance at window.start', () => {
    const credits = [
      makeCredit('c1', { total: 100, date: new Date('2026-01-20T10:00:00') }),
      makeCredit('c2', { total: 50, date: new Date('2026-02-03T10:00:00') }),
      makeCredit('c3', {
        currency: Currency.USD,
        total: 20,
        date: new Date('2026-01-25T10:00:00'),
        isPaid: true,
        paidDate: new Date('2026-02-10T10:00:00'),
      }),
    ];

    const result = computeDashboardRange({
      orders: [],
      expenses: [],
      credits,
      window: WINDOW,
      hasExpensesModule: false,
      hasCreditsModule: true,
    });

    // At window.start: c1 (unpaid) + c3 (paid AFTER the instant) — not c2 (created later).
    expect(result.previousCreditsReceivable).toEqual([
      { currency: Currency.USD, label: 'USD', amount: 20 },
      { currency: Currency.CUP, label: 'CUP', amount: 100 },
    ]);
    // Current global balance: c1 + c2 (c3 is paid now).
    expect(result.creditsReceivable).toEqual([
      { currency: Currency.CUP, label: 'CUP', amount: 150 },
    ]);
  });
});

describe('dashboard-range-aggregator — cross-store merge', () => {
  function storeMetrics(
    orders: Order[],
    expenses: Expense[],
    credits: SaleCredit[],
  ): DashboardRangeMetrics {
    return computeDashboardRange({
      orders,
      expenses,
      credits,
      window: WINDOW,
      hasExpensesModule: true,
      hasCreditsModule: true,
    });
  }

  const storeA = storeMetrics(
    [
      makeOrder('a1', {
        total: 100,
        date: new Date('2026-02-02T10:00:00'),
        orderItems: [makeItem({ price: 100, quantity: 1, productCosts: [cost(40)] })],
      }),
    ],
    [makeExpense('ea', { total: 20, date: new Date('2026-02-02T10:00:00') })],
    [makeCredit('ca', { total: 30, date: new Date('2026-01-05T10:00:00') })],
  );
  const storeB = storeMetrics(
    [
      makeOrder('b1', {
        currency: Currency.USD,
        total: 50,
        date: new Date('2026-02-03T10:00:00'),
      }),
      makeOrder('b2', { total: 200, date: new Date('2026-02-04T10:00:00') }),
    ],
    [
      makeExpense('eb', {
        currency: Currency.USD,
        total: 5,
        date: new Date('2026-02-03T10:00:00'),
      }),
    ],
    [
      makeCredit('cb', {
        currency: Currency.USD,
        total: 10,
        date: new Date('2026-01-06T10:00:00'),
      }),
    ],
  );

  it('sums each currency across stores and never crosses currencies', () => {
    const merged = mergeDashboardRangeMetrics([storeA, storeB]);

    expect(merged.groups.map((group) => group.currency)).toEqual([Currency.USD, Currency.CUP]);
    const usd = merged.groups[0];
    expect(usd.salesTotal).toBe(50);
    expect(usd.expensesTotal).toBe(5);
    expect(usd.netProfit).toBe(-5);

    const cup = merged.groups[1];
    expect(cup.salesTotal).toBe(300);
    expect(cup.expensesTotal).toBe(20);
    expect(cup.grossProfit).toBe(60);
    expect(cup.netProfit).toBe(40);
    expect(cup.txnCount).toBe(2);
    expect(cup.avgPerTxn).toBe(150);

    expect(merged.primary?.currency).toBe(Currency.USD);
    expect(merged.creditsReceivable).toEqual([
      { currency: Currency.USD, label: 'USD', amount: 10 },
      { currency: Currency.CUP, label: 'CUP', amount: 30 },
    ]);
    expect(merged.orders.map((order) => order.id)).toEqual(['a1', 'b1', 'b2']);
  });

  it('equals the aggregation computed over the concatenated store arrays', () => {
    const merged = mergeDashboardRangeMetrics([storeA, storeB]);
    const direct = computeDashboardRange({
      orders: [...storeA.orders, ...storeB.orders],
      expenses: [...storeA.expenses, ...storeB.expenses],
      credits: [...storeA.unpaidCredits, ...storeB.unpaidCredits],
      window: WINDOW,
      hasExpensesModule: true,
      hasCreditsModule: true,
    });

    expect(merged.groups).toEqual(direct.groups);
    expect(merged.previousGroups).toEqual(direct.previousGroups);
    expect(merged.creditsReceivable).toEqual(direct.creditsReceivable);
    expect(merged.previousCreditsReceivable).toEqual(direct.previousCreditsReceivable);
    expect(merged.series).toEqual(direct.series);
    expect(merged.creditsSeries).toEqual(direct.creditsSeries);
  });

  it('sums the bucket series and the credits balances bucket-by-bucket', () => {
    const merged = mergeDashboardRangeMetrics([storeA, storeB]);

    const cupSeries = merged.series.find((series) => series.currency === Currency.CUP);
    expect(cupSeries?.buckets.map((bucket) => bucket.salesTotal)).toEqual([
      0, 100, 0, 200, 0, 0, 0,
    ]);
    // Feb 2 bucket: store A only; Feb 4: store B only.
    const usdSeries = merged.series.find((series) => series.currency === Currency.USD);
    expect(usdSeries?.buckets.map((bucket) => bucket.salesTotal)).toEqual([0, 0, 50, 0, 0, 0, 0]);

    const creditsSeries = merged.creditsSeries.find((series) => series.currency === Currency.CUP);
    // 30 (store A, pre-window) at every bucket end; store B's credit is USD.
    expect(creditsSeries?.buckets.every((bucket) => bucket.balance === 30)).toBe(true);
  });

  it('throws when called without stores', () => {
    expect(() => mergeDashboardRangeMetrics([])).toThrow(/at least one store/);
  });
});
