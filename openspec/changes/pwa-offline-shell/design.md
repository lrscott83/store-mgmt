# Design: PWA Offline Shell

**Change**: `pwa-offline-shell` · **Phase**: design · **Date**: 2026-07-28
**Artifact store**: hybrid (this file + engram `sdd/pwa-offline-shell/design`)
**Carries forward**: `docs/plans/2026-07-27-pwa-offline-shell-design.md` (approved 2026-07-27).
Approach A is **not reopened**. This document re-verifies it symbol-by-symbol against the
tree at `957cab3` and corrects two defects found in that re-verification.

## Technical Approach

Manifest injection moves out of `vite-plugin-pwa`'s `closeBundle` into a post-build step, so
the glob runs against a finished `build/client`. Build chain becomes:

```
react-router build && node scripts/build-sw.mjs && node scripts/verify-sw-precache.mjs
```

Three modules, one owner each: `precache-patterns.mjs` owns *what* is precached,
`build-sw.mjs` owns *how* it gets into the worker, `verify-sw-precache.mjs` owns *proof* that
it did. `sw-strategy.ts` owns the routing decision; `service-worker.ts` stays a wiring shell
because `tsconfig.json:9` excludes it from typechecking (verified).

## Re-verification against current code

| Claim | Verdict |
|---|---|
| `tsconfig.json:9` excludes `app/service-worker.ts` | CONFIRMED |
| `vitest.config.ts:19` includes only `app/**/*.test.{ts,tsx}` | CONFIRMED |
| `vite.config.ts:20-27` patterns lack webmanifest/images/favicon | CONFIRMED |
| `package.json:6` is `"react-router build"`; `workbox-window@^7.4.1` already a direct dep | CONFIRMED |
| `service-worker.ts:63` stale "network-first for navigation" comment; `APP_CHUNKS_CACHE` referenced by `activate` (L50) **and** `message` (L139) | CONFIRMED — whole-file rewrite is mandatory |
| `app-layout.tsx`: `useEffect` used at L23 (`useAutoCollapseSidebar`) **and** L40 (dead sender) | CONFIRMED — the import **stays** |
| `turbo.json` `test` → `dependsOn: ["^test"]`, no `build` | CONFIRMED — verifier cannot live in Vitest |
| Built manifest has **zero** `.html`, no `manifest.webmanifest`, no `favicon.png`, no `assets/manifest-*.js` | CONFIRMED empirically against `build/client/service-worker.js` |
| `assets/server-build-CBD_uDNG.css` on disk | CONFIRMED — `globIgnores` entry is load-bearing |
| Lockfile: `workbox-build@7.4.1`, `workbox-window@7.4.1`, `esbuild@0.25.12` | CONFIRMED |

### Correction 1 — the drafted verifier would fail the build forever (BLOCKING)

`src/inject-manifest.ts:58-66` pushes `swSrc` and `swDest` into `globIgnores`, so
`build/client/service-worker.js` is never in its own manifest (verified: 0 occurrences of
`"url":"service-worker.js"`). But it sits at the glob root and matches `**/*.js`, and
`getManifest()` in the verifier applies **no** such auto-ignore. The plan's verifier would
therefore report `service-worker.js` missing and exit 1 on every build.
**`PRECACHE_GLOB_IGNORES` MUST include `'service-worker.js'`.** Both globs consume the same
constant, which is the entire reason the shared module exists.

### Correction 2 — the cited workbox line numbers do not exist

`workbox-build/build/lib/inject-manifest.js` is not a path in 7.4.1. The real source is
`workbox-build/src/inject-manifest.ts` (compiled to `build/inject-manifest.js`):
`multiple-injection-points` asserts at **L94-97**; `same-src-and-dest` is at **L87-90** and
fires **only inside the `if (!injectionResults)` branch** — it is *not* an unconditional
`swSrc === swDest` rejection. The separate bundle path is still required, but for Correction
1's reason, not the one the plan gave.

### Correction 3 — `workbox-build` is not resolvable from the app package

It is a *peerDependency* of `vite-plugin-pwa`, present only at
`frontend-react/node_modules/.pnpm/workbox-build@7.4.1/`, symlinked into neither
`apps/web-store-pos/node_modules` nor `frontend-react/node_modules`. Same for `esbuild`.
Under pnpm's strict layout `import ... from 'workbox-build'` in `scripts/*.mjs` **fails
today**. Adding both as explicit devDependencies is a hard prerequisite, not hygiene.

## Architecture Decisions

### D1 — Embed the manifest in the worker bundle
**Choice**: `injectManifest` into an esbuild IIFE bundle.
**Rejected**: runtime-fetched `precache-manifest.json` (a byte-identical worker defeats
update detection, so a new list never applies); `additionalManifestEntries` (cannot name
`assets/manifest-<hash>.js` at config time).
**Guards against**: silent no-op deploys.

### D2 — Bundle lands at `build/.sw-bundle.js`, outside `build/client`
**Choice**: esbuild → `build/.sw-bundle.js`; `injectManifest` → `build/client/service-worker.js`; `rm` the bundle.
**Rejected**: bundling in place inside `build/client`.
**Guards against**: the bundle globbing itself into its own precache, and a verifier
mismatch identical to Correction 1.

### D3 — esbuild options, fixed
`{ bundle: true, format: 'iife', target: 'es2020', platform: 'browser', minify: true,
sourcemap: false, legalComments: 'none' }`.
`iife` because registration declares `type: 'classic'` (`vite.config.ts:38`). `minify: true`
is safe: esbuild does not rename member expressions (`mangleProps` is off), and does not
inline a property access it cannot prove side-effect-free. `sourcemap: false` is explicit —
`inject-manifest.ts:102-133` takes a different code path when `//# sourceMappingURL` is
present, rewriting a map file we do not want to exist.
**Belt-and-braces**: `build-sw.mjs` counts `self.__WB_MANIFEST` in the bundle **before**
injecting and throws a named, actionable error unless the count is exactly `1`.

### D4 — Read the manifest into ONE module-level const
`const PRECACHE_MANIFEST = self.__WB_MANIFEST ?? []`, consumed by `install` and by
`precachedUrls()`. Referencing `self.__WB_MANIFEST` at both sites yields two occurrences and
trips the L94-97 assert.

### D5 — Routing logic in a typechecked module
`resolveStrategy` is pure (no `caches`, no `self`, origin passed in), so Vitest covers it
with no service-worker environment. The worker only executes the verdict.
**Rejected**: logic in `service-worker.ts` — permanently untypechecked, permanently untested.

### D6 — Invert the fetch rule: exclude `/api/`, do not allowlist paths
The current allowlist is the same defect class as the incomplete glob — a new `public/`
folder silently breaks offline. Offline becomes the default.
`/api` is excluded by exact-match **or** `'/api/'` prefix, so `/apiary/*` is not swallowed.

### D7 — Stable cache name, prune on `activate`
**Rejected**: `app-shell-<buildhash>` — re-downloads 1.24 MB per deploy.
Safe because `registerType: 'prompt'` parks the new worker in `waiting`; both generations
coexist until the user confirms, and pruning runs after. Three caches collapse into
`app-shell-v3`; the version bump also purges today's broken partial cache.
**Consequence, accepted**: entries the runtime cache-first branch wrote are pruned on the
next activate. The runtime cache is opportunistic; the manifest is the contract.

### D8 — `cache: 'reload'` on install, `addAll` stays atomic
`Request(url, { cache: 'reload' })` bypasses the HTTP cache; without it, stable-filename
assets (`index.html`, fonts, images) can precache the *previous* deploy's shell. `addAll`
atomicity is kept deliberately: a partial precache is a lie the device only discovers when
there is no network left to recover with.

### D9 — Build gate, not test gate
`turbo` `test` has no `build` dependency, so a Vitest case reading `build/client` fails on a
clean checkout. Wired into `build`; `Dockerfile` runs the same build, so the image fails too.
With no CI in this repo, that is the strongest control point available.

### D10 — Dev has no precache; that is accepted
`vite.config.ts` keeps `VitePWA` (it resolves `virtual:pwa-register` and serves the worker in
dev) but its `injectManifest.globPatterns` becomes `[]` and is commented non-authoritative.
`pnpm dev` therefore has **no offline capability**; offline is verified against a production
build. The install-prompt flow still works locally.

## Data Flow

```
react-router build ──► build/client/{index.html, assets/*, public/*}
                             │
   precache-patterns.mjs ────┼────────────────┐
      (patterns/ignores)     ▼                ▼
              build-sw.mjs                verify-sw-precache.mjs
   esbuild(sw.ts+sw-strategy) → build/.sw-bundle.js   getManifest(same patterns)
        assert __WB_MANIFEST === 1                          │
   injectManifest → build/client/service-worker.js ────► compare URLs → exit 0|1
```

Runtime:

```
fetch ─► resolveStrategy({url, method, mode, selfOrigin})
           ├─ passthrough   → SW does not intervene (/api/, cross-origin, non-GET)
           ├─ shell         → caches.match('/index.html') ?? fetch ?? offlineFallback()
           └─ cache-first   → cache ?? fetch (put clone on 2xx)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web-store-pos/scripts/precache-patterns.mjs` | Create | `PRECACHE_GLOB_PATTERNS`, `PRECACHE_GLOB_IGNORES`, `MAX_FILE_SIZE_BYTES` |
| `apps/web-store-pos/scripts/build-sw.mjs` | Create | esbuild IIFE → occurrence assert → `injectManifest` → `rm` bundle |
| `apps/web-store-pos/scripts/verify-sw-precache.mjs` | Create | `getManifest()` vs. injected URLs; explicit `index.html` and single-route-manifest checks |
| `apps/web-store-pos/app/shared/lib/pwa/sw-strategy.ts` | Create | Pure `resolveStrategy` |
| `apps/web-store-pos/app/shared/lib/pwa/__tests__/sw-strategy.test.ts` | Create | Table-driven, written first (existing `__tests__/` convention) |
| `apps/web-store-pos/app/service-worker.ts` | Rewrite | WHOLE FILE, ONE edit |
| `apps/web-store-pos/app/shared/components/app-layout.tsx` | Modify | Delete L40-46 only; **keep the `useEffect` import** |
| `apps/web-store-pos/vite.config.ts` | Modify | `globPatterns: []` + non-authoritative comment |
| `apps/web-store-pos/package.json` | Modify | Build chain + `workbox-build@7.4.1`, `esbuild@0.25.12` devDeps |

## Interfaces / Contracts

```js
// scripts/precache-patterns.mjs — the single source of truth for BOTH globs
export const PRECACHE_GLOB_PATTERNS = [
  '**/*.{js,css,html,woff2,webmanifest}', // shell + chunks + 5 woff2 + manifest.webmanifest
  'icons/*.png',                          // 9 PWA install icons
  'images/**/*.png',                      // 6 /help/tutorial screenshots
  'favicon.png',
];
export const PRECACHE_GLOB_IGNORES = [
  'assets/server-build-*', // React Router server-build leftover, unreferenced by index.html
  'service-worker.js',     // injectManifest auto-ignores swDest; getManifest does NOT
];
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // parity with today's vite.config.ts:26
```

```ts
// app/shared/lib/pwa/sw-strategy.ts
export type FetchStrategy = 'shell' | 'cache-first' | 'passthrough';
export interface StrategyInput {
  readonly url: URL; readonly method: string;
  readonly mode: string; readonly selfOrigin: string;
}
export function resolveStrategy(input: StrategyInput): FetchStrategy;
// order: non-GET → cross-origin → /api → navigate → cache-first
```

Worker constants (contract with the verifier and DevTools walk): `PRECACHE_NAME =
'app-shell-v3'`, `SHELL_URL = '/index.html'`, message type `SKIP_WAITING` (posted by
`updateSW(true)`, `service-worker-registration.ts:32` — verified).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `resolveStrategy` | Vitest, table-driven, TDD-first: navigate, `/api` + `/api/products`, `/apiary/report.js` → `cache-first`, POST, cross-origin, and each asset class |
| Unit | build scripts | **None.** `vitest.config.ts:19` globs only `app/**`; relocating them under `app/` would drag them into the client module graph and DOM-lib typechecking. Rejected. |
| Build gate | precache completeness | `verify-sw-precache.mjs` in `pnpm build`. Negative case proven **once, manually**: run it against the pre-fix `build/client` and require exit 1 listing `index.html`, `assets/manifest-*.js`, `manifest.webmanifest`, `favicon.png`, six `images/help/*.png`. That failing run is the regression evidence. |
| Build gate | injection point | `build-sw.mjs` occurrence assert (D3) |
| Static | typecheck | `pnpm -C apps/web-store-pos exec tsc --noEmit` — covers `sw-strategy.ts`, never the worker |
| E2E | — | **Does not exist.** No Playwright. Automation stops at "the precache is complete". |
| Manual | offline acceptance | DevTools walk, below. This is the acceptance gate. |

### Manual acceptance walkthrough (precise)

1. `pnpm build` → `npx serve build/client -l 3333`. (`localhost` is a secure context.)
2. Application → Service Workers → **Unregister**; Storage → **Clear site data**; reload;
   wait for **activated**.
3. Cache Storage: `app-shell-v3` contains `index.html`, one `assets/manifest-*.js`,
   `manifest.webmanifest`, `favicon.png`, six `images/help/*.png`, five `fonts/inter/*.woff2`.
   `app-chunks-v1` and `fonts-v1` are **absent**.
4. Network → **Offline**. Load each URL by **typing it in the address bar** (direct loads are
   what failed): `/login`, `/`, `/help/tutorial` (all six images visible), `/sales/new`,
   `/sales/products`, `/inventory/available`, `/expenses/today` → app renders, never a
   browser error page. Then `/admin/dashboard`, `/management/users`, `/profile/edit` → the
   **view renders**; their API calls fail (expected, out of scope).
5. Back online: rebuild with a trivial change, reload twice, confirm "¡Nueva versión
   disponible!" appears and accepting it reloads into the new version.
6. Any failure returns to the worker rewrite for diagnosis. Do **not** patch the checklist.

## Failure Modes Guarded

| Failure mode | Guard |
|---|---|
| Shell absent from precache (today's bug) | `verify-sw-precache.mjs` explicit `index.html` check + full disk-vs-manifest diff |
| Verifier fails forever on `service-worker.js` | `PRECACHE_GLOB_IGNORES` (Correction 1) |
| `multiple-injection-points` build abort | D4 single const + D3 pre-inject count assert |
| Partial worker rewrite leaves dangling `APP_CHUNKS_CACHE` — bundles clean, throws at runtime (esbuild does not fail on an undefined global) | Whole-file replacement in ONE edit |
| Stale shell precached from the HTTP cache | D8 `cache: 'reload'` |
| New `public/` folder silently un-precached | D6 exclusion rule + the disk-vs-manifest diff |
| `import 'workbox-build'` unresolvable | Explicit devDeps (Correction 3) |
| Route chunk hash drift | Verifier asserts exactly one `assets/manifest-*.js` |
| Stale L63 comment survives | Whole-file rewrite; comment does not exist in the new file |

## Migration / Rollout

No data migration, no server state. First activation after deploy re-downloads ~1.24 MB
(gzip) into `app-shell-v3`; one-time and expected. Commits-only per work unit on a branch cut
from the current branch. Reverting the build-chain commit restores `"build": "react-router
build"`; reverting the worker commit restores `app-shell-v2`. Devices already on `v3`
self-heal — a revert is a different worker script, so update detection fires and `activate`
prunes.

## Explicitly Not Designed Here

- Dev/preview port separation and the stale comment at `service-worker-registration.ts:74-79`
  (which claims `devOptions.enabled: false` while `vite.config.ts:38` sets `true`) — user
  decision 2026-07-28, fast-follow `todo/dev-preview-port-separation`.
- `deploy/nginx.conf` gzip/MIME — blocked, no Docker socket.
- Removing `[SW]`/`[PWA]` debug logs — requires explicit user approval.
- Offline authentication and an offline data layer for `admin/*`, `management/*`, `profile/*`.

## Open Questions

- [ ] None blocking. Corrections 1-3 are decided above and need no user input; they tighten
      the approved approach rather than change it.
