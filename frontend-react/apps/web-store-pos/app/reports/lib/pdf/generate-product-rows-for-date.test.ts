import { describe, it, expect } from 'vitest';
import type { InventoryEntry, InventoryEntryView, Order, Product } from '@store-mgmt/domain';
import { OrderType, PaymentType, success } from '@store-mgmt/domain';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';
import { generateProductRowsForDate } from './generate-product-rows-for-date';
import { generateProductRows } from './generate-product-rows';

// Local-noon fixtures — `new Date(2026, 6, 22, 12)` is the SAME calendar day in every
// timezone, so the local-day windows (startOfDay/addDays) make these tests timezone-independent.
const DAY = new Date(2026, 6, 22, 12, 0, 0);
const BEFORE_DATE = new Date(2026, 6, 20, 9, 0, 0);
const DURING_DATE = new Date(2026, 6, 22, 12, 0, 0);
const AFTER_DATE = new Date(2026, 6, 23, 15, 0, 0);

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
  it('FOR-DATE-01: entries before/during/after the day + orders during/after → hand-derived 13-col row, no suspects', () => {
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

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [dayOrder, afterOrder],
      inventories: new Map([['p1', [e1, e2, e3]]]),
      day: DAY,
    });

    expect(result.suspectProductNames).toEqual([]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    // e1 availableAtEndOfDay = available(6) + consumedAfter(4) = 10; e2 = 5; e3 excluded (after day).
    expect(row.final).toBe(15);
    // Only the entry dated ON the day counts as entrada.
    expect(row.entrada).toBe(5);
    // Only the day's order items count as sold.
    expect(row.vendido).toBe(2);
    expect(row.precioVenta).toBe(10);
    expect(row.importeVenta).toBe(20);
    expect(row.disponible).toBe(17); // final(15) + vendido(2)
    expect(row.inicio).toBe(12); // disponible(17) - entrada(5)
    // costEntries: e1 (10 > 0) + e2 (5 > 0); weighted by RECEIVED quantity.
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

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [afterOrder],
      inventories: new Map([['p1', [e1]]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    // availableAtEndOfDay = available(3) + consumedAfter(7) = 10 — the stock at end of the day,
    // NOT the current available (3).
    expect(row.final).toBe(10);
    expect(row.vendido).toBe(0);
    expect(row.entrada).toBe(0);
    expect(row.disponible).toBe(10);
    expect(row.inicio).toBe(10);
    expect(row.costoUnitario).toBe(5);
    expect(row.importeFinal).toBe(50);
    expect(result.suspectProductNames).toEqual([]);
  });

  it('FOR-DATE-03: deactivated entries (available forced 0 / negative, no productCosts) contribute 0 to available', () => {
    const e1 = makeInventoryEntry({ id: 'e1', date: BEFORE_DATE, quantity: 5, available: 0, costPrice: 4, isActive: false });
    // A never-restored entry holding a negative available is excluded from the available sum
    // (inactive), so it must not pull the row negative either.
    const e2 = makeInventoryEntry({ id: 'e2', date: BEFORE_DATE, quantity: 3, available: -3, costPrice: 4, isActive: false });

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [],
      inventories: new Map([['p1', [e1, e2]]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.final).toBe(0);
    expect(row.disponible).toBe(0);
    expect(row.inicio).toBe(0);
    expect(row.costoUnitario).toBe(0);
    expect(row.importeFinal).toBe(0);
    expect(result.suspectProductNames).toEqual([]);
  });

  it('FOR-DATE-04: product with no entries sold without inventory (empty productCosts) → zeros + vendido only', () => {
    const dayOrder = makeOrder(DURING_DATE, [
      makeOrderItem({ productId: 'p1', quantity: 2, price: 10, productCosts: [] }),
    ]);

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [dayOrder],
      inventories: new Map([['p1', []]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
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
    expect(result.suspectProductNames).toEqual([]);
  });

  it('FOR-DATE-05: orders and entries on other LOCAL days are excluded (before AND after)', () => {
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

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders,
      inventories: new Map([['p1', entries]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.vendido).toBe(2); // before/after orders excluded
    expect(row.entrada).toBe(5); // eBefore/eAfter excluded
    expect(row.final).toBe(10); // e1(5) + eBefore(5); eAfter excluded
    expect(row.disponible).toBe(12);
    expect(row.inicio).toBe(7);
    expect(row.costoUnitario).toBe(3); // (5*4 + 5*2) / (5 + 5); eAfter excluded
    expect(row.importeFinal).toBe(30);
    expect(result.suspectProductNames).toEqual([]);
  });

  it('FOR-DATE-06: suspect — entry updatedDate AFTER the day flags the product, name surfaced', () => {
    const e1 = makeInventoryEntry({
      id: 'e1',
      date: BEFORE_DATE,
      quantity: 5,
      available: 5,
      costPrice: 4,
      updatedDate: new Date(2026, 6, 23, 10, 0, 0),
    });

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [],
      inventories: new Map([['p1', [e1]]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.suspectProductNames).toEqual(['Ron']);
  });

  it('FOR-DATE-07: suspect — reconstructed stock exceeding received quantity flags the product', () => {
    // available(10) already exceeds the received quantity(5) — a signal the entry was
    // edited after the day even without an updatedDate stamp.
    const e1 = makeInventoryEntry({ id: 'e1', date: BEFORE_DATE, quantity: 5, available: 10, costPrice: 4 });

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [],
      inventories: new Map([['p1', [e1]]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.suspectProductNames).toEqual(['Ron']);
  });

  it('FOR-DATE-08: suspect — raw-string updatedDate after the day is parsed defensively and flags', () => {
    // Inventory revival hydrates only `date`; a touched entry's updatedDate may be a raw
    // string. Must be treated as evidence, not ignored (and must not throw).
    const e1 = makeInventoryEntry({
      id: 'e1',
      date: BEFORE_DATE,
      quantity: 5,
      available: 5,
      costPrice: 4,
      // Inventory revival hydrates only `date`; the fixture simulates a raw stored string.
      updatedDate: '2026-07-23T10:00:00.000Z' as unknown as Date,
    });

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [],
      inventories: new Map([['p1', [e1]]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.suspectProductNames).toEqual(['Ron']);
  });

  it('FOR-DATE-09: suspect — unparseable/absent updatedDate is NOT evidence (no false positive)', () => {
    const eNormal = makeInventoryEntry({
      id: 'e1',
      date: BEFORE_DATE,
      quantity: 5,
      available: 5,
      costPrice: 4,
      updatedDate: 'not-a-date' as unknown as Date,
    });

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [],
      inventories: new Map([['p1', [eNormal]]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.suspectProductNames).toEqual([]);
  });

  it('FOR-DATE-10: isActive — inactive entries never contribute to available or entrada', () => {
    const e1 = makeInventoryEntry({ id: 'e1', date: BEFORE_DATE, quantity: 5, available: 5, costPrice: 4 });
    // Inactive but positive — must NOT feed the available (Final) basis.
    const eInactiveBefore = makeInventoryEntry({
      id: 'eInactiveBefore',
      date: BEFORE_DATE,
      quantity: 3,
      available: 3,
      costPrice: 4,
      isActive: false,
    });
    // Inactive and created DURING the day — must NOT count toward entrada either.
    const eInactiveDuring = makeInventoryEntry({
      id: 'eInactiveDuring',
      date: DURING_DATE,
      quantity: 4,
      available: 4,
      costPrice: 4,
      isActive: false,
    });

    const result = generateProductRowsForDate({
      products: [makeProduct()],
      orders: [],
      inventories: new Map([['p1', [e1, eInactiveBefore, eInactiveDuring]]]),
      day: DAY,
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.final).toBe(5); // only e1's stock
    expect(row.entrada).toBe(0); // the inactive during-day entry does not count
    expect(row.disponible).toBe(5);
    expect(result.suspectProductNames).toEqual([]);
  });

  it('FOR-DATE-11: reduce-to-today invariant — local day = today reproduces generateProductRows exactly', () => {
    const today = DAY;
    const products = [makeProduct()];
    const entries = [
      makeInventoryEntry({ id: 'e1', date: BEFORE_DATE, quantity: 10, available: 8, costPrice: 2 }),
      makeInventoryEntry({ id: 'e2', date: today, quantity: 5, available: 5, costPrice: 4 }),
    ];
    const orders = [makeOrder(today, [makeOrderItem({ productId: 'p1', quantity: 3, price: 10, productCosts: [] })])];

    const result = generateProductRowsForDate({
      products,
      orders,
      inventories: new Map([['p1', entries]]),
      day: today,
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

    expect(result.rows).toEqual(rowsToday);
    expect(result.suspectProductNames).toEqual([]);
  });
});