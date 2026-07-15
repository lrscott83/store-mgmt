import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import type { InternalAxiosRequestConfig, AxiosError } from 'axios';
import { StorageKeys } from '../../storage/storage-keys';
import esMessages from '../../i18n/es';

// StorageKeys.TOKEN = 'token' (hard-coded to avoid circular config import in tests)
const TOKEN_KEY = 'token';

// Angular's source of truth (`frontend/`) has no global Swal.mixin/theme override anywhere
// (confirmed by repo-wide grep), so the 500 branch reproduces the same library with stock
// defaults. Mocking the 'sweetalert2' module itself (rather than showBlockingError) lets these
// tests assert the exact config passed to Swal.fire, matching the pattern already used in
// shared/lib/__tests__/blocking-alert.test.ts.
const fireMock = vi.fn();
vi.mock('sweetalert2', () => ({
  default: { fire: (...args: unknown[]) => fireMock(...args) },
}));

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  fireMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

/** Extract an interceptor handler from an Axios instance. */
function getRequestInterceptor(instance: ReturnType<typeof axios.create>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers: Array<{ fulfilled?: unknown } | null> = (instance.interceptors.request as any).handlers;
  const handler = handlers.find((h) => h !== null && typeof h?.fulfilled === 'function');
  if (!handler?.fulfilled) throw new Error('Request interceptor not found');
  return handler.fulfilled as (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
}

function getResponseInterceptor(instance: ReturnType<typeof axios.create>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers: Array<{ rejected?: unknown } | null> = (instance.interceptors.response as any).handlers;
  const handler = handlers.find((h) => h !== null && typeof h?.rejected === 'function');
  if (!handler?.rejected) throw new Error('Response interceptor not found');
  return handler.rejected as (error: AxiosError) => Promise<never>;
}

describe('api-client (AUTH-06)', () => {
  describe('Request interceptor — Bearer token attachment', () => {
    it('attaches Authorization header when token exists in localStorage', async () => {
      localStorage.setItem(TOKEN_KEY, 'test-token-123');
      const { apiClient } = await import('../api-client');

      const fulfilled = getRequestInterceptor(apiClient);

      const config = {
        headers: { ...axios.defaults.headers.common },
        url: '/test',
        method: 'get',
      } as unknown as InternalAxiosRequestConfig;

      const result = fulfilled(config);
      expect(result.headers?.['Authorization']).toBe('Bearer test-token-123');
    });

    it('does not set Authorization header when no token in localStorage', async () => {
      // localStorage is already cleared in beforeEach
      const { apiClient } = await import('../api-client');

      const fulfilled = getRequestInterceptor(apiClient);

      const config = {
        headers: { ...axios.defaults.headers.common },
        url: '/test',
        method: 'get',
      } as unknown as InternalAxiosRequestConfig;

      const result = fulfilled(config);
      expect(result.headers?.['Authorization']).toBeUndefined();
    });
  });

  describe('Response interceptor — 401 delegates to useAuthStore.logout() (Angular error-interceptor.service.ts:62-66 parity)', () => {
    it('calls useAuthStore.getState().logout() exactly once on a 401 response', async () => {
      const { apiClient } = await import('../api-client');
      // Dynamically import from the SAME module registry cycle as api-client
      // (both resolve to the identical module instance since no
      // vi.resetModules() runs between these two imports) so the spy attaches
      // to the exact store instance the interceptor calls into.
      const { useAuthStore } = await import('../../stores/auth-store');
      const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

      const rejected = getResponseInterceptor(apiClient);
      const mockError = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'Unauthorized',
      });

      try {
        await rejected(mockError);
      } catch {
        // Expected: interceptor always rejects
      }

      expect(logoutSpy).toHaveBeenCalledTimes(1);
    });

    it('removes only AUTH_MODEL on 401 — token and currentUser survive (Angular auth.service.ts:83-98 parity, Decision 1)', async () => {
      const { apiClient } = await import('../api-client');

      // Seed AFTER import: auth-store self-initializes on module evaluation
      // (mirrors Angular's APP_INITIALIZER) and would otherwise race a
      // background /me revalidation against these locally-seeded values.
      localStorage.setItem(
        StorageKeys.AUTH_MODEL,
        JSON.stringify({ authToken: 'test-token', expiresIn: Date.now() + 1000 })
      );
      localStorage.setItem(TOKEN_KEY, 'test-token');
      localStorage.setItem(StorageKeys.CURRENT_USER, 'user-data');

      const rejected = getResponseInterceptor(apiClient);
      const mockError = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'Unauthorized',
      });

      try {
        await rejected(mockError);
      } catch {
        // Expected: interceptor always rejects
      }

      expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token');
      expect(localStorage.getItem(StorageKeys.CURRENT_USER)).toBe('user-data');
    });

    it('does NOT hard-redirect when already on /login (anti-loop guard regression, Angular auth.service.ts:90-96)', async () => {
      window.history.pushState({}, '', '/login');
      const { apiClient } = await import('../api-client');
      const { registerAuthRedirect } = await import('../../stores/auth-store');
      const redirectSpy = vi.fn();
      registerAuthRedirect(redirectSpy);

      const rejected = getResponseInterceptor(apiClient);
      const mockError = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'Unauthorized',
      });

      try {
        await rejected(mockError);
      } catch {
        // Expected: interceptor always rejects
      }

      expect(redirectSpy).not.toHaveBeenCalled();
    });

    it('redirects to /login via the injected navigate fn (not window.location.href) when NOT already on /login', async () => {
      window.history.pushState({}, '', '/sales');
      const { apiClient } = await import('../api-client');
      const { registerAuthRedirect } = await import('../../stores/auth-store');
      const redirectSpy = vi.fn();
      registerAuthRedirect(redirectSpy);

      const rejected = getResponseInterceptor(apiClient);
      const mockError = new axios.AxiosError('Unauthorized', '401', undefined, undefined, {
        status: 401,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'Unauthorized',
      });

      try {
        await rejected(mockError);
      } catch {
        // Expected: interceptor always rejects
      }

      expect(redirectSpy).toHaveBeenCalledWith('/login');
    });

    it('does not clear tokens on non-401 errors (e.g. 500)', async () => {
      localStorage.setItem(TOKEN_KEY, 'test-token');

      const { apiClient } = await import('../api-client');

      const rejected = getResponseInterceptor(apiClient);

      const mockError = new axios.AxiosError(
        'Internal Server Error',
        '500',
        undefined,
        undefined,
        {
          status: 500,
          data: {},
          headers: {},
          config: {} as InternalAxiosRequestConfig,
          statusText: 'Internal Server Error',
        }
      );

      try {
        await rejected(mockError);
      } catch {
        // Expected: interceptor always rejects
      }

      // Token must NOT be cleared for non-401 errors
      expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token');
    });

    it('always rejects the promise so callers can handle the error', async () => {
      const { apiClient } = await import('../api-client');

      const rejected = getResponseInterceptor(apiClient);

      const mockError = new axios.AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'Not Found',
      });

      await expect(rejected(mockError)).rejects.toBeDefined();
    });
  });

  describe('Response interceptor — network-error tagging (Angular error-interceptor.service.ts:52-59 parity)', () => {
    it('tags errors with no HTTP response as isNetworkError = true and still rejects', async () => {
      const { apiClient } = await import('../api-client');
      const rejected = getResponseInterceptor(apiClient);

      // Axios network/timeout failures never reach a server response — the
      // analogue of Angular's status===0/TimeoutError/message-includes-'Network'
      // OR-condition, all of which share "no response was received".
      const networkError = new axios.AxiosError(
        'Network Error',
        'ERR_NETWORK',
        undefined,
        undefined,
        undefined
      );

      await expect(rejected(networkError)).rejects.toMatchObject({ isNetworkError: true });
    });

    it('does not tag ordinary HTTP error responses (e.g. 404) with isNetworkError', async () => {
      const { apiClient } = await import('../api-client');
      const rejected = getResponseInterceptor(apiClient);

      const mockError = new axios.AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'Not Found',
      });

      try {
        await rejected(mockError);
      } catch (e) {
        expect((e as { isNetworkError?: boolean }).isNetworkError).toBeUndefined();
      }
    });
  });

  describe('Response interceptor — 500 blocking error dialog (Angular error-interceptor.service.ts:77-85 parity)', () => {
    it('fires a blocking Swal error dialog with the GENERAL.RESPONSE.* i18n text on 500', async () => {
      const { apiClient } = await import('../api-client');
      const rejected = getResponseInterceptor(apiClient);

      const mockError = new axios.AxiosError('Internal Server Error', '500', undefined, undefined, {
        status: 500,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'Internal Server Error',
      });

      try {
        await rejected(mockError);
      } catch {
        // Expected: interceptor always rejects
      }

      expect(fireMock).toHaveBeenCalledWith({
        icon: 'error',
        title: esMessages['GENERAL.RESPONSE.ERROR_TITLE'],
        text: esMessages['GENERAL.RESPONSE.ERROR500_MESSAGE'],
      });
    });

    it('does not fire the dialog for non-500 errors (e.g. 404)', async () => {
      const { apiClient } = await import('../api-client');
      const rejected = getResponseInterceptor(apiClient);

      const mockError = new axios.AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        data: {},
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        statusText: 'Not Found',
      });

      try {
        await rejected(mockError);
      } catch {
        // Expected: interceptor always rejects
      }

      expect(fireMock).not.toHaveBeenCalled();
    });
  });
});
