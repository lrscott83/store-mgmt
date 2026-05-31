# Spec: phase4-mgmt-stores (Stores sub-domain)

**Change:** phase4-mgmt-stores
**Phase:** Spec
**Status:** Done
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)

---

## Scope Statement

Implement the Stores sub-domain of the Management slice in the React 19 POS PWA. Three routes
(`/management/stores`, `/management/stores/create`, `/management/stores/edit/:id`) are registered
and guarded by a new `adminFeatureLoader([EFeatures.Stores])` composed from the existing
`adminLoader` (role) and `featureLoader` (feature 73). Access requires an authenticated user who is
super-admin or owner-admin AND has `EFeatures.Stores` assigned.

A container/presentational split mirrors the profile/sync precedent. Containers own loaders, HTTP
calls, online/offline gating, and navigation. `StoreList` and `StoreForm` (shared create/edit) are
presentational. A new `storeHttpService` wraps all backend contracts over the shared `apiClient`.
Store create/edit includes a module picker (catalog fetched from `GET /modules/ToStore`).

Offline policy: list reads from a `BaseRepository<Store>` localStorage cache when the network is
unavailable; all writes (create, update, lifecycle actions) are blocked with an error when offline.
No offline queue exists for this change.

All user-visible copy is in Spanish via react-intl with `STORES.*` and `MANAGEMENT.*` keys in
`es.ts`. No backend changes are required. Users and Configurations sub-slices are out of scope.

---

## Requirements

### Access Control (ACCESS)

**ACCESS-1** — A new `adminFeatureLoader(featureIds: number[])` factory MUST be added to
`app/auth/routes/loaders.ts`. It MUST compose `adminLoader` (role guard) followed by
`featureLoader(featureIds, storeId)` (feature guard) without modifying either existing loader.

**ACCESS-2** — `adminFeatureLoader` MUST resolve `storeId` at call time from
`useAuthStore.getState().user?.selectedStoreId`. Passing `undefined` to `featureLoader` is NOT
acceptable.

**ACCESS-3** — When the role check fails (unauthenticated or not super-admin / not owner-admin)
`adminFeatureLoader` MUST redirect to `/login` or `/unauthorized` consistent with `adminLoader`
behaviour.

**ACCESS-4** — When the feature check fails (user does not have `EFeatures.Stores = 73`)
`adminFeatureLoader` MUST redirect consistent with `featureLoader` rejection behaviour.

**ACCESS-5** — The three store routes registered in `app/routes.ts` MUST each export a `loader`
bound to `adminFeatureLoader([EFeatures.Stores])`.

**ACCESS-6** — A user who is authenticated but is NOT super-admin and NOT owner-admin MUST NOT
reach any store route; the loader redirect occurs before the container renders.

---

### Route Registration (ROUTE)

**ROUTE-1** — The `/management/stores` route MUST be registered in `app/routes.ts` pointing to the
list container (`StoreListPage`).

**ROUTE-2** — The `/management/stores/create` route MUST be registered in `app/routes.ts` pointing
to the create container (`StoreCreatePage`).

**ROUTE-3** — The `/management/stores/edit/:id` route MUST be registered in `app/routes.ts`
pointing to the edit container (`StoreEditPage`).

**ROUTE-4** — All three route modules MUST export a named `loader` (used by React Router) AND a
default export for the page component.

---

### HTTP Service (HTTP)

**HTTP-1** — A new `storeHttpService` module-scope singleton MUST exist at
`app/management/stores/lib/services/store-http-service.ts`.

**HTTP-2** — `storeHttpService` MUST expose `listByCurrentUser()` calling
`GET /v1/stores/by-current-user` → `BaseResponseModel<Store[]>`. This endpoint is NOT replaceable
with any generic `all/false` variant.

**HTTP-3** — `storeHttpService` MUST expose `getById(id: number)` calling `GET /v1/stores/:id`
→ `BaseResponseModel<Store>`.

**HTTP-4** — `storeHttpService` MUST expose `create(payload: StoreCreatePayload)` calling
`POST /v1/stores` → `BaseResponseModel<Store>`.
`StoreCreatePayload`: `{ ownerId: string; name: string; address: string; description?: string; approved: boolean; moduleIds: number[] }`.

**HTTP-5** — `storeHttpService` MUST expose `update(id: number, payload: StoreUpdatePayload)`
calling `PUT /v1/stores/:id` → `BaseResponseModel<boolean>`.
`StoreUpdatePayload`: `{ id: number; name: string; address: string; description?: string; approved: boolean; paymentStartDate?: string; moduleIds: number[]; isActive: boolean }`.

**HTTP-6** — `storeHttpService` MUST expose `activate(id: number)` calling
`POST /v1/stores/activate` with body `{ id }` → `BaseResponseModel<boolean>`.

**HTTP-7** — `storeHttpService` MUST expose `approve(id: number)` calling
`POST /v1/stores/approve` with body `{ id }` → `BaseResponseModel<boolean>`.

**HTTP-8** — `storeHttpService` MUST expose `disapprove(id: number)` calling
`POST /v1/stores/disapprove` with body `{ id }` → `BaseResponseModel<boolean>`.

**HTTP-9** — `storeHttpService` MUST expose `deactivate(id: number)` calling
`DELETE /v1/stores/:id` → `BaseResponseModel<unknown>`.

**HTTP-10** — `storeHttpService` MUST NOT define its own Axios instance. All calls MUST go through
the shared `apiClient` so that the Bearer-token interceptor and 401-auto-logout are applied
automatically.

**HTTP-11** — A separate `moduleHttpService` (or equivalent function) MUST expose
`listForStore()` calling `GET /v1/modules/ToStore` → `BaseResponseModel<Module[]>`. This may live
in a shared location or alongside the store service, but it MUST NOT be inlined into the form
component.

---

### Store List Container (LIST)

**LIST-1** — The list container MUST live at `app/management/stores/routes/store-list.tsx`, export
`StoreListPage` as a named export, and also export it as `default`.

**LIST-2** — On mount the container MUST call `storeHttpService.listByCurrentUser()`. On success it
MUST render `StoreList` with the returned stores AND write them through to `BaseRepository<Store>`
localStorage cache.

**LIST-3** — When the network is unavailable at mount time (or the HTTP call fails due to
connectivity), the container MUST read from `BaseRepository<Store>` cache and render `StoreList`
in a degraded state. A degraded-mode indicator MUST be visible to the user.

**LIST-4** — Row lifecycle actions (activate, approve, disapprove, deactivate) MUST be wired as
callbacks from `StoreList`. Each callback calls the matching `storeHttpService` function and, on
success, refetches the list.

**LIST-5** — All row lifecycle actions MUST be disabled and show an offline error when offline.
Offline detection uses `useOnlineStatus`.

**LIST-6** — The list container MUST NOT contain presentational markup. Layout, row rendering, and
action buttons belong in `StoreList`.

---

### Store Create Container (CREATE)

**CREATE-1** — The create container MUST live at `app/management/stores/routes/store-create.tsx`,
export `StoreCreatePage` as a named export, and also export it as `default`.

**CREATE-2** — On mount the container MUST fetch the module catalog (`moduleHttpService.listForStore()`) and pass it to `StoreForm` as the available module list.

**CREATE-3** — Submit calls `storeHttpService.create(payload)` (online only). The payload MUST
include `moduleIds` = the ids of all selected modules in the form at submit time.

**CREATE-4** — On successful create the container MUST navigate to `/management/stores` (the list).
It MUST NOT navigate to any users route, because the users sub-slice ships in a later change.

**CREATE-5** — Submit MUST be blocked and an offline error shown when `useOnlineStatus` returns
`false`.

**CREATE-6** — On HTTP error the container MUST pass the error to `StoreForm` for inline display;
no redirect occurs.

---

### Store Edit Container (EDIT)

**EDIT-1** — The edit container MUST live at `app/management/stores/routes/store-edit.tsx`, export
`StoreEditPage` as a named export, and also export it as `default`.

**EDIT-2** — On mount the container MUST fetch the store by id. The id MUST be resolved from the
`:id` route param; if the param is absent it MUST fall back to `useAuthStore.getState().user?.selectedStoreId`.

**EDIT-3** — On mount the container MUST also fetch the module catalog (`moduleHttpService.listForStore()`). Both fetches MAY run in parallel.

**EDIT-4** — The container MUST merge the store's existing `modules` into the catalog before
passing it to `StoreForm`: modules present in `store.modules` are marked `selected = true` and
their `price`, `currentPrice`, and `discountText` are overridden from the store's module record.

**EDIT-5** — Submit calls `storeHttpService.update(id, payload)` (online only). The payload MUST
include `moduleIds` = ids of selected modules at submit time plus the full update shape.

**EDIT-6** — On successful update the container MUST navigate back to `/management/stores`.

**EDIT-7** — Submit MUST be blocked and an offline error shown when `useOnlineStatus` returns
`false`.

**EDIT-8** — On HTTP error the container MUST pass the error to `StoreForm` for inline display; no
redirect occurs.

---

### Presentational Components (PRES)

**PRES-1** — `StoreList` MUST be a pure presentational component at
`app/management/stores/components/StoreList.tsx`. It MUST accept stores as props and emit action
callbacks (onActivate, onApprove, onDisapprove, onDeactivate, onEdit, onCreate). It MUST NOT
import HTTP services or router navigation directly.

**PRES-2** — `StoreList` MUST show a visible degraded-state indicator when passed a degraded-mode
flag from the container (indicating data came from cache, not the network).

**PRES-3** — `StoreList` MUST show an empty-state message when the stores array is empty.

**PRES-4** — `StoreForm` MUST be a shared presentational component at
`app/management/stores/components/StoreForm.tsx`. It MUST handle both create and edit mode (the
container passes a mode prop or an initial store value to distinguish them).

**PRES-5** — `StoreForm` MUST include a module picker sub-component that renders the available
module catalog and allows the user to select/deselect modules. Modules where `priceIncluded === true`
MUST be auto-selected and rendered as locked (not user-toggleable).

**PRES-6** — `StoreForm` MUST implement role-conditional field rendering:
- super-admin or owner-admin: render `ownerId` (required, owner picker), `approved`, `description`.
- super-admin + edit mode: render `paymentStartDate` (required).
- super-admin: render `isActive`.
- Non-owner-admin creating a new store: `ownerId` is set to the current user's id (not a picker) and `approved` is forced to `false` (not rendered as editable).

**PRES-7** — `StoreForm` MUST surface an inline error message when the container passes an error
prop. It MUST NOT reset field values on error.

**PRES-8** — `StoreForm` MUST disable its submit button and show an offline notice when the
container passes an `isOnline = false` prop.

**PRES-9** — `StoreForm` MUST display the total price of selected modules (sum of `currentPrice`
across selected modules) as a presentational helper. This is display-only and does not affect the
submitted payload.

**PRES-10** — `StoreForm` MUST NOT import HTTP services, router hooks, or `useOnlineStatus`
directly. All data and callbacks flow through props from the container.

---

### Owner Picker (OWNER)

**OWNER-1** — The owner picker (rendered inside `StoreForm` for super-admin/owner-admin) MUST be
fed by an owner list fetched from the backend. The exact owner endpoint is delegated to the design
phase; this spec records the requirement that the owner picker data source is a dedicated HTTP call,
not hardcoded or omitted.

**OWNER-2** — The owner picker is a read-only data source for the form; no owner administration UI
(create, edit, delete owner) is included in this change.

**OWNER-3** — The owner HTTP call MUST go through `apiClient` and MUST NOT define its own Axios
instance.

---

### Module Selection (MODULE)

**MODULE-1** — When `StoreForm` mounts in create mode, it MUST display the full module catalog
received from the container. No modules are pre-selected unless `priceIncluded === true`.

**MODULE-2** — When `StoreForm` mounts in edit mode, modules present in `store.modules` MUST be
pre-selected. Their `price`, `currentPrice`, and `discountText` MUST be overridden from the store's
record (not from the catalog defaults).

**MODULE-3** — Modules with `priceIncluded === true` MUST be auto-selected and locked. The user
MUST NOT be able to unselect them.

**MODULE-4** — The `moduleIds` in the submitted payload MUST be exactly the ids of all currently
selected modules at the moment of form submission (no filtering by priceIncluded — all selected ids
go in).

**MODULE-5** — A running total of the current price (`sum of currentPrice for selected modules`)
MUST be computed and displayed. This is presentational only and does not gate submission.

---

### Offline Behavior (OFFLINE)

**OFFLINE-1** — The list container MUST implement a write-through cache strategy: successful
`listByCurrentUser()` responses are written to `BaseRepository<Store>` before rendering.

**OFFLINE-2** — When offline (or when the HTTP call fails due to connectivity), the list container
MUST fall back to reading `BaseRepository<Store>` and render in degraded mode. If the cache is
also empty, an empty-state message MUST be shown (not a crash).

**OFFLINE-3** — Create, update, activate, approve, disapprove, and deactivate actions MUST all be
blocked when `useOnlineStatus` returns `false`. The block MUST surface as a visible error to the
user, not a silent no-op.

**OFFLINE-4** — There is NO offline write queue. Blocked writes are simply rejected with an error;
no pending-sync mechanism exists in this change.

**OFFLINE-5** — The offline gate MUST be reactive: if the user goes offline while on a form, the
submit button MUST disable without a page reload; if connectivity is restored the button MUST
re-enable without a reload.

---

### Internationalisation (I18N)

**I18N-1** — All user-visible strings in the three route containers and both presentational
components MUST be supplied via `useIntl` / `FormattedMessage`. No hardcoded Spanish or English
string literals are permitted in TSX.

**I18N-2** — The following `STORES.*` keys MUST be added to `app/shared/lib/i18n/es.ts`:

| Key | Purpose |
|-----|---------|
| `STORES.LIST_TITLE` | Page heading for the store list |
| `STORES.CREATE_TITLE` | Page heading for the create form |
| `STORES.EDIT_TITLE` | Page heading for the edit form |
| `STORES.NAME` | Label for the store name field |
| `STORES.ADDRESS` | Label for the address field |
| `STORES.DESCRIPTION` | Label for the description field |
| `STORES.OWNER` | Label for the owner picker |
| `STORES.APPROVED` | Label for the approved toggle |
| `STORES.IS_ACTIVE` | Label for the isActive toggle |
| `STORES.PAYMENT_START_DATE` | Label for the paymentStartDate field |
| `STORES.MODULES` | Section heading for the module picker |
| `STORES.TOTAL_PRICE` | Label for the total price summary |
| `STORES.SAVE` | Submit button label (create) |
| `STORES.UPDATE` | Submit button label (edit) |
| `STORES.CREATE_SUCCESS` | Success feedback after create |
| `STORES.UPDATE_SUCCESS` | Success feedback after update |
| `STORES.CREATE_ERROR` | Generic error for create failure |
| `STORES.UPDATE_ERROR` | Generic error for update failure |
| `STORES.OFFLINE_NOTICE` | Inline notice when offline |
| `STORES.DEGRADED_NOTICE` | Notice shown when list is served from cache |
| `STORES.EMPTY` | Empty state message for the list |
| `STORES.ACTIVATE` | Action label for activate |
| `STORES.DEACTIVATE` | Action label for deactivate |
| `STORES.APPROVE` | Action label for approve |
| `STORES.DISAPPROVE` | Action label for disapprove |
| `STORES.EDIT` | Action label for edit row |
| `STORES.CREATE_NEW` | Button label to navigate to create |

**I18N-3** — Any shared `MANAGEMENT.*` keys needed for the management layout or breadcrumbs MUST
also be added to `es.ts` if they do not already exist.

**I18N-4** — Additional `STORES.*` keys beyond the minimum table are permitted; the 27 keys listed
above are the floor.

---

### Error Handling (ERR)

**ERR-1** — HTTP errors from `listByCurrentUser()` that are attributable to connectivity MUST
trigger cache fallback (OFFLINE-2). HTTP errors unrelated to connectivity MUST show an inline error
on the list page.

**ERR-2** — HTTP 4xx or 5xx errors from `create()` or `update()` MUST surface as an inline error
in `StoreForm` without resetting field values.

**ERR-3** — HTTP errors from lifecycle actions (activate/approve/disapprove/deactivate) MUST show
an inline or toast error on the list page. The list MUST remain rendered.

**ERR-4** — HTTP errors from `getById()` in the edit container MUST render an error state on the
page (e.g. "store not found") without crashing the app.

**ERR-5** — HTTP errors from the module catalog fetch MUST surface as an inline error in the form.
The form MUST NOT submit without a successfully loaded module catalog.

**ERR-6** — No unhandled promise rejections may propagate from any container to the React error
boundary.

---

### Testing (TEST)

**TEST-1** — A smoke-test suite MUST exist at
`app/management/stores/routes/__tests__/store-routes.test.tsx`.

**TEST-2** — List container smoke tests MUST cover:
  - Successful fetch renders `StoreList` with the returned stores and writes to cache.
  - When the HTTP call fails, cache is read and a degraded indicator is visible.
  - When the cache is also empty and the network is unavailable, the empty state is rendered.
  - Lifecycle action callbacks are wired and call the correct `storeHttpService` method.
  - Lifecycle actions are disabled when `useOnlineStatus` returns `false`.

**TEST-3** — Create container smoke tests MUST cover:
  - Module catalog is fetched on mount and passed to `StoreForm`.
  - Submit is blocked and an offline error is visible when `useOnlineStatus` returns `false`.
  - Successful submit calls `storeHttpService.create()` with the correct payload including `moduleIds`.
  - On success, navigation goes to `/management/stores`.
  - HTTP error passes an error prop to `StoreForm` without redirecting.

**TEST-4** — Edit container smoke tests MUST cover:
  - Store and module catalog are fetched on mount; form is pre-filled.
  - Store modules are merged into the catalog (selected + price override).
  - Submit is blocked and an offline error is visible when `useOnlineStatus` returns `false`.
  - Successful submit calls `storeHttpService.update()` with the correct payload.
  - On success, navigation goes to `/management/stores`.
  - HTTP error passes an error prop to `StoreForm` without redirecting.

**TEST-5** — `adminFeatureLoader` MUST have unit tests covering:
  - Unauthenticated user → redirects to `/login`.
  - Authenticated user without the required role → redirects to `/unauthorized`.
  - Authenticated admin without `EFeatures.Stores` → featureLoader redirect.
  - Authenticated admin with `EFeatures.Stores` → loader resolves without redirect.

**TEST-6** — Test files that use `useIntl` MUST wrap the component under test in `IntlProvider`
(consistent with project convention).

**TEST-7** — `useOnlineStatus` MUST be mockable in tests. Tests MUST NOT depend on the real
`navigator.onLine` value of the test runner.

---

## Acceptance Scenarios

### S-ACCESS-1: Unauthenticated user blocked

**Given** a user who is not authenticated
**When** they navigate to `/management/stores`, `/management/stores/create`, or `/management/stores/edit/1`
**Then** `adminFeatureLoader` redirects to `/login` and no container renders.

### S-ACCESS-2: Wrong role blocked

**Given** an authenticated user who is neither super-admin nor owner-admin
**When** they navigate to any store route
**Then** `adminFeatureLoader` redirects to `/unauthorized` and no container renders.

### S-ACCESS-3: Missing feature blocked

**Given** an authenticated super-admin or owner-admin who does NOT have `EFeatures.Stores` (73)
**When** they navigate to any store route
**Then** the feature guard redirects away (consistent with `featureLoader` behaviour) and no container renders.

### S-ACCESS-4: Authorised access

**Given** an authenticated user who is super-admin or owner-admin AND has `EFeatures.Stores`
**When** they navigate to `/management/stores`
**Then** the list container renders with stores fetched from `GET /v1/stores/by-current-user`.

---

### S-LIST-1: Successful list load

**Given** an authorised online user on `/management/stores`
**When** the container mounts
**Then**
  - `GET /v1/stores/by-current-user` is called.
  - `StoreList` renders the returned stores.
  - The stores are written to `BaseRepository<Store>` localStorage cache.
  - No degraded indicator is visible.

### S-LIST-2: Empty list

**Given** an authorised online user whose backend returns an empty `Store[]`
**When** the container mounts and the response succeeds
**Then** `StoreList` renders the `STORES.EMPTY` empty-state message.

### S-LIST-3: Offline — served from cache

**Given** an authorised user who is offline (or whose HTTP call fails due to connectivity)
**When** the container mounts and a prior successful fetch has populated the cache
**Then**
  - `StoreList` renders the cached stores.
  - A degraded-mode indicator (`STORES.DEGRADED_NOTICE`) is visible.
  - No crash or unhandled error occurs.

### S-LIST-4: Offline — cache also empty

**Given** an authorised user who is offline AND the cache is empty
**When** the container mounts
**Then** the empty-state message is shown and no crash occurs.

### S-LIST-5: Lifecycle action — online

**Given** an authorised online user viewing the store list
**When** they click the Activate action for store id 42
**Then**
  - `storeHttpService.activate(42)` is called.
  - On success, `listByCurrentUser()` is called again and the list re-renders.

### S-LIST-6: Lifecycle action — offline blocked

**Given** an authorised user who is offline viewing the store list
**When** they attempt any lifecycle action (activate/approve/disapprove/deactivate)
**Then** the action is blocked and an offline error is visible. No HTTP call is made.

---

### S-CREATE-1: Successful store creation

**Given** an authorised online user on `/management/stores/create`
**When** they fill in all required fields, select modules, and submit
**Then**
  - `POST /v1/stores` is called with the form payload including `moduleIds` of selected modules.
  - On success, the user is navigated to `/management/stores`.

### S-CREATE-2: Create — offline blocked

**Given** an authorised user on `/management/stores/create` who is offline
**When** the form is loaded or the device goes offline
**Then**
  - The submit button is disabled.
  - `STORES.OFFLINE_NOTICE` is visible.
  - When connectivity is restored the button re-enables without a page reload.

### S-CREATE-3: Create — HTTP error

**Given** an authorised online user who submits the create form
**When** the server returns a 4xx or 5xx error
**Then**
  - An inline error message is shown inside `StoreForm`.
  - All field values are preserved.
  - No navigation occurs.

### S-CREATE-4: Create — price-included modules auto-selected

**Given** the module catalog contains modules where `priceIncluded === true`
**When** the create form mounts
**Then** those modules are shown as selected and locked; the user cannot unselect them.

### S-CREATE-5: Non-owner-admin create — ownerId forced

**Given** an authenticated user who is NOT owner-admin (i.e., a regular admin)
**When** they open the create form
**Then** `ownerId` is not shown as an editable picker; it defaults to the current user's id and `approved` is forced `false`.

---

### S-EDIT-1: Successful store update

**Given** an authorised online user on `/management/stores/edit/42`
**When** they modify fields and submit
**Then**
  - `PUT /v1/stores/42` is called with the updated payload including `moduleIds`.
  - On success the user is navigated to `/management/stores`.

### S-EDIT-2: Edit — store and modules pre-filled

**Given** an authorised online user who opens `/management/stores/edit/42`
**When** the container mounts
**Then**
  - `GET /v1/stores/42` and `GET /v1/modules/ToStore` are called (may be in parallel).
  - `StoreForm` is pre-filled with the store's current field values.
  - Modules in `store.modules` are marked selected; their `price`, `currentPrice`, `discountText` come from the store record, not the catalog defaults.
  - Modules with `priceIncluded === true` are auto-selected and locked regardless.

### S-EDIT-3: Edit — offline blocked

**Given** an authorised user on `/management/stores/edit/42` who is offline
**When** the form is loaded or the device goes offline
**Then** the submit button is disabled and `STORES.OFFLINE_NOTICE` is visible. Connectivity restoration re-enables submit without a reload.

### S-EDIT-4: Edit — HTTP error

**Given** an authorised online user who submits the edit form
**When** the server returns a 4xx or 5xx error
**Then** an inline error is shown inside `StoreForm`; all field values are preserved; no navigation occurs.

### S-EDIT-5: Edit — store not found

**Given** an authorised online user navigating to `/management/stores/edit/9999` (non-existent id)
**When** `GET /v1/stores/9999` returns a 404
**Then** an error state is rendered on the page (not a crash; no redirect to home).

### S-EDIT-6: Edit — id from selectedStoreId fallback

**Given** an authorised online user navigating to `/management/stores/edit/` with no `:id` param
**When** the container mounts
**Then** the store id is resolved from `useAuthStore.getState().user?.selectedStoreId` and the correct store is fetched.

---

### S-EDIT-7: Role-conditional fields — super-admin edit

**Given** an authenticated super-admin on the edit form
**When** the form renders
**Then** `ownerId` (picker), `approved`, `description`, `paymentStartDate` (required), and `isActive` fields are all visible and editable.

### S-EDIT-8: Role-conditional fields — owner-admin edit

**Given** an authenticated owner-admin on the edit form
**When** the form renders
**Then** `ownerId` (picker), `approved`, and `description` are visible; `paymentStartDate` and `isActive` are NOT rendered.

---

### S-MODULE-1: Module catalog total price

**Given** a store form with two modules selected: `currentPrice = 100` and `currentPrice = 50`
**When** the module picker is rendered
**Then** the total displayed is `150` (sum of `currentPrice` of selected modules).

### S-MODULE-2: Price-included auto-select on edit

**Given** the catalog has a module with `priceIncluded === true` that is NOT in `store.modules`
**When** the edit form mounts
**Then** that module is auto-selected and locked (it appears in `moduleIds` on submit).

---

### S-OWNER-1: Owner picker populated

**Given** an authenticated super-admin or owner-admin on the create or edit form
**When** the form mounts
**Then** the owner picker is populated from a backend HTTP call (endpoint confirmed in design). The picker MUST NOT be empty or hardcoded.

---

### S-I18N-1: All copy from i18n

**Given** any store container or component is rendered inside an `IntlProvider`
**Then** no raw Spanish or English string literals appear in the rendered output; all copy originates from `es.ts` message keys.

---

### S-ERR-1: Module catalog fetch failure blocks submit

**Given** the module catalog fetch (`GET /v1/modules/ToStore`) fails with a network or HTTP error
**When** the create or edit form is rendered
**Then** an inline error is shown and the form submit button is disabled. The user cannot submit without a loaded catalog.

### S-ERR-2: Unhandled rejections do not propagate

**Given** any container in the stores slice encounters an HTTP error
**Then** the error is caught and displayed inline; no unhandled rejection reaches the React error boundary.

---

## Constraints and Non-Requirements

- **No backend changes.** All endpoint contracts already exist and are consumed as-is.
- **No offline write queue.** Writes are blocked and rejected when offline; no pending sync state is stored.
- **No domain type changes.** `Store` and `Module` from `@store-mgmt/domain` are used unchanged.
- **No owner management UI.** The owner picker is a read-only data source for the form only.
- **No users or configurations sub-slices.** Those are separate SDD changes.
- **Post-create navigation goes to the store list (`/management/stores`), not to any users route.**
  The legacy Angular navigation to `/management/users/create/` is intentionally NOT mirrored here;
  it will be revisited when `phase4-mgmt-users` ships.
- **Server-side validation is authoritative.** Client-side validation (required fields, offline gate)
  is fail-fast UX only.
- **`adminLoader` and `featureLoader` are NOT modified.** `adminFeatureLoader` composes them as-is.
