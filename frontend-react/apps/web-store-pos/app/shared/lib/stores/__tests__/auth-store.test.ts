import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore, registerAuthRedirect } from '../auth-store';
import { StorageKeys } from '../../storage/storage-keys';
import { getDek, setDek, clearDek } from '../../storage/data-key-store';
import { writeDeviceDekTable } from '../../storage/device-dek-table';
import { wrapDekWithPassword } from '../../offline/dek-unwrap';
import { authHttpService } from '../../http/auth-http-service';
import { allowUnmockedHttpReporting } from '../../testing/block-real-http';
import type { UserModel } from '@store-mgmt/domain';

// `initialize()` is fire-and-forget by design, and several tests below call it
// (or `getUserByToken()`) without awaiting, on purpose — they pin the
// SYNCHRONOUS hydration. Their foreground /me tail therefore outlives them and
// lands in whatever test is running when it resolves. Unmocked, that tail
// reached the network: with no backend under vitest, Vite's middleware answered
// 404, which this app correctly reads as a session verdict (the backend returns
// 404 for AccountInactive), so the store logged itself out in the middle of an
// unrelated test. That is what made (h) fail roughly one run in four while
// passing every time this file ran alone.
//
// The `vi.spyOn` in `beforeEach` neutralizes that tail for every test holding
// the module singleton. It cannot cover the three tests that `vi.resetModules()`
// and re-import a fresh store: those build a fresh `authHttpService` object the
// spy never saw. Mocking the module instead of the object does not fix it
// either — those same tests mock `api-client` one layer underneath, and a
// module-level mock pins its own `importOriginal` copy of that chain, serving
// them a stale `api-client`.
//
// So one tail still escapes, and it lands in whichever test runs when it
// resolves — never the one that created it. `block-real-http` still BLOCKS it
// (which is what kept the 404 verdict out), and this file opts out of the
// per-test report it cannot attribute. Every other file keeps the report.

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

/**
 * The minimum key material a device needs for `login()` to get past
 * `resolveDekForLogin` now that design D2 has removed the Q2 mint: this
 * login's own password wrap in the device table, which step 3a recovers.
 */
async function seedDeviceDekTableFor(login: string, password: string): Promise<void> {
  writeDeviceDekTable({
    formatVersion: 1,
    dekSource: 'local',
    storeId: 's1',
    device: null,
    users: { [login]: await wrapDekWithPassword(password, new Uint8Array(32).fill(0x66)) },
  });
}

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    fullName: 'Test User',
    email: 'test@example.com',
    cellPhone: '',
    isActive: true,
    password: '',
    login: 'test@example.com',
    authToken: 'token123',
    refreshToken: 'refresh123',
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

allowUnmockedHttpReporting();

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    vi.spyOn(authHttpService, 'getMe').mockRejectedValue(new Error('no backend under vitest'));
  });

  describe('AUTH-03: Valid token on startup', () => {
    it('restores session when a valid non-expired user is in localStorage', () => {
      const user = makeUser();
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));

      useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('u1');
    });
  });

  describe('AUTH-03: Expired token on startup', () => {
    it('clears session via getUserByToken -> logout (AUTH_MODEL-only, Decision 1+3 parity)', () => {
      const user = makeUser({ expiresIn: Date.now() - 1000 });
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.TOKEN, user.authToken as string);
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));

      useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
      // Decision 1 parity: the expired branch now routes through logout(), which
      // clears ONLY AUTH_MODEL — TOKEN and CURRENT_USER intentionally survive.
      expect(localStorage.getItem(StorageKeys.TOKEN)).toBe(user.authToken);
      expect(localStorage.getItem(StorageKeys.CURRENT_USER)).toBe(JSON.stringify(user));
    });
  });

  describe('AUTH-03: Corrupted JSON in localStorage', () => {
    it('clears corrupted key and sets unauthenticated state without throwing', () => {
      localStorage.setItem(StorageKeys.AUTH_MODEL, '{invalid json{{');

      expect(() => useAuthStore.getState().initialize()).not.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
    });
  });

  describe('setUser', () => {
    it('stores user and token and sets isAuthenticated', () => {
      const user = makeUser();
      useAuthStore.getState().setUser(user, 'mytoken');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('u1');
      expect(localStorage.getItem(StorageKeys.TOKEN)).toBe('mytoken');
    });

    it('overrides expiresIn to 35 days from now', () => {
      const before = Date.now();
      const user = makeUser({ expiresIn: 0 });
      useAuthStore.getState().setUser(user, 'tok');

      const stored = JSON.parse(localStorage.getItem(StorageKeys.AUTH_MODEL)!);
      expect(stored.expiresIn).toBeGreaterThan(before + THIRTY_FIVE_DAYS_MS - 1000);
    });
  });

  // AUTH-ERR-PARITY: mirror Angular auth.service.ts:60-70. The login endpoint
  // always returns HTTP 200 (AuthController wraps in Ok()), so a failed login is
  // a `succeeded:false` body — login() must surface errors[0].description, not
  // blindly read response.data.
  describe('login — succeeded:false envelope (Angular INVALID_ERROR parity)', () => {
    it('throws an error tagged with errors[0].description when the envelope has succeeded:false', async () => {
      vi.resetModules();
      const mockPost = vi.fn().mockResolvedValue({
        data: {
          data: null,
          succeeded: false,
          message: '',
          actionCode: 400,
          errors: [{ code: 'Auth', description: 'usuario o contraseña incorrecta' }],
        },
      });
      vi.doMock('~/shared/lib/http/api-client', () => ({
        apiClient: {
          post: mockPost,
          get: vi.fn(),
          interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
        },
      }));

      const { useAuthStore: freshStore } = await import('../auth-store');

      await expect(
        freshStore.getState().login('a@b.com', 'password123')
      ).rejects.toMatchObject({
        loginRejectionDescription: 'usuario o contraseña incorrecta',
      });

      vi.doUnmock('~/shared/lib/http/api-client');
    });

    // The path the backend actually takes for a wrong password:
    // LoginCommand.MapErrorToStatusCode maps Auth.InvalidCredentials to 401, so
    // the envelope arrives as an axios rejection instead of a resolved body. The
    // description must still reach login.tsx, or the user sees a static message
    // where Angular showed the server's own text.
    it('throws an error tagged with errors[0].description when the envelope arrives as a 401', async () => {
      vi.resetModules();
      const mockPost = vi.fn().mockRejectedValue({
        response: {
          status: 401,
          data: {
            data: null,
            succeeded: false,
            message: '',
            actionCode: 401,
            errors: [{ code: 'Auth.InvalidCredentials', description: 'usuario o contraseña incorrecta' }],
          },
        },
      });
      vi.doMock('~/shared/lib/http/api-client', () => ({
        apiClient: {
          post: mockPost,
          get: vi.fn(),
          interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
        },
      }));

      const { useAuthStore: freshStore } = await import('../auth-store');

      await expect(
        freshStore.getState().login('a@b.com', 'password123')
      ).rejects.toMatchObject({
        loginRejectionDescription: 'usuario o contraseña incorrecta',
      });

      vi.doUnmock('~/shared/lib/http/api-client');
    });

    // The narrowing is load-bearing: 403 and 429 carry an envelope too, but
    // their messages are UI copy the app owns (ACCOUNT_INACTIVE,
    // TOO_MANY_ATTEMPTS). Tagging them would replace that copy with server text.
    it('does NOT tag a 403 rejection, leaving login.tsx its own ACCOUNT_INACTIVE copy', async () => {
      vi.resetModules();
      const mockPost = vi.fn().mockRejectedValue({
        response: {
          status: 403,
          data: {
            data: null,
            succeeded: false,
            message: '',
            actionCode: 403,
            errors: [{ code: 'Store.Inactive', description: 'la tienda no está activa' }],
          },
        },
      });
      vi.doMock('~/shared/lib/http/api-client', () => ({
        apiClient: {
          post: mockPost,
          get: vi.fn(),
          interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
        },
      }));

      const { useAuthStore: freshStore } = await import('../auth-store');

      const rejection = await freshStore
        .getState()
        .login('a@b.com', 'password123')
        .then(
          () => undefined,
          (err: unknown) => err
        );

      expect((rejection as { loginRejectionDescription?: string }).loginRejectionDescription)
        .toBeUndefined();
      expect((rejection as { response?: { status?: number } }).response?.status).toBe(403);

      vi.doUnmock('~/shared/lib/http/api-client');
    });
  });

  describe('logout', () => {
    it('clears the auth model and resets in-memory state', () => {
      const user = makeUser();
      useAuthStore.getState().setUser(user, 'tok');
      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
    });
  });

  // design §11 (dek-lifecycle-and-unlock-gate, WU11.2): "Logout clears the DEK".
  describe('logout — clears the in-memory DEK (design §11)', () => {
    afterEach(() => clearDek());

    it('leaves getDek() null after logout when a DEK was set', () => {
      setDek(new Uint8Array(32), 's1');
      expect(getDek()).not.toBeNull();

      useAuthStore.getState().logout();

      expect(getDek()).toBeNull();
    });
  });

  describe('logout — AUTH_MODEL-only clear (Decision 1)', () => {
    it('removes only AUTH_MODEL; token and currentUser survive (Angular parity)', () => {
      const user = makeUser();
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.TOKEN, user.authToken as string);
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));

      useAuthStore.getState().logout();

      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
      expect(localStorage.getItem(StorageKeys.TOKEN)).toBe(user.authToken);
      expect(localStorage.getItem(StorageKeys.CURRENT_USER)).toBe(JSON.stringify(user));
    });
  });

  describe('logout — conditional redirect (Decision 2)', () => {
    afterEach(() => {
      window.history.pushState({}, '', '/');
      registerAuthRedirect(() => undefined);
    });

    it('redirects to /login when invoked from an authenticated route', () => {
      window.history.pushState({}, '', '/sales');
      const spy = vi.fn();
      registerAuthRedirect(spy);

      useAuthStore.getState().logout();

      expect(spy).toHaveBeenCalledWith('/login');
    });

    it('does NOT redirect when already on /login', () => {
      window.history.pushState({}, '', '/login');
      const spy = vi.fn();
      registerAuthRedirect(spy);

      useAuthStore.getState().logout();

      expect(spy).not.toHaveBeenCalled();
    });

    it('does NOT redirect when already on / (root)', () => {
      window.history.pushState({}, '', '/');
      const spy = vi.fn();
      registerAuthRedirect(spy);

      useAuthStore.getState().logout();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('updateUser — STORE-1 through STORE-4, S-STORE-1', () => {
    it('writes minimal auth model (authToken, expiresIn only) to StorageKeys.AUTH_MODEL', () => {
      const user = makeUser({ fullName: 'Original Name' });
      useAuthStore.setState({ user, isAuthenticated: true });

      const updatedUser = makeUser({ fullName: 'María García', password: '' });
      useAuthStore.getState().updateUser(updatedUser);

      const stored = JSON.parse(localStorage.getItem(StorageKeys.AUTH_MODEL)!);
      expect(stored.fullName).toBeUndefined();
      expect(stored.authToken).toBe(user.authToken);
      expect(stored.expiresIn).toBeDefined();
    });

    it('writes updated user to StorageKeys.CURRENT_USER', () => {
      const user = makeUser({ fullName: 'Original Name' });
      useAuthStore.setState({ user, isAuthenticated: true });

      const updatedUser = makeUser({ fullName: 'María García', password: '' });
      useAuthStore.getState().updateUser(updatedUser);

      const currentUser = JSON.parse(localStorage.getItem(StorageKeys.CURRENT_USER)!);
      expect(currentUser.fullName).toBe('María García');
    });

    it('updates Zustand state.user with the new user', () => {
      const user = makeUser({ fullName: 'Original Name' });
      useAuthStore.setState({ user, isAuthenticated: true });

      const updatedUser = makeUser({ fullName: 'María García' });
      useAuthStore.getState().updateUser(updatedUser);

      expect(useAuthStore.getState().user?.fullName).toBe('María García');
    });

    it('forces password to empty string in stored currentUser profile', () => {
      const user = makeUser({ password: 'somepass' });
      useAuthStore.setState({ user, isAuthenticated: true });

      const updatedUser = makeUser({ password: 'ShouldBeCleared' });
      useAuthStore.getState().updateUser(updatedUser);

      const stored = JSON.parse(localStorage.getItem(StorageKeys.CURRENT_USER)!);
      expect(stored.password).toBe('');
      expect(useAuthStore.getState().user?.password).toBe('');
    });

    it('does NOT mutate isAuthenticated, isLoading, or error', () => {
      const user = makeUser();
      useAuthStore.setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      useAuthStore.getState().updateUser(makeUser({ fullName: 'New Name' }));

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('keeps a valid session expiry when the updated user has no expiresIn (e.g. from /me)', () => {
      // /v1/auth/me returns a profile UserModel without expiresIn; updateUser
      // must not wipe the session expiry or the next reload would log the user out.
      const sessionExpiry = Date.now() + THIRTY_FIVE_DAYS_MS;
      const user = makeUser({ expiresIn: sessionExpiry });
      useAuthStore.setState({ user, isAuthenticated: true });

      const { expiresIn: _omit, ...fromMe } = makeUser({ fullName: 'Refreshed' });
      useAuthStore.getState().updateUser(fromMe as UserModel);

      const storedProfile = JSON.parse(localStorage.getItem(StorageKeys.CURRENT_USER)!);
      expect(storedProfile.fullName).toBe('Refreshed');

      const storedAuthModel = JSON.parse(localStorage.getItem(StorageKeys.AUTH_MODEL)!);
      expect(storedAuthModel.expiresIn).toBe(sessionExpiry);
    });
  });

  describe('AUTH-03: cached session on startup (offline-first, no backend call)', () => {
    it('hydrates synchronously from cache when online — state set immediately', () => {
      const user = makeUser();
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));
      localStorage.setItem(StorageKeys.TOKEN, 'token123');
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('u1');
    });

    it('hydrates from cache when offline without throwing', () => {
      const user = makeUser();
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));
      localStorage.setItem(StorageKeys.TOKEN, 'token123');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      expect(() => useAuthStore.getState().initialize()).not.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true); // authenticated from cache
    });
  });

  // OFFLINE-FIRST: a valid cached session must never touch the backend on
  // startup. The previous background /me revalidation issued GET /auth/me, whose
  // 401 was turned into a global logout() by the shared HTTP error interceptor
  // (api-client.ts) — destroying the local session and breaking offline use.
  describe('OFFLINE-FIRST: cached session makes no backend call on startup', () => {
    it('does NOT call authHttpService.getMe when a valid cached session exists (online)', async () => {
      vi.resetModules();
      const mockGetMe = vi.fn().mockResolvedValue(makeUser({ fullName: 'FromServer' }));
      vi.doMock('~/shared/lib/http/auth-http-service', () => ({
        authHttpService: { getMe: mockGetMe },
      }));
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      const user = makeUser();
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));

      const { useAuthStore: freshStore } = await import('../auth-store');
      await freshStore.getState().getUserByToken();
      // Flush any fire-and-forget background work so a stray call would surface.
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      expect(mockGetMe).not.toHaveBeenCalled();
      expect(freshStore.getState().isAuthenticated).toBe(true);
      expect(freshStore.getState().user?.id).toBe('u1');

      vi.doUnmock('~/shared/lib/http/auth-http-service');
    });
  });

  describe('getUserByToken — consolidated (Decision 3+4)', () => {
    it('(a) returns null and does NOT clear storage when AUTH_MODEL is missing token/expiry', async () => {
      localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify({}));

      const result = await useAuthStore.getState().getUserByToken();

      expect(result).toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).not.toBeNull();
    });

    it('(b) expiresIn <= now calls logout() and returns null (inclusive boundary)', async () => {
      const user = makeUser({ expiresIn: Date.now() });
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));

      const result = await useAuthStore.getState().getUserByToken();

      expect(result).toBeNull();
      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('(c) expiresIn > now returns the cached valid user', async () => {
      const user = makeUser({ expiresIn: Date.now() + THIRTY_FIVE_DAYS_MS });
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));

      const result = await useAuthStore.getState().getUserByToken();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('u1');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('(d) cached path sets user synchronously before any await (cold-boot)', () => {
      const user = makeUser();
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );
      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      // Deliberately NOT awaited — state must already be set before this line returns.
      void useAuthStore.getState().getUserByToken();

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.id).toBe('u1');
    });

    it('(g) no-cache branch sets user synchronously before any await (cold-boot, AUTH-03 REV2)', () => {
      const user = makeUser();
      // AUTH_MODEL present, but CURRENT_USER cache absent/mismatched — the
      // "no usable cache" branch. Must still hydrate synchronously.
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );

      // Deliberately NOT awaited — state must already be set before this line
      // returns. The /me tail this leaves behind is neutralized by the
      // file-level `vi.doMock` in `beforeEach`.
      void useAuthStore.getState().getUserByToken();

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.authToken).toBe(user.authToken);
    });

    it('(h) no-cache branch retains the synchronously-hydrated user when the foreground /me fetch fails', async () => {
      const user = makeUser();
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: user.authToken, expiresIn: user.expiresIn })
      );

      vi.doMock('~/shared/lib/http/auth-http-service', () => ({
        authHttpService: {
          getMe: vi.fn().mockRejectedValue(new Error('offline')),
        },
      }));

      await useAuthStore.getState().getUserByToken();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.authToken).toBe(user.authToken);
    });

    it('(f) initialize() and login() both invoke the same getUserByToken action', async () => {
      const fakeUser = makeUser();
      const spy = vi.fn().mockResolvedValue(fakeUser);
      useAuthStore.setState({ getUserByToken: spy });

      // SETUP RESEEDED (design D2 removed the Q2 mint). This test is about
      // action wiring and mentions no key at all, but `login()` now runs
      // `resolveDekForLogin`, which refuses on a device holding no key
      // material. This is the smallest seed that gets past it.
      //
      // It is a device table and NOT a one-line `setDek(...)`, which would be
      // smaller but racy: the in-memory DEK is cleared by `logout()`
      // (`auth-store.ts:352`), and per this file's own header comment one
      // `initialize()`/`getUserByToken()` tail escapes and "lands in whichever
      // test runs when it resolves". A seed living in localStorage is immune
      // to that — `logout()` never touches the device table, so step 3a
      // re-derives the key no matter when the stray tail fires. Measured, not
      // assumed: with `setDek` this test failed, and passed only when extra
      // awaits happened to reorder the tail.
      await seedDeviceDekTableFor(fakeUser.login, 'pw');

      useAuthStore.getState().initialize();
      expect(spy).toHaveBeenCalledTimes(1);

      vi.doMock('~/shared/lib/http/auth-http-service', () => ({
        authHttpService: {
          login: vi.fn().mockResolvedValue({
            data: { authToken: 'tok', refreshToken: 'r', expiresIn: Date.now() + THIRTY_FIVE_DAYS_MS },
            succeeded: true,
            message: '',
            actionCode: 200,
            errors: [],
          }),
        },
      }));

      const result = await useAuthStore.getState().login('a@b.com', 'pw');

      expect(spy).toHaveBeenCalledTimes(2);
      expect(result).toBe(fakeUser);
    });
  });
});
