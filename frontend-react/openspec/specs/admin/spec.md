# admin-features Specification

**Change:** admin-features
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-01
**Mode:** Hybrid (engram + openspec file)

---

## Purpose

Port the Angular `admin/features` page 1:1 to React. The page is gated exclusively to SuperAdmin
users via a new `superAdminLoader`. It renders a title and a single activate button; clicking it
calls `POST /v1/features/activate` and displays an inline success or error message. This change also
establishes the `admin/` route prefix for future SuperAdmin-only slices.

---

## Requirements

### Access Control (ACCESS)

**ACCESS-1** — A new `superAdminLoader` MUST be added to `app/auth/routes/loaders.ts`. It MUST
gate on `isSuperAdmin` ONLY. Users who are `isOwnerAdmin` but NOT `isSuperAdmin` MUST be blocked.

**ACCESS-2** — When the user is unauthenticated or is not a SuperAdmin, `superAdminLoader` MUST
redirect consistent with the behaviour of the existing `adminLoader` (redirect to `/login` or
`/unauthorized`).

**ACCESS-3** — `superAdminLoader` MUST NOT reuse or broaden `adminLoader`. It is a distinct,
stricter guard exported from the same file.

**ACCESS-4** — The `admin/features` route MUST export a named `loader` bound to `superAdminLoader`.

---

### Route Registration (ROUTE)

**ROUTE-1** — The `/admin/features` route MUST be registered in `app/routes.ts` under the existing
`app-layout` route, pointing to the features container (`FeaturesPage`).

**ROUTE-2** — The route module MUST export a named `loader` (used by React Router) AND a default
export for the page component.

---

### HTTP Service (HTTP)

**HTTP-1** — A `featureHttpService` singleton MUST exist at
`app/admin/features/lib/services/feature-http-service.ts`.

**HTTP-2** — `featureHttpService` MUST expose `activateFeatures()` calling
`POST /v1/features/activate` with an empty body → `BaseResponseModel<boolean>`.

**HTTP-3** — `featureHttpService` MUST NOT define its own Axios instance. All calls MUST go through
the shared `apiClient`.

---

### Features Page (PAGE)

**PAGE-1** — The container MUST live at `app/admin/features/routes/features.tsx`, export
`FeaturesPage` as a named export, and also export it as `default`.

**PAGE-2** — The page MUST render a title using the i18n key `FEATURES.TITLE`.

**PAGE-3** — The page MUST render a single button with label `FEATURES.ACTIVATE_FEATURES`.

**PAGE-4** — Clicking the button MUST call `featureHttpService.activateFeatures()`.

**PAGE-5** — When the response has `succeeded === true`, the page MUST surface a non-blocking
success **toast** via `showToastSuccess` (`~/shared/lib/toast`), using the i18n key
`FEATURES.FEATURES_ACTIVATED` as the message and `GENERAL.RESPONSE.SUCCESS_TITLE` ("Éxito") as the
title, mirroring Angular's `toastrService.success(...)` (`features.component.ts:30-32`). No
persisted inline message is used. (Supersedes the earlier "inline / no toast" wording and the
`frontend-parity-audit` "inline (not toastr)" decision — toast-notifications-parity.)

**PAGE-6** — When the response has `succeeded === false` OR the HTTP call throws, the page MUST
surface a non-blocking error **toast** via `showToastError`, using `FEATURES.UNEXPECTED_ERROR` as
the message and `GENERAL.RESPONSE.ERROR_TITLE` ("Error") as the title. This intentionally corrects
Angular's broken `GENERAL.RESPONSE.ERROR` missing-key title; the message text is identical to
Angular. No persisted inline message is used. (toast-notifications-parity)

**PAGE-7** — No loading state or button-disabled state is implemented (Angular has none).

**PAGE-8** — The page MUST NOT contain offline checks, form fields, or additional actions beyond
the single activate button.

---

### Internationalisation (I18N)

**I18N-1** — The following `FEATURES.*` keys MUST be added to `app/shared/lib/i18n/es.ts`:

| Key | Purpose |
|-----|---------|
| `FEATURES.TITLE` | Page heading |
| `FEATURES.ACTIVATE_FEATURES` | Activate button label |
| `FEATURES.FEATURES_ACTIVATED` | Inline success message |
| `FEATURES.UNEXPECTED_ERROR` | Inline error message |

**I18N-2** — If `en.ts` exists in the same directory, the same four keys MUST be added to it.

**I18N-3** — All user-visible strings in the page MUST be sourced from i18n keys. No hardcoded
string literals are permitted in TSX.

---

### Admin Stores Route Registration (ADMIN-STORES-ROUTE)

The system MUST register the `/admin/stores` route in `app/routes.ts` under the existing
`app-layout` route, pointing to `AdminStoreListPage`.

The route module MUST export a named `loader` bound to `superAdminLoader` AND a default export
for the page component.

**Scenarios:**
- S-ADMIN-STORES-ROUTE-1 — Route registered with superAdminLoader; no EFeatures check.

---

### Admin Stores Access Control (ADMIN-STORES-ACCESS)

The `admin/stores` route MUST be gated exclusively by `superAdminLoader` (`isSuperAdmin` ONLY).
Users who are `isOwnerAdmin` but NOT `isSuperAdmin` MUST be blocked. No `EFeatures` check is
applied.

**Scenarios:**
- S-ADMIN-STORES-ACCESS-1 — SuperAdmin reaches page
- S-ADMIN-STORES-ACCESS-2 — OwnerAdmin blocked
- S-ADMIN-STORES-ACCESS-3 — Unauthenticated → /login

---

### Admin Store List Container (ADMIN-STORES-PAGE)

A container `AdminStoreListPage` MUST exist at
`app/admin/stores/routes/store-list.tsx`, exported as a named export AND as `default`.

On mount the container MUST call `storeHttpService.listStores()` (`GET /v1/stores/by-current-user`)
and render the shared `<StoreList>` presentational component with the returned stores.

The container MUST pass `isOnline={true}` and `isDegraded={false}` as static props (no offline
gating; no `BaseRepository` cache).

The container MUST wire: `onCreate` → navigate to `/management/stores/create`;
`onEdit` → navigate to `/management/stores/edit/:id`; `onApprove` → call
`storeHttpService.approve(id)`; `onDisapprove` → call `storeHttpService.disapprove(id)`.

The container MUST NOT wire `onActivate` or `onDeactivate` (these are commented out in the Angular
source and are intentionally omitted).

**Scenarios:**
- S-ADMIN-STORES-PAGE-1 — Successful load renders StoreList
- S-ADMIN-STORES-PAGE-2 — onCreate navigates to create route
- S-ADMIN-STORES-PAGE-3 — onEdit navigates to edit route
- S-ADMIN-STORES-PAGE-4 — onApprove calls service and refetches
- S-ADMIN-STORES-PAGE-5 — onDisapprove calls service and refetches
- S-ADMIN-STORES-PAGE-6 — Activate/Deactivate NOT wired; buttons not rendered
- S-ADMIN-STORES-PAGE-7 — HTTP error shows inline error

---

### Admin Stores Testing (ADMIN-STORES-TEST)

A smoke-test suite MUST exist at
`app/admin/stores/routes/__tests__/store-list.test.tsx`.

Tests MUST cover: SuperAdmin reaches page and list renders; OwnerAdmin is blocked by
`superAdminLoader`; `onCreate` navigates to create; `onEdit` navigates to edit; `onApprove` calls
service; `onDisapprove` calls service; HTTP error shows inline error; activate/deactivate buttons
are absent.

---

### Testing (TEST) — Features

**TEST-1** — A smoke-test suite MUST exist at
`app/admin/features/routes/__tests__/features.test.tsx`.

**TEST-2** — Route smoke tests MUST cover:
  - SuperAdmin user navigating to `/admin/features` renders `FeaturesPage` with title and button.
  - Non-SuperAdmin user (e.g., OwnerAdmin) is redirected by `superAdminLoader`.
  - Clicking the activate button calls `featureHttpService.activateFeatures()`.
  - On `succeeded === true`, the inline success message (`FEATURES.FEATURES_ACTIVATED`) is visible.
  - On `succeeded === false` or HTTP error, the inline error message (`FEATURES.UNEXPECTED_ERROR`) is visible.

**TEST-3** — `superAdminLoader` MUST have unit tests covering:
  - Unauthenticated user → redirects (consistent with `adminLoader`).
  - Authenticated OwnerAdmin who is NOT SuperAdmin → redirected/blocked.
  - Authenticated SuperAdmin → loader resolves without redirect.

**TEST-4** — Test files that use `useIntl` MUST wrap the component under test in `IntlProvider`
(consistent with project convention).

---

## Acceptance Scenarios

### S-ACCESS-1: Non-SuperAdmin blocked

- GIVEN an authenticated user who is OwnerAdmin but NOT SuperAdmin
- WHEN they navigate to `/admin/features`
- THEN `superAdminLoader` redirects them away before `FeaturesPage` renders

### S-ACCESS-2: Unauthenticated blocked

- GIVEN a user who is not authenticated
- WHEN they navigate to `/admin/features`
- THEN `superAdminLoader` redirects to `/login` and `FeaturesPage` does not render

### S-ACCESS-3: SuperAdmin reaches page

- GIVEN an authenticated SuperAdmin user
- WHEN they navigate to `/admin/features`
- THEN `FeaturesPage` renders with the title (`FEATURES.TITLE`) and the activate button (`FEATURES.ACTIVATE_FEATURES`)

### S-PAGE-1: Activate button — success

- GIVEN an authenticated SuperAdmin on `/admin/features`
- WHEN they click the activate button
- AND `featureHttpService.activateFeatures()` resolves with `{ succeeded: true }`
- THEN an inline success message (`FEATURES.FEATURES_ACTIVATED`) is visible
- AND no toast is shown

### S-PAGE-2: Activate button — succeeded false

- GIVEN an authenticated SuperAdmin on `/admin/features`
- WHEN they click the activate button
- AND the response has `succeeded === false`
- THEN an inline error message (`FEATURES.UNEXPECTED_ERROR`) is visible
- AND no toast is shown

### S-PAGE-3: Activate button — HTTP error

- GIVEN an authenticated SuperAdmin on `/admin/features`
- WHEN they click the activate button
- AND the HTTP call throws (network error or 4xx/5xx)
- THEN an inline error message (`FEATURES.UNEXPECTED_ERROR`) is visible
- AND no unhandled rejection propagates

### S-I18N-1: All copy from i18n keys

- GIVEN `FeaturesPage` is rendered inside an `IntlProvider`
- THEN no raw string literals appear in the rendered output; all copy originates from `FEATURES.*` keys in `es.ts`

---

## Admin Dashboard Specification (SuperAdmin Store Stats)

**Change:** admin-dashboard
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-02

### Requirement: Admin Dashboard Route Registration (ADMIN-DASHBOARD-ROUTE)

The system MUST register the `/admin/dashboard` route in `app/routes.ts` under the existing
`app-layout` route, pointing to `AdminDashboardPage`.

The route module MUST export a named `loader` bound to `superAdminLoader` AND a default export
for the page component.

#### Scenario: S-ADMIN-DASHBOARD-ROUTE-1 — Route registered

- GIVEN `app/routes.ts` is loaded
- WHEN the router resolves path `/admin/dashboard`
- THEN it mounts `AdminDashboardPage` with `loader = superAdminLoader`

---

### Requirement: Admin Dashboard Access Control (ADMIN-DASHBOARD-ACCESS)

The `/admin/dashboard` route MUST be gated exclusively by `superAdminLoader` (`isSuperAdmin` ONLY).
Users who are `isOwnerAdmin` but NOT `isSuperAdmin` MUST be blocked. No `EFeatures` check is
applied.

#### Scenario: S-ADMIN-DASHBOARD-ACCESS-1 — SuperAdmin reaches page

- GIVEN an authenticated SuperAdmin user
- WHEN they navigate to `/admin/dashboard`
- THEN `AdminDashboardPage` renders without redirect

#### Scenario: S-ADMIN-DASHBOARD-ACCESS-2 — OwnerAdmin blocked

- GIVEN an authenticated user who is `isOwnerAdmin` but NOT `isSuperAdmin`
- WHEN they navigate to `/admin/dashboard`
- THEN `superAdminLoader` redirects them before the page renders

#### Scenario: S-ADMIN-DASHBOARD-ACCESS-3 — Unauthenticated redirected

- GIVEN a user who is not authenticated
- WHEN they navigate to `/admin/dashboard`
- THEN `superAdminLoader` redirects to `/login` and the page does not render

---

### Requirement: Admin Dashboard HTTP Service (ADMIN-DASHBOARD-HTTP)

A `usageHttpService` singleton MUST exist at
`app/admin/dashboard/lib/services/usage-http-service.ts`.

`usageHttpService` MUST expose exactly two methods:

| Method | HTTP | Endpoint | Response type |
|--------|------|----------|---------------|
| `getStoresLastWeek()` | GET | `/v1/usages/stores-last-week` | `BaseResponseModel<StoreUsages>` |
| `getStoresLastMonth()` | GET | `/v1/usages/stores-last-month` | `BaseResponseModel<StoreUsages>` |

`StoreUsages` MUST be defined as `{ storeUsagesCountDays: number[]; activeStoreCount: number }`.
`BaseResponseModel<T>` fields `message` and `actionCode` are nullable (`string | null` /
`number | null`) on both branches; `errors` remains non-nullable. Test mocks MAY use `null` for
`message`/`actionCode`; `errors` mocks MUST still use `[]` (or a populated array) — never `null`.

`usageHttpService` MUST NOT define its own Axios instance; all calls MUST use the shared `apiClient`.

Dead Angular helpers (`getTotalTiendas`, `getAverageTiendas`, `getMaxTiendas`,
`getPorcentajePromedio`, `getPorcentajeMaximo`) MUST NOT be ported.

#### Scenario: S-ADMIN-DASHBOARD-HTTP-1 — getStoresLastWeek calls correct endpoint

- GIVEN `usageHttpService` is instantiated with the shared `apiClient`
- WHEN `getStoresLastWeek()` is called
- THEN a GET request is made to `/v1/usages/stores-last-week`
- AND the resolved value is `BaseResponseModel<StoreUsages>`

#### Scenario: S-ADMIN-DASHBOARD-HTTP-2 — getStoresLastMonth calls correct endpoint

- GIVEN `usageHttpService` is instantiated with the shared `apiClient`
- WHEN `getStoresLastMonth()` is called
- THEN a GET request is made to `/v1/usages/stores-last-month`
- AND the resolved value is `BaseResponseModel<StoreUsages>`

#### Scenario: S-ADMIN-DASHBOARD-HTTP-3 — Dead helpers absent

- GIVEN the service file is imported
- THEN none of `getTotalTiendas`, `getAverageTiendas`, `getMaxTiendas`,
  `getPorcentajePromedio`, `getPorcentajeMaximo` are exported or defined

---

### Requirement: Admin Dashboard Container (ADMIN-DASHBOARD-PAGE)

A container `AdminDashboardPage` MUST exist at `app/admin/dashboard/routes/dashboard.tsx`,
exported as a named export AND as `default`.

**Default view (7 days):** On mount, the container MUST call `usageHttpService.getStoresLastWeek()`
and build category labels via `getDiasSemana()` — a rolling Monday-first 7-day window where
Sunday (`getDay() === 0`) maps to index 6.

**30-day view:** When the user toggles to 30 days, the container MUST call
`usageHttpService.getStoresLastMonth()` and build category labels `['1', '2', …, '30']`
via `getDias30()`.

**Toggle:** Changing the active view MUST reset the current data arrays and re-fetch from the
corresponding endpoint.

**Table:** The container MUST render a table with two columns (`ADMIN_DASHBOARD.COL_CATEGORY` /
`ADMIN_DASHBOARD.COL_VALUE`) whose rows are formed by zipping `categories[]` with
`storeUsagesCountDays`; if `storeUsagesCountDays[i]` is absent or falsy, the value MUST display
as `0`.

**Header / Title:** The container MUST render a card header using i18n key
`ADMIN_DASHBOARD.HEADER` and a heading using i18n key `ADMIN_DASHBOARD.TITLE`.

**Toggle buttons:** Two buttons MUST be rendered — one labelled `ADMIN_DASHBOARD.LAST_7_DAYS`
and one labelled `ADMIN_DASHBOARD.LAST_30_DAYS` — to switch between views.

#### Scenario: S-ADMIN-DASHBOARD-PAGE-1 — Default 7-day fetch on mount

- GIVEN `AdminDashboardPage` mounts for a SuperAdmin
- WHEN the component initialises
- THEN `usageHttpService.getStoresLastWeek()` is called
- AND the table is populated with `getDiasSemana()` labels and the returned `storeUsagesCountDays`

#### Scenario: S-ADMIN-DASHBOARD-PAGE-2 — Toggle to 30 days re-fetches

- GIVEN `AdminDashboardPage` is displaying the 7-day view
- WHEN the user clicks the `ADMIN_DASHBOARD.LAST_30_DAYS` button
- THEN `usageHttpService.getStoresLastMonth()` is called
- AND the table is repopulated with `getDias30()` labels (`'1'`…`'30'`) and the new `storeUsagesCountDays`

#### Scenario: S-ADMIN-DASHBOARD-PAGE-3 — Toggle back to 7 days re-fetches

- GIVEN `AdminDashboardPage` is displaying the 30-day view
- WHEN the user clicks the `ADMIN_DASHBOARD.LAST_7_DAYS` button
- THEN `usageHttpService.getStoresLastWeek()` is called
- AND the table is repopulated with `getDiasSemana()` labels

#### Scenario: S-ADMIN-DASHBOARD-PAGE-4 — value fallback for missing data

- GIVEN `storeUsagesCountDays` is shorter than `categories[]`
- WHEN the table renders row i where `storeUsagesCountDays[i]` is absent or `0`
- THEN the displayed value for that row is `0`

#### Scenario: S-ADMIN-DASHBOARD-PAGE-5 — getDiasSemana Sunday edge

- GIVEN today is a Sunday (`getDay() === 0`)
- WHEN `getDiasSemana()` builds the rolling label window
- THEN Sunday's label appears at index 6 (last position), preserving Monday-first ordering

#### Scenario: S-ADMIN-DASHBOARD-PAGE-6 — No chart rendered

- GIVEN `AdminDashboardPage` renders successfully
- THEN no chart component (ApexCharts or any charting library) is present in the output
- AND `activeStoreCount` is NOT displayed anywhere in the UI

---

### Requirement: Admin Dashboard Internationalisation (ADMIN-DASHBOARD-I18N)

The following `ADMIN_DASHBOARD.*` keys MUST be added to `app/shared/lib/i18n/es.ts`:

| Key | Purpose |
|-----|---------|
| `ADMIN_DASHBOARD.HEADER` | Card header label |
| `ADMIN_DASHBOARD.TITLE` | Page heading |
| `ADMIN_DASHBOARD.LAST_7_DAYS` | Toggle button — 7-day view |
| `ADMIN_DASHBOARD.LAST_30_DAYS` | Toggle button — 30-day view |
| `ADMIN_DASHBOARD.COL_CATEGORY` | Table column header — category |
| `ADMIN_DASHBOARD.COL_VALUE` | Table column header — value |
| `ADMIN_DASHBOARD.ERROR` | Inline error message |

`en.ts` MUST NOT be modified (no English locale exists for admin keys in this project).

#### Scenario: S-ADMIN-DASHBOARD-I18N-1 — All visible copy from i18n keys

- GIVEN `AdminDashboardPage` is rendered inside an `IntlProvider`
- THEN every visible string originates from an `ADMIN_DASHBOARD.*` key in `es.ts`
- AND no raw string literals appear in the TSX

---

### Requirement: Admin Dashboard Testing (ADMIN-DASHBOARD-TEST)

A smoke-test suite MUST exist at
`app/admin/dashboard/routes/__tests__/dashboard.test.tsx`.

Tests MUST cover:
- SuperAdmin mounts page; default 7-day fetch fires; table renders with day labels.
- OwnerAdmin is blocked by `superAdminLoader`.
- Toggle to 30 days calls `getStoresLastMonth()`; table re-renders with numeric labels.
- Toggle back to 7 days calls `getStoresLastWeek()`.
- Missing `storeUsagesCountDays` entry renders as `0`.
- No chart element present in rendered output.
- `activeStoreCount` NOT present in rendered output.

A unit test suite MUST exist at
`app/admin/dashboard/lib/services/__tests__/usage-http-service.test.ts`.

Tests MUST cover:
- `getStoresLastWeek()` calls `GET /v1/usages/stores-last-week`.
- `getStoresLastMonth()` calls `GET /v1/usages/stores-last-month`.
- Mocks populate the `BaseResponseModel<StoreUsages>` fields.

`BaseResponseModel<T>` fields `message` and `actionCode` are nullable (`string | null` /
`number | null`) on both branches; `errors` remains non-nullable. Test mocks MAY use `null` for
`message`/`actionCode`; `errors` mocks MUST still use `[]` (or a populated array) — never `null`.

#### Scenario: S-ADMIN-DASHBOARD-TEST-1 — Service tests cover both endpoints

- GIVEN `usageHttpService` is tested with a mocked `apiClient`
- WHEN each method is called
- THEN the correct URL is asserted for each method
- AND mock responses use `BaseResponseModel` fields

#### Scenario: S-ADMIN-DASHBOARD-TEST-2 — Route smoke tests cover toggle behaviour

- GIVEN `AdminDashboardPage` is rendered with `IntlProvider` and mocked service
- WHEN the component mounts and the 30-day toggle is clicked
- THEN the test asserts `getStoresLastWeek()` was called on mount
- AND `getStoresLastMonth()` was called after the toggle

---

## Admin Dashboard Non-Goals (Explicit Negative Requirements)

### ADMIN-DASHBOARD-NGOAL-1 — No chart

The system MUST NOT render any chart component for the admin dashboard. The Angular `ng-apexcharts`
bar chart was commented out and never shipped; parity requires its absence in React as well.

### ADMIN-DASHBOARD-NGOAL-2 — activeStoreCount not displayed

The `activeStoreCount` field returned by both endpoints MUST NOT be rendered in the UI. It is
captured in the service response type for type correctness but intentionally omitted from display.

### ADMIN-DASHBOARD-NGOAL-3 — Dead helpers not ported

None of the five dead Angular helpers (`getTotalTiendas`, `getAverageTiendas`, `getMaxTiendas`,
`getPorcentajePromedio`, `getPorcentajeMaximo`) MUST be ported to the React service.

### ADMIN-DASHBOARD-NGOAL-4 — No new loader

`superAdminLoader` already exists. No new loader MUST be created for this route.

### ADMIN-DASHBOARD-NGOAL-5 — No en.ts changes

`ADMIN_DASHBOARD.*` keys MUST NOT be added to `en.ts`. Only `es.ts` is modified.

---

## Admin Resellers Specification (SuperAdmin Reseller CRUD)

**Change:** admin-resellers
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-02

### Requirement: Admin Resellers Route Registration (ADMIN-RESELLERS-ROUTE)

The system MUST register three routes in `app/routes.ts` under the existing `app-layout` route:

| Path | Component | Loader |
|------|-----------|--------|
| `/admin/resellers` | `ResellerListPage` | `superAdminLoader` |
| `/admin/resellers/create` | `ResellerCreatePage` | `superAdminLoader` |
| `/admin/resellers/edit/:id` | `ResellerEditPage` | `superAdminLoader` |

Each route module MUST export a named `loader` bound to `superAdminLoader` AND a default export
for the page component.

No `EFeatures` check is applied to any of the three routes.

#### Scenario: S-ADMIN-RESELLERS-ROUTE-1 — List route registered

- GIVEN `app/routes.ts` is loaded
- WHEN the router resolves path `/admin/resellers`
- THEN it mounts `ResellerListPage` with `loader = superAdminLoader`

#### Scenario: S-ADMIN-RESELLERS-ROUTE-2 — Create route registered

- GIVEN `app/routes.ts` is loaded
- WHEN the router resolves path `/admin/resellers/create`
- THEN it mounts `ResellerCreatePage` with `loader = superAdminLoader`

#### Scenario: S-ADMIN-RESELLERS-ROUTE-3 — Edit route registered

- GIVEN `app/routes.ts` is loaded
- WHEN the router resolves path `/admin/resellers/edit/42`
- THEN it mounts `ResellerEditPage` with `loader = superAdminLoader`

---

### Requirement: Admin Resellers Access Control (ADMIN-RESELLERS-ACCESS)

All three reseller routes (`/admin/resellers`, `/admin/resellers/create`,
`/admin/resellers/edit/:id`) MUST be gated exclusively by `superAdminLoader`
(`isSuperAdmin` ONLY). Users who are `isOwnerAdmin` but NOT `isSuperAdmin` MUST be blocked.
Unauthenticated users MUST be redirected to `/login`. No `EFeatures` check is applied.

#### Scenario: S-ADMIN-RESELLERS-ACCESS-1 — SuperAdmin reaches list

- GIVEN an authenticated SuperAdmin user
- WHEN they navigate to `/admin/resellers`
- THEN `ResellerListPage` renders without redirect

#### Scenario: S-ADMIN-RESELLERS-ACCESS-2 — OwnerAdmin blocked on list

- GIVEN an authenticated user who is `isOwnerAdmin` but NOT `isSuperAdmin`
- WHEN they navigate to `/admin/resellers`
- THEN `superAdminLoader` redirects them before the page renders

#### Scenario: S-ADMIN-RESELLERS-ACCESS-3 — Unauthenticated redirected

- GIVEN a user who is not authenticated
- WHEN they navigate to any reseller route
- THEN `superAdminLoader` redirects to `/login` and no reseller page renders

#### Scenario: S-ADMIN-RESELLERS-ACCESS-4 — OwnerAdmin blocked on create

- GIVEN an authenticated user who is `isOwnerAdmin` but NOT `isSuperAdmin`
- WHEN they navigate to `/admin/resellers/create`
- THEN `superAdminLoader` redirects them before `ResellerCreatePage` renders

#### Scenario: S-ADMIN-RESELLERS-ACCESS-5 — OwnerAdmin blocked on edit

- GIVEN an authenticated user who is `isOwnerAdmin` but NOT `isSuperAdmin`
- WHEN they navigate to `/admin/resellers/edit/1`
- THEN `superAdminLoader` redirects them before `ResellerEditPage` renders

---

### Requirement: Admin Resellers HTTP Service (ADMIN-RESELLERS-HTTP)

A `resellerHttpService` singleton MUST exist at
`app/admin/resellers/lib/services/reseller-http-service.ts`.

`resellerHttpService` MUST expose exactly four methods:

| Method | HTTP verb | Endpoint | Response type |
|--------|-----------|----------|---------------|
| `listResellers()` | GET | `/v1/reSellers/all/true` | `BaseResponseModel<ReSeller[]>` |
| `getReseller(id: string)` | GET | `/v1/reSellers/:id` | `BaseResponseModel<ReSeller>` |
| `createReseller(payload)` | POST | `/v1/reSellers/` | `BaseResponseModel<string>` |
| `updateReseller(id: string, payload)` | PUT | `/v1/reSellers/:id` | `BaseResponseModel<boolean>` |

The `ReSeller` type is imported from `@store-mgmt/domain` (`packages/domain/src/models/store.ts`).
`BaseResponseModel<T>` fields `message` and `actionCode` are nullable (`string | null` /
`number | null`) on both branches; `errors` remains non-nullable. Test mocks MAY use `null` for
`message`/`actionCode`; `errors` mocks MUST still use `[]` (or a populated array) — never `null`.

`resellerHttpService` MUST NOT define its own Axios instance. All calls MUST use the shared
`apiClient` from `~/shared/lib/http/api-client`.

The `deleteReSeller` endpoint (DELETE `/v1/reSellers/:id`) and `getReSellerDetailsById`
(GET `/v1/reSellers/details/:id`) MUST NOT be included — they have no wired consumers.

#### Scenario: S-ADMIN-RESELLERS-HTTP-1 — listResellers calls correct endpoint

- GIVEN `resellerHttpService` is instantiated with the shared `apiClient`
- WHEN `listResellers()` is called
- THEN a GET request is made to `/v1/reSellers/all/true`
- AND the resolved value is `BaseResponseModel<ReSeller[]>`

#### Scenario: S-ADMIN-RESELLERS-HTTP-2 — getReseller calls correct endpoint

- GIVEN `resellerHttpService` is instantiated
- WHEN `getReseller('42')` is called
- THEN a GET request is made to `/v1/reSellers/42`

#### Scenario: S-ADMIN-RESELLERS-HTTP-3 — createReseller POSTs to correct endpoint

- GIVEN `resellerHttpService` is instantiated
- WHEN `createReseller(payload)` is called
- THEN a POST request is made to `/v1/reSellers/`
- AND the payload body contains `{fullName, login, password, cellPhone, email, description}`

#### Scenario: S-ADMIN-RESELLERS-HTTP-4 — updateReseller PUTs to correct endpoint

- GIVEN `resellerHttpService` is instantiated
- WHEN `updateReseller('42', payload)` is called
- THEN a PUT request is made to `/v1/reSellers/42`
- AND the payload body contains `{fullName, cellPhone, email, percentDiscountPrice, discountPrice, isActive, description}`

#### Scenario: S-ADMIN-RESELLERS-HTTP-5 — Dead endpoints absent

- GIVEN the service file is imported
- THEN no `deleteReSeller`, `approveReSeller`, or `getReSellerDetailsById` method is exported or defined

---

### Requirement: Admin Resellers List Page (ADMIN-RESELLERS-LIST)

A container `ResellerListPage` MUST exist at
`app/admin/resellers/routes/reseller-list.tsx`, exported as a named export AND as `default`.

On mount the container MUST call `resellerHttpService.listResellers()` and render the returned
resellers as a card grid.

Each card MUST display:
- `fullName`
- `percentDiscountPrice`
- `discountPrice`
- `cellPhone`
- `email` (conditional — rendered only when `email` is non-empty)
- `description`

Each card with `isActive === false` MUST apply the `deactive-reSeller` CSS class for visual
distinction.

The page header MUST include a button navigating to `/admin/resellers/create`.

Each card MUST include a control (e.g. settings icon or link) navigating to
`/admin/resellers/edit/:id` for that reseller.

The list MUST NOT render activate, deactivate, or delete action buttons. The Angular source
contains only empty no-op stubs for those actions; omitting them preserves behavioral parity.

On HTTP error, the container MUST display an inline error message and MUST NOT propagate an
unhandled rejection.

#### Scenario: S-ADMIN-RESELLERS-LIST-1 — Successful load renders cards

- GIVEN `ResellerListPage` mounts for a SuperAdmin
- WHEN `resellerHttpService.listResellers()` resolves with a list of resellers
- THEN one card is rendered per reseller
- AND each card shows fullName, percentDiscountPrice, discountPrice, cellPhone, description

#### Scenario: S-ADMIN-RESELLERS-LIST-2 — Inactive reseller card has deactive-reSeller class

- GIVEN a reseller with `isActive === false`
- WHEN the card renders
- THEN the card element has the `deactive-reSeller` CSS class applied

#### Scenario: S-ADMIN-RESELLERS-LIST-3 — Email shown only when non-empty

- GIVEN a reseller with a non-empty `email`
- WHEN the card renders
- THEN the email value is visible

- GIVEN a reseller with an empty `email`
- WHEN the card renders
- THEN no email element is rendered

#### Scenario: S-ADMIN-RESELLERS-LIST-4 — Navigate to create

- GIVEN `ResellerListPage` is rendered
- WHEN the user clicks the add/create button
- THEN the router navigates to `/admin/resellers/create`

#### Scenario: S-ADMIN-RESELLERS-LIST-5 — Navigate to edit

- GIVEN a reseller card with id `'42'` is rendered
- WHEN the user activates the edit control on that card
- THEN the router navigates to `/admin/resellers/edit/42`

#### Scenario: S-ADMIN-RESELLERS-LIST-6 — No activate/deactivate/delete buttons

- GIVEN `ResellerListPage` renders any number of reseller cards
- THEN no activate, deactivate, or delete action element is present in the rendered output

#### Scenario: S-ADMIN-RESELLERS-LIST-7 — HTTP error shows inline error

- GIVEN `resellerHttpService.listResellers()` rejects or returns `succeeded === false`
- WHEN the page loads
- THEN an inline error message is displayed
- AND no unhandled rejection propagates

---

### Requirement: Admin Resellers Create Page (ADMIN-RESELLERS-CREATE)

A container `ResellerCreatePage` MUST exist at
`app/admin/resellers/routes/reseller-create.tsx`, exported as a named export AND as `default`.

The page MUST render a controlled form with the following fields:

| Field | Type | Validation |
|-------|------|-----------|
| `fullName` | text input | required |
| `login` | text input | required |
| `password` | password input (show/hide toggle) | required; regex `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` (min 8, max 30, at least one digit, one lower, one upper) |
| `confirmPassword` | password input | required; MUST match `password` field exactly (cross-field validation) |
| `cellPhone` | text input | required; format validation (no mask library) |
| `email` | email input | required; email format |
| `description` | textarea | optional |

The submit button MUST be disabled when any required field is empty or any validation fails.

On submit the container MUST call
`resellerHttpService.createReseller({fullName, login, password, cellPhone, email, description})`.

On success (`succeeded === true`) the container MUST navigate to `/admin/resellers`.

On failure (`succeeded === false` or HTTP error) the container MUST display an inline error
from `response.errors[0].description` (or a generic fallback). No toast is used.

The `useUnsavedChangesPrompt` hook and `UnsavedChangesDialog` component MUST be active on this
page. The unsaved-changes guard MUST be triggered when the form is dirty and the user attempts
to navigate away; it MUST NOT trigger when the form is pristine.

#### Scenario: S-ADMIN-RESELLERS-CREATE-1 — Form renders all required fields

- GIVEN `ResellerCreatePage` mounts for a SuperAdmin
- THEN fullName, login, password, confirmPassword, cellPhone, email, and description inputs are present

#### Scenario: S-ADMIN-RESELLERS-CREATE-2 — Submit disabled on invalid form

- GIVEN any required field is empty or any validation fails
- THEN the submit button is disabled

#### Scenario: S-ADMIN-RESELLERS-CREATE-3 — Password regex enforced

- GIVEN the password field contains a string that does not satisfy the regex
  (`(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}`)
- THEN the form is invalid and submit remains disabled

#### Scenario: S-ADMIN-RESELLERS-CREATE-4 — Confirm password cross-match enforced

- GIVEN password is `Abcdef1!` and confirmPassword is `Different1!`
- THEN the form is invalid and submit remains disabled

#### Scenario: S-ADMIN-RESELLERS-CREATE-5 — Successful create navigates to list

- GIVEN all fields are valid
- WHEN the user submits the form
- AND `resellerHttpService.createReseller(payload)` resolves with `succeeded === true`
- THEN the router navigates to `/admin/resellers`

#### Scenario: S-ADMIN-RESELLERS-CREATE-6 — Failed create shows inline error

- GIVEN all fields are valid
- WHEN the user submits the form
- AND the response has `succeeded === false` or the HTTP call throws
- THEN an inline error message is displayed from `errors[0].description` (or generic fallback)
- AND no navigation occurs

#### Scenario: S-ADMIN-RESELLERS-CREATE-7 — Unsaved-changes guard on dirty form

- GIVEN the user has entered data (form is dirty)
- WHEN the user attempts to navigate away without submitting
- THEN `UnsavedChangesDialog` is shown prompting confirmation

#### Scenario: S-ADMIN-RESELLERS-CREATE-8 — Unsaved-changes guard not triggered on pristine form

- GIVEN the form has not been modified (pristine)
- WHEN the user navigates away
- THEN no dialog is shown and navigation proceeds immediately

#### Scenario: S-ADMIN-RESELLERS-CREATE-9 — No mask library used for cellPhone

- GIVEN `ResellerCreatePage` is rendered
- THEN no phone-mask library is imported or invoked; cellPhone is a plain text input

---

### Requirement: Admin Resellers Edit Page (ADMIN-RESELLERS-EDIT)

A container `ResellerEditPage` MUST exist at
`app/admin/resellers/routes/reseller-edit.tsx`, exported as a named export AND as `default`.

This is a FLAT route — no shell/tab wrapper. The page renders the edit form directly
(behavioral parity with the Angular edit shell + details tab; structural simplification only).

On mount the container MUST read the `:id` path parameter and call
`resellerHttpService.getReseller(id)` (`GET /v1/reSellers/:id`). On success the form fields
MUST be pre-populated via `patchValue` equivalent.

The page MUST render a controlled form with the following fields:

| Field | Type | Notes |
|-------|------|-------|
| `login` | text input | Disabled/read-only — display only, never submitted |
| `fullName` | text input | required |
| `isActive` | toggle/checkbox | no required validation |
| `percentDiscountPrice` | number input | required; `min=0` |
| `discountPrice` | number input | required; `min=0` |
| `cellPhone` | text input | required; format validation (no mask library) |
| `email` | email input | required; email format |
| `description` | textarea | optional |

The `reSellerId` control that appears conditionally in the Angular source MUST NOT be included
(it is dead code — never used in the Angular template).

On submit the container MUST call
`resellerHttpService.updateReseller(id, {fullName, cellPhone, email, percentDiscountPrice, discountPrice, isActive, description})`.

On success (`succeeded === true`) the container MUST navigate to
`/admin/resellers/edit/:id` (stay on the same page — same as Angular behavior).

On failure the container MUST display an inline error. No toast is used.

The `useUnsavedChangesPrompt` hook and `UnsavedChangesDialog` component MUST be active on this
page, with the same dirty/pristine logic as the create page.

#### Scenario: S-ADMIN-RESELLERS-EDIT-1 — Load pre-populates form

- GIVEN `ResellerEditPage` mounts with `:id = '42'`
- WHEN `resellerHttpService.getReseller('42')` resolves with a reseller record
- THEN all editable form fields are pre-populated with the reseller's values

#### Scenario: S-ADMIN-RESELLERS-EDIT-2 — login field is read-only

- GIVEN `ResellerEditPage` is loaded with a reseller
- THEN the `login` input is disabled (not editable by the user)
- AND `login` is NOT included in the PUT request body

#### Scenario: S-ADMIN-RESELLERS-EDIT-3 — isActive toggle reflects current state

- GIVEN a reseller with `isActive === false`
- WHEN `ResellerEditPage` mounts and loads the reseller
- THEN the isActive toggle is in the off/inactive state

#### Scenario: S-ADMIN-RESELLERS-EDIT-4 — Successful update stays on page

- GIVEN the form is valid and dirty
- WHEN the user submits
- AND `resellerHttpService.updateReseller('42', payload)` resolves with `succeeded === true`
- THEN the router navigates to `/admin/resellers/edit/42` (same page refresh)

#### Scenario: S-ADMIN-RESELLERS-EDIT-5 — Failed update shows inline error

- GIVEN the form is valid
- WHEN the user submits
- AND the response has `succeeded === false` or the HTTP call throws
- THEN an inline error message is displayed
- AND no navigation occurs

#### Scenario: S-ADMIN-RESELLERS-EDIT-6 — Unsaved-changes guard on dirty form

- GIVEN the user has modified at least one field (form is dirty)
- WHEN the user attempts to navigate away without submitting
- THEN `UnsavedChangesDialog` is shown prompting confirmation

#### Scenario: S-ADMIN-RESELLERS-EDIT-7 — reSellerId dead control absent

- GIVEN `ResellerEditPage` is rendered
- THEN no `reSellerId` input or hidden field is present in the rendered output

#### Scenario: S-ADMIN-RESELLERS-EDIT-8 — Load failure shows inline error

- GIVEN `resellerHttpService.getReseller(id)` rejects or returns `succeeded === false`
- WHEN `ResellerEditPage` mounts
- THEN an inline error is displayed and the form is not pre-populated

---

### Requirement: Admin Resellers Internationalisation (ADMIN-RESELLERS-I18N)

The following `RESELLERS.*` keys MUST be added to `app/shared/lib/i18n/es.ts`.
Field-level labels that already exist under `GENERAL.*` or `USER.*` MUST be referenced from
those existing keys in the component — no duplicate key must be added to `es.ts`.
Only net-new slice-specific keys are listed here:

| Key | Purpose |
|-----|---------|
| `RESELLERS.LIST_TITLE` | Page heading for the list page |
| `RESELLERS.ADD` | Label for the add/create button on the list page |
| `RESELLERS.CREATE_TITLE` | Page heading for the create form |
| `RESELLERS.EDIT_TITLE` | Page heading for the edit form |
| `RESELLERS.PERCENT_DISCOUNT` | Label for `percentDiscountPrice` field |
| `RESELLERS.DISCOUNT_PRICE` | Label for `discountPrice` field |
| `RESELLERS.ERROR` | Generic inline error message for HTTP failures |

`en.ts` MUST NOT be modified (no English locale exists for admin keys in this project).

All user-visible strings in reseller pages MUST be sourced from i18n keys. No hardcoded string
literals are permitted in TSX.

#### Scenario: S-ADMIN-RESELLERS-I18N-1 — All visible copy from i18n keys

- GIVEN any reseller page is rendered inside an `IntlProvider`
- THEN every visible string originates from a `RESELLERS.*`, `GENERAL.*`, or `USER.*` key in `es.ts`
- AND no raw string literals appear in the TSX

#### Scenario: S-ADMIN-RESELLERS-I18N-2 — Required keys exist at runtime

- GIVEN `es.ts` is loaded
- THEN all seven `RESELLERS.*` keys listed above are present and non-empty

---

### Requirement: Admin Resellers Testing (ADMIN-RESELLERS-TEST)

The following test suites MUST exist:

| File | What it covers |
|------|---------------|
| `app/admin/resellers/lib/services/__tests__/reseller-http-service.test.ts` | Service: all 4 methods call correct endpoints; mocks use `BaseResponseModel` fields |
| `app/admin/resellers/routes/__tests__/reseller-list.test.tsx` | List page: load renders cards; inactive card has `deactive-reSeller` class; navigate-to-create; navigate-to-edit; no activate/deactivate/delete; HTTP error shows inline error |
| `app/admin/resellers/routes/__tests__/reseller-create.test.tsx` | Create page: form fields present; submit disabled when invalid; password regex enforced; confirm-match enforced; success navigates to list; error shows inline; unsaved-changes guard triggers on dirty form |
| `app/admin/resellers/routes/__tests__/reseller-edit.test.tsx` | Edit page: load pre-populates fields; login is disabled; success stays on page; error shows inline; unsaved-changes guard triggers on dirty; reSellerId absent |

All test files that use `useIntl` MUST wrap the component under test in `IntlProvider`
(consistent with project convention).

`BaseResponseModel<T>` fields `message` and `actionCode` are nullable (`string | null` /
`number | null`) on both branches; `errors` remains non-nullable. Test mocks MAY use `null` for
`message`/`actionCode`; `errors` mocks MUST still use `[]` (or a populated array) — never `null`.

#### Scenario: S-ADMIN-RESELLERS-TEST-1 — Service tests cover all endpoints

- GIVEN `resellerHttpService` is tested with a mocked `apiClient`
- WHEN each of the four methods is called
- THEN the correct URL is asserted for each method
- AND mock responses use `BaseResponseModel` fields

#### Scenario: S-ADMIN-RESELLERS-TEST-2 — List smoke tests cover all scenarios

- GIVEN `ResellerListPage` is rendered with `IntlProvider` and mocked service
- THEN all scenarios in ADMIN-RESELLERS-LIST are covered by at least one test assertion

#### Scenario: S-ADMIN-RESELLERS-TEST-3 — Create smoke tests cover validation paths

- GIVEN `ResellerCreatePage` is rendered with `IntlProvider` and mocked service
- THEN all scenarios in ADMIN-RESELLERS-CREATE are covered by at least one test assertion

#### Scenario: S-ADMIN-RESELLERS-TEST-4 — Edit smoke tests cover all edit paths

- GIVEN `ResellerEditPage` is rendered with `IntlProvider` and mocked service
- THEN all scenarios in ADMIN-RESELLERS-EDIT are covered by at least one test assertion

---

## Admin Resellers Non-Goals (Explicit Negative Requirements)

### ADMIN-RESELLERS-NGOAL-1 — No activate/deactivate/delete buttons

The list page MUST NOT render activate, deactivate, or delete action buttons.
The Angular source contains only empty no-op stubs for those actions; omitting them preserves
behavioral parity while avoiding broken UX.

### ADMIN-RESELLERS-NGOAL-2 — No phone mask library

A phone mask library MUST NOT be added as a dependency. `cellPhone` is a plain text input
with format validation only.

### ADMIN-RESELLERS-NGOAL-3 — No shell/tab split for edit

`ResellerEditPage` MUST be a flat route component. No shell wrapper or tab group is created.
The Angular edit shell contained a single tab with zero semantic meaning; flattening it is
behavioral parity.

### ADMIN-RESELLERS-NGOAL-4 — No reSellerId control

The `reSellerId` dynamic control from the Angular edit form MUST NOT be ported. It is dead
code that was never wired to the Angular template.

### ADMIN-RESELLERS-NGOAL-5 — No changes to domain package

`ReSeller` model, `EFeatures.ReSellers`, and `MENU.RESELLERS` key already exist and are correct.
No modifications to `packages/domain/` or `menu-config.ts` are permitted.

### ADMIN-RESELLERS-NGOAL-6 — No en.ts changes

`RESELLERS.*` keys MUST NOT be added to `en.ts`. Only `es.ts` is modified.

### ADMIN-RESELLERS-NGOAL-7 — No approveReSeller endpoint

The `approveReSeller` stub from Angular MUST NOT be ported. It was never wired to the template.

### ADMIN-RESELLERS-NGOAL-8 — No getReSellerDetailsById endpoint

The `getReSellerDetailsById` (GET `/v1/reSellers/details/:id`) endpoint MUST NOT be included in
the React service. It is dead code in the Angular source.

---

## Admin Owners Specification (SuperAdmin/Reseller Owner CRUD + Tab-Shell Edit)

**Change:** admin-owners
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-02

### Requirement: Admin Owners Route Registration (ADMIN-OWNERS-ROUTE)

The system MUST register three routes in `app/routes.ts` under the existing `app-layout` route:

| Path | Component | Loader |
|------|-----------|--------|
| `/admin/owners` | `OwnerListPage` | `resellerFeatureLoader([EFeatures.Owners])` |
| `/admin/owners/create` | `OwnerCreatePage` | `resellerFeatureLoader([EFeatures.Owners])` |
| `/admin/owners/edit/:id` | `OwnerEditPage` | `resellerFeatureLoader([EFeatures.Owners])` |

Each route module MUST export a named `loader` bound to `resellerFeatureLoader([EFeatures.Owners])`
AND a default export for the page component.

`resellerFeatureLoader` MUST be a new helper in `app/auth/routes/loaders.ts` that composes
`resellerLoader` (role check: `isSuperAdmin || isReSeller`) with a `EFeatures` feature check,
mirroring the existing `adminFeatureLoader` pattern.

#### Scenario: S-ADMIN-OWNERS-ROUTE-1 — List route registered

- GIVEN `app/routes.ts` is loaded
- WHEN the router resolves path `/admin/owners`
- THEN it mounts `OwnerListPage` with `loader = resellerFeatureLoader([EFeatures.Owners])`

#### Scenario: S-ADMIN-OWNERS-ROUTE-2 — Create route registered

- GIVEN `app/routes.ts` is loaded
- WHEN the router resolves path `/admin/owners/create`
- THEN it mounts `OwnerCreatePage` with `loader = resellerFeatureLoader([EFeatures.Owners])`

#### Scenario: S-ADMIN-OWNERS-ROUTE-3 — Edit route registered

- GIVEN `app/routes.ts` is loaded
- WHEN the router resolves path `/admin/owners/edit/42`
- THEN it mounts `OwnerEditPage` with `loader = resellerFeatureLoader([EFeatures.Owners])`

---

### Requirement: Admin Owners Access Control (ADMIN-OWNERS-ACCESS)

All three owner routes MUST be gated by `resellerFeatureLoader([EFeatures.Owners])`.
The loader MUST allow access only to users where `isSuperAdmin === true` OR `isReSeller === true`
AND the `EFeatures.Owners` feature is enabled. All other users MUST be blocked.
Unauthenticated users MUST be redirected to `/login`.

#### Scenario: S-ADMIN-OWNERS-ACCESS-1 — SuperAdmin reaches list

- GIVEN an authenticated SuperAdmin user with `EFeatures.Owners` enabled
- WHEN they navigate to `/admin/owners`
- THEN `OwnerListPage` renders without redirect

#### Scenario: S-ADMIN-OWNERS-ACCESS-2 — Reseller reaches list

- GIVEN an authenticated Reseller user with `EFeatures.Owners` enabled
- WHEN they navigate to `/admin/owners`
- THEN `OwnerListPage` renders without redirect

#### Scenario: S-ADMIN-OWNERS-ACCESS-3 — OwnerAdmin blocked

- GIVEN an authenticated user who is `isOwnerAdmin` only (not SuperAdmin, not Reseller)
- WHEN they navigate to any owner route
- THEN `resellerFeatureLoader` redirects them before any owner page renders

#### Scenario: S-ADMIN-OWNERS-ACCESS-4 — Feature disabled blocks access

- GIVEN an authenticated SuperAdmin user where `EFeatures.Owners` is NOT enabled
- WHEN they navigate to `/admin/owners`
- THEN `resellerFeatureLoader` blocks access before `OwnerListPage` renders

#### Scenario: S-ADMIN-OWNERS-ACCESS-5 — Unauthenticated redirected

- GIVEN a user who is not authenticated
- WHEN they navigate to any owner route
- THEN the loader redirects to `/login` and no owner page renders

---

### Requirement: Admin Owners HTTP Service (ADMIN-OWNERS-HTTP)

An `ownerHttpService` singleton MUST exist at
`app/admin/owners/lib/services/owner-http-service.ts`.

`ownerHttpService` MUST expose exactly five methods:

| Method | HTTP | Endpoint | Response type |
|--------|------|----------|---------------|
| `getOwners()` | GET | `/v1/owners/all/true` | `BaseResponseModel<Owner[]>` |
| `getOwnerById(id: string)` | GET | `/v1/owners/:id` | `BaseResponseModel<Owner>` |
| `createOwner(payload)` | POST | `/v1/owners/` | `BaseResponseModel<string>` |
| `editOwner(id: string, payload)` | PUT | `/v1/owners/:id` | `BaseResponseModel<boolean>` |
| `deleteOwner(id: string)` | DELETE | `/v1/owners/:id` | `BaseResponseModel<boolean>` |

`Owner` and `OwnerStoreModule` are imported from `@store-mgmt/domain`.
`BaseResponseModel<T>` fields `message` and `actionCode` are nullable (`string | null` /
`number | null`) on both branches; `errors` remains non-nullable. Test mocks MAY use `null` for
`message`/`actionCode`; `errors` mocks MUST still use `[]` (or a populated array) — never `null`.
`ownerHttpService` MUST NOT define its own Axios instance; all calls MUST use the shared `apiClient`.
`getOwnerDetailsById` (GET `/v1/owners/details/:id`) MUST NOT be included — it is dead code.

#### Scenario: S-ADMIN-OWNERS-HTTP-1 — getOwners calls correct endpoint

- GIVEN `ownerHttpService` is instantiated with the shared `apiClient`
- WHEN `getOwners()` is called
- THEN a GET request is made to `/v1/owners/all/true`
- AND the resolved value is `BaseResponseModel<Owner[]>`

#### Scenario: S-ADMIN-OWNERS-HTTP-2 — getOwnerById calls correct endpoint

- GIVEN `ownerHttpService` is instantiated
- WHEN `getOwnerById('42')` is called
- THEN a GET request is made to `/v1/owners/42`

#### Scenario: S-ADMIN-OWNERS-HTTP-3 — createOwner POSTs to correct endpoint

- GIVEN `ownerHttpService` is instantiated
- WHEN `createOwner(payload)` is called
- THEN a POST request is made to `/v1/owners/`
- AND the payload contains `{fullName, login, password, cellPhone, email, description, reSellerId}`

#### Scenario: S-ADMIN-OWNERS-HTTP-4 — editOwner PUTs to correct endpoint

- GIVEN `ownerHttpService` is instantiated
- WHEN `editOwner('42', payload)` is called
- THEN a PUT request is made to `/v1/owners/42`
- AND the payload contains `{fullName, cellPhone, email, guest, isActive, description, reSellerId}`

#### Scenario: S-ADMIN-OWNERS-HTTP-5 — deleteOwner DELETEs correct endpoint

- GIVEN `ownerHttpService` is instantiated
- WHEN `deleteOwner('42')` is called
- THEN a DELETE request is made to `/v1/owners/42`

#### Scenario: S-ADMIN-OWNERS-HTTP-6 — Dead endpoint absent

- GIVEN the service file is imported
- THEN `getOwnerDetailsById` is NOT exported or defined

---

### Requirement: Admin Owners List Page (ADMIN-OWNERS-LIST)

A container `OwnerListPage` MUST exist at `app/admin/owners/routes/owner-list.tsx`, exported as
a named export AND as `default`.

On mount the container MUST call `ownerHttpService.getOwners()` and render the returned owners
as a card grid.

Each card MUST display:
- `fullName`
- Computed total price: sum of `owner.storeModules[].storeModuleTotalCurrentPrice` (formatted; `0` when array is empty)
- Store count: `owner.storeModules.length`
- `GENERAL.RESELLER` label + `owner.reSellerName` (fallback: `'ADMIN'` when `reSellerName` is empty or null)
- `cellPhone`
- `email` (conditional — rendered only when `email` is non-empty)
- `description`

Card background CSS MUST reflect owner state:
- `isActive === false` → apply `deactive-owner` class
- `isActive === true` AND `approved === false` → apply `guest-owner` class
- Otherwise → no extra class

Each card MUST include a DELETE button that calls `ownerHttpService.deleteOwner(owner.id)` and
then refreshes the list. NO confirmation dialog MUST be shown before the delete call.

Each card MUST include an edit control (e.g. settings icon/link) navigating to
`/admin/owners/edit/:id`.

The page MUST NOT render a create button. The `/admin/owners/create` route remains registered and
is URL-accessible, but no UI entry point on the list page navigates to it.

The list MUST NOT render approve, activate, or deactivate action buttons.

On HTTP error the container MUST display an inline error message and MUST NOT propagate an
unhandled rejection.

#### Scenario: S-ADMIN-OWNERS-LIST-1 — Successful load renders cards

- GIVEN `OwnerListPage` mounts for an authorized user
- WHEN `ownerHttpService.getOwners()` resolves with a list of owners
- THEN one card is rendered per owner
- AND each card shows fullName, computed total price, store count, reSellerName (or 'ADMIN'), cellPhone, description

#### Scenario: S-ADMIN-OWNERS-LIST-2 — Inactive owner card has deactive-owner class

- GIVEN an owner with `isActive === false`
- WHEN the card renders
- THEN the card element has the `deactive-owner` CSS class

#### Scenario: S-ADMIN-OWNERS-LIST-3 — Guest owner card has guest-owner class

- GIVEN an owner with `isActive === true` AND `approved === false`
- WHEN the card renders
- THEN the card element has the `guest-owner` CSS class

#### Scenario: S-ADMIN-OWNERS-LIST-4 — Email shown only when non-empty

- GIVEN an owner with a non-empty `email`
- WHEN the card renders
- THEN the email value is visible
- GIVEN an owner with an empty `email`
- WHEN the card renders
- THEN no email element is rendered

#### Scenario: S-ADMIN-OWNERS-LIST-5 — reSellerName falls back to 'ADMIN'

- GIVEN an owner with a null or empty `reSellerName`
- WHEN the card renders
- THEN the reseller label displays `'ADMIN'`

#### Scenario: S-ADMIN-OWNERS-LIST-6 — Total price is 0 when storeModules is empty

- GIVEN an owner with `storeModules = []`
- WHEN the card renders
- THEN the computed total price displays as `0`

#### Scenario: S-ADMIN-OWNERS-LIST-7 — Delete fires without confirmation

- GIVEN an owner card is rendered
- WHEN the user clicks the DELETE button
- THEN `ownerHttpService.deleteOwner(owner.id)` is called immediately with no confirmation dialog
- AND the list refreshes after the call resolves

#### Scenario: S-ADMIN-OWNERS-LIST-8 — Navigate to edit

- GIVEN an owner card with id `'42'` is rendered
- WHEN the user activates the edit control
- THEN the router navigates to `/admin/owners/edit/42`

#### Scenario: S-ADMIN-OWNERS-LIST-9 — No create button present

- GIVEN `OwnerListPage` renders
- THEN no create/add button or link to `/admin/owners/create` is present in the rendered output

#### Scenario: S-ADMIN-OWNERS-LIST-10 — HTTP error shows inline error

- GIVEN `ownerHttpService.getOwners()` rejects or returns `succeeded === false`
- WHEN the page loads
- THEN an inline error message is displayed
- AND no unhandled rejection propagates

---

### Requirement: Admin Owners Create Page (ADMIN-OWNERS-CREATE)

A container `OwnerCreatePage` MUST exist at `app/admin/owners/routes/owner-create.tsx`, exported
as a named export AND as `default`.

The page MUST render a controlled form with the following fields:

| Field | Type | Validation |
|-------|------|------------|
| `fullName` | text input | required |
| `login` | text input | required |
| `password` | password input (show/hide toggle) | required; regex `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` |
| `confirmPassword` | password input | required; MUST match `password` exactly |
| `cellPhone` | text input | required; PHONE_REGEX format validation (no mask library) |
| `email` | email input | required; email format |
| `description` | textarea | optional |
| `reSellerId` | select (SuperAdmin-only) | optional; populated from `resellerHttpService.listResellers()` |

The `reSellerId` select MUST be shown only when `isSuperAdmin === true`. When visible it MUST be
populated by calling `resellerHttpService.listResellers()` on mount.

The submit button MUST be disabled when the form is pristine (not yet modified by the user) OR
when any required field is invalid.

On submit the container MUST call
`ownerHttpService.createOwner({fullName, login, password, cellPhone, email, description, reSellerId})`.

On success (`succeeded === true`) the container MUST navigate to `/management/stores/create`.

On failure (`succeeded === false` or HTTP error) the container MUST display an inline error from
`response.errors[0].description` (or a generic fallback). No toast is used.

The `useUnsavedChangesPrompt` hook and `UnsavedChangesDialog` component MUST be active on this
page. The guard MUST trigger when the form is dirty and the user attempts to navigate away; it
MUST NOT trigger on a pristine form.

#### Scenario: S-ADMIN-OWNERS-CREATE-1 — Form renders all required fields

- GIVEN `OwnerCreatePage` mounts for an authorized user
- THEN fullName, login, password, confirmPassword, cellPhone, email, and description inputs are present

#### Scenario: S-ADMIN-OWNERS-CREATE-2 — reSellerId select shown only to SuperAdmin

- GIVEN `OwnerCreatePage` mounts and `isSuperAdmin === true`
- THEN the `reSellerId` select is present and populated from `resellerHttpService.listResellers()`
- GIVEN `isSuperAdmin === false`
- THEN no `reSellerId` select is rendered

#### Scenario: S-ADMIN-OWNERS-CREATE-3 — Submit disabled on pristine form

- GIVEN `OwnerCreatePage` has not been modified
- THEN the submit button is disabled

#### Scenario: S-ADMIN-OWNERS-CREATE-4 — Submit disabled on invalid form

- GIVEN any required field is empty or fails validation
- THEN the submit button is disabled

#### Scenario: S-ADMIN-OWNERS-CREATE-5 — PASSWORD_REGEX enforced

- GIVEN the password field contains a string failing `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}`
- THEN the form is invalid and submit remains disabled

#### Scenario: S-ADMIN-OWNERS-CREATE-6 — confirmPassword cross-match enforced

- GIVEN password is `Abcdef1!` and confirmPassword is `Different1!`
- THEN the form is invalid and submit remains disabled

#### Scenario: S-ADMIN-OWNERS-CREATE-7 — Successful create navigates to stores create

- GIVEN all fields are valid and dirty
- WHEN the user submits the form
- AND `ownerHttpService.createOwner(payload)` resolves with `succeeded === true`
- THEN the router navigates to `/management/stores/create`

#### Scenario: S-ADMIN-OWNERS-CREATE-8 — Failed create shows inline error

- GIVEN all fields are valid
- WHEN the user submits the form
- AND the response has `succeeded === false` or the HTTP call throws
- THEN an inline error is displayed from `errors[0].description` (or generic fallback)
- AND no navigation occurs

#### Scenario: S-ADMIN-OWNERS-CREATE-9 — Unsaved-changes guard on dirty form

- GIVEN the user has entered data (form is dirty)
- WHEN the user attempts to navigate away without submitting
- THEN `UnsavedChangesDialog` is shown prompting confirmation

#### Scenario: S-ADMIN-OWNERS-CREATE-10 — No mask library for cellPhone

- GIVEN `OwnerCreatePage` is rendered
- THEN no phone-mask library is imported or invoked; cellPhone is a plain text input

---

### Requirement: Admin Owners Edit — Details Tab (ADMIN-OWNERS-EDIT-DETAILS)

A container `OwnerEditPage` MUST exist at `app/admin/owners/routes/owner-edit.tsx`, exported as
a named export AND as `default`.

On mount the container MUST read the `:id` path parameter and call
`ownerHttpService.getOwnerById(id)`. On success all editable form fields MUST be pre-populated.

The Details tab form MUST contain the following fields:

| Field | Type | Notes |
|-------|------|-------|
| `login` | text input | Disabled/read-only; NOT included in PUT body |
| `fullName` | text input | required |
| `isActive` | toggle | Shown only when `isSuperAdmin === true` |
| `cellPhone` | text input | required; PHONE_REGEX format (no mask library) |
| `email` | email input | required; email format |
| `description` | textarea | optional |
| `reSellerId` | select | Shown only when `isSuperAdmin === true`; populated from `resellerHttpService.listResellers()` |

`guest` MUST NOT be rendered as a form control. It MUST be read from the loaded owner state and
included in the PUT payload as-is.

On submit the container MUST call
`ownerHttpService.editOwner(id, {fullName, cellPhone, email, guest, isActive, description, reSellerId})`.

On success (`succeeded === true`) the container MUST navigate to `/admin/owners/edit/:id`
(stay on the same page — uses the id from the loaded state).

On failure the container MUST display an inline error. No toast is used.

The `useUnsavedChangesPrompt` hook and `UnsavedChangesDialog` component MUST be active, with the
same dirty/pristine logic as the create page.

#### Scenario: S-ADMIN-OWNERS-EDIT-DETAILS-1 — Load pre-populates form

- GIVEN `OwnerEditPage` mounts with `:id = '42'`
- WHEN `ownerHttpService.getOwnerById('42')` resolves with an owner record
- THEN all editable fields are pre-populated with the owner's values

#### Scenario: S-ADMIN-OWNERS-EDIT-DETAILS-2 — login is read-only and excluded from PUT

- GIVEN `OwnerEditPage` is loaded with an owner
- THEN the `login` input is disabled
- AND `login` is NOT included in the PUT request body

#### Scenario: S-ADMIN-OWNERS-EDIT-DETAILS-3 — SuperAdmin-only fields conditionally shown

- GIVEN `isSuperAdmin === true`
- WHEN `OwnerEditPage` loads
- THEN the `isActive` toggle and `reSellerId` select are visible
- GIVEN `isSuperAdmin === false`
- THEN neither `isActive` nor `reSellerId` is rendered

#### Scenario: S-ADMIN-OWNERS-EDIT-DETAILS-4 — guest submitted from loaded state

- GIVEN an owner with `guest === true`
- WHEN the edit form is submitted
- THEN the PUT payload contains `guest: true` without any user interaction required

#### Scenario: S-ADMIN-OWNERS-EDIT-DETAILS-5 — Successful update stays on page

- GIVEN the form is valid and dirty
- WHEN the user submits
- AND `ownerHttpService.editOwner('42', payload)` resolves with `succeeded === true`
- THEN the router navigates to `/admin/owners/edit/42` (same page)

#### Scenario: S-ADMIN-OWNERS-EDIT-DETAILS-6 — Failed update shows inline error

- GIVEN the form is valid
- WHEN the user submits
- AND the response has `succeeded === false` or the HTTP call throws
- THEN an inline error message is displayed
- AND no navigation occurs

#### Scenario: S-ADMIN-OWNERS-EDIT-DETAILS-7 — Load failure shows inline error

- GIVEN `ownerHttpService.getOwnerById(id)` rejects or returns `succeeded === false`
- WHEN `OwnerEditPage` mounts
- THEN an inline error is displayed and the form is not pre-populated

#### Scenario: S-ADMIN-OWNERS-EDIT-DETAILS-8 — Unsaved-changes guard on dirty form

- GIVEN the user has modified at least one field
- WHEN the user attempts to navigate away without submitting
- THEN `UnsavedChangesDialog` is shown prompting confirmation

---

### Requirement: Admin Owners Edit — Stores and Users Tabs (ADMIN-OWNERS-EDIT-TABS)

`OwnerEditPage` MUST render a tab-shell layout.

When `isSuperAdmin === true`, the edit page MUST render three tabs using `GENERAL.DETAILS`,
`GENERAL.STORES`, and `GENERAL.USERS` as tab labels.

When `isSuperAdmin === false` (Reseller), the edit page MUST render the Details form only, with
no tab shell visible.

The **Stores tab** MUST display a list of stores scoped to the current owner context. It MUST
reuse the presentational `StoreList` component. Callback wiring and data source are resolved at
design time; the spec requires that the tab is present and visible only to SuperAdmin users.

The **Users tab** MUST display a list of users scoped to the current owner context. It MUST
reuse the presentational `UserList` component. Callback wiring and data source are resolved at
design time; the spec requires that the tab is present and visible only to SuperAdmin users.

#### Scenario: S-ADMIN-OWNERS-EDIT-TABS-1 — SuperAdmin sees three tabs

- GIVEN `OwnerEditPage` mounts and `isSuperAdmin === true`
- THEN three tabs are rendered: Details, Stores, Users

#### Scenario: S-ADMIN-OWNERS-EDIT-TABS-2 — Reseller sees Details only

- GIVEN `OwnerEditPage` mounts and `isSuperAdmin === false`
- THEN no tab shell is rendered; only the Details form is visible
- AND no Stores or Users tab or element is present

#### Scenario: S-ADMIN-OWNERS-EDIT-TABS-3 — Stores tab renders StoreList

- GIVEN `OwnerEditPage` is displayed with `isSuperAdmin === true`
- WHEN the user activates the Stores tab
- THEN the `StoreList` presentational component is rendered within the tab

#### Scenario: S-ADMIN-OWNERS-EDIT-TABS-4 — Users tab renders UserList

- GIVEN `OwnerEditPage` is displayed with `isSuperAdmin === true`
- WHEN the user activates the Users tab
- THEN the `UserList` presentational component is rendered within the tab

---

### Requirement: Admin Owners Internationalisation (ADMIN-OWNERS-I18N)

The following `OWNER.*` keys MUST be added to `app/shared/lib/i18n/es.ts`.
Keys that already exist under `GENERAL.*`, `USER.*`, or `MENU.*` MUST be referenced from those
existing keys — no duplicate key is added to `es.ts`.

| Key | Purpose |
|-----|---------|
| `OWNER.LIST_TITLE` | Page heading for the list page |
| `OWNER.CREATE_TITLE` | Page heading for the create form |
| `OWNER.EDIT_TITLE` | Page heading for the edit form |
| `OWNER.EDIT_OWNER` | Card menu item label — navigate to edit |
| `OWNER.STORE_PRICE_LABEL` | Store price display with `{count}` interpolation |
| `OWNER.ERROR` | Generic inline error message for HTTP failures |

`en.ts` MUST NOT be modified (no English locale exists for admin keys in this project).

All user-visible strings in owner pages MUST be sourced from i18n keys. No hardcoded string
literals are permitted in TSX.

#### Scenario: S-ADMIN-OWNERS-I18N-1 — All visible copy from i18n keys

- GIVEN any owner page is rendered inside an `IntlProvider`
- THEN every visible string originates from an `OWNER.*`, `GENERAL.*`, or `USER.*` key in `es.ts`
- AND no raw string literals appear in the TSX

#### Scenario: S-ADMIN-OWNERS-I18N-2 — Required keys exist at runtime

- GIVEN `es.ts` is loaded
- THEN all six `OWNER.*` keys listed above are present and non-empty

---

### Requirement: Admin Owners Testing (ADMIN-OWNERS-TEST)

The following test suites MUST exist:

| File | What it covers |
|------|---------------|
| `app/admin/owners/lib/services/__tests__/owner-http-service.test.ts` | Service: all 5 methods call correct endpoints; mocks use `BaseResponseModel` fields |
| `app/admin/owners/routes/__tests__/owner-list.test.tsx` | List: load renders cards; state-based CSS classes; price/count computed; reSellerName fallback; email conditional; delete fires without confirm + refreshes; navigate-to-edit; no create button; HTTP error shows inline error |
| `app/admin/owners/routes/__tests__/owner-create.test.tsx` | Create: fields present; reSellerId conditional on SuperAdmin; submit disabled when pristine/invalid; PASSWORD_REGEX; confirm-match; success navigates to `/management/stores/create`; failure shows inline error; unsaved-changes guard |
| `app/admin/owners/routes/__tests__/owner-edit.test.tsx` | Edit: pre-populates fields; login disabled and excluded from PUT; SuperAdmin-only fields conditional; guest from loaded state; success stays on page; failure inline error; unsaved-changes guard; tab shell for SuperAdmin; no tabs for Reseller |

All test files using `useIntl` MUST wrap the component under test in `IntlProvider`.
`BaseResponseModel<T>` fields `message` and `actionCode` are nullable (`string | null` /
`number | null`) on both branches; `errors` remains non-nullable. Test mocks MAY use `null` for
`message`/`actionCode`; `errors` mocks MUST still use `[]` (or a populated array) — never `null`.

#### Scenario: S-ADMIN-OWNERS-TEST-1 — Service tests cover all endpoints

- GIVEN `ownerHttpService` is tested with a mocked `apiClient`
- WHEN each of the five methods is called
- THEN the correct URL is asserted for each method
- AND mock responses use `BaseResponseModel` fields

#### Scenario: S-ADMIN-OWNERS-TEST-2 — List smoke tests cover all scenarios

- GIVEN `OwnerListPage` is rendered with `IntlProvider` and mocked service
- THEN all scenarios in ADMIN-OWNERS-LIST are covered by at least one test assertion

#### Scenario: S-ADMIN-OWNERS-TEST-3 — Create smoke tests cover validation paths

- GIVEN `OwnerCreatePage` is rendered with `IntlProvider` and mocked service
- THEN all scenarios in ADMIN-OWNERS-CREATE are covered by at least one test assertion

#### Scenario: S-ADMIN-OWNERS-TEST-4 — Edit smoke tests cover all edit and tab paths

- GIVEN `OwnerEditPage` is rendered with `IntlProvider` and mocked service
- THEN all scenarios in ADMIN-OWNERS-EDIT-DETAILS and ADMIN-OWNERS-EDIT-TABS are covered

---

## Admin Owners Non-Goals

### ADMIN-OWNERS-NGOAL-1 — No create button on list page

The list page MUST NOT render a create/add button linking to `/admin/owners/create`.
The create button is commented out in the Angular template; 1:1 parity requires its absence.
The `/admin/owners/create` route REMAINS registered and is accessible via direct URL.

### ADMIN-OWNERS-NGOAL-2 — No approve/activate/deactivate list actions

The list page MUST NOT render approve, activate, or deactivate action buttons.
All three are empty no-op stubs in the Angular source; omitting them preserves behavioral parity.

### ADMIN-OWNERS-NGOAL-3 — No confirmation dialog for delete

The DELETE action on the list MUST execute immediately without a confirmation dialog.
The Angular source calls delete directly on click; no confirm step was ever implemented.

### ADMIN-OWNERS-NGOAL-4 — No getOwnerDetailsById endpoint

`getOwnerDetailsById` (GET `/v1/owners/details/:id`) MUST NOT be included in `ownerHttpService`.
The Angular component that used it (`OwnerDetailsComponent`) has an empty template — dead code.

### ADMIN-OWNERS-NGOAL-5 — No phone mask library

A phone mask library MUST NOT be added as a dependency. `cellPhone` is a plain text input
with PHONE_REGEX format validation on both create and edit forms.

### ADMIN-OWNERS-NGOAL-6 — No changes to domain package

`Owner`, `OwnerStoreModule`, `EFeatures.Owners`, and `MENU.OWNERS` already exist and are correct.
No modifications to `packages/domain/` or `app/shared/lib/config/menu-config.ts` are permitted.

### ADMIN-OWNERS-NGOAL-7 — No en.ts changes

`OWNER.*` keys MUST NOT be added to `en.ts`. Only `es.ts` is modified.
