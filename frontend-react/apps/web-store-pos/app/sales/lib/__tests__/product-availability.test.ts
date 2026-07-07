import { describe, it, expect } from 'vitest';
import type { Product } from '@store-mgmt/domain';
import { ProductErrors } from '@store-mgmt/domain';
import { hasAvailableProductToSale } from '../product-availability';

// 1:1 port of Angular's InventoryOfflineService.hasAvailableProductToSale
// (frontend/src/app/application/entries/inventory-offline.service.ts:397-423), called from
// SaleProductRowComponent.addProductToCart (sale-product-row.component.ts:58-104). Five-way
// branch, each mapped to a ProductErrors entry (product.errors.ts). Returns Result (Angular's
// exact shape) — service-return-shape-parity correction #1: reconciled from the old bespoke
// `checkProductAvailabilityToSale` / ProductAvailabilityResult shape to Angular's exact
// name + Result envelope; no adapter, single surface.

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

describe('hasAvailableProductToSale (Result envelope, Angular exact name)', () => {
  it('branch 1: product not found -> Result.Failure([ProductErrors.NotExists])', () => {
    const result = hasAvailableProductToSale({
      product: undefined,
      quantity: 1,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: false, errors: [ProductErrors.NotExists] });
  });

  it('branch 2: !isActive -> Result.Failure([ProductErrors.Inactive])', () => {
    const result = hasAvailableProductToSale({
      product: makeProduct({ isActive: false }),
      quantity: 1,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: false, errors: [ProductErrors.Inactive] });
  });

  it('branch 3: !availableToSale -> Result.Failure([ProductErrors.ProductNotAvailableToSale])', () => {
    const result = hasAvailableProductToSale({
      product: makeProduct({ availableToSale: false }),
      quantity: 1,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: false, errors: [ProductErrors.ProductNotAvailableToSale] });
  });

  it('branch 4 (gate): !hasInventoryModule skips stock check -> Result.Success() even with zero stock', () => {
    const result = hasAvailableProductToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 5,
      cartQuantity: 0,
      hasInventoryModule: false,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: true, errors: [] });
  });

  it('branch 4 (gate): !product.discountFromInvantory skips stock check -> Result.Success() even with zero stock', () => {
    const result = hasAvailableProductToSale({
      product: makeProduct({ discountFromInvantory: false }),
      quantity: 5,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: true, errors: [] });
  });

  it('branch 5: hasInventoryModule && discountFromInvantory but no active entries -> Result.Failure([ProductErrors.ProductNotAvailable])', () => {
    const result = hasAvailableProductToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 1,
      cartQuantity: 0,
      hasInventoryModule: true,
      inventory: noEntries,
    });
    expect(result).toEqual({ succeeded: false, errors: [ProductErrors.ProductNotAvailable] });
  });

  it('branch 6: available < (quantity + cartQuantity) -> Result.Failure([ProductErrors.ProductQuantityNotAvailable])', () => {
    const result = hasAvailableProductToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 5,
      cartQuantity: 4,
      hasInventoryModule: true,
      inventory: { hasEntries: true, available: 8 },
    });
    expect(result).toEqual({ succeeded: false, errors: [ProductErrors.ProductQuantityNotAvailable] });
  });

  it('branch 6: includes cart quantity in the requested total (Angular quantity + shoppingCartQty)', () => {
    const result = hasAvailableProductToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 1,
      cartQuantity: 8,
      hasInventoryModule: true,
      inventory: { hasEntries: true, available: 8 },
    });
    expect(result).toEqual({ succeeded: false, errors: [ProductErrors.ProductQuantityNotAvailable] });
  });

  it('branch 7: available >= (quantity + cartQuantity) -> Result.Success()', () => {
    const result = hasAvailableProductToSale({
      product: makeProduct({ discountFromInvantory: true }),
      quantity: 5,
      cartQuantity: 4,
      hasInventoryModule: true,
      inventory: plentyEntries,
    });
    expect(result).toEqual({ succeeded: true, errors: [] });
  });
});
