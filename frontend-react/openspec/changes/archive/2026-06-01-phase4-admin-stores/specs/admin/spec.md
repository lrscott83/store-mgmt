# Delta for admin

**Change:** admin-stores
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-01
**Mode:** Hybrid (engram + openspec file)

---

## ADDED Requirements

### Requirement: Admin Stores Route Registration (ADMIN-STORES-ROUTE)

The system MUST register the `/admin/stores` route in `app/routes.ts` under the existing
`app-layout` route, pointing to `AdminStoreListPage`.

The route module MUST export a named `loader` bound to `superAdminLoader` AND a default export
for the page component.

#### Scenario: S-ADMIN-STORES-ROUTE-1 — Route registered and loader bound

- GIVEN `app/routes.ts` is loaded by the router
- WHEN the router resolves `/admin/stores`
- THEN the route resolves to `AdminStoreListPage` with `loader = superAdminLoader`
- AND no `EFeatures` check is performed (super-admin role is sufficient)

---

### Requirement: Admin Stores Access Control (ADMIN-STORES-ACCESS)

The `admin/stores` route MUST be gated exclusively by `superAdminLoader` (`isSuperAdmin` ONLY).
Users who are `isOwnerAdmin` but NOT `isSuperAdmin` MUST be blocked. No `EFeatures` check is
applied.

#### Scenario: S-ADMIN-STORES-ACCESS-1 — SuperAdmin reaches page

- GIVEN an authenticated user with `isSuperAdmin === true`
- WHEN they navigate to `/admin/stores`
- THEN `superAdminLoader` resolves without redirect
- AND `AdminStoreListPage` renders

#### Scenario: S-ADMIN-STORES-ACCESS-2 — OwnerAdmin blocked

- GIVEN an authenticated user who is `isOwnerAdmin` but NOT `isSuperAdmin`
- WHEN they navigate to `/admin/stores`
- THEN `superAdminLoader` redirects them away before `AdminStoreListPage` renders

#### Scenario: S-ADMIN-STORES-ACCESS-3 — Unauthenticated blocked

- GIVEN a user who is not authenticated
- WHEN they navigate to `/admin/stores`
- THEN `superAdminLoader` redirects to `/login`
- AND `AdminStoreListPage` does not render

---

### Requirement: Admin Store List Container (ADMIN-STORES-PAGE)

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

#### Scenario: S-ADMIN-STORES-PAGE-1 — Successful load renders StoreList

- GIVEN an authenticated SuperAdmin on `/admin/stores`
- WHEN the container mounts
- THEN `GET /v1/stores/by-current-user` is called
- AND `StoreList` renders with the returned stores
- AND no degraded indicator is visible (`isDegraded={false}`)
- AND no `BaseRepository` write occurs

#### Scenario: S-ADMIN-STORES-PAGE-2 — onCreate navigates to create route

- GIVEN `AdminStoreListPage` is rendered
- WHEN the user triggers `onCreate`
- THEN the router navigates to `/management/stores/create`

#### Scenario: S-ADMIN-STORES-PAGE-3 — onEdit navigates to edit route

- GIVEN `AdminStoreListPage` is rendered with a store of id "42"
- WHEN the user triggers `onEdit("42")`
- THEN the router navigates to `/management/stores/edit/42`

#### Scenario: S-ADMIN-STORES-PAGE-4 — onApprove calls service

- GIVEN an authenticated SuperAdmin viewing the store list
- WHEN they trigger `onApprove("42")`
- THEN `storeHttpService.approve("42")` is called
- AND on success the list is refetched

#### Scenario: S-ADMIN-STORES-PAGE-5 — onDisapprove calls service

- GIVEN an authenticated SuperAdmin viewing the store list
- WHEN they trigger `onDisapprove("42")`
- THEN `storeHttpService.disapprove("42")` is called
- AND on success the list is refetched

#### Scenario: S-ADMIN-STORES-PAGE-6 — Activate and Deactivate NOT wired

- GIVEN `AdminStoreListPage` is rendered
- THEN no `onActivate` handler is passed to `StoreList`
- AND no `onDeactivate` handler is passed to `StoreList`
- AND neither activate nor deactivate buttons are visible (handlers absent → buttons not rendered)

#### Scenario: S-ADMIN-STORES-PAGE-7 — HTTP error on fetch shows error state

- GIVEN an authenticated SuperAdmin on `/admin/stores`
- WHEN `GET /v1/stores/by-current-user` returns a 4xx/5xx or network error
- THEN an inline error is shown and no unhandled rejection propagates

---

### Requirement: Admin Stores Testing (ADMIN-STORES-TEST)

A smoke-test suite MUST exist at
`app/admin/stores/routes/__tests__/store-list.test.tsx`.

Tests MUST cover: SuperAdmin reaches page and list renders; OwnerAdmin is blocked by
`superAdminLoader`; `onCreate` navigates to create; `onEdit` navigates to edit; `onApprove` calls
service; `onDisapprove` calls service; HTTP error shows inline error; activate/deactivate buttons
are absent.

#### Scenario: S-ADMIN-STORES-TEST-1 — Test suite covers all wired actions

- GIVEN the test suite at the path above
- WHEN tests run
- THEN each scenario above (ACCESS-1 through PAGE-7) has at least one corresponding test case
- AND all tests wrap the component under test in `IntlProvider`
