import axios from 'axios';
import { StorageService } from '../auth/storage-service';
import { useAuthStore } from '../stores/auth-store';
import { useLoadingStore } from '../stores/loading-store';
import { showBlockingError } from '../blocking-alert';
import esMessages from '../i18n/es';

const API_TIMEOUT = 30000;

export const apiClient = axios.create({
  baseURL: (import.meta.env['API_URL'] as string | undefined) ?? '',
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Mirrors Angular's loading-interceptor.service.ts:13-22 (LoadingInterceptor):
// start() fires before every request; stop() fires in finalize() so it runs
// on BOTH the success and error response paths below. This axios request
// interceptor is the React port of `intercept()`'s `this.loadingService.start()`.
apiClient.interceptors.request.use((config) => {
  useLoadingStore.getState().start();
  const token = StorageService.getTokenFromLocalStorage();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Mirrors Angular's _interceptors/error-interceptor.service.ts response-error
// handling (rule 9 — error contract, not RxJS mechanics): 30s timeout (already
// enforced by API_TIMEOUT above, axios' analogue of `timeout(30000)`),
// network-error tagging, 401 -> AuthService.logout() delegation, 500 -> Swal
// blocking dialog.
apiClient.interceptors.response.use(
  (response) => {
    // Angular finalize() success path (loading-interceptor.service.ts:18-20).
    useLoadingStore.getState().stop();
    return response;
  },
  (error) => {
    // Angular finalize() error path — runs on EVERY error branch below
    // (network, 401, 500, generic), exactly like RxJS finalize() firing on
    // both next and error notifications. Called once, unconditionally, so no
    // branch can accidentally forget it and leave the overlay stuck.
    useLoadingStore.getState().stop();

    if (axios.isAxiosError(error)) {
      // Angular error-interceptor.service.ts:52-59: `err.status === 0 ||
      // err.name === 'TimeoutError' || err.message?.includes('Network')` never
      // reach a server response. Axios' equivalent — no `error.response` —
      // covers both network failures and the client-side 30s timeout above,
      // and is tagged the same way (`isNetworkError`) so callers can identify it.
      if (!error.response) {
        (error as unknown as { isNetworkError?: boolean }).isNetworkError = true;
        return Promise.reject(error);
      }

      if (error.response.status === 401) {
        // Angular error-interceptor.service.ts:62-66 delegates to
        // AuthService.logout() instead of duplicating token-clearing/redirect
        // logic here. useAuthStore.logout() mirrors AuthService.logout()
        // exactly: AUTH_MODEL-only clear (token/currentUser survive) + the
        // already-on-/login anti-loop redirect guard.
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      if (error.response.status === 500) {
        // Angular error-interceptor.service.ts:77-85 shows a blocking Swal
        // error dialog with translate.instant(...) + the same fallback text.
        showBlockingError(
          esMessages['GENERAL.RESPONSE.ERROR_TITLE'],
          esMessages['GENERAL.RESPONSE.ERROR500_MESSAGE']
        );
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
