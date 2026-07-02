import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentType, OrderType } from '@store-mgmt/domain';
import type { Product, InventoryEntryCost, OrderItem } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';

// Mock InventoryOfflineService BEFORE importing OrderOfflineService
vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableInventoryCosts: vi.fn().mockReturnValue([]),
    increaseQuantitiesByOrderItems: vi.fn(),
  })),
}));

// Mock SaleCreditOfflineService BEFORE importing OrderOfflineService
vi.mock('../sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    createFromOrder: vi.fn().mockReturnValue({
      id: 'credit-1',
      orderId: 'order-1',
      client: 'Test',
      total: 100,
      paid: 0,
      isPaid: false,
      isActive: true,
      date: new Date(),
      paidDate: null,
      paidType: null,
      note: '',
      createdDate: new Date(),
      createdByName: '',
    }),
    voidByOrderId: vi.fn(),
  })),
}));

// Mock ProductCategoryOfflineService BEFORE importing OrderOfflineService — used by
// getCategoryCartItemsView to resolve each category's `order` field (falls back to
// Number.MAX_VALUE when the category isn't found, matching Angular).
const mockCategoryGetAll = vi.fn().mockReturnValue([]);
vi.mock('../product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: mockCategoryGetAll,
  })),
}));

import { OrderOfflineService } from '../order-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { SaleCreditOfflineService } from '../sale-credit-offline-service';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Coca Cola',
    barcode: '123',
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    price: 5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz1',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function makeCartItems(
  products: Array<{ product: Product; quantity: number; price?: number }>,
): CartItem[] {
  return products.map(({ product, quantity, price }) => ({ product, quantity, price }));
}

describe('OrderOfflineService', () => {
  let service: OrderOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    service = new OrderOfflineService(storeId);
  });

  describe('ORD-01: create builds correct orderItems (FIFO mock)', () => {
    it('creates an order with correct total', () => {
      const items = makeCartItems([
        { product: makeProduct({ price: 5 }), quantity: 2 },
        { product: makeProduct({ id: 'p2', name: 'Fanta', price: 3 }), quantity: 1 },
      ]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.total).toBe(13); // 5*2 + 3*1
    });

    it('creates an order with correct itemsCount', () => {
      const items = makeCartItems([
        { product: makeProduct({ price: 5 }), quantity: 2 },
        { product: makeProduct({ id: 'p2', name: 'Fanta', price: 3 }), quantity: 3 },
      ]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.itemsCount).toBe(5); // 2 + 3
    });

    it('creates an order with type=Normal', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.type).toBe(OrderType.Normal);
    });

    it('creates an order with a unique id', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const o1 = service.create(items, PaymentType.Efectivo, false, '');
      const o2 = service.create(items, PaymentType.Efectivo, false, '');
      expect(o1.id).not.toBe(o2.id);
    });

    it('persists the order to localStorage', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      const raw = localStorage.getItem('lizoft.store-orders-s1');
      expect(raw).not.toBeNull();
    });

    it('sets isActive=true on the new order', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.isActive).toBe(true);
    });

    it('builds orderItems with correct product info', () => {
      const product = makeProduct({ id: 'p1', name: 'Cola', categoryId: 'cat1', categoryName: 'Drinks', price: 4 });
      const items = makeCartItems([{ product, quantity: 2 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      const oi = order.orderItems[0];
      expect(oi.productId).toBe('p1');
      expect(oi.productName).toBe('Cola');
      expect(oi.quantity).toBe(2);
      expect(oi.price).toBe(4);
    });

    it('calls getAvailableInventoryCosts when discountFromInvantory=true', () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      expect(inventoryMock.getAvailableInventoryCosts).toHaveBeenCalledWith('p1', 2);
    });

    it('does NOT call getAvailableInventoryCosts when discountFromInvantory=false', () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: false });
      const items = makeCartItems([{ product, quantity: 2 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      expect(inventoryMock.getAvailableInventoryCosts).not.toHaveBeenCalled();
    });

    it('sets productCosts from getAvailableInventoryCosts when discountFromInvantory=true', () => {
      const fakeCosts: InventoryEntryCost[] = [{ id: 'e1', costPrice: 2.5, quantity: 2 }];
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      inventoryMock.getAvailableInventoryCosts.mockReturnValue(fakeCosts);

      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.orderItems[0].productCosts).toEqual(fakeCosts);
    });
  });

  describe('ORD-02: create with isCredit=true calls SaleCreditOfflineService.createFromOrder', () => {
    it('calls createFromOrder when isCredit=true', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, true, 'Juan Perez');
      expect(creditMock.createFromOrder).toHaveBeenCalledOnce();
    });

    it('passes the clientName to createFromOrder', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, true, 'Maria Lopez');
      const callArgs = creditMock.createFromOrder.mock.calls[0];
      expect(callArgs[1]).toBe('Maria Lopez');
    });

    it('passes the order total to createFromOrder', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 15 }), quantity: 2 }]);
      service.create(items, PaymentType.Efectivo, true, 'Carlos');
      const callArgs = creditMock.createFromOrder.mock.calls[0];
      expect(callArgs[2]).toBe(30); // 15 * 2
    });

    it('sets isCredit=true and description on the order', () => {
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, true, 'Pedro');
      expect(order.isCredit).toBe(true);
      expect(order.description).toBe('Pedro');
    });

    it('does NOT call createFromOrder when isCredit=false', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      expect(creditMock.createFromOrder).not.toHaveBeenCalled();
    });
  });

  describe('ORD-03: deactivate restores inventory', () => {
    it('calls increaseQuantitiesByOrderItems on deactivation', () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.deactivate(order.id);
      expect(inventoryMock.increaseQuantitiesByOrderItems).toHaveBeenCalledOnce();
    });

    it('passes the order items to increaseQuantitiesByOrderItems', () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.deactivate(order.id);
      const passedItems = inventoryMock.increaseQuantitiesByOrderItems.mock.calls[0][0];
      expect(passedItems).toEqual(order.orderItems);
    });
  });

  describe('ORD-04: deactivate voids associated credit', () => {
    it('calls voidByOrderId when order is a credit order', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, true, 'Ana');
      service.deactivate(order.id);
      expect(creditMock.voidByOrderId).toHaveBeenCalledWith(order.id);
    });

    it('sets order.isActive=false after deactivation', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.deactivate(order.id);
      const found = service.getById(order.id);
      expect(found?.isActive).toBe(false);
    });
  });

  describe('ORD-05: getByDateRange filters correctly', () => {
    it('returns orders within the date range', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      const results = service.getByDateRange(from, to);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('excludes orders outside the date range', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);
      const results = service.getByDateRange(yesterday, yesterdayEnd);
      expect(results).toHaveLength(0);
    });

    it('only returns active orders', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.deactivate(order.id);
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      const results = service.getByDateRange(from, to);
      expect(results.every((o) => o.isActive)).toBe(true);
    });
  });

  describe('ORD-06: getAll / getById / getActiveOrdersInDay', () => {
    it('getAll returns empty initially', () => {
      expect(service.getAll()).toEqual([]);
    });

    it('getById returns the correct order', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      const found = service.getById(order.id);
      expect(found?.id).toBe(order.id);
    });

    it('getActiveOrdersInDay returns today orders', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      const todayOrders = service.getActiveOrdersInDay(new Date());
      expect(todayOrders.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ORD-07: storage key format', () => {
    it('uses lizoft.store-orders-{storeId} as key', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      const raw = localStorage.getItem('lizoft.store-orders-s1');
      expect(raw).not.toBeNull();
    });
  });

  describe('ORD-08: getCategoryCartItemsView (Angular getCategoryCartItemsView 1:1 port)', () => {
    beforeEach(() => {
      mockCategoryGetAll.mockReturnValue([
        { id: 'cat1', name: 'Bebidas', order: 2, isActive: true },
        { id: 'cat2', name: 'Snacks', order: 1, isActive: true },
      ]);
    });

    it('returns empty array when there are no active orders today', () => {
      expect(service.getCategoryCartItemsView(new Date())).toEqual([]);
    });

    it('groups order items by categoryId, aggregating total/itemsCount across orders', () => {
      const items1 = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 2 },
      ]);
      const items2 = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 3 },
      ]);
      service.create(items1, PaymentType.Efectivo, false, '');
      service.create(items2, PaymentType.Efectivo, false, '');

      const result = service.getCategoryCartItemsView(new Date());
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cat1');
      expect(result[0].name).toBe('Bebidas');
      expect(result[0].total).toBe(25); // 5*2 + 5*3
      expect(result[0].itemsCount).toBe(5); // 2 + 3
    });

    it('further groups by productId within each category, with per-product total/itemsCount', () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', name: 'Cola', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 2 },
        { product: makeProduct({ id: 'p2', name: 'Fanta', categoryId: 'cat1', categoryName: 'Bebidas', price: 3 }), quantity: 1 },
      ]);
      service.create(items, PaymentType.Efectivo, false, '');

      const result = service.getCategoryCartItemsView(new Date());
      expect(result[0].productItems).toHaveLength(2);
      const cola = result[0].productItems.find((p) => p.name === 'Cola');
      const fanta = result[0].productItems.find((p) => p.name === 'Fanta');
      expect(cola?.total).toBe(10);
      expect(cola?.itemsCount).toBe(2);
      expect(fanta?.total).toBe(3);
      expect(fanta?.itemsCount).toBe(1);
    });

    it("resolves each category's order field from ProductCategoryOfflineService", () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat2', categoryName: 'Snacks', price: 2 }), quantity: 1 },
      ]);
      service.create(items, PaymentType.Efectivo, false, '');
      const result = service.getCategoryCartItemsView(new Date());
      expect(result[0].order).toBe(1); // cat2's order from the mocked category list
    });

    it('falls back to Number.MAX_VALUE when the category is not found in storage', () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'unknown-cat', categoryName: 'Ghost', price: 2 }), quantity: 1 },
      ]);
      service.create(items, PaymentType.Efectivo, false, '');
      const result = service.getCategoryCartItemsView(new Date());
      expect(result[0].order).toBe(Number.MAX_VALUE);
    });

    it('excludes inactive (deactivated) orders', () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 1 },
      ]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.deactivate(order.id);
      expect(service.getCategoryCartItemsView(new Date())).toEqual([]);
    });
  });

  // Egress/Mayorista realignment: create() gains a 5th orderType param, Normal-preserving by
  // default. Per-item custom price (CartItem.price) flows into orderItem.price/order.total,
  // and FIFO inventory deduction (getAvailableInventoryCosts) still runs identically for a
  // Mayorista sale, since the discountFromInvantory branch is unrelated to orderType.
  describe('ORD-09: create with orderType=Mayorista + custom per-item price', () => {
    it('defaults order.type to Normal when orderType is not passed (Normal-preserving)', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.type).toBe(OrderType.Normal);
    });

    it('persists order.type=Mayorista when passed', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '', OrderType.Mayorista);
      expect(order.type).toBe(OrderType.Mayorista);
    });

    it('uses the cart item custom price (not product.price) for orderItem.price when set', () => {
      const items = makeCartItems([
        { product: makeProduct({ price: 5 }), quantity: 2, price: 8 },
      ]);
      const order = service.create(items, PaymentType.Efectivo, false, '', OrderType.Mayorista);
      expect(order.orderItems[0].price).toBe(8);
    });

    it('uses the custom price (not product.price) for order.total when set', () => {
      const items = makeCartItems([
        { product: makeProduct({ price: 5 }), quantity: 2, price: 8 },
      ]);
      const order = service.create(items, PaymentType.Efectivo, false, '', OrderType.Mayorista);
      expect(order.total).toBe(16); // 8 * 2, NOT 5 * 2
    });

    it('falls back to product.price when the cart item has no custom price, even for Mayorista', () => {
      const items = makeCartItems([{ product: makeProduct({ price: 5 }), quantity: 2 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '', OrderType.Mayorista);
      expect(order.orderItems[0].price).toBe(5);
      expect(order.total).toBe(10);
    });

    it('still runs FIFO inventory deduction (getAvailableInventoryCosts) for a Mayorista sale', () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2, price: 9 }]);
      service.create(items, PaymentType.Efectivo, false, '', OrderType.Mayorista);
      expect(inventoryMock.getAvailableInventoryCosts).toHaveBeenCalledWith('p1', 2);
    });
  });
});
