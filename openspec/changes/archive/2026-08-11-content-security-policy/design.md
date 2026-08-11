# Design: content-security-policy

> Architecture only — the HOW at module level. Tasks are `sdd-tasks`' job.
> Inputs: proposal (`openspec/changes/content-security-policy/proposal.md`, engram #2141),
> exploration (engram `sdd/content-security-policy/explore`, #2139),
> ratified decisions (engram `sdd/content-security-policy/decisions`, #2140),
> meta-delivery correction (engram #2142).
> Prior art followed deliberately: `apps/web-store-pos/scripts/precache-patterns.mjs` +
> `precache-diff.mjs` + `verify-sw-precache.mjs` (the shared-source / pure-logic / I/O-gate triple).
>
> Every claim below carries `file:line` evidence or an explicit **NOT VERIFIED** marker.
>
> Owned by this document, not by the spec: module names, file layout, the mechanism that
> produces the policy string, the verifier's comparison contract, and the work-unit split.

---

## §0. The one sentence

**One `.mjs` module is the only place a directive is written; `vite.config.ts` *derives* the dev
header from it by import, `deploy/nginx.conf` carries a *verified copy* of the prod header, and a
single pure comparison module decides — as data, not as judgement — that `connect-src` is the only
directive allowed to differ.**

Everything else follows from that asymmetry: derived on the surface Playwright can see, verified on
the surface it cannot.

---

## §1. Ratified decisions (with the alternative that lost)

### D1 — The policy source is `scripts/csp-policy.mjs`, a plain Node ESM module

Not JSON, not TypeScript, not a JSON+serializer pair.

The policy has **three** consumers in **two** module worlds:

| Consumer | World | File |
|---|---|---|
| dev header emission | TypeScript, esbuild-bundled by Vite's config loader | `apps/web-store-pos/vite.config.ts` |
| build gate | Node ESM, `node scripts/*.mjs` | `apps/web-store-pos/scripts/verify-csp.mjs` |
| unit tests | Vitest, already configured for `.mjs` | `apps/web-store-pos/scripts/__tests__/*.test.mjs` |

`.mjs` is the only format all three consume **including the serializer**. JSON was the tempting
alternative (`tsconfig.json:26` has `resolveJsonModule: true`, so TS would import it happily) and it
is **rejected**: JSON holds data, not the `join(' ')`/`join('; ')` composition. Putting the
composition in `vite.config.ts` and again in `verify-csp.mjs` re-creates exactly the two-copy drift
this change exists to kill, one abstraction level down. A single-line duplicated serializer is still
a duplicated serializer.

**Precedent, not invention**: `scripts/precache-patterns.mjs:6-47` is already the repo's
"single source of truth for BOTH the injector and the verifier", `scripts/precache-diff.mjs:1-8`
is already the pure logic "extracted ... purely so this logic has Vitest coverage", and
`vitest.config.ts:25` already includes `scripts/**/*.test.mjs`. Two test files already live there
(`scripts/__tests__/precache-diff.test.mjs`, `scripts/__tests__/precache-families.test.mjs`) —
**correcting the proposal's claim that the glob has "zero files today"**. The pattern is proven,
not aspirational.

### D2 — `vite.config.ts` imports the `.mjs`; `scripts/csp-policy.d.mts` makes `tsc` accept it

This is the constraint the proposal handed to design (`proposal.md:161`). Resolved concretely:

- `apps/web-store-pos/tsconfig.json:2` is `"include": ["**/*"]` and the only `exclude` is
  `app/service-worker.ts` (`tsconfig.json:8-10`), so **`vite.config.ts` IS in the typecheck
  program** (`package.json:11`, `typecheck: react-router typegen && tsc`).
- `allowJs` is unset (default `false`) — sibling packages set it explicitly
  (`packages/web-common/tsconfig.json:8`, `packages/domain/tsconfig.json:8`), the app does not.
  So `tsc` will not read `csp-policy.mjs` itself.
- `moduleResolution` is `"bundler"` (`tsconfig.json:16`), under which a `./x.mjs` specifier resolves
  through `./x.mts` → `./x.d.mts` before it would need `allowJs`.

So the fix is one 6-line sibling declaration:

```ts
// apps/web-store-pos/scripts/csp-policy.d.mts
export type CspEnvironment = 'dev' | 'prod';
export interface CspDevOptions { apiUrl?: string; devServerOrigin?: string }
export declare function buildCspHeaderValue(env: CspEnvironment, options?: CspDevOptions): string;
export declare function buildCspDirectives(env: CspEnvironment, options?: CspDevOptions): Map<string, string[]>;
export declare function deriveApiOrigin(apiUrl: string | undefined): string | null;
export declare const ALLOWED_ENV_DELTA_DIRECTIVES: readonly string[];
export declare const CSP_HEADER_NAME: string;
```

**NOT VERIFIED**: that `tsc 5.8.3` (`frontend-react/package.json:24`) under
`moduleResolution: "bundler"` picks up `./csp-policy.d.mts` for a `./csp-policy.mjs` specifier.
No `.d.mts` exists anywhere in this repo today and no `.ts` file imports a `.mjs` today (verified by
search across `frontend-react/` excluding `node_modules`), so this is new ground. **I could not run
`tsc` in this session** (no shell). The check is one command and it is a mandatory acceptance gate
of WU2:

```
pnpm --filter @store-mgmt/web-store-pos typecheck
```

**Fallback ladder, in order, if that command fails** — decided now so `sdd-apply` never has to
improvise:

1. `// @ts-expect-error -- .mjs single source of truth; tsc has allowJs off (design D2)` on the
   import line. `@typescript-eslint/ban-ts-comment` defaults to
   `'ts-expect-error': 'allow-with-description'` and nothing in `packages/eslint-config/base.config.js`
   overrides it, so a described suppression lints clean. Cost: the import degrades to `any`.
2. Move the dev-policy string into `vite.config.ts` as a literal and let `verify-csp.mjs` verify it
   by text the same way it verifies `nginx.conf`. Cost: two verified copies instead of one derived
   and one verified — strictly worse, and the reason it is not the primary design.

**Rejected: `allowJs: true` in `apps/web-store-pos/tsconfig.json`.** `include: ["**/*"]` plus a
non-default `exclude` means the compiler would start pulling in every `.js`/`.mjs` under the app —
including the new `public/pwa-install-capture.js` (D5) and every build script — none of which is
written to survive `strict: true` (`tsconfig.json:28`). One import is not worth re-scoping the
whole typecheck.

### D3 — Directive order and values are declared data; the delta axis is a named constant

`csp-policy.mjs` holds one ordered table. The canonical **production** header value:

```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'
```

Directives, justification and evidence are the spec's business, not this document's. Two things
here are **design** decisions:

- **Serialization is canonical, not incidental.** Fixed directive order, fixed token order, single
  space between tokens, `"; "` between directives, no trailing `;`. Two policies that differ only in
  whitespace must serialize identically, or the verifier reports drift that is not drift.
- **The allowance is data**: `export const ALLOWED_ENV_DELTA_DIRECTIVES = ['connect-src'];`
  The verifier reads that constant. A future engineer who wants a second axis has to edit a named
  constant with a comment above it — the same shape as
  `precache-patterns.mjs:39-47`'s `REQUIRED_PRECACHE_FAMILIES` ("Adding a tutorial screenshot, a font
  or an icon is expected to fail the gate until the number here is updated on purpose").
  **Rejected**: a comment in the verifier saying "connect-src may differ". A rule a reader has to
  agree with is not a rule.

### D4 — The dev `connect-src` is derived from the same `API_URL` the axios client reads

`vite.config.ts` becomes a function config so it can call Vite's `loadEnv`:

```ts
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, join(__dirname, '../..'), ['VITE_', 'API_', 'SESSION_', 'NODE_', 'APP_']);
  const csp = buildCspHeaderValue('dev', {
    apiUrl: env['API_URL'],
    devServerOrigin: 'http://localhost:3333',
  });
  return { /* ...existing config unchanged...*/ server: { port: 3333, host: 'localhost', headers: { [CSP_HEADER_NAME]: csp } } };
});
```

`envDir` and `envPrefix` are copied from the values already in the file (`vite.config.ts:64-65`), so
`loadEnv` sees exactly what `import.meta.env['API_URL']` gives `api-client.ts:21`. That matters:
Playwright injects `API_URL` into the spawned dev server (`playwright.config.ts:111`) and
`API_` is a declared prefix, so the header tracks the backend the suite actually targets. A
hardcoded `http://localhost:5019` would be right by default (`e2e/support/backend-url.ts:24`) and
wrong for anyone who overrides `E2E_API_URL`.

`deriveApiOrigin` is a pure exported function, vitest-testable:

| input | output | why |
|---|---|---|
| `'http://localhost:5019/api'` | `'http://localhost:5019'` | cross-origin dev backend |
| `'/api'` | `null` | relative → same-origin → `'self'` already covers it (`Dockerfile:16`) |
| `''` / `undefined` | `null` | `api-client.ts:21`'s `?? ''` fallback |
| unparseable | `null` | `new URL()` throws; swallow, do not crash the dev server |

**Dev also gets `ws://localhost:3333`** for Vite's HMR socket. Whether `'self'` covers a `ws:`
URL on an `http:` origin has a long browser-inconsistency history and is **NOT VERIFIED** here.
Including it explicitly costs nothing (dev-only, and the verifier pins prod's `connect-src` to
`'self'`) and removes the single most likely source of a false red in the zero-violation sweep.

**Consequence, stated rather than hidden**: the sweep proves enforcement-readiness for every
directive **except `connect-src`**, whose dev value is deliberately wider than prod's. The enforcing
change owns closing that.

### D5 — The externalised script is `public/pwa-install-capture.js`, and `public/` is load-bearing

`root.tsx:39-44`'s `dangerouslySetInnerHTML` becomes:

```tsx
<script src="/pwa-install-capture.js"></script>
```

`public/` is the right home and nowhere else is:

- Vite copies `public/` verbatim to the build root — **never transformed, never hashed, never turned
  into a module**. `root.tsx:48` (`/favicon.png`) and `root.tsx:52` (`/manifest.webmanifest`)
  already prove the mapping: both live in `public/` (only two files there today) and are referenced
  from the document root.
- Same-origin, so `script-src 'self'` covers it with no nonce and no hash — which is the entire
  point of the decision ratified in engram #2140.
- `Dockerfile:28` copies `build/client` wholesale into the nginx root, so production serves it from
  the same origin too.

**Three consequences worth writing down:**

1. **It is precached automatically and breaks nothing.** `PRECACHE_GLOB_PATTERNS[0]`
   (`precache-patterns.mjs:7`) is `**/*.{js,css,html,woff2,webmanifest}`, so the new file enters the
   manifest by itself. `REQUIRED_PRECACHE_FAMILIES` (`precache-patterns.mjs:39-47`) pins
   `index.html`, `assets/manifest-*.js`, `manifest.webmanifest`, `favicon.png`, images, fonts and
   icons — a root-level `pwa-install-capture.js` matches **none** of the `FAMILY_MATCHERS`
   (`precache-diff.mjs:14-22`), so no declared count moves. `verify-sw-precache.mjs` stays green
   with zero edits.
2. **The file has NO static analysis at all.** `eslint.config.js:7` ignores `public/**`, and
   `allowJs` is off so `tsc` never sees it either. A typo in that file is caught by exactly one
   thing: the Playwright test in §4.1. That is not a reason to move it — it is a reason the test is
   mandatory.
3. **`<Scripts />` is in `<body>` (`root.tsx:67`)**, so the head script is guaranteed to be *parsed*
   first. The risk a `type="module"` introduces is **not** ordering against the app bundle (both
   would defer, and deferred scripts run in document order). It is ordering against **the browser**:
   Chrome can dispatch `beforeinstallprompt` after parse and before deferred scripts run, which is
   precisely the window `root.tsx:31-38` documents. A classic script runs *during* parse and closes
   that window; a module script does not. §4.1 turns that into a test that discriminates.

### D6 — nginx: one `add_header ... always;` at server level, and the file is allowed exactly one

Inserted in the `server` block of `deploy/nginx.conf` (after `index index.html;`,
`deploy/nginx.conf:40`), **not** inside `location /`:

```nginx
add_header Content-Security-Policy-Report-Only "…canonical prod value…" always;
```

Two nginx facts drive this:

- `add_header` is **not** merged into a child block that declares its own `add_header` — it is
  replaced. Today `location /api` (`deploy/nginx.conf:44-50`) and `location /`
  (`deploy/nginx.conf:53-55`) declare none, so a server-level header reaches both. The day someone
  adds `add_header X-Frame-Options ...` inside `location /`, **the CSP silently disappears from
  every page load** and nothing in this design would notice — Playwright cannot see nginx.
- `always` is required so the header is emitted on non-2xx/3xx responses too.

So the verifier enforces a blunt structural invariant: **`deploy/nginx.conf` contains exactly the
`add_header` occurrences declared in `EXPECTED_ADD_HEADERS`** (initially: the one CSP header).
Adding any other header anywhere in the file fails the build with a message explaining the
inheritance rule and pointing at the constant to update. Same "update the number on purpose" shape
as D3.

**Rejected**: parsing nginx block structure with a brace-depth scan to detect "an `add_header`
inside a `location`". More code, more ways to be subtly wrong, and it still would not have caught a
header added at `http` level. Counting against a declared list is 8 lines and cannot be fooled.

**Note for a future change, not this one**: the policy value contains no `$`, so nginx does not
interpolate anything. A nonce-based policy (`nonce-$request_id`) would, and would need escaping.

### D7 — The verifier is a triple: data → pure logic → I/O gate

Mirroring `precache-patterns` / `precache-diff` / `verify-sw-precache` exactly:

| File | Role | Imports | Tested by |
|---|---|---|---|
| `scripts/csp-policy.mjs` | directive table + `buildCspHeaderValue` + `deriveApiOrigin` + `ALLOWED_ENV_DELTA_DIRECTIVES` | nothing | `scripts/__tests__/csp-policy.test.mjs` |
| `scripts/csp-nginx.mjs` | `extractAddHeaders(conf)`, `parseCspHeaderValue(text)`, `diffPolicies(a, b)`, `checkNginxConf(conf)` — **no I/O** | `csp-policy.mjs` | `scripts/__tests__/csp-nginx.test.mjs` |
| `scripts/verify-csp.mjs` | reads the file, prints, sets `process.exitCode` | both | the build itself |

`verify-csp.mjs` resolves the config from its own location, not from `process.cwd()`:

```js
const NGINX_CONF = resolve(dirname(fileURLToPath(import.meta.url)), '../../../deploy/nginx.conf');
```

(`scripts/` → `web-store-pos` → `apps` → `frontend-react`.) `verify-sw-precache.mjs:21` uses
`process.cwd()` because its target is a build output of the package it lives in; this target is not.

It is wired into `package.json:6`:

```
"build": "react-router build && node scripts/build-sw.mjs && node scripts/verify-sw-precache.mjs && node scripts/verify-csp.mjs"
```

**This is the load-bearing placement.** `Dockerfile:22-23` runs
`pnpm --filter "@store-mgmt/web-store-pos..." build`, which executes that script chain directly
(pnpm, not turbo). So **the drift gate runs inside the image build and an image whose
`deploy/nginx.conf` has drifted cannot be produced** — `Dockerfile:27` copies that same file into
the image.

### D8 — `turbo.json` gets `globalDependencies: ["deploy/nginx.conf"]`

`turbo.json:5-9`'s `build` task inputs are `$TURBO_DEFAULT$` (the package's own files) plus `.env*`.
`deploy/nginx.conf` is **outside** `apps/web-store-pos`, so editing it alone would not invalidate
`@store-mgmt/web-store-pos#build` and `turbo run build` from `frontend-react/` would **replay a
cached run** — reporting a gate that never executed against the drifted file. Same class of trap as
the project's existing "gates need `--force`" finding.

`globalDependencies` is repo-root-relative (root = wherever `turbo.json` lives, i.e.
`frontend-react/`), so `["deploy/nginx.conf"]` is the correct value and it invalidates `test` too —
which matters because the drift assertion also lives in vitest (§4.3).

The Docker path is unaffected either way (it bypasses turbo), but the local path is the one a human
will trust.

### D9 — No `report-uri`, no `/csp-report` location

The proposal's blocking spike is **RESOLVED**: report-only with no reporting destination still fires
`securitypolicyviolation` with `disposition === "report"` and still logs to the console (probed
empirically in Chromium; carried into this design as a given). The `location /csp-report { return 204; }`
fallback in `proposal.md:110-112` is therefore **not designed and must not be built**. Chrome's
"will have no effect" console warning is cosmetic; the design ignores it deliberately.

---

## §2. Component map and data flow

```
                    scripts/csp-policy.mjs           ← THE ONLY PLACE A DIRECTIVE IS WRITTEN
                    (table + builders + delta axis)
                       │                    │
        import (D2)    │                    │  import
                       ▼                    ▼
        vite.config.ts                  scripts/csp-nginx.mjs  (pure: parse / diff / check)
        + csp-policy.d.mts                  │              │
                       │                    │              │
   server.headers      │             verify-csp.mjs    __tests__/csp-nginx.test.mjs
   (DERIVED)           ▼                    │  (I/O + exit code)        │ reads the REAL
              Vite dev server :3333         │                           │ deploy/nginx.conf
                       │                    │                           ▼
                       │            package.json build  ────────► fails `pnpm build`
                       │            (also inside Dockerfile)      and `pnpm test`
                       ▼                                                ▲
              Playwright (the ONLY observable header)                    │
                                                                         │
        deploy/nginx.conf  ── add_header … always;  (VERIFIED COPY) ─────┘
                       │
                       ▼  Dockerfile:27 COPY → nginx:80 → :8085 (docker-compose.yml:120)
              production response header  ── observable by NOTHING in this repo
```

**Integration points, exhaustively:**

| Seam | File:line today | Change |
|---|---|---|
| dev header | `vite.config.ts:50-53` (`server` block, no `headers`) | add `headers` + wrap config in a function |
| prod header | `deploy/nginx.conf:37-41` (`server` block) | one `add_header … always;` |
| document | `root.tsx:39-44` | inline `dangerouslySetInnerHTML` → `<script src>` |
| build gate | `package.json:6` | `&& node scripts/verify-csp.mjs` |
| cache correctness | `turbo.json` (no `globalDependencies` today) | add it |
| test surface | `frontend-react/e2e/` | 2 new specs + 1 new `support/` helper |

**Untouched, by design and verified**: `precache-patterns.mjs` / `precache-diff.mjs` /
`verify-sw-precache.mjs` (D5.1), `eslint.config.js` (`public/**` already ignored, `scripts/**/*.mjs`
already configured at lines 17-32), `vitest.config.ts` (line 25 already includes the glob),
`app/__tests__/root.test.tsx` (searched: no reference to `script`, `dangerouslySetInnerHTML` or
`__pwaInstallPrompt`), all backend source, and every existing E2E spec.

---

## §3. The drift verifier — exact contract

`checkNginxConf(confText)` returns an array of human-readable error strings; empty means pass.
It runs four checks, in this order:

1. **Presence.** Exactly one `add_header Content-Security-Policy-Report-Only "<value>" … ;` exists.
   Zero → "the production policy is missing". Two → ambiguous, fail.
2. **`always` flag.** The directive ends with `always;`. Without it the header is dropped on
   non-2xx/3xx responses.
3. **Text equality with the generator.**
   `diffPolicies(parseCspHeaderValue(value), buildCspDirectives('prod'))` must be empty.
   `diffPolicies` compares directive **names** as a set and each directive's **token multiset** —
   so whitespace and intra-directive token order are not drift, and a missing/added/changed
   directive is. Reported as three lists: `onlyInNginx`, `missingFromNginx`, `differingTokens`.
4. **The delta axis.** `diffPolicies(buildCspDirectives('dev', probe), buildCspDirectives('prod'))`
   must have empty `onlyInDev`/`missingFromDev`, and `differingTokens` may contain **only** names in
   `ALLOWED_ENV_DELTA_DIRECTIVES`. This check reads no file — it is an invariant of the generator
   itself, and it is the one that catches "someone added `'unsafe-eval'` to dev script-src because
   HMR complained".
5. **`EXPECTED_ADD_HEADERS`.** The set of `add_header` names in the file equals the declared set
   (D6).

**On disagreement**: `verify-csp.mjs` prints `verify-csp: FAILED`, then one bullet per error naming
the directive and both values, then sets `process.exitCode = 1` — byte-for-byte the shape of
`verify-sw-precache.mjs:125-132`. It never rewrites `nginx.conf`. A gate that fixes the thing it
guards is not a gate.

**Non-fatal check (deliberately)**: if the effective `API_URL` at build time
(`frontend-react/.env`, written by `Dockerfile:17`, or `process.env.API_URL`) resolves to a
cross-origin value not covered by the production `connect-src`, print a prominent
`verify-csp: WARNING` block and **do not** set an exit code. Rationale: `docker-compose.yml:113-124`
declares no `args`, so the shipped value is `ARG API_URL=/api` (`Dockerfile:16`) and this is
hypothetical today; in report-only a wrong `connect-src` cannot harm a user, while a broken build
can. **The enforcing change must promote this to a hard failure** — recorded here as an explicit
obligation, and the warn path is unit-tested (§4.3) so it is real code, not a decorative comment.

---

## §4. Test strategy per seam (strict TDD)

The split is not stylistic. **Vitest owns everything that is a pure function or a file's text.
Playwright owns everything that requires a real server and a real browser.** A response header
cannot be produced by jsdom, and a directive table does not need Chromium.

None of the four seams below imports the policy module into a Playwright spec. Two reasons, both
decisive: a spec that asserts "the header equals what the generator generates" can never catch
"someone deleted `script-src`"; and `playwright.config.ts:34-35` records that the config is loaded
as CommonJS, so pulling an ESM-only `.mjs` into a spec is a runtime hazard nobody needs.
**Playwright's expectations are written out longhand in the spec file.**

### §4.1 — The externalised script (WU1) · Playwright

First test, and it is RED before the change (there is no such element today):

```ts
const el = page.locator('head script[src="/pwa-install-capture.js"]');
await expect(el).toHaveCount(1);
expect(await el.getAttribute('type')).toBeNull();          // not a module
expect(await el.getAttribute('defer')).toBeNull();
expect(await el.getAttribute('async')).toBeNull();
```

Then two behavioural tests, in order of what they prove:

- **Adoption (end-to-end, green before AND after — the characterization test that proves the
  refactor is behaviour-neutral).** After load, dispatch a synthetic `beforeinstallprompt` and
  assert the app's own surface reacts: `page.getByRole('button', { name: 'Instalar app' })`
  (`install-app-button.tsx:20`) goes from disabled to enabled, because `canPrompt` is
  `deferredPrompt !== null` (`use-pwa-install.ts:138`) and `initPwaInstallCapture` adopts
  `window.__pwaInstallPrompt` (`pwa-install-prompt.ts:61-65`). The button renders in Chromium:
  `canInstall = swSupported && !standalone && !installed` (`use-pwa-install.ts:136`) and
  `contextOptions: { serviceWorkers: 'block' }` (`playwright.config.ts:91`) blocks *registration*,
  not the `navigator.serviceWorker` property.
- **Parse-time capture (the test that discriminates classic from module).** Via `addInitScript`,
  install a `MutationObserver` on `document.documentElement` that fires the synthetic
  `beforeinstallprompt` the instant `link[rel="manifest"]` appears — that element is
  `root.tsx:52`, the next thing the parser emits after our script tag. Assert the precondition
  first (`document.readyState === 'loading'`), then assert `window.__pwaInstallPrompt` is already
  set. A classic script has run; a `type="module"` script has not. Asserting the precondition
  before the effect is the project's own rule for tests like this
  (`CLAUDE.md`, "Diagnosing an empty result in an E2E test").

This third test is why the attribute assertions are not enough on their own, and it is the reason
the proposal gave this script its own capability spec.

### §4.2 — The policy source (WU2) · Vitest

`scripts/__tests__/csp-policy.test.mjs`. First RED — the module does not exist:

```js
it('production script-src is exactly self', () => {
  const v = buildCspHeaderValue('prod');
  expect(v).toContain("script-src 'self'");
  expect(v).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(v).not.toMatch(/unsafe-eval/);
});
```

Then, in the same file: `deriveApiOrigin` over D4's four-row table; canonical serialization
(no trailing `;`, single spaces, stable order across two calls); and the invariant
`dev vs prod differ only in ALLOWED_ENV_DELTA_DIRECTIVES` — asserted here as a property of the
generator, independently of any file on disk.

### §4.3 — The drift verifier (WU3) · Vitest

`scripts/__tests__/csp-nginx.test.mjs`. First RED, on fixtures, before `nginx.conf` is touched:

```js
it('rejects an nginx policy that dropped a directive', () => {
  const conf = `server { add_header Content-Security-Policy-Report-Only "default-src 'self'" always; }`;
  expect(checkNginxConf(conf)).not.toHaveLength(0);
});
```

Plus fixture cases for: missing header, missing `always`, an extra undeclared `add_header`, a
reordered-but-equivalent policy (must PASS — proves the comparison is on tokens, not bytes), and the
cross-origin `API_URL` warn path returning a warning rather than an error.

Then the one test that is not a fixture — **the real drift assertion**, RED until WU3 edits the
config:

```js
it('deploy/nginx.conf carries the exact production policy', async () => {
  const conf = await readFile(NGINX_CONF, 'utf8');
  expect(checkNginxConf(conf)).toEqual([]);
});
```

Living in vitest as well as in `build` means the drift check runs in the fast loop
(`pnpm test`) and in the image build (D7), sharing one implementation.

### §4.4 — Browser behaviour (WU2) · Playwright

`e2e/csp-report-only.spec.ts`, with `e2e/support/csp-violations.ts` holding the observer — matching
the existing `e2e/support/*-observer.ts` convention (`network-observer.ts`,
`any-request-observer.ts`, `store-network-observer.ts`).

1. **The header exists and is report-only.** First RED:
   `response.headers()['content-security-policy-report-only']` is defined and contains
   `script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`;
   **and `response.headers()['content-security-policy'] is undefined`** — proving we shipped
   report-only, not enforcing. That negative assertion is the one that catches the worst possible
   mistake in this change.
2. **A real violation is observable.** `addInitScript` registers a
   `securitypolicyviolation` listener pushing `{ effectiveDirective, disposition, blockedURI }` onto
   `window.__cspViolations`. Then append `<script src="https://example.com/x.js">` and poll.
   Assert `disposition === 'report'` and `effectiveDirective` matching `/^script-src(-elem)?$/` —
   Chrome may report either and which one is **NOT VERIFIED**. Assert on the **event**, never on the
   effect: in report-only the script still executes.
3. **Zero violations across real routes.** Navigate `/`, `/login`, `/register` and assert
   `window.__cspViolations` is empty. This is the enforcement-readiness signal.
   The helper carries an **explicit `KNOWN_DEV_ONLY_VIOLATIONS` allowlist, empty at first**: when a
   dev-tooling-only violation appears, it goes in with a comment and the test still fails on
   anything else. Without it, the first dev-only violation gets the whole sweep deleted.
4. **Optional, last, droppable if flaky**: one authenticated sweep over the statistics route using
   the existing `e2e/support/roster-fixture.ts` machinery, because recharts is the highest-risk
   runtime surface. Cut this before cutting anything else if WU2 runs long.

---

## §5. Production observability: what is proven, what is not

**PROVEN by this design:**

- The **policy text** that ships. `deploy/nginx.conf` is `COPY`d into the image (`Dockerfile:27`)
  and the gate that compares it to the generator runs *inside the same image build*
  (`Dockerfile:22-23` → `package.json:6`). An image cannot be built from a drifted config.
- The **structural** properties of the delivery: exactly one CSP `add_header`, at server level,
  with `always`, and no other `add_header` able to shadow it (D6).
- The **dev** header end to end, in a real browser, including that it is report-only (§4.4.1).

**NOT PROVEN, and no amount of design fixes it:**

- That nginx actually emits the header. `playwright.config.ts:103-112` hardcodes
  `webServer.command: 'pnpm dev'`; no Playwright project points at `vite preview` or at the
  container; `.github/workflows/` does not exist. **Inventing CI is out of scope and this design
  does not.**
- That the production **build's runtime** (static Tailwind CSS, no HMR, the lazy recharts chunk,
  the real service worker) produces zero violations. Only the dev build is swept.

**The one-time manual check at rollout.** Run these one at a time, from the repo root:

```
docker compose up -d --build web-store-pos
```

```
curl -sI http://localhost:8085/login
```

Expect a `content-security-policy-report-only:` line whose value is byte-identical to the canonical
string in D3. Port `8085` is `docker-compose.yml:120` (`"8085:80"`).

Then, with DevTools open on `http://localhost:8085`, walk: statistics/charts (recharts), the
today-sale PDF export, CSV import, roster export, and the install button. Zero
`[Report Only] Refused to…` console entries is the go-ahead the enforcing change waits for.
**For the PDF: watch the console of the NEW TAB**, not the opener — the `blob:` document is its own
console context (see §6.6).

---

## §6. Failure modes

### 6.1 The policy is missing a directive the app needs

Cannot break anything: report-only never blocks. It surfaces as a `securitypolicyviolation` in the
sweep (§4.4.3) or in the manual pass (§5). **Fix always goes in `csp-policy.mjs` and nowhere else** —
if a directive is edited in `nginx.conf` to make a symptom go away, the next `pnpm build` fails.
That is the mechanism working.

### 6.2 The two policies drift

Caught by §3 checks 1-3, in `pnpm test` (fast) and in `pnpm build` including the image build. The
one hole was turbo replaying a cached `build` after an out-of-package edit — closed by D8. The
remaining hole is a human editing `nginx.conf` and never running either command; that is what the
image build being the gate's second home is for.

### 6.3 The externalised script fails to load, or loads as a module

- **Fails to load**: `window.__pwaInstallPrompt` is never set, `canPrompt` stays false, the
  "Instalar App" button stays disabled forever. Silent today (no existing E2E covers the install
  flow — searched, `beforeinstallprompt`/`InstallAppButton` appear nowhere under `e2e/`).
  Caught by §4.1's adoption test.
- **Becomes a module** (a plausible future "modernisation"): passes CSP, passes the attribute test
  only if someone updates it, and silently loses the parse-window capture. Caught by §4.1's
  parse-time test, which fails for a module and passes for a classic script. This is why the
  proposal gave it its own capability.
- **Third-order risk**: `public/**` is eslint-ignored (`eslint.config.js:7`) and `allowJs` is off,
  so the file has zero static analysis (D5.2). The Playwright tests are the only net.

### 6.4 `worker-src 'self'` blocks a blob-URL worker

**Verified not a risk today**: both zip.js call sites disable workers explicitly —
`sync/lib/services/data-serializer-service.ts:30` and `shared/lib/offline/roster-serializer.ts:23`
both call `configure({ useWebWorkers: false })`. A search of `app/` finds **no** `new Worker` and no
`srcObject`. The only worker is the PWA service worker. If a future change re-enables zip.js workers,
`worker-src` will need `blob:`.

### 6.5 `img-src 'self'` and vendor CSS `data:` images

`sweetalert2` (`package.json:35`) and `react-toastify` (`package.json:33`) ship CSS that may contain
`url("data:image/svg+xml,…")`, which `img-src` governs. **NOT VERIFIED**: the search tool available
in this session does not traverse `node_modules` (it honours `.gitignore` — a control query for a
string known to exist there returned nothing), so an empty result here would be a non-result, not
evidence. The zero-violation sweep is exactly the instrument that answers it, at zero risk in
report-only. If it fires, the fix is `img-src 'self' data:` — a *low*-risk loosening, since a
`data:` image cannot execute script, and categorically unlike loosening `script-src`.

### 6.6 `object-src 'none'` and the `blob:` PDF

`reports/lib/pdf/inventory-today-sale-pdf.ts:139-141` does
`URL.createObjectURL(blob)` → `window.open(url)`.

The mechanism behind the proposal's flag, stated precisely: `window.open` to a `blob:` URL is a
**top-level navigation**, which fetch directives such as `object-src` do not govern. But a document
loaded from a local scheme (`blob:`) **inherits its initiator's CSP**, and Chrome's built-in PDF
viewer renders the document through an internal `<embed>` — which the inherited `object-src 'none'`
*would* govern. Whether Chrome's viewer is actually subject to it is **NOT VERIFIED** and cannot be
verified from this session.

**How this design handles it in report-only:** it cannot break anything, so nothing is guarded. It
is deliberately **excluded from the automated sweep** — headless Chromium ships without the PDF
viewer plugin, so a green Playwright result there would be meaningless — and it is named explicitly
in the §5 manual pass, with the instruction to read the **new tab's** console, because the `blob:`
document reports violations in its own context.

**What the enforcing change must check before flipping:** (a) does the `blob:` document inherit the
policy in the target browser, and (b) does the PDF viewer's `<embed>` trip `object-src 'none'`. If
yes, the options are `object-src 'self' blob:` or converting the PDF path from `window.open` to an
`<a download>` — the shape already used by `sync/routes/export.tsx:62`,
`management/users/components/roster-export-panel.tsx:53` and
`sales/components/csv-product-importer-modal.tsx:51`, none of which is CSP-governed.

### 6.7 A dev-only inline script from Vite/RR7 tooling

The exploration verified that RR7's dev HMR injects **external** module scripts, not inline text
(`@react-router/dev@7.15.1/dist/vite.js:3462,4217,4342-4356`), so `script-src 'self'` should hold in
dev. If an inline preamble does appear, the sweep goes red on `script-src` **in dev only**.
The answer is **not** to add `'unsafe-inline'` to `script-src` — that deletes the reason this change
exists. It is the `KNOWN_DEV_ONLY_VIOLATIONS` allowlist (§4.4.3) with a comment naming the injector.
This is the single most likely thing to force a revision of §4.4.

---

## §7. Work units, and what rollback costs at each

Three commits on `feat/content-security-policy` (branched from current HEAD, **not** `main`).
Delivery is commits-only: no PRs, no push.

**WU1 — externalise the install-capture script** (~80 lines)
`public/pwa-install-capture.js` (new), `root.tsx:31-44` (mod), `e2e/pwa-install-capture.spec.ts` (new).
No CSP yet. Behaviour-neutral and independently valuable.
*Rollback*: revert one commit. Zero state, zero migration. If WU2/WU3 already shipped, reverting
WU1 re-introduces an inline script that `script-src 'self'` will *report* — a console entry and a
sweep failure, never a broken page.

**WU2 — policy source + dev header** (~150 lines)
`scripts/csp-policy.mjs`, `scripts/csp-policy.d.mts`, `scripts/__tests__/csp-policy.test.mjs`,
`vite.config.ts` (mod), `e2e/support/csp-violations.ts`, `e2e/csp-report-only.spec.ts`.
**Mandatory acceptance gate: `pnpm --filter @store-mgmt/web-store-pos typecheck` passes** (D2).
*Rollback*: revert one commit — the dev header disappears, nothing else changes. **Must be reverted
*after* WU3**, because `verify-csp.mjs` imports `csp-policy.mjs`; reverting WU2 alone breaks `build`.

**WU3 — production header + drift gate** (~140 lines)
`deploy/nginx.conf` (mod), `scripts/csp-nginx.mjs`, `scripts/verify-csp.mjs`,
`scripts/__tests__/csp-nginx.test.mjs`, `package.json:6` (mod), `turbo.json` (mod).
*Rollback*: revert one commit — `build` is unblocked immediately and the `add_header` line is gone
from the next image. A **running** container keeps serving the header until it is rebuilt; since the
header is report-only, that is a cosmetic wait, not an incident.

**Rollback order is WU3 → WU2 → WU1.** Total blast radius across all three: no data, no migration,
no user-visible behaviour change, because report-only never blocks a resource.

---

## §8. Register of unverified claims

Every one of these is either cheap to resolve during apply or harmless in report-only. None blocks
`sdd-tasks`.

| # | Claim | Resolves how |
|---|---|---|
| 1 | `tsc 5.8.3` + `moduleResolution: bundler` resolves `./csp-policy.mjs` via `./csp-policy.d.mts` | `pnpm --filter @store-mgmt/web-store-pos typecheck` — WU2 acceptance gate, fallback ladder in D2 |
| 2 | CSP `'self'` covers `ws://` on an `http:` origin | Sidestepped: dev `connect-src` lists the ws origin explicitly (D4) |
| 3 | Chrome reports `script-src` vs `script-src-elem` in `effectiveDirective` | Assertion accepts both (§4.4.2) |
| 4 | Vendor CSS (`sweetalert2`, `react-toastify`) contains `data:` images | Zero-violation sweep answers it; `img-src 'self' data:` is the low-risk fix (§6.5) |
| 5 | Chrome's PDF viewer trips inherited `object-src 'none'` | Manual pass at rollout; blocking only for the enforcing change (§6.6) |
| 6 | RR7/Vite inject no inline script in dev | Sweep answers it; allowlist absorbs it (§6.7) |
| 7 | RR7's `ssr:false` prerender emits `<script src>` verbatim into `build/client/index.html` | Only the dev document is observable; the §5 manual pass covers the built one |

---

## §9. What this design does NOT decide

- **Directive values and their justification** — the spec's job (`specs/content-security-policy/`).
  This document pins only the *serialization* of whatever the spec says.
- **When to flip to enforcing** — the user's, in a separate change.
- **The two DEK E2E tests** — separate work (engram #2140, item 4).
- **Task ordering inside a work unit** — `sdd-tasks`' job.
