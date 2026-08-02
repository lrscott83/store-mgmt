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

// The asset families the offline shell cannot work without, at the counts the
// glob comments above already claim in prose. `computePrecacheDiff` compares
// on-disk → manifest and so is blind to a family that vanished from the BUILD
// OUTPUT: a deleted woff2 is not on disk, therefore not "missing from the
// manifest", therefore green — while offline fonts break. These counts close
// that hole and make task 8.2 of the pwa-offline-shell change a build gate
// instead of a human squinting at Cache Storage.
//
// Route chunks and CSS are deliberately absent: their count moves with every
// code split, so pinning them would fail on unrelated work. Adding a tutorial
// screenshot, a font or an icon is expected to fail the gate until the number
// here is updated on purpose.
export const REQUIRED_PRECACHE_FAMILIES = [
  { family: 'index.html', expected: 1 },
  { family: 'assets/manifest-*.js', expected: 1 },
  { family: 'manifest.webmanifest', expected: 1 },
  { family: 'favicon.png', expected: 1 },
  { family: 'images/**/*.png', expected: 6 },
  { family: 'fonts/**/*.woff2', expected: 5 },
  { family: 'icons/*.png', expected: 8 },
];
