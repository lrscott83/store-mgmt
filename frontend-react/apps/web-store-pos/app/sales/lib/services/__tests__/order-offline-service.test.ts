import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EModules, OrderErrors, PaymentType, OrderType } from '@store-mgmt/domain';
import type { BaseResponseModel, Order, Product, InventoryEntryCost, OrderItem, UserModel } from '@store-mgmt/domain';

// response-envelope-nullability: `data` only narrows to non-null on the succeeded
// branch. These tests only ever exercise the success path, so unwrap once instead of
// repeating an `if (!x.succeeded) throw` guard at every assertion site.
function unwrap<T>(response: BaseResponseModel<T>): T {
  if (!response.succeeded) throw new Error('expected succeeded response');
  return response.data;
}
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

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
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
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
        ? [{ inventoryId: 'cost-1', costPrice: opts.costPrice, quantity: opts.qty }]
        : [],
    order: 0,
  };
}

// WU3 (eliminate-base-repository): plain-array wire format (Angular parity,
// order-offline.service.ts:420-423 `JSON.stringify(orders)`), NOT Map-entries.
function seedOrders(storeId: string, orders: Order[]): void {
  localStorage.setItem(`lizoft.store-orders-${storeId}`, JSON.stringify(orders));
}

// WU2 (order-offline-service-parity): createOrder is now async (C-shape) and its
// inventory-module gate is sourced internally from useAuthStore — no caller-supplied
// override. This helper preserves the pre-WU2 positional test-call shape (cartItems,
// paymentType, isCredit, clientName, orderType?, details?) for the many call-sites that
// only use createOrder() as setup scaffolding, not to test its own signature/shape
// (those live in ORD-01/ORD-02/ORD-09/ORD-18, which call `service.createOrder(...)`
// directly in Angular's own param order and assert on the returned envelope).
async function createTestOrder(
  svc: OrderOfflineService,
  cartItems: CartItem[],
  paymentType: PaymentType,
  isCredit: boolean,
  clientName: string,
  orderType: OrderType = OrderType.Normal,
  details?: string,
): Promise<Order> {
  const result = await svc.createOrder(cartItems, orderType, isCredit, paymentType, details, clientName);
  return unwrap(result);
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

  describe('ORD-01: createOrder builds correct orderItems (FIFO mock)', () => {
    it('creates an order with correct total', async () => {
      const items = makeCartItems([
        { product: makeProduct({ price: 5 }), quantity: 2 },
        { product: makeProduct({ id: 'p2', name: 'Fanta', price: 3 }), quantity: 1 },
      ]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.succeeded).toBe(true);
      expect(result.data?.total).toBe(13); // 5*2 + 3*1
    });

    it('creates an order with correct itemsCount', async () => {
      const items = makeCartItems([
        { product: makeProduct({ price: 5 }), quantity: 2 },
        { product: makeProduct({ id: 'p2', name: 'Fanta', price: 3 }), quantity: 3 },
      ]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.itemsCount).toBe(5); // 2 + 3
    });

    it('creates an order with type=Normal', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.type).toBe(OrderType.Normal);
    });

    it('creates an order with a unique id', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const r1 = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      const r2 = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(r1.data?.id).not.toBe(r2.data?.id);
    });

    it('persists the order to localStorage', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      const raw = localStorage.getItem('lizoft.store-orders-s1');
      expect(raw).not.toBeNull();
    });

    it('sets isActive=true on the new order', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.isActive).toBe(true);
    });

    // Angular parity (audit-user-threading): createOrder stamps createdByName from the
    // authenticated user's login and MUST NOT touch updatedByName/updatedDate.
    it('stamps createdByName with the authenticated user login', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on create', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.updatedByName).toBeUndefined();
      expect(result.data?.updatedDate).toBeUndefined();
    });

    it('builds orderItems with correct product info', async () => {
      const product = makeProduct({ id: 'p1', name: 'Cola', categoryId: 'cat1', categoryName: 'Drinks', price: 4 });
      const items = makeCartItems([{ product, quantity: 2 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      const oi = unwrap(result).orderItems[0];
      expect(oi.productId).toBe('p1');
      expect(oi.productName).toBe('Cola');
      expect(oi.quantity).toBe(2);
      expect(oi.price).toBe(4);
    });

    // Post-verify parity fix (order-offline-service-parity): Angular's createOrderItems
    // stamps OrderItem.order from the Product's own `order` attribute
    // (order-offline.service.ts:377: `order: product.order`), NOT the cart array index.
    // getCategoryCartItemsView reads this field to build the "Cuadre del día" view, so
    // stamping the index instead corrupts persisted order data vs Angular.
    it('stamps orderItems[].order from product.order, not the cart index', async () => {
      const productA = makeProduct({ id: 'pA', name: 'Product A', order: 5 });
      const productB = makeProduct({ id: 'pB', name: 'Product B', order: 2 });
      const items = makeCartItems([
        { product: productA, quantity: 1 }, // cart index 0
        { product: productB, quantity: 1 }, // cart index 1
      ]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      const orderItems = unwrap(result).orderItems;
      expect(orderItems[0].order).toBe(5); // productA.order, NOT cart index 0
      expect(orderItems[1].order).toBe(2); // productB.order, NOT cart index 1
    });

    // WU2 (order-offline-service-parity): the inventory-module gate is now sourced
    // internally from useAuthStore (no caller-supplied hasInventoryModule flag) — the
    // default test user (beforeEach) has storeModuleIds:[] (no Inventory module), so
    // tests that need deduction to fire must opt IN by setting EModules.Inventory.
    it('calls getAvailableInventoryCosts when discountFromInvantory=true and the user has the inventory module', async () => {
      useAuthStore.setState({
        user: makeUser({ login: 'jdoe', storeModuleIds: [EModules.Inventory] }),
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(inventoryMock.getAvailableInventoryCosts).toHaveBeenCalledWith('p1', 2, {
        product,
        hasInventoryModule: true,
      });
    });

    it('does NOT call getAvailableInventoryCosts when discountFromInvantory=false', async () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: false });
      const items = makeCartItems([{ product, quantity: 2 }]);
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(inventoryMock.getAvailableInventoryCosts).not.toHaveBeenCalled();
    });

    // Real behavior fix (L4 map diff-matrix #6 / prioritized-list item #7): Angular's
    // createOrderItems gates FIFO deduction on `product.discountFromInvantory &&
    // hasInventoryModuleAvailable()` (order-offline.service.ts:360). The default test user
    // (beforeEach) has no inventory module, so deduction must NOT fire.
    it('does NOT call getAvailableInventoryCosts when discountFromInvantory=true but the inventory module is disabled', async () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(inventoryMock.getAvailableInventoryCosts).not.toHaveBeenCalled();
    });

    // WU2 module-gate test (design Testing Strategy): no authenticated user at all ->
    // the internal gate must also resolve to false (mirrors `user ? hasInventoryModuleAvailable(user) : false`).
    it('does NOT call getAvailableInventoryCosts when there is no authenticated user at all', async () => {
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(inventoryMock.getAvailableInventoryCosts).not.toHaveBeenCalled();
    });

    it('leaves productCosts empty when discountFromInvantory=true but the inventory module is disabled', async () => {
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.orderItems[0].productCosts).toEqual([]);
    });

    it('sets productCosts from getAvailableInventoryCosts when discountFromInvantory=true', async () => {
      useAuthStore.setState({
        user: makeUser({ login: 'jdoe', storeModuleIds: [EModules.Inventory] }),
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      const fakeCosts: InventoryEntryCost[] = [{ inventoryId: 'e1', costPrice: 2.5, quantity: 2 }];
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      inventoryMock.getAvailableInventoryCosts.mockReturnValue(fakeCosts);

      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.orderItems[0].productCosts).toEqual(fakeCosts);
    });
  });

  describe('ORD-02: createOrder with isCredit=true calls SaleCreditOfflineService.createSaleCredit', () => {
    it('calls createSaleCredit when isCredit=true', async () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      await service.createOrder(items, OrderType.Normal, true, PaymentType.Efectivo, undefined, 'Juan Perez');
      expect(creditMock.createSaleCredit).toHaveBeenCalledOnce();
    });

    it('passes the clientName to createSaleCredit', async () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      await service.createOrder(items, OrderType.Normal, true, PaymentType.Efectivo, undefined, 'Maria Lopez');
      const callArgs = creditMock.createSaleCredit.mock.calls[0];
      expect(callArgs[1]).toBe('Maria Lopez');
    });

    it('passes the order total to createSaleCredit', async () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct({ price: 15 }), quantity: 2 }]);
      await service.createOrder(items, OrderType.Normal, true, PaymentType.Efectivo, undefined, 'Carlos');
      const callArgs = creditMock.createSaleCredit.mock.calls[0];
      expect(callArgs[2]).toBe(30); // 15 * 2
    });

    it('sets isCredit=true and description on the order', async () => {
      const items = makeCartItems([{ product: makeProduct({ price: 10 }), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, true, PaymentType.Efectivo, undefined, 'Pedro');
      expect(result.data?.isCredit).toBe(true);
      expect(result.data?.description).toBe('Pedro');
    });

    it('does NOT call createSaleCredit when isCredit=false', async () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(creditMock.createSaleCredit).not.toHaveBeenCalled();
    });
  });

  describe('ORD-03: deactivateOrder restores inventory (D-shape Result)', () => {
    it('calls increaseQuantitiesByOrderItems on deactivation', async () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      service.deactivateOrder(order.id);
      expect(inventoryMock.increaseQuantitiesByOrderItems).toHaveBeenCalledOnce();
    });

    it('passes the order items to increaseQuantitiesByOrderItems', async () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      service.deactivateOrder(order.id);
      const passedItems = inventoryMock.increaseQuantitiesByOrderItems.mock.calls[0][0];
      expect(passedItems).toEqual(order.orderItems);
    });

    // Cascade-guard (gate c): failure BEFORE restock.
    it('returns Result.Failure and does NOT restock when deactivateSaleCreditByOrderId fails', async () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, true, 'Ana');
      creditMock.deactivateSaleCreditByOrderId.mockReturnValueOnce({ succeeded: false, errors: [] });
      const result = service.deactivateOrder(order.id);
      expect(result.succeeded).toBe(false);
      expect(inventoryMock.increaseQuantitiesByOrderItems).not.toHaveBeenCalled();
    });

    it('returns the restock call Result (not a blanket Success()) when the cascade succeeds', async () => {
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      inventoryMock.increaseQuantitiesByOrderItems.mockReturnValueOnce({ succeeded: true, errors: [] });
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      const result = service.deactivateOrder(order.id);
      expect(result.succeeded).toBe(true);
      expect(inventoryMock.increaseQuantitiesByOrderItems).toHaveBeenCalledOnce();
    });
  });

  describe('ORD-04: deactivateOrder voids associated credit (unconditional cascade, Angular parity)', () => {
    it('calls deactivateSaleCreditByOrderId when order is a credit order', async () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, true, 'Ana');
      service.deactivateOrder(order.id);
      expect(creditMock.deactivateSaleCreditByOrderId).toHaveBeenCalledWith(order.id);
    });

    // Angular parity (order-offline.service.ts:322-324): NO `if (order.isCredit)` guard —
    // the credit-void call happens for every order, credit or not (no-op success when the
    // order has no credit, per deactivateSaleCreditByOrderId's own contract).
    it('calls deactivateSaleCreditByOrderId UNCONDITIONALLY, even for a non-credit order', async () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      service.deactivateOrder(order.id);
      expect(creditMock.deactivateSaleCreditByOrderId).toHaveBeenCalledWith(order.id);
    });

    it('sets order.isActive=false after deactivation', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      service.deactivateOrder(order.id);
      const found = findOrder(order.id);
      expect(found?.isActive).toBe(false);
    });

    // Angular parity (audit-user-threading): deactivateOrder stamps updatedByName from the
    // authenticated user's login — the nested creditService.deactivateSaleCreditByOrderId call stamps
    // ITS OWN SaleCredit entity separately (mocked here, verified in the SaleCredit suite).
    it('stamps updatedByName with the authenticated user login', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      service.deactivateOrder(order.id);
      const found = findOrder(order.id);
      expect(found?.updatedByName).toBe('jdoe');
    });
  });

  describe('ORD-10: updateTodayOrder stamps updatedByName (D-shape DataResult, never throws)', () => {
    it('stamps updatedByName with the authenticated user login', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      const result = service.updateTodayOrder(order.id, PaymentType.Tarjeta);
      expect(result.succeeded).toBe(true);
      expect(result.data?.paymentType).toBe(PaymentType.Tarjeta);
      expect(result.data?.updatedByName).toBe('jdoe');
    });

    it('returns DataResult failure with OrderErrors.NotExists for an unknown id, does not throw', () => {
      expect(() => service.updateTodayOrder('missing', PaymentType.Tarjeta)).not.toThrow();
      const result = service.updateTodayOrder('missing', PaymentType.Tarjeta);
      expect(result.succeeded).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toEqual([OrderErrors.NotExists]);
    });
  });

  // Angular parity (order-offline.service.ts:299-303): getActiveOrdersInDay IGNORES its
  // `date` param and always uses today's day boundaries — the param is kept in the
  // signature for call-site compatibility, mirroring Angular's own unused param.
  describe('ORD-06: getActiveOrdersInDay ignores its date parameter', () => {
    it('returns today orders when called with today', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');
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
    it('returns the matching order', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
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
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      const result = await service.getActiveTodayOrdersObservable();
      expect(result.succeeded).toBe(true);
      expect(unwrap(result).map((o) => o.id)).toEqual([order.id]);
    });

    it('resolves succeeded:true with empty data when there are no active orders today', async () => {
      const result = await service.getActiveTodayOrdersObservable();
      expect(result.succeeded).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  // Angular parity (order-offline.service.ts:71-74): additive. WU4: getCategoryCartItemsView
  // now returns its own B-shape envelope, so this Observable wrapper unwraps `.data` off it
  // rather than double-wrapping the whole envelope.
  describe('ORD-2x: getCategoryCartItemsViewObservable', () => {
    beforeEach(() => {
      mockCategoryGetAll.mockReturnValue([]);
    });

    it('resolves succeeded:true with .data equal to the sync getCategoryCartItemsView().data', async () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 2 },
      ]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');

      const date = new Date();
      const syncResult = service.getCategoryCartItemsView(date);
      const result = await service.getCategoryCartItemsViewObservable(date);

      expect(result.succeeded).toBe(true);
      expect(result.data).toEqual(syncResult.data);
    });
  });

  describe('ORD-2x: getOrdersJson', () => {
    it('returns the exact stored JSON string for the current store', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');
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
    it('uses lizoft.store-orders-{storeId} as key', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');
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

    it('persists orders on-disk as a PLAIN array of order objects, never [id, order] Map-entries pairs', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');

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

    it('throws instead of returning an empty array when the stored orders cannot be read', () => {
      localStorage.setItem('lizoft.store-orders-s1', 'enc:v1:AAAA');
      const freshService = new OrderOfflineService('s1');
      expect(() => freshService.getStorageOrders()).toThrow(MissingDataKeyError);
    });

    it('leaves the unreadable bytes byte-for-byte intact', () => {
      const bytes = 'enc:v1:AAAA';
      localStorage.setItem('lizoft.store-orders-s1', bytes);
      const freshService = new OrderOfflineService('s1');
      expect(() => freshService.getStorageOrders()).toThrow();
      expect(localStorage.getItem('lizoft.store-orders-s1')).toBe(bytes);
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

  describe('ORD-08: getCategoryCartItemsView (Angular getCategoryCartItemsView 1:1 port, B-shape envelope)', () => {
    beforeEach(() => {
      mockCategoryGetAll.mockReturnValue([
        { id: 'cat1', name: 'Bebidas', order: 2, isActive: true },
        { id: 'cat2', name: 'Snacks', order: 1, isActive: true },
      ]);
    });

    it('returns succeeded:true synchronously (no Promise)', () => {
      expect(service.getCategoryCartItemsView(new Date()).succeeded).toBe(true);
    });

    it('returns empty array when there are no active orders today', () => {
      expect(service.getCategoryCartItemsView(new Date()).data).toEqual([]);
    });

    it('groups order items by categoryId, aggregating total/itemsCount across orders', async () => {
      const items1 = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 2 },
      ]);
      const items2 = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 3 },
      ]);
      await createTestOrder(service, items1, PaymentType.Efectivo, false, '');
      await createTestOrder(service, items2, PaymentType.Efectivo, false, '');

      const result = unwrap(service.getCategoryCartItemsView(new Date()));
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cat1');
      expect(result[0].name).toBe('Bebidas');
      expect(result[0].total).toBe(25); // 5*2 + 5*3
      expect(result[0].itemsCount).toBe(5); // 2 + 3
    });

    it('rounds getOrderItemsTotal to 2 accounting decimals for fractional price*quantity', async () => {
      // 0.1 * 0.3 would otherwise be 0.030000000000000002; getOrderItemsTotal rounds to 0.03.
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 0.1 }), quantity: 0.3 },
      ]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');

      const result = unwrap(service.getCategoryCartItemsView(new Date()));
      expect(result[0].total).toBe(0.03);
      expect(result[0].itemsCount).toBeCloseTo(0.3, 10); // fractional count, not integer-rounded
    });

    it('further groups by productId within each category, with per-product total/itemsCount', async () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', name: 'Cola', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 2 },
        { product: makeProduct({ id: 'p2', name: 'Fanta', categoryId: 'cat1', categoryName: 'Bebidas', price: 3 }), quantity: 1 },
      ]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');

      const result = unwrap(service.getCategoryCartItemsView(new Date()));
      expect(result[0].productItems).toHaveLength(2);
      const cola = result[0].productItems.find((p) => p.name === 'Cola');
      const fanta = result[0].productItems.find((p) => p.name === 'Fanta');
      expect(cola?.total).toBe(10);
      expect(cola?.itemsCount).toBe(2);
      expect(fanta?.total).toBe(3);
      expect(fanta?.itemsCount).toBe(1);
    });

    it("resolves each category's order field from ProductCategoryOfflineService", async () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat2', categoryName: 'Snacks', price: 2 }), quantity: 1 },
      ]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      const result = unwrap(service.getCategoryCartItemsView(new Date()));
      expect(result[0].order).toBe(1); // cat2's order from the mocked category list
    });

    it('falls back to Number.MAX_VALUE when the category is not found in storage', async () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'unknown-cat', categoryName: 'Ghost', price: 2 }), quantity: 1 },
      ]);
      await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      const result = unwrap(service.getCategoryCartItemsView(new Date()));
      expect(result[0].order).toBe(Number.MAX_VALUE);
    });

    it('excludes inactive (deactivated) orders', async () => {
      const items = makeCartItems([
        { product: makeProduct({ id: 'p1', categoryId: 'cat1', categoryName: 'Bebidas', price: 5 }), quantity: 1 },
      ]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      service.deactivateOrder(order.id);
      expect(service.getCategoryCartItemsView(new Date()).data).toEqual([]);
    });
  });

  // Egress/Mayorista realignment: createOrder's `type` param is now REQUIRED (Angular
  // parity — no default), so the old "defaults to Normal when omitted" scenario is
  // inherently obsolete; rewritten to assert explicit Normal passthrough instead.
  // Per-item custom price (CartItem.price) flows into orderItem.price/order.total, and
  // FIFO inventory deduction (getAvailableInventoryCosts) still runs identically for a
  // Mayorista sale, since the discountFromInvantory branch is unrelated to orderType.
  describe('ORD-09: createOrder with type=Mayorista + custom per-item price', () => {
    it('persists order.type=Normal when passed explicitly', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.type).toBe(OrderType.Normal);
    });

    it('persists order.type=Mayorista when passed', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Mayorista, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.type).toBe(OrderType.Mayorista);
    });

    it('uses the cart item custom price (not product.price) for orderItem.price when set', async () => {
      const items = makeCartItems([
        { product: makeProduct({ price: 5 }), quantity: 2, price: 8 },
      ]);
      const result = await service.createOrder(items, OrderType.Mayorista, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.orderItems[0].price).toBe(8);
    });

    it('uses the custom price (not product.price) for order.total when set', async () => {
      const items = makeCartItems([
        { product: makeProduct({ price: 5 }), quantity: 2, price: 8 },
      ]);
      const result = await service.createOrder(items, OrderType.Mayorista, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.total).toBe(16); // 8 * 2, NOT 5 * 2
    });

    it('falls back to product.price when the cart item has no custom price, even for Mayorista', async () => {
      const items = makeCartItems([{ product: makeProduct({ price: 5 }), quantity: 2 }]);
      const result = await service.createOrder(items, OrderType.Mayorista, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.orderItems[0].price).toBe(5);
      expect(result.data?.total).toBe(10);
    });

    it('still runs FIFO inventory deduction (getAvailableInventoryCosts) for a Mayorista sale', async () => {
      useAuthStore.setState({
        user: makeUser({ login: 'jdoe', storeModuleIds: [EModules.Inventory] }),
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const product = makeProduct({ discountFromInvantory: true });
      const items = makeCartItems([{ product, quantity: 2, price: 9 }]);
      await service.createOrder(items, OrderType.Mayorista, false, PaymentType.Efectivo, undefined, '');
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
  describe('ORD-12: activateOrder — flag-only, no cascade (D-shape Result, never throws)', () => {
    it('sets isActive=true', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      service.deactivateOrder(order.id);
      const result = service.activateOrder(order.id);
      expect(result.succeeded).toBe(true);
      expect(findOrder(order.id)?.isActive).toBe(true);
    });

    it('returns Result.Failure([OrderErrors.NotExists]) for a missing id, does not throw', () => {
      expect(() => service.activateOrder('missing')).not.toThrow();
      const result = service.activateOrder('missing');
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([OrderErrors.NotExists]);
    });

    it('does NOT cascade to credit/inventory (unlike deactivateOrder)', async () => {
      const creditMock = vi.mocked(SaleCreditOfflineService).mock.results[0]?.value;
      const inventoryMock = vi.mocked(InventoryOfflineService).mock.results[0]?.value;
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, true, 'Ana');
      vi.clearAllMocks();
      service.activateOrder(order.id);
      expect(creditMock.deactivateSaleCreditByOrderId).not.toHaveBeenCalled();
      expect(inventoryMock.increaseQuantitiesByOrderItems).not.toHaveBeenCalled();
    });

    it('stamps updatedByName with the authenticated user login', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const order = await createTestOrder(service, items, PaymentType.Efectivo, false, '');
      service.activateOrder(order.id);
      expect(findOrder(order.id)?.updatedByName).toBe('jdoe');
    });
  });

  // ADR-5: financial helpers use RAW date boundaries (pre-snapped by the Today/Yesterday
  // wrappers), via a private active*Between helper, not a day-snapping range filter.
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

  describe('ORD-17: filterOrdersObservable — async C-shape (renamed from filterOrders)', () => {
    it('isCredit=-1 returns all active orders regardless of credit status', async () => {
      seedOrders(storeId, [
        makeOrder({ id: 'credit', isCredit: true, isActive: true }),
        makeOrder({ id: 'non-credit', isCredit: false, isActive: true }),
      ]);
      const result = await service.filterOrdersObservable(-1);
      expect(result.succeeded).toBe(true);
      expect(unwrap(result).map((o) => o.id).sort()).toEqual(['credit', 'non-credit']);
    });

    it('isCredit=1 returns only credit orders', async () => {
      seedOrders(storeId, [
        makeOrder({ id: 'credit', isCredit: true, isActive: true }),
        makeOrder({ id: 'non-credit', isCredit: false, isActive: true }),
      ]);
      const result = await service.filterOrdersObservable(1);
      expect(unwrap(result).map((o) => o.id)).toEqual(['credit']);
    });

    it('isCredit=0 returns only non-credit orders', async () => {
      seedOrders(storeId, [
        makeOrder({ id: 'credit', isCredit: true, isActive: true }),
        makeOrder({ id: 'non-credit', isCredit: false, isActive: true }),
      ]);
      const result = await service.filterOrdersObservable(0);
      expect(unwrap(result).map((o) => o.id)).toEqual(['non-credit']);
    });

    it('excludes inactive orders regardless of isCredit filter', async () => {
      seedOrders(storeId, [makeOrder({ id: 'inactive', isCredit: false, isActive: false })]);
      const result = await service.filterOrdersObservable(-1);
      expect(result.data).toHaveLength(0);
    });

    it('filters by paymentType when provided', async () => {
      seedOrders(storeId, [
        makeOrder({ id: 'efectivo', paymentType: PaymentType.Efectivo, isActive: true }),
        makeOrder({ id: 'tarjeta', paymentType: PaymentType.Tarjeta, isActive: true }),
      ]);
      const result = await service.filterOrdersObservable(-1, PaymentType.Tarjeta);
      expect(unwrap(result).map((o) => o.id)).toEqual(['tarjeta']);
    });

    it('filters by start date (inclusive) when provided', async () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'before', date: addDays(now, -5), isActive: true }),
        makeOrder({ id: 'after', date: now, isActive: true }),
      ]);
      const result = await service.filterOrdersObservable(-1, undefined, addDays(now, -1));
      expect(unwrap(result).map((o) => o.id)).toEqual(['after']);
    });

    it('filters by end date (exclusive) when provided', async () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'before', date: addDays(now, -5), isActive: true }),
        makeOrder({ id: 'after', date: now, isActive: true }),
      ]);
      const result = await service.filterOrdersObservable(-1, undefined, undefined, addDays(now, -1));
      expect(unwrap(result).map((o) => o.id)).toEqual(['before']);
    });

    // Angular parity (order-offline.service.ts:246-250, getActiveOrders): the private
    // helper backing filterOrdersObservable sorts by `date` ascending.
    it('returns active orders sorted by date ascending, regardless of insertion order', async () => {
      const now = new Date();
      seedOrders(storeId, [
        makeOrder({ id: 'newest', date: now, isActive: true }),
        makeOrder({ id: 'oldest', date: addDays(now, -2), isActive: true }),
        makeOrder({ id: 'middle', date: addDays(now, -1), isActive: true }),
      ]);
      const result = await service.filterOrdersObservable(-1);
      expect(unwrap(result).map((o) => o.id)).toEqual(['oldest', 'middle', 'newest']);
    });
  });

  describe('ORD-18: createOrder optional details param (description = details || (isCredit ? client : \'\'))', () => {
    it('uses details as description when provided (credit order)', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, true, PaymentType.Efectivo, 'Special note', 'Ana');
      expect(result.data?.description).toBe('Special note');
    });

    it('falls back to clientName when details is not provided and isCredit=true', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, true, PaymentType.Efectivo, undefined, 'Ana');
      expect(result.data?.description).toBe('Ana');
    });

    it('falls back to empty string when details is not provided and isCredit=false', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, '');
      expect(result.data?.description).toBe('');
    });

    it('uses details even when isCredit=false', async () => {
      const items = makeCartItems([{ product: makeProduct(), quantity: 1 }]);
      const result = await service.createOrder(
        items,
        OrderType.Normal,
        false,
        PaymentType.Efectivo,
        'Merma note',
        '',
      );
      expect(result.data?.description).toBe('Merma note');
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

  // Rule 12 relocation: this logic used to live in a standalone (invented)
  // `StatisticsAggregationService` class. Angular keeps it ON `OrderOfflineService`
  // (`getLastMonthSales`/`getLastMonthSaleProfits`, order-offline.service.ts:211-244), so
  // these tests were moved here (adapted from mocked collaborators to the real,
  // localStorage-backed service, since `getLastMonthSales`/`getLastMonthSaleProfits` now run
  // for real). Angular takes NO date parameter (rule 3, strict signature parity) — `new
  // Date()` is pinned via `vi.useFakeTimers()`/`vi.setSystemTime()` for determinism.
  describe('getLastMonthSales (statistics aggregation, rule 12 relocation)', () => {
    const TODAY = new Date('2026-05-28T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(TODAY);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function dayAgo(daysAgo: number): Date {
      const d = new Date(TODAY);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(10, 0, 0, 0);
      return d;
    }

    function dayStr(date: Date): string {
      return date.toISOString().slice(0, 10);
    }

    it('returns exactly 30 entries even with no orders', () => {
      expect(service.getLastMonthSales()).toHaveLength(30);
    });

    it('all entries are zero when no orders exist', () => {
      for (const point of service.getLastMonthSales()) {
        expect(point.value).toBe(0);
      }
    });

    it('each entry has a Date label', () => {
      for (const point of service.getLastMonthSales()) {
        expect(point.label).toBeInstanceOf(Date);
      }
    });

    it('labels span 30 days ending on today (last entry = today)', () => {
      const result = service.getLastMonthSales();
      expect(dayStr(result[result.length - 1].label)).toBe(dayStr(TODAY));
    });

    it('aggregates value correctly for a day with orders', () => {
      seedOrders(storeId, [
        makeOrder({
          id: 'o1',
          date: dayAgo(0),
          isActive: true,
          // getLastMonthSales -> getActiveOrdersPriceBetweenDates sums Order.total (Angular
          // parity, order-offline.service.ts:167-170), NOT a per-item recomputation.
          total: 50,
          orderItems: [
            orderItemFor('p1', 'Product 1', { price: 10, qty: 3 }),
            orderItemFor('p2', 'Product 2', { price: 5, qty: 4 }),
          ],
        }),
      ]);

      const result = service.getLastMonthSales();
      const todayPoint = result.find((p) => dayStr(p.label) === dayStr(TODAY));
      expect(todayPoint).toBeDefined();
      // revenue = 10*3 + 5*4 = 50
      expect(todayPoint!.value).toBe(50);
    });

    it('groups multiple orders on the same day', () => {
      const orderDate = dayAgo(1);
      seedOrders(storeId, [
        makeOrder({
          id: 'o1',
          date: orderDate,
          isActive: true,
          total: 20,
          orderItems: [orderItemFor('p1', 'Product 1', { price: 10, qty: 2 })],
        }),
        makeOrder({
          id: 'o2',
          date: orderDate,
          isActive: true,
          total: 20,
          orderItems: [orderItemFor('p2', 'Product 2', { price: 5, qty: 4 })],
        }),
      ]);

      const result = service.getLastMonthSales();
      const point = result.find((p) => dayStr(p.label) === dayStr(orderDate));
      expect(point!.value).toBe(40); // 20 + 20
    });

    it('zero-fills days with no orders (STAT-6)', () => {
      const orderDate = dayAgo(5);
      seedOrders(storeId, [
        makeOrder({
          id: 'o1',
          date: orderDate,
          isActive: true,
          orderItems: [orderItemFor('p1', 'Product 1', { price: 20, qty: 1 })],
        }),
      ]);

      const zeroPoints = service
        .getLastMonthSales()
        .filter((p) => dayStr(p.label) !== dayStr(orderDate));
      for (const point of zeroPoints) {
        expect(point.value).toBe(0);
      }
    });

    it('excludes inactive orders (getActiveOrdersPriceBetweenDates filters isActive)', () => {
      seedOrders(storeId, [
        makeOrder({
          id: 'inactive',
          date: dayAgo(0),
          isActive: false,
          orderItems: [orderItemFor('p1', 'Product 1', { price: 100, qty: 1 })],
        }),
      ]);
      for (const point of service.getLastMonthSales()) {
        expect(point.value).toBe(0);
      }
    });

    it('queries each bucket with its OWN [dayStart, dayStart+1) window — NOT Angular\'s buggy always-today window', () => {
      const spy = vi.spyOn(service, 'getActiveOrdersPriceBetweenDates');

      service.getLastMonthSales();

      // 30 calls, one per bucket, each with a DIFFERENT start date (proves per-day windows,
      // not a single repeated "today" window like Angular's getLastMonthSales bug).
      expect(spy).toHaveBeenCalledTimes(30);
      const callStarts = spy.mock.calls.map((args) => (args[0] as Date).getTime());
      const uniqueStarts = new Set(callStarts);
      expect(uniqueStarts.size).toBe(30);

      // Each call's end = start + 1 day.
      for (const [start, end] of spy.mock.calls as [Date, Date][]) {
        const diffMs = end.getTime() - start.getTime();
        expect(diffMs).toBe(24 * 60 * 60 * 1000);
      }

      spy.mockRestore();
    });
  });

  describe('getLastMonthSaleProfits (statistics aggregation, rule 12 relocation)', () => {
    const TODAY = new Date('2026-05-28T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(TODAY);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function dayAgo(daysAgo: number): Date {
      const d = new Date(TODAY);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(10, 0, 0, 0);
      return d;
    }

    function dayStr(date: Date): string {
      return date.toISOString().slice(0, 10);
    }

    function seedExpense(date: Date, total: number): void {
      const existingRaw = localStorage.getItem(`lizoft.store-expenses-${storeId}`);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      existing.push({
        id: crypto.randomUUID(),
        type: 1,
        total,
        date,
        paymentType: PaymentType.Efectivo,
        note: '',
        isActive: true,
        createdDate: date,
        createdByName: 'test',
        updatedDate: undefined,
        updatedByName: undefined,
      });
      localStorage.setItem(`lizoft.store-expenses-${storeId}`, JSON.stringify(existing));
    }

    it('returns exactly 30 entries', () => {
      expect(service.getLastMonthSaleProfits()).toHaveLength(30);
    });

    it('all entries are zero when no orders or expenses exist', () => {
      for (const point of service.getLastMonthSaleProfits()) {
        expect(point.value).toBe(0);
      }
    });

    it('each entry has a Date label', () => {
      for (const point of service.getLastMonthSaleProfits()) {
        expect(point.label).toBeInstanceOf(Date);
      }
    });

    it('calculates profit via calculateOrderProfit (uses productCosts, not inventory)', () => {
      seedOrders(storeId, [
        makeOrder({
          id: 'o1',
          date: dayAgo(0),
          isActive: true,
          orderItems: [orderItemFor('p1', 'Product 1', { price: 20, qty: 3, costPrice: 12 })],
        }),
      ]);

      const result = service.getLastMonthSaleProfits();
      const todayPoint = result.find((p) => dayStr(p.label) === dayStr(TODAY));
      // profit = (20*3) - (12*3) = 60 - 36 = 24
      expect(todayPoint!.value).toBe(24);
    });

    it('profit sums across multiple items in one order', () => {
      seedOrders(storeId, [
        makeOrder({
          id: 'o1',
          date: dayAgo(0),
          isActive: true,
          orderItems: [
            orderItemFor('p1', 'Product 1', { price: 10, qty: 2, costPrice: 6 }),
            orderItemFor('p2', 'Product 2', { price: 5, qty: 4, costPrice: 3 }),
          ],
        }),
      ]);

      const result = service.getLastMonthSaleProfits();
      const todayPoint = result.find((p) => dayStr(p.label) === dayStr(TODAY));
      // item1: 10*2 - 6*2 = 8; item2: 5*4 - 3*4 = 8; total = 16
      expect(todayPoint!.value).toBe(16);
    });

    it('zero-fills days with no orders', () => {
      const orderDate = dayAgo(3);
      seedOrders(storeId, [
        makeOrder({
          id: 'o1',
          date: orderDate,
          isActive: true,
          orderItems: [orderItemFor('p1', 'Product 1', { price: 10, qty: 1, costPrice: 4 })],
        }),
      ]);

      const zeroPoints = service
        .getLastMonthSaleProfits()
        .filter((p) => dayStr(p.label) !== dayStr(orderDate));
      for (const point of zeroPoints) {
        expect(point.value).toBe(0);
      }
    });

    // Gross profit chart (owner dashboard) — expenses are deliberately NOT netted out
    // (order-offline.service.ts getLastMonthSaleProfits): value = orderProfit(day) only,
    // where orderProfit = sale price minus cost. This feeds the "ganancias brutas" chart.
    describe('gross-profit chart does NOT net out expenses', () => {
      it('returns orderProfit only when expenses exist for the day', () => {
        const orderDate = dayAgo(0);
        seedOrders(storeId, [
          makeOrder({
            id: 'o1',
            date: orderDate,
            isActive: true,
            orderItems: [orderItemFor('p1', 'Product 1', { price: 20, qty: 3, costPrice: 12 })],
          }),
        ]);
        // orderProfit = (20*3) - (12*3) = 24
        seedExpense(orderDate, 10);

        const result = service.getLastMonthSaleProfits();
        const todayPoint = result.find((p) => dayStr(p.label) === dayStr(TODAY));
        // Expenses are ignored: 24, not 24 - 10 = 14.
        expect(todayPoint!.value).toBe(24);
      });

      it('a day with only expenses (no orders) yields zero', () => {
        // Seed a 30-total expense on EVERY one of the 30 bucket days.
        for (let i = 0; i <= 29; i++) {
          seedExpense(dayAgo(i), 30);
        }

        const result = service.getLastMonthSaleProfits();
        // No orders -> orderProfit 0 everywhere; expenses are ignored -> 0, not -30.
        for (const point of result) {
          expect(point.value).toBe(0);
        }
      });

      it('a day with 0 expenses is unaffected', () => {
        const orderDate = dayAgo(0);
        seedOrders(storeId, [
          makeOrder({
            id: 'o1',
            date: orderDate,
            isActive: true,
            orderItems: [orderItemFor('p1', 'Product 1', { price: 20, qty: 3, costPrice: 12 })],
          }),
        ]);

        const result = service.getLastMonthSaleProfits();
        const todayPoint = result.find((p) => dayStr(p.label) === dayStr(TODAY));
        expect(todayPoint!.value).toBe(24);
      });

      it('ignores expenses independently per bucket', () => {
        const day0 = dayAgo(0);
        const day5 = dayAgo(5);
        seedOrders(storeId, [
          makeOrder({
            id: 'o1',
            date: day0,
            isActive: true,
            orderItems: [orderItemFor('p1', 'Product 1', { price: 10, qty: 1 })], // profit 10
          }),
          makeOrder({
            id: 'o2',
            date: day5,
            isActive: true,
            orderItems: [orderItemFor('p2', 'Product 2', { price: 50, qty: 1 })], // profit 50
          }),
        ]);
        // Only the day-5 bucket has an expense of 20; every other bucket has 0.
        seedExpense(day5, 20);

        const result = service.getLastMonthSaleProfits();
        expect(result.find((p) => dayStr(p.label) === dayStr(TODAY))!.value).toBe(10); // unaffected
        expect(result.find((p) => dayStr(p.label) === dayStr(day5))!.value).toBe(50); // 50, not 50 - 20
      });
    });
  });
});
