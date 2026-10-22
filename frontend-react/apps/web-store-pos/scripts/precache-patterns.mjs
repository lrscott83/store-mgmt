// Single source of truth for BOTH the injector (build-sw.mjs) and the verifier
// (verify-sw-precache.mjs). See the pwa-precache-build spec.
//
// ALLOWLIST MODEL: the precache is not "every file matching a glob". It is
// exactly the import closure of the routes that must render offline, plus the
// static shell families. A route that is not listed in OFFLINE_ROUTE_IDS is
// never downloaded on install; visiting it online loads its chunk at runtime
// like any other code-split route, and `/api/*` is `passthrough` in
// `sw-strategy.ts`, so a precached online-only view could never render offline
// anyway.
//
// Owner decision 2026-10-22: only what works without the network is precached.

// Route ids as emitted in `build/client/assets/manifest-<hash>.js` (they match
// `app/routes.ts`). Every ancestor (`parentId` chain) is added automatically by
// the planner, so layouts are listed once, explicitly, for clarity.
export const OFFLINE_ROUTE_IDS = [
  // Shell and public entry
  'root',
  'home/routes/landing-deep',
  'shared/routes/$', // catch-all 404 must render offline

  // Authentication (sign in and first-run provisioning work from the roster)
  'auth/components/auth-layout',
  'auth/routes/login',
  'auth/routes/provision',

  // POS shell
  'app-layout',

  // Sales
  'sales/routes/products',
  'sales/routes/sale',
  'sales/routes/cash-closing',
  'sales/routes/wholesale',
  'sales/routes/today-orders',
  'sales/routes/orders',
  'sales/routes/today-stats',
  'sales/routes/today-credits',
  'sales/routes/credits',

  // Inventory
  'inventory/routes/available',
  'inventory/routes/count',
  'inventory/routes/today-entries',
  'inventory/routes/entries',
  'inventory/routes/today-quantities',
  'inventory/routes/today-sales-profit',
  'inventory/routes/egress',
  'inventory/routes/warehouses',
  'inventory/routes/warehouse-movements',
  'inventory/routes/recipes',
  'inventory/routes/elaborations',

  // Expenses and reports
  'expenses/routes/today-expenses',
  'expenses/routes/expenses-history',
  'reports/routes/today-report',

  // Statistics (local aggregations over the offline repositories)
  'statistics/routes/dashboard',
  'statistics/routes/cuadre-por-fechas',

  // Sync
  'sync/routes/export',
  'sync/routes/import',

  // Management: only the exchange-rate screen (owner requirement 2026-10-22).
  // Read its rates offline even though the rest of management stays online-only.
  'management-channel-rates',

  // Public layout + pages that are pure content
  'public-app-layout',
  'diagnostics/routes/diagnostics', // local log viewer: its whole purpose is devices without a session
  'help/routes/tutorial',
  'legal/routes/privacy-policy',
  'legal/routes/terms-conditions',

  // NOT listed on purpose (they read the API on load):
  //   auth/routes/register
  //   catalog/routes/public-catalog, sales/routes/web-catalog
  //   sales/routes/ordering-{orders,settings,drivers,history,sales}
  //   management-* (my-stores, stores, users, configurations) — except
  //                management-channel-rates, which is listed above
  //   admin/* (stores, modules, dashboard, catalog-stats, messages, features,
  //            resellers, owners)
  //   profile/* (edit-profile, change-password)
  //   shared/routes/health (API probe, no UI)
];

// Static families that are not route-scoped. CSS is deliberately absent: the
// route manifest names each route's stylesheet, so the planner takes exactly the
// CSS of the precached routes. That also keeps the 76 KB
// `assets/server-build-*.css` SSR leftover out — nothing references it.
export const PRECACHE_STATIC_PATTERNS = [
  '*.html', // index.html (the shell) + landing.html
  'manifest.webmanifest',
  'favicon.png',
  'icons/*.png', // 8 PWA install icons
  'images/**/*.png', // 6 /help/tutorial screenshots
  'fonts/**/*.woff2', // 5 Inter faces
];

// Chunk name prefixes that must never reach the manifest. Vite names a chunk
// after the route module file, so the prefix survives every content hash while
// the hash does not. This is the gate's independent side: it catches a planner
// regression that would silently re-inflate every install, which a
// plan-versus-injected comparison cannot see (both sides would agree).
export const FORBIDDEN_PRECACHE_PREFIXES = [
  'assets/register-',
  'assets/web-catalog-',
  'assets/ordering-',
  'assets/public-catalog-',
  'assets/catalog-stats-',
  'assets/store-list-',
  'assets/owner-list-',
  'assets/owner-create-',
  'assets/owner-edit-',
  'assets/reseller-list-',
  'assets/reseller-create-',
  'assets/reseller-edit-',
  'assets/reseller-commissions-',
  'assets/collections-',
  'assets/features-',
  'assets/module-catalog-',
  'assets/user-list-',
  'assets/user-create-',
  'assets/user-edit-',
  'assets/configurations-',
  'assets/my-stores-',
  'assets/edit-store-',
  'assets/update-store-',
  'assets/store-plan-',
  'assets/edit-profile-',
  'assets/change-password-',
];

// Parity with today's vite.config.ts maximumFileSizeToCacheInBytes.
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// The asset families the offline shell cannot work without, at the counts the
// patterns above already claim in prose. `computePrecacheDiff` compares the
// planned set against the injected manifest and so is blind to a family that
// vanished from the BUILD OUTPUT: a deleted woff2 is not on disk, therefore not
// "missing from the manifest", therefore green — while offline fonts break.
// These counts close that hole.
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
