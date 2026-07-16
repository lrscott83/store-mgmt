/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const PRECACHE_NAME = 'app-shell-v1';
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

  // Navigate fallback: serve cached shell for auth-required routes
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/login').then((cached) => cached ?? new Response('Offline', { status: 503 }))
      )
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
