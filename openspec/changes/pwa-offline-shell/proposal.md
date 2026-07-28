# Proposal: PWA Offline Shell

**Change**: `pwa-offline-shell` · **Phase**: propose · **Date**: 2026-07-28
**Artifact store**: hybrid (this file + engram `sdd/pwa-offline-shell/proposal`)

## Intent

`web-store-pos` is a point-of-sale app whose data layer already runs offline-first
(`GlobalConfig.USE_ONLINE_SERVICE = false`, IndexedDB), yet **no route loads without a
network**. Every navigation ends in `ERR_FAILED` — no application code runs at all.

Root cause (verified): `vite-plugin-pwa` runs `injectManifest` during the client build's
`closeBundle`, **before** React Router (SPA, `ssr:false`) writes `index.html` and
`assets/manifest-<hash>.js`. The injected manifest holds 113+ entries and **zero** `.html`,
so `caches.match('/index.html')` always misses and falls through to `fetch`.

Why now: offline auth (`docs/plans/2026-07-25-offline-auth-frontend-plan.md`) is blocked on
this — no code runs offline until the shell is precached. A stale-SW incident on 2026-07-28
(blank dev screen) also exposed how invisible this class of defect is.

## Scope

### In Scope

1. Post-build manifest injection: `scripts/precache-patterns.mjs` (single source of truth),
   `scripts/build-sw.mjs` (esbuild IIFE bundle → `workbox-build` `injectManifest`).
2. Build-time invariant: `scripts/verify-sw-precache.mjs` gates `pnpm build` — every file on
   disk matching the patterns must be in the manifest; `index.html` present; exactly one
   `assets/manifest-*.js`.
3. `app/shared/lib/pwa/sw-strategy.ts` (new, typechecked, unit-tested) — pure
   `resolveStrategy` returning `shell | cache-first | passthrough`.
4. Full rewrite of `app/service-worker.ts`: allowlist → `/api/`-exclusion, `cache: 'reload'`
   install, prune-on-activate, three caches collapsed into `app-shell-v3`, dead
   `PRECACHE_APP_CHUNKS` handler removed, false "network-first" comment (L63) removed.
5. Remove the dead sender `app-layout.tsx:40-46` (`useEffect` import stays — still used).
6. `vite.config.ts`: precache patterns completed/marked non-authoritative (webmanifest,
   images, favicon were missing).
7. `package.json`: build chain + explicit `workbox-build` / `esbuild` devDependencies.
8. Manual DevTools offline acceptance walk (no e2e tooling exists here).

### Out of Scope

- **Dev/preview port separation** (both `3333`) and the stale comment at
  `service-worker-registration.ts:74-79` — separate fast-follow, engram
  `todo/dev-preview-port-separation`.
- Offline authentication — separate plan; depends on this one.
- Offline data for `admin/*`, `management/*`, `profile/*`, telemetry — those views must
  *render* offline; their API calls are expected to fail.
- Removing `[SW]`/`[PWA]` debug logs — requires explicit user approval.
- `deploy/nginx.conf` gzip/MIME fix — conditional, blocked (no Docker socket here).

## Capabilities

### New Capabilities

- `pwa-precache-build`: build-time generation and verification of the service-worker
  precache manifest; the build fails on an incomplete precache.
- `pwa-offline-shell`: service-worker runtime contract — request routing
  (`shell`/`cache-first`/`passthrough`) and install/activate cache lifecycle.

### Modified Capabilities

- None.

## Approach

**Approach A — post-build `injectManifest` (APPROVED 2026-07-27, not reopened).** Move
injection out of the Vite plugin into a post-build script so the glob runs against finished
output. Embedding the manifest in the worker bundle (rather than fetching JSON at install)
is required: browsers detect a new worker by byte-comparing the script, so the list must
live inside it.

Rejected earlier and still rejected: runtime-fetched manifest JSON (defeats update
detection); `additionalManifestEntries` (cannot cover the hashed route-manifest chunk).

The routing decision moves into a typechecked module because `app/service-worker.ts` is in
`tsconfig.json:9` `exclude` and can never be typechecked.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web-store-pos/scripts/precache-patterns.mjs` | New | Shared glob patterns/ignores/size cap |
| `apps/web-store-pos/scripts/build-sw.mjs` | New | esbuild IIFE + `injectManifest` |
| `apps/web-store-pos/scripts/verify-sw-precache.mjs` | New | Build-gating invariant check |
| `apps/web-store-pos/app/shared/lib/pwa/sw-strategy.ts` (+ test) | New | Pure routing decision |
| `apps/web-store-pos/app/service-worker.ts` | Rewritten | Whole file, in one edit |
| `apps/web-store-pos/app/shared/components/app-layout.tsx` | Modified | Remove dead `useEffect` |
| `apps/web-store-pos/vite.config.ts` | Modified | Patterns non-authoritative |
| `apps/web-store-pos/package.json` | Modified | Build chain + devDependencies |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Partial rewrite of `service-worker.ts` leaves a dangling `APP_CHUNKS_CACHE` reference — compiles (file is untypechecked), throws at runtime | High if split | Replace the file in ONE edit; never a partial rewrite |
| esbuild `minify` inlines/duplicates `self.__WB_MANIFEST`; `workbox-build` throws `multiple-injection-points` | Medium | Read into a single module-level const; `build-sw.mjs` asserts exactly one occurrence pre-inject |
| No e2e tooling — nothing automated proves a browser renders offline | High | Automation stops at "the precache is complete"; manual DevTools walk is the acceptance gate |
| Verifier can't live in Vitest (`turbo` `test` has no `build` dep → fails on clean checkout) | Medium | Wire into `build`; `Dockerfile` runs the same build, so the image fails too |
| First deploy re-downloads 1.24 MB into `app-shell-v3` | High | Expected, one-time; documented |
| nginx gzip/MIME gap unverified (no Docker socket) | Medium | Carried out of scope; conditional follow-up |

## Rollback Plan

Commits-only per work unit on a new branch cut from current `main`. Each work unit reverts
independently: `git revert` the build-chain commit restores `"build": "react-router build"`
and the plugin-owned injection; reverting the worker commit restores `app-shell-v2`. Devices
that already installed `app-shell-v3` self-heal on the next update prompt (a revert produces
a different worker script → update detected → `activate` prunes). No data migration, no
server state.

## Dependencies

- `workbox-build@7.4.1` and `esbuild@0.25.12` promoted from transitive to explicit
  devDependencies.
- Blocks: offline authentication.
- Task 6 (nginx) requires Docker socket access unavailable in this environment.

## Success Criteria

- [ ] `pnpm build` fails when any file matching the precache patterns is absent from the
      injected manifest.
- [ ] The built `service-worker.js` contains `"url":"index.html"` exactly once and exactly
      one `assets/manifest-*.js` entry.
- [ ] `resolveStrategy` unit tests pass, covering navigate, `/api` (and `/apiary` non-match),
      non-GET, cross-origin, and same-origin assets.
- [ ] With DevTools offline, direct URL loads of `/login`, `/`, `/help/tutorial` (all six
      images), `/sales/new`, `/inventory/available` render the app, not a browser error page.
- [ ] `/admin/dashboard`, `/management/users`, `/profile/edit` render offline; their API
      calls fail as expected.
- [ ] `grep -rn 'PRECACHE_APP_CHUNKS\|assets-manifest' app/` returns nothing.
- [ ] Cache Storage shows only `app-shell-v3`; `app-chunks-v1` and `fonts-v1` are gone.
- [ ] The update prompt still appears and reloads into the new version.
- [ ] `pnpm test` and `tsc --noEmit` pass.
