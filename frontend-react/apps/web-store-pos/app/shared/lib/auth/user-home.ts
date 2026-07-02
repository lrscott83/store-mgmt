import type { UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';

/**
 * Resolves the landing route for a freshly-authenticated (or already-authenticated)
 * user, mirroring Angular's `login.component.ts` `navigateToUserHome()`:
 *
 * - resellers / superadmins -> the owners admin (`/admin/owners`)
 * - everyone else -> the sale screen (`/sales/new`, Angular's `/sales/sale`) when the
 *   store can sell, otherwise the products screen (`/sales/products`).
 *
 * "Can sell" mirrors `ProductOfflineService.hasAnyAvailableToSaleProduct`: an active
 * category AND an active, sellable product must exist. Used both by the login submit
 * handler and by `guestOnlyLoader` (authenticated users hitting `/login`).
 */
export function resolveUserHomePath(user: UserModel): string {
  if (user.isReSeller || user.isSuperAdmin) {
    return '/admin/owners';
  }

  const storeId = user.selectedStoreId;
  const hasActiveCategory = new ProductCategoryOfflineService(storeId)
    .getAll()
    .some((c) => c.isActive);
  const hasProducts =
    hasActiveCategory &&
    new ProductOfflineService(storeId)
      .getAll()
      .some((p) => p.isActive && p.availableToSale);

  return hasProducts ? '/sales/new' : '/sales/products';
}
