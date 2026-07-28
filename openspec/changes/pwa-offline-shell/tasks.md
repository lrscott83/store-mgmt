# Tasks: PWA Offline Shell

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450-580 (new: patterns/build-sw/verifier/sw-strategy+test ~240; rewritten service-worker.ts ~300 diff; app-layout/vite.config/package.json ~25) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is fixed to commits-only on a single branch, no PR mechanism exists this run |
| Suggested split | N/A (no PRs). Work units below map to individual commits for reviewability |
| Delivery strategy | commits-only, new branch cut from current branch (`main`), no chaining, no `size:exception` |
| Chain strategy | pending (not applicable — no PR chain in this delivery mode) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

Informational only: risk is High by line count, but the user has already fixed delivery to
commits-only on one branch. `sdd-apply` must NOT ask about PR splitting; it should sequence
work-unit commits per the order below.

### Suggested Work Units (commits, not PRs)

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| 1 | Add `workbox-build`/`esbuild` devDeps | `chore(pwa): add workbox-build/esbuild devDeps` | Hard prerequisite, must land first |
| 2 | Shared patterns + verifier + RED proof | `feat(pwa): add precache patterns and build-gate verifier` | Verifier proven failing against current build |
| 3 | `sw-strategy.ts` + tests | `feat(pwa): add typechecked resolveStrategy` | TDD red→green in one commit |
| 4 | `service-worker.ts` whole-file rewrite | `refactor(pwa): rewrite service worker for post-build precache` | Single edit, never partial |
| 5 | `build-sw.mjs` + build chain + vite.config.ts | `build(pwa): wire post-build manifest injection into pnpm build` | Verifier now GREEN |
| 6 | `app-layout.tsx` dead-sender cleanup | `chore(pwa): remove dead PRECACHE_APP_CHUNKS sender` | Independent, can land any time after Unit 1 |
| 7 | Full gate + manual walkthrough evidence | `test(pwa): verify build gate and manual offline walkthrough` | No code change, verification only |

## Phase 0: Prerequisite Dependency (sequential, blocks everything)

- [ ] 0.1 Add `workbox-build@7.4.1` and `esbuild@0.25.12` as explicit `devDependencies` in `apps/web-store-pos/package.json`; run `pnpm install`. [spec: pwa-precache-build "Manifest injection runs after the client build"]

## Phase 1: Shared Precache Contract (sequential, depends on 0.1)

- [ ] 1.1 Create `apps/web-store-pos/scripts/precache-patterns.mjs` exporting `PRECACHE_GLOB_PATTERNS`, `PRECACHE_GLOB_IGNORES` (MUST include `'service-worker.js'` and `'assets/server-build-*'`), `MAX_FILE_SIZE_BYTES`. [spec: pwa-precache-build "Manifest covers every file matching precache patterns" + "service worker never precaches itself"]

## Phase 2: Verifier — RED before the fix lands (sequential)

- [ ] 2.1 Create `apps/web-store-pos/scripts/verify-sw-precache.mjs`: `getManifest()` with shared patterns, diff vs on-disk `build/client`, assert `index.html` present exactly once and exactly one `assets/manifest-*.js`, exit non-zero listing missing paths. [spec: pwa-precache-build "Precache manifest contains the app shell", "On-disk asset absent from manifest fails the build"]
- [ ] 2.2 RED proof: rebuild with the CURRENT (unfixed) `vite-plugin-pwa closeBundle` injection, run `node scripts/verify-sw-precache.mjs` against that `build/client`, confirm exit 1 listing `index.html`, `assets/manifest-*.js`, `manifest.webmanifest`, `favicon.png`, the 6 `images/help/*.png`. Capture this output as regression evidence. [spec: pwa-precache-build "Missing shell fails the build"]

## Phase 3: `sw-strategy.ts` TDD (sequential, independent of Phase 2)

- [ ] 3.1 RED: write `apps/web-store-pos/app/shared/lib/pwa/__tests__/sw-strategy.test.ts` — table-driven: navigate→`shell`; `/api` + `/api/products`→`passthrough`; `/apiary/report.js`→`cache-first`; non-GET→`passthrough`; cross-origin→`passthrough`; JS/CSS/font/icon→`cache-first`. Run `pnpm test`, confirm fails (module missing). [spec: pwa-offline-shell "API and cross-origin requests bypass the cache", "Non-API path prefix is not falsely excluded"]
- [ ] 3.2 GREEN: create `apps/web-store-pos/app/shared/lib/pwa/sw-strategy.ts` — `resolveStrategy({url, method, mode, selfOrigin})`, order: non-GET → cross-origin → `/api` (exact or `/api/` prefix) → navigate → cache-first. Run `pnpm test`, confirm green. [spec: pwa-offline-shell "Static asset requests served cache-first"]

## Phase 4: `service-worker.ts` whole-file rewrite (sequential, depends on 3.2)

- [ ] 4.1 Rewrite `apps/web-store-pos/app/service-worker.ts` in ONE edit: `PRECACHE_NAME='app-shell-v3'`; `const PRECACHE_MANIFEST = self.__WB_MANIFEST ?? []` read once; install with `cache:'reload'` + atomic `addAll`; activate prunes every cache != `PRECACHE_NAME` (delete ALL `APP_CHUNKS_CACHE`/fonts-cache references, including the `message` handler at old L139); fetch delegates to `resolveStrategy`; remove the dead `PRECACHE_APP_CHUNKS` message handler; remove the stale old-L63 "network-first for navigation" comment. Confirm `grep -n APP_CHUNKS_CACHE app/service-worker.ts` is empty. [spec: pwa-offline-shell "New worker version replaces a stale shell", "Precache is consolidated into a single named cache", "Dead precache-refresh message handler is removed"]

## Phase 5: Build script + chain wiring (sequential, depends on 4.1 + 1.1)

- [ ] 5.1 Create `apps/web-store-pos/scripts/build-sw.mjs`: esbuild-bundle `app/service-worker.ts` (`iife`, `es2020`, `browser`, `minify:true`, `sourcemap:false`) → `build/.sw-bundle.js`; assert `self.__WB_MANIFEST` occurs exactly once pre-inject (throw a named error otherwise); `injectManifest` (shared patterns) → `build/client/service-worker.js`; `rm` the temp bundle. [spec: pwa-precache-build "Exactly one injection point in the worker bundle"]
- [ ] 5.2 Update `apps/web-store-pos/package.json` `build` script to `react-router build && node scripts/build-sw.mjs && node scripts/verify-sw-precache.mjs`. [spec: pwa-precache-build "Verification step is a mandatory build gate"]
- [ ] 5.3 (parallelizable with 5.1) Update `apps/web-store-pos/vite.config.ts`: `injectManifest.globPatterns: []` + comment marking it non-authoritative (real patterns live in `precache-patterns.mjs`). [design D10]

## Phase 6: Dead-code cleanup (parallelizable, any point after 0.1)

- [ ] 6.1 In `apps/web-store-pos/app/shared/components/app-layout.tsx`, delete only the dead `PRECACHE_APP_CHUNKS` sender block; KEEP the `useEffect` import — still used by `useAutoCollapseSidebar`. [spec: pwa-offline-shell "No dead handler or sender remains"]

## Phase 7: Full gate verification (sequential, depends on Phase 5 + 6)

- [ ] 7.1 Run `pnpm build` end-to-end — confirm `verify-sw-precache.mjs` now exits 0 (GREEN).
- [ ] 7.2 Inspect `build/client/service-worker.js`: exactly one `"url":"index.html"`, exactly one `assets/manifest-*.js` entry.
- [ ] 7.3 Run `pnpm test` (full suite) and `pnpm -C apps/web-store-pos exec tsc --noEmit` — both green.
- [ ] 7.4 `grep -rn 'PRECACHE_APP_CHUNKS\|assets-manifest' app/` returns nothing.

## Phase 8: Manual offline acceptance walkthrough (sequential, final, real acceptance gate)

- [ ] 8.1 `pnpm build`, serve `build/client` (e.g. `npx serve build/client -l 3333`); unregister existing SW + clear site data; reload; wait for `activated`.
- [ ] 8.2 Cache Storage: only `app-shell-v3` exists (no `app-chunks-v1`/`fonts-v1`), containing `index.html`, one `assets/manifest-*.js`, `manifest.webmanifest`, `favicon.png`, 6 `images/help/*.png`, 5 `fonts/inter/*.woff2`.
- [ ] 8.3 DevTools Network → Offline. Type-load directly: `/login`, `/`, `/help/tutorial` (all 6 images render), `/sales/new`, `/inventory/available` — each renders the app shell, never a browser error page.
- [ ] 8.4 Type-load directly: `/admin/dashboard`, `/management/users`, `/profile/edit` — view renders; in-app API calls MAY fail (expected, out of scope).
- [ ] 8.5 Back online: rebuild with a trivial change, reload twice, confirm the update prompt appears and accepting it serves the new version.
- [ ] 8.6 Any failed step blocks shipping — return to Phase 4 for diagnosis; do not patch the checklist itself.

## Phase 9: BLOCKED — requires explicit user approval, do not fold in elsewhere

- [ ] 9.1 **BLOCKED — do not execute without explicit user sign-off.** Remove the `[SW]`/`[PWA]` TEMP debug `console.log` calls from `service-worker.ts` and `service-worker-registration.ts`. Ask the user before touching this file set.

## Explicitly out of scope (no task exists for these)

- Dev/preview port separation and the stale `service-worker-registration.ts:74-79` comment (engram `todo/dev-preview-port-separation`, user decision 2026-07-28).
- nginx gzip/MIME verification (blocked, no Docker socket).
