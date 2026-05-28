import { redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isUserAuthorized } from '~/shared/lib/auth/authorization-service';

function getAuthState() {
  return useAuthStore.getState();
}

export async function authLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return redirect('/login');
  }
  return null;
}

export async function guestOnlyLoader(): Promise<Response | null> {
  const { isAuthenticated } = getAuthState();
  if (isAuthenticated) {
    return redirect('/');
  }
  return null;
}

export function featureLoader(requiredFeatureIds: number[], storeIdParam?: string) {
  return async ({ params }: LoaderFunctionArgs): Promise<Response | null> => {
    const { user, isAuthenticated } = getAuthState();
    if (!user || !isAuthenticated) {
      return redirect('/login');
    }
    const storeId = storeIdParam ?? (params['storeId'] as string | undefined);
    if (!isUserAuthorized(user, requiredFeatureIds, storeId)) {
      return redirect('/unauthorized');
    }
    return null;
  };
}

export async function adminLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return redirect('/login');
  }
  if (!user.isSuperAdmin && !user.isOwnerAdmin) {
    return redirect('/unauthorized');
  }
  return null;
}

export async function resellerLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return redirect('/login');
  }
  if (!user.isSuperAdmin && !user.isReSeller) {
    return redirect('/unauthorized');
  }
  return null;
}
