# Spec: phase4-mgmt-configurations (Configurations sub-domain)

**Change:** phase4-mgmt-configurations
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-01
**Mode:** Hybrid (engram + openspec file)

---

## Scope Statement

Implement the Configurations sub-domain of the Management slice in the React 19 POS PWA.
One route (`/management/configurations`) is registered and guarded by the existing
`adminFeatureLoader([EFeatures.Configurations = 74])`. The page renders a generic, editable
name/value list of `SystemConfiguration` entries (platform-global, NOT store-scoped) and
persists changes via a single PUT call.

The feature is GREENFIELD. The backend `ConfigurationsController` and its `update` repo method
are OUT OF SCOPE and will be delivered separately. The entire slice is built and tested against
a MOCKED contract. The page is NOT end-to-end functional until the backend endpoint exists;
this is a known, accepted condition documented in the proposal.

Architecture mirrors the Stores and Users precedents exactly:
container/presentational split, 3 layers (container, presentational, HTTP service). The
`configurationHttpService` wraps all backend contracts over the shared `apiClient`. No store-
scoped `selectedStoreId` is used anywhere in this slice.

Offline policy: list reads from a `BaseRepository<SystemConfiguration>` localStorage cache when
offline; writes are blocked with a visible error. No offline write queue.

All user-visible copy is in Spanish via react-intl with `CONFIGURATIONS.*` keys in `es.ts`.

---

## Requirements Summary (stable IDs)

### ACCESS (5 requirements)

- ACCESS-1: `adminFeatureLoader([EFeatures.Configurations])` MUST be reused as-is. MUST NOT be re-created.
- ACCESS-2: Auth check failure → redirect to `/login` or `/unauthorized`.
- ACCESS-3: Feature check failure (missing `EFeatures.Configurations = 74`) → featureLoader redirect.
- ACCESS-4: The configurations route MUST export `loader = adminFeatureLoader([EFeatures.Configurations])`.
- ACCESS-5: Non-admin users MUST never reach the configurations route.

### ROUTE (2 requirements)

- ROUTE-1: `/management/configurations` → `ConfigurationsPage` container.
- ROUTE-2: The module MUST export a named `loader` and a default page component. No sub-routes exist.

### HTTP (4 requirements)

- HTTP-1: `configurationHttpService` singleton at `app/management/configurations/lib/services/configuration-http-service.ts`.
- HTTP-2: `list()` → `GET /v1/configurations` → `BaseResponseModel<SystemConfiguration[]>`. Platform-global; no `selectedStoreId` or store path segment.
- HTTP-3: `update(payload)` → `PUT /v1/configurations` → `BaseResponseModel<boolean>`. Payload shape (array vs `{id,value}[]`) is locked in the design phase; spec requires only that the full edited set is transmitted.
- HTTP-4: Both methods MUST use the shared `apiClient`. No own Axios instance.

### CONFIG (5 requirements — list/read behaviour)

- CONFIG-1: Container at `app/management/configurations/routes/configurations.tsx`, exports `ConfigurationsPage` (named + default).
- CONFIG-2: On mount, container MUST call `list()`, write the result to `BaseRepository<SystemConfiguration>('configurations', [])` cache, and pass the array to `ConfigurationsForm`.
- CONFIG-3: Connectivity failure on load → container reads cache, passes it to `ConfigurationsForm` with a degraded-mode flag.
- CONFIG-4: Empty response or empty cache → `ConfigurationsForm` MUST render an empty-state message.
- CONFIG-5: No presentational markup in the container.

### SAVE (5 requirements — edit/submit behaviour)

- SAVE-1: `ConfigurationsForm` emits the full updated `SystemConfiguration[]` on submit; container calls `update(payload)`.
- SAVE-2: On success, container MUST show a success indicator (inline message or toast); no navigation.
- SAVE-3: Submit MUST be blocked with a visible offline error when the device is offline.
- SAVE-4: HTTP error from `update()` MUST be passed to `ConfigurationsForm` inline; no field reset; no redirect.
- SAVE-5: Only the `value` field is editable per row; `name` MUST be rendered read-only.

### PRES (6 requirements)

- PRES-1: `ConfigurationsForm` at `app/management/configurations/components/ConfigurationsForm.tsx`, pure presentational.
- PRES-2: `ConfigurationsForm` iterates `SystemConfiguration[]`; each entry renders as one row: `name` as a read-only label, `value` as an editable text input.
- PRES-3: Generic iteration — no hardcoded field names. Any entries returned by the API MUST render without code changes.
- PRES-4: `ConfigurationsForm` MUST NOT import HTTP services, router hooks, or `useOnlineStatus`. All data and callbacks via props.
- PRES-5: Submit button MUST be disabled and show an offline notice when the container passes `isOnline = false`.
- PRES-6: Degraded-mode indicator MUST be visible when the container passes `isDegraded = true`.

### OFFLINE (5 requirements)

- OFFLINE-1: Write-through cache on successful list fetch. Cache key: `BaseRepository<SystemConfiguration>('configurations', [])`.
- OFFLINE-2: Cache fallback on connectivity failure; empty state rendered if cache is also empty.
- OFFLINE-3: All writes (PUT) MUST be blocked with a visible error when offline.
- OFFLINE-4: No offline write queue.
- OFFLINE-5: Reactive gate: offline → submit disabled; connectivity restored → re-enabled; no reload required.

### I18N (3 requirements)

- I18N-1: All user-visible strings MUST be delivered via `useIntl` / `FormattedMessage`.
- I18N-2: Minimum 10 `CONFIGURATIONS.*` keys: `TITLE`, `SAVE`, `SAVE_SUCCESS`, `OFFLINE_NOTICE`, `DEGRADED_NOTICE`, `EMPTY`, `VALUE_LABEL`, `NAME_LABEL`, `SAVE_ERROR`, `LOADING`.
- I18N-3: Additional keys beyond the 10-key floor are permitted. Shared `MANAGEMENT.*` keys added if absent.

### ERR (5 requirements)

- ERR-1: List connectivity errors → cache fallback and degraded indicator; other HTTP errors → inline error message.
- ERR-2: `update()` errors → inline in `ConfigurationsForm`, no field reset, no redirect.
- ERR-3: `list()` error with empty cache → error state on page; no crash.
- ERR-4: No unhandled promise rejections from the container.
- ERR-5: The HTTP service is the seam for all backend interaction; tests MUST mock the service, not real HTTP.

### TEST (6 requirements)

- TEST-1: Suite at `app/management/configurations/routes/__tests__/configurations.test.tsx`.
- TEST-2: List smoke tests (5 cases): successful render, empty state, degraded/cache fallback, offline+empty-cache error, mounted with data.
- TEST-3: Save smoke tests (5 cases): successful submit, offline blocked, HTTP error inline, form emits updated values, success indicator shown.
- TEST-4: `adminFeatureLoader` reuse tests (2 cases): authorised renders page, unauthorised redirects.
- TEST-5: `configurationHttpService` unit tests (2 cases): `list()` maps response, `update()` sends payload).
- TEST-6: `useOnlineStatus` MUST be mockable; no real `navigator.onLine` dependency in tests.

---

## Key Acceptance Scenarios

### ACCESS

**S-ACCESS-1** (unauthenticated redirect)
- GIVEN a user is not authenticated
- WHEN they navigate to `/management/configurations`
- THEN they are redirected to `/login`

**S-ACCESS-2** (wrong role redirect)
- GIVEN a user is authenticated but lacks super-admin or owner-admin role
- WHEN they navigate to `/management/configurations`
- THEN they are redirected to `/unauthorized`

**S-ACCESS-3** (missing feature redirect)
- GIVEN a user has the correct role but `EFeatures.Configurations = 74` is not in their feature set
- WHEN they navigate to `/management/configurations`
- THEN the featureLoader redirects them away

**S-ACCESS-4** (authorised renders page)
- GIVEN a user has the correct role AND `EFeatures.Configurations = 74`
- WHEN they navigate to `/management/configurations`
- THEN `ConfigurationsPage` renders and `list()` is called

### CONFIG

**S-CONFIG-1** (successful list render)
- GIVEN the device is online and `GET /v1/configurations` returns `[{id:1, name:"TestingPeriodInMonths", value:"3"}, {id:2, name:"ReSellerPercentDiscountPrice", value:"10"}]`
- WHEN the page mounts
- THEN both rows render with `name` read-only and `value` in an editable input
- AND the result is written to the local cache

**S-CONFIG-2** (empty list)
- GIVEN `GET /v1/configurations` returns `[]`
- WHEN the page mounts
- THEN the empty-state message is displayed

**S-CONFIG-3** (offline + cache hit)
- GIVEN the device is offline and a previous fetch was cached
- WHEN the page mounts
- THEN cached rows render and the degraded indicator is visible
- AND the submit button is disabled with an offline notice

**S-CONFIG-4** (offline + empty cache)
- GIVEN the device is offline and the cache is empty
- WHEN the page mounts
- THEN an empty-state or error message is shown; no crash

### SAVE

**S-SAVE-1** (successful save)
- GIVEN the page has loaded with data and the device is online
- WHEN the user edits a value and submits the form
- THEN the container calls `update(editedList)`
- AND on success a success indicator is displayed and no navigation occurs

**S-SAVE-2** (offline save blocked)
- GIVEN the device is offline
- WHEN the user attempts to submit the form
- THEN the submit button is disabled and an offline error message is visible
- AND `update()` is NOT called

**S-SAVE-3** (HTTP error on save)
- GIVEN the device is online and `PUT /v1/configurations` returns an error
- WHEN the form is submitted
- THEN the error is displayed inline in `ConfigurationsForm`
- AND no field reset or redirect occurs

### OFFLINE

**S-OFFLINE-1** (reactive gate)
- GIVEN the user is on the configurations page and connectivity drops
- WHEN `useOnlineStatus` transitions to offline
- THEN the submit button becomes disabled without a page reload
- AND when connectivity is restored the button re-enables

### I18N

**S-I18N-1** (all copy from es.ts)
- GIVEN the app locale is `es`
- WHEN the configurations page renders in any state (loaded, empty, offline, error, success)
- THEN all visible text is sourced from `CONFIGURATIONS.*` or `MANAGEMENT.*` keys in `es.ts`
- AND no hardcoded strings appear in the component tree

### ERR

**S-ERR-1** (list error no crash)
- GIVEN `GET /v1/configurations` rejects with a network error and the cache is empty
- WHEN the page mounts
- THEN an error message is displayed and the page does not throw or crash

**S-ERR-2** (no unhandled rejections)
- GIVEN any async call in the container rejects
- WHEN the rejection is caught
- THEN the error is surfaced in the UI and no unhandled promise rejection event is emitted

---

## Constraints

- No backend changes.
- No offline write queue.
- No sub-routes (no create / no edit sub-page).
- No `selectedStoreId` usage — platform-global only.
- No per-field typed form — generic name/value list only.
- `adminFeatureLoader` MUST NOT be re-created (reuse from Stores change).
- Post-save navigation: none (stay on page, show success indicator).
- `configurationHttpService` is the ONLY seam; tests mock the service layer, not real HTTP.
- Feature is NOT end-to-end functional until the backend `ConfigurationsController` is delivered (separate change, out of scope).

## New Domain Model

- `SystemConfiguration { id: number; name: string; value: string }` MUST be added to `packages/domain/src/models/store.ts` and re-exported from the domain barrel.

## Where

Files: frontend-react/openspec/changes/phase4-mgmt-configurations/spec.md
       frontend-react/openspec/changes/phase4-mgmt-configurations/specs/management/spec.md
Project: store-mgmt | Scope: project | Topic: sdd/phase4-mgmt-configurations/spec
