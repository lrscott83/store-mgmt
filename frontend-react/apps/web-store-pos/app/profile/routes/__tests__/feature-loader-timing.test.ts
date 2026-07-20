import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EFeatures } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';

// Regression coverage for the stale-storeId bug: both profile route loaders used to
// do `featureLoader([EFeatures.Profile], useAuthStore.getState().user?.selectedStoreId)`
// — the second argument is evaluated ONCE at module-import time (before login,
// or capturing whatever store the user was in at first import), then React
// Router caches that module for the whole session. `isUserAuthorized` already
// falls back to the LIVE `user.selectedStoreId` when no storeId is passed
// (authorization-service.ts:35), so dropping the eager arg fixes it for free.
//
// Uses the REAL auth-store (not mocked) with `vi.resetModules()` + dynamic
// `import()` per test, mirroring loaders.cold-boot.test.ts — this is the only
// way to reproduce "module evaluated against stale state, then live state
// changes" since a mocked store can't distinguish import-time vs call-time reads.

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

function makeStoreUser(overrides: Partial<UserModel> = {}): UserModel {
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
    expiresIn: Date.now() + THIRTY_FIVE_DAYS_MS,
    roles: [{ storeId: 'B', storeName: 'Store B', moduleId: 1, featureIds: [EFeatures.Profile] }],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 'A',
    ...overrides,
  };
}

describe.each([
  { label: 'edit-profile', importPath: '../edit-profile' },
  { label: 'change-password', importPath: '../change-password' },
])('$label clientLoader — reads selectedStoreId LIVE, not at import time', ({ importPath }) => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('authorizes a store-user whose LIVE selectedStoreId (set AFTER module import) grants Profile, even though it was a different store at import time', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');

    // At import time, the user is at store 'A' (no Profile role there).
    useAuthStore.setState({
      user: makeStoreUser({ selectedStoreId: 'A' }),
      isAuthenticated: true,
    });

    const { clientLoader } = await import(importPath);

    // Live update AFTER the module (and its clientLoader closure) was created:
    // the user moves to store 'B', which DOES grant Profile.
    useAuthStore.setState((state) => ({
      user: state.user ? { ...state.user, selectedStoreId: 'B' } : state.user,
    }));

    const result = await clientLoader({
      params: {},
      request: new Request('http://x/'),
    } as never);

    expect(result).toBeNull();
  });

  it('denies a store-user whose LIVE selectedStoreId (set AFTER module import) lacks Profile, even though the import-time store granted it', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');

    // At import time, the user is at store 'B' (grants Profile).
    useAuthStore.setState({
      user: makeStoreUser({ selectedStoreId: 'B' }),
      isAuthenticated: true,
    });

    const { clientLoader } = await import(importPath);

    // Live update AFTER import: the user moves to store 'A', which has no
    // matching role/featureId for Profile.
    useAuthStore.setState((state) => ({
      user: state.user ? { ...state.user, selectedStoreId: 'A' } : state.user,
    }));

    const result = await clientLoader({
      params: {},
      request: new Request('http://x/'),
    } as never);

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.headers.get('Location')).toBe('/login');
  });
});
