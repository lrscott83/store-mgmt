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
  // SuperAdmin-only routes: loaded on-demand online, NOT precached.
  // Owner/StoreUser devices never navigate to these routes; precaching them
  // wastes cache space on every device.
  'assets/store-list-*.js', // admin/stores
  'assets/owner-list-*.js', // admin/owners
  'assets/owner-create-*.js', // admin/owners/create
  'assets/owner-edit-*.js', // admin/owners/edit
  'assets/reseller-list-*.js', // admin/resellers
  'assets/reseller-create-*.js', // admin/resellers/create
  'assets/reseller-edit-*.js', // admin/resellers/edit
  'assets/features-*.js', // admin/features
  'assets/collections-*.js', // management/stores/collections (SuperAdmin + ReSeller)
  'assets/reseller-commissions-*.js', // management/stores/commissions (SuperAdmin + ReSeller)

  // Online-only views (owner request 2026-10-22). Every one of them reads the
  // API and `/api/*` is `passthrough` in `sw-strategy.ts`, so their bytes can
  // never render offline — precaching them only grows the install. A device
  // that visits them online still receives them from the service worker's
  // runtime cache-first write; they are just not downloaded on install.
  'assets/web-catalog-*.js', // sales/web-catalog
  'assets/ordering-*.js', // sales/online-orders{,/settings,/drivers,/history,/sales} + its http service and labels
  'assets/catalog-stats-*.js', // admin/catalog-stats

  // Same SuperAdmin-only treatment, reachable exclusively from the admin
  // routes above (verified by walking the built chunk import graph):
  'assets/module-catalog-*.js', // admin/modules
  'assets/owner-error-message-*.js',
  'assets/reseller-http-service-*.js',
  'assets/store-card-list-*.js', // admin/stores card grid
  // `assets/owner-http-service-*.js` stays precached on purpose:
  // `messages-*.js` is NOT excluded (basename collision, see below) and
  // statically imports it, so dropping it would leave a kept route with a
  // dangling import.

  // DELIBERATELY NOT IGNORED — Vite names chunks after the module file, so two
  // different routes can share a basename and a wildcard would take out a chunk
  // the offline POS needs:
  //   `assets/dashboard-*.js`   also matches stats/dashboard (POS, recharts)
  //   `assets/messages-*.js`    also matches messages-http-service (kept layout)
  //   `assets/public-catalog-*.js`, `catalog-http-service-*` and `template-ids-*`
  //     -> the owner opens /catalog/<slug> from /sales/web-catalog
  //   `api-error-message-*`, `format-currency-*`, `use-unsaved-changes-prompt-*`
  //     -> generic names a POS chunk can start to reuse at any time.
  // Those leftovers cost ~12 KB of the install, and the gate below fails if one
  // of the patterns above ever stops matching.
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
