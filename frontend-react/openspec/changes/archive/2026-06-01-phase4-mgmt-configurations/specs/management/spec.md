> **CORRECTION — IMPLEMENTATION SUPERSEDED**
> This change was initially over-built with an invented http service (`configurationHttpService`),
> a form component (`ConfigurationsForm`), a `SystemConfiguration` domain model, and a
> `GET /v1/configurations` / `PUT /v1/configurations` backend contract. That design VIOLATED the
> strict 1:1 Angular→React migration rule: the Angular `ConfigurationsComponent` is an empty stub
> with no service and no backend endpoint. The implementation was subsequently CORRECTED to a
> faithful parity stub — a feature-gated route (`adminFeatureLoader([EFeatures.Configurations])`)
> whose component renders only `<p>configurations works!</p>`. The requirements, decisions, and
> implementation details about endpoints, forms, the `SystemConfiguration` model, caching, and
> i18n keys described below are SUPERSEDED and describe code that no longer exists.

# Delta for Management — Configurations Sub-domain

## ADDED Requirements

### Requirement: Configurations Route Registration

The system MUST register one route `/management/configurations` in `app/routes.ts`.
The route module MUST export `loader = adminFeatureLoader([EFeatures.Configurations])` and a default `ConfigurationsPage` component.
No sub-routes (create / edit) SHALL exist for this domain.

#### Scenario: Route registered and gated

- GIVEN `EFeatures.Configurations = 74` is in the user's feature set AND the user is super-admin or owner-admin
- WHEN they navigate to `/management/configurations`
- THEN `ConfigurationsPage` mounts and `list()` is called on the `configurationHttpService`

#### Scenario: Feature gate blocks access

- GIVEN the user is authenticated but `EFeatures.Configurations = 74` is absent from their feature set
- WHEN they navigate to `/management/configurations`
- THEN the `adminFeatureLoader` redirects them away before the page renders

---

### Requirement: configurationHttpService Contract

The system MUST provide a `configurationHttpService` singleton that encapsulates all backend interaction for this sub-domain.
It MUST expose `list()` and `update(payload)`.
It MUST use the shared `apiClient` exclusively; no own Axios instance.
The service is the ONLY seam; tests MUST mock it — no real HTTP in any test.

#### Scenario: list() resolves platform configurations

- GIVEN the device is online
- WHEN `list()` is called
- THEN it sends `GET /v1/configurations` (no store segment) and returns `BaseResponseModel<SystemConfiguration[]>`

#### Scenario: update() persists edited values

- GIVEN the user has edited one or more value fields
- WHEN `update(editedList)` is called
- THEN it sends `PUT /v1/configurations` with the full edited set and returns `BaseResponseModel<boolean>`

---

### Requirement: SystemConfiguration Domain Model

The system MUST add `SystemConfiguration { id: number; name: string; value: string }` to `packages/domain/src/models/store.ts` and re-export it from the domain barrel.
This model is platform-global; it MUST NOT carry any store-scoped fields.

#### Scenario: Model exported from domain barrel

- GIVEN `SystemConfiguration` is added to `store.ts`
- WHEN any slice imports `@store-mgmt/domain`
- THEN `SystemConfiguration` is available without a deep import path

---

### Requirement: Configurations List and Cache

The `ConfigurationsPage` container MUST fetch `SystemConfiguration[]` on mount, write the result to a `BaseRepository<SystemConfiguration>` cache, and pass the array to `ConfigurationsForm`.
On connectivity failure the container MUST fall back to the cache and activate degraded mode.

#### Scenario: Online fetch with cache write

- GIVEN the device is online and `list()` resolves successfully
- WHEN the page mounts
- THEN all returned rows are rendered AND the result is written to `BaseRepository<SystemConfiguration>('configurations', [])` cache

#### Scenario: Offline with cache hit

- GIVEN the device is offline and a previous successful fetch has been cached
- WHEN the page mounts
- THEN cached data renders with the degraded indicator visible
- AND the submit button is disabled

#### Scenario: Offline with empty cache

- GIVEN the device is offline and the cache is empty
- WHEN the page mounts
- THEN an empty-state or error message is shown and no crash occurs

---

### Requirement: Configurations Save

The `ConfigurationsPage` container MUST call `update(payload)` when `ConfigurationsForm` emits a submit event.
Save is NOT navigation-triggering; success MUST show an inline indicator.
Save MUST be blocked when offline.

#### Scenario: Successful save

- GIVEN the device is online and the user edits at least one value
- WHEN they submit the form
- THEN `update(editedList)` is called and on success a success indicator is shown without navigation

#### Scenario: Offline save blocked

- GIVEN the device is offline
- WHEN the user attempts to submit
- THEN the submit is blocked, an offline error is visible, and `update()` is NOT called

#### Scenario: HTTP error on save

- GIVEN `PUT /v1/configurations` returns an error
- WHEN the form is submitted
- THEN the error is displayed inline in `ConfigurationsForm`; no field reset; no redirect

---

### Requirement: ConfigurationsForm Presentational Component

`ConfigurationsForm` MUST be a pure presentational component.
It MUST iterate any `SystemConfiguration[]` passed via props, rendering each entry as one row: `name` as read-only label, `value` as editable input.
It MUST NOT import HTTP services, router hooks, or `useOnlineStatus`.

#### Scenario: Generic row iteration

- GIVEN `ConfigurationsForm` receives an array with N entries
- WHEN it renders
- THEN N rows appear — each with `name` as a read-only label and `value` as an editable input — regardless of the specific key names

#### Scenario: Offline prop disables submit

- GIVEN the container passes `isOnline = false`
- WHEN `ConfigurationsForm` renders
- THEN the submit button is disabled and an offline notice is visible

#### Scenario: Degraded prop shows indicator

- GIVEN the container passes `isDegraded = true`
- WHEN `ConfigurationsForm` renders
- THEN a degraded-mode indicator is visible

---

### Requirement: Configurations Offline Gate

All writes MUST be blocked when offline via `useOnlineStatus`.
The gate MUST be reactive: submit re-enables without a page reload when connectivity is restored.
No offline write queue SHALL be implemented.

#### Scenario: Reactive gate transition

- GIVEN the user is on the configurations page and connectivity drops
- WHEN `useOnlineStatus` transitions to offline
- THEN the submit button becomes disabled immediately without a page reload
- AND when connectivity is restored the button re-enables

---

### Requirement: CONFIGURATIONS.* i18n Keys

All user-visible strings in this sub-domain MUST be sourced from `CONFIGURATIONS.*` keys in `es.ts`.
Minimum 10 keys: `TITLE`, `SAVE`, `SAVE_SUCCESS`, `OFFLINE_NOTICE`, `DEGRADED_NOTICE`, `EMPTY`, `VALUE_LABEL`, `NAME_LABEL`, `SAVE_ERROR`, `LOADING`.

#### Scenario: All copy from es.ts

- GIVEN the app locale is `es`
- WHEN the configurations page renders in any state
- THEN all visible text resolves from `CONFIGURATIONS.*` or `MANAGEMENT.*` keys
- AND no hardcoded strings appear in the component tree

---

### Requirement: Configurations Test Coverage

A Vitest suite MUST cover the configurations slice at three layers: route containers, `configurationHttpService`, and the `adminFeatureLoader` reuse contract.
`useOnlineStatus` MUST be mockable.
`configurationHttpService` is the HTTP seam; no real endpoint dependency exists.

#### Scenario: List smoke — online success

- GIVEN `configurationHttpService.list` is mocked to return 2 entries
- WHEN `ConfigurationsPage` mounts in a test
- THEN 2 rows render and the cache write is called

#### Scenario: Save smoke — offline blocked

- GIVEN `useOnlineStatus` is mocked to return offline
- WHEN the form submit is triggered in a test
- THEN `configurationHttpService.update` is NOT called and an offline notice is visible

#### Scenario: Service unit — list maps response

- GIVEN `apiClient.get` is mocked to return `{ data: { data: [...] } }`
- WHEN `list()` is called
- THEN it returns the mapped `SystemConfiguration[]`
