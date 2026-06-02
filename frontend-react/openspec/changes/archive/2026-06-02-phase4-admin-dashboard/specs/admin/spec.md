# Delta for admin — Admin Dashboard (SuperAdmin Store Stats)

**Change:** admin-dashboard
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-02
**Mode:** Hybrid (engram + openspec file)

---

## ADDED Requirements

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
`BaseResponseModel<T>` fields `message`, `actionCode`, and `errors` are NON-nullable; test mocks
MUST use `''`, `0`, and `[]` respectively — never `null`.

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
- Mocks use non-nullable `BaseResponseModel<StoreUsages>` fields (`message: ''`, `actionCode: 0`,
  `errors: []`).

#### Scenario: S-ADMIN-DASHBOARD-TEST-1 — Service tests cover both endpoints

- GIVEN `usageHttpService` is tested with a mocked `apiClient`
- WHEN each method is called
- THEN the correct URL is asserted for each method
- AND mock responses use non-nullable `BaseResponseModel` fields

#### Scenario: S-ADMIN-DASHBOARD-TEST-2 — Route smoke tests cover toggle behaviour

- GIVEN `AdminDashboardPage` is rendered with `IntlProvider` and mocked service
- WHEN the component mounts and the 30-day toggle is clicked
- THEN the test asserts `getStoresLastWeek()` was called on mount
- AND `getStoresLastMonth()` was called after the toggle

---

## Non-Goals (Explicit Negative Requirements)

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
