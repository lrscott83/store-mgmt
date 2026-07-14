import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentType, OrderType } from '@store-mgmt/domain';
import type { Order, Product, InventoryEntryCost, OrderItem, UserModel } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { startOfDay, addDays } from '~/shared/lib/date-utils';

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
    createSaleCredit: vi.fn().mockReturnValue({
      data: {
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
      },
      succeeded: true,
      errors: [],
    }),
    deactivateSaleCreditByOrderId: vi.fn().mockReturnValue({ succeeded: true, errors: [] }),
  })),
}));

// Mock ProductCategoryRepository BEFORE importing OrderOfflineService — used by
// getCategoryCartItemsView to resolve each category's `order` field (falls back to
// Number.MAX_VALUE when the category isn't found, matching Angular's real
// `OrderOfflineService`, which injects `ProductCategoryRepository` directly
// (`order-offline.service.ts:38,79`), not the offline service.
const mockCategoryGetAll = vi.fn().mockReturnValue([]);
vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({
    getProductCategories: mockCategoryGetAll,
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

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    orderItems: [],
    total: 0,
    itemsCount: 0,
    date: new Date(),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    updatedDate: undefined,
    updatedByName: undefined,
    ...overrides,
  };
}

function orderItemFor(
  productId: string,
  name: string,
  opts: { price: number; qty: number; costPrice?: number },
): OrderItem {
  return {
    productId,
    productName: name,
    categoryId: 'cat1',
    categoryName: 'Cat',
    name,
    quantity: opts.qty,
    price: opts.price,
    productBusinessId: 'biz1',
    productCosts:
      opts.costPrice !== undefined
        ? [{ id: 'cost-1', costPrice: opts.costPrice, quantity: opts.qty }]
        : [],
    order: 0,
  };
}

// WU3 (eliminate-base-repository): plain-array wire format (Angular parity,
// order-offline.service.ts:420-423 `JSON.stringify(orders)`), NOT Map-entries.
function seedOrders(storeId: string, orders: Order[]): void {
  localStorage.setItem(`lizoft.store-orders-${storeId}`, JSON.stringify(orders));
}

describe('OrderOfflineService', () => {
  let service: OrderOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    service = new OrderOfflineService(storeId);
  });

  // WU3 (baseservice-parity): getById() was removed (zero prod call-sites, rule 12) — tests
  // that only needed a by-id lookup (not testing getById itself) use this helper instead.
  function findOrder(id: string): Order | undefined {
    return service.getStorageOrders().find((o) => o.id === id);
  }

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

    // Angular parity (audit-user-threading): create stamps createdByName from the
    // authenticated user's login and MUST NOT touch updatedByName/updatedDate.
    it('stamps createdByName with the authenticated user login', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on create', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.updatedByName).toBeUndefined();
      expect(order.updatedDate).toBeUndefined();
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
      // hasInventoryModule defaults to true when create()'s 6th param is omitted.
      expect(inventoryMock.getAvailableInventoryCosts).toHaveBeenCalledWith('p1', 2, {
        product,
        hasInventoryModule: true,
      });
    });

    it('does NOT call getAvailableInventoryCosts when discountFromInvantory=false', () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: false });
      const items = makeCartItems([{ product, quantity: 2 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      expect(inventoryMock.getAvailableInventoryCosts).not.toHaveBeenCalled();
    });

    // Real behavior fix (L4 map diff-matrix #6 / prioritized-list item #7): Angular's
    // createOrderItems gates FIFO deduction on `product.discountFromInvantory &&
    // hasInventoryModuleAvailable()` (order-offline.service.ts:360). Previously create() only
    // checked discountFromInvantory, so a product left with discountFromInvantory=true after
    // the store's inventory module was disabled would still silently deduct inventory.
    it('does NOT call getAvailableInventoryCosts when discountFromInvantory=true but the inventory module is disabled', () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      service.create(items, PaymentType.Efectivo, false, '', OrderType.Normal, false);
      expect(inventoryMock.getAvailableInventoryCosts).not.toHaveBeenCalled();
    });

    it('leaves productCosts empty when discountFromInvantory=true but the inventory module is disabled', () => {
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '', OrderType.Normal, false);
      expect(order.orderItems[0].productCosts).toEqual([]);
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

  describe('ORD-02: create with isCredit=true calls SaleCreditOfflineService.createSaleCredit', () => {
    it('calls createSaleCredit when isCredit=true', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, true, 'Juan Perez');
      expect(creditMock.createSaleCredit).toHaveBeenCalledOnce();
    });

    it('passes the clientName to createSaleCredit', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, true, 'Maria Lopez');
      const callArgs = creditMock.createSaleCredit.mock.calls[0];
      expect(callArgs[1]).toBe('Maria Lopez');
    });

    it('passes the order total to createSaleCredit', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 15 }), quantity: 2 }]);
      service.create(items, PaymentType.Efectivo, true, 'Carlos');
      const callArgs = creditMock.createSaleCredit.mock.calls[0];
      expect(callArgs[2]).toBe(30); // 15 * 2
    });

    it('sets isCredit=true and description on the order', () => {
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, true, 'Pedro');
      expect(order.isCredit).toBe(true);
      expect(order.description).toBe('Pedro');
    });

    it('does NOT call createSaleCredit when isCredit=false', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      expect(creditMock.createSaleCredit).not.toHaveBeenCalled();
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
    it('calls deactivateSaleCreditByOrderId when order is a credit order', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, true, 'Ana');
      service.deactivate(order.id);
      expect(creditMock.deactivateSaleCreditByOrderId).toHaveBeenCalledWith(order.id);
    });

    it('sets order.isActive=false after deactivation', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.deactivate(order.id);
      const found = findOrder(order.id);
      expect(found?.isActive).toBe(false);
    });

    // Angular parity (audit-user-threading): deactivate stamps updatedByName from the
    // authenticated user's login — the nested creditService.deactivateSaleCreditByOrderId call stamps
    // ITS OWN SaleCredit entity separately (mocked here, verified in the SaleCredit suite).
    it('stamps updatedByName with the authenticated user login', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.deactivate(order.id);
      const found = findOrder(order.id);
      expect(found?.updatedByName).toBe('jdoe');
    });
  });

  describe('ORD-10: update stamps updatedByName', () => {
    it('stamps updatedByName with the authenticated user login', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      const updated = service.update(order.id, PaymentType.Tarjeta);
      expect(updated.updatedByName).toBe('jdoe');
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

  // Angular parity (order-offline.service.ts:299-303): getActiveOrdersInDay IGNORES its
  // `date` param and always uses today's day boundaries — the param is kept in the
  // signature for call-site compatibility, mirroring Angular's own unused param.
  describe('ORD-06: getActiveOrdersInDay ignores its date parameter', () => {
    it('returns today orders when called with today', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      const todayOrders = service.getActiveOrdersInDay(new Date());
      expect(todayOrders.length).toBeGreaterThanOrEqual(1);
    });

    it('still returns only TODAY active orders when called with a PAST date (date has zero effect)', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'yesterday-order', date: addDays(now, -1), isActive: true }),
        makeOrder({ id: 'today-order', date: now, isActive: true }),
      ]);
      const yesterday = addDays(now, -1);
      const result = service.getActiveOrdersInDay(yesterday);
      expect(result.map((o) => o.id)).toEqual(['today-order']);
    });
  });

  describe('ORD-2x: getOrderById', () => {
    it('returns the matching order', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(service.getOrderById(order.id)).toEqual(order);
    });

    it('returns undefined for an unknown id', () => {
      expect(service.getOrderById('missing')).toBeUndefined();
    });
  });

  // Angular parity (order-offline.service.ts:286-288): additive, no live tsx caller yet.
  describe('ORD-2x: getActiveTodayOrdersObservable', () => {
    it('resolves succeeded:true with .data = today active orders', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      const result = await service.getActiveTodayOrdersObservable();
      expect(result.succeeded).toBe(true);
      expect(result.data.map((o) => o.id)).toEqual([order.id]);
    });

    it('resolves succeeded:true with empty data when there are no active orders today', async () => {
      const result = await service.getActiveTodayOrdersObservable();
      expect(result.succeeded).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  // Angular parity (order-offline.service.ts:71-74): additive, wraps the WU1-current bare
  // return of getCategoryCartItemsView (B-shape envelope lands in WU4).
  describe('ORD-2x: getCategoryCartItemsViewObservable', () => {
    beforeEach(() => {
      mockCategoryGetAll.mockReturnValue([]);
    });

    it('resolves succeeded:true with .data equal to the sync getCategoryCartItemsView result', async () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 2 },
      ]);
      service.create(items, PaymentType.Efectivo, false, '');

      const date = new Date();
      const syncResult = service.getCategoryCartItemsView(date);
      const result = await service.getCategoryCartItemsViewObservable(date);

      expect(result.succeeded).toBe(true);
      expect(result.data).toEqual(syncResult);
    });
  });

  describe('ORD-2x: getOrdersJson', () => {
    it('returns the exact stored JSON string for the current store', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');
      const raw = localStorage.getItem('lizoft.store-orders-s1');
      expect(service.getOrdersJson()).toBe(raw);
    });

    it('returns "[]" when nothing is stored for that store key', () => {
      expect(service.getOrdersJson()).toBe('[]');
    });

    // Angular parity (order-offline.service.ts:416-418): `localStorage.getItem(...) || "[]"`
    // — a falsy-check (`||`), NOT a nullish-check (`??`). They diverge when getItem returns
    // the empty string "" (falsy but not nullish): Angular/`||` falls back to "[]", a `??`
    // port would incorrectly return "" verbatim.
    it('returns "[]" when the stored value is an empty string (falsy-check parity, not nullish)', () => {
      localStorage.setItem('lizoft.store-orders-s1', '');
      expect(service.getOrdersJson()).toBe('[]');
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

  // WU3 (eliminate-base-repository): inlined persistence — plain-array wire-format, cache,
  // auto-init, 1:1 port of Angular's order-offline.service.ts:400-451.
  describe('Persistence — plain-array wire-format, cache, auto-init (order-offline.service.ts:400-451)', () => {
    // NOTE: does NOT use `vi.restoreAllMocks()` in an afterEach — this test file's
    // module-level `vi.mock()` factories (InventoryOfflineService/SaleCreditOfflineService)
    // would get their `mockImplementation` wiped by a blanket restore, breaking every
    // later test in the file. The outer `beforeEach`'s `vi.clearAllMocks()` already resets
    // call history; the `getItem` spy below is left as a pass-through spy (calls the real
    // implementation), so no explicit restore is needed.

    it('persists orders on-disk as a PLAIN array of order objects, never [id, order] Map-entries pairs', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      service.create(items, PaymentType.Efectivo, false, '');

      const raw = localStorage.getItem('lizoft.store-orders-s1');
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(Array.isArray(parsed[0])).toBe(false);
      expect(typeof parsed[0]).toBe('object');
      expect(parsed[0].id).toBeTruthy();
    });

    it('auto-writes an empty array on the first empty read, without throwing', () => {
      expect(() => service.getStorageOrders()).not.toThrow();
      const raw = localStorage.getItem('lizoft.store-orders-s1');
      expect(raw).toBe('[]');
    });

    it('reuses the in-memory cache across two reads without an intervening write (localStorage.getItem hit once)', () => {
      seedOrders(storeId, [makeOrder({ id: 'o1' })]);
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      service.getStorageOrders();
      service.getStorageOrders();

      const callsForKey = getItemSpy.mock.calls.filter(([key]) => key === 'lizoft.store-orders-s1');
      expect(callsForKey).toHaveLength(1);
    });

    // Angular parity (order-offline.service.ts:456-463): revives ONLY `date` on read;
    // `createdDate`/`updatedDate` remain the raw (unconverted) stored values.
    it('revives ONLY date to a Date instance on a fresh instance re-read; createdDate/updatedDate remain unconverted', () => {
      seedOrders(storeId, [
        makeOrder({
          id: 'o1',
          date: new Date('2024-01-01T00:00:00.000Z'),
          createdDate: new Date('2024-01-01T00:00:00.000Z'),
          updatedDate: new Date('2024-01-02T00:00:00.000Z'),
        }),
      ]);
      const freshService = new OrderOfflineService(storeId);
      const found = freshService.getStorageOrders().find((o) => o.id === 'o1');
      expect(found?.date).toBeInstanceOf(Date);
      expect(found?.createdDate).toBe('2024-01-01T00:00:00.000Z');
      expect(found?.updatedDate).toBe('2024-01-02T00:00:00.000Z');
    });

    // Angular parity (order-offline.service.ts:456-463): getOrdersFromLocalStorage backfills
    // isCredit/paymentType defaults for legacy orders written before those fields existed.
    // Falsy-check semantics (mirrors Angular's `!order.isCredit`/`!order.paymentType`), NOT a
    // stricter "is undefined" check — a legitimately-set order is left untouched.
    it('backfills isCredit=false and paymentType=Efectivo for legacy orders missing those fields', () => {
      const legacyOrderJson = {
        id: 'legacy-1',
        orderItems: [],
        total: 0,
        itemsCount: 0,
        date: new Date('2024-01-01T00:00:00.000Z'),
        type: OrderType.Normal,
        description: '',
        isActive: true,
        createdDate: new Date('2024-01-01T00:00:00.000Z'),
        createdByName: 'test',
        updatedDate: undefined,
        updatedByName: undefined,
        // isCredit/paymentType intentionally OMITTED (legacy pre-existing data).
      };
      localStorage.setItem(
        `lizoft.store-orders-${storeId}`,
        JSON.stringify([
          legacyOrderJson,
          makeOrder({ id: 'current-1', isCredit: true, paymentType: PaymentType.Tarjeta }),
        ]),
      );
      const freshService = new OrderOfflineService(storeId);
      const orders = freshService.getStorageOrders();

      const legacy = orders.find((o) => o.id === 'legacy-1');
      expect(legacy?.isCredit).toBe(false);
      expect(legacy?.paymentType).toBe(PaymentType.Efectivo);

      const current = orders.find((o) => o.id === 'current-1');
      expect(current?.isCredit).toBe(true);
      expect(current?.paymentType).toBe(PaymentType.Tarjeta);
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
      expect(inventoryMock.getAvailableInventoryCosts).toHaveBeenCalledWith('p1', 2, {
        product,
        hasInventoryModule: true,
      });
    });
  });

  // WU1 (offline-online-service-parity, Slice 1): delete(id) is a BaseService<Order>
  // conformance alias for deactivate(id) — Order has no separate "plain" soft-delete
  // concept, so delete delegates to the full deactivate cascade (credit void + inventory
  // restore) rather than inventing new partial-delete semantics.
  // WU2 (offline-online-service-parity, Slice 1): activateOrder is flag-only
  // (Angular's updateOrderActive(id, true)) — no credit/inventory cascade, unlike deactivate.
  describe('ORD-12: activateOrder — flag-only, no cascade', () => {
    it('sets isActive=true', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.deactivate(order.id);
      service.activateOrder(order.id);
      expect(findOrder(order.id)?.isActive).toBe(true);
    });

    it('throws for a missing id', () => {
      expect(() => service.activateOrder('missing')).toThrow();
    });

    it('does NOT cascade to credit/inventory (unlike deactivate)', () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, true, 'Ana');
      vi.clearAllMocks();
      service.activateOrder(order.id);
      expect(creditMock.deactivateSaleCreditByOrderId).not.toHaveBeenCalled();
      expect(inventoryMock.increaseQuantitiesByOrderItems).not.toHaveBeenCalled();
    });

    it('stamps updatedByName with the authenticated user login', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      service.activateOrder(order.id);
      expect(findOrder(order.id)?.updatedByName).toBe('jdoe');
    });
  });

  // ADR-5: financial helpers use RAW date boundaries (pre-snapped by the Today/Yesterday
  // wrappers), via a private active*Between helper — NOT the day-snapping getByDateRange.
  describe('ORD-13: getActiveOrdersPriceToday/Yesterday/BetweenDates', () => {
    it('Today sums active orders total for today only', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'today-1', total: 100, date: now, isActive: true }),
        makeOrder({ id: 'yesterday-1', total: 50, date: addDays(now, -1), isActive: true }),
      ]);
      expect(service.getActiveOrdersPriceToday()).toBe(100);
    });

    it('excludes inactive orders from Today', () => {
      const now = new Date();
      seedOrders(storeId, [makeOrder({ id: 'inactive-today', total: 500, date: now, isActive: false })]);
      expect(service.getActiveOrdersPriceToday()).toBe(0);
    });

    it('Yesterday sums active orders total for yesterday only', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'today-1', total: 100, date: now, isActive: true }),
        makeOrder({ id: 'yesterday-1', total: 50, date: addDays(now, -1), isActive: true }),
      ]);
      expect(service.getActiveOrdersPriceYesterday()).toBe(50);
    });

    it('BetweenDates sums active orders total in an explicit raw window', () => {
      const now = new Date();
      const start = addDays(startOfDay(now), -2);
      const end = addDays(startOfDay(now), -1);
      seedOrders(storeId, [
        makeOrder({ id: 'in-range', total: 30, date: addDays(now, -2), isActive: true }),
        makeOrder({ id: 'out-of-range', total: 999, date: now, isActive: true }),
      ]);
      expect(service.getActiveOrdersPriceBetweenDates(start, end)).toBe(30);
    });
  });

  describe('ORD-14: getActiveOrdersProfitToday/Yesterday/BetweenDates', () => {
    it('Today sums profit (price*qty - cost*qty) for active orders today', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({
          id: 'o1',
          date: now,
          isActive: true,
          orderItems: [orderItemFor('p1', 'Cola', { price: 10, qty: 2, costPrice: 3 })],
        }),
      ]);
      // profit = 10*2 - 3*2 = 14
      expect(service.getActiveOrdersProfitToday()).toBe(14);
    });

    it('Yesterday sums profit for active orders yesterday only', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({
          id: 'y1',
          date: addDays(now, -1),
          isActive: true,
          orderItems: [orderItemFor('p1', 'Cola', { price: 5, qty: 1, costPrice: 1 })],
        }),
        makeOrder({
          id: 't1',
          date: now,
          isActive: true,
          orderItems: [orderItemFor('p1', 'Cola', { price: 100, qty: 1, costPrice: 1 })],
        }),
      ]);
      expect(service.getActiveOrdersProfitYesterday()).toBe(4);
    });

    it('BetweenDates sums profit in an explicit raw window', () => {
      const now = new Date();
      const start = addDays(startOfDay(now), -2);
      const end = addDays(startOfDay(now), -1);
      seedOrders(storeId, [
        makeOrder({
          id: 'in-range',
          date: addDays(now, -2),
          isActive: true,
          orderItems: [orderItemFor('p1', 'Cola', { price: 20, qty: 1, costPrice: 5 })],
        }),
      ]);
      expect(service.getActiveOrdersProfitBetweenDates(start, end)).toBe(15);
    });

    it('excludes inactive orders', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({
          id: 'inactive',
          date: now,
          isActive: false,
          orderItems: [orderItemFor('p1', 'Cola', { price: 100, qty: 5, costPrice: 1 })],
        }),
      ]);
      expect(service.getActiveOrdersProfitToday()).toBe(0);
    });
  });

  // Bug fix (angular-bugs-policy): Angular's getOrdersInDay/getActiveOrdersInDay both ignore
  // the passed `date` param and always use `new Date()`. React honors it from day one.
  describe('ORD-15: getOrdersInDay honors the date param and includes inactive orders', () => {
    it('returns orders for the explicitly passed date, not always today', () => {
      const now = new Date();
      const threeDaysAgo = addDays(now, -3);
      seedOrders(storeId, [
        makeOrder({ id: 'past', date: threeDaysAgo, isActive: true }),
        makeOrder({ id: 'today', date: now, isActive: true }),
      ]);
      expect(service.getOrdersInDay(threeDaysAgo).map((o) => o.id)).toEqual(['past']);
    });

    it('includes inactive orders (no isActive filter, unlike getActiveOrdersInDay)', () => {
      const now = new Date();
      seedOrders(storeId, [makeOrder({ id: 'inactive-today', date: now, isActive: false })]);
      expect(service.getOrdersInDay(now).map((o) => o.id)).toEqual(['inactive-today']);
    });

    it('does not return orders from other days', () => {
      const now = new Date();
      seedOrders(storeId, [makeOrder({ id: 'yesterday', date: addDays(now, -1), isActive: true })]);
      expect(service.getOrdersInDay(now)).toHaveLength(0);
    });

    // Angular parity (order-offline.service.ts:305-311): getOrdersInDay sorts its result by
    // `date` ascending — React's port was missing this sort entirely.
    it('returns orders sorted by date ascending, regardless of insertion/seed order', () => {
      const dayStart = startOfDay(new Date());
      const morning = new Date(dayStart.getTime() + 8 * 60 * 60 * 1000);
      const noon = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);
      const evening = new Date(dayStart.getTime() + 18 * 60 * 60 * 1000);
      seedOrders(storeId, [
        makeOrder({ id: 'evening', date: evening, isActive: true }),
        makeOrder({ id: 'morning', date: morning, isActive: true }),
        makeOrder({ id: 'noon', date: noon, isActive: true }),
      ]);
      expect(service.getOrdersInDay(dayStart).map((o) => o.id)).toEqual([
        'morning',
        'noon',
        'evening',
      ]);
    });
  });

  // Bug fix (angular-bugs-policy): Angular's getTopProductsInLastMonth private helper
  // hardcodes `.slice(0, 5)` regardless of the `top` param passed to it. React honors `top`.
  describe('ORD-16: getTopProductsProfitInLastMonth/getTopProductsSaleQuantityInLastMonth honor `top`', () => {
    // Seeded 1 hour in the past (not exactly `now`) — the window's upper bound is the
    // method's own `new Date()` at call time, so an exact-`now` seed can land on the same
    // millisecond as the method's internal `now` and be excluded by the strict `< now`.
    function seedEightProducts(): void {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const items = Array.from({ length: 8 }, (_, i) =>
        orderItemFor(`p${i}`, `Product ${i}`, { price: 10, qty: i + 1, costPrice: 2 }),
      );
      seedOrders(storeId, [
        makeOrder({ id: 'o1', date: oneHourAgo, isActive: true, orderItems: items }),
      ]);
    }

    it('defaults to top=5 when unspecified', () => {
      seedEightProducts();
      expect(service.getTopProductsSaleQuantityInLastMonth()).toHaveLength(5);
    });

    it('honors top=3 for getTopProductsSaleQuantityInLastMonth', () => {
      seedEightProducts();
      expect(service.getTopProductsSaleQuantityInLastMonth(3)).toHaveLength(3);
    });

    it('honors top=8 (more than Angular hardcoded 5) for getTopProductsSaleQuantityInLastMonth', () => {
      seedEightProducts();
      expect(service.getTopProductsSaleQuantityInLastMonth(8)).toHaveLength(8);
    });

    it('honors top=3 for getTopProductsProfitInLastMonth', () => {
      seedEightProducts();
      expect(service.getTopProductsProfitInLastMonth(3)).toHaveLength(3);
    });

    it('honors top=8 (more than Angular hardcoded 5) for getTopProductsProfitInLastMonth', () => {
      seedEightProducts();
      expect(service.getTopProductsProfitInLastMonth(8)).toHaveLength(8);
    });

    it('sorts by quantity desc for getTopProductsSaleQuantityInLastMonth', () => {
      seedEightProducts();
      const top = service.getTopProductsSaleQuantityInLastMonth(3);
      expect(top.map((t) => t.id)).toEqual(['p7', 'p6', 'p5']); // qty 8,7,6
    });

    it('sorts by profit desc for getTopProductsProfitInLastMonth', () => {
      seedEightProducts();
      // profit = (10-2)*qty = 8*qty for every product, so still ordered by qty desc
      const top = service.getTopProductsProfitInLastMonth(3);
      expect(top.map((t) => t.id)).toEqual(['p7', 'p6', 'p5']);
    });

    it('excludes orders outside the rolling last-29-days window', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({
          id: 'old',
          date: addDays(now, -40),
          isActive: true,
          orderItems: [orderItemFor('pOld', 'Old', { price: 5, qty: 100 })],
        }),
      ]);
      expect(
        service.getTopProductsSaleQuantityInLastMonth().find((t) => t.id === 'pOld'),
      ).toBeUndefined();
    });

    it('excludes inactive orders', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      seedOrders(storeId, [
        makeOrder({
          id: 'inactive',
          date: oneHourAgo,
          isActive: false,
          orderItems: [orderItemFor('pInactive', 'Inactive', { price: 5, qty: 100 })],
        }),
      ]);
      expect(
        service.getTopProductsSaleQuantityInLastMonth().find((t) => t.id === 'pInactive'),
      ).toBeUndefined();
    });
  });

  describe('ORD-17: filterOrders — sync replacement of filterOrdersObservable', () => {
    it('isCredit=-1 returns all active orders regardless of credit status', () => {
      seedOrders(storeId, [
        makeOrder({ id: 'credit', isCredit: true, isActive: true }),
        makeOrder({ id: 'non-credit', isCredit: false, isActive: true }),
      ]);
      expect(service.filterOrders(-1).map((o) => o.id).sort()).toEqual(['credit', 'non-credit']);
    });

    it('isCredit=1 returns only credit orders', () => {
      seedOrders(storeId, [
        makeOrder({ id: 'credit', isCredit: true, isActive: true }),
        makeOrder({ id: 'non-credit', isCredit: false, isActive: true }),
      ]);
      expect(service.filterOrders(1).map((o) => o.id)).toEqual(['credit']);
    });

    it('isCredit=0 returns only non-credit orders', () => {
      seedOrders(storeId, [
        makeOrder({ id: 'credit', isCredit: true, isActive: true }),
        makeOrder({ id: 'non-credit', isCredit: false, isActive: true }),
      ]);
      expect(service.filterOrders(0).map((o) => o.id)).toEqual(['non-credit']);
    });

    it('excludes inactive orders regardless of isCredit filter', () => {
      seedOrders(storeId, [makeOrder({ id: 'inactive', isCredit: false, isActive: false })]);
      expect(service.filterOrders(-1)).toHaveLength(0);
    });

    it('filters by paymentType when provided', () => {
      seedOrders(storeId, [
        makeOrder({ id: 'efectivo', paymentType: PaymentType.Efectivo, isActive: true }),
        makeOrder({ id: 'tarjeta', paymentType: PaymentType.Tarjeta, isActive: true }),
      ]);
      expect(service.filterOrders(-1, PaymentType.Tarjeta).map((o) => o.id)).toEqual(['tarjeta']);
    });

    it('filters by start date (inclusive) when provided', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'before', date: addDays(now, -5), isActive: true }),
        makeOrder({ id: 'after', date: now, isActive: true }),
      ]);
      expect(
        service.filterOrders(-1, undefined, addDays(now, -1)).map((o) => o.id),
      ).toEqual(['after']);
    });

    it('filters by end date (exclusive) when provided', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'before', date: addDays(now, -5), isActive: true }),
        makeOrder({ id: 'after', date: now, isActive: true }),
      ]);
      expect(
        service.filterOrders(-1, undefined, undefined, addDays(now, -1)).map((o) => o.id),
      ).toEqual(['before']);
    });

    // Angular parity (order-offline.service.ts:246-250, getActiveOrders): the private
    // helper backing filterOrders/filterOrdersObservable sorts by `date` ascending.
    it('returns active orders sorted by date ascending, regardless of insertion order', () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'newest', date: now, isActive: true }),
        makeOrder({ id: 'oldest', date: addDays(now, -2), isActive: true }),
        makeOrder({ id: 'middle', date: addDays(now, -1), isActive: true }),
      ]);
      expect(service.filterOrders(-1).map((o) => o.id)).toEqual(['oldest', 'middle', 'newest']);
    });
  });

  describe('ORD-18: create optional details param (description = details || (isCredit ? clientName : \'\'))', () => {
    it('uses details as description when provided (credit order)', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, true, 'Ana', OrderType.Normal, true, 'Special note');
      expect(order.description).toBe('Special note');
    });

    it('falls back to clientName when details is not provided and isCredit=true', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, true, 'Ana');
      expect(order.description).toBe('Ana');
    });

    it('falls back to empty string when details is not provided and isCredit=false', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(items, PaymentType.Efectivo, false, '');
      expect(order.description).toBe('');
    });

    it('uses details even when isCredit=false', () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = service.create(
        items,
        PaymentType.Efectivo,
        false,
        '',
        OrderType.Normal,
        true,
        'Merma note',
      );
      expect(order.description).toBe('Merma note');
    });
  });

  describe('ORD-19: addImportedOrder/updateImportedOrder (sync-import narrow merge, order-sync-import-parity)', () => {
    it('addImportedOrder appends a new order and revives date to a Date instance', () => {
      const imported = makeOrder({
        id: 'imported-1',
        date: '2024-06-01T00:00:00.000Z' as unknown as Date,
      });

      const result = service.addImportedOrder(imported);

      expect(result.succeeded).toBe(true);
      const stored = findOrder('imported-1');
      expect(stored).toBeDefined();
      expect(stored?.date).toBeInstanceOf(Date);
    });

    it('updateImportedOrder narrow-merges ONLY date/isActive/updatedDate/updatedByName, preserving total/orderItems/isCredit/paymentType', () => {
      const seeded = makeOrder({
        id: 'o1',
        total: 500,
        orderItems: [orderItemFor('p1', 'Coca Cola', { price: 5, qty: 2 })],
        isCredit: true,
        paymentType: PaymentType.Efectivo,
        isActive: true,
        description: 'original description',
      });
      seedOrders(storeId, [seeded]);
      service = new OrderOfflineService(storeId);

      const updatedDate = new Date('2024-07-01T00:00:00.000Z');
      const imported = makeOrder({
        id: 'o1',
        date: '2024-07-02T00:00:00.000Z' as unknown as Date,
        isActive: false,
        updatedDate,
        updatedByName: 'jdoe',
        // Different protected fields — MUST be ignored by the narrow merge.
        total: 999,
        orderItems: [orderItemFor('p2', 'Fanta', { price: 3, qty: 5 })],
        isCredit: false,
        paymentType: PaymentType.Tarjeta,
      });

      const result = service.updateImportedOrder(imported);

      expect(result.succeeded).toBe(true);
      const stored = findOrder('o1');
      expect(stored?.date).toBeInstanceOf(Date);
      expect(stored?.date.toISOString()).toBe('2024-07-02T00:00:00.000Z');
      expect(stored?.isActive).toBe(false);
      expect(stored?.updatedDate).toEqual(updatedDate);
      expect(stored?.updatedByName).toBe('jdoe');
      // Protected fields UNCHANGED from the original seed.
      expect(stored?.total).toBe(500);
      expect(stored?.orderItems).toEqual(seeded.orderItems);
      expect(stored?.isCredit).toBe(true);
      expect(stored?.paymentType).toBe(PaymentType.Efectivo);
      expect(stored?.description).toBe('original description');
    });

    it('updateImportedOrder is a no-op when the id is absent from storage (no throw, no insert)', () => {
      seedOrders(storeId, [makeOrder({ id: 'o1' })]);
      service = new OrderOfflineService(storeId);

      const imported = makeOrder({ id: 'missing-id' });

      const result = service.updateImportedOrder(imported);

      expect(result.succeeded).toBe(true);
      expect(service.getStorageOrders()).toHaveLength(1);
      expect(findOrder('missing-id')).toBeUndefined();
    });
  });
});
