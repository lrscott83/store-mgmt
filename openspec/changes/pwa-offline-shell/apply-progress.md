# Apply Progress: PWA Offline Shell

**Change**: `pwa-offline-shell` · **Mode**: Strict TDD · **Branch**: `feat/pwa-offline-shell`
**Batch**: 1 (first batch — no prior progress to merge)
**Delivery**: commits-only, one commit per work unit, no PRs/chaining/size:exception

## Status

25/30 tasks complete (Phases 0-7 done). Phase 8 (manual DevTools offline
walkthrough) and Phase 9 (debug-log removal, gated on Phase 8 sign-off) remain
— both require a human, not executable by this session.

## Commits Created (in order, on `feat/pwa-offline-shell`)

| # | Hash | Subject |
|---|------|---------|
| 1 | `465e9df` | `chore(pwa): add workbox-build/esbuild devDeps` |
| 2 | `22e8bf2` | `feat(pwa): add precache patterns and build-gate verifier` |
| 3 | `5052237` | `feat(pwa): add typechecked resolveStrategy` |
| 4 | `56eb871` | `refactor(pwa): rewrite service worker for post-build precache` |
| 5 | `022f759` | `build(pwa): wire post-build manifest injection into pnpm build` |
| 6 | `af53bf6` | `chore(pwa): remove dead PRECACHE_APP_CHUNKS sender` |
| 7 | `81b2f67` | `test(pwa): verify build gate end-to-end` |

All 7 commits land on top of `6689f40` (the SDD planning commit already on this
branch). No PRs, no chaining, no `size:exception` — per the fixed
`delivery_strategy: commits-only`.

## Completed Tasks (Phases 0-7)

- [x] 0.1 Added `workbox-build@7.4.1` + `esbuild@0.25.12` as explicit devDeps
      of `apps/web-store-pos/package.json`; `pnpm install` re-linked both into
      `apps/web-store-pos/node_modules` (confirmed via `readlink -f`).
- [x] 1.1 Created `scripts/precache-patterns.mjs` — `PRECACHE_GLOB_PATTERNS`,
      `PRECACHE_GLOB_IGNORES` (includes `'service-worker.js'` AND
      `'assets/server-build-*'`), `MAX_FILE_SIZE_BYTES`.
- [x] 2.1 Created `scripts/verify-sw-precache.mjs` — computes on-disk files
      matching shared patterns via `getManifest()`, extracts the manifest
      actually injected into `build/client/service-worker.js` (string-aware
      bracket-depth scan, robust to minification/renaming), diffs the two,
      and asserts `index.html` + `assets/manifest-*.js` are each present
      exactly once.
- [x] 2.2 RED proof captured against the CURRENT (unfixed) build — see
      "Regression Evidence" below.
- [x] 3.1 RED: wrote `sw-strategy.test.ts` (12 table-driven cases). Confirmed
      failing — `Failed to resolve import "../sw-strategy"` (module did not
      exist yet).
- [x] 3.2 GREEN: created `sw-strategy.ts` — `resolveStrategy` pure function,
      order non-GET → cross-origin → `/api` (exact/prefix) → navigate →
      cache-first. All 12 tests pass. `tsc --noEmit` clean.
- [x] 4.1 Rewrote `app/service-worker.ts` in ONE edit. `PRECACHE_NAME =
      'app-shell-v3'`; `PRECACHE_MANIFEST` read once at module scope; install
      uses `cache:'reload'` + atomic `addAll`; activate prunes every cache
      `!== PRECACHE_NAME`; fetch delegates entirely to `resolveStrategy`; dead
      `PRECACHE_APP_CHUNKS` message handler removed; stale "network-first for
      navigation" comment removed. `grep -n APP_CHUNKS_CACHE
      app/service-worker.ts` → empty (confirmed).
- [x] 5.1 Created `scripts/build-sw.mjs` — esbuild IIFE bundle (es2020,
      browser, minify, no sourcemap, legalComments:none) →
      `build/.sw-bundle.js`; pre-injection occurrence assert on
      `self.__WB_MANIFEST` (throws a named error if != 1); `injectManifest`
      with shared patterns → `build/client/service-worker.js`; temp bundle
      removed after (confirmed absent post-build).
- [x] 5.2 `package.json` build script →
      `react-router build && node scripts/build-sw.mjs && node scripts/verify-sw-precache.mjs`.
- [x] 5.3 `vite.config.ts` `injectManifest.globPatterns: []` +
      non-authoritative comment; `globDirectory` removed (harmless — empty
      patterns match nothing regardless).
- [x] 6.1 Deleted the dead `PRECACHE_APP_CHUNKS` sender block in
      `app-layout.tsx`; kept the `useEffect` import (still used by
      `useAutoCollapseSidebar`).
- [x] 7.1 Clean rebuild (`rm -rf build .react-router && pnpm build`):
      `verify-sw-precache: OK — 129 precached entries; shell and route
      manifest each present exactly once.` Exit 0.
- [x] 7.2 Inspected `build/client/service-worker.js`: exactly one
      `"url":"index.html"`, exactly one `assets/manifest-*.js` entry
      (`assets/manifest-7c3d2092.js` on the clean rebuild).
- [x] 7.3 `pnpm test`: 141 files / 2091 tests passed. `tsc --noEmit`: clean
      (0 errors).
- [x] 7.4 `grep -rn 'PRECACHE_APP_CHUNKS\|assets-manifest' app/`: no matches.

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|------|-----|-------|----------|
| 2.1/2.2 verify-sw-precache.mjs | Ran verifier against the CURRENT (unfixed) build → exit 1, 10 missing paths listed (build-level RED, no test framework — this IS the automated gate replacing the missing E2E test) | N/A at this point — the fix (Phases 4-5) lands the GREEN in a later task | — |
| 3.1/3.2 sw-strategy.ts | Wrote `sw-strategy.test.ts` first; ran `pnpm exec vitest run app/shared/lib/pwa/__tests__/sw-strategy.test.ts` → failed: `Failed to resolve import "../sw-strategy". Does the file exist?` | Created `sw-strategy.ts`; re-ran same command → 12/12 passed | No refactor needed — implementation matched the design contract on the first pass |
| 5.1/7.1 build chain (closes the loop opened at 2.2) | (RED already captured at 2.2) | `pnpm build` end-to-end after Phases 4-5 landed → `verify-sw-precache.mjs` exits 0, 129 entries | — |

## Regression Evidence (Task 2.2 — RED proof, captured BEFORE any fix landed)

Command: `node scripts/verify-sw-precache.mjs` run against `build/client`
produced by the CURRENT (unfixed) build — `vite-plugin-pwa`'s in-build
`closeBundle` injection with the OLD incomplete `globPatterns`
(`**/*.{js,css,html,woff2}` + `icons/*.png`, no `webmanifest`/images/favicon,
and no post-build re-glob against the finished `build/client`).

```
verify-sw-precache: FAILED

- 10 on-disk asset(s) matching the shared precache patterns are missing from the injected manifest:
  - assets/manifest-4cde2a13.js
  - favicon.png
  - images/help/add-cat-dialog.png
  - images/help/add-entry-dialog.png
  - images/help/add-product-btn.png
  - images/help/add-product-dialog.png
  - images/help/menu.png
  - images/help/register.png
  - index.html
  - manifest.webmanifest

- expected exactly one "index.html" entry in the precache manifest, found 0

- expected exactly one "assets/manifest-*.js" entry in the precache manifest, found 0

exit=1
```

This exactly matches the design.md/tasks.md prediction (10 missing paths:
index.html, assets/manifest-*.js, manifest.webmanifest, favicon.png, 6
images/help/*.png).

## Gate Results (this batch, final run before returning)

- `pnpm test` (from `frontend-react/apps/web-store-pos`): **141 files, 2091
  tests, all passed.**
- `pnpm -C apps/web-store-pos exec tsc --noEmit`: **clean, 0 errors.**
- `pnpm -C apps/web-store-pos build`: **succeeds end-to-end.**
  `verify-sw-precache.mjs` exits 0 — "OK — 129 precached entries; shell and
  route manifest each present exactly once."

## Deviations from Design

None material. Two small, non-behavioral notes:

1. `vite.config.ts`'s `injectManifest` block dropped `globDirectory` and
   `maximumFileSizeToCacheInBytes` along with the old `globPatterns` (design
   only explicitly called out emptying `globPatterns`). Harmless: with
   `globPatterns: []` nothing matches regardless of directory/size limit, and
   the plugin still resolves `virtual:pwa-register` + serves the dev worker as
   required by D10. Flagging for visibility, not because it changes behavior.
2. Comments explaining the removed dead-code paths in `service-worker.ts` and
   `app-layout.tsx` were phrased to avoid the literal strings
   `PRECACHE_APP_CHUNKS` / `assets-manifest.json`, since task 7.4's grep gate
   scans `app/` for those exact tokens. This keeps the explanatory comments
   useful without tripping the gate designed to catch *live* references.

## Issues Found

None — the whole build chain, verifier, and worker rewrite worked as designed
on the first implementation pass. The only friction was self-inflicted: doing
a `rm -rf .react-router` to force a "clean" rebuild also deletes
`react-router typegen`'s output, which `tsc` depends on for `app/root.tsx`'s
`./+types/root` import — unrelated to this change, fixed by re-running
`react-router typegen` before `tsc --noEmit`. Not a repo defect; noting it so
a future clean-checkout run isn't mistaken for a regression.

## Remaining Tasks

- [ ] 8.1-8.6 Manual offline DevTools acceptance walkthrough — **requires a
      human**, cannot be executed by this session. Exact steps (from
      tasks.md / spec's Acceptance Procedure):
  1. `pnpm build`, then serve `build/client` (e.g.
     `npx serve build/client -l 3333`; `localhost` is a secure context).
  2. DevTools → Application → Service Workers → **Unregister**; Storage →
     **Clear site data**; reload; wait for **activated**.
  3. Cache Storage: confirm only `app-shell-v3` exists (no `app-chunks-v1` /
     `fonts-v1`), containing `index.html`, exactly one
     `assets/manifest-*.js`, `manifest.webmanifest`, `favicon.png`, the 6
     `images/help/*.png`, the 5 `fonts/inter/*.woff2`.
  4. DevTools → Network → **Offline**. Type-load directly (address bar, not
     client navigation) each of: `/login`, `/`, `/help/tutorial` (verify all
     6 images render), `/sales/new`, `/inventory/available` — each MUST
     render the app shell, never a browser network-error page.
  5. Type-load directly: `/admin/dashboard`, `/management/users`,
     `/profile/edit` — view MUST render; in-app API calls MAY fail (expected,
     out of scope).
  6. Back online: rebuild with a trivial change, reload twice, confirm the
     "¡Nueva versión disponible!" update prompt appears and accepting it
     serves the new version.
  7. Any failed step blocks shipping — return to the `service-worker.ts`
     rewrite for diagnosis; do not patch the checklist itself.
- [ ] 9.1 **BLOCKED pending Phase 8 sign-off** (per user decision
      2026-07-28, engram `decision/pwa-temp-logs-removal-timing`): remove the
      `[SW]`/`[PWA]` `console.info` debug logs from `service-worker.ts` and
      `service-worker-registration.ts`, as the LAST commit, only after the
      manual walkthrough above passes. Do NOT fold into any other commit.

## Workload / PR Boundary

- Mode: commits-only, single branch, no PR mechanism this run.
- Current work unit: N/A — all 7 planned work units for this batch are
  committed.
- Boundary: this batch starts from `6689f40` (SDD planning artifacts already
  committed) and ends at `81b2f67` (`test(pwa): verify build gate end-to-end`).
  Rollback is per-commit; reverting `022f759` restores
  `"build": "react-router build"`; reverting `56eb871` restores
  `app-shell-v2` (a different worker script, so update detection fires and
  `activate` prunes on already-updated devices).
- Estimated review budget impact: ~450-580 changed lines across 7 commits,
  as forecast in tasks.md's Review Workload Forecast (informational only —
  delivery is fixed to commits-only, no PR splitting decision was needed).

## Out of Scope (unchanged, no code written)

- Dev/preview port separation + stale `service-worker-registration.ts:74-79`
  comment (engram `todo/dev-preview-port-separation`).
- nginx gzip/MIME verification (blocked, no Docker socket).

## Hands Off (confirmed untouched)

`docs/plans/2026-07-28-billing-e2e-coverage-design.md` and
`docs/plans/2026-07-28-billing-e2e-coverage-plan.md` remain untracked and
unmodified (verified via `git status --short` before every commit in this
batch). A third untracked file appeared mid-session from an unrelated
process, `docs/plans/2026-07-28-billing-new-endpoints-test-suites.md` — also
left untouched, not staged, not committed.
