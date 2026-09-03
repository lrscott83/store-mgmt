import axios from 'axios';
import { StorageService } from '../auth/storage-service';
import { useLoadingStore } from '../stores/loading-store';
import { showBlockingError } from '../blocking-alert';
import esMessages from '../i18n/es';
import { OFFLINE_SESSION_TOKEN } from '../offline/offline-session';

const API_TIMEOUT = 30000;

// Opt-out flag for background requests (e.g. the store-usage tracker's telemetry
// POST): when `skipLoading: true` is passed in the request config, the loading
// interceptor never drives the global overlay for that request. This is a
// deliberate divergence from Angular (whose LoadingInterceptor wraps ALL
// requests) — background sync must stay invisible to the user.
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipLoading?: boolean;
  }
}

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
  // skipLoading opt-out: background telemetry requests never drive the overlay.
  if (!config.skipLoading) {
    useLoadingStore.getState().start();
  }

  // An explicitly-provided `Authorization` wins over any session-derived
  // bearer: the store-usage tracker passes the roster JWT for its telemetry
  // POST. Nothing else sets it today.
  if (config.headers['Authorization']) {
    return config;
  }

  const token = StorageService.getTokenFromLocalStorage();
  if (!token) {
    return config;
  }

  // Offline-born session: the stored token is the non-JWT 'offline-session'
  // sentinel, which the backend rejects with 401. The roster carries a real
  // signed JWT (`offlineAuthToken`) for that user — present it instead so
  // every online operation works after an offline authentication, exactly as
  // the store-usage tracker's telemetry POST already did. Absent/expired
  // roster or no matching user degrades to today's behavior (the sentinel).
  //
  // Dynamic import is deliberate (design D1): the roster store is only ever
  // evaluated on the sentinel path, never on an ordinary online session.
  if (token === OFFLINE_SESSION_TOKEN) {
    return resolveOfflineSessionJwt().then((rosterJwt) => {
      config.headers['Authorization'] = `Bearer ${rosterJwt ?? token}`;
      return config;
    });
  }

  config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

/**
 * Resolves the roster's per-user JWT (`offlineAuthToken`) for the CURRENT
 * user, or `undefined` when there is nothing to present (no roster, expired
 * bundle, no current user, or no JWT on that roster user). Same match
 * criterion the store-usage tracker uses: the roster user's `id` equals
 * `UserModel.id` (offline-auth-service maps it 1:1) and `CURRENT_USER.id`.
 */
async function resolveOfflineSessionJwt(): Promise<string | undefined> {
  const currentUser = StorageService.getCurrentUser();
  if (!currentUser?.id) {
    return undefined;
  }
  const { getRoster } = await import('../offline/roster-store');
  const roster = getRoster();
  const rosterUser = roster?.users.find((u) => u.id === currentUser.id);
  return rosterUser?.offlineAuthToken || undefined;
}

// Mirrors Angular's _interceptors/error-interceptor.service.ts response-error
// handling (rule 9 — error contract, not RxJS mechanics): 30s timeout (already
// enforced by API_TIMEOUT above, axios' analogue of `timeout(30000)`),
// network-error tagging, and 500 -> Swal blocking dialog.
//
// OFFLINE-FIRST DIVERGENCE from Angular: a 401 does NOT log the user out. The
// local session (AUTH_MODEL/currentUser) is authoritative for its 35-day window;
// only an explicit logout or local token expiry ends it. A 401 just rejects so
// the calling request can handle it — a rejected/rotated token server-side must
// not destroy a locally-valid offline session.
apiClient.interceptors.response.use(
  (response) => {
    // Angular finalize() success path (loading-interceptor.service.ts:18-20).
    // Mirror the request-side skipLoading opt-out so start()/stop() stay balanced.
    if (!response.config?.skipLoading) {
      useLoadingStore.getState().stop();
    }
    return response;
  },
  (error) => {
    // Angular finalize() error path — runs on EVERY error branch below
    // (network, 401, 500, generic), exactly like RxJS finalize() firing on
    // both next and error notifications. Called once, unconditionally, so no
    // branch can accidentally forget it and leave the overlay stuck — except
    // for skipLoading requests, which never called start() to begin with.
    if (!error.config?.skipLoading) {
      useLoadingStore.getState().stop();
    }

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

      // OFFLINE-FIRST: a 401 is NOT special — it falls through to the generic
      // reject below, leaving the local session untouched (no logout, no
      // redirect). Diverges deliberately from Angular's logout-on-401.

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
