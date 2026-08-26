import { create } from 'zustand';
import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../storage/storage-keys';
import { StorageService } from '../auth/storage-service';
// Design D6 / §2: `data-key-store.ts` is a genuine zero-import leaf under
// `storage/`, NOT `offline/` — a STATIC import here is legal by
// construction. `logout()` is synchronous and must call `clearDek()`
// synchronously, so a dynamic import is not an option for that call site.
import { clearDek } from '../storage/data-key-store';
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
 * Will a `logout()` right now actually navigate the user somewhere?
 *
 * Two ways it will not. The redirect is skipped when we are already on `/login`
 * or `/` (Decision 2, below), and `authRedirect` is undefined until `App()`'s
 * effect registers it — which has NOT happened yet during the first render, so
 * a root-level throw on cold boot logs the user out and moves them nowhere.
 *
 * Exported because a caller that hides the UI on the assumption that a redirect
 * follows (root.tsx's ErrorBoundary) would otherwise leave a blank page with no
 * route to the recovery screens. This is the single source of truth for that
 * question: `logout()` below branches on the same function, so the two can
 * never disagree.
 */
export function willLogoutRedirect(): boolean {
  if (authRedirect === undefined) return false;
  const pathname = window.location.pathname;
  return pathname !== '/login' && pathname !== '/';
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
      // H-3 fix: use the server's expiresIn (ISO-8601 DateTime string from
      // AuthDto.cs) instead of hardcoding THIRTY_FIVE_DAYS_MS. The server
      // returns ExpiresIn as a DateTime which axios deserializes as a string.
      // Parse it to epoch ms; fall back to THIRTY_FIVE_DAYS_MS if missing.
      const serverExpiresIn = authData.expiresIn
        ? new Date(authData.expiresIn as unknown as string).getTime()
        : undefined;
      const expiresIn = serverExpiresIn && !isNaN(serverExpiresIn)
        ? serverExpiresIn
        : Date.now() + THIRTY_FIVE_DAYS_MS;

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
      // the wrap THIS response carried (design D1 source 3: `AuthDto` ships
      // the store's key wrapped under the user's password, byte-compatible
      // with the roster's, which is what lets a brand-new device with no
      // roster sign in at all), else this login's roster wrap. There is no further
      // fallback: design D2 removed the Q2 local mint, because only the SERVER
      // can re-derive a store's key and data written under an invented one is
      // recoverable by nobody. The three fields are forwarded exactly as
      // received — empty strings are the contract's "no wrap available" signal
      // and the resolver reads them as absent.
      //
      // SKIP for users without an assigned store (SuperAdmin / Reseller): the
      // DEK is per-store encryption material; a user with no store (selectedStoreId
      // is the empty GUID) has no wrap, no roster entry, and no device table —
      // attempting resolution would always hit the F5 dead end and throw
      // DekUnwrapError, blocking login for a user who doesn't need data encryption.
      const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';
      if (user.selectedStoreId && user.selectedStoreId !== EMPTY_GUID) {
        const { resolveDekForLogin } = await import('../offline/dek-provisioning');
        await resolveDekForLogin({
          login: user.login,
          password,
          sessionStoreId: user.selectedStoreId,
          wrappedDek: authData.wrappedDek,
          wrapSalt: authData.wrapSalt,
          wrapIv: authData.wrapIv,
        });
      }

      // Task 4: a login that RESOLVED a key is the one event meaning "this
      // device can read again", so it re-arms the decryption-failure policy's
      // latch. Placed after `resolveDekForLogin` on purpose — a login that
      // rejects proves nothing and must leave the latch alone, or one
      // unreadable store produces a dialog per retry.
      //
      // Dynamic import for the same reason as the line above (D6) plus one
      // more: `decryption-failure-policy` imports THIS module, so a static
      // import here would close a cycle at module-evaluation time, and it
      // would drag sweetalert2 into every cold boot.
      const { resetDecryptionFailureLatch } = await import(
        '../storage/decryption-failure-policy'
      );
      resetDecryptionFailureLatch();

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
      // else this login's own roster wrap, and no further fallback since
      // design D2 removed the Q2 local mint. The online path's third source
      // (design D1: the login response's wrap) is deliberately NOT passed
      // here and must not be: this path never contacts the server, it
      // authenticates from the roster file alone, so there is no response to
      // take a wrap from. Consequence worth knowing: a
      // v1 roster carries no wrap, so an offline login against one now
      // requires a device this login has already provisioned.
      // `authenticateOffline` itself is UNTOUCHED (D4) and may
      // already have set a DEK for a v2-roster login with wrap fields;
      // `resolveDekForLogin` accounts for that (structural note 1) and is
      // idempotent either way. Not swallowed, same rationale as the
      // online path above.
      const { resolveDekForLogin } = await import('../offline/dek-provisioning');
      await resolveDekForLogin({ login: user.login, password, sessionStoreId: user.selectedStoreId });
      // Task 4: re-arm the decryption-failure latch, same rationale as the
      // online path above — and dynamic for the same two reasons, restated
      // here because this call site is edited on its own: a static import
      // would close a cycle (`decryption-failure-policy` imports THIS module)
      // and would pull sweetalert2 into every cold boot.
      const { resetDecryptionFailureLatch } = await import(
        '../storage/decryption-failure-policy'
      );
      resetDecryptionFailureLatch();
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
    // when already on /login or / to avoid a redundant navigation loop. The
    // condition lives in `willLogoutRedirect()` so callers can ask the same
    // question BEFORE calling this.
    if (willLogoutRedirect()) {
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
