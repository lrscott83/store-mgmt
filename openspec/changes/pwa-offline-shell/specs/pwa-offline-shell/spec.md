# pwa-offline-shell Specification

## Purpose

Service-worker runtime contract for `web-store-pos`: request routing
(navigation / static asset / API / cross-origin) and the install-activate
cache lifecycle, so the app loads and navigates client-side with no network
connection, and a stale shell has a defined, self-healing recovery path.
Depends on `pwa-precache-build` supplying a complete precache manifest.

## Requirements

### Requirement: Offline navigation serves the precached shell

For any same-origin navigation request (any route — SPA, client-side
routing), the service worker MUST serve the precached `index.html` shell
when offline. Exactly one shell document exists in the cache; there is no
per-route HTML.

#### Scenario: Offline direct URL load renders the app

- GIVEN the browser is offline and the service worker previously activated
  with a complete precache
- WHEN the user navigates directly to any application route (e.g. `/`,
  `/login`, `/sales/new`, `/inventory/available`, `/admin/dashboard`,
  `/management/users`, `/profile/edit`, `/help/tutorial`)
- THEN the navigation request is served from the precached `index.html`
- AND client-side routing then renders the requested route
- AND no browser network-error page is shown

#### Scenario: Views with API dependencies still render their shell offline

- GIVEN `/admin/*`, `/management/*`, or `/profile/*` routes make API calls
  the app cannot fulfill offline
- WHEN the user navigates to one of these routes while offline
- THEN the route's shell/UI still renders (served from precache)
- AND only the in-app API calls are expected to fail, not the navigation itself

### Requirement: Static asset requests are served cache-first with defined miss behavior

Same-origin requests for JS, CSS, fonts, and icons MUST be served from the
active precache. A cache miss on a same-origin static asset while offline
MUST fall through to a network fetch attempt (which fails offline) rather
than silently returning an unrelated cached response; it MUST NOT crash the
service worker.

#### Scenario: Precached asset served offline

- GIVEN a JS/CSS/font/icon file matching the precache patterns was included
  in the manifest at build time
- WHEN a same-origin request for that exact URL is made while offline
- THEN the response is served from the cache
- AND no network request is attempted

#### Scenario: Cache miss on a static asset does not crash the worker

- GIVEN a same-origin static-asset request has no matching cache entry
- WHEN that request occurs while offline
- THEN the service worker falls through to a network fetch attempt
- AND the fetch failure propagates as a normal failed request
- AND the service worker itself does not throw an unhandled error

### Requirement: API and cross-origin requests bypass the cache

Requests to `/api/` (or any path under the API prefix) and any cross-origin
request MUST NOT be served from or written to the service-worker cache. They
MUST pass through to the network unmodified.

#### Scenario: API request is not intercepted

- GIVEN a request to a path under `/api/`
- WHEN the service worker's fetch handler evaluates it
- THEN the request passes through to the network without being served from
  or written to any cache

#### Scenario: Non-API path prefix is not falsely excluded

- GIVEN a same-origin request whose path merely starts with `/api` as a
  substring but is not actually under the API prefix (e.g. `/apiary`)
- WHEN the service worker's fetch handler evaluates it
- THEN it is treated as a normal same-origin request, not excluded as an API call

#### Scenario: Cross-origin request bypasses the cache

- GIVEN a request to a different origin than the app
- WHEN the service worker's fetch handler evaluates it
- THEN the request passes through to the network without cache interaction

### Requirement: New worker version replaces a stale shell without permanent staleness

On user confirmation of the update prompt, the waiting worker MUST
skip-waiting and activate immediately; on `activate` it MUST delete any
cache not matching the current version's single named cache. A stale shell
MUST NOT persist once a new worker version has been fetched and confirmed.

#### Scenario: Update prompt replaces the active worker

- GIVEN a new service-worker version has been fetched and is waiting
- WHEN the user confirms the update prompt (or the equivalent skip-waiting
  trigger fires)
- THEN the new worker activates and takes control
- AND subsequent navigations are served from the new version's precache

#### Scenario: Activation prunes stale caches

- GIVEN a new worker version activates
- WHEN the `activate` event handler runs
- THEN every cache not matching the current version's cache name is deleted
- AND only the current version's single named cache remains

### Requirement: Precache is consolidated into a single named cache

The three previously separate caches MUST be consolidated into one named
cache for the current version. No code path MUST reference the removed
per-purpose cache names.

#### Scenario: Single cache after activation

- GIVEN the service worker has activated with a complete precache
- WHEN cache storage is inspected
- THEN only the current version's single named cache is present

### Requirement: Dead precache-refresh message handler is removed

The service worker MUST NOT expose a message handler that fetches a
runtime manifest JSON file to refresh the precache. No sender in the
application MUST post such a message.

#### Scenario: No dead handler or sender remains

- GIVEN the full application source and service-worker source
- WHEN searching for `PRECACHE_APP_CHUNKS` or a runtime fetch of
  `assets-manifest.json`
- THEN no matches are found in either the service worker or its callers

## Acceptance Procedure (manual, no automated browser test exists)

There is no Playwright/E2E tooling in this repository. The build-time
precache-completeness gate (`pwa-precache-build`) is the automated proof
that the shell CAN be served offline. Actual offline rendering is accepted
via this documented manual walkthrough, run once per change that touches
`pwa-offline-shell` or `pwa-precache-build`:

1. Run `pnpm build` (or the container build) — MUST succeed (gate from
   `pwa-precache-build` passes).
2. Serve the built output (e.g. `pnpm preview` or the deployed image).
3. Load the app once online so the service worker installs and activates.
4. Open DevTools → Application → Service Workers, confirm the worker is
   `activated` and controlling the page.
5. Open DevTools → Network, set throttling to **Offline**.
6. Directly load (typed URL, not client navigation) each of: `/login`, `/`,
   `/help/tutorial` (verify all six images render), `/sales/new`,
   `/inventory/available`. Each MUST render the app shell and route content,
   not a browser network-error page.
7. Directly load `/admin/dashboard`, `/management/users`, `/profile/edit`.
   Each MUST render its shell/UI; in-app API calls on these routes MAY show
   an error state — that is expected, not a failure of this requirement.
8. Inspect DevTools → Application → Cache Storage: confirm exactly one
   current-version cache exists.
9. Go back online, trigger a new build with a changed file, reload, and
   confirm the update prompt appears and reloading serves the new version.

A run of this procedure that fails any step is a regression against this
spec and MUST block the change from shipping, exactly as a failing
automated test would.
