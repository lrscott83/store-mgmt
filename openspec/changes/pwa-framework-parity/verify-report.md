# Verify Report — pwa-framework-parity

**Date**: 2026-07-15
**Judging source**: Angular `frontend/src` vs React `frontend-react` source code ONLY, checked against the 12 rules in `docs/migration/playbook-migracion-servicios-angular-react.md`. openspec specs/engram memory NOT used as a correctness source (per explicit instruction) — only consulted to locate the apply-progress narrative, then independently re-verified against source.

**Verdict: PASS WITH WARNINGS** (0 CRITICAL, 1 WARNING, 1 SUGGESTION)

---

## Test & Build Evidence

- `pnpm test` (from `frontend-react/apps/web-store-pos`): **116 files / 1656 tests passed**, 0 failed.
- `pnpm exec tsc --noEmit -p .`: **clean, zero errors**.
- `git diff --stat` matches the claimed WU-1/WU-2 scope exactly: 8 modified files + 4 new files (`preload-heavy-chunks.ts`+test, `loading-store.ts`+test), nothing extraneous.

---

## WU-1 — Post-auth heavy-chunk preload

New: `frontend-react/apps/web-store-pos/app/shared/lib/pwa/preload-heavy-chunks.ts`
Wired: `app/auth/routes/login.tsx:63`, `app/auth/routes/loaders.ts:35` (`guestOnlyLoader`)

Angular mirror: `frontend/src/app/_services/preloading.service.ts:15-54` (`preloadHeavyChunks()`), called from `frontend/src/app/presentation/auth/login/login.component.ts:50` (ctor, already-authenticated branch of `navigateToUserHome()`) and `login.component.ts:171` → `navigateToUserHome()` body at `login.component.ts:179`.

| Rule | Verdict | Evidence |
|---|---|---|
| 5 — React idiom / DI | PASS | Plain exported function, no class/DI wrapper — matches the established repo convention for ported Angular services with no DI needs (`resolveUserHomePath`, `registerServiceWorker`). `preload-heavy-chunks.ts:24`. |
| 10 — Call-site parity | PASS | Angular has exactly 2 `navigateToUserHome()` call-sites containing `preloadHeavyChunks()` (`login.component.ts:50`, `:171`). React wires the port at the exact 2 equivalents: `login.tsx:63` (submit success, before `navigate()`) and `loaders.ts:35` (`guestOnlyLoader`, before `redirect()` — the React analogue of the ctor's already-authenticated branch). No extra, no missing call-sites. |
| 12 — No invention | PASS | Route-chunk targets (`admin/dashboard/routes/dashboard`, `statistics/routes/dashboard`, `reports/routes/today-report`) verified 1:1 against `app/routes.ts:54,57,88` — same 3 routes as Angular's `authPreloadRoutes` array (`/admin/dashboard`, `/statistics/dashboard`, `/reports/today`). The one structural divergence (Angular's `switch` over an array vs. React's 3 literal `import()` calls) is bundler-forced, not invented: Vite/Rollup requires literal specifiers for code-splitting and cannot statically analyze a `forEach`-over-variable loop. Documented inline (`preload-heavy-chunks.ts:9-13`). |
| 4/9 — async/error contract | N/A | Fire-and-forget `void`, matches Angular's `.catch(console.error)`-per-route swallow (never throws to caller) — same resilience contract, verified by `preload-heavy-chunks.test.ts:51-97`. |

**WU-1: 0 issues.**

---

## WU-2 — Global HTTP-loading spinner

New: `frontend-react/apps/web-store-pos/app/shared/lib/stores/loading-store.ts`
Modified: `app/shared/lib/http/api-client.ts`, `app/root.tsx`

Angular mirror: `frontend/src/app/_services/loading.service.ts:5-27` (`LoadingService`, request-count `BehaviorSubject`), `frontend/src/app/_interceptors/loading-interceptor.service.ts:13-22` (`start()`/`finalize(stop())`), `frontend/src/app/app.component.html:2-6` + `app.component.ts:33` (overlay above `<router-outlet>`).

| Rule | Verdict | Evidence |
|---|---|---|
| 4 — reactive state, not degraded to Promise | PASS | Angular's `loading$` is a multi-emission `BehaviorSubject` (rule 4's explicit exception) — correctly mapped to a Zustand store (`useLoadingStore`), not flattened to a `Promise`. `loading-store.ts:16-33`. |
| 5 — React idiom | PASS | Plain `create<LoadingState>()`, structurally identical to `auth-store.ts` (no class, no RxJS, no DI). |
| Counter semantics parity | PASS | `start()`: unconditional increment + `isLoading:true`, matches Angular's unconditional `this.count++; next(true)` (`loading.service.ts:14-18`). `stop()`: `Math.max(0, count-1)` clamp + `isLoading = count>0`, matches Angular's `Math.max(0, this.count-1)` + `if (count===0) next(false)` (`loading.service.ts:20-26`). Verified by 6 unit tests (`loading-store.test.ts`) covering overlap start/start/stop and over-stop clamping. |
| 10 — call-site parity (interceptor) | PASS | `start()` fires at `api-client.ts:24`, the exact React axios equivalent of `intercept()`'s `this.loadingService.start()` (`loading-interceptor.service.ts:15`). |
| **CRITICAL check — `stop()` on every response path** | **PASS** | `api-client.ts:64` calls `useLoadingStore.getState().stop()` as the FIRST, unconditional statement inside the response error handler — before any `isAxiosError`/status branching. This structurally covers every existing return path in the handler (network-error tag `:72-75`, 401 logout `:77-85`, 500 Swal `:87-95`, generic fallthrough `:97`) with a single call, equivalent to RxJS `finalize()` firing once per response/error regardless of which branch handles it (`loading-interceptor.service.ts:18-20`). Success path calls `stop()` at `api-client.ts:56`. Audited every `return`/`Promise.reject` in the handler — all execute after the single `stop()` call, none can bypass it. Covered by 6 new tests (`api-client.test.ts:339-` — start, success-stop, network-error-stop, 401-stop, 500-stop, generic-404-stop). |
| 10 — call-site parity (overlay) | PASS | `root.tsx:64` renders `{isLoading && <LoadingOverlay />}` immediately before `<Outlet />`, matching Angular's overlay-above-`<router-outlet>` placement (`app.component.html:2-7`). |
| 12 — no invention (overlay reuse) | PASS | `LoadingOverlay` (`packages/web-common/src/client/loading-overlay.tsx`) is the SAME pre-existing, previously-orphaned component — zero modifications, no new component, no new dependency (Zustand + axios already in the tree). |
| 2 — migrar ≠ mejorar (request-interceptor defensive code) | **WARNING** | `api-client.ts:25-45` adds a `try/catch` around `StorageService.getTokenFromLocalStorage()` that calls `stop()` before rethrowing, PLUS a second `onRejected` argument to the request interceptor's `.use()` call. Angular's `intercept()` has no equivalent synchronous-failure guard — it calls `start()` then unconditionally returns `next.handle(req).pipe(finalize(stop))`; there is no try/catch around synchronous config-building in Angular. `StorageService.getTokenFromLocalStorage()` (`storage-service.ts:9-11`) is a bare `localStorage.getItem()` call that cannot realistically throw in normal browser conditions, so this is speculative defensive code not present in Angular's contract, not independently unit-tested (confirmed absent from `api-client.test.ts`'s "Global loading spinner" describe block, which only covers the 6 paths listed above), and not justified purely by migration mechanics (rule 2). It is harmless (does not change behavior on any exercised path) but is scope creep beyond what Angular's source specifies and beyond what Strict TDD would allow for new code (added without a covering test). Recommend either removing it (mirror Angular's simpler shape exactly) or adding a test that exercises the throw path — ask before keeping. |

**WU-2: 0 CRITICAL, 1 WARNING.**

---

## Dead-code-stayed-dead check (explicit ask)

| Angular artifact | Rendered/imported anywhere in Angular? | Ported to React? |
|---|---|---|
| `DownloadManagerService` (`_services/download-manager/download-manager.service.ts`) | `app.component.ts:28-31,39` exposes `isDownloading$`/`progress$`/`downloadedSize$`/`totalSize$` and calls `startDownload()`/`updateProgress()`/`completeDownload()`, but **`app.component.html` never references any of them** (grep confirms zero matches) — dead output, never rendered. | **No** — `find`/`grep` across `frontend-react` for `download-manager`/`DownloadManager` return zero hits. Correctly left unported. |
| `SplashScreenComponent`/`SplashScreenModule` (`presentation/splash-screen/`) | `SplashScreenModule`/`SplashScreenComponent` are never imported outside their own directory (grep across all of `frontend/src` for both symbols, excluding the splash-screen dir itself, returns zero hits) — dead component, no route/module wires it in. | **No** — zero hits for `splash`/`Splash` anywhere in `frontend-react`. Correctly left unported. |

**Both confirmed dead in Angular source and correctly absent from React. PASS.**

---

## Summary

| Severity | Count | Item |
|---|---|---|
| CRITICAL | 0 | — |
| WARNING | 1 | `api-client.ts` request-interceptor try/catch + second `onRejected` arg is defensive code not present in Angular's `loading-interceptor.service.ts`, untested, harmless but scope-creep (rule 2). Ask before keeping or remove to mirror Angular exactly. |
| SUGGESTION | 1 | Consider a short code comment cross-reference from `preload-heavy-chunks.ts` back to `routes.ts` line numbers so route-path drift is caught by a future reviewer without re-deriving the mapping (currently only asserted by test literals, not by a static route-table reference). |

**Final verdict: PASS WITH WARNINGS.** No CRITICAL issues block archive. The single WARNING is a minor, non-behavior-affecting scope-creep item the user should be asked about (remove or keep+test) before archiving, per playbook rule 2 ("migrar ≠ mejorar", assumptions on architecture changes must be confirmed).
