import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, OrderType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Order } from '@store-mgmt/domain';

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

const S1 = 's1';
const KEY = `lizoft.store-orders-${S1}`;

/** A pre-snapshot legacy order: no original/conversion/saleCurrencyRate fields. */
function legacyOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'legacy-1',
    orderItems: [
      {
        productId: 'p1',
        productName: 'Coca',
        categoryId: 'c1',
        categoryName: 'Cat',
        name: 'Coca',
        quantity: 1,
        price: 5,
        productBusinessId: 'b1',
        productCosts: [],
        order: 0,
        currency: Currency.CUP,
      },
    ],
    total: 5,
    itemsCount: 1,
    date: '2024-01-01T00:00:00.000Z',
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    currency: Currency.CUP,
    createdDate: '2024-01-01T00:00:00.000Z',
    createdByName: 'seed',
    updatedDate: undefined,
    updatedByName: undefined,
    ...overrides,
  };
}

function seed(orders: unknown[]): void {
  localStorage.setItem(KEY, JSON.stringify(orders));
}

describe('OrderOfflineService read — revive + backfill sale snapshot (2026-10-06)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('backfills original price/currency, conversion rate 1x1 and sale rate 1 on a legacy order', () => {
    seed([legacyOrder()]);
    const service = new OrderOfflineService(S1);

    const order = service.getStorageOrders().find((o) => o.id === 'legacy-1') as Order;
    const item = order.orderItems[0];

    expect(item.originalPrice).toBe(5);
    expect(item.originalCurrency).toBe(Currency.CUP);
    expect(item.conversionRate).toBe(1);
    // "sin ids ni fechas" — the backfill leaves provenance absent.
    expect(item.conversionRateId).toBeUndefined();
    expect(item.conversionRateEffectiveFrom).toBeUndefined();
    expect(order.saleCurrencyRateApplied).toBe(1);
    expect(order.saleCurrencyRateId).toBeUndefined();
    expect(order.saleCurrencyRateEffectiveFrom).toBeUndefined();
  });

  it('persists the backfilled result so the legacy order is healed on disk', () => {
    seed([legacyOrder()]);
    const service = new OrderOfflineService(S1);
    service.getStorageOrders();

    // The stored representation now carries the snapshot defaults (it was written
    // back, not just returned in memory).
    const stored = JSON.parse(service.getOrdersJson()) as Array<Record<string, unknown>>;
    const storedLegacy = stored.find((o) => o['id'] === 'legacy-1') as Record<string, unknown>;
    expect(storedLegacy['saleCurrencyRateApplied']).toBe(1);
    const storedItems = storedLegacy['orderItems'] as Array<Record<string, unknown>>;
    expect(storedItems[0]['originalPrice']).toBe(5);
    expect(storedItems[0]['originalCurrency']).toBe(Currency.CUP);
    expect(storedItems[0]['conversionRate']).toBe(1);
  });

  it('revives the new date fields (item, order and payment) to Date instances', () => {
    seed([
      legacyOrder({
        saleCurrencyRateEffectiveFrom: new Date('2024-01-01T00:00:00.000Z').toISOString(),
        orderItems: [
          {
            productId: 'p1',
            productName: 'Coca',
            categoryId: 'c1',
            categoryName: 'Cat',
            name: 'Coca',
            quantity: 1,
            price: 5,
            productBusinessId: 'b1',
            productCosts: [],
            order: 0,
            currency: Currency.CUP,
            conversionRateEffectiveFrom: new Date('2024-01-02T00:00:00.000Z').toISOString(),
          },
        ],
        payments: [
          {
            method: SalePaymentMethod.Efectivo,
            currency: Currency.CUP,
            amount: 5,
            rateApplied: 1,
            rateMethod: null,
            rateCurrency: null,
            rateEffectiveFrom: new Date('2024-01-03T00:00:00.000Z').toISOString(),
            targetRateApplied: 1,
            targetRateEffectiveFrom: new Date('2024-01-04T00:00:00.000Z').toISOString(),
            amountInOrderCurrency: 5,
          },
        ],
      }),
    ]);

    const service = new OrderOfflineService(S1);
    const order = service.getStorageOrders().find((o) => o.id === 'legacy-1') as Order;

    expect(order.saleCurrencyRateEffectiveFrom).toBeInstanceOf(Date);
    expect(order.orderItems[0].conversionRateEffectiveFrom).toBeInstanceOf(Date);
    expect(order.payments?.[0].rateEffectiveFrom).toBeInstanceOf(Date);
    expect(order.payments?.[0].targetRateEffectiveFrom).toBeInstanceOf(Date);
  });

  it('leaves an already-complete snapshot untouched (no overwrite)', () => {
    seed([
      legacyOrder({
        saleCurrencyRateApplied: 720,
        saleCurrencyRateId: 'rate-cup',
        orderItems: [
          {
            productId: 'p1',
            productName: 'Coca',
            categoryId: 'c1',
            categoryName: 'Cat',
            name: 'Coca',
            quantity: 1,
            price: 7200,
            productBusinessId: 'b1',
            productCosts: [],
            order: 0,
            currency: Currency.CUP,
            originalPrice: 10,
            originalCurrency: Currency.USD,
            conversionRate: 720,
            conversionRateId: 'rate-usd',
          },
        ],
      }),
    ]);

    const service = new OrderOfflineService(S1);
    const order = service.getStorageOrders().find((o) => o.id === 'legacy-1') as Order;

    expect(order.orderItems[0].originalPrice).toBe(10);
    expect(order.orderItems[0].originalCurrency).toBe(Currency.USD);
    expect(order.orderItems[0].conversionRate).toBe(720);
    expect(order.orderItems[0].conversionRateId).toBe('rate-usd');
    expect(order.saleCurrencyRateApplied).toBe(720);
    expect(order.saleCurrencyRateId).toBe('rate-cup');
  });
});
