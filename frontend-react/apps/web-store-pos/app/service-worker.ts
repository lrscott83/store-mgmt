/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Bump this version whenever precached shell assets (icons, favicon, etc.)
// change. The `activate` handler deletes every cache NOT in `currentCaches`,
// so bumping the suffix purges the previous `app-shell-*` cache — otherwise the
// cache-first `/icons/` handler below serves stale (e.g. old blank) icons
// forever, since it never revalidates and the old cache is never evicted.
const PRECACHE_NAME = 'app-shell-v2';
const APP_CHUNKS_CACHE = 'app-chunks-v1';
const FONTS_CACHE = 'fonts-v1';

// Precache the manifest entries on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then(async (cache) => {
      // self.__WB_MANIFEST is injected by vite-plugin-pwa (workbox) at build time
      const manifest = self.__WB_MANIFEST ?? [];
      const urls = manifest.map((entry) => entry.url);
      if (urls.length > 0) {
        await cache.addAll(urls);
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches and claim clients
self.addEventListener('activate', (event) => {
  const currentCaches = [PRECACHE_NAME, APP_CHUNKS_CACHE, FONTS_CACHE];

  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !currentCaches.includes(name))
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch handler: network-first for navigation, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-same-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // App-shell navigation (cache-first). This app is SPA mode (`ssr:false`), so
  // the build emits ONE shell — `build/client/index.html` — and every route is
  // resolved client-side by React Router. Serve that precached shell for every
  // navigation, online OR offline, then let the client router + auth-store pick
  // the view. A valid 35-day session in localStorage hydrates with no network,
  // so an authenticated user offline lands in the app normally instead of a
  // dead "Offline" page. Matching the OLD `/login` here was a bug: no `/login`
  // HTML file exists in an SPA build, so `caches.match('/login')` always missed
  // and fell through to the bare `Response('Offline', 503)` white screen.
  // New shell HTML ships via the SW update-prompt flow, not a per-nav network hit.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => cached ?? fetch(request))
    );
    return;
  }

  // Cache-first for fonts
  if (url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.open(FONTS_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // Cache-first for static JS/CSS/images (precached assets)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            // Clone synchronously here, BEFORE `return response` below. A Response
            // body can be read only once; cloning inside the async
            // caches.open().then() ran after the returned response had already
            // started being consumed ("Response body is already used").
            const responseToCache = response.clone();
            caches.open(PRECACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        });
      })
    );
    return;
  }
});

// Message handler: post-auth chunk precaching (PWA-02, PWA-03)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PRECACHE_APP_CHUNKS') {
    event.waitUntil(
      caches.open(APP_CHUNKS_CACHE).then(async (cache) => {
        try {
          const response = await fetch('/assets-manifest.json');
          if (response.ok) {
            const manifest = await response.json() as Record<string, string>;
            const urls = Object.values(manifest).filter(
              (url): url is string =>
                typeof url === 'string' && (url.endsWith('.js') || url.endsWith('.css'))
            );
            await cache.addAll(urls);
          }
        } catch {
          // Silently fail — post-auth precaching is best-effort
        }
      })
    );
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
