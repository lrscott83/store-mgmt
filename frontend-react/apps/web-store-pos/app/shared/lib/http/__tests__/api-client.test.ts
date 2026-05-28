import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import type { InternalAxiosRequestConfig, AxiosError } from 'axios';

// StorageKeys.TOKEN = 'token' (hard-coded to avoid circular config import in tests)
const TOKEN_KEY = 'token';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  describe('Response interceptor — 401 logout and redirect', () => {
    it('clears auth tokens from localStorage on 401 response', async () => {
      localStorage.setItem(TOKEN_KEY, 'test-token');
      localStorage.setItem('currentUser', 'user-data');

      const { apiClient } = await import('../api-client');

      const rejected = getResponseInterceptor(apiClient);

      const mockError = new axios.AxiosError(
        'Unauthorized',
        '401',
        undefined,
        undefined,
        {
          status: 401,
          data: {},
          headers: {},
          config: {} as InternalAxiosRequestConfig,
          statusText: 'Unauthorized',
        }
      );

      try {
        await rejected(mockError);
      } catch {
        // Expected: interceptor always rejects
      }

      // Token must be cleared after 401
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
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
});
