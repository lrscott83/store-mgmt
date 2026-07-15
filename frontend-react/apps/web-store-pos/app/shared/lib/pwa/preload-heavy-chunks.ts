/**
 * Fire-and-forget warm-up of the 3 heavy route chunks a freshly-authenticated
 * user is most likely to hit next, mirroring Angular's `PreloadingService`
 * (`preloading.service.ts:15-54` `preloadHeavyChunks()`). Angular iterates
 * `['/admin/dashboard', '/statistics/dashboard', '/reports/today']` and fires
 * a `.catch(console.error)`-guarded dynamic `import()` per route so the first
 * navigation into any of those screens is instant.
 *
 * Vite/Rollup statically analyzes `import()` calls and requires each target
 * to be a literal string specifier — a `paths.forEach(p => import(p))` loop
 * over a variable specifier cannot be code-split. So, unlike Angular's
 * `switch`, this deliberately spells out 3 explicit `import()` calls (the
 * one non-mechanical divergence from Angular). Each targets the same route
 * module `routes.ts` registers for the equivalent Angular route:
 * - `/admin/dashboard`      -> `admin/dashboard/routes/dashboard.tsx` (routes.ts:88)
 * - `/statistics/dashboard` -> `statistics/routes/dashboard.tsx` (routes.ts:57, URL `stats/dashboard`)
 * - `/reports/today`        -> `reports/routes/today-report.tsx` (routes.ts:54)
 *
 * Called from the two React equivalents of Angular's two
 * `navigateToUserHome()` call-sites (`login.component.ts:50,171`): the login
 * submit success path (`auth/routes/login.tsx`) and the already-authenticated
 * guest-only loader redirect (`auth/routes/loaders.ts` `guestOnlyLoader`).
 */
export function preloadHeavyChunks(): void {
  const preloads: Array<() => Promise<unknown>> = [
    () => import('../../../admin/dashboard/routes/dashboard'),
    () => import('../../../statistics/routes/dashboard'),
    () => import('../../../reports/routes/today-report'),
  ];

  preloads.forEach((preload) => {
    preload().catch((err: unknown) => {
      console.error('[preloadHeavyChunks] Failed to preload chunk', err);
    });
  });
}
