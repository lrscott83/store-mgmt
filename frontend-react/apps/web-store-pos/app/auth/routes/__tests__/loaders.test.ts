import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}));

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import {
  authLoader,
  guestOnlyLoader,
  featureLoader,
  adminLoader,
  resellerLoader,
  adminFeatureLoader,
  superAdminLoader,
  resellerFeatureLoader,
} from '../loaders';
import type { UserModel } from '@store-mgmt/domain';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'user@test.com',
    fullName: 'Test User',
    cellPhone: '+1234567890',
    email: 'user@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: '',
    ...overrides,
  };
}

function setAuthState(user: UserModel | null) {
  vi.mocked(useAuthStore.getState).mockReturnValue({
    user,
    isAuthenticated: user !== null,
    isLoading: false,
    error: null,
    initialize: vi.fn(),
    setUser: vi.fn(),
    updateUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe('Route Loaders (AUTH-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authLoader', () => {
    it('returns null when user is authenticated', async () => {
      setAuthState(makeUser());
      const result = await authLoader();
      expect(result).toBeNull();
    });

    it('redirects to /login when not authenticated', async () => {
      setAuthState(null);
      const result = await authLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
    });
  });

  describe('guestOnlyLoader', () => {
    it('returns null when not authenticated', async () => {
      setAuthState(null);
      const result = await guestOnlyLoader();
      expect(result).toBeNull();
    });

    it('redirects to / when authenticated', async () => {
      setAuthState(makeUser());
      const result = await guestOnlyLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/');
    });
  });

  describe('featureLoader', () => {
    it('redirects to /login when not authenticated', async () => {
      setAuthState(null);
      const loader = featureLoader([21]);
      const result = await loader({ params: { storeId: 's1' } } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
    });

    it('allows SuperAdmin regardless of feature — AUTH-04 SuperAdmin bypass', async () => {
      setAuthState(makeUser({ isSuperAdmin: true }));
      const loader = featureLoader([21, 22]);
      const result = await loader({ params: { storeId: 's1' } } as never);
      expect(result).toBeNull();
    });

    it('redirects to /unauthorized when StoreUser lacks feature — AUTH-04 deny', async () => {
      setAuthState(
        makeUser({
          roles: [{ storeId: 's1', storeName: 'S1', moduleId: 2, featureIds: [20] }],
        })
      );
      const loader = featureLoader([21], 's1');
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/unauthorized');
    });

    it('allows StoreUser with correct featureId for their store', async () => {
      setAuthState(
        makeUser({
          roles: [{ storeId: 's1', storeName: 'S1', moduleId: 2, featureIds: [21] }],
        })
      );
      const loader = featureLoader([21], 's1');
      const result = await loader({ params: {} } as never);
      expect(result).toBeNull();
    });
  });

  describe('adminLoader', () => {
    it('redirects to /login when not authenticated', async () => {
      setAuthState(null);
      const result = await adminLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
    });

    it('allows SuperAdmin', async () => {
      setAuthState(makeUser({ isSuperAdmin: true }));
      const result = await adminLoader();
      expect(result).toBeNull();
    });

    it('allows OwnerAdmin', async () => {
      setAuthState(makeUser({ isOwnerAdmin: true }));
      const result = await adminLoader();
      expect(result).toBeNull();
    });

    it('redirects StoreUser to /unauthorized', async () => {
      setAuthState(makeUser());
      const result = await adminLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/unauthorized');
    });
  });

  describe('adminFeatureLoader', () => {
    it('redirects unauthenticated user to /login', async () => {
      setAuthState(null);
      const loader = adminFeatureLoader([73]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
    });

    it('redirects non-admin authenticated user to /unauthorized', async () => {
      setAuthState(makeUser({ isSuperAdmin: false, isOwnerAdmin: false }));
      const loader = adminFeatureLoader([73]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/unauthorized');
    });

    it('redirects admin without required feature to /unauthorized', async () => {
      setAuthState(makeUser({ isOwnerAdmin: true, featureIds: [] }));
      const loader = adminFeatureLoader([73]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/unauthorized');
    });

    it('returns null for SuperAdmin with required feature', async () => {
      setAuthState(makeUser({ isSuperAdmin: true, featureIds: [73] }));
      const loader = adminFeatureLoader([73]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeNull();
    });
  });

  describe('superAdminLoader — ACCESS-1 through ACCESS-3', () => {
    it('redirects unauthenticated user to /login', async () => {
      setAuthState(null);
      const result = await superAdminLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
    });

    it('redirects OwnerAdmin (non-SuperAdmin) to /unauthorized', async () => {
      setAuthState(makeUser({ isSuperAdmin: false, isOwnerAdmin: true }));
      const result = await superAdminLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/unauthorized');
    });

    it('returns null for SuperAdmin (allows access)', async () => {
      setAuthState(makeUser({ isSuperAdmin: true }));
      const result = await superAdminLoader();
      expect(result).toBeNull();
    });
  });

  describe('resellerFeatureLoader — ADMIN-OWNERS-ACCESS', () => {
    it('returns a loader function (factory)', () => {
      const loader = resellerFeatureLoader([11]);
      expect(typeof loader).toBe('function');
    });

    it('redirects unauthenticated user to /login (S-ADMIN-OWNERS-ACCESS-5)', async () => {
      setAuthState(null);
      const loader = resellerFeatureLoader([11]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
    });

    it('redirects OwnerAdmin (non-reseller, non-superAdmin) to /unauthorized (S-ADMIN-OWNERS-ACCESS-3)', async () => {
      setAuthState(makeUser({ isOwnerAdmin: true }));
      const loader = resellerFeatureLoader([11]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/unauthorized');
    });

    it('allows SuperAdmin (S-ADMIN-OWNERS-ACCESS-1)', async () => {
      setAuthState(makeUser({ isSuperAdmin: true, featureIds: [11] }));
      const loader = resellerFeatureLoader([11]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeNull();
    });

    it('allows ReSeller with feature enabled (S-ADMIN-OWNERS-ACCESS-2)', async () => {
      setAuthState(makeUser({ isReSeller: true, featureIds: [11] }));
      const loader = resellerFeatureLoader([11]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeNull();
    });

    it('redirects ReSeller without required feature to /unauthorized (S-ADMIN-OWNERS-ACCESS-4)', async () => {
      setAuthState(makeUser({ isReSeller: true, featureIds: [] }));
      const loader = resellerFeatureLoader([11]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/unauthorized');
    });
  });

  describe('resellerLoader', () => {
    it('allows SuperAdmin', async () => {
      setAuthState(makeUser({ isSuperAdmin: true }));
      const result = await resellerLoader();
      expect(result).toBeNull();
    });

    it('allows ReSeller', async () => {
      setAuthState(makeUser({ isReSeller: true }));
      const result = await resellerLoader();
      expect(result).toBeNull();
    });

    it('redirects OwnerAdmin to /unauthorized', async () => {
      setAuthState(makeUser({ isOwnerAdmin: true }));
      const result = await resellerLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/unauthorized');
    });
  });
});
