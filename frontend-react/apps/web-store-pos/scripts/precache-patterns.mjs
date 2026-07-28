// Single source of truth for BOTH the injector (build-sw.mjs, via
// workbox-build's `injectManifest`) and the verifier (verify-sw-precache.mjs,
// via workbox-build's `getManifest`). See design.md D-shared-module and the
// pwa-precache-build spec ("Manifest covers every file matching precache
// patterns").
export const PRECACHE_GLOB_PATTERNS = [
  '**/*.{js,css,html,woff2,webmanifest}', // shell + route chunks + 5 woff2 + manifest.webmanifest
  'icons/*.png', // 8 PWA install icons
  'images/**/*.png', // 6 /help/tutorial screenshots
  'favicon.png',
];

export const PRECACHE_GLOB_IGNORES = [
  'assets/server-build-*', // React Router server-build leftover, unreferenced by index.html
  // injectManifest pushes swSrc/swDest into its OWN globIgnores internally, so
  // build/client/service-worker.js is never in its own manifest. getManifest()
  // (used by the verifier) applies NO such automatic ignore — without this
  // entry the verifier reports service-worker.js as missing and fails EVERY
  // build (pwa-precache-build spec, "The service worker never precaches
  // itself").
  'service-worker.js',
];

// Parity with today's vite.config.ts maximumFileSizeToCacheInBytes.
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
