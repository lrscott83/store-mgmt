import { redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isUserAuthorized } from '~/shared/lib/auth/authorization-service';
import { resolveUserHomePath } from '~/shared/lib/auth/user-home';

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
  // (Angular's navigateToUserHome()), NOT to a bare '/' landing.
  if (isAuthenticated && user) {
    return redirect(resolveUserHomePath(user));
  }
  return null;
}

export function featureLoader(requiredFeatureIds: number[], storeIdParam?: string) {
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
    return featureLoader(featureIds)({ params } as LoaderFunctionArgs);
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
    return featureLoader(featureIds)({ params } as LoaderFunctionArgs);
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
