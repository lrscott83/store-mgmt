/// <reference lib="webworker" />
import { resolveStrategy } from './shared/lib/pwa/sw-strategy';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Bump this version whenever precached shell assets (icons, favicon, etc.)
// change. The `activate` handler deletes every cache NOT matching this name,
// so bumping the suffix purges every previous `app-shell-*` cache. v3 also
// collapses the three previously separate caches (`app-shell-v2`,
// `app-chunks-v1`, `fonts-v1`) into this single named cache
// (pwa-offline-shell spec: "Precache is consolidated into a single named
// cache").
const PRECACHE_NAME = 'app-shell-v3';
const SHELL_URL = '/index.html';

// Read the injected manifest exactly ONCE at module scope. Referencing
// `self.__WB_MANIFEST` at more than one call site would leave two occurrences
// of the injection-point placeholder in the pre-injection bundle, tripping
// workbox-build's `multiple-injection-points` assert (design.md D3/D4).
const PRECACHE_MANIFEST = self.__WB_MANIFEST ?? [];

// Precache the manifest entries on install.
//
// NO `self.skipWaiting()` here — this is `registerType: 'prompt'`. When an UPDATE
// is found, the new worker MUST stay in the `waiting` state so vite-plugin-pwa's
// register client fires `onNeedRefresh` (→ the "¡Nueva versión disponible!"
// dialog) and the user decides when to update. Calling `skipWaiting()` on install
// activated the new worker immediately; the register client's `controlling`
// listener (`if (event.isUpdate) window.location.reload()`) then reloaded the page
// on its own, so the dialog appeared and vanished before the user could act.
// Activation is instead triggered on demand by the `SKIP_WAITING` message handler
// below (posted by `updateSW(true)` when the user clicks "Actualizar ahora"),
// mirroring Angular's `UpdateService.activateUpdate()`-then-reload flow. On a
// FIRST install (no existing controller) there is no `waiting` phase: the worker
// activates directly and `activate`'s `clients.claim()` takes control.
self.addEventListener('install', (event) => {
  console.info('[SW] install: precaching shell — NOT calling skipWaiting (stays waiting until user confirms)');
  event.waitUntil(
    caches.open(PRECACHE_NAME).then(async (cache) => {
      const urls = PRECACHE_MANIFEST.map((entry) => entry.url);
      console.info(`[SW] install: ${urls.length} manifest entries to precache`);
      if (urls.length > 0) {
        // `cache: 'reload'` bypasses the HTTP cache — without it, a
        // stable-filename asset (index.html, fonts, images) can precache the
        // PREVIOUS deploy's response instead of the one this manifest
        // describes (design.md D8). `addAll` atomicity is kept deliberately:
        // a partial precache is a lie the device only discovers once there
        // is no network left to recover with.
        await cache.addAll(urls.map((url) => new Request(url, { cache: 'reload' })));
      }
    })
  );
});

// Activate: prune every cache that is not this version's single named cache,
// then claim clients (pwa-offline-shell spec: "Activation prunes stale
// caches").
self.addEventListener('activate', (event) => {
  console.info('[SW] activate: cleaning old caches + clients.claim() (new version is now controlling)');
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(cacheNames.filter((name) => name !== PRECACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

// Fetch handler: delegates the routing decision to the pure, typechecked
// `resolveStrategy` (app/shared/lib/pwa/sw-strategy.ts). This app is SPA mode
// (`ssr:false`), so the build emits ONE shell — `build/client/index.html` —
// and every route is resolved client-side by React Router. Serving that
// precached shell for every same-origin navigation, online OR offline, lets
// the client router + auth-store pick the view: a valid 35-day session in
// localStorage hydrates with no network, so an authenticated user offline
// lands in the app normally instead of a dead "Offline" page.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  const strategy = resolveStrategy({
    url,
    method: request.method,
    mode: request.mode,
    selfOrigin: self.location.origin,
  });

  if (strategy === 'passthrough') {
    return;
  }

  if (strategy === 'shell') {
    event.respondWith(caches.match(SHELL_URL).then((cached) => cached ?? fetch(request)));
    return;
  }

  // cache-first: a miss falls through to a network fetch attempt (which
  // fails offline) rather than crashing — pwa-offline-shell spec, "Cache
  // miss on a static asset does not crash the worker".
  //
  // `ignoreVary: true` is required for precached assets: the server's `Vary`
  // header (nginx: `Accept-Encoding`; vite preview: `Origin`) makes
  // `caches.match(request)` reject entries whose request differs from the
  // one that stored them — modulepreload requests arrive with `mode: cors`
  // plus an `Origin` header, so a `Vary: Origin` response stored without an
  // Origin request MISSes and falls through to `fetch()` (offline →
  // ERR_FAILED). Precache entries are exactly the bytes this manifest
  // describes; `Vary` negotiation must not invalidate them (workbox's
  // precache strategies use ignoreVary for the same reason).
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          // Clone synchronously here, BEFORE `return response` below. A Response
          // body can be read only once; cloning inside the async
          // caches.open().then() ran after the returned response had already
          // started being consumed ("Response body is already used").
          const responseToCache = response.clone();
          // Best-effort: this write is not awaited by `respondWith` (the
          // response above is already on its way to the caller), so a
          // rejection here (e.g. `QuotaExceededError`) must never surface as
          // an unhandled promise rejection in the worker's global scope —
          // same silent-failure intent as the removed dead precache-refresh
          // handler this file used to have.
          caches.open(PRECACHE_NAME).then((cache) => cache.put(request, responseToCache)).catch(() => {});
        }
        return response;
      });
    })
  );
});

// Message handler: user-confirmed update activation only. The previous
// post-auth "precache the remaining app chunks" message handler (which
// fetched a runtime-generated asset-list JSON file) is removed — the
// build-time precache manifest is now complete, so there is nothing left for
// it to refresh (pwa-offline-shell spec: "Dead precache-refresh message
// handler is removed").
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.info('[SW] SKIP_WAITING received → skipWaiting() (user confirmed the update)');
    self.skipWaiting();
  }
});
