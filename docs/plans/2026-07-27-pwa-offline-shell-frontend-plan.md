# PWA Offline Shell — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `web-store-pos` load and navigate with no internet connection, by precaching the application shell and every static asset the app needs.

**Architecture:** Manifest injection moves out of the Vite build into a post-build step, so the glob runs against the finished `build/client` (which React Router populates *after* `vite-plugin-pwa` currently globs it). The service worker's routing decision is extracted to a pure, unit-tested module; its fetch rule inverts from an allowlist to "everything same-origin except `/api/`". A build-time verifier fails the build if any file matching the precache patterns is absent from the injected manifest.

**Tech Stack:** React Router v7 (SPA, `ssr:false`), Vite 6, `vite-plugin-pwa` 1.3, `workbox-build` 7.4.1, esbuild 0.25.12, Vitest 3.2, pnpm 10.33, Node 22.

**Design document:** `docs/plans/2026-07-27-pwa-offline-shell-design.md`

## Global Constraints

- **App root:** `frontend-react/apps/web-store-pos`. All relative paths below are from there unless stated otherwise.
- **Language:** all code, identifiers, filenames, commit messages and documentation in **English**. User-visible UI copy in **neutral Latin American Spanish** — no voseo, no Argentine forms.
- **Comments:** do not add or modify code comments beyond those explicitly written in this plan.
- **Git:** do not run `git` commands without explicit approval from the user. Commit steps below describe the intended commit; ask before executing.
- **Tests:** Vitest, `globals: true`, `environment: 'jsdom'`. Test files must match `app/**/*.test.{ts,tsx}` (`vitest.config.ts:19`) — a test outside `app/` will never run. Import test helpers explicitly: `import { describe, it, expect } from 'vitest'`.
- **Typecheck gap:** `tsconfig.json` lists `app/service-worker.ts` under `exclude`. The worker is **not** typechecked. Keep logic in typechecked modules under `app/shared/lib/pwa/` and keep the worker a thin adapter.
- **Worker format:** the worker must be a **classic** script — registration declares `new Workbox('/service-worker.js', { scope: '/', type: 'classic' })`. esbuild must emit `format: 'iife'`.
- **Injection point:** `self.__WB_MANIFEST` must appear **exactly once** in the bundled worker. `workbox-build/build/lib/inject-manifest.js:81` asserts a single occurrence and throws `multiple-injection-points` otherwise.
- **Builds:** run `pnpm build` only where a step says so.
- **API prefix:** `/api` — baked at build time via `API_URL` (`Dockerfile:16`), proxied by `deploy/nginx.conf:44`.

---

### Task 1: Precache patterns + build verifier

Creates the failing check first: the verifier runs against the **current** build output and must report the missing shell. It is the regression guard for the whole plan.

**Files:**
- Create: `scripts/precache-patterns.mjs`
- Create: `scripts/verify-sw-precache.mjs`

**Interfaces:**
- Produces: `PRECACHE_GLOB_PATTERNS: string[]`, `PRECACHE_GLOB_IGNORES: string[]`, `MAX_FILE_SIZE_BYTES: number` — consumed by Task 2's build script.

- [ ] **Step 1: Add the shared pattern module**

Both the build script and the verifier must glob with identical rules; a second copy would drift. Create `scripts/precache-patterns.mjs`:

```js
export const PRECACHE_GLOB_PATTERNS = [
  '**/*.{js,css,html,woff2,webmanifest}',
  'icons/*.png',
  'images/**/*.png',
  'favicon.png',
];

// Leftover of the React Router server build. Not referenced by index.html.
export const PRECACHE_GLOB_IGNORES = ['assets/server-build-*'];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
```

- [ ] **Step 2: Write the verifier**

Create `scripts/verify-sw-precache.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getManifest } from 'workbox-build';
import {
  PRECACHE_GLOB_PATTERNS,
  PRECACHE_GLOB_IGNORES,
  MAX_FILE_SIZE_BYTES,
} from './precache-patterns.mjs';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const globDirectory = resolve(appDir, 'build/client');
const swPath = resolve(globDirectory, 'service-worker.js');

const swContents = await readFile(swPath, 'utf8');
const injected = new Set(
  [...swContents.matchAll(/"url":"([^"]+)"/g)].map((match) => match[1])
);

const { manifestEntries } = await getManifest({
  globDirectory,
  globPatterns: PRECACHE_GLOB_PATTERNS,
  globIgnores: PRECACHE_GLOB_IGNORES,
  maximumFileSizeToCacheInBytes: MAX_FILE_SIZE_BYTES,
});

const errors = [];

const missing = manifestEntries
  .map((entry) => entry.url)
  .filter((url) => !injected.has(url));
if (missing.length > 0) {
  errors.push(`${missing.length} file(s) on disk are absent from the precache manifest:`);
  missing.forEach((url) => errors.push(`  - ${url}`));
}

if (!injected.has('index.html')) {
  errors.push('index.html is not precached — every offline navigation will fail.');
}

const routeManifests = [...injected].filter((url) => /^assets\/manifest-[^/]+\.js$/.test(url));
if (routeManifests.length !== 1) {
  errors.push(
    `expected exactly 1 React Router manifest chunk in the precache, found ${routeManifests.length}.`
  );
}

if (errors.length > 0) {
  console.error('[verify-sw-precache] FAILED');
  errors.forEach((line) => console.error(line));
  process.exit(1);
}

console.log(`[verify-sw-precache] OK — ${injected.size} entries precached.`);
```

- [ ] **Step 3: Add `workbox-build` as an explicit devDependency**

It is currently only present transitively through `vite-plugin-pwa`. Pin the version already in the tree, matching the `workbox-window` runtime dependency (`package.json:35`).

Run from `frontend-react/`:

```bash
pnpm --filter @store-mgmt/web-store-pos add -D workbox-build@7.4.1
```

- [ ] **Step 4: Run the verifier against the current build — it must FAIL**

Run from `apps/web-store-pos/`:

```bash
node scripts/verify-sw-precache.mjs
```

Expected: exit code 1, listing `index.html`, `assets/manifest-<hash>.js`, `manifest.webmanifest`, `favicon.png` and the six `images/help/*.png` files as missing, plus the explicit `index.html` error and `found 0` for the route manifest chunk.

If `build/client` does not exist, run `pnpm build` first, then re-run the verifier.

- [ ] **Step 5: Commit**

```bash
git add apps/web-store-pos/scripts/precache-patterns.mjs \
        apps/web-store-pos/scripts/verify-sw-precache.mjs \
        apps/web-store-pos/package.json pnpm-lock.yaml
git commit -m "test(pwa): add build-time precache manifest verifier"
```

---

### Task 2: Post-build manifest injection

Makes Task 1's verifier pass. After this task the reported bug is fixed: the shell is precached and offline navigation works.

**Files:**
- Create: `scripts/build-sw.mjs`
- Modify: `package.json:6` (the `build` script)
- Modify: `vite.config.ts:20-27`

**Interfaces:**
- Consumes: `PRECACHE_GLOB_PATTERNS`, `PRECACHE_GLOB_IGNORES`, `MAX_FILE_SIZE_BYTES` from Task 1.

- [ ] **Step 1: Add `esbuild` as an explicit devDependency**

Present transitively via Vite today. Run from `frontend-react/`:

```bash
pnpm --filter @store-mgmt/web-store-pos add -D esbuild@0.25.12
```

- [ ] **Step 2: Write the build script**

Create `scripts/build-sw.mjs`:

```js
import { rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { injectManifest } from 'workbox-build';
import {
  PRECACHE_GLOB_PATTERNS,
  PRECACHE_GLOB_IGNORES,
  MAX_FILE_SIZE_BYTES,
} from './precache-patterns.mjs';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const swSource = resolve(appDir, 'app/service-worker.ts');
const bundlePath = resolve(appDir, 'build/.sw-bundle.js');
const swDest = resolve(appDir, 'build/client/service-worker.js');
const globDirectory = resolve(appDir, 'build/client');

await build({
  entryPoints: [swSource],
  outfile: bundlePath,
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  minify: true,
});

const bundled = await readFile(bundlePath, 'utf8');
const occurrences = bundled.split('self.__WB_MANIFEST').length - 1;
if (occurrences !== 1) {
  throw new Error(
    `[build-sw] expected exactly 1 "self.__WB_MANIFEST" in the bundle, found ${occurrences}. ` +
      'workbox-build rejects zero or multiple injection points — read the manifest into a single ' +
      'module-level constant in app/service-worker.ts.'
  );
}

const { count, size, warnings } = await injectManifest({
  swSrc: bundlePath,
  swDest,
  globDirectory,
  globPatterns: PRECACHE_GLOB_PATTERNS,
  globIgnores: PRECACHE_GLOB_IGNORES,
  maximumFileSizeToCacheInBytes: MAX_FILE_SIZE_BYTES,
});

warnings.forEach((warning) => console.warn(`[build-sw] ${warning}`));
await rm(bundlePath, { force: true });

console.log(`[build-sw] precached ${count} files (${(size / 1024 / 1024).toFixed(2)} MB).`);
```

The bundle is written to `build/.sw-bundle.js`, **outside** `build/client`, so it is never globbed into its own manifest. `injectManifest` also refuses `swSrc === swDest` (`inject-manifest.js:76-77`), which the separate paths satisfy.

- [ ] **Step 3: Wire the build chain**

In `package.json`, replace line 6:

```json
"build": "react-router build && node scripts/build-sw.mjs && node scripts/verify-sw-precache.mjs",
```

- [ ] **Step 4: Mark the plugin config as non-authoritative**

The `VitePWA` block in `vite.config.ts` stays — it resolves `virtual:pwa-register` and serves the worker under `pnpm dev`. Replace its `injectManifest` option block (`vite.config.ts:20-27`) with:

```ts
      injectManifest: {
        // Dev-only. The authoritative precache manifest is injected after the
        // React Router build by scripts/build-sw.mjs, because index.html and
        // assets/manifest-<hash>.js are written after this plugin globs.
        globDirectory: 'build/client',
        globPatterns: [],
      },
```

Consequence to be aware of: under `pnpm dev` the worker now installs with an empty precache, so **the dev server has no offline capability**. Offline is verified against a production build (Task 7). The dev worker still exists, so the install-prompt flow keeps working locally.

- [ ] **Step 5: Build and verify**

Run from `apps/web-store-pos/`:

```bash
pnpm build
```

Expected: `[build-sw] precached 129 files (2.84 MB).` followed by `[verify-sw-precache] OK — 129 entries precached.` Exact counts depend on how many chunks the build emits; what must hold is that the verifier exits 0.

- [ ] **Step 6: Confirm the shell is really in the artifact**

```bash
grep -c '"url":"index.html"' build/client/service-worker.js
```

Expected: `1`

- [ ] **Step 7: Commit**

```bash
git add apps/web-store-pos/scripts/build-sw.mjs apps/web-store-pos/package.json \
        apps/web-store-pos/vite.config.ts pnpm-lock.yaml
git commit -m "fix(pwa): inject the precache manifest after the React Router build

The plugin globbed build/client during the client build's closeBundle, before
React Router wrote index.html and the route manifest chunk, so the app shell was
never precached and every offline navigation fell through to the network."
```

---

### Task 3: Pure fetch-strategy module

**Files:**
- Create: `app/shared/lib/pwa/sw-strategy.ts`
- Test: `app/shared/lib/pwa/__tests__/sw-strategy.test.ts`

**Interfaces:**
- Produces:
  - `type FetchStrategy = 'shell' | 'cache-first' | 'passthrough'`
  - `interface StrategyInput { readonly url: URL; readonly method: string; readonly mode: string; readonly selfOrigin: string }`
  - `resolveStrategy(input: StrategyInput): FetchStrategy`
- Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `app/shared/lib/pwa/__tests__/sw-strategy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveStrategy } from '../sw-strategy';

const ORIGIN = 'https://pos.playground.sceiba.net';

function input(path: string, overrides: { method?: string; mode?: string } = {}) {
  return {
    url: new URL(path, ORIGIN),
    method: overrides.method ?? 'GET',
    mode: overrides.mode ?? 'no-cors',
    selfOrigin: ORIGIN,
  };
}

describe('resolveStrategy', () => {
  it('serves the app shell for navigations', () => {
    expect(resolveStrategy(input('/login', { mode: 'navigate' }))).toBe('shell');
    expect(resolveStrategy(input('/sales/new', { mode: 'navigate' }))).toBe('shell');
  });

  it('never intercepts API calls', () => {
    expect(resolveStrategy(input('/api'))).toBe('passthrough');
    expect(resolveStrategy(input('/api/products'))).toBe('passthrough');
  });

  it('does not mistake a path merely starting with "api" for the API prefix', () => {
    expect(resolveStrategy(input('/apiary/report.js'))).toBe('cache-first');
  });

  it('never intercepts non-GET requests', () => {
    expect(resolveStrategy(input('/assets/root-x.js', { method: 'POST' }))).toBe('passthrough');
  });

  it('never intercepts cross-origin requests', () => {
    expect(
      resolveStrategy({
        url: new URL('https://cdn.example.com/lib.js'),
        method: 'GET',
        mode: 'no-cors',
        selfOrigin: ORIGIN,
      })
    ).toBe('passthrough');
  });

  it('serves every other same-origin GET from the cache first', () => {
    expect(resolveStrategy(input('/assets/root-x.js'))).toBe('cache-first');
    expect(resolveStrategy(input('/assets/root-x.css'))).toBe('cache-first');
    expect(resolveStrategy(input('/fonts/inter/inter-400.woff2'))).toBe('cache-first');
    expect(resolveStrategy(input('/icons/icon-192x192.png'))).toBe('cache-first');
    expect(resolveStrategy(input('/images/help/menu.png'))).toBe('cache-first');
    expect(resolveStrategy(input('/manifest.webmanifest'))).toBe('cache-first');
    expect(resolveStrategy(input('/favicon.png'))).toBe('cache-first');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web-store-pos/`:

```bash
npx vitest run app/shared/lib/pwa/__tests__/sw-strategy.test.ts
```

Expected: FAIL — cannot resolve `../sw-strategy`.

- [ ] **Step 3: Write the implementation**

Create `app/shared/lib/pwa/sw-strategy.ts`:

```ts
export type FetchStrategy = 'shell' | 'cache-first' | 'passthrough';

export interface StrategyInput {
  readonly url: URL;
  readonly method: string;
  readonly mode: string;
  readonly selfOrigin: string;
}

const API_PREFIX = '/api';

export function resolveStrategy({ url, method, mode, selfOrigin }: StrategyInput): FetchStrategy {
  if (method !== 'GET') return 'passthrough';
  if (url.origin !== selfOrigin) return 'passthrough';
  if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) return 'passthrough';
  if (mode === 'navigate') return 'shell';
  return 'cache-first';
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run app/shared/lib/pwa/__tests__/sw-strategy.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web-store-pos/app/shared/lib/pwa/sw-strategy.ts \
        apps/web-store-pos/app/shared/lib/pwa/__tests__/sw-strategy.test.ts
git commit -m "feat(pwa): add pure fetch-strategy resolver for the service worker"
```

---

### Task 4: Rewrite the service worker

Replaces the whole file in one edit. `install`, `activate`, `fetch` and the `message` listener all reference the cache-name constants, so a partial rewrite would leave the worker referencing an `APP_CHUNKS_CACHE` that no longer exists — a commit that builds but throws at runtime.

**Files:**
- Modify: `app/service-worker.ts` (entire file, 161 lines)

**Interfaces:**
- Consumes: `resolveStrategy` from Task 3.

- [ ] **Step 1: Replace the entire contents of `app/service-worker.ts`**

The `PRECACHE_APP_CHUNKS` branch of the `message` listener goes away here: it fetches `/assets-manifest.json`, a file no build step produces. `deploy/nginx.conf:54` answers with `index.html` at status 200, so `response.ok` is true, `response.json()` throws, and the `catch` swallows it. With a complete install precache every route chunk is already cached, so the mechanism is redundant as well as broken. Its client-side sender is removed in Task 5.

```ts
/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { resolveStrategy } from './shared/lib/pwa/sw-strategy';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const PRECACHE_NAME = 'app-shell-v3';
const SHELL_URL = '/index.html';

// Read once: workbox-build asserts a single `self.__WB_MANIFEST` occurrence in
// the bundled worker and aborts the build on more than one.
const PRECACHE_MANIFEST = self.__WB_MANIFEST ?? [];

function precachedUrls(): Set<string> {
  return new Set(PRECACHE_MANIFEST.map((entry) => new URL(entry.url, self.location.href).href));
}

function offlineFallback(): Response {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Sin conexion</title>' +
      '<p>No se pudo cargar la aplicacion sin conexion. Vuelve a intentarlo cuando tengas red.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// NO `self.skipWaiting()` here — this is `registerType: 'prompt'`. When an UPDATE
// is found, the new worker MUST stay in the `waiting` state so vite-plugin-pwa's
// register client fires `onNeedRefresh` and the user decides when to update.
// Activation is triggered on demand by the `SKIP_WAITING` message handler below.
//
// Requests are built with `cache: 'reload'` so the install bypasses the browser's
// HTTP cache. Entries with a stable filename (index.html, fonts, images) would
// otherwise be served from it, precaching the PREVIOUS deploy's shell.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then(async (cache) => {
      if (PRECACHE_MANIFEST.length === 0) return;
      await cache.addAll(
        PRECACHE_MANIFEST.map((entry) => new Request(entry.url, { cache: 'reload' }))
      );
    })
  );
});

// Drop obsolete caches, then prune entries this build no longer ships. Pruning
// here — not at install — is what keeps the previous version usable while the
// new worker sits in `waiting`.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter((name) => name !== PRECACHE_NAME).map((name) => caches.delete(name))
      );

      const valid = precachedUrls();
      const cache = await caches.open(PRECACHE_NAME);
      const cached = await cache.keys();
      await Promise.all(
        cached.filter((request) => !valid.has(request.url)).map((request) => cache.delete(request))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const strategy = resolveStrategy({
    url: new URL(request.url),
    method: request.method,
    mode: request.mode,
    selfOrigin: self.location.origin,
  });

  if (strategy === 'passthrough') return;

  // This app is SPA mode (`ssr:false`): the build emits ONE shell and React
  // Router resolves every route on the client, so every navigation is answered
  // with the precached shell, online or offline.
  if (strategy === 'shell') {
    event.respondWith(
      caches
        .match(SHELL_URL)
        .then((cached) => cached ?? fetch(request))
        .catch(() => offlineFallback())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          // Clone before returning: a Response body can only be read once.
          const copy = response.clone();
          void caches.open(PRECACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

// Posted by `updateSW(true)` when the user accepts the update prompt, mirroring
// Angular's `UpdateService.activateUpdate()`-then-reload flow.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

- [ ] **Step 2: Build and verify the injection point survived bundling**

```bash
pnpm build
```

Expected: no `[build-sw] expected exactly 1 "self.__WB_MANIFEST"` error, and `[verify-sw-precache] OK`.

If it fails with that error, esbuild inlined the constant — assign it through a function (`function precacheManifest() { return self.__WB_MANIFEST ?? []; }`) called once into a module-level `const`, then rebuild.

- [ ] **Step 3: Confirm the built worker still references the shell**

```bash
grep -c 'index.html' build/client/service-worker.js
```

Expected: at least `2` — the precache entry plus `SHELL_URL`.

- [ ] **Step 4: Commit**

```bash
git add apps/web-store-pos/app/service-worker.ts
git commit -m "fix(pwa): serve every same-origin GET from cache and prune on activate

Replaces the path allowlist, which silently excluded /images/, /favicon.png and
/manifest.webmanifest, with an explicit /api/ exclusion. Install now bypasses the
HTTP cache so a stable-filename asset cannot precache the previous deploy, the
three caches collapse into app-shell-v3, and the dead PRECACHE_APP_CHUNKS handler
is gone."
```

---

### Task 5: Remove the client-side sender

Task 4 removed the worker-side handler. This removes the caller and proves nothing else references the path.

**Files:**
- Modify: `app/shared/components/app-layout.tsx:40-46`

- [ ] **Step 1: Remove the sender**

In `app/shared/components/app-layout.tsx`, delete the `useEffect` at lines 40-46 in full. If `useEffect` is no longer referenced anywhere else in the file, remove it from the React import as well.

- [ ] **Step 2: Verify nothing else references the removed message**

```bash
grep -rn 'PRECACHE_APP_CHUNKS\|assets-manifest' app/
```

Expected: no output.

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: PASS. `app-layout.tsx` is rendered by several route tests; a failure here means the `useEffect` removal broke an import.

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: `[verify-sw-precache] OK`.

- [ ] **Step 5: Commit**

```bash
git add apps/web-store-pos/app/shared/components/app-layout.tsx
git commit -m "refactor(pwa): drop the dead post-auth chunk precaching sender

/assets-manifest.json was never emitted by any build step; nginx answered the
request with index.html and the JSON parse failure was swallowed. Every route
chunk is precached at install."
```

> **Coordination:** `app-layout.tsx` is also modified by the store paid-plan billing work on `feat/store-paid-plan-billing-frontend` (`<PaymentBanner />`). Confirm branch ordering with the user before this task to avoid a merge conflict.

---

### Task 6: Verify the nginx MIME and gzip configuration

`deploy/nginx.conf:27-35` lists `application/javascript` in `gzip_types`. nginx changed the default MIME type of `.js` to `text/javascript` in 1.21.1; if the `nginx:alpine` image maps it that way, JavaScript is served uncompressed — 2.30 MB instead of 0.71 MB. This was **not** verifiable while writing the plan: the authoring environment has no access to the Docker socket.

**Files:**
- Modify: `deploy/nginx.conf:27-35` — **only if** the check below confirms a gap

- [ ] **Step 1: Read the image's MIME map**

```bash
docker run --rm nginx:alpine grep -E 'javascript|manifest' /etc/nginx/mime.types
```

Record the exact output. Two questions to answer: which type is `.js` mapped to, and is `.webmanifest` mapped at all?

- [ ] **Step 2: Extend `gzip_types` if — and only if — the output shows a gap**

If `.js` maps to `text/javascript`, add it. If `.webmanifest` maps to `application/manifest+json`, add that too. Both belong in the `gzip_types` list in `deploy/nginx.conf`:

```
  gzip_types
    text/plain
    text/css
    text/javascript
    application/javascript
    application/json
    application/manifest+json
    application/xml
    image/svg+xml
    font/woff
    font/woff2;
```

Keeping `application/javascript` alongside `text/javascript` costs nothing and keeps the config correct against older images.

If `.webmanifest` is **not** mapped at all, it is served as `application/octet-stream`, which can break PWA installability. Add to the `http` block, before `server`:

```
  types {
    application/manifest+json  webmanifest;
  }
```

- [ ] **Step 3: Confirm compression on a running container**

Build and run the image, then:

```bash
CHUNK=$(basename "$(ls apps/web-store-pos/build/client/assets/*.js | head -1)")
curl -s -H 'Accept-Encoding: gzip' -o /dev/null -D - "http://localhost/assets/$CHUNK" | grep -i content-encoding
```

Expected: `content-encoding: gzip`

- [ ] **Step 4: Commit — only if the file changed**

```bash
git add frontend-react/deploy/nginx.conf
git commit -m "fix(deploy): gzip JavaScript and the web manifest

nginx 1.21.1 remapped .js to text/javascript, which was absent from gzip_types,
so the JS bundle was served uncompressed."
```

---

### Task 7: Manual offline verification

No end-to-end tooling exists in this repository, so nothing automated proves a browser genuinely renders offline. This checklist is the acceptance gate.

**Files:** none.

- [ ] **Step 1: Serve a production build**

From `apps/web-store-pos/`:

```bash
pnpm build
npx serve build/client -l 3333
```

A service worker requires a secure context; `localhost` qualifies.

- [ ] **Step 2: Install the worker cleanly**

Open `http://localhost:3333`, then in DevTools → Application → Service Workers: click **Unregister** on any existing worker, and in Application → Storage click **Clear site data**. Reload. Wait for the worker to reach **activated**.

- [ ] **Step 3: Confirm the shell is cached**

DevTools → Application → Cache Storage → `app-shell-v3`. Confirm `index.html`, an `assets/manifest-*.js`, `manifest.webmanifest`, `favicon.png` and the six `images/help/*.png` entries are present. Confirm `app-chunks-v1` and `fonts-v1` are **absent**.

- [ ] **Step 4: Go offline and walk the app**

Check DevTools → Network → **Offline**, then load each URL directly (typed into the address bar, not client-side navigation — direct loads are what failed before):

- `/login` — renders the form and the offline notice; it must **not** show a browser error page
- `/` — landing page renders
- `/help/tutorial` — renders **with all six images visible**
- `/sales/new`, `/sales/products`, `/inventory/available`, `/expenses/today` — render with their IndexedDB-backed data
- `/admin/dashboard`, `/management/users`, `/profile/edit` — the **view renders**; their API calls fail, which is expected and out of scope

- [ ] **Step 5: Confirm the update flow still works**

Go back online. Rebuild with any trivial change, reload twice, and confirm the "¡Nueva versión disponible!" dialog appears and that accepting it reloads into the new version.

- [ ] **Step 6: Record the result**

Report which URLs passed and which failed. Any failure returns to Task 4 for diagnosis — do not patch symptoms in the manual checklist.

---

### Task 8: Remove the leftover debug logging — REQUIRES APPROVAL

`app/service-worker.ts` and `app/shared/lib/pwa/service-worker-registration.ts` carry `[SW]` and `[PWA]` `console.info` statements whose own comments read "TEMP (debugging the update flow) … Remove before commit". They were committed anyway. They are noisy in production but harmless, and they are the only visibility into the update flow.

**Do not execute this task without explicit approval from the user.**

**Files:**
- Modify: `app/service-worker.ts`
- Modify: `app/shared/lib/pwa/service-worker-registration.ts`

- [ ] **Step 1: Ask the user whether to remove them, keep them, or gate them behind `import.meta.env.DEV`**

- [ ] **Step 2: Apply the chosen option, then run**

```bash
npx vitest run
pnpm build
```

Expected: PASS and `[verify-sw-precache] OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web-store-pos/app/service-worker.ts \
        apps/web-store-pos/app/shared/lib/pwa/service-worker-registration.ts
git commit -m "chore(pwa): remove temporary service worker debug logging"
```

---

## Out of scope

- **Offline authentication.** Separate plan: `docs/plans/2026-07-25-offline-auth-frontend-plan.md`. It depends on this one — no application code runs offline until the shell is precached.
- **An offline data layer for `admin/*`, `management/*`, `profile/*` and usage telemetry.** Those views must *load* offline; their API calls are expected to fail.
- **Store paid-plan billing.** Unrelated work on a separate branch, sharing only `app-layout.tsx`.
