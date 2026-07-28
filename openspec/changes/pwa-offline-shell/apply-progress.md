# Apply Progress: PWA Offline Shell

**Change**: `pwa-offline-shell` · **Mode**: Strict TDD · **Branch**: `feat/pwa-offline-shell`
**Batch**: 2 (fix-up of verify-report SUGGESTION findings; Batch 1 below is unchanged, merged not overwritten)
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

---

## Batch 2 — Verify-report SUGGESTION fix-up (2026-07-28)

**Trigger**: `openspec/changes/pwa-offline-shell/verify-report.md`, verdict
"PASS WITH WARNINGS". Fixed the 3 SUGGESTION findings only. The CRITICAL
finding (Phase 8 manual walkthrough not run) and the WARNING findings
(zero SW runtime test coverage — by design D9; debug logs still present —
intentionally deferred per `decision/pwa-temp-logs-removal-timing`; branch
already on `main` without its acceptance gate) are **not fixable in code**
and were left untouched, exactly as instructed.

### Commits (on top of `af27018`, in order)

| # | Hash | Subject |
|---|------|---------|
| 1 | `839a859` | `fix(pwa): correct stale icon-count comment in precache patterns` |
| 2 | `5112594` | `fix(pwa): catch fire-and-forget cache.put rejection in fetch handler` |
| 3 | `007e100` | `test(pwa): regression-test the Phase 2.2 RED precache-diff scenario` |

### Findings fixed

1. **SUGGESTION 1 — stale comment** (`precache-patterns.mjs:8`, "9 PWA
   install icons"). Verified `public/icons/` has 8 files on disk; corrected
   the comment to "8". No test needed — cosmetic drift, the verifier never
   reads this hardcoded count.
2. **SUGGESTION 2 — unhandled promise rejection** (`service-worker.ts:117-119`).
   The fire-and-forget `caches.open(...).then((cache) => cache.put(...))`
   inside the cache-first fetch branch had no `.catch`; added
   `.catch(() => {})` with a comment explaining the best-effort intent
   (matches the silent-catch philosophy the removed dead
   `PRECACHE_APP_CHUNKS` handler used to have). Did not restructure the
   fetch handler or touch `resolveStrategy`'s contract.
3. **SUGGESTION 3 — no regression test for the Phase 2.2 RED scenario.**
   TDD'd (RED confirmed: `Failed to resolve import "../precache-diff.mjs"`,
   then GREEN: 5/5). Extracted the pure disk-vs-manifest comparison out of
   `verify-sw-precache.mjs` into `scripts/precache-diff.mjs`
   (`computePrecacheDiff(onDiskUrls, injectedUrls)` — no I/O, no
   workbox-build import); the script now imports and calls it, with
   identical error messages/exit codes (confirmed via a real `pnpm build`
   after the change: `verify-sw-precache: OK — 129 precached entries`, same
   count as before). Added `scripts/__tests__/precache-diff.test.mjs`
   covering: the actual 10-path Phase 2.2 RED scenario (from this file's
   own "Regression Evidence" section above), the complete-manifest GREEN
   case, the `service-worker.js` ignore-list case (must NOT false-fail),
   zero `index.html` entries (fails), and 2x `assets/manifest-*.js`
   entries (fails).
   - `vitest.config.ts`'s `include` extended with one narrow pattern,
     `'scripts/**/*.test.mjs'`, alongside the existing
     `'app/**/*.test.{ts,tsx}'`. Verified before/after test-FILE counts via
     `vitest list`: **141 -> 142**, and confirmed the only new match under
     the new pattern is `scripts/__tests__/precache-diff.test.mjs` — no
     other unintended files got swept in.
   - This does **not** reopen design.md's Testing Strategy rejection ("Unit:
     build scripts: NONE... relocating them under `app/` would drag them
     into the client module graph and DOM-lib typechecking"). The new
     module/test stay in `scripts/`, plain `.mjs`, outside `tsconfig.json`'s
     typechecked surface and outside the client bundle — only Vitest's test
     collection changed, narrowly.

### Gates (final run, this batch)

- `pnpm test`: **142 test files, 2096 tests, all passed** (was 141/2091 —
  +1 file / +5 tests, exactly the new `precache-diff.test.mjs`).
- `pnpm -C apps/web-store-pos exec tsc --noEmit` (after `rm -rf
  .react-router` + `react-router typegen`, same as Batch 1's noted
  gotcha): **clean, 0 errors.**
- `pnpm -C apps/web-store-pos build` (clean `build/` dir): **exit 0.**
  `verify-sw-precache: OK — 129 precached entries; shell and route manifest
  each present exactly once.` — same 129-entry count as Batch 1's build,
  confirming the refactor is behavior-preserving.

### Confirmed untouched (per fix scope)

- `[SW]`/`[PWA]` debug logs — still present, unchanged (`rg -c` count
  identical to Batch 1: 7 in `service-worker.ts` incl. import line, 7+1 in
  `service-worker-registration.ts`). Deferred to the last commit per
  `decision/pwa-temp-logs-removal-timing`, gated on Phase 8 sign-off.
- Dev/preview port separation + the stale comment at
  `service-worker-registration.ts:74-79` — zero diff (verified via `git
  diff af27018 HEAD -- .../service-worker-registration.ts`), per
  `todo/dev-preview-port-separation`.
- nginx gzip/MIME — untouched, still blocked (no Docker socket).
- The CRITICAL finding (Phase 8 manual offline walkthrough) — not
  attempted, not faked, not marked resolved. Still requires a human.

### Remaining Tasks (unchanged from Batch 1)

Same as Batch 1's "Remaining Tasks" section above: 8.1-8.6 (manual
walkthrough) and 9.1 (debug-log removal, BLOCKED on 8's sign-off). Nothing
in Batch 2 changes their status.
