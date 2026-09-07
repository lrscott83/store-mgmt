import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}));

vi.mock('~/shared/lib/pwa/preload-heavy-chunks', () => ({
  preloadHeavyChunks: vi.fn(),
}));

// device-wrapped-dek design §3/§7 (WU8, ordering tests below): wraps the
// REAL module so every OTHER test in this file keeps the real,
// IndexedDB-absent-under-jsdom behavior (`getDeviceKey` resolves `null`,
// exactly F1) — only the ordering tests override `getDeviceKey` with a
// deferred/controllable implementation.
vi.mock('~/shared/lib/storage/device-key-store', async () => {
  const actual = await vi.importActual<typeof import('~/shared/lib/storage/device-key-store')>(
    '~/shared/lib/storage/device-key-store',
  );
  return { ...actual, getDeviceKey: vi.fn(actual.getDeviceKey) };
});

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { preloadHeavyChunks } from '~/shared/lib/pwa/preload-heavy-chunks';
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
import { importRoster } from '~/shared/lib/offline/roster-store';
import { getDek, setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { getDeviceKey } from '~/shared/lib/storage/device-key-store';
import { writeDeviceDekTable, clearDeviceDekTable } from '~/shared/lib/storage/device-dek-table';
import { wrapDekForDevice } from '~/shared/lib/storage/dek-bootstrap';
import * as productServiceFactory from '~/sales/lib/services/product-service.factory';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';
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
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
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
    getUserByToken: vi.fn(),
    setUser: vi.fn(),
    updateUser: vi.fn(),
    login: vi.fn(),
    loginOffline: vi.fn(),
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

    // Mirrors Angular login.component.ts: an authenticated user hitting /login is
    // sent to navigateToUserHome(), NOT to '/'. With empty offline storage a normal
    // StoreUser lands on /sales/products; resellers/superadmins on /admin/owners.
    it('redirects an authenticated StoreUser to /sales/products', async () => {
      setAuthState(makeUser());
      const result = await guestOnlyLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/sales/products');
    });

    it('redirects an authenticated superadmin to /admin/owners', async () => {
      setAuthState(makeUser({ isSuperAdmin: true }));
      const res = (await guestOnlyLoader()) as Response;
      expect(res.headers.get('Location')).toBe('/admin/owners');
    });

    it('redirects an authenticated reseller to /admin/owners', async () => {
      setAuthState(makeUser({ isReSeller: true }));
      const res = (await guestOnlyLoader()) as Response;
      expect(res.headers.get('Location')).toBe('/admin/owners');
    });

    // PWA-PRELOAD-1: mirrors Angular's login.component.ts:50 constructor
    // already-authenticated path, which calls navigateToUserHome() ->
    // preloadHeavyChunks().
    it('preloads the heavy route chunks before redirecting an authenticated user', async () => {
      setAuthState(makeUser());
      await guestOnlyLoader();
      expect(preloadHeavyChunks).toHaveBeenCalledTimes(1);
    });

    it('does not preload when not authenticated', async () => {
      setAuthState(null);
      await guestOnlyLoader();
      expect(preloadHeavyChunks).not.toHaveBeenCalled();
    });
  });

  // design §5 (dek-lifecycle-and-unlock-gate): authLoader/guestOnlyLoader are
  // the ONLY two loaders wired to the unlock gate (app-layout.tsx:17 makes
  // authLoader the single chokepoint for every authenticated route). These
  // tests exercise the REAL `unlock-gate`/`roster-store`/`data-key-store`
  // modules (dynamic-imported by loaders.ts) against real localStorage — only
  // `useAuthStore` is mocked, matching the rest of this file.
  describe('unlock gate — authLoader + guestOnlyLoader (design §5, four combinations)', () => {
    const UNLOCK_LOGIN = 'user@test.com';

    function makeV2Bundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
      return {
        bundleId: 'b1',
        issuedAt: 1000,
        expiresAt: Date.now() + 1_000_000,
        formatVersion: 2,
        storeId: 's1',
        users: [
          {
            id: 'u1',
            login: UNLOCK_LOGIN,
            fullName: 'Test User',
            isActive: true,
            roles: [],
            featureIds: [],
            storeModuleIds: [],
            isSuperAdmin: false,
            isOwnerAdmin: false,
            isReSeller: false,
            selectedStoreId: 's1',
            verifier: { hash: 'h', salt: 's', iterations: 210_000 },
            wrappedDek: 'ct',
            wrapSalt: 'salt',
            wrapIv: 'iv',
          },
        ],
        ...overrides,
      };
    }

    beforeEach(() => {
      localStorage.clear();
      clearDek();
    });

    afterEach(() => {
      localStorage.clear();
      clearDek();
    });

    it('guestOnlyLoader — majority case: authenticated online-auth-only user, no roster -> redirect home (unchanged)', async () => {
      setAuthState(makeUser({ login: UNLOCK_LOGIN }));
      const result = await guestOnlyLoader();
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).headers.get('Location')).toBe('/sales/products');
    });

    // entity-crypto.ts:23 + storage-keys.ts entityKey shape, mirrored as
    // literals — the app source is mocked/partial here, not importable.
    function plantEncryptedEntity(storeId: string): void {
      localStorage.setItem(
        `lizoft.store-products-${storeId}`,
        'enc:v1:AAAA',
      );
    }

    // Valid-session fix (2026-09-06): locked + provisioned + NO ciphertext on
    // disk -> a valid session bounces home; the hijack only exists to protect
    // unreadable encrypted data.
    it('guestOnlyLoader — locked provisioned visitor WITHOUT ciphertext -> redirect home (valid-session fix)', async () => {
      importRoster(makeV2Bundle());
      setAuthState(makeUser({ login: UNLOCK_LOGIN }));

      const result = await guestOnlyLoader();

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).headers.get('Location')).toBe('/sales/products');
    });

    it('guestOnlyLoader — locked provisioned visitor WITH ciphertext -> renders the form (null, no redirect)', async () => {
      importRoster(makeV2Bundle());
      plantEncryptedEntity('s1');
      setAuthState(makeUser({ login: UNLOCK_LOGIN }));

      const result = await guestOnlyLoader();

      expect(result).toBeNull();
      expect(preloadHeavyChunks).not.toHaveBeenCalled();
    });

    it('guestOnlyLoader — unlocked provisioned visitor: v2 roster + DEK present -> redirect home', async () => {
      importRoster(makeV2Bundle());
      setDek(new Uint8Array(32), 's1');
      setAuthState(makeUser({ login: UNLOCK_LOGIN }));

      const result = await guestOnlyLoader();

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).headers.get('Location')).toBe('/sales/products');
    });

    // Valid-session fix (2026-09-06): needsUnlock alone must NOT hijack a
    // valid session — only unreadable ciphertext justifies the redirect.
    it('authLoader — locked-provisioned WITHOUT ciphertext: passes through WITHOUT redirect or logout (valid-session fix)', async () => {
      importRoster(makeV2Bundle());
      const user = makeUser({ login: UNLOCK_LOGIN });
      const logoutSpy = vi.fn();
      vi.mocked(useAuthStore.getState).mockReturnValue({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        initialize: vi.fn(),
        getUserByToken: vi.fn(),
        setUser: vi.fn(),
        updateUser: vi.fn(),
        login: vi.fn(),
        loginOffline: vi.fn(),
        logout: logoutSpy,
      });

      const result = await authLoader();

      expect(result).toBeNull();
      expect(logoutSpy).not.toHaveBeenCalled();
    });

    it('authLoader — locked-provisioned WITH ciphertext: redirects to /login?unlock=1 WITHOUT logging out', async () => {
      importRoster(makeV2Bundle());
      plantEncryptedEntity('s1');
      const user = makeUser({ login: UNLOCK_LOGIN });
      const logoutSpy = vi.fn();
      vi.mocked(useAuthStore.getState).mockReturnValue({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        initialize: vi.fn(),
        getUserByToken: vi.fn(),
        setUser: vi.fn(),
        updateUser: vi.fn(),
        login: vi.fn(),
        loginOffline: vi.fn(),
        logout: logoutSpy,
      });

      const result = await authLoader();

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).headers.get('Location')).toBe('/login?unlock=1');
      expect(logoutSpy).not.toHaveBeenCalled();
    });

    it('authLoader — unprovisioned device: passes through unchanged (majority case)', async () => {
      setAuthState(makeUser({ login: UNLOCK_LOGIN }));
      const result = await authLoader();
      expect(result).toBeNull();
    });

    it('authLoader — unlocked provisioned device: passes through unchanged', async () => {
      importRoster(makeV2Bundle());
      setDek(new Uint8Array(32), 's1');
      setAuthState(makeUser({ login: UNLOCK_LOGIN }));

      const result = await authLoader();

      expect(result).toBeNull();
    });
  });

  // device-wrapped-dek design §3 (WU8): the bootstrap-ordering guarantee,
  // asserted, not assumed — `authLoader`/`guestOnlyLoader` MUST await
  // `bootstrapDeviceDek()` BEFORE evaluating `needsUnlock`/calling
  // `resolveUserHomePath`, since those are the only two seams §3's proof
  // relies on to reach every sync `encryptEntity`/`decryptEntity` call site.
  describe('authLoader + guestOnlyLoader — device DEK bootstrap ordering (design §3)', () => {
    const ORDERING_LOGIN = 'ordering@test.com';

    async function establishDeviceWrap(dek: Uint8Array, storeId: string): Promise<CryptoKey> {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
        'encrypt',
        'decrypt',
      ]);
      const wrap = await wrapDekForDevice(dek, key);
      writeDeviceDekTable({ formatVersion: 1, dekSource: 'local', storeId, device: wrap, users: {} });
      return key;
    }

    beforeEach(() => {
      localStorage.clear();
      clearDek();
      vi.mocked(getDeviceKey).mockReset();
    });

    afterEach(() => {
      localStorage.clear();
      clearDek();
      clearDeviceDekTable();
      vi.mocked(getDeviceKey).mockReset();
    });

    it('authLoader — does not resolve before getDek() is non-null (a deferred device-key recovery is awaited)', async () => {
      const dek = new Uint8Array(32).fill(0x44);
      const key = await establishDeviceWrap(dek, 's1');
      vi.mocked(getDeviceKey).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(key), 10)),
      );
      setAuthState(makeUser({ login: ORDERING_LOGIN }));

      await authLoader();

      expect(getDek()).not.toBeNull();
      expect(Array.from(getDek()!)).toEqual(Array.from(dek));
    });

    it('guestOnlyLoader — bootstraps the device DEK before resolveUserHomePath (product service) is invoked', async () => {
      const dek = new Uint8Array(32).fill(0x55);
      const key = await establishDeviceWrap(dek, 's1');
      vi.mocked(getDeviceKey).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(key), 10)),
      );

      let dekWhenProductServiceCalled: Uint8Array | null = null;
      const spy = vi
        .spyOn(productServiceFactory, 'createProductService')
        .mockImplementation(() => {
          dekWhenProductServiceCalled = getDek();
          return {
            hasAnyAvailableToSaleProduct: vi.fn().mockResolvedValue({
              data: false,
              succeeded: true,
              message: '',
              actionCode: 200,
              errors: [],
            }),
          } as unknown as ReturnType<typeof productServiceFactory.createProductService>;
        });

      setAuthState(makeUser({ login: ORDERING_LOGIN }));
      await guestOnlyLoader();

      expect(dekWhenProductServiceCalled).not.toBeNull();
      expect(Array.from(dekWhenProductServiceCalled!)).toEqual(Array.from(dek));

      spy.mockRestore();
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

    it('redirects to /login when StoreUser lacks feature — AUTH-04 deny', async () => {
      setAuthState(
        makeUser({
          roles: [{ storeId: 's1', storeName: 'S1', moduleId: 2, featureIds: [20] }],
        })
      );
      const loader = featureLoader([21], 's1');
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
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

    // route-guard-parity: mirrors Angular auth-guard.ts:44 — OwnerAdmin bypasses
    // the feature check entirely on plain feature-gated routes (no featureId match
    // required). This is a CHANGED behavior vs. the previous React implementation.
    it('allows OwnerAdmin without matching featureId — owner-admin bypass', async () => {
      setAuthState(makeUser({ isOwnerAdmin: true, featureIds: [] }));
      const loader = featureLoader([21, 22]);
      const result = await loader({ params: { storeId: 's1' } } as never);
      expect(result).toBeNull();
    });

    // route-guard-parity: the SuperAdmin/OwnerAdmin bypass MUST precede
    // isUserAuthorized's expiry gate (Angular auth-guard.ts:44 returns before any
    // expiry check). An expired-but-still-`isAuthenticated` SuperAdmin is still
    // allowed through the plain featureLoader.
    it('allows SuperAdmin with an expired session — bypass precedes expiry check', async () => {
      setAuthState(makeUser({ isSuperAdmin: true, expiresIn: Date.now() - 1000, featureIds: [] }));
      const loader = featureLoader([21, 22]);
      const result = await loader({ params: { storeId: 's1' } } as never);
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

    it('redirects StoreUser to /login', async () => {
      setAuthState(makeUser());
      const result = await adminLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
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

    it('redirects non-admin authenticated user to /login', async () => {
      setAuthState(makeUser({ isSuperAdmin: false, isOwnerAdmin: false }));
      const loader = adminFeatureLoader([73]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
    });

    it('redirects admin without required feature to /login', async () => {
      setAuthState(makeUser({ isOwnerAdmin: true, featureIds: [] }));
      const loader = adminFeatureLoader([73]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
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

    it('redirects OwnerAdmin (non-SuperAdmin) to /login', async () => {
      setAuthState(makeUser({ isSuperAdmin: false, isOwnerAdmin: true }));
      const result = await superAdminLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
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

    it('redirects OwnerAdmin (non-reseller, non-superAdmin) to /login (S-ADMIN-OWNERS-ACCESS-3)', async () => {
      setAuthState(makeUser({ isOwnerAdmin: true }));
      const loader = resellerFeatureLoader([11]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
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

    it('redirects ReSeller without required feature to /login (S-ADMIN-OWNERS-ACCESS-4)', async () => {
      setAuthState(makeUser({ isReSeller: true, featureIds: [] }));
      const loader = resellerFeatureLoader([11]);
      const result = await loader({ params: {} } as never);
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
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

    it('redirects OwnerAdmin to /login', async () => {
      setAuthState(makeUser({ isOwnerAdmin: true }));
      const result = await resellerLoader();
      expect(result).toBeInstanceOf(Response);
      const res = result as Response;
      expect(res.headers.get('Location')).toBe('/login');
    });
  });
});
