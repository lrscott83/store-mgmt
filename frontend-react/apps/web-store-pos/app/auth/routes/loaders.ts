import { redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import type { UserModel } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isUserAuthorized } from '~/shared/lib/auth/authorization-service';
import { resolveUserHomePath } from '~/shared/lib/auth/user-home';
import { preloadHeavyChunks } from '~/shared/lib/pwa/preload-heavy-chunks';

function getAuthState() {
  return useAuthStore.getState();
}

// Matches Angular's guards: any denial — unauthenticated OR lacking the
// required feature/role — logs the user out and redirects to /login.
// Angular has no /unauthorized route; its guards call authService.logout().
function denyAccess(): Response {
  useAuthStore.getState().logout();
  return redirect('/login');
}

// design §5 (dek-lifecycle-and-unlock-gate, trap 2): dynamic import mirrors
// the established login.tsx:93 pattern (D1/D4) — loaders.ts keeps zero
// static `offline/` imports, so an unprovisioned device pays nothing extra
// on every authenticated navigation.
//
// NOTE the redirect carries NO logout(): the session and the roster must
// survive so the re-login can complete offline on a provisioned device.
// Logging out here would also wipe the roster's usability for this flow.
async function unlockGate(user: UserModel): Promise<Response | null> {
  const { needsUnlock } = await import('~/shared/lib/offline/unlock-gate');
  return needsUnlock(user) ? redirect('/login?unlock=1') : null;
}

// device-wrapped-dek design §3 (seams 1/2, WU8): the ONLY two chokepoints
// through which every route under `app-layout` (seam 1) and the
// already-authenticated `/login` visitor (seam 2) reach the 16 sync
// `encryptEntity`/`decryptEntity` call sites — see design §3's grep-verified
// proof. Dynamic import for the same D1/D4 reason as `unlockGate` above.
async function bootstrapDeviceDekForRoute(): Promise<void> {
  const { bootstrapDeviceDek } = await import('~/shared/lib/storage/dek-bootstrap');
  await bootstrapDeviceDek();
}

export async function authLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return denyAccess();
  }
  // MUST precede `unlockGate` — a working device-key wrap recovers the DEK
  // silently here, before `needsUnlock` ever sees a null DEK.
  await bootstrapDeviceDekForRoute();
  return unlockGate(user);
}

export async function guestOnlyLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  // An already-authenticated user hitting /login is sent to their real home view
  // (Angular's navigateToUserHome()), NOT to a bare '/' landing. Also warm the
  // heavy route chunks here, mirroring Angular's second navigateToUserHome()
  // call-site (login.component.ts:50, the constructor's already-authenticated redirect).
  if (isAuthenticated && user) {
    // MUST precede both `needsUnlock` and `resolveUserHomePath` below —
    // the latter reaches business-entity storage seams that throw
    // MissingDataKeyError while locked (design §3 seam 2).
    await bootstrapDeviceDekForRoute();
    // design §5: a locked-but-provisioned visitor at /login must see the
    // unlock form (return null), NOT get bounced home — resolveUserHomePath
    // reads business-entity storage seams that throw MissingDataKeyError
    // while locked, so this check MUST precede it.
    const { needsUnlock } = await import('~/shared/lib/offline/unlock-gate');
    if (needsUnlock(user)) return null;
    preloadHeavyChunks();
    return redirect(await resolveUserHomePath(user));
  }
  return null;
}

// Non-bypass core: identical to the pre-change `featureLoader` body. Used
// directly by `adminFeatureLoader`/`resellerFeatureLoader` so the owner/super-admin
// bypass added to the plain `featureLoader` below does NOT leak into the admin/
// reseller guard chains (they must keep requiring a featureId match).
function featureGate(requiredFeatureIds: number[], storeIdParam?: string) {
  return async ({ params }: LoaderFunctionArgs): Promise<Response | null> => {
    const { user, isAuthenticated } = getAuthState();
    if (!user || !isAuthenticated) {
      return denyAccess();
    }
    const storeId = storeIdParam ?? (params['storeId'] as string | undefined);
    if (!isUserAuthorized(user, requiredFeatureIds, storeId)) {
      return denyAccess();
    }
    return null;
  };
}

// Mirrors Angular's live AuthGuard (auth-guard.ts:44): SuperAdmin/OwnerAdmin
// bypass the feature check entirely on plain feature-gated routes, BEFORE any
// featureId/storeId/expiry evaluation. Reseller and store-user behavior is
// unchanged (delegates to featureGate).
export function featureLoader(requiredFeatureIds: number[], storeIdParam?: string) {
  return async (args: LoaderFunctionArgs): Promise<Response | null> => {
    const { user, isAuthenticated } = getAuthState();
    if (!user || !isAuthenticated) {
      return denyAccess();
    }
    if (user.isSuperAdmin || user.isOwnerAdmin) {
      return null;
    }
    return featureGate(requiredFeatureIds, storeIdParam)(args);
  };
}

export async function adminLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return denyAccess();
  }
  if (!user.isSuperAdmin && !user.isOwnerAdmin) {
    return denyAccess();
  }
  return null;
}

export function adminFeatureLoader(featureIds: number[]) {
  return async ({ params }: LoaderFunctionArgs): Promise<Response | null> => {
    const adminResult = await adminLoader();
    if (adminResult) return adminResult;
    return featureGate(featureIds)({ params } as LoaderFunctionArgs);
  };
}

export async function superAdminLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return denyAccess();
  }
  if (!user.isSuperAdmin) {
    return denyAccess();
  }
  return null;
}

export function resellerFeatureLoader(featureIds: number[]) {
  return async ({ params }: LoaderFunctionArgs): Promise<Response | null> => {
    const resellerResult = await resellerLoader();
    if (resellerResult) return resellerResult;
    return featureGate(featureIds)({ params } as LoaderFunctionArgs);
  };
}

export async function resellerLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return denyAccess();
  }
  if (!user.isSuperAdmin && !user.isReSeller) {
    return denyAccess();
  }
  return null;
}
