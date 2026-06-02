# Delta Specs: admin-resellers

**Change:** admin-resellers
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-02
**Mode:** Hybrid (engram + openspec file)

---

## admin capability — ADDED Requirements

The requirements below are ADDITIVE. They extend `openspec/specs/admin/spec.md` and will be
merged into that file at archive time. Existing requirements in that file are unchanged.

---

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
`BaseResponseModel<T>` fields `message`, `actionCode`, and `errors` are NON-nullable; test mocks
MUST use `''`, `0`, and `[]` respectively — never `null`.

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
| `app/admin/resellers/lib/services/__tests__/reseller-http-service.test.ts` | Service: all 4 methods call correct endpoints; mocks use non-nullable `BaseResponseModel` fields |
| `app/admin/resellers/routes/__tests__/reseller-list.test.tsx` | List page: load renders cards; inactive card has `deactive-reSeller` class; navigate-to-create; navigate-to-edit; no activate/deactivate/delete; HTTP error shows inline error |
| `app/admin/resellers/routes/__tests__/reseller-create.test.tsx` | Create page: form fields present; submit disabled when invalid; password regex enforced; confirm-match enforced; success navigates to list; error shows inline; unsaved-changes guard triggers on dirty form |
| `app/admin/resellers/routes/__tests__/reseller-edit.test.tsx` | Edit page: load pre-populates fields; login is disabled; success stays on page; error shows inline; unsaved-changes guard triggers on dirty; reSellerId absent |

All test files that use `useIntl` MUST wrap the component under test in `IntlProvider`
(consistent with project convention).

Mocks for `BaseResponseModel<T>` MUST use `message: ''`, `actionCode: 0`, `errors: []` —
never `null` for these fields.

#### Scenario: S-ADMIN-RESELLERS-TEST-1 — Service tests cover all endpoints

- GIVEN `resellerHttpService` is tested with a mocked `apiClient`
- WHEN each of the four methods is called
- THEN the correct URL is asserted for each method
- AND mock responses use non-nullable `BaseResponseModel` fields

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

## Non-Goals (Explicit Negative Requirements)

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
