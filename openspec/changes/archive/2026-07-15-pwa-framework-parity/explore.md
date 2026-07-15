# Exploration — pwa-framework-parity

> Source of truth: Angular `frontend/src` + React `frontend-react` + playbook `docs/migration/playbook-migracion-servicios-angular-react.md`. NOT openspec/, NOT memory. Every verdict grounded in file:line; injection ≠ live use.

## Per-item verdicts (code-verified)

| Item | Angular live-use trace | React state | Verdict |
|---|---|---|---|
| `download-manager.service.ts` | Methods invoked (`app.component.ts:100-108,146-150`) BUT `app.component.html` binds none of its 5 observables; matching `DownloadProgressComponent` (`app-download-progress`) used in 0 templates. Output never rendered. | — | 💀 **DEAD — no port** (rule 10/12) |
| `preloading.service.ts` | LIVE: `preloadHeavyChunks()` called from `login.component.ts:176-179` via `navigateToUserHome()` (2 call-sites: ctor `:50` already-auth, `submit()` success `:171`). Fires 3 `import()` warm-ups. | React Router v7 code-splits but no eager prefetch; `login.tsx`/`loaders.ts` have no preload; grep `prefetch`/`preload` in `apps/` = 0. | 🔴 **REAL GAP — WU-1** |
| `splash-screen.service.ts` (+ component/module) | `SplashScreenModule` never imported by any module; `app-splash-screen` in 0 templates; `app.module.ts` has 0 refs. Component never rendered. | — | 💀 **DEAD — no port** (rule 10/12) |
| `loading.service.ts` + `loading-interceptor.service.ts` | LIVE: `app.component.ts:33` `loading$ = loadingService.loading$`, bound in `app.component.html:2-6` (spinner overlay); `LoadingInterceptor` registered `app.module.ts:87`, `start()`/`stop()` per request. | `api-client.ts` has no request-count/loading state; `packages/web-common/src/client/loading-overlay.tsx` `LoadingOverlay` exists but is wired to nothing (0 usages in `apps/`). | 🔴 **REAL GAP — WU-2** |

## Work units (real gaps only)

- **WU-1 — post-auth heavy-chunk preload.** New fire-and-forget util that `import()`s the 3 route modules (`admin/dashboard/routes/dashboard.tsx`, `statistics/routes/dashboard.tsx`, `reports/routes/today-report.tsx`), called from `auth/routes/login.tsx` (post-login success, before navigate) and `auth/routes/loaders.ts` `guestOnlyLoader` (before redirect) — mirroring Angular's two `navigateToUserHome()` call-sites. Note: re-verify `import()` target paths vs `routes.ts` (Vite static-analysis stricter than webpack).
- **WU-2 — global HTTP-loading spinner.** New Zustand loading-count store (`start()`/`stop()` mirroring `LoadingService` counter); wire into `api-client.ts` request + BOTH response branches (success + error, mirroring `finalize()` to avoid a stuck spinner); render the existing orphaned `LoadingOverlay` from `root.tsx` conditional on the store — mirroring `LoadingInterceptor` + `app.component.html:2-6`.

## Dropped (dead code, no port)
- `download-manager.service.ts` — output never rendered.
- `splash-screen.service.ts` / component / module — never rendered.

## Correction to the parity report §6 item 11
The report lumped all 4 as open framework gaps. Code shows only 2 are real (preloading, loading spinner); download-manager and splash-screen are Angular dead-code, same class as the other reclassified items.
