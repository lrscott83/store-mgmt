import type { UserModel } from '@store-mgmt/domain';
import { createProductService } from '~/sales/lib/services/product-service.factory';

/**
 * Resolves the landing route for a freshly-authenticated (or already-authenticated)
 * user, mirroring Angular's `login.component.ts:184` `navigateToUserHome()`:
 *
 * - resellers / superadmins -> the owners admin (`/admin/owners`)
 * - everyone else -> the sale screen (`/sales/new`, Angular's `/sales/sale`) when the
 *   store can sell, otherwise the products screen (`/sales/products`).
 *
 * "Can sell" is a single `createProductService(storeId).hasAnyAvailableToSaleProduct()`
 * call (async, category-C) — exactly as Angular's `login.component.ts` does. The
 * active-category + active-sellable-product logic lives inside
 * `ProductRepository.hasAnyAvailableToSaleProduct` (Phase 1), so the standalone
 * `ProductCategoryOfflineService` check is redundant and dropped. Used both by the login
 * submit handler and by `guestOnlyLoader` (authenticated users hitting `/login`).
 *
 * TOTAL by contract: this function NEVER throws. An authenticated user must always
 * land somewhere usable — a throw would strand a valid session on /login (login
 * submit) or bounce an authenticated /login visitor into an error (guestOnlyLoader),
 * both violating docs/contracts/authenticated-session-redirect.md. If the can-sell
 * check fails for ANY reason (storage/DEK error, missing store, malformed response),
 * the user lands on /sales/products — the same destination the check itself chooses
 * when the store has no sellable products.
 */
export async function resolveUserHomePath(user: UserModel): Promise<string> {
  if (user.isReSeller || user.isSuperAdmin) {
    return '/admin/owners';
  }

  try {
    const result = await createProductService(user.selectedStoreId).hasAnyAvailableToSaleProduct();
    return result.data ? '/sales/new' : '/sales/products';
  } catch {
    return '/sales/products';
  }
}
