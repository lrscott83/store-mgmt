# Verification Report: pwa-offline-shell

**Change**: `pwa-offline-shell` · **Phase**: verify · **Date**: 2026-07-28
**Mode**: hybrid (openspec file + engram)
**Branch state**: already fast-forward merged to `main` (`957cab3..e1f528d`), pushed to origin.
Verified commits: `465e9df`..`81b2f67` (7 implementation commits) + `af27018` (apply-progress doc).
`e1f528d` is an unrelated backend billing docs commit — out of scope, ignored.

## Completeness (tasks.md vs code)

25/30 tasks marked done, matching actual code state:

| Phase | Status | Evidence |
|---|---|---|
| 0 Prerequisite deps | DONE | `workbox-build@7.4.1`, `esbuild@0.25.12` present as explicit devDeps in `package.json:49,57` |
| 1 Shared precache contract | DONE | `scripts/precache-patterns.mjs` exists, exports `PRECACHE_GLOB_PATTERNS`/`PRECACHE_GLOB_IGNORES`/`MAX_FILE_SIZE_BYTES` |
| 2 Verifier + RED proof | DONE | `scripts/verify-sw-precache.mjs` exists; RED evidence in apply-progress.md independently corroborated (see TDD section) |
| 3 sw-strategy.ts TDD | DONE | `sw-strategy.ts` + 12-case table-driven test, all pass |
| 4 service-worker.ts rewrite | DONE | whole-file rewrite confirmed, no dead code survives |
| 5 Build chain wiring | DONE | `package.json:6` build script chain confirmed; `build-sw.mjs` confirmed |
| 6 Dead-code cleanup | DONE | `app-layout.tsx` sender block removed, `useEffect` import retained (still used) |
| 7 Full gate verification | DONE | reran all gates myself, see below — all green |
| 8 Manual offline walkthrough | **NOT DONE** | `[ ]` in tasks.md; no human has run it; no Playwright/E2E exists to substitute |
| 9 Debug-log removal | **NOT DONE (intentionally blocked)** | `[SW]`/`[PWA]` logs still present, per user decision `decision/pwa-temp-logs-removal-timing` — deferred to last commit, after Phase 8 sign-off |

## Gates — run by me, fresh (not quoting apply-progress)

- `pnpm test` (forced, non-cached): **141 test files, 2091 tests, all passed.**
- `pnpm -C apps/web-store-pos exec tsc --noEmit` (after `rm -rf .react-router` + `react-router typegen`): **clean, 0 errors.**
- `pnpm -C apps/web-store-pos build` (clean `build/` dir): **exit 0.** `verify-sw-precache: OK — 129 precached entries; shell and route manifest each present exactly once.`
- Independently re-derived from the built `build/client/service-worker.js` (not trusting the verifier's own claim):
  - `"url":"index.html"` occurs exactly **1** time.
  - `"url":"assets/manifest-*.js"` occurs exactly **1** time (`assets/manifest-7c3d2092.js`).
  - `"url":"service-worker.js"` occurs **0** times (confirms the shared ignore list works).
  - `app-shell-v3` present, no `app-shell-v2` / `APP_CHUNKS` token anywhere in the built bundle.
  - 129 total `"revision"` entries — matches apply-progress's claim.
  - Manifest includes: `manifest.webmanifest` (1), `favicon.png` (1), 6 `images/help/*.png`, 5 `fonts/inter/*.woff2`, 8 `icons/*.png` — matches on-disk `public/icons/` (8 files, not the "9" the code comment claims — SUGGESTION below).
- `rg -n "APP_CHUNKS_CACHE|PRECACHE_APP_CHUNKS|assets-manifest\.json"` across `app/` and `scripts/`: **zero matches** (task 7.4 gate reproduced independently).
- `turbo.json`: `test` task depends only on `^test`, never `build` — confirms D9 (the precache gate lives only in `build`, meaning the precache logic itself has ZERO Vitest coverage by design, not by omission).

## TDD Evidence — challenged, not accepted at face value

- **sw-strategy.ts (3.1/3.2)**: apply-progress claims RED (`Failed to resolve import "../sw-strategy"`) then GREEN (12/12). Both test and implementation landed in commit `5052237` together (single commit, as expected — only the GREEN state is committed, RED happened pre-commit). The 12 cases in `sw-strategy.test.ts` map 1:1 onto the spec's routing scenarios (navigate→shell root+non-root, `/api` exact, `/api/products`, `/apiary/report.js` non-exclusion, non-GET x2, cross-origin, JS/CSS/font/icon cache-first) — genuine scenario coverage, not just a happy path.
- **verify-sw-precache.mjs RED proof (2.2)**: apply-progress quotes a captured `exit 1` run listing exactly 10 missing paths against "the CURRENT unfixed build." I independently corroborated this is credible, not fabricated: `git show 957cab3:.../vite.config.ts` shows the pre-change `injectManifest.globPatterns` was `['**/*.{js,css,html,woff2}', 'icons/*.png']` — literally missing `webmanifest`, `images/**`, and `favicon.png` patterns, which is exactly the defect class the quoted RED output reports. The RED proof is consistent with the actual prior source, not just asserted.
- **No automated regression test exists for either RED scenario going forward.** The verifier's own correctness is proven once, manually, during apply — per design's explicit Testing Strategy ("Unit: build scripts: NONE"). This is a documented, intentional design decision (D9), not an omission, but it does mean a future regression in `verify-sw-precache.mjs` itself would only be caught by the build gate on the next build, never by `pnpm test`.

## Spec Compliance Matrix

### pwa-precache-build

| Requirement | Verdict | Evidence |
|---|---|---|
| Injection runs after client build | PASS | `package.json:6` order: `react-router build && build-sw.mjs && verify-sw-precache.mjs` |
| Manifest contains app shell exactly once | PASS | independently confirmed 1x `index.html`, 1x `assets/manifest-*.js` |
| Manifest covers every matching file | PASS | verifier ran clean (0 missing) against a real build; 129/129 |
| Exactly one `__WB_MANIFEST` injection point | PASS | `build-sw.mjs:54-62` pre-inject occurrence assert; `PRECACHE_MANIFEST` read once at module scope in `service-worker.ts:23` |
| Verification is a mandatory build gate | PASS | wired into `pnpm build`, not optional; confirmed `turbo.json` test task does NOT depend on build (D9) |
| Dead manifest-fetch path absent | PASS | zero matches for `assets-manifest.json`/`PRECACHE_APP_CHUNKS` in `app/` and `scripts/` |

### pwa-offline-shell

| Requirement | Verdict | Evidence |
|---|---|---|
| Offline navigation serves precached shell | **UNVERIFIED** | routing decision (`navigate → shell`) unit-tested; actual browser-offline rendering NOT proven — Phase 8 not run |
| Static assets cache-first, miss falls through without crashing | **UNVERIFIED (partially)** | classification unit-tested (JS/CSS/font/icon → cache-first); the actual cache-miss-then-fetch runtime behavior in `service-worker.ts:107-124` has ZERO automated coverage (excluded from tsc, no SW test harness) — only the pending manual walkthrough exercises it |
| API / cross-origin bypass cache | PASS | `sw-strategy.test.ts` covers `/api` exact, `/api/products`, cross-origin, AND the negative case `/apiary/report.js` (not falsely excluded) |
| New worker version replaces stale shell, no permanent staleness | **UNVERIFIED** | `skipWaiting`/`SKIP_WAITING` message-handler logic exists and matches design, but has no automated test; only Phase 8.5 exercises it |
| Precache consolidated to single named cache | PASS (static) / UNVERIFIED (runtime) | source confirms `PRECACHE_NAME='app-shell-v3'`, `activate` prunes all other caches; no automated test proves this at runtime — only Phase 8.2 (Cache Storage inspection) does |
| Dead precache-refresh handler removed | PASS | zero matches for `PRECACHE_APP_CHUNKS` in worker or callers; `app-layout.tsx` sender block deleted, `useEffect` import retained |

**Acceptance Procedure (spec-defined, mandatory)**: NOT RUN. The spec's own text states: *"A run of this procedure that fails any step is a regression against this spec and MUST block the change from shipping, exactly as a failing automated test would."* This has not happened. There is no Playwright/E2E in this repo to substitute for it.

## Design Coherence

All 10 architecture decisions (D1-D10) in design.md were checked against the current code and hold:
- D1/D2/D3 (post-build injectManifest, external bundle path, esbuild IIFE options): confirmed in `build-sw.mjs`.
- D4 (single module-level manifest read): confirmed, `service-worker.ts:23`.
- D5 (pure typechecked routing): confirmed, `sw-strategy.ts` has no `caches`/`self` dependency.
- D6 (exclude `/api`, don't allowlist): confirmed, `isApiPath` in `sw-strategy.ts:16-18`.
- D7 (stable cache name, prune on activate): confirmed, `PRECACHE_NAME='app-shell-v3'`, `activate` handler.
- D8 (`cache:'reload'` on install): confirmed, `service-worker.ts:55`.
- D9 (build gate not test gate): confirmed via `turbo.json`.
- D10 (dev has no precache, `globPatterns:[]`): confirmed, `vite.config.ts:32`.

Two documented, non-behavioral deviations from design (both self-reported in apply-progress and independently confirmed harmless):
1. `vite.config.ts`'s injectManifest block also dropped `globDirectory`/`maximumFileSizeToCacheInBytes` (design only called out emptying `globPatterns`). Harmless — empty patterns match nothing regardless.
2. Explanatory comments in `service-worker.ts`/`app-layout.tsx` avoid the literal grep tokens (`PRECACHE_APP_CHUNKS`, `assets-manifest.json`) so task 7.4's own grep gate doesn't self-fail on prose. Confirmed: comments read naturally without those exact strings.

## Scope Check

No implementation beyond what the specs/design asked for. DevDeps added (`workbox-build`, `esbuild`) match design exactly. No unrequested refactors found outside the 7 planned commits.

## Findings

### CRITICAL

1. **The spec's own mandatory acceptance gate (Phase 8 / "Acceptance Procedure") has not been run, and the change already shipped to `main`.** No automated test proves offline rendering — because none exists in this repo (no Playwright/E2E) — and the documented substitute (manual DevTools walkthrough) has not been executed by a human. Every requirement in `pwa-offline-shell` concerning actual browser runtime behavior (offline navigation rendering, cache-first serving under real network conditions, activate-time cache pruning, stale-shell replacement via the update flow) is therefore **UNVERIFIED**, not proven false, but not proven true. The spec explicitly states failing this procedure "MUST block the change from shipping, exactly as a failing automated test would" — that gate has been bypassed by already merging to `main`. This is a process/release risk, not evidence of a code defect; the code review above found nothing that contradicts the design, but that is not equivalent to proof of correct offline behavior. File: `openspec/changes/pwa-offline-shell/specs/pwa-offline-shell/spec.md` (Acceptance Procedure section), `openspec/changes/pwa-offline-shell/tasks.md:74-81` (Phase 8, all unchecked).

### WARNING

1. **Zero automated test coverage for `service-worker.ts`'s actual runtime logic** (install/activate/fetch bodies: cache-lifecycle, cache-miss-then-fetch fallback, activate-time pruning, `SKIP_WAITING` handling). This is a deliberate, documented design decision (`tsconfig.json:9` excludes the file from typechecking; no service-worker test environment exists; design.md's Testing Strategy table explicitly says "Unit: build scripts: NONE"), not a hidden gap — but it means the manual Phase 8 walkthrough is the ONLY verification this behavior will ever get. File: `frontend-react/apps/web-store-pos/app/service-worker.ts:39-138`.
2. **`[SW]`/`[PWA]` TEMP debug logs are still present** (7 in `service-worker.ts`, 7 in `service-worker-registration.ts` — one literally says "Remove before commit" and was not removed). This is intentional per explicit user decision (engram `decision/pwa-temp-logs-removal-timing`): removal is deferred to a dedicated last commit, gated on Phase 8 sign-off (task 9.1, correctly marked BLOCKED, not silently skipped). Not a defect — flagging so it isn't lost track of. Files: `frontend-react/apps/web-store-pos/app/service-worker.ts:40-136`, `frontend-react/apps/web-store-pos/app/shared/lib/pwa/service-worker-registration.ts:25-54`.
3. **The change is already on `main` (and pushed to origin) without its own acceptance gate having passed.** This is a repository-state risk independent of code correctness: if the pending Phase 8 walkthrough fails, the fix will have to be a follow-up commit against `main` rather than a pre-merge fix, and any deploy cut from `main` in the meantime ships unverified offline behavior.

### SUGGESTION

1. `precache-patterns.mjs:8` comment says "9 PWA install icons" but only 8 exist on disk (`public/icons/`) and 8 are correctly precached — cosmetic comment drift, not a functional defect (the verifier compares disk vs. manifest dynamically, never against this hardcoded count).
2. `service-worker.ts:117-119` — the fire-and-forget `caches.open(PRECACHE_NAME).then((cache) => cache.put(request, responseToCache))` inside the cache-first fetch handler has no `.catch`. If `cache.put` rejects (e.g., `QuotaExceededError`), it becomes an unhandled promise rejection inside the service-worker global scope (visible as a console warning). It does not affect the returned response (not awaited by `respondWith`) and does not violate the "does not crash the worker" spec requirement in any observable way, but adding a `.catch(() => {})` would be cheap defensive hygiene.
3. No automated regression exists to re-prove the Phase 2.2 RED scenario (verifier correctly failing against an incomplete manifest) going forward — by design (D9), any future regression in `verify-sw-precache.mjs`'s own logic would only surface at the next `pnpm build`, never in CI/`pnpm test`.

## Out of Scope (confirmed correctly excluded, not re-flagged)

- Dev/preview port separation + stale comment at `service-worker-registration.ts:74-79` (fast-follow, `todo/dev-preview-port-separation`).
- nginx gzip/MIME verification (blocked, no Docker socket).

## Verdict: PASS WITH WARNINGS

**What this verdict covers**: the build-time precache pipeline (`pwa-precache-build`) is fully implemented, gate-enforced, and independently re-verified by me end-to-end (fresh `pnpm test`, `tsc --noEmit`, `pnpm build` all green; manifest contents independently re-derived from the built bundle, not just trusted from the verifier's own stdout). All dead code from the prior implementation is confirmed gone. The routing-decision unit (`sw-strategy.ts`) is genuinely TDD'd with scenario coverage matching the spec, not just a happy-path test.

**What this verdict does NOT cover**: actual offline rendering in a real browser. That is unproven. No automated test in this repo can prove it (no Playwright/E2E), and the documented manual substitute (Phase 8) has not been run by a human. This is not a "the code is probably fine" hand-wave — it is the literal, spec-defined acceptance gate, explicitly still pending, on code that is already on `main`. Treat the CRITICAL finding above as the reason this is "PASS WITH WARNINGS" rather than a clean "PASS": everything checkable from source and from the build machinery checks out, but the one thing the spec calls the actual test of the feature has not happened.

Recommendation: run Phase 8 (manual DevTools walkthrough) before any further deploy from `main` that depends on offline behavior; if it passes, proceed to Phase 9 (debug-log removal) and then `sdd-archive`. If it fails, treat it as a regression against `pwa-offline-shell` per the spec's own words and return to the `service-worker.ts` rewrite for diagnosis — do not patch around it.
