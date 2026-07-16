import { showUpdateAvailable } from '~/shared/lib/blocking-alert';

// PWA-01/Stage-6-Slice-D: 15-minute periodic `registration.update()` poll, in
// addition to the existing update-available confirm/apply flow. Matches
// Angular's `UpdateService` (SwUpdate → Swal confirm → activateUpdate +
// reload) plus the periodic-check requirement so a long-lived open tab
// discovers a new version without a manual reload.
const UPDATE_POLL_INTERVAL_MS = 15 * 60 * 1000;

export interface RegisterSWOptions {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}

type RegisterSWFn = (options: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

/**
 * Wires the `registerSW()` callbacks. Extracted from `registerServiceWorker`
 * (and takes `registerSW` as a parameter) so this can be unit-tested without
 * mocking the `virtual:pwa-register` vite-plugin-pwa virtual module.
 */
export function setupServiceWorker(registerSW: RegisterSWFn): void {
  const updateSW = registerSW({
    onNeedRefresh: () => {
      void showUpdateAvailable(() => {
        void updateSW(true);
      });
    },
    onOfflineReady: () => {
      // Angular's UpdateService has no offline-ready UI either — best-effort log only.
      console.info('App ready to work offline.');
    },
    onRegisteredSW: (_swScriptUrl, registration) => {
      if (!registration) return;
      setInterval(() => {
        void registration.update();
      }, UPDATE_POLL_INTERVAL_MS);
    },
  });
}

/**
 * Registers the service worker and wires the "new version available" prompt,
 * matching Angular's `UpdateService`. `vite.config.ts` uses `registerType:
 * 'prompt'` + `injectRegister: false`, which means NOTHING registers the
 * service worker unless we call `virtual:pwa-register` ourselves — without
 * this, the app's entire offline/precache machinery is inert. Client-only /
 * SSR-safe: this only runs from a `useEffect` (never during any server-side
 * module evaluation), and this app is SPA mode anyway (`ssr:false`,
 * `react-router.config.ts`). Feature-detecting `'serviceWorker' in navigator`
 * additionally keeps this inert in environments (and tests) without SW
 * support.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Static specifier (NOT `@vite-ignore` + a runtime-built string): that older
  // form hid the import from vite-plugin-pwa, so `virtual:pwa-register` was
  // never rewritten and the browser fetched it as a literal URL
  // (`GET virtual:pwa-register` → CORS/ERR_FAILED), leaving the SW unregistered.
  // A plain literal lets the plugin resolve it — to the real `registerSW` in a
  // build, to a no-op stub in dev (`devOptions.enabled: false`). It stays a
  // dynamic import so it's off the SSR path, and Vitest (no PWA plugin) still
  // intercepts it via `vi.doMock('virtual:pwa-register', …)` at runtime.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    setupServiceWorker(registerSW);
  });
}
