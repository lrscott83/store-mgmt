import type { Product } from '@store-mgmt/domain';

/**
 * 1:1 port of Angular's InventoryOfflineService.hasAvailableProductToSale
 * (frontend/src/app/application/entries/inventory-offline.service.ts:397-423), called from
 * SaleProductRowComponent.addProductToCart (sale-product-row.component.ts:58-104). Each error
 * code maps to a ProductErrors entry (frontend/src/app/domain/entities/products/product.errors.ts).
 */
export type ProductAvailabilityErrorCode =
  | 'NOT_EXISTS'
  | 'INACTIVE'
  | 'NOT_AVAILABLE_TO_SALE'
  | 'NOT_AVAILABLE'
  | 'QUANTITY_NOT_AVAILABLE';

export interface ProductAvailabilityResult {
  succeeded: boolean;
  errorCode?: ProductAvailabilityErrorCode;
}

/** Result of InventoryOfflineService.getAvailableQuantity — distinguishes "no active
 * entries at all" (ProductErrors.ProductNotAvailable) from "active entries but not enough"
 * (ProductErrors.ProductQuantityNotAvailable). */
export interface ProductInventoryAvailability {
  hasEntries: boolean;
  available: number;
}

export interface CheckProductAvailabilityParams {
  product: Product | undefined;
  /** Quantity being added right now (the form's quantity field). */
  quantity: number;
  /** Angular's shoppingCartService.getCartItemQuantity(productId) — quantity already in cart. */
  cartQuantity: number;
  /** Angular's authorizationService.hasInventoryModuleAvailable(). */
  hasInventoryModule: boolean;
  inventory: ProductInventoryAvailability;
}

/** i18n key per error code — exact Spanish text matches Angular's ProductErrors literals. */
export const PRODUCT_AVAILABILITY_ERROR_MESSAGE_KEYS: Record<ProductAvailabilityErrorCode, string> = {
  NOT_EXISTS: 'PRODUCT_ERRORS.NOT_EXISTS',
  INACTIVE: 'PRODUCT_ERRORS.INACTIVE',
  NOT_AVAILABLE_TO_SALE: 'PRODUCT_ERRORS.NOT_AVAILABLE_TO_SALE',
  // Reuses the pre-existing SALES.* key — already byte-identical to
  // ProductErrors.ProductNotAvailable.description.
  NOT_AVAILABLE: 'SALES.NOT_INVENTORY_AVAILABLE_MESSAGE',
  QUANTITY_NOT_AVAILABLE: 'PRODUCT_ERRORS.QUANTITY_NOT_AVAILABLE',
};

/**
 * Pure port of Angular's hasAvailableProductToSale 5-way branch:
 * 1. product not found -> NOT_EXISTS
 * 2. !product.isActive -> INACTIVE
 * 3. !product.availableToSale -> NOT_AVAILABLE_TO_SALE
 * 4. GATE: !hasInventoryModule || !product.discountFromInvantory -> succeeds (skip stock check)
 * 5. no active inventory entries -> NOT_AVAILABLE
 * 6. available < (quantity + cartQuantity) -> QUANTITY_NOT_AVAILABLE
 * 7. else -> succeeds
 */
export function checkProductAvailabilityToSale(
  params: CheckProductAvailabilityParams,
): ProductAvailabilityResult {
  const { product, quantity, cartQuantity, hasInventoryModule, inventory } = params;

  if (!product) return { succeeded: false, errorCode: 'NOT_EXISTS' };
  if (!product.isActive) return { succeeded: false, errorCode: 'INACTIVE' };
  if (!product.availableToSale) return { succeeded: false, errorCode: 'NOT_AVAILABLE_TO_SALE' };

  if (!hasInventoryModule || !product.discountFromInvantory) {
    return { succeeded: true };
  }

  if (!inventory.hasEntries) return { succeeded: false, errorCode: 'NOT_AVAILABLE' };

  const requestedTotal = quantity + cartQuantity;
  return inventory.available >= requestedTotal
    ? { succeeded: true }
    : { succeeded: false, errorCode: 'QUANTITY_NOT_AVAILABLE' };
}
