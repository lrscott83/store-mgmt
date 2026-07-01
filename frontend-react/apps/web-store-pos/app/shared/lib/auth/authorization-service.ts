import type { UserModel } from '@store-mgmt/domain';

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
    return featureIds.every((id) => user.featureIds.includes(id));
  }

  // Store users are authorized against their selected store, matching
  // Angular's isStoreUserAuthorize (r.storeId === currentUser.selectedStoreId).
  // An explicit storeId (e.g. a store-scoped route param) takes precedence.
  const effectiveStoreId = storeId ?? user.selectedStoreId;
  const matchingRoles = user.roles.filter((role) => role.storeId === effectiveStoreId);
  if (matchingRoles.length === 0) return false;

  const combinedFeatureIds = matchingRoles.flatMap((role) => role.featureIds);
  return featureIds.every((id) => combinedFeatureIds.includes(id));
}
