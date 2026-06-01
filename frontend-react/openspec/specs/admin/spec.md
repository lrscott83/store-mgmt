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

**PAGE-5** — When the response has `succeeded === true`, the page MUST display an inline success
message using the i18n key `FEATURES.FEATURES_ACTIVATED`. No toast is used.

**PAGE-6** — When the response has `succeeded === false` OR the HTTP call throws, the page MUST
display an inline error message using the i18n key `FEATURES.UNEXPECTED_ERROR`. No toast is used.

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
