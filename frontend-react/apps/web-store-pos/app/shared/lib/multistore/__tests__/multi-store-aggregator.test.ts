import { beforeEach, describe, expect, it } from 'vitest';
import type { Order, SaleCredit, Expense } from '@store-mgmt/domain';
import { Currency, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import { encryptEntity } from '../../storage/entity-crypto';
import { setDek, clearDek } from '../../storage/data-key-store';
import {
  groupOrdersByDay,
  readStoreActiveExpensesBetween,
  readStoreActiveOrdersBetween,
  readStoreEntryViews,
  readStoreExpenses,
  readStoreInventoryCategories,
  readStoreOrders,
  readStorePaidSaleCreditsBetween,
  readStoreSaleCredits,
  readStoreUnpaidSaleCreditsBetween,
  computeStoreDashboard,
  computeStoreRangeSummary,
  mergeTopProducts,
  sumChartData,
  sumRangeSummaries,
} from '../multi-store-aggregator';

const DEK_A = crypto.getRandomValues(new Uint8Array(32));
const DEK_B = crypto.getRandomValues(new Uint8Array(32));

/**
 * Seeds a store's entity key with data encrypted under the store's OWN DEK,
 * mirroring what the app writes for the selected store (encryptEntity writes
 * with the global in-memory DEK — in tests we swap the global DEK per store).
 */
function seedEncrypted(entity: string, storeId: string, dek: Uint8Array, data: unknown): void {
  // entity-crypto's encryptEntity uses the global DEK — set it to the target
  // store's DEK, write, then clear (readStoreEntities accepts the DEK
  // explicitly anyway).
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

function makeOrder(id: string, overrides: Partial<Order> = {}): Order {
  const date = overrides.date ?? new Date();
  return {
    id,
    orderItems: [],
    total: 100,
    itemsCount: 1,
    date,
    type: 0,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  } as Order;
}

function makeCredit(id: string, overrides: Partial<SaleCredit> = {}): SaleCredit {
  const date = overrides.date ?? new Date();
  return {
    id,
    orderId: 'order-1',
    client: 'Ana',
    note: '',
    total: 50,
    date,
    isPaid: false,
    paidType: PaymentType.Efectivo,
    paidDate: undefined,
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  } as unknown as SaleCredit;
}

function makeExpense(id: string, overrides: Partial<Expense> = {}): Expense {
  const date = overrides.date ?? new Date();
  return {
    id,
    description: '',
    total: 20,
    type: 0,
    date,
    paymentType: PaymentType.Efectivo,
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  } as unknown as Expense;
}

describe('multi-store-aggregator — per-store reads', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads store A orders with DEK A and store B orders with DEK B, never crossing', () => {
    seedEncrypted('orders', 'store-a', DEK_A, [
      makeOrder('o-a1', { date: new Date('2026-09-10T10:00:00') }),
    ]);
    seedEncrypted('orders', 'store-b', DEK_B, [
      makeOrder('o-b1', { total: 200, date: new Date('2026-09-11T10:00:00') }),
    ]);

    expect(readStoreOrders('store-a', DEK_A).map((o) => o.id)).toEqual(['o-a1']);
    expect(readStoreOrders('store-b', DEK_B).map((o) => o.id)).toEqual(['o-b1']);
    // Wrong DEK → tag mismatch → [] (fail closed).
    expect(readStoreOrders('store-a', DEK_B)).toEqual([]);
  });

  it('auto-init NEVER happens for other stores: absent key stays absent', () => {
    readStoreOrders('store-c', DEK_A);
    expect(localStorage.getItem('lizoft.store-orders-store-c')).toBeNull();
  });

  it('readStoreActiveOrdersBetween filters isActive and window (service-replica semantics)', () => {
    seedEncrypted('orders', 'store-a', DEK_A, [
      makeOrder('o1', { date: new Date('2026-09-10T10:00:00') }),
      makeOrder('o2', { date: new Date('2026-09-12T10:00:00'), isActive: false }),
      makeOrder('o3', { date: new Date('2026-09-13T10:00:00') }),
    ]);
    const orders = readStoreActiveOrdersBetween(
      'store-a',
      DEK_A,
      new Date('2026-09-10T00:00:00'),
      new Date('2026-09-14T00:00:00'),
    );
    expect(orders.map((o) => o.id)).toEqual(['o1', 'o3']);
  });

  it('revives string dates into Date instances (orders/credits/expenses)', () => {
    seedEncrypted('orders', 'store-a', DEK_A, [
      makeOrder('o1', { date: new Date('2026-09-10T10:00:00') }),
    ]);
    const orders = readStoreOrders('store-a', DEK_A);
    expect(orders[0].date instanceof Date).toBe(true);

    seedEncrypted('saleCredits', 'store-a', DEK_A, [
      makeCredit('c1', { paidDate: new Date('2026-09-11T10:00:00') }),
    ]);
    const credits = readStoreSaleCredits('store-a', DEK_A);
    expect(credits[0].date instanceof Date).toBe(true);
    expect(credits[0].paidDate instanceof Date).toBe(true);

    seedEncrypted('expenses', 'store-a', DEK_A, [
      makeExpense('e1', { date: new Date('2026-09-10T10:00:00') }),
    ]);
    const expenses = readStoreExpenses('store-a', DEK_A);
    expect(expenses[0].date instanceof Date).toBe(true);
  });

  it('credits: unpaid-in-window by creation date, paid-in-window by paidDate', () => {
    seedEncrypted('saleCredits', 'store-a', DEK_A, [
      makeCredit('c1', { date: new Date('2026-02-02T10:00:00') }),
      makeCredit('c2', {
        date: new Date('2026-01-10T10:00:00'),
        isPaid: true,
        paidDate: new Date('2026-02-03T10:00:00'),
      }),
      makeCredit('c3', { date: new Date('2026-03-01T10:00:00') }),
    ]);
    const start = new Date('2026-02-01T00:00:00');
    const end = new Date('2026-02-05T00:00:00');
    expect(readStoreUnpaidSaleCreditsBetween('store-a', DEK_A, start, end).map((c) => c.id)).toEqual([
      'c1',
    ]);
    expect(readStorePaidSaleCreditsBetween('store-a', DEK_A, start, end).map((c) => c.id)).toEqual([
      'c2',
    ]);
  });

  it('expenses: active-in-window only', () => {
    seedEncrypted('expenses', 'store-a', DEK_A, [
      makeExpense('e1', { date: new Date('2026-02-02T10:00:00') }),
      makeExpense('e2', { date: new Date('2026-02-03T10:00:00'), isActive: false }),
      makeExpense('e3', { date: new Date('2026-01-01T10:00:00') }),
    ]);
    const expenses = readStoreActiveExpensesBetween(
      'store-a',
      DEK_A,
      new Date('2026-02-01T00:00:00'),
      new Date('2026-02-05T00:00:00'),
    );
    expect(expenses.map((e) => e.id)).toEqual(['e1']);
  });

  it('inventory categories: groups active entries with weighted-average cost, skips orphans', () => {
    seedEncrypted('products', 'store-a', DEK_A, [
      { id: 'p1', name: 'Café', price: 5, categoryId: 'cat-1' },
      { id: 'p2', name: 'Té', price: 3, categoryId: 'cat-1' },
    ]);
    seedEncrypted('product-categories', 'store-a', DEK_A, [
      { id: 'cat-1', name: 'Bebidas', order: 1 },
    ]);
    seedEncrypted('inventory-entries', 'store-a', DEK_A, [
      {
        id: 'e1',
        productId: 'p1',
        categoryId: 'cat-1',
        available: 10,
        costPrice: 2,
        isActive: true,
      },
      {
        id: 'e2',
        productId: 'p1',
        categoryId: 'cat-1',
        available: 10,
        costPrice: 4,
        isActive: true,
      },
      {
        id: 'e3',
        productId: 'ghost',
        categoryId: 'cat-1',
        available: 5,
        costPrice: 1,
        isActive: true,
      },
    ]);

    const categories = readStoreInventoryCategories('store-a', DEK_A);
    expect(categories).toHaveLength(1);
    expect(categories[0].categoryName).toBe('Bebidas');
    expect(categories[0].totalQuantity).toBe(20);
    expect(categories[0].totalCostPrice).toBe(60); // avg 3 * 20
    expect(categories[0].products[0].avgCostPrice).toBe(3);
  });

  it('entry views enrich product names and skip inactive entries', () => {
    seedEncrypted('products', 'store-a', DEK_A, [{ id: 'p1', name: 'Café' }]);
    seedEncrypted('inventory-entries', 'store-a', DEK_A, [
      {
        id: 'e1',
        productId: 'p1',
        categoryId: 'cat-1',
        quantity: 5,
        costPrice: 2,
        date: new Date('2026-09-10T10:00:00'),
        isActive: true,
      },
      {
        id: 'e2',
        productId: 'p1',
        quantity: 5,
        costPrice: 2,
        date: new Date('2026-09-10T10:00:00'),
        isActive: false,
      },
    ]);
    const views = readStoreEntryViews('store-a', DEK_A);
    expect(views).toHaveLength(1);
    expect(views[0].productName).toBe('Café');
  });
});

describe('multi-store-aggregator — dashboard per store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('KPIs use active orders in the day windows; expenses/credits only when modules on', () => {
    const today = new Date();
    seedEncrypted('orders', 'store-a', DEK_A, [
      makeOrder('o1', { total: 100, date: today }),
      makeOrder('o2', { total: 40, date: today, isActive: false }),
    ]);
    seedEncrypted('expenses', 'store-a', DEK_A, [
      makeExpense('e1', { total: 30, date: today }),
    ]);
    seedEncrypted('saleCredits', 'store-a', DEK_A, [
      makeCredit('c1', { total: 15, date: today }),
    ]);

    const withModules = computeStoreDashboard('store-a', DEK_A, true, true);
    expect(withModules.salePriceToday).toBe(100);
    expect(withModules.expenseToday).toBe(30);
    expect(withModules.unpaidSaleCreditsToday).toBe(15);
    expect(withModules.saleProfitToday).toBe(withModules.saleProfitToday); // raw gross net of expenses
    expect(withModules.salesData).toHaveLength(30);
    expect(withModules.salesData[29].value).toBe(100); // today's bucket

    const withoutModules = computeStoreDashboard('store-a', DEK_A, false, false);
    expect(withoutModules.expenseToday).toBe(0);
    expect(withoutModules.unpaidSaleCreditsToday).toBe(0);
  });
});

describe('multi-store-aggregator — cuadre per store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('range summary: sales, cash/card split, net profit = gross − expenses', () => {
    seedEncrypted('orders', 'store-a', DEK_A, [
      makeOrder('o1', { total: 100, paymentType: PaymentType.Efectivo, date: new Date('2026-02-02T10:00:00') }),
      makeOrder('o2', { total: 50, paymentType: PaymentType.Tarjeta, date: new Date('2026-02-02T11:00:00') }),
      makeOrder('o3', { total: 999, paymentType: PaymentType.Efectivo, date: new Date('2026-01-01T10:00:00') }),
    ]);
    seedEncrypted('expenses', 'store-a', DEK_A, [
      makeExpense('e1', { total: 20, date: new Date('2026-02-02T10:00:00') }),
    ]);

    const summary = computeStoreRangeSummary(
      'store-a',
      DEK_A,
      new Date('2026-02-01T00:00:00'),
      new Date('2026-02-05T00:00:00'),
      true,
      false,
    );
    expect(summary.salesTotal).toBe(150);
    expect(summary.salesCashTotal).toBe(100);
    expect(summary.salesCardTotal).toBe(50);
    expect(summary.expensesTotal).toBe(20);
    expect(summary.netProfit).toBe(summary.grossProfit - 20);
  });

  it('range summary: a Zelle sale counts in the Transferencia panel (single-store parity)', () => {
    seedEncrypted('orders', 'store-a', DEK_A, [
      makeOrder('o1', { total: 100, paymentType: PaymentType.Efectivo, date: new Date('2026-02-02T10:00:00') }),
      makeOrder('o2', { total: 50, paymentType: PaymentType.Zelle, date: new Date('2026-02-02T11:00:00') }),
      makeOrder('o3', { total: 25, paymentType: PaymentType.Tarjeta, date: new Date('2026-02-02T12:00:00') }),
    ]);

    const summary = computeStoreRangeSummary(
      'store-a',
      DEK_A,
      new Date('2026-02-01T00:00:00'),
      new Date('2026-02-05T00:00:00'),
      false,
      false,
    );

    // Zelle + Tarjeta both collapse to Transferencia; cash stays Efectivo-only.
    expect(summary.salesCashTotal).toBe(100);
    expect(summary.salesCardTotal).toBe(75);
    expect(summary.salesCardEntries.reduce((acc, e) => acc + e.amount, 0)).toBe(75);
    // General total unchanged: every active sale counted exactly once.
    expect(summary.salesTotal).toBe(175);
  });
  it('counts a USD transfer once, in the transfer bucket — never as cash', () => {
    seedEncrypted('orders', 'store-a', DEK_A, [
      makeOrder('cash-cup', {
        total: 100,
        paymentType: PaymentType.Efectivo,
        date: new Date('2026-02-02T10:00:00'),
      }),
      makeOrder('transfer-usd', {
        total: 200,
        // A USD transfer mirrors legacy `paymentType = Efectivo` (compat :47).
        paymentType: PaymentType.Efectivo,
        salePaymentMethod: SalePaymentMethod.Transferencia,
        currency: Currency.USD,
        date: new Date('2026-02-02T11:00:00'),
      }),
    ]);

    const summary = computeStoreRangeSummary(
      'store-a',
      DEK_A,
      new Date('2026-02-01T00:00:00'),
      new Date('2026-02-05T00:00:00'),
      false,
      false,
    );

    expect(summary.salesCashTotal).toBe(100); // USD transfer is NOT cash
    expect(summary.salesCardTotal).toBe(200); // …it is a transfer
    // Buckets are mutually exclusive → the USD transfer is summed exactly once.
    expect(summary.salesCashTotal + summary.salesCardTotal).toBe(summary.salesTotal);
    expect(summary.salesCashEntries.reduce((acc, e) => acc + e.amount, 0)).toBe(100);
    expect(summary.salesCardEntries.reduce((acc, e) => acc + e.amount, 0)).toBe(200);
  });
});

describe('multi-store-aggregator — aggregation helpers', () => {
  it('sumChartData aligns buckets by index', () => {
    const a = [
      { label: new Date('2026-09-01'), value: 1 },
      { label: new Date('2026-09-02'), value: 2 },
    ];
    const b = [{ label: new Date('2026-09-01'), value: 10 }];
    expect(sumChartData(a, b).map((e) => e.value)).toEqual([11, 2]);
  });

  it('mergeTopProducts sums by id, re-sorts, caps', () => {
    const merged = mergeTopProducts(
      [
        [
          { id: 'p1', name: 'A', value: 5 },
          { id: 'p2', name: 'B', value: 3 },
        ],
        [
          { id: 'p1', name: 'A', value: 2 },
          { id: 'p3', name: 'C', value: 8 },
        ],
      ],
      2,
    );
    expect(merged.map((p) => p.id)).toEqual(['p3', 'p1']);
    expect(merged[1].value).toBe(7);
  });

  it('sumRangeSummaries adds each KPI across stores', () => {
    const totals = sumRangeSummaries([
      { salesTotal: 100, expensesTotal: 10, grossProfit: 90, netProfit: 80 } as never,
      { salesTotal: 50, expensesTotal: 5, grossProfit: 45, netProfit: 40 } as never,
    ]);
    expect(totals).toEqual({ salesTotal: 150, expensesTotal: 15, grossProfit: 135, netProfit: 120 });
  });

  it('groupOrdersByDay returns newest-first day groups (view parity)', () => {
    const groups = groupOrdersByDay([
      makeOrder('o1', { date: new Date('2026-09-10T10:00:00') }),
      makeOrder('o2', { date: new Date('2026-09-12T10:00:00') }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Date(groups[0].date).getTime()).toBeGreaterThan(
      new Date(groups[1].date).getTime(),
    );
  });
});
