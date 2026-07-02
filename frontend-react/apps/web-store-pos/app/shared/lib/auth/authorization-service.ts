import type { UserModel } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';

export function isSuperAdmin(user: UserModel): boolean {
  return user.isSuperAdmin;
}

export function isOwnerAdmin(user: UserModel): boolean {
  return user.isOwnerAdmin;
}

export function isReSeller(user: UserModel): boolean {
  return user.isReSeller;
}

export function isUserAuthorized(
  user: UserModel,
  featureIds: number[],
  storeId: string | undefined
): boolean {
  if (featureIds.length === 0) return true;

  if (user.isSuperAdmin) return true;

  if (user.isReSeller || user.isOwnerAdmin) {
    // Angular uses .some(): having ANY of the required features grants access.
    return featureIds.some((id) => user.featureIds.includes(id));
  }

  // Store users are authorized against their selected store, matching
  // Angular's isStoreUserAuthorize (r.storeId === currentUser.selectedStoreId).
  // An explicit storeId (e.g. a store-scoped route param) takes precedence.
  const effectiveStoreId = storeId ?? user.selectedStoreId;
  const matchingRoles = user.roles.filter((role) => role.storeId === effectiveStoreId);
  if (matchingRoles.length === 0) return false;

  const combinedFeatureIds = matchingRoles.flatMap((role) => role.featureIds);
  // Angular uses .some(): having ANY of the required features grants access.
  return featureIds.some((id) => combinedFeatureIds.includes(id));
}

/** 1:1 port of Angular's `AuthorizationService.hasModuleAvailable` (private helper there). */
export function isModuleAvailable(user: UserModel, moduleId: EModules): boolean {
  return user.storeModuleIds.some((id) => id === moduleId);
}

/** 1:1 port of Angular's `AuthorizationService.hasExpensesModuleAvailable`. */
export function hasExpensesModuleAvailable(user: UserModel): boolean {
  return isModuleAvailable(user, EModules.Expenses);
}

/** 1:1 port of Angular's `AuthorizationService.hasCreditsModuleAvailable`. */
export function hasCreditsModuleAvailable(user: UserModel): boolean {
  return isModuleAvailable(user, EModules.Credits);
}

/** 1:1 port of Angular's `AuthorizationService.hasInventoryModuleAvailable`. */
export function hasInventoryModuleAvailable(user: UserModel): boolean {
  return isModuleAvailable(user, EModules.Inventory);
}
