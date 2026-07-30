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
  onRegisterError?: (error: unknown) => void;
}

type RegisterSWFn = (options: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

/**
 * Wires the `registerSW()` callbacks. Extracted from `registerServiceWorker`
 * (and takes `registerSW` as a parameter) so this can be unit-tested without
 * mocking the `virtual:pwa-register` vite-plugin-pwa virtual module.
 */
export function setupServiceWorker(registerSW: RegisterSWFn): void {
  // TEMP (debugging the update flow): [PWA]-prefixed console logs. Remove before commit.
  console.info('[PWA] setupServiceWorker: wiring registerSW callbacks');
  const updateSW = registerSW({
    onNeedRefresh: () => {
      console.info('[PWA] onNeedRefresh: a new version is WAITING → showing the update dialog');
      void showUpdateAvailable(() => {
        console.info('[PWA] user confirmed → updateSW(true): posts SKIP_WAITING, page reloads on controllerchange');
        void updateSW(true);
      });
    },
    onOfflineReady: () => {
      // Angular's UpdateService has no offline-ready UI either — best-effort log only.
      console.info('[PWA] onOfflineReady: app ready to work offline');
    },
    onRegisteredSW: (swScriptUrl, registration) => {
      console.info(
        `[PWA] onRegisteredSW: ${swScriptUrl} — registration present? ${Boolean(registration)}`
      );
      if (!registration) return;
      let tick = 0;
      setInterval(() => {
        tick += 1;
        console.info(
          `[PWA] poll #${tick}: calling registration.update() (interval ${UPDATE_POLL_INTERVAL_MS / 1000}s)`
        );
        void registration.update();
      }, UPDATE_POLL_INTERVAL_MS);
    },
    onRegisterError: (error) => {
      console.error('[PWA] onRegisterError: service worker registration failed', error);
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
  // build, and in dev too, since `devOptions.enabled: true` (vite.config.ts)
  // serves a real worker so the install flow can be exercised locally. It stays
  // a dynamic import so it's off the SSR path, and Vitest (no PWA plugin) still
  // intercepts it via `vi.doMock('virtual:pwa-register', …)` at runtime.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    setupServiceWorker(registerSW);
  });
}
