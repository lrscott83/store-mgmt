import { redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
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

export async function authLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return denyAccess();
  }
  return null;
}

export async function guestOnlyLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  // An already-authenticated user hitting /login is sent to their real home view
  // (Angular's navigateToUserHome()), NOT to a bare '/' landing. Also warm the
  // heavy route chunks here, mirroring Angular's second navigateToUserHome()
  // call-site (login.component.ts:50, the constructor's already-authenticated redirect).
  if (isAuthenticated && user) {
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
