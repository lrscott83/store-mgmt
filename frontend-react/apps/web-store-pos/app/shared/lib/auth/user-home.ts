import type { UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';

/**
 * Resolves the landing route for a freshly-authenticated (or already-authenticated)
 * user, mirroring Angular's `login.component.ts:184` `navigateToUserHome()`:
 *
 * - resellers / superadmins -> the owners admin (`/admin/owners`)
 * - everyone else -> the sale screen (`/sales/new`, Angular's `/sales/sale`) when the
 *   store can sell, otherwise the products screen (`/sales/products`).
 *
 * "Can sell" is a single `ProductOfflineService.hasAnyAvailableToSaleProduct()` call
 * (async, category-C) — exactly as Angular's `login.component.ts` does. The
 * active-category + active-sellable-product logic lives inside
 * `ProductRepository.hasAnyAvailableToSaleProduct` (Phase 1), so the standalone
 * `ProductCategoryOfflineService` check is redundant and dropped. Used both by the login
 * submit handler and by `guestOnlyLoader` (authenticated users hitting `/login`).
 */
export async function resolveUserHomePath(user: UserModel): Promise<string> {
  if (user.isReSeller || user.isSuperAdmin) {
    return '/admin/owners';
  }

  const result = await new ProductOfflineService(user.selectedStoreId).hasAnyAvailableToSaleProduct();
  return result.data ? '/sales/new' : '/sales/products';
}
