import { create } from 'zustand';
import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../storage/storage-keys';
import { StorageService } from '../auth/storage-service';
// Design D6 / §2: `data-key-store.ts` is a genuine zero-import leaf under
// `storage/`, NOT `offline/` — a STATIC import here is legal by
// construction. `logout()` is synchronous and must call `clearDek()`
// synchronously, so a dynamic import is not an option for that call site.
import { setDek, clearDek } from '../storage/data-key-store';

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
  loginOffline: (login: string, password: string) => Promise<UserModel>;
  logout: () => void;
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
      // OFFLINE-FIRST: a valid cached session is authoritative on startup — make
      // NO backend call. Angular fires a background /me here (auth.service.ts:159),
      // but that /me's 401 is turned into a session-destroying logout() by the
      // shared HTTP error interceptor (api-client.ts / Angular error-interceptor
      // .service.ts:62), which breaks offline use — so the revalidation is removed.
      set({ user: userWithExpiry, isAuthenticated: true, error: null });
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

      // Mirror Angular auth.service.ts:60-70: the login endpoint always returns
      // HTTP 200 (AuthController wraps every result in Ok()), so a failed login —
      // e.g. wrong credentials, where LoginCommandHandler returns
      // ResponseResult.Failure — arrives as a `succeeded:false` body carrying the
      // backend message in errors[0].description. Angular surfaces that exact text
      // via its INVALID_ERROR path; we rethrow it tagged so login.tsx can too,
      // instead of blindly reading response.data (null here) and falling through
      // to a generic error.
      if (!response.succeeded) {
        const description =
          response.errors && response.errors.length > 0
            ? response.errors[0].description
            : 'El usuario no pudo entrar porque el nombre de usuario o la contraseña no es correcta';
        const rejection = new Error(description) as Error & {
          loginRejectionDescription?: string;
        };
        rejection.loginRejectionDescription = description;
        throw rejection;
      }

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

      // design §11 (dek-lifecycle-and-unlock-gate, WU11 — first behavior
      // change): unwrap + set the DEK when this login has a v2 roster entry.
      // Dynamic imports (D6): `roster-store`/`dek-unwrap` are `offline/`
      // modules and this file is evaluated on every page load.
      // NOT wrapped in a swallowing try/catch — a DekUnwrapError here (wrong
      // password relative to the roster's wrap, parameter drift, tampered
      // bundle) MUST fail this login call, never be swallowed. Swallowing it
      // would authenticate the user with `needsUnlock` permanently true,
      // looping authLoader -> /login -> "successful" login -> authLoader.
      // No roster entry for this login, or a device not
      // encryption-provisioned, skips the unwrap entirely: no error, DEK
      // stays null (the online-auth-only majority case).
      const { getRawRoster } = await import('../offline/roster-store');
      const bundle = getRawRoster();
      const entry = bundle?.users.find((u) => u.login === user.login);
      if (entry?.wrappedDek && entry.wrapSalt && entry.wrapIv) {
        const { unwrapDek } = await import('../offline/dek-unwrap');
        const dek = await unwrapDek(password, {
          wrappedDek: entry.wrappedDek,
          wrapSalt: entry.wrapSalt,
          wrapIv: entry.wrapIv,
        });
        setDek(dek, bundle!.storeId);
      }

      set({ isLoading: false });
      return user;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  // Design D6 (offline-auth-frontend): dynamic import keeps this file at
  // ZERO static `offline/` imports — auth-store.ts is evaluated at module
  // load by everything (see the cold-boot note at the bottom of this file),
  // so a static import here would drag crypto + localStorage offline
  // modules into every page load, authenticated or not.
  loginOffline: async (login: string, password: string): Promise<UserModel> => {
    set({ isLoading: true, error: null });
    try {
      const { authenticateOffline } = await import('../offline/offline-auth-service');
      const user = await authenticateOffline(login, password);
      // The ONE hydration seam (auth-session spec: "loginOffline hydrates
      // through the existing setUser seam") — writes TOKEN/CURRENT_USER/
      // AUTH_MODEL exactly like online login().
      get().setUser(user, user.authToken);
      set({ isLoading: false });
      // Return the hydrated `get().user`, not the raw `user` — setUser()
      // stamps a fresh `expiresIn` and blanks `password`, so the returned
      // shape matches what online login() returns.
      return get().user as UserModel;
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
    // design §11: release the in-memory DEK on every logout, including the
    // offline idle-lock's 1h-inactivity call (app-layout.tsx's
    // `useAuthStore.getState().logout()`) — that call site needed no
    // separate wiring, it already routes through this same action.
    clearDek();
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
