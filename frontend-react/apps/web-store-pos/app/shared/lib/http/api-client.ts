import axios from 'axios';
import { StorageService } from '../auth/storage-service';
import { useAuthStore } from '../stores/auth-store';
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

apiClient.interceptors.request.use((config) => {
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
  (response) => response,
  (error) => {
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
