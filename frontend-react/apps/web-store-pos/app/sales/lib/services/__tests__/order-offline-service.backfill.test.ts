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

vi.mock('~/shared/lib/diagnostics/client-log', () => ({
  logClientError: vi.fn(),
}));

import { logClientError } from '~/shared/lib/diagnostics/client-log';
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

  it('returns the healed orders even when the repair cannot be persisted (R3-READ-WRITE-BACK)', () => {
    seed([legacyOrder()]);
    const service = new OrderOfflineService(S1);
    // A full quota throws from `setItem`; before the fix that exception escaped the READ
    // and the whole history became unreadable.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      const order = service.getStorageOrders().find((o) => o.id === 'legacy-1') as Order;
      expect(order).toBeDefined();
      expect(order.orderItems[0].originalPrice).toBe(5);
      expect(order.orderItems[0].conversionRate).toBe(1);
      // The fix is only meaningful if the write was actually attempted (R3-WRITE-ATTEMPT-UNPROVED).
      expect(setItem).toHaveBeenCalledTimes(1);
      // ...and the failure must not disappear: it is reported as a warning (R4-QUOTA-SILENT-CATCH).
      expect(logClientError).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          message: 'orders.backfill-persist-failed',
          context: { errorName: 'QuotaExceededError' },
        }),
      );
    } finally {
      setItem.mockRestore();
    }
  });

  it('reports an unexpected persist failure as an error (R3-ERROR-BRANCH-UNTESTED)', () => {
    seed([legacyOrder()]);
    const bug = new Error('boom');
    bug.name = 'UnexpectedWriteBug';
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw bug;
    });
    try {
      new OrderOfflineService(S1).getStorageOrders();
      expect(logClientError).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'orders.backfill-persist-failed',
          context: { errorName: 'UnexpectedWriteBug' },
        }),
      );
    } finally {
      setItem.mockRestore();
    }
  });

  it('falls back to UnknownError when the thrown value has no name (R3-ERROR-BRANCH-UNTESTED)', () => {
    seed([legacyOrder()]);
    class PlainFailure {}
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new PlainFailure();
    });
    try {
      new OrderOfflineService(S1).getStorageOrders();
      expect(logClientError).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', context: { errorName: 'UnknownError' } }),
      );
    } finally {
      setItem.mockRestore();
    }
  });

  it('retries the repair on the next read after a failed persist (R3-RETRY-AFTER-FAILURE-UNTESTED)', () => {
    seed([legacyOrder()]);

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      new OrderOfflineService(S1).getStorageOrders();
    } finally {
      setItem.mockRestore();
    }

    // The failed write left the legacy order unhealed on disk, so a later read repairs it.
    const service = new OrderOfflineService(S1);
    service.getStorageOrders();
    const stored = JSON.parse(service.getOrdersJson()) as Array<Record<string, unknown>>;
    expect(stored[0]['saleCurrencyRateApplied']).toBe(1);
  });

  it('a second read of an already-healed store does not write again (R3-BACKFILL-IDEMPOTENCE)', () => {
    seed([legacyOrder()]);
    new OrderOfflineService(S1).getStorageOrders();

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      new OrderOfflineService(S1).getStorageOrders();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
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
