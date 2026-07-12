import { create } from 'zustand';
import type { UserModel } from '@store-mgmt/domain';
import { StorageKeys } from '../storage/storage-keys';
import { StorageService } from '../auth/storage-service';

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

interface AuthState {
  user: UserModel | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: () => void;
  setUser: (user: UserModel, token: string) => void;
  updateUser: (user: UserModel) => void;
  login: (email: string, password: string) => Promise<UserModel>;
  logout: () => void;
}

function readStoredUser(): UserModel | null {
  try {
    const raw = localStorage.getItem(StorageKeys.AUTH_MODEL);
    if (!raw) return null;
    const authModel = JSON.parse(raw) as { authToken?: string; expiresIn?: number };
    if (!authModel.expiresIn || authModel.expiresIn < Date.now()) return null;
    const profile = StorageService.getCurrentUser();
    return {
      ...(profile ?? {}),
      authToken: authModel.authToken,
      expiresIn: authModel.expiresIn,
    } as UserModel;
  } catch {
    localStorage.removeItem(StorageKeys.AUTH_MODEL);
    return null;
  }
}

function clearAuthStorage(): void {
  StorageService.removeTokenFromLocalStorage();
  localStorage.removeItem(StorageKeys.AUTH_MODEL);
  StorageService.removeCurrentUser();
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initialize: () => {
    const user = readStoredUser();
    if (user) {
      set({ user, isAuthenticated: true, error: null });
      // AUTH-03: Fire background /me if online — must NOT block render or display errors on failure
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const token = StorageService.getTokenFromLocalStorage();
        if (token) {
          void import('../http/api-client').then(({ apiClient }) =>
            apiClient
              .get<{ data: UserModel }>('/v1/auth/me')
              .then((res) => {
                const updated = res.data?.data;
                if (updated) {
                  const expiresIn = Date.now() + THIRTY_FIVE_DAYS_MS;
                  const userWithExpiry: UserModel = { ...updated, expiresIn, password: '' };
                  // Split layout (Option A): profile → currentUser; AUTH_MODEL stays minimal.
                  StorageService.setCurrentUser(userWithExpiry);
                  localStorage.setItem(
                    StorageKeys.AUTH_MODEL,
                    JSON.stringify({ authToken: token, expiresIn })
                  );
                  set({ user: userWithExpiry });
                }
              })
              .catch(() => {
                // Silently ignore — spec AUTH-03: MUST NOT display any error on failure
              })
          ).catch(() => {
            // AUTH-03: the background refresh must never surface errors — including
            // module-import or wiring failures that reject the outer promise.
          });
        }
      }
    } else {
      clearAuthStorage();
      set({ user: null, isAuthenticated: false, error: null });
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

      const { apiClient } = await import('../http/api-client');
      const meResponse = await apiClient.get<{ data: UserModel }>('/v1/auth/me', {
        headers: { Authorization: `Bearer ${authData.authToken}` },
      });
      const user = meResponse.data.data;
      const expiresIn = Date.now() + THIRTY_FIVE_DAYS_MS;
      const userWithExpiry: UserModel = { ...user, ...authData, expiresIn, password: '' };

      StorageService.setTokenToLocalStorage(authData.authToken);
      StorageService.setCurrentUser(userWithExpiry);
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: authData.authToken, expiresIn })
      );
      set({ user: userWithExpiry, isAuthenticated: true, isLoading: false, error: null });
      return userWithExpiry;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    clearAuthStorage();
    set({ user: null, isAuthenticated: false, error: null });
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
