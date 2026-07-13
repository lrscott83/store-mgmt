import { create } from 'zustand';
import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../storage/storage-keys';
import { StorageService } from '../auth/storage-service';

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

// Decision 2 (auth-service-parity, Slice 3): the store is framework-agnostic
// and never imports react-router directly (mirrors Angular DI-injecting
// Router into AuthService). Instead the router pushes its `navigate` fn in
// via this registration hook (see root.tsx App()).
let authRedirect: ((path: string) => void) | undefined;
export function registerAuthRedirect(fn: (path: string) => void): void {
  authRedirect = fn;
}

interface AuthState {
  user: UserModel | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: () => void;
  getUserByToken: () => Promise<UserModel | null>;
  setUser: (user: UserModel, token: string) => void;
  updateUser: (user: UserModel) => void;
  login: (email: string, password: string) => Promise<UserModel>;
  logout: () => void;
}

// Decision 4 (auth-service-parity, Slice 3): background revalidation reuses the
// STORED session expiry — it never recomputes a fresh 35-day stamp and never
// rewrites AUTH_MODEL. Only the cached profile (CURRENT_USER) + in-memory state
// are refreshed. Mirrors Angular auth.service.ts's validateToken (~line 200).
async function validateTokenWithServer(authToken: string, expiresIn: number): Promise<void> {
  try {
    const { authHttpService } = await import('../http/auth-http-service');
    const fresh = await authHttpService.getMe();
    const userWithExpiry: UserModel = { ...fresh, authToken, expiresIn, password: '' };
    StorageService.setCurrentUser(userWithExpiry);
    useAuthStore.setState({ user: userWithExpiry });
  } catch {
    // AUTH-03: background refresh must never surface errors.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initialize: () => {
    void get().getUserByToken();
  },

  // Decision 3 (auth-service-parity, Slice 3): ONE reusable action mirroring
  // Angular auth.service.ts's getUserByToken (~lines 129-186). Consumed by
  // initialize() and login() so the /me-fetch logic is no longer duplicated.
  getUserByToken: async (): Promise<UserModel | null> => {
    const raw = localStorage.getItem(StorageKeys.AUTH_MODEL);
    if (!raw) return null;

    let auth: { authToken?: string; expiresIn?: number };
    try {
      auth = JSON.parse(raw) as { authToken?: string; expiresIn?: number };
    } catch {
      localStorage.removeItem(StorageKeys.AUTH_MODEL);
      return null;
    }

    if (!auth.authToken || !auth.expiresIn) {
      // Malformed-but-parseable AUTH_MODEL — nothing to clear (Decision 3).
      return null;
    }

    if (auth.expiresIn <= Date.now()) {
      // Decision 4: inclusive boundary (Angular:143). Expired session routes
      // through logout() — AUTH_MODEL-only clear (Decision 1 parity).
      get().logout();
      return null;
    }

    // Cold-boot requirement: this branch must call set() BEFORE any await so
    // initialize() hydrates synchronously on module evaluation.
    const cachedProfile = StorageService.getCurrentUser();
    if (cachedProfile && cachedProfile.authToken === auth.authToken) {
      const userWithExpiry: UserModel = {
        ...cachedProfile,
        authToken: auth.authToken,
        expiresIn: auth.expiresIn,
      };
      set({ user: userWithExpiry, isAuthenticated: true, error: null });

      // AUTH-03: fire background revalidation if online — must NOT block
      // render or surface errors on failure.
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void validateTokenWithServer(auth.authToken, auth.expiresIn);
      }
      return userWithExpiry;
    }

    // No usable cache — synchronously hydrate a best-effort user from the SAME
    // localStorage read BEFORE any await (AUTH-03 REV2 cold-boot invariant),
    // mirroring the merge-with-empty-profile the old readStoredUser did. Then
    // enrich in the foreground (e.g. right after login()).
    const bestEffortUser: UserModel = {
      ...(cachedProfile ?? {}),
      authToken: auth.authToken,
      expiresIn: auth.expiresIn,
    } as UserModel;
    set({ user: bestEffortUser, isAuthenticated: true, error: null });

    try {
      const { authHttpService } = await import('../http/auth-http-service');
      const fresh = await authHttpService.getMe();
      const userWithExpiry: UserModel = {
        ...fresh,
        authToken: auth.authToken,
        expiresIn: auth.expiresIn,
        password: '',
      };
      StorageService.setCurrentUser(userWithExpiry);
      set({ user: userWithExpiry, isAuthenticated: true, error: null });
      return userWithExpiry;
    } catch {
      // Offline-resilient: retain the synchronously-hydrated user, never clear.
      return bestEffortUser;
    }
  },

  setUser: (user: UserModel, token: string) => {
    const expiresIn = Date.now() + THIRTY_FIVE_DAYS_MS;
    const userWithExpiry: UserModel = { ...user, expiresIn, password: '' };
    StorageService.setTokenToLocalStorage(token);
    StorageService.setCurrentUser(userWithExpiry);
    localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify({ authToken: token, expiresIn }));
    set({ user: userWithExpiry, isAuthenticated: true, error: null });
  },

  updateUser: (user: UserModel) => {
    set((state) => {
      // /v1/auth/me returns no expiresIn; preserve the current session expiry
      // (or stamp a fresh one) so a refresh-after-edit never logs the user out.
      const expiresIn =
        user.expiresIn || state.user?.expiresIn || Date.now() + THIRTY_FIVE_DAYS_MS;
      const updatedUser: UserModel = { ...user, expiresIn, password: '' };
      StorageService.setCurrentUser(updatedUser);
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: state.user?.authToken, expiresIn })
      );
      return { user: updatedUser };
    });
  },

  login: async (email: string, password: string): Promise<UserModel> => {
    set({ isLoading: true, error: null });
    try {
      const { authHttpService } = await import('../http/auth-http-service');
      const response = await authHttpService.login({ login: email, password });
      const authData = response.data;
      const expiresIn = Date.now() + THIRTY_FIVE_DAYS_MS;

      StorageService.setTokenToLocalStorage(authData.authToken);
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: authData.authToken, expiresIn })
      );

      // Decision 3: login() delegates the /me fetch + state hydration to the
      // same consolidated getUserByToken() action used by initialize().
      const user = await get().getUserByToken();
      if (!user) {
        throw new Error('AUTH: failed to load user after login');
      }
      set({ isLoading: false });
      return user;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    // Decision 1 (auth-service-parity, Slice 3): mirror Angular's logout() —
    // remove ONLY the AUTH_MODEL key. `token` and `currentUser` intentionally
    // stay stale (Angular 1:1 parity, not a bug).
    localStorage.removeItem(StorageKeys.AUTH_MODEL);
    set({ user: null, isAuthenticated: false, error: null });

    // Decision 2: conditional redirect (Angular auth.service.ts:83-98) — skip
    // when already on /login or / to avoid a redundant navigation loop.
    const pathname = window.location.pathname;
    if (pathname !== '/login' && pathname !== '/') {
      authRedirect?.('/login');
    }
  },
}));

// AUTH-03 cold-boot fix: hydrate synchronously the moment this module is
// first evaluated, so route loaders (`authLoader`, `featureLoader`, etc. —
// `app/auth/routes/loaders.ts`) that call `useAuthStore.getState()` on the
// very first render never observe the un-hydrated `{ user: null }` default.
// `initialize()` only reads/writes localStorage and calls `set()`
// synchronously (the AUTH-03 background `/me` refresh it may also kick off is
// fire-and-forget) — so by the time ANY importer's own top-level code runs,
// module evaluation of this file has already completed, which guarantees
// ordering regardless of how React Router schedules loaders (parallel vs
// sequential). This is the React port of Angular's `APP_INITIALIZER`
// (`app.module.ts` → `AppInitService.Init()` → `AuthService.getUserByToken()`).
//
// SSR-safe: this app runs in SPA mode (`ssr:false` in `react-router.config.ts`)
// so this file is only ever evaluated in the browser at runtime, but the
// `typeof window` guard also keeps it safe to import from any Node-side
// tooling (build-time module graph analysis, etc.) that never sees `window`.
if (typeof window !== 'undefined') {
  useAuthStore.getState().initialize();
}
