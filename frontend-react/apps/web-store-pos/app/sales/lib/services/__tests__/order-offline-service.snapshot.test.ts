import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, OrderType, PaymentType, SalePaymentMethod, EModules } from '@store-mgmt/domain';
import type { BaseResponseModel, Product, UserModel } from '@store-mgmt/domain';

function unwrap<T>(response: BaseResponseModel<T>): T {
  if (!response.succeeded) throw new Error('expected succeeded response');
  return response.data;
}

import type { CartItem } from '~/shared/lib/stores/cart-store';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import type { OrderLineSnapshot, OrderSnapshot } from '../order-offline-service';

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableInventoryCosts: vi.fn().mockReturnValue([]),
    increaseQuantitiesByOrderItems: vi.fn(),
  })),
}));

vi.mock('../sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    createSaleCredit: vi.fn().mockReturnValue({ data: {}, succeeded: true, errors: [] }),
    deactivateSaleCreditByOrderId: vi.fn().mockReturnValue({ succeeded: true, errors: [] }),
  })),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({
    getProductCategories: vi.fn().mockReturnValue([]),
  })),
}));

import { OrderOfflineService } from '../order-offline-service';

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

describe('OrderOfflineService.createOrder — full sale snapshot (2026-10-06)', () => {
  const storeId = 's1';
  let service: OrderOfflineService;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({
      user: makeUser({ login: 'jdoe' }),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    service = new OrderOfflineService(storeId);
  });

  it('ALWAYS persists exactly one synthesized payment when no payments list arrives', async () => {
    const items = makeCartItems([{ product: makeProduct({ price: 5 }), quantity: 2 }]);
    const order = unwrap(
      await service.createOrder(
        items,
        OrderType.Normal,
        false,
        PaymentType.Efectivo,
        undefined,
        '',
        SalePaymentMethod.Efectivo,
      ),
    );

    // The legacy no-payments path still produced a 10-total payment row: rate 1 on
    // both sides and no provenance, in the order currency's UNITS.
    expect(order.payments).toEqual([
      {
        method: SalePaymentMethod.Efectivo,
        currency: Currency.CUP,
        amount: 10,
        rateApplied: 1,
        rateId: null,
        rateMethod: null,
        rateCurrency: null,
        rateEffectiveFrom: null,
        targetRateApplied: 1,
        targetRateId: null,
        targetRateEffectiveFrom: null,
        amountInOrderCurrency: 10,
      },
    ]);
    // And the auth/pricing fields are byte-identical to the pre-change path.
    expect(order.total).toBe(10);
    expect(order.percent).toBe(0);
    expect(order.tax).toBe(0);
  });

  it('seals store, seller, client, tendered amount and change', async () => {
    useAuthStore.setState({
      user: makeUser({ id: 'u-42', login: 'jdoe', selectedStoreId: 's9' }),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    const paidService = new OrderOfflineService('s9');
    const items = makeCartItems([{ product: makeProduct({ price: 5 }), quantity: 1 }]);

    const order = unwrap(
      await paidService.createOrder(
        items,
        OrderType.Normal,
        false,
        PaymentType.Efectivo,
        undefined,
        'Juan Perez',
        SalePaymentMethod.Efectivo,
        undefined,
        { tenderedAmount: 20, change: 15, storeId: 's9' },
      ),
    );

    expect(order.storeId).toBe('s9');
    expect(order.createdById).toBe('u-42');
    expect(order.client).toBe('Juan Perez');
    expect(order.tenderedAmount).toBe(20);
    expect(order.change).toBe(15);
  });

  it('defaults the store to the service store when the snapshot omits it', async () => {
    const items = makeCartItems([{ product: makeProduct({ price: 5 }), quantity: 1 }]);
    const order = unwrap(
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, ''),
    );
    expect(order.storeId).toBe('s1');
    expect(order.createdById).toBe('u1');
  });

  it('seals per-item original price/currency and the conversion rate snapshot', async () => {
    const line: OrderLineSnapshot = {
      originalUnitPrice: 10,
      originalCurrency: Currency.USD,
      conversionRate: 720,
      conversionRateId: 'rate-usd',
      conversionRateEffectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    };
    const snapshot: OrderSnapshot = {
      lineSnapshots: [line],
      saleCurrencyRate: {
        value: 720,
        id: 'rate-cup',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      },
    };
    // The cart already converted the line: price is 7200 CUP (10 USD × 720).
    const items = makeCartItems([{ product: makeProduct({ currency: Currency.CUP, price: 7200 }), quantity: 1 }]);

    const order = unwrap(
      await service.createOrder(
        items,
        OrderType.Normal,
        false,
        PaymentType.Efectivo,
        undefined,
        '',
        SalePaymentMethod.Efectivo,
        undefined,
        snapshot,
      ),
    );

    const item = order.orderItems[0];
    expect(item.price).toBe(7200);
    expect(item.currency).toBe(Currency.CUP);
    expect(item.originalPrice).toBe(10);
    expect(item.originalCurrency).toBe(Currency.USD);
    expect(item.conversionRate).toBe(720);
    expect(item.conversionRateId).toBe('rate-usd');
    expect(item.conversionRateEffectiveFrom).toEqual(new Date('2026-09-01T00:00:00.000Z'));

    expect(order.saleCurrencyRateApplied).toBe(720);
    expect(order.saleCurrencyRateId).toBe('rate-cup');
    expect(order.saleCurrencyRateEffectiveFrom).toEqual(new Date('2026-09-01T00:00:00.000Z'));
  });

  it('without a snapshot defaults each item to original = converted, rate 1x1 and sale rate 1', async () => {
    const items = makeCartItems([
      { product: makeProduct({ currency: Currency.CUP, price: 5 }), quantity: 1 },
    ]);
    const order = unwrap(
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, ''),
    );

    const item = order.orderItems[0];
    expect(item.originalPrice).toBe(5);
    expect(item.originalCurrency).toBe(Currency.CUP);
    expect(item.conversionRate).toBe(1);
    expect(item.conversionRateId).toBeNull();
    expect(item.conversionRateEffectiveFrom).toBeNull();
    expect(order.saleCurrencyRateApplied).toBe(1);
    expect(order.saleCurrencyRateId).toBeNull();
    expect(order.saleCurrencyRateEffectiveFrom).toBeNull();
  });

  it('seals the applied wholesale tier for a Mayorista sale', async () => {
    const beer = makeProduct({
      price: 10,
      wholesaleEnabled: true,
      wholesalePackSize: 24,
      wholesaleTiers: [
        { minPacks: 1, pricePerUnit: 9 },
        { minPacks: 11, pricePerUnit: 8 },
      ],
    });
    const items = makeCartItems([{ product: beer, quantity: 288, price: 8 }]); // 12 packs

    const order = unwrap(
      await service.createOrder(items, OrderType.Mayorista, false, PaymentType.Efectivo, undefined, ''),
    );

    const item = order.orderItems[0];
    expect(item.wholesalePackSize).toBe(24);
    expect(item.wholesalePacks).toBe(12);
    expect(item.wholesaleTierMinPacks).toBe(11);
    expect(item.wholesaleTierUnitPrice).toBe(8);
  });

  it('does NOT seal a wholesale tier for a Normal sale of a wholesale-enabled product', async () => {
    const beer = makeProduct({
      price: 10,
      wholesaleEnabled: true,
      wholesalePackSize: 24,
      wholesaleTiers: [{ minPacks: 1, pricePerUnit: 9 }],
    });
    const items = makeCartItems([{ product: beer, quantity: 1 }]);

    const order = unwrap(
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, ''),
    );

    const item = order.orderItems[0];
    expect(item.wholesalePackSize).toBeUndefined();
    expect(item.wholesalePacks).toBeUndefined();
    expect(item.wholesaleTierMinPacks).toBeUndefined();
    expect(item.wholesaleTierUnitPrice).toBeUndefined();
  });

  it('leaves productCosts empty (cost 0) when the product does not discount from inventory', async () => {
    useAuthStore.setState({
      user: makeUser({ storeModuleIds: [EModules.Inventory] }),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    const items = makeCartItems([
      { product: makeProduct({ discountFromInvantory: false, price: 5 }), quantity: 1 },
    ]);
    const order = unwrap(
      await service.createOrder(items, OrderType.Normal, false, PaymentType.Efectivo, undefined, ''),
    );
    expect(order.orderItems[0].productCosts).toEqual([]);
  });
});
