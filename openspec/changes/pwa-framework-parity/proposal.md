# Proposal — pwa-framework-parity

> Source of truth: Angular `frontend/src` + React `frontend-react` + playbook
> `docs/migration/playbook-migracion-servicios-angular-react.md`. NOT openspec/, NOT memory.
> Every decision grounded in file:line. Injection ≠ live use.

## Intent

**Problem.** The frontend-parity audit (§6 item 11) flagged four Angular PWA/framework-mechanic
services as open React gaps. Code tracing (see `explore.md`) reduces this to **two REAL gaps** —
the other two are Angular dead-code and must NOT be ported (rule 12: recreating an artifact whose
output is never rendered = invention).

The two real gaps are user-visible framework mechanics that Angular ships and React currently lacks:

1. **Post-auth heavy-chunk preload** — Angular warms up 3 heavy route bundles right after login so
   the first navigation into admin/stats/reports is instant. React Router v7 code-splits each route
   but never eager-prefetches un-visited routes; grep of `prefetch`/`preload`/`warmup` in
   `apps/web-store-pos/app` = 0 hits.
2. **Global HTTP-loading spinner** — Angular shows a full-screen overlay whenever ≥1 HTTP request is
   in flight (`LoadingService` counter + `LoadingInterceptor` + `app.component.html:2-6`). React's
   `api-client.ts` has no request-count state; a `LoadingOverlay` component already exists but is
   wired to nothing.

**Why now.** These are the last framework-mechanic items in the parity audit. Both are self-contained,
require zero new dependencies, and reuse artifacts that already exist in the React tree.

**Success.** React reproduces the two Angular behaviors 1:1 at the contract level, using existing React
conventions (Zustand store, axios interceptors, the orphaned `LoadingOverlay`), with call-site parity to
Angular's exact trigger points — and introduces no new abstraction or dependency.

## Scope

### In scope

- **WU-1 — post-auth heavy-chunk preload.** A plain fire-and-forget util that `import()`s the 3 heavy
  route modules, called from the two React equivalents of Angular's two `navigateToUserHome()` call-sites.
- **WU-2 — global HTTP-loading spinner.** A request-count Zustand loading store wired into `api-client.ts`
  (request + both response branches), rendering the existing `LoadingOverlay` from `root.tsx`.

### Out of scope (dead code — documented from source, NOT ported)

- **`download-manager.service.ts`.** Methods are invoked (`app.component.ts:100-108,146-150`) but its
  entire output surface (`progress$/isDownloading$/downloadedSize$/totalSize$/estimatedTime`) is bound in
  ZERO templates — `app.component.html` binds only `loading$`, `canInstall`, `deferredPrompt`. Its sole
  matching consumer `DownloadProgressComponent` (selector `app-download-progress`) is declared in
  `shared.module.ts` but used in 0 templates. The SW message types it listens for
  (INSTALLING/DOWNLOADING/INSTALLED) are never emitted by the real `ngsw-worker.js` (SwUpdate import is
  commented out). Computed-but-never-rendered → **no port** (rule 10/12).
- **`splash-screen.service.ts` (+ component + module).** `SplashScreenModule`/`Component` are never
  imported outside their own folder; `app-splash-screen` appears in 0 templates; `app.module.ts` has 0
  refs. 100% dead → **no port** (rule 10/12).

Recreating either in React would be a rule-12 invention (building an abstraction Angular does not
functionally have).

### Explicit non-goals

- No changes to service-worker registration, PWA install prompt, or offline caching.
- No new npm dependency, no new base class/factory/abstraction.
- WU-2 covers only requests that flow through the shared `apiClient` (axios) — this matches Angular,
  whose `LoadingInterceptor` only covers `HttpClient` traffic, not raw `fetch`.

## Approach

### WU-1 — post-auth heavy-chunk preload

**Angular reference.** `preloading.service.ts:15-54` `preloadHeavyChunks()` iterates
`['/admin/dashboard', '/statistics/dashboard', '/reports/today']` and fires a fire-and-forget dynamic
`import()` per route (errors swallowed with a `console.error`). Called from `login.component.ts:179`
inside `navigateToUserHome()`, which has **two** call-sites:
- `login.component.ts:50` — constructor, already-authenticated redirect.
- `login.component.ts:171` — `submit()` success path.

**React mapping (verified against `routes.ts`).**

| Angular route | React route module (routes.ts) |
|---|---|
| `/admin/dashboard` | `admin/dashboard/routes/dashboard.tsx` (`routes.ts:88`) |
| `/statistics/dashboard` | `statistics/routes/dashboard.tsx` (`routes.ts:57`, URL `stats/dashboard`) |
| `/reports/today` | `reports/routes/today-report.tsx` (`routes.ts:54`) |

**Call-site parity (rule 10).** Angular's two `navigateToUserHome()` sites map exactly to:
- `auth/routes/login.tsx` `handleSubmit()` success path — the React `submit()` success (currently
  `login.tsx:59-61`, right before `navigate(await resolveUserHomePath(user))`).
- `auth/routes/loaders.ts` `guestOnlyLoader()` — the React already-authenticated redirect (currently
  `loaders.ts:31-33`, right before `redirect(await resolveUserHomePath(user))`).

Both React sites already funnel through `resolveUserHomePath()` (the port of `navigateToUserHome()`'s
routing logic), so `preloadHeavyChunks()` fires alongside it at both — mirroring Angular where the preload
lives inside `navigateToUserHome()` itself.

**Design decision — plain util module (rule 5 = respect React idiom).** Mirror the codebase idiom: a plain
exported function, exactly like the sibling `resolveUserHomePath` (`shared/lib/auth/user-home.ts`) and
`registerServiceWorker` (`shared/lib/pwa/service-worker-registration.ts`). No class, no Angular
`@Injectable`/DI. Recommended location `shared/lib/pwa/preload-heavy-chunks.ts` (PWA-mechanic sibling of
`service-worker-registration.ts`). Final path is a `sdd-spec`/`sdd-design` detail; the CONTRACT is: one
exported `preloadHeavyChunks(): void`, fire-and-forget, errors swallowed.

**Vite divergence (must be captured in spec/design).** Angular built its `import()` argument from a
`switch` over route strings — each branch still had a **literal** path argument. Vite/Rollup statically
analyzes `import()` and requires each target to be a **literal string** at the call. So the React util must
contain **3 explicit `import('<literal>')` statements**, NOT a `paths.forEach(p => import(p))` loop over a
variable (Vite cannot code-split a variable specifier). This is the single non-mechanical divergence from
Angular and the main correctness risk for WU-1.

**Acceptance (WU-1).**
- Rule 10: preload fires at exactly the two call-sites that mirror Angular's two `navigateToUserHome()`
  sites, and nowhere else.
- Rule 5: plain util, React idiom, no DI/class.
- Rule 12: no new abstraction; 3 literal `import()`s of existing route modules only.
- Behavior: fire-and-forget; a failed preload never blocks or breaks navigation (mirrors Angular's
  `.catch(console.error)`).

### WU-2 — global HTTP-loading spinner

**Angular reference.**
- `loading.service.ts:5-27` — `LoadingService` holds a `count`; `start()` increments and emits `true`;
  `stop()` decrements with `Math.max(0, count-1)` and emits `false` only when `count === 0`.
- `loading-interceptor.service.ts:13-22` — `start()` before the request, `stop()` in `finalize()` (fires
  on BOTH success and error) — guaranteeing the spinner can never get stuck.
- `app.component.html:2-6` — `@if (loading$ | async)` renders a full-screen overlay.

**React mapping.**
1. **Loading store** — new Zustand store (`shared/lib/stores/loading-store.ts`, sibling of `auth-store.ts`,
   rule 5 idiom) holding a request `count` and a derived `isLoading` boolean. `start()` increments;
   `stop()` decrements with `Math.max(0, count-1)` and sets `isLoading` false only at 0 — 1:1 with
   `LoadingService`. Framework-agnostic (no react-router import), same pattern as `auth-store.ts`.
2. **api-client wiring** (`shared/lib/http/api-client.ts`) — this is the React port of `LoadingInterceptor`:
   - Request interceptor (`api-client.ts:17`): call `start()`.
   - Response interceptor SUCCESS branch (`api-client.ts:31`): call `stop()`.
   - Response interceptor ERROR branch (`api-client.ts:32-65`): call `stop()` on **every** return path
     (network-error, 401, 500, generic) — this is the axios analogue of Angular's `finalize()`. Missing any
     error return path = stuck spinner. Also handle the request-interceptor error path symmetrically so a
     `start()` is never orphaned.
3. **Render** (`root.tsx`) — subscribe to the loading store and conditionally render
   `<LoadingOverlay />` (mirrors `app.component.html:2-6`). Rendered inside `App()` alongside `<Outlet />`
   (or in `Layout`), matching Angular's overlay-above-router-outlet placement.

**Reuse the existing component (rule 12 — no invention).** `LoadingOverlay` already exists at
`packages/web-common/src/client/loading-overlay.tsx`, exported via `@store-mgmt/web-common/client`
(`package.json exports "./client"`), and is currently orphaned (0 usages in `apps/`). WU-2 WIRES the
existing component — it does NOT build a new overlay. (Note: the app also has its own inline
`shared/components/ui/spinner.tsx` used per-route; that is the local content spinner, NOT the global
overlay — `LoadingOverlay` is the correct full-screen analogue of Angular's `http-loading-overlay`.)

**Acceptance (WU-2).**
- Rule 5: Zustand store + axios interceptor + React render — established React conventions, no Angular
  DI/RxJS mechanics.
- Rule 10: `start()`/`stop()` fire at the exact request/response points mirroring `LoadingInterceptor`;
  overlay renders where `app.component.html:2-6` does.
- Rule 12: reuse the orphaned `LoadingOverlay`; no new component, no new dependency (Zustand + axios
  already in the tree).
- Behavior: counter semantics identical to `LoadingService` (overlay hides only when in-flight count
  returns to 0); `stop()` on every response path so the spinner never sticks.

## Risks / open questions

- **[WU-1, primary] Vite static-analysis of `import()`.** Each preload target MUST be a literal string
  argument (3 explicit `import()` calls), not a variable/loop — otherwise Vite won't code-split and the
  preload silently no-ops or breaks the build. Divergence from Angular's `switch` shape; must be explicit
  in spec/design.
- **[WU-1] Route-module path coupling.** The 3 `import()` targets are hard-coupled to `routes.ts` module
  paths (`admin/dashboard/routes/dashboard.tsx`, `statistics/routes/dashboard.tsx`,
  `reports/routes/today-report.tsx`). Angular has the identical coupling in its `switch`; acceptable, but a
  path rename must update this util.
- **[WU-2] Error-path completeness.** `stop()` must be called on EVERY response-error return branch in
  `api-client.ts` (network/401/500/generic) plus the request-error path. This is the one place a bug would
  produce a stuck overlay — the spec must enumerate all branches.
- **No new dependency / no new abstraction required** for either WU (Zustand, axios, `LoadingOverlay`,
  dynamic `import()` all already present). If any implementation detail appears to need a new dep or a new
  base/factory, STOP and flag — that would violate rule 12 and this proposal's non-goals.
- **SSR safety.** App runs SPA (`ssr:false`); `import()` and the store execute browser-side only — no SSR
  concern, consistent with existing `auth-store.ts` `typeof window` guarding.

## Next

`sdd-spec` and `sdd-design` (may run in parallel), then `sdd-tasks` → `sdd-apply` → `sdd-verify` → `sdd-archive`.
