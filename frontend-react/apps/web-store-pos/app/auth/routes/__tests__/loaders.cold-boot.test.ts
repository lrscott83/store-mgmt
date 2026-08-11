import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import type { UserModel } from '@store-mgmt/domain';

// AUTH-03 x AUTH-04 integration: proves the REAL auth-store hydrates itself
// from localStorage before ANY route loader ever calls `useAuthStore.getState()`.
// Unlike `loaders.test.ts` (which mocks the store entirely to unit-test
// authorization branches), this file uses the real store to catch the
// "cold boot never restores the session" regression that a mocked store
// cannot detect. `vi.resetModules()` + dynamic `import()` per test forces a
// fresh module graph each time, so the store's module-scope hydration side
// effect runs AFTER we seed localStorage — reproducing a true cold page load.

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

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
    expiresIn: Date.now() + THIRTY_FIVE_DAYS_MS,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

describe('Cold-boot session restoration (real auth-store + authLoader)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    // Neutralize the AUTH-03 foreground /me fetch during these loader-focused
    // assertions — it is already covered by auth-store.test.ts.
    //
    // This used to set `navigator.onLine = false`, which neutralized nothing:
    // neither auth-store nor auth-http-service nor api-client reads that flag,
    // so the request went out anyway. With no backend under vitest, Vite's own
    // middleware answered 404 — the exact status the app treats as a session
    // verdict (the backend returns 404 for AccountInactive), so the store
    // logged itself out and the loader below saw a guest. A rejected getMe is
    // the honest stand-in for "no backend": the store's catch retains the
    // synchronously-hydrated user, which is precisely what cold boot must do.
    vi.doMock('~/shared/lib/http/auth-http-service', () => ({
      authHttpService: {
        getMe: vi.fn().mockRejectedValue(new Error('no backend under vitest')),
      },
    }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('does NOT redirect to /login when a valid, unexpired user is in localStorage on cold boot', async () => {
    const user = makeUser();
    localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify(user));

    const { authLoader } = await import('../loaders');
    const result = await authLoader();

    expect(result).toBeNull();
  });

  it('logs out and redirects to /login when the stored user is expired', async () => {
    const user = makeUser({ expiresIn: Date.now() - 1000 });
    localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify(user));

    const { authLoader } = await import('../loaders');
    const result = await authLoader();

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/login');
    // Expired session must actually be cleared from storage too.
    expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
  });

  it('redirects to /login when there is no stored user at all', async () => {
    const { authLoader } = await import('../loaders');
    const result = await authLoader();

    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.headers.get('Location')).toBe('/login');
  });
});
