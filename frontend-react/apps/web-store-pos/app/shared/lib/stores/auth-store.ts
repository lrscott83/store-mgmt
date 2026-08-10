import { create } from 'zustand';
import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../storage/storage-keys';
import { StorageService } from '../auth/storage-service';
// Design D6 / §2: `data-key-store.ts` is a genuine zero-import leaf under
// `storage/`, NOT `offline/` — a STATIC import here is legal by
// construction. `logout()` is synchronous and must call `clearDek()`
// synchronously, so a dynamic import is not an option for that call site.
import { setDek, clearDek } from '../storage/data-key-store';
// Static, and NOT from `auth-http-service`: tests mock that module, and Vitest
// throws on a named export a mock factory omits. `getUserByToken` imports the
// service dynamically inside a try, so such a throw is swallowed as if it were
// a network failure — silently degrading the user instead of failing loudly.
import { SessionRejectedError } from '../http/session-rejected-error';

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

// Decision 2 (auth-service-parity, Slice 3): the store is framework-agnostic
// and never imports react-router directly (mirrors Angular DI-injecting
// Router into AuthService). Instead the router pushes its `navigate` fn in
// via this registration hook (see root.tsx App()).
let authRedirect: ((path: string) => void) | undefined;
export function registerAuthRedirect(fn: (path: string) => void): void {
  authRedirect = fn;
}

/**
 * Did the server pass judgement on this session, or did it just fail to answer?
 *
 * Only the first ends the session. 401 and 404 are verdicts — 404 is the code
 * `GetMeQuery` passes for both `NotFound` and `AccountInactive`. Everything
 * else, including 5xx and a bare network error, is the server being broken or
 * absent, which must leave an offline user signed in.
 *
 * Matched on `name` rather than `instanceof`: `auth-http-service` is imported
 * dynamically here, so the class identity a caller sees is not guaranteed to be
 * the one this module would close over.
 */
function isSessionRejection(err: unknown): boolean {
  if ((err as { name?: string } | null)?.name === 'SessionRejectedError') {
    return true;
  }
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 404;
}

/**
 * The server's own words for a rejected login, or undefined if this error is
 * not that.
 *
 * A wrong password comes back as HTTP 401 carrying the ordinary response
 * envelope — `LoginCommand.MapErrorToStatusCode` maps `Auth.InvalidCredentials`
 * to Unauthorized, while the body keeps the same shape a `succeeded:false`
 * response would have. Angular surfaces `errors[0].description` verbatim
 * (auth.service.ts:60-70), and this is what lets `login()` do the same instead
 * of falling through to a static message.
 *
 * Deliberately narrow. 403 and 429 also carry an envelope, but their messages
 * are UI copy the app owns (ACCOUNT_INACTIVE, TOO_MANY_ATTEMPTS), not server
 * text to be repeated.
 */
function invalidCredentialsDescription(err: unknown): string | undefined {
  const response = (err as { response?: { status?: number; data?: unknown } } | null)?.response;
  if (response?.status !== 401) return undefined;

  const errors = (response.data as { errors?: Array<{ description?: string }> } | null)?.errors;
  const description = errors?.[0]?.description;
  return typeof description === 'string' && description.length > 0 ? description : undefined;
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
  // First argument is the LOGIN — the username credential, not an email
  // address. See docs/contracts/login-is-not-email.md.
  login: (login: string, password: string) => Promise<UserModel>;
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
      // Belt and braces: getMe already throws SessionRejectedError on a
      // succeeded:false envelope, so `fresh` cannot be nullish here. Spreading
      // a null would NOT throw — `{...null}` is `{}` — so the old code wrote a
      // user with no id, no login and no roles over the cached profile and
      // stayed authenticated. Never let that shape be constructed again.
      if (!fresh) {
        throw new SessionRejectedError();
      }
      const userWithExpiry: UserModel = {
        ...fresh,
        authToken: auth.authToken,
        expiresIn: auth.expiresIn,
        password: '',
      };
      StorageService.setCurrentUser(userWithExpiry);
      set({ user: userWithExpiry, isAuthenticated: true, error: null });
      return userWithExpiry;
    } catch (err: unknown) {
      // Two failures wearing the same coat, and they need opposite answers.
      //
      // "I could not reach anyone" (no network, DNS, timeout, or a 5xx — the
      // server is broken, not deciding) must retain the synchronously-hydrated
      // user. That is what this catch was written for and it must not regress:
      // clearing here breaks offline use, which is the whole product.
      //
      // "The server answered, and the answer is that this session is over"
      // (a succeeded:false envelope, a 401, a 404 — the status GetMeQuery
      // already passes for AccountInactive) is a verdict. A deactivated user
      // whose token the backend just blacklisted must not stay signed in.
      if (isSessionRejection(err)) {
        get().logout();
        return null;
      }
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

  login: async (login: string, password: string): Promise<UserModel> => {
    set({ isLoading: true, error: null });
    try {
      const { authHttpService } = await import('../http/auth-http-service');
      let response;
      try {
        response = await authHttpService.login({ login, password });
      } catch (err: unknown) {
        // The backend answers invalid credentials with HTTP 401, not with a
        // 200 + `succeeded:false` body: LoginCommand.MapErrorToStatusCode maps
        // Auth.InvalidCredentials to Unauthorized. The envelope is the same
        // either way, so errors[0].description is there to be read.
        //
        // Without this, the axios rejection skipped the block below and landed
        // on login.tsx's generic status branch, showing a static message where
        // Angular showed the server's own text (auth.service.ts:60-70). Scoped
        // to 401 on purpose: 403 keeps its ACCOUNT_INACTIVE message and 429 its
        // TOO_MANY_ATTEMPTS one, which are UI copy, not server text.
        const description = invalidCredentialsDescription(err);
        if (description) {
          const rejection = new Error(description) as Error & {
            loginRejectionDescription?: string;
          };
          rejection.loginRejectionDescription = description;
          throw rejection;
        }
        throw err;
      }

      // Mirror Angular auth.service.ts:60-70: a login the handler rejects at the
      // body level arrives as HTTP 200 with a `succeeded:false` envelope — so a failed login —
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

      // device-wrapped-dek design §5 (dek-provisioning, D4/D6): resolve
      // THIS DEVICE's DEK for this login — an existing device DEK, else
      // this login's own roster wrap, else a freshly minted local DEK
      // (Q2). Dynamic import (D6): `dek-provisioning` is an `offline/`
      // module and this file is evaluated on every page load.
      // NOT wrapped in a swallowing try/catch — a DekUnwrapError here (the
      // step 3b hard-fail: no device table yet, and this login's roster
      // wrap fails to unwrap with the password just used) MUST fail this
      // login call, never be swallowed. Swallowing it would authenticate
      // the user with `needsUnlock` permanently true, looping authLoader
      // -> /login -> "successful" login -> authLoader. `resolveDekForLogin`
      // also runs the eager entity migration pass itself (design §5 step
      // 6), so the old direct call here is gone.
      const { resolveDekForLogin } = await import('../offline/dek-provisioning');
      await resolveDekForLogin({ login: user.login, password, sessionStoreId: user.selectedStoreId });

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
      // device-wrapped-dek design §5 (D4): resolve THIS DEVICE's DEK for
      // this login, same as the online path — an existing device DEK,
      // else this login's own roster wrap, else a freshly minted local
      // DEK (Q2). `authenticateOffline` itself is UNTOUCHED (D4) and may
      // already have set a DEK for a v2-roster login with wrap fields;
      // `resolveDekForLogin` accounts for that (structural note 1) and is
      // idempotent either way. Not swallowed, same rationale as the
      // online path above.
      const { resolveDekForLogin } = await import('../offline/dek-provisioning');
      await resolveDekForLogin({ login: user.login, password, sessionStoreId: user.selectedStoreId });
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
