import { describe, it, expect } from 'vitest';
import type { Order, Product, InventoryEntry, InventoryEntryView } from '@store-mgmt/domain';
import { OrderType, PaymentType, success, failure } from '@store-mgmt/domain';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';
import { generateProductRows } from './generate-product-rows';

const TODAY = new Date('2026-07-22T12:00:00.000Z');

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
    createdDate: TODAY,
    createdByName: 'tester',
    ...overrides,
  } as Product;
}

function makeOrderItem(overrides: Partial<{ productId: string; quantity: number; price: number }> = {}) {
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

function makeOrder(orderItems: ReturnType<typeof makeOrderItem>[]): Order {
  return {
    id: 'o1',
    orderItems,
    total: 0,
    itemsCount: orderItems.length,
    date: TODAY,
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: TODAY,
    createdByName: 'tester',
  } as Order;
}

function makeInventoryEntryView(overrides: Partial<InventoryEntryView> = {}): InventoryEntryView {
  return {
    id: 'e1',
    productId: 'p1',
    productName: 'Ron',
    quantity: 5,
    costPrice: 4,
    date: TODAY,
    isActive: true,
    ...overrides,
  };
}

function makeInventoryEntry(overrides: Partial<InventoryEntry> = {}): InventoryEntry {
  return {
    id: 'ie1',
    productId: 'p1',
    categoryId: 'c1',
    quantity: 5,
    available: 5,
    costPrice: 4,
    date: TODAY,
    order: 1,
    createdAt: TODAY,
    updatedAt: TODAY,
    ...overrides,
  } as InventoryEntry;
}

function makeInventoryCategoryView(overrides: Partial<InventoryCategoryView> = {}): InventoryCategoryView {
  return {
    categoryId: 'c1',
    categoryName: 'Bebidas',
    totalQuantity: 8,
    totalCostPrice: 32,
    products: [
      {
        productId: 'p1',
        productName: 'Ron',
        categoryId: 'c1',
        categoryName: 'Bebidas',
        totalAvailable: 8,
        avgCostPrice: 4,
      },
    ],
    ...overrides,
  };
}

describe('generateProductRows', () => {
  it('ROW-01: builds a 13-field row per available product, unit is the literal "U"', () => {
    const products = [makeProduct()];
    const order = makeOrder([makeOrderItem({ quantity: 3, price: 10 })]);
    const entries = [makeInventoryEntryView({ quantity: 5 })];
    const categories = [makeInventoryCategoryView()];
    const availableEntries = [makeInventoryEntry({ quantity: 5, available: 5, costPrice: 4 })];

    const rows = generateProductRows(
      { getAvailableProducts: () => products },
      { getActiveOrdersInDay: () => [order] },
      {
        getInventoryEntriesInDay: () => success(entries),
        getInventoryCategoriesView: () => success(categories),
        getProductInventoriesByProductId: () => availableEntries,
      },
      TODAY,
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.productId).toBe('p1');
    expect(row.productName).toBe('Ron');
    expect(row.unit).toBe('U');
    // available(8) + vendido(3) = disponible(11); inicio = 8+3-5 = 6
    expect(row.disponible).toBe(11);
    expect(row.inicio).toBe(6);
    expect(row.entrada).toBe(5);
    expect(row.vendido).toBe(3);
    expect(row.precioVenta).toBe(10);
    expect(row.importeVenta).toBe(30);
    expect(row.costoUnitario).toBe(4);
    expect(row.costoTotal).toBe(12);
    expect(row.cpVenta).toBeCloseTo(12 / 30);
    expect(row.final).toBe(8); // disponible(11) - vendido(3)
    expect(row.importeFinal).toBe(32); // final(8) * costoUnitario(4)
  });

  it('ROW-02: zero sales — precioVenta/importeVenta/costoTotal/cpVenta are 0, no divide-by-zero, row not dropped', () => {
    const products = [makeProduct()];
    const categories = [makeInventoryCategoryView()];
    const availableEntries = [makeInventoryEntry({ quantity: 5, available: 5, costPrice: 4 })];

    const rows = generateProductRows(
      { getAvailableProducts: () => products },
      { getActiveOrdersInDay: () => [] },
      {
        getInventoryEntriesInDay: () => success([]),
        getInventoryCategoriesView: () => success(categories),
        getProductInventoriesByProductId: () => availableEntries,
      },
      TODAY,
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.vendido).toBe(0);
    expect(row.precioVenta).toBe(0);
    expect(row.importeVenta).toBe(0);
    expect(row.costoTotal).toBe(0);
    expect(row.cpVenta).toBe(0);
    // available=8, vendido=0, entrada=0 -> disponible=8, inicio=8, final=8
    expect(row.disponible).toBe(8);
    expect(row.inicio).toBe(8);
    expect(row.final).toBe(8);
    expect(row.importeFinal).toBe(32);
  });

  it('ROW-03: zero available stock — costoUnitario stays 0 (no active entries), row not dropped', () => {
    const products = [makeProduct()];
    const order = makeOrder([makeOrderItem({ quantity: 2, price: 5 })]);
    const categories = [
      makeInventoryCategoryView({
        products: [
          {
            productId: 'p1',
            productName: 'Ron',
            categoryId: 'c1',
            categoryName: 'Bebidas',
            totalAvailable: 0,
            avgCostPrice: 0,
          },
        ],
      }),
    ];

    const rows = generateProductRows(
      { getAvailableProducts: () => products },
      { getActiveOrdersInDay: () => [order] },
      {
        getInventoryEntriesInDay: () => success([]),
        getInventoryCategoriesView: () => success(categories),
        // no active entries (available <= 0 filtered out upstream by real service;
        // here the fake simply returns none)
        getProductInventoriesByProductId: () => [],
      },
      TODAY,
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.costoUnitario).toBe(0);
    expect(row.costoTotal).toBe(0);
    expect(row.cpVenta).toBe(0);
    expect(row.disponible).toBe(2); // available(0) + vendido(2)
    expect(row.final).toBe(0); // disponible(2) - vendido(2)
    expect(row.importeFinal).toBe(0);
  });

  it('ROW-04: failed BaseResponseModel envelopes are treated as empty, not thrown', () => {
    const products = [makeProduct()];

    const rows = generateProductRows(
      { getAvailableProducts: () => products },
      { getActiveOrdersInDay: () => [] },
      {
        getInventoryEntriesInDay: () => failure([{ code: 'ERR', description: 'boom' }]),
        getInventoryCategoriesView: () => failure([{ code: 'ERR', description: 'boom' }]),
        getProductInventoriesByProductId: () => [],
      },
      TODAY,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].disponible).toBe(0);
    expect(rows[0].entrada).toBe(0);
  });

  it('ROW-05: multiple available products each produce their own row (no dropped rows)', () => {
    const products = [makeProduct({ id: 'p1', name: 'Ron' }), makeProduct({ id: 'p2', name: 'Vodka' })];
    const categories = [
      makeInventoryCategoryView({
        products: [
          { productId: 'p1', productName: 'Ron', categoryId: 'c1', categoryName: 'Bebidas', totalAvailable: 4, avgCostPrice: 2 },
          { productId: 'p2', productName: 'Vodka', categoryId: 'c1', categoryName: 'Bebidas', totalAvailable: 6, avgCostPrice: 3 },
        ],
      }),
    ];

    const rows = generateProductRows(
      { getAvailableProducts: () => products },
      { getActiveOrdersInDay: () => [] },
      {
        getInventoryEntriesInDay: () => success([]),
        getInventoryCategoriesView: () => success(categories),
        getProductInventoriesByProductId: () => [],
      },
      TODAY,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.productId)).toEqual(['p1', 'p2']);
  });
});
