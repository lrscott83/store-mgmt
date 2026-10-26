import { describe, expect, it, vi } from 'vitest';
import {
  Currency,
  OrderType,
  PaymentType,
  SalePaymentMethod,
  type Order,
  type Product,
} from '@store-mgmt/domain';
import {
  buildSaleCartItems,
  registerOnlineOrderSale,
  syncPaidOnlineOrderSales,
  type OnlineOrderSaleDeps,
} from '../online-order-sale-service';
import {
  OnlineOrderDeliveryType,
  OnlineOrderPaymentStatus,
  OnlineOrderStatus,
  type OnlineOrderDetail,
} from '../ordering-http-service';

const STORE_ID = 's1';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Coca Cola',
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    price: 10,
    currency: Currency.CUP,
    order: 1,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: 'biz1',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function makeStoredOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'sale-1',
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
    ...overrides,
  };
}

function makeDetail(overrides: Partial<OnlineOrderDetail> = {}): OnlineOrderDetail {
  return {
    id: 'oo-1',
    code: 'A1',
    customerName: 'Ana',
    customerPhone: '555',
    deliveryType: OnlineOrderDeliveryType.Pickup,
    total: 50,
    currency: Currency.CUP,
    status: OnlineOrderStatus.Entregado,
    paymentStatus: OnlineOrderPaymentStatus.Paid,
    driverId: null,
    driverName: null,
    date: new Date().toISOString(),
    deliveryAddress: null,
    notes: null,
    lines: [
      { productId: 'p1', name: 'Coca Cola', quantity: 5, price: 10, currency: Currency.CUP, lineTotal: 50 },
    ],
    ...overrides,
  };
}

interface DepsHarness {
  deps: OnlineOrderSaleDeps;
  createOrder: ReturnType<typeof vi.fn>;
  createInventoryEntry: ReturnType<typeof vi.fn>;
  deleteInventoryEntry: ReturnType<typeof vi.fn>;
  stored: Order[];
  listOrders: ReturnType<typeof vi.fn>;
  getOrder: ReturnType<typeof vi.fn>;
}

function makeDeps(
  options: {
    products?: Record<string, Product>;
    available?: Record<string, number>;
    stored?: Order[];
    paidOrders?: Array<{ id: string }>;
    listFails?: boolean;
    createOrderFails?: boolean;
    createOrderThrows?: boolean;
    hasInventoryModule?: boolean;
    lines?: OnlineOrderDetail['lines'];
  } = {},
): DepsHarness {
  const stored = options.stored ?? [];

  const createOrder = vi.fn(async (...args: unknown[]) => {
    if (options.createOrderThrows) throw new Error('offline write failed');

    if (options.createOrderFails) {
      return { succeeded: false, data: null, message: null, actionCode: null, errors: [] };
    }

    const snapshot = args[8] as { onlineOrderId?: string | null } | undefined;
    const created = makeStoredOrder({ onlineOrderId: snapshot?.onlineOrderId ?? null });
    stored.push(created);

    return {
      succeeded: true,
      data: created,
      message: null,
      actionCode: null,
      errors: [],
    };
  });

  let entrySeq = 0;
  const createInventoryEntry = vi.fn(() => {
    entrySeq += 1;
    return { data: { id: `entry-${entrySeq}` }, succeeded: true, errors: [] };
  });

  const deleteInventoryEntry = vi.fn(() => ({ succeeded: true, errors: [] }));

  const listOrders = vi.fn(async (filters: { page?: number; pageSize?: number } = {}) => {
    if (options.listFails) {
      return { succeeded: false, data: null, message: null, actionCode: null, errors: [] };
    }

    const paidOrders = options.paidOrders ?? [];
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const slice = paidOrders.slice((page - 1) * pageSize, page * pageSize);

    return {
      succeeded: true,
      data: {
        items: slice.map((order) => ({
          id: order.id,
          code: 'A1',
          customerName: 'Ana',
          customerPhone: '555',
          deliveryType: OnlineOrderDeliveryType.Pickup,
          total: 50,
          currency: Currency.CUP,
          status: OnlineOrderStatus.Entregado,
          paymentStatus: OnlineOrderPaymentStatus.Paid,
          driverId: null,
          driverName: null,
          date: new Date().toISOString(),
        })),
        total: paidOrders.length,
        page,
        pageSize,
      },
      message: null,
      actionCode: null,
      errors: [],
    };
  });

  const getOrder = vi.fn(async (id: string) => ({
    succeeded: true,
    data: makeDetail({ id, ...(options.lines ? { lines: options.lines } : {}) }),
    message: null,
    actionCode: null,
    errors: [],
  }));

  const deps: OnlineOrderSaleDeps = {
    storeId: STORE_ID,
    hasInventoryModule: options.hasInventoryModule ?? true,
    orderService: {
      createOrder: createOrder as unknown as OnlineOrderSaleDeps['orderService']['createOrder'],
      getStorageOrders: () => stored,
    },
    productRepository: {
      getProductById: (id: string) => options.products?.[id],
    },
    inventoryService: {
      getAvailableQuantity: (id: string) => ({
        hasEntries: true,
        available: options.available?.[id] ?? 0,
      }),
      createInventoryEntry:
        createInventoryEntry as unknown as OnlineOrderSaleDeps['inventoryService']['createInventoryEntry'],
      deleteInventoryEntry:
        deleteInventoryEntry as unknown as OnlineOrderSaleDeps['inventoryService']['deleteInventoryEntry'],
    },
    orderingService: {
      listOrders: listOrders as unknown as OnlineOrderSaleDeps['orderingService']['listOrders'],
      getOrder: getOrder as unknown as OnlineOrderSaleDeps['orderingService']['getOrder'],
    },
  };

  return {
    deps,
    createOrder,
    createInventoryEntry,
    deleteInventoryEntry,
    stored,
    listOrders,
    getOrder,
  };
}

describe('registerOnlineOrderSale', () => {
  it('registers a paid order as a cash POS sale carrying the catalog prices', async () => {
    const harness = makeDeps({ products: { p1: makeProduct() } });

    const outcome = await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(outcome.registered).toBe(true);
    expect(harness.createOrder).toHaveBeenCalledTimes(1);

    const args = harness.createOrder.mock.calls[0]!;
    expect(args[1]).toBe(OrderType.Normal);
    expect(args[2]).toBe(false);
    expect(args[3]).toBe(PaymentType.Efectivo);
    expect(args[5]).toBe('Ana');
    expect(args[6]).toBe(SalePaymentMethod.Efectivo);

    const cartItems = args[0] as Array<{ product: Product; quantity: number; price?: number }>;
    expect(cartItems).toHaveLength(1);
    expect(cartItems[0]!.product.id).toBe('p1');
    expect(cartItems[0]!.quantity).toBe(5);
    expect(cartItems[0]!.price).toBe(10);

    const payments = args[7] as Array<{ method: SalePaymentMethod; amount: number }>;
    expect(payments).toHaveLength(1);
    expect(payments[0]!.method).toBe(SalePaymentMethod.Efectivo);
    expect(payments[0]!.amount).toBe(50);

    expect((args[8] as { onlineOrderId?: string }).onlineOrderId).toBe('oo-1');
    expect(harness.stored[0]!.onlineOrderId).toBe('oo-1');
  });

  it('does nothing while the order is not paid', async () => {
    const harness = makeDeps({ products: { p1: makeProduct() } });

    const outcome = await registerOnlineOrderSale(
      makeDetail({ paymentStatus: OnlineOrderPaymentStatus.Pending }),
      harness.deps,
    );

    expect(outcome).toEqual({ registered: false, onlineOrderId: 'oo-1', reason: 'not-paid' });
    expect(harness.createOrder).not.toHaveBeenCalled();
  });

  it('does not duplicate the sale on a second run', async () => {
    const harness = makeDeps({
      products: { p1: makeProduct() },
      stored: [makeStoredOrder({ id: 'sale-1', onlineOrderId: 'oo-1' })],
    });

    const outcome = await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(outcome.reason).toBe('already-registered');
    expect(harness.createOrder).not.toHaveBeenCalled();
  });

  it('adds an inventory entry for the missing quantity at the sale price', async () => {
    const harness = makeDeps({ products: { p1: makeProduct() }, available: { p1: 2 } });

    await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(harness.createInventoryEntry).toHaveBeenCalledTimes(1);
    expect(harness.createInventoryEntry).toHaveBeenCalledWith('p1', 3, 10, Currency.CUP);
  });

  it('adds no entry when the stock already covers the line', async () => {
    const harness = makeDeps({ products: { p1: makeProduct() }, available: { p1: 5 } });

    await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(harness.createInventoryEntry).not.toHaveBeenCalled();
    expect(harness.createOrder).toHaveBeenCalledTimes(1);
  });

  it('puts the stock back when the sale cannot be written', async () => {
    const harness = makeDeps({
      products: { p1: makeProduct() },
      available: { p1: 2 },
      createOrderFails: true,
    });

    const outcome = await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(outcome.reason).toBe('failed');
    expect(harness.createInventoryEntry).toHaveBeenCalledWith('p1', 3, 10, Currency.CUP);
    expect(harness.deleteInventoryEntry).toHaveBeenCalledWith('p1', 'entry-1');
  });

  it('puts the stock back when the sale write throws', async () => {
    const harness = makeDeps({
      products: { p1: makeProduct() },
      available: { p1: 2 },
      createOrderThrows: true,
    });

    const outcome = await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(outcome.reason).toBe('failed');
    expect(harness.createInventoryEntry).toHaveBeenCalledWith('p1', 3, 10, Currency.CUP);
    expect(harness.deleteInventoryEntry).toHaveBeenCalledWith('p1', 'entry-1');
  });

  it('keeps the stock entries of a sale that was written', async () => {
    const harness = makeDeps({ products: { p1: makeProduct() }, available: { p1: 2 } });

    const outcome = await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(outcome.registered).toBe(true);
    expect(harness.deleteInventoryEntry).not.toHaveBeenCalled();
  });

  it('touches no inventory when the store lacks the module', async () => {
    const harness = makeDeps({
      products: { p1: makeProduct() },
      available: { p1: 0 },
      hasInventoryModule: false,
    });

    await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(harness.createInventoryEntry).not.toHaveBeenCalled();
    expect(harness.createOrder).toHaveBeenCalledTimes(1);
  });

  it('touches no inventory for a product that does not discount from it', async () => {
    const harness = makeDeps({
      products: { p1: makeProduct({ discountFromInvantory: false }) },
      available: { p1: 0 },
    });

    await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(harness.createInventoryEntry).not.toHaveBeenCalled();
  });

  it('skips an order without lines', async () => {
    const harness = makeDeps({ products: { p1: makeProduct() } });

    const outcome = await registerOnlineOrderSale(makeDetail({ lines: [] }), harness.deps);

    expect(outcome).toEqual({ registered: false, onlineOrderId: 'oo-1', reason: 'empty' });
    expect(harness.createOrder).not.toHaveBeenCalled();
  });

  it('registers the line anyway when the product is not in the local catalog', async () => {
    const harness = makeDeps({ available: { p1: 0 } });

    const outcome = await registerOnlineOrderSale(makeDetail(), harness.deps);

    expect(outcome.registered).toBe(true);
    expect(harness.createInventoryEntry).not.toHaveBeenCalled();

    const cartItems = harness.createOrder.mock.calls[0]![0] as Array<{
      product: Product;
      price?: number;
    }>;
    expect(cartItems[0]!.product.id).toBe('p1');
    expect(cartItems[0]!.product.name).toBe('Coca Cola');
    expect(cartItems[0]!.price).toBe(10);
  });
});

describe('buildSaleCartItems', () => {
  it('keeps the local product identity but the order snapshot price', () => {
    const harness = makeDeps({ products: { p1: makeProduct({ price: 99 }) } });

    const { cartItems } = buildSaleCartItems(
      [{ productId: 'p1', name: 'Coca Cola', quantity: 2, price: 10, currency: Currency.CUP, lineTotal: 20 }],
      harness.deps,
    );

    expect(cartItems[0]!.product.price).toBe(99);
    expect(cartItems[0]!.price).toBe(10);
  });

  it('reports the entries it created so a failed sale can put the stock back', () => {
    const harness = makeDeps({ products: { p1: makeProduct() }, available: { p1: 1 } });

    const { createdEntries } = buildSaleCartItems(
      [{ productId: 'p1', name: 'Coca Cola', quantity: 4, price: 10, currency: Currency.CUP, lineTotal: 40 }],
      harness.deps,
    );

    expect(createdEntries).toEqual([{ productId: 'p1', entryId: 'entry-1' }]);
  });
});

describe('syncPaidOnlineOrderSales', () => {
  it('registers the paid orders and skips the ones already sold', async () => {
    const harness = makeDeps({
      products: { p1: makeProduct() },
      paidOrders: [{ id: 'oo-1' }],
    });

    const first = await syncPaidOnlineOrderSales(harness.deps);
    expect(first).toEqual({ registered: 1, skipped: 0, failed: 0 });

    const second = await syncPaidOnlineOrderSales(harness.deps);
    expect(second).toEqual({ registered: 0, skipped: 1, failed: 0 });
    expect(harness.createOrder).toHaveBeenCalledTimes(1);
  });

  it('asks for every paid order, with no date window', async () => {
    const harness = makeDeps();

    await syncPaidOnlineOrderSales(harness.deps);

    const filters = harness.listOrders.mock.calls[0]![0] as Record<string, unknown>;
    expect(filters.paymentStatus).toBe(OnlineOrderPaymentStatus.Paid);
    expect(filters.page).toBe(1);
    expect(filters).not.toHaveProperty('from');
    expect(filters).not.toHaveProperty('to');
    expect(filters).not.toHaveProperty('exactRange');
  });

  it('reads every page instead of stopping at the first one', async () => {
    const paidOrders = Array.from({ length: 150 }, (_, index) => ({ id: `oo-${index + 1}` }));
    const harness = makeDeps({ products: { p1: makeProduct() }, paidOrders });

    const result = await syncPaidOnlineOrderSales(harness.deps);

    expect(result.registered).toBe(150);
    expect(harness.listOrders).toHaveBeenCalledTimes(2);
    expect(harness.createOrder).toHaveBeenCalledTimes(150);
  });

  it('shares one run when two syncs overlap', async () => {
    const harness = makeDeps({ products: { p1: makeProduct() }, paidOrders: [{ id: 'oo-1' }] });

    const [first, second] = await Promise.all([
      syncPaidOnlineOrderSales(harness.deps),
      syncPaidOnlineOrderSales(harness.deps),
    ]);

    expect(first).toEqual(second);
    expect(harness.listOrders).toHaveBeenCalledTimes(1);
    expect(harness.createOrder).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the list cannot be read', async () => {
    const harness = makeDeps({ listFails: true });

    const result = await syncPaidOnlineOrderSales(harness.deps);

    expect(result).toEqual({ registered: 0, skipped: 0, failed: 0 });
    expect(harness.getOrder).not.toHaveBeenCalled();
    expect(harness.createOrder).not.toHaveBeenCalled();
  });

  it('counts a detail read failure without stopping the page', async () => {
    const harness = makeDeps({ products: { p1: makeProduct() }, paidOrders: [{ id: 'oo-1' }] });
    harness.getOrder.mockResolvedValueOnce({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [],
    });

    const result = await syncPaidOnlineOrderSales(harness.deps);

    expect(result).toEqual({ registered: 0, skipped: 0, failed: 1 });
  });
});
