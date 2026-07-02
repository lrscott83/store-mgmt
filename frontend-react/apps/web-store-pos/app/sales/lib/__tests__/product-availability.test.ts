import { describe, it, expect } from 'vitest';
import type { Product } from '@store-mgmt/domain';
import {
  checkProductAvailabilityToSale,
  PRODUCT_AVAILABILITY_ERROR_MESSAGE_KEYS,
} from '../product-availability';

// 1:1 port of Angular's InventoryOfflineService.hasAvailableProductToSale
// (frontend/src/app/application/entries/inventory-offline.service.ts:397-423), called from
// SaleProductRowComponent.addProductToCart (sale-product-row.component.ts:58-104). Five-way
// branch, each mapped to a ProductErrors entry (product.errors.ts).

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Coca Cola',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1.5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

const noEntries = { hasEntries: false, available: 0 };
const plentyEntries = { hasEntries: true, available: 100 };

describe('checkProductAvailabilityToSale', () => {
  it('branch 1: product not found -> NOT_EXISTS', () => {
    const result = checkProductAvailabilityToSale({
      product: undefined,
      quantity: 1,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: false, errorCode: 'NOT_EXISTS' });
  });

  it('branch 2: !isActive -> INACTIVE', () => {
    const result = checkProductAvailabilityToSale({
      product: makeProduct({ isActive: false }),
      quantity: 1,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: false, errorCode: 'INACTIVE' });
  });

  it('branch 3: !availableToSale -> NOT_AVAILABLE_TO_SALE', () => {
    const result = checkProductAvailabilityToSale({
      product: makeProduct({ availableToSale: false }),
      quantity: 1,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: false, errorCode: 'NOT_AVAILABLE_TO_SALE' });
  });

  it('branch 4 (gate): !hasInventoryModule skips stock check -> succeeds even with zero stock', () => {
    const result = checkProductAvailabilityToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 5,
      cartQuantity: 0,
      hasInventoryModule: false,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: true });
  });

  it('branch 4 (gate): !product.discountFromInvantory skips stock check -> succeeds even with zero stock', () => {
    const result = checkProductAvailabilityToSale({
      product: makeProduct({ discountFromInvantory: false }),
      quantity: 5,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: true });
  });

  it('branch 5: hasInventoryModule && discountFromInvantory but no active entries -> NOT_AVAILABLE', () => {
    const result = checkProductAvailabilityToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 1,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: false, errorCode: 'NOT_AVAILABLE' });
  });

  it('branch 6: available < (quantity + cartQuantity) -> QUANTITY_NOT_AVAILABLE', () => {
    const result = checkProductAvailabilityToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 5,
      cartQuantity: 4,
      hasInventoryModule: true,
      inventory: { hasEntries: true, available: 8 },
    });
    expect(result).toEqual({ succeeded: false, errorCode: 'QUANTITY_NOT_AVAILABLE' });
  });

  it('branch 6: includes cart quantity in the requested total (Angular quantity + shoppingCartQty)', () => {
    const result = checkProductAvailabilityToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 1,
      cartQuantity: 8,
      hasInventoryModule: true,
      inventory: { hasEntries: true, available: 8 },
    });
    expect(result).toEqual({ succeeded: false, errorCode: 'QUANTITY_NOT_AVAILABLE' });
  });

  it('branch 7: available >= (quantity + cartQuantity) -> succeeds', () => {
    const result = checkProductAvailabilityToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 5,
      cartQuantity: 4,
      hasInventoryModule: true,
      inventory: plentyEntries,
    });
    expect(result).toEqual({ succeeded: true });
  });

  it('exposes an i18n key for every error code, matching Angular ProductErrors literals exactly', () => {
    expect(Object.keys(PRODUCT_AVAILABILITY_ERROR_MESSAGE_KEYS).sort()).toEqual(
      ['INACTIVE', 'NOT_AVAILABLE', 'NOT_AVAILABLE_TO_SALE', 'NOT_EXISTS', 'QUANTITY_NOT_AVAILABLE'].sort(),
    );
    // NOT_AVAILABLE reuses the pre-existing SALES.* key (already byte-identical Spanish).
    expect(PRODUCT_AVAILABILITY_ERROR_MESSAGE_KEYS.NOT_AVAILABLE).toBe('SALES.NOT_INVENTORY_AVAILABLE_MESSAGE');
  });
});
