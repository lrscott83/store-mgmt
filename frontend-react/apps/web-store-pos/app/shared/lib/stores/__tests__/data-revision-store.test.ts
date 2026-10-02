import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, OrderType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Product } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { useDataRevisionStore } from '~/shared/lib/stores/data-revision-store';

// Same mock set the order service test uses: the constructor only touches these three.
vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableInventoryCosts: vi.fn().mockReturnValue([]),
    increaseQuantitiesByOrderItems: vi.fn(),
  })),
}));

vi.mock('../sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    createSaleCredit: vi.fn(),
    deactivateSaleCreditByOrderId: vi.fn(),
  })),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({
    getProductCategories: vi.fn().mockReturnValue([]),
  })),
}));

import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';

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
    currency: Currency.CUP,
    ...overrides,
  };
}

function makeCartItems(): CartItem[] {
  return [{ product: makeProduct(), quantity: 2, price: 5 }];
}

describe('OrderOfflineService.createOrder — data revision', () => {
  beforeEach(() => {
    localStorage.clear();
    useDataRevisionStore.setState({ revision: 0 });
  });

  it('bumps the revision once per created order', async () => {
    const service = new OrderOfflineService('s1');

    await service.createOrder(
      makeCartItems(),
      OrderType.Normal,
      false,
      PaymentType.Efectivo,
      undefined,
      '',
      SalePaymentMethod.Efectivo,
    );

    expect(useDataRevisionStore.getState().revision).toBe(1);
  });

  it('bumps again on a second sale, so views refresh on every registration and not only the first', async () => {
    const service = new OrderOfflineService('s1');

    await service.createOrder(
      makeCartItems(),
      OrderType.Normal,
      false,
      PaymentType.Efectivo,
      undefined,
      '',
      SalePaymentMethod.Efectivo,
    );
    await service.createOrder(
      makeCartItems(),
      OrderType.Normal,
      false,
      PaymentType.Efectivo,
      undefined,
      '',
      SalePaymentMethod.Efectivo,
    );

    expect(useDataRevisionStore.getState().revision).toBe(2);
  });
});