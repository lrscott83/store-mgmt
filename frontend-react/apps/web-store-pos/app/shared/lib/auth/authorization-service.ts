import type { UserModel } from '@store-mgmt/domain';
import { EModules, EFeatures } from '@store-mgmt/domain';

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
  // Gate #1 — per-call expiry guard (Angular authorization.service.ts:18).
  // `<` EXCLUSIVE (NOT the `<=` inclusive session-load check at auth-store.ts:76 /
  // Angular auth.service.ts:143). Deny-only: no logout() side-effect.
  if (user.expiresIn < Date.now()) return false;

  if (user.isSuperAdmin) return true;

  // Gate #4 — independent fall-through ifs (Angular :23-26). A reseller/owner-admin
  // that fails its featureIds check falls through to the unconditional store check.
  if (user.isReSeller && featureIds.some((id) => user.featureIds.includes(id))) return true;
  if (user.isOwnerAdmin && featureIds.some((id) => user.featureIds.includes(id))) return true;

  // Store-user check (Angular isStoreUserAuthorize :41-44). Preserves the existing React
  // `storeId` param / effectiveStoreId behavior (out-of-scope pre-existing divergence, ADR-2).
  const effectiveStoreId = storeId ?? user.selectedStoreId;
  const matchingRoles = user.roles.filter((role) => role.storeId === effectiveStoreId);
  const combinedFeatureIds = matchingRoles.flatMap((role) => role.featureIds);
  if (featureIds.some((id) => combinedFeatureIds.includes(id))) return true;

  return false;
}

/** 1:1 port of Angular's `AuthorizationService.hasOwnersAvailableFeature` (authorization.service.ts:57-59). */
export function hasOwnersAvailableFeature(user: UserModel): boolean {
  return isUserAuthorized(user, [EFeatures.Owners], undefined);
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
