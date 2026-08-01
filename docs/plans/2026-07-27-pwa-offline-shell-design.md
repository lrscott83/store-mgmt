# PWA Offline Shell — Design

**Date:** 2026-07-27
**App:** `frontend-react/apps/web-store-pos`
**Status:** Design approved, implementation plan pending

## Problem

Navigating to any route without an internet connection fails with `ERR_FAILED`. The
browser shows its own network-error page; no application code ever runs. This affects
every view, including `/login`.

## Root cause

The service worker's injected precache manifest does not contain the application shell.

`react-router.config.ts` sets `ssr: false`, so the build emits a single shell —
`build/client/index.html` — and React Router resolves every route on the client. The
service worker's navigation handler is written for exactly that model
(`app/service-worker.ts:83-88`):

```ts
if (request.mode === 'navigate') {
  event.respondWith(caches.match('/index.html').then((cached) => cached ?? fetch(request)));
  return;
}
```

`caches.match('/index.html')` always misses, because `index.html` was never precached.
Execution falls through to `fetch(request)`, which fails without a network, producing
`ERR_FAILED`.

The shell is missing because of build ordering. `vite.config.ts` configures
`vite-plugin-pwa` with `strategies: 'injectManifest'` and `globDirectory: 'build/client'`.
The plugin runs its glob during the client build's `closeBundle`. React Router writes
`index.html` and `assets/manifest-<hash>.js` in a later pass, after that hook has already
run. The glob therefore never sees them.

Reproduced on two independent builds:

| Build | `service-worker.js` written | `index.html` written | Delta |
|---|---|---|---|
| 2026-07-22 22:46 | `41.716` | `42.040` | +324 ms |
| 2026-07-27 19:10 | `09.057` | `09.437` | +380 ms |

Both manifests contain zero HTML entries (113 and 119 entries respectively; the counts
differ only because the second build emitted more route chunks).

The navigation handler never stores its network response, so the shell cannot be
populated at runtime either. The precache manifest is its only possible source.

### Files missing from the precache

Verified by diffing `build/client` against the injected manifest:

| File | Consequence offline |
|---|---|
| `index.html` | Every navigation fails. Root cause of the reported bug. |
| `assets/manifest-<hash>.js` | Cold boot fails; the inline bootstrap script imports it first. |
| `images/help/*.png` (6 files) | `/help/tutorial` renders with broken images (`app/help/routes/tutorial.tsx:46-75`). |
| `manifest.webmanifest` | PWA metadata unavailable offline. |
| `favicon.png` | Tab icon unavailable offline. |

`assets/manifest-<hash>.js` is partially masked in practice: it matches the runtime
cache-first branch, so a device that loaded the app online at least once has it. A cold
install offline does not.

## Scope

**In scope:** the app loads and navigates without an internet connection. Every view
renders; every feature already backed by local data keeps working.

`GlobalConfig.USE_ONLINE_SERVICE` is `false`, so products, categories, orders, expenses,
inventory and credits already run offline-first against IndexedDB. They are unaffected by
this work and must stay that way.

**Out of scope:**

- Offline authentication. That is a separate, already-written plan
  (shipped; archived at `openspec/changes/archive/2026-07-29-offline-auth-frontend/`) and is not touched here. Note the
  dependency direction: offline auth cannot work until this shell fix ships, because no
  application code runs offline today.
- Building an offline data layer for views that inherently call the API: `admin/*`,
  `management/stores`, `management/users`, `profile/*`, and the usage telemetry. Those
  views must load offline; their API calls are expected to fail.
- Store paid-plan billing. Unrelated work on a separate branch.

## Approach

Move manifest injection out of the Vite build and into a post-build step, so the glob runs
against the finished output.

### Alternatives rejected

**Runtime manifest fetched at install.** A post-build script writes
`precache-manifest.json`; the service worker fetches it during `install`. Simpler to write,
but fatally flawed: browsers detect a new service worker by byte-comparing the worker
script. If the worker's own code is unchanged between deploys, the file is byte-identical,
no update is detected, and the new precache list is never applied. Embedding the list in
the worker makes every build produce a different worker, which is what drives the update
flow correctly.

**`injectManifest.additionalManifestEntries`.** Adding `/index.html` by hand in
`vite.config.ts` without changing the build. Cannot cover `assets/manifest-<hash>.js`,
whose content hash is unknown at config time. A partial fix that leaves cold boot broken.

## Design

### 1. Build pipeline

New file `apps/web-store-pos/scripts/build-sw.mjs`:

1. Bundle `app/service-worker.ts` with esbuild (`--bundle --format=iife --target=es2020`).
   IIFE because registration declares a classic worker
   (`new Workbox('/service-worker.js', { type: 'classic' })`). The bundle leaves the
   `self.__WB_MANIFEST` injection point intact.
2. Run `injectManifest` from `workbox-build` over the bundled worker, with
   `globDirectory: 'build/client'`, which is complete at this point.
3. Write the result to `build/client/service-worker.js`, overwriting the plugin's output.

Bundling — not merely transpiling — is required because the worker gains an import
(section 2). `workbox-build/build/lib/inject-manifest.js:36` states the method "will not
compile or bundle your `swSrc` file", so compilation must happen first.

`package.json`:

```
"build": "react-router build && node scripts/build-sw.mjs && node scripts/verify-sw-precache.mjs"
```

`vite.config.ts` keeps the `VitePWA` block: it still resolves `virtual:pwa-register` and
serves the worker under `pnpm dev`. Its `injectManifest.globPatterns` stops being the
source of truth; the authoritative patterns live in the script:

```
'**/*.{js,css,html,woff2,webmanifest}'
'icons/*.png'
'images/**/*.png'
'favicon.png'
```

with `globIgnores: ['assets/server-build-*']` — a leftover of the server build, not
referenced by `index.html`.

`workbox-build` and `esbuild` become explicit `devDependencies`. Both are already present
transitively (via `vite-plugin-pwa` and `vite`), which is fragile: a minor version bump
elsewhere can remove them.

Result: 119 precache entries become 129.

### 2. Service worker runtime

**Invert the fetch rule.** The current handler is an allowlist — `/assets/`, `.js`,
`.css`, `/icons/`, `/fonts/` — which is why `/images/`, `/favicon.png` and
`/manifest.webmanifest` fall through to the network unhandled. An allowlist is the same
class of defect as the incomplete glob: a new folder under `public/` silently breaks
offline again. The new rule:

| Request | Strategy |
|---|---|
| `mode === 'navigate'` | Shell — precached `/index.html` |
| Same-origin GET, not under `/api/` | Cache-first, network fallback |
| `/api/*`, cross-origin, or non-GET | Passthrough — the worker does not intervene |

Offline becomes the default rather than an exception that must be remembered. `/api/*` is
explicitly excluded: caching API responses would serve stale data and pollute session
state.

**Extract the decision into a pure module.** New file
`app/shared/lib/pwa/sw-strategy.ts`:

```ts
resolveStrategy(input: { url: URL; method: string; mode: string }): 'shell' | 'cache-first' | 'passthrough'
```

No globals, no `caches`, no `ServiceWorkerGlobalScope`. The worker imports it and only
executes the result, so routing logic is unit-testable under Vitest without mocking the
service worker environment.

**Remove the dead post-auth precache.** The `PRECACHE_APP_CHUNKS` handler
(`app/service-worker.ts:136-155`) fetches `/assets-manifest.json`, a file the build never
produces. nginx answers with `index.html` at status 200, `response.json()` throws, and the
`catch` swallows it. Its sender is `app/shared/components/app-layout.tsx:40-46`. With a
complete precache, every route chunk is already cached at install, so the mechanism is
both redundant and broken. Remove the handler, the sender, and the `APP_CHUNKS_CACHE`
constant.

**Real navigation fallback.** If both cache and network fail, return a minimal HTML
response instead of letting the browser render its error page. Defensive only — with the
shell precached this path should be unreachable.

### 3. Cache lifecycle

**Bypass the HTTP cache during install.** `app/service-worker.ts:38` maps manifest entries
to `entry.url` and discards `revision`. Content-hashed chunks are unaffected, but
`index.html`, fonts and images have stable filenames across deploys. A plain `fetch` may be
served from the browser's HTTP cache, precaching the *previous* shell. Pass `Request`
objects constructed with `cache: 'reload'` to `addAll`, which bypasses the HTTP cache while
preserving atomicity.

**Keep `addAll` atomic.** One failed file fails the whole install and the worker is
discarded. This is correct: a partial precache is a lie — the device believes it can
operate offline and discovers otherwise when there is no network left to recover with.
Since the manifest is now generated from the real build output, a 404 means a broken
deploy, and failing loudly is the right response. The browser retries install on the next
navigation.

**Prune on activate; do not rename the cache.** Naming the cache per build
(`app-shell-<hash>`) would force a full re-download on every deploy. Instead the name stays
stable and `activate` deletes every precache entry whose URL is absent from the current
manifest, so only changed files are fetched.

This is safe because of `registerType: 'prompt'`: the new worker stays in `waiting` until
the user confirms the update, so during that window the cache holds both old and new
entries and the open tab keeps working. Pruning runs in `activate`, after confirmation.

**Collapse three caches into one.** `app-shell-v2`, `app-chunks-v1` and `fonts-v1` become a
single `app-shell-v3`. Fonts and chunks are both covered by the install precache. The
version bump also purges the partial, broken cache currently installed on devices.

### 4. Verification

**Unit tests — `sw-strategy.ts`.** Table-driven, written before the module (strict TDD):

| Input | Expected |
|---|---|
| `mode: 'navigate'` | `shell` |
| `/api/products`, GET | `passthrough` |
| `/assets/root-x.js`, POST | `passthrough` |
| cross-origin URL | `passthrough` |
| `/images/help/menu.png` | `cache-first` |
| `/manifest.webmanifest`, `/favicon.png` | `cache-first` |

**Build assertion — `scripts/verify-sw-precache.mjs`.** Reads
`build/client/service-worker.js`, extracts the injected array, and asserts the invariant:

> Every file in `build/client` matching the precache patterns must appear in the injected
> manifest.

Plus explicit checks that `index.html` is present and that exactly one
`assets/manifest-*.js` entry exists. This is the same diff that located the bug, and it
would have caught it on the day it was introduced.

It runs as part of `build`, not `test`. In `turbo.json` the `test` task declares
`dependsOn: ["^test"]` and does not depend on `build`, so a Vitest case reading
`build/client` would fail on a clean checkout. Wired into the build, an incomplete
precache fails the build — and since `Dockerfile` runs that same build, it fails the image.
With no CI in this repository, that is the strongest available control point.

**Not covered by automation.** Without Playwright, nothing verifies that a browser
genuinely renders offline. Automated coverage stops at "the precache contains what it
must". The implementation plan includes a manual DevTools checklist (Application →
Service Workers → Offline) walking every view.

**nginx verification.** `deploy/nginx.conf:27-35` lists `application/javascript` in
`gzip_types`. nginx changed the default MIME type for `.js` to `text/javascript` in 1.21.1;
if the `nginx:alpine` image is newer, JavaScript is served uncompressed — 2.31 MB instead
of 0.71 MB. Unverified: this environment has no Docker socket access. Verify with:

```
docker run --rm nginx:alpine grep -E "javascript|manifest" /etc/nginx/mime.types
```

Check the `.webmanifest` mapping in the same pass: if unmapped it is served as
`application/octet-stream`, which can also break PWA installability. Extend `gzip_types`
only if the check confirms a gap.

## Payload

Measured on `build/client`:

| | Size |
|---|---|
| Full build, uncompressed | 2.84 MB |
| Over the wire with gzip | 1.24 MB (44%) |
| JS/CSS/HTML only | 2.30 MB → 0.71 MB (31%) |
| PNG + woff2 (already compressed) | 0.54 MB |

1.24 MB is the one-time install cost. 2.85 MB is the Cache Storage footprint — the worker
stores decoded bodies, so gzip does not reduce it. Acceptable for a point-of-sale
application required to operate without a network.

## Files touched

| File | Change |
|---|---|
| `apps/web-store-pos/scripts/build-sw.mjs` | New — bundle + inject |
| `apps/web-store-pos/scripts/verify-sw-precache.mjs` | New — build assertion |
| `apps/web-store-pos/app/shared/lib/pwa/sw-strategy.ts` | New — pure routing decision |
| `apps/web-store-pos/app/shared/lib/pwa/__tests__/sw-strategy.test.ts` | New — unit tests |
| `apps/web-store-pos/app/service-worker.ts` | Rewritten fetch/install/activate; dead handler removed |
| `apps/web-store-pos/app/shared/components/app-layout.tsx` | Remove `PRECACHE_APP_CHUNKS` sender |
| `apps/web-store-pos/package.json` | Build chain + explicit devDependencies |
| `apps/web-store-pos/vite.config.ts` | Note that the script owns the patterns |
| `frontend-react/deploy/nginx.conf` | Only if the MIME check confirms a gap |

## Risks

**Branch conflict on `app-layout.tsx`.** The store paid-plan billing work modifies the same
file (`<PaymentBanner />`, line 56) on `feat/store-paid-plan-billing-frontend`. Coordinate
the ordering or expect a merge conflict.

**Debug logging.** `app/service-worker.ts` and
`app/shared/lib/pwa/service-worker-registration.ts` contain `[SW]` and `[PWA]` console
statements marked "TEMP … Remove before commit" that were committed anyway. Removing them
is a separate decision, listed in the implementation plan as an explicit item rather than
folded in silently.

**First deploy after the fix.** Devices carrying the current `app-shell-v2` cache receive
a new worker whose install populates `app-shell-v3` in full — a 1.24 MB download. Expected
and one-time.
