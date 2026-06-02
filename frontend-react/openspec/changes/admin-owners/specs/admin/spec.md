# Delta Spec: admin-owners

**Change:** admin-owners
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-02
**Mode:** Hybrid (engram + openspec file)

---

## admin capability — ADDED Requirements

The requirements below are ADDITIVE. They extend `openspec/specs/admin/spec.md` and will be
merged into that file at archive time. Existing requirements in that file are unchanged.

---

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
`BaseResponseModel<T>` fields `message`, `actionCode`, and `errors` are NON-nullable; test mocks
MUST use `''`, `0`, and `[]` respectively — never `null`.
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
| `app/admin/owners/lib/services/__tests__/owner-http-service.test.ts` | Service: all 5 methods call correct endpoints; mocks use non-nullable `BaseResponseModel` fields |
| `app/admin/owners/routes/__tests__/owner-list.test.tsx` | List: load renders cards; state-based CSS classes; price/count computed; reSellerName fallback; email conditional; delete fires without confirm + refreshes; navigate-to-edit; no create button; HTTP error shows inline error |
| `app/admin/owners/routes/__tests__/owner-create.test.tsx` | Create: fields present; reSellerId conditional on SuperAdmin; submit disabled when pristine/invalid; PASSWORD_REGEX; confirm-match; success navigates to `/management/stores/create`; failure shows inline error; unsaved-changes guard |
| `app/admin/owners/routes/__tests__/owner-edit.test.tsx` | Edit: pre-populates fields; login disabled and excluded from PUT; SuperAdmin-only fields conditional; guest from loaded state; success stays on page; failure inline error; unsaved-changes guard; tab shell for SuperAdmin; no tabs for Reseller |

All test files using `useIntl` MUST wrap the component under test in `IntlProvider`.
Mocks for `BaseResponseModel<T>` MUST use `message: ''`, `actionCode: 0`, `errors: []` — never `null`.

#### Scenario: S-ADMIN-OWNERS-TEST-1 — Service tests cover all endpoints

- GIVEN `ownerHttpService` is tested with a mocked `apiClient`
- WHEN each of the five methods is called
- THEN the correct URL is asserted for each method
- AND mock responses use non-nullable `BaseResponseModel` fields

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

## Non-Goals

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
