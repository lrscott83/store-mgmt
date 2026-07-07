import type { Product } from '@store-mgmt/domain';
import { ProductErrors, Result } from '@store-mgmt/domain';

/**
 * Result of InventoryOfflineService.getAvailableQuantity — distinguishes "no active
 * entries at all" (ProductErrors.ProductNotAvailable) from "active entries but not enough"
 * (ProductErrors.ProductQuantityNotAvailable). */
export interface ProductInventoryAvailability {
  hasEntries: boolean;
  available: number;
}

/**
 * The subset of Product fields hasAvailableProductToSale actually reads. Widened from a
 * full `Product` so callers that only have partial product data (e.g. InventoryOfflineService's
 * eligibility gate, which doesn't otherwise depend on Product) can reuse this predicate without
 * duplicating it. A full `Product` still satisfies this type structurally.
 */
export type ProductAvailabilityFields = Pick<
  Product,
  'isActive' | 'availableToSale' | 'discountFromInvantory'
>;

export interface CheckProductAvailabilityParams {
  product: ProductAvailabilityFields | undefined;
  /** Quantity being added right now (the form's quantity field). */
  quantity: number;
  /** Angular's shoppingCartService.getCartItemQuantity(productId) — quantity already in cart. */
  cartQuantity: number;
  /** Angular's authorizationService.hasInventoryModuleAvailable(). */
  hasInventoryModule: boolean;
  inventory: ProductInventoryAvailability;
}

/**
 * 1:1 port of Angular's `InventoryOfflineService.hasAvailableProductToSale`
 * (frontend/src/app/application/entries/inventory-offline.service.ts:397-423) — EXACT
 * Angular name and `Result` return shape (service-return-shape-parity correction #1;
 * supersedes the prior bespoke `checkProductAvailabilityToSale` / `ProductAvailabilityResult`
 * pair — single surface, no adapter). Angular's own method signature is
 * `(productId: string, quantity: number): Result`, doing its own `productRepository` +
 * `getProductInventoriesByProductId` lookups internally; React's `InventoryOfflineService`
 * has no product repository (pre-existing DI-gap precedent, design ADR/mismatch #2), so this
 * stays a pure function taking the looked-up product/inventory context explicitly — same
 * workaround already used by `getAvailableByCategory`'s `products` param.
 *
 * 5-way branch:
 * 1. product not found -> ProductErrors.NotExists
 * 2. !product.isActive -> ProductErrors.Inactive
 * 3. !product.availableToSale -> ProductErrors.ProductNotAvailableToSale
 * 4. GATE: !hasInventoryModule || !product.discountFromInvantory -> succeeds (skip stock check)
 * 5. no active inventory entries -> ProductErrors.ProductNotAvailable
 * 6. available < (quantity + cartQuantity) -> ProductErrors.ProductQuantityNotAvailable
 * 7. else -> succeeds
 */
export function hasAvailableProductToSale(params: CheckProductAvailabilityParams): Result {
  const { product, quantity, cartQuantity, hasInventoryModule, inventory } = params;

  if (!product) return Result.Failure([ProductErrors.NotExists]);
  if (!product.isActive) return Result.Failure([ProductErrors.Inactive]);
  if (!product.availableToSale) return Result.Failure([ProductErrors.ProductNotAvailableToSale]);

  if (!hasInventoryModule || !product.discountFromInvantory) {
    return Result.Success();
  }

  if (!inventory.hasEntries) return Result.Failure([ProductErrors.ProductNotAvailable]);

  const requestedTotal = quantity + cartQuantity;
  return inventory.available >= requestedTotal
    ? Result.Success()
    : Result.Failure([ProductErrors.ProductQuantityNotAvailable]);
}
