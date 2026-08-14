import { describe, it, expect } from 'vitest';
import type { InventoryEntry, InventoryEntryView, Order, Product } from '@store-mgmt/domain';
import { OrderType, PaymentType, success } from '@store-mgmt/domain';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';
import { generateProductRowsForDate } from './generate-product-rows-for-date';
import { generateProductRows } from './generate-product-rows';

const DAY_KEY = '2026-07-22';
const BEFORE_DATE = new Date('2026-07-20T09:00:00.000Z');
const DURING_DATE = new Date('2026-07-22T12:00:00.000Z');
const AFTER_DATE = new Date('2026-07-23T15:00:00.000Z');

interface OrderItemOverrides {
  productId: string;
  quantity: number;
  price: number;
  productCosts: { inventoryId: string; costPrice: number; quantity: number }[];
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
    createdDate: DURING_DATE,
    createdByName: 'tester',
    ...overrides,
  } as Product;
}

function makeOrderItem(overrides: Partial<OrderItemOverrides> = {}) {
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

function makeOrder(date: Date, orderItems: ReturnType<typeof makeOrderItem>[], id = 'o1'): Order {
  return {
    id,
    orderItems,
    total: 0,
    itemsCount: orderItems.length,
    date,
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
  } as Order;
}

function makeInventoryEntry(overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id: 'e1',
    productId: 'p1',
    categoryId: 'c1',
    quantity: 5,
    available: 5,
    costPrice: 4,
    date: DURING_DATE,
    order: 1,
    isActive: true,
    createdDate: DURING_DATE,
    createdByName: 'tester',
    ...overrides,
  } as InventoryEntry;
}

function makeInventoryEntryView(overrides: Partial<InventoryEntryView> = {}): InventoryEntryView {
  return {
    id: 'e2',
    productId: 'p1',
    productName: 'Ron',
    quantity: 5,
    costPrice: 4,
    date: DURING_DATE,
    isActive: true,
    ...overrides,
  };
}

function makeInventoryCategoryView(overrides: Partial<InventoryCategoryView> = {}): InventoryCategoryView {
  return {
    categoryId: 'c1',
    categoryName: 'Bebidas',
    totalQuantity: 13,
    totalCostPrice: 36,
    products: [
      {
        productId: 'p1',
        productName: 'Ron',
        categoryId: 'c1',
        categoryName: 'Bebidas',
        totalAvailable: 13,
        avgCostPrice: 36 / 13,
      },
    ],
    ...overrides,
  };
}

describe('generateProductRowsForDate', () => {
  it('FOR-DATE-01: entries before/during/after the day + orders during/after → hand-derived 13-col row', () => {
    const e1 = makeInventoryEntry({ id: 'e1', date: BEFORE_DATE, quantity: 10, available: 6, costPrice: 2 });
    const e2 = makeInventoryEntry({ id: 'e2', date: DURING_DATE, quantity: 5, available: 5, costPrice: 5 });
    const e3 = makeInventoryEntry({ id: 'e3', date: AFTER_DATE, quantity: 3, available: 3, costPrice: 6 });

    // Day order: 2 sold @10. After-day order consumed 4 of e1 (recorded at sale time).
    const dayOrder = makeOrder(DURING_DATE, [
      makeOrderItem({ productId: 'p1', quantity: 2, price: 10, productCosts: [] }),
    ]);
    const afterOrder = makeOrder(
      AFTER_DATE,
      [
        makeOrderItem({
          productId: 'p1',
          quantity: 4,
          price: 12,
          productCosts: [{ inventoryId: 'e1', costPrice: 2, quantity: 4 }],
        }),
      ],
      'o2',
    );

    const rows = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [dayOrder, afterOrder],
      entriesByProduct: new Map([['p1', [e1, e2, e3]]]),
      dayKey: DAY_KEY,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    // e1 asOfEndOfDay = available(6) + consumedAfter(4) = 10; e2 = 5; e3 excluded (after day).
    expect(row.final).toBe(15);
    // Only the entry dated ON the day counts as entrada.
    expect(row.entrada).toBe(5);
    // Only the day's order items count as sold.
    expect(row.vendido).toBe(2);
    expect(row.precioVenta).toBe(10);
    expect(row.importeVenta).toBe(20);
    expect(row.disponible).toBe(17); // final(15) + vendido(2)
    expect(row.inicio).toBe(12); // disponible(17) - entrada(5)
    // costEntries: e1 (asOf 10 > 0) + e2 (asOf 5 > 0); weighted by RECEIVED quantity.
    expect(row.costoUnitario).toBe(3); // (2*10 + 5*5) / (10 + 5)
    expect(row.costoTotal).toBe(6); // vendido(2) * 3
    expect(row.cpVenta).toBeCloseTo(6 / 20);
    expect(row.importeFinal).toBe(45); // final(15) * 3
  });

  it('FOR-DATE-02: an entry partially consumed AFTER the day → final equals as-of-day stock, not current', () => {
    const e1 = makeInventoryEntry({ id: 'e1', date: BEFORE_DATE, quantity: 10, available: 3, costPrice: 5 });
    const afterOrder = makeOrder(
      AFTER_DATE,
      [
        makeOrderItem({
          productId: 'p1',
          quantity: 7,
          price: 15,
          productCosts: [{ inventoryId: 'e1', costPrice: 5, quantity: 7 }],
        }),
      ],
      'o2',
    );

    const rows = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [afterOrder],
      entriesByProduct: new Map([['p1', [e1]]]),
      dayKey: DAY_KEY,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    // asOfEndOfDay = available(3) + consumedAfter(7) = 10 — the stock at end of the day,
    // NOT the current available (3).
    expect(row.final).toBe(10);
    expect(row.vendido).toBe(0);
    expect(row.entrada).toBe(0);
    expect(row.disponible).toBe(10);
    expect(row.inicio).toBe(10);
    expect(row.costoUnitario).toBe(5);
    expect(row.importeFinal).toBe(50);
  });

  it('FOR-DATE-03: deactivated entry (available forced 0, no productCosts) contributes 0 — never negative', () => {
    const e1 = makeInventoryEntry({ id: 'e1', date: BEFORE_DATE, quantity: 5, available: 0, costPrice: 4, isActive: false });
    // A never-restored entry holding a negative available must clamp to 0 too.
    const e2 = makeInventoryEntry({ id: 'e2', date: BEFORE_DATE, quantity: 3, available: -3, costPrice: 4, isActive: false });

    const rows = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [],
      entriesByProduct: new Map([['p1', [e1, e2]]]),
      dayKey: DAY_KEY,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.final).toBe(0);
    expect(row.disponible).toBe(0);
    expect(row.inicio).toBe(0);
    expect(row.costoUnitario).toBe(0);
    expect(row.importeFinal).toBe(0);
  });

  it('FOR-DATE-04: product with no entries sold without inventory (empty productCosts) → zeros + vendido only', () => {
    const dayOrder = makeOrder(DURING_DATE, [
      makeOrderItem({ productId: 'p1', quantity: 2, price: 10, productCosts: [] }),
    ]);

    const rows = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [dayOrder],
      entriesByProduct: new Map([['p1', []]]),
      dayKey: DAY_KEY,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.final).toBe(0);
    expect(row.entrada).toBe(0);
    expect(row.disponible).toBe(2); // final(0) + vendido(2)
    expect(row.inicio).toBe(2);
    expect(row.vendido).toBe(2);
    expect(row.precioVenta).toBe(10);
    expect(row.importeVenta).toBe(20);
    expect(row.costoUnitario).toBe(0);
    expect(row.costoTotal).toBe(0);
    expect(row.cpVenta).toBe(0);
    expect(row.importeFinal).toBe(0);
  });

  it('FOR-DATE-05: orders and entries on other UTC days are excluded (before AND after)', () => {
    const entries = [
      makeInventoryEntry({ id: 'e1', date: DURING_DATE, quantity: 5, available: 5, costPrice: 4 }),
      makeInventoryEntry({ id: 'eBefore', date: BEFORE_DATE, quantity: 5, available: 5, costPrice: 2 }),
      makeInventoryEntry({ id: 'eAfter', date: AFTER_DATE, quantity: 3, available: 3, costPrice: 9 }),
    ];
    const orders = [
      makeOrder(DURING_DATE, [makeOrderItem({ productId: 'p1', quantity: 2, price: 10, productCosts: [] })]),
      makeOrder(BEFORE_DATE, [makeOrderItem({ productId: 'p1', quantity: 1, price: 5, productCosts: [] })], 'oB'),
      makeOrder(AFTER_DATE, [makeOrderItem({ productId: 'p1', quantity: 1, price: 5, productCosts: [] })], 'oA'),
    ];

    const rows = generateProductRowsForDate({
      products: [makeProduct()],
      orders,
      entriesByProduct: new Map([['p1', entries]]),
      dayKey: DAY_KEY,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.vendido).toBe(2); // before/after orders excluded
    expect(row.entrada).toBe(5); // eBefore/eAfter excluded
    expect(row.final).toBe(10); // e1(5) + eBefore(5); eAfter excluded
    expect(row.disponible).toBe(12);
    expect(row.inicio).toBe(7);
    expect(row.costoUnitario).toBe(3); // (5*4 + 5*2) / (5 + 5); eAfter excluded
    expect(row.importeFinal).toBe(30);
  });

  it('FOR-DATE-06: reduce-to-today invariant — dayKey = today reproduces generateProductRows exactly', () => {
    const today = DURING_DATE;
    const todayKey = today.toISOString().split('T')[0];
    const products = [makeProduct()];
    const entries = [
      makeInventoryEntry({ id: 'e1', date: BEFORE_DATE, quantity: 10, available: 8, costPrice: 2 }),
      makeInventoryEntry({ id: 'e2', date: today, quantity: 5, available: 5, costPrice: 4 }),
    ];
    const orders = [makeOrder(today, [makeOrderItem({ productId: 'p1', quantity: 3, price: 10, productCosts: [] })])];

    const rowsForDate = generateProductRowsForDate({
      products,
      orders,
      entriesByProduct: new Map([['p1', entries]]),
      dayKey: todayKey,
    });

    const rowsToday = generateProductRows(
      { getAvailableProducts: () => products },
      { getActiveOrdersInDay: () => orders },
      {
        getInventoryEntriesInDay: () =>
          success([makeInventoryEntryView({ id: 'e2', quantity: 5, costPrice: 4, date: today })]),
        getInventoryCategoriesView: () => success([makeInventoryCategoryView()]),
        getProductInventoriesByProductId: () => entries,
      },
      today,
    );

    expect(rowsForDate).toEqual(rowsToday);
  });
});