# Spec: phase4-mgmt-users (Users sub-domain)

**Change:** phase4-mgmt-users
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-01
**Mode:** Hybrid (engram + openspec file)

---

## Scope Statement

Implement the Users sub-domain of the Management slice in the React 19 POS PWA. Three routes
(`/management/users`, `/management/users/create`, `/management/users/:id/edit`) are registered
and guarded by the existing `adminFeatureLoader([EFeatures.Users])` (already live from the Stores
change). Access requires an authenticated user who is super-admin or owner-admin AND has
`EFeatures.Users = 72` assigned.

Container/presentational split mirrors the Stores precedent exactly. Containers own loaders, HTTP
calls, online/offline gating, and navigation. The edit container renders TWO stacked sub-forms
(`UserDetailsForm` + `UserCredentialsForm`) each with its own submit handler. Create and edit do
NOT share a form shape. A new `userHttpService` wraps all backend contracts over the shared
`apiClient`.

Offline policy: list reads from a `BaseRepository<StoreUser>` localStorage cache when offline; all
writes (create, update, activate, deactivate, credentials reset) are blocked with an error when
offline. No offline queue.

All user-visible copy is in Spanish via react-intl with `USERS.*` and shared `MANAGEMENT.*` keys in
`es.ts`. No backend changes required. Configurations sub-slice is out of scope.

---

## Requirements Summary (stable IDs)

### ACCESS (5 requirements)
- ACCESS-1: `adminFeatureLoader([EFeatures.Users])` already live — reuse as-is. MUST NOT be re-created.
- ACCESS-2: Role check failure → redirect to `/login` or `/unauthorized` (unchanged behaviour).
- ACCESS-3: Feature check failure (missing EFeatures.Users=72) → featureLoader redirect.
- ACCESS-4: All 3 user routes export `loader = adminFeatureLoader([EFeatures.Users])`.
- ACCESS-5: Non-admin users never reach any user route.

### ROUTE (4 requirements)
- ROUTE-1: `/management/users` → `UserListPage`.
- ROUTE-2: `/management/users/create` → `UserCreatePage`.
- ROUTE-3: `/management/users/:id/edit` → `UserEditPage`.
- ROUTE-4: All 3 modules export named `loader` + default page component.

### HTTP (7 requirements)
- HTTP-1: `userHttpService` singleton at `app/management/users/lib/services/user-http-service.ts`.
- HTTP-2: `listAll()` → `GET /v1/storeusers/list/true` → `BaseResponseModel<StoreUser[]>`.
- HTTP-3: `getById(id)` → `GET /v1/storeusers/:id` → `BaseResponseModel<StoreUser>`.
- HTTP-4: `create(payload)` → `POST /v1/storeusers` body `{ storeId, fullName, login, password, cellPhone, email, roleIds: [3] }` → `BaseResponseModel<boolean>`.
- HTTP-5: `updateDetails(id, payload)` → `PUT /v1/users/:id` body `{ fullName, cellPhone, email, isActive }` → `BaseResponseModel<boolean>`.
- HTTP-6: `activate(id)` → `POST /v1/users/activate` body `{ id, isActive: true }` → `BaseResponseModel<boolean>`.
- HTTP-7: `deactivate(id)` → `DELETE /v1/users/:id` → `BaseResponseModel<boolean>`.
- HTTP-8: All via shared `apiClient`. No own Axios instance.

### CRED (3 requirements)
- CRED-1: `changePassword(id, payload)` → `POST /v1/users/change-password/:id` body `{ oldPassword, newPassword }` → `BaseResponseModel<boolean>`. Exposed in `userHttpService`.
- CRED-2: `oldPassword` is ALWAYS required. No admin-bypass path exists (decision OQ-U2).
- CRED-3: Change-login (new login field) is explicitly out of scope (decision OQ-U3). No such field shall appear.

### LIST (6 requirements)
- LIST-1: Container at `app/management/users/routes/user-list.tsx`, exports `UserListPage` (named + default).
- LIST-2: On mount fetches `listAll()`, renders `UserList`, writes through to `BaseRepository<StoreUser>` cache.
- LIST-3: Connectivity failure → read cache, render degraded with indicator.
- LIST-4: Activate and deactivate callbacks wired; refetch on success.
- LIST-5: All lifecycle actions disabled + offline error when offline.
- LIST-6: No presentational markup in the container.

### CREATE (7 requirements)
- CREATE-1: Container at `app/management/users/routes/user-create.tsx`, exports `UserCreatePage` (named + default).
- CREATE-2: Container MUST resolve `:storeId` from route param or `useAuthStore.getState().user?.selectedStoreId`. If both are absent, it MUST redirect to `/management/stores`.
- CREATE-3: Submit calls `create(payload)` with `roleIds: [ERoles.StoreUser = 3]` and the resolved `storeId`.
- CREATE-4: Password MUST be validated client-side against regex `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` AND confirmed by a repeat-password field before submission.
- CREATE-5: On success navigates to `/management/users` (the list). NOT to stores or any other route.
- CREATE-6: Submit blocked + offline error when offline.
- CREATE-7: HTTP error passed to `UserCreateForm` inline; no redirect.

### EDIT (8 requirements)
- EDIT-1: Container at `app/management/users/routes/user-edit.tsx`, exports `UserEditPage` (named + default).
- EDIT-2: Id from `:id` route param.
- EDIT-3: On mount fetches `getById(id)` and pre-fills `UserDetailsForm`.
- EDIT-4: Details submit calls `updateDetails(id, payload)`. On success stays on page (or navigates — design may decide; spec does NOT require navigation).
- EDIT-5: `isActive` toggle in `UserDetailsForm` shown only to super-admin or owner-admin (ported from Angular `showActiveControl`).
- EDIT-6: Credentials submit calls `changePassword(id, { oldPassword, newPassword })`.
- EDIT-7: Details submit and credentials submit are INDEPENDENT. Each has its own submit button.
- EDIT-8: Submit blocked + offline error for BOTH sub-forms when offline. HTTP errors shown inline per sub-form.

### PRES (10 requirements)
- PRES-1: `UserList` at `app/management/users/components/UserList.tsx`, pure presentational. Props: `users`, `isOnline`, `degraded`, callbacks `onActivate`/`onDeactivate`/`onCreate`/`onEdit`.
- PRES-2: `UserList` shows degraded indicator when passed degraded-mode flag.
- PRES-3: `UserList` shows empty-state message when array is empty.
- PRES-4: `UserCreateForm` at `app/management/users/components/UserCreateForm.tsx`. Fields: `storeId` (read-only display), `fullName`, `login`, `password`, `confirmPassword`, `cellPhone` (required), `email` (optional).
- PRES-5: `UserCreateForm` MUST NOT share shape with edit-details (no login/password on details form).
- PRES-6: `UserDetailsForm` at `app/management/users/components/UserDetailsForm.tsx`. Fields: `fullName`, `cellPhone`, `email`, `isActive` (role-conditional).
- PRES-7: `UserCredentialsForm` at `app/management/users/components/UserCredentialsForm.tsx`. Fields: `oldPassword`, `newPassword`, `confirmNewPassword`. No `login` field.
- PRES-8: All four presentational components MUST NOT import HTTP services, router hooks, or `useOnlineStatus`. All data and callbacks flow through props.
- PRES-9: Submit disabled + offline notice when container passes `isOnline = false`.
- PRES-10: Inline error from container; no field reset on error.

### OFFLINE (5 requirements)
- OFFLINE-1: Write-through cache on successful list fetch. Cache key: `StorageKeys.entityKey('storeusers', selectedStoreId)`.
- OFFLINE-2: Cache fallback on connectivity failure; empty state if cache also empty.
- OFFLINE-3: All writes blocked with visible error when offline (create, updateDetails, changePassword, activate, deactivate).
- OFFLINE-4: No offline write queue.
- OFFLINE-5: Reactive gate: offline → submit disabled without page reload; online restored → re-enabled without reload.

### I18N (4 requirements)
- I18N-1: All user-visible strings via `useIntl`/`FormattedMessage`. No hardcoded string literals in TSX.
- I18N-2: Minimum `USERS.*` keys required in `es.ts`:

| Key | Purpose |
|-----|---------|
| `USERS.LIST_TITLE` | Page heading for the user list |
| `USERS.CREATE_TITLE` | Page heading for create form |
| `USERS.EDIT_TITLE` | Page heading for edit form |
| `USERS.FULL_NAME` | Label for fullName field |
| `USERS.LOGIN` | Label for login field (create only) |
| `USERS.PASSWORD` | Label for password field |
| `USERS.CONFIRM_PASSWORD` | Label for confirm-password field |
| `USERS.CELL_PHONE` | Label for cellPhone field |
| `USERS.EMAIL` | Label for email field |
| `USERS.IS_ACTIVE` | Label for isActive toggle |
| `USERS.OLD_PASSWORD` | Label for oldPassword field |
| `USERS.NEW_PASSWORD` | Label for newPassword field |
| `USERS.CONFIRM_NEW_PASSWORD` | Label for confirmNewPassword field |
| `USERS.STORE` | Label for storeId display |
| `USERS.SAVE` | Submit button label (create) |
| `USERS.UPDATE` | Submit button label (details) |
| `USERS.CHANGE_PASSWORD` | Submit button label (credentials) |
| `USERS.CREATE_SUCCESS` | Success feedback after create |
| `USERS.UPDATE_SUCCESS` | Success feedback after details update |
| `USERS.PASSWORD_CHANGED` | Success feedback after password change |
| `USERS.OFFLINE_NOTICE` | Inline notice when offline |
| `USERS.DEGRADED_NOTICE` | Notice when list served from cache |
| `USERS.EMPTY` | Empty state message for list |
| `USERS.ACTIVATE` | Action label for activate |
| `USERS.DEACTIVATE` | Action label for deactivate |
| `USERS.PASSWORD_POLICY` | Password policy hint |
| `USERS.PASSWORDS_MUST_MATCH` | Validation message when passwords differ |

- I18N-3: Shared `MANAGEMENT.*` keys added to `es.ts` if absent.
- I18N-4: Additional `USERS.*` keys beyond the 27-key floor are permitted.

### ERR (6 requirements)
- ERR-1: List connectivity errors → cache fallback; other HTTP errors → inline error on list page.
- ERR-2: `create()` errors → inline in `UserCreateForm`, no field reset, no redirect.
- ERR-3: `updateDetails()` errors → inline in `UserDetailsForm`, no field reset.
- ERR-4: `changePassword()` errors → inline in `UserCredentialsForm`, no field reset.
- ERR-5: `getById()` error → error state on page; no crash, no redirect.
- ERR-6: No unhandled promise rejections from any container.

### TEST (8 requirements)
- TEST-1: Suite at `app/management/users/routes/__tests__/user-routes.test.tsx`.
- TEST-2: List smoke tests (5 cases — success+cache, empty, offline+cache, offline+empty-cache, lifecycle blocked offline).
- TEST-3: Create smoke tests (5 cases — missing storeId→redirect, offline blocked, success→navigate, HTTP error inline, password validation).
- TEST-4: Edit smoke tests (6 cases — pre-fill, details success, credentials success, details offline blocked, credentials offline blocked, HTTP error per sub-form).
- TEST-5: `adminFeatureLoader` reuse tests (4 cases — unauthenticated, wrong role, missing feature, authorised).
- TEST-6: `useIntl` tests wrapped in `IntlProvider`.
- TEST-7: `useOnlineStatus` mockable; no real `navigator.onLine` dependency.
- TEST-8: `userHttpService` unit tests (one per endpoint contract, 8 cases).

---

## Acceptance Scenarios

### S-ACCESS-1: Unauthenticated user blocked

- GIVEN a user who is not authenticated
- WHEN they navigate to `/management/users`, `/management/users/create`, or `/management/users/1/edit`
- THEN `adminFeatureLoader` redirects to `/login` and no container renders.

### S-ACCESS-2: Wrong role blocked

- GIVEN an authenticated user who is neither super-admin nor owner-admin
- WHEN they navigate to any user route
- THEN `adminFeatureLoader` redirects to `/unauthorized` and no container renders.

### S-ACCESS-3: Missing feature blocked

- GIVEN an authenticated super-admin or owner-admin who does NOT have `EFeatures.Users` (72)
- WHEN they navigate to any user route
- THEN the feature guard redirects away and no container renders.

### S-ACCESS-4: Authorised access

- GIVEN an authenticated user who is super-admin or owner-admin AND has `EFeatures.Users`
- WHEN they navigate to `/management/users`
- THEN the list container renders with users fetched from `GET /v1/storeusers/list/true`.

---

### S-LIST-1: Successful list load

- GIVEN an authorised online user on `/management/users`
- WHEN the container mounts
- THEN `GET /v1/storeusers/list/true` is called; `UserList` renders the returned users; data is written to `BaseRepository<StoreUser>` cache; no degraded indicator is visible.

### S-LIST-2: Empty list

- GIVEN the backend returns an empty `StoreUser[]`
- WHEN the container mounts and the response succeeds
- THEN `UserList` renders the `USERS.EMPTY` empty-state message.

### S-LIST-3: Offline — served from cache

- GIVEN an authorised user who is offline AND a prior fetch has populated the cache
- WHEN the container mounts
- THEN `UserList` renders the cached users AND a degraded-mode indicator (`USERS.DEGRADED_NOTICE`) is visible.

### S-LIST-4: Offline — cache also empty

- GIVEN an authorised user who is offline AND the cache is empty
- WHEN the container mounts
- THEN the empty-state message is shown and no crash occurs.

### S-LIST-5: Lifecycle action — online

- GIVEN an authorised online user viewing the user list
- WHEN they click Deactivate for user id 7
- THEN `DELETE /v1/users/7` is called; on success `GET /v1/storeusers/list/true` is called again and the list re-renders.

### S-LIST-6: Lifecycle action — offline blocked

- GIVEN an authorised user who is offline
- WHEN they attempt any lifecycle action (activate/deactivate)
- THEN the action is blocked and `USERS.OFFLINE_NOTICE` is visible. No HTTP call is made.

---

### S-CREATE-1: Missing storeId — redirect to stores

- GIVEN an authorised user navigating to `/management/users/create`
- WHEN no `:storeId` route param exists AND `selectedStoreId` is also absent
- THEN the container redirects to `/management/stores` without rendering the form.

### S-CREATE-2: Successful user creation

- GIVEN an authorised online user on `/management/users/create` with a valid storeId
- WHEN they fill all required fields, enter a compliant password (confirm matches), and submit
- THEN `POST /v1/storeusers` is called with `roleIds: [3]` and the resolved `storeId`; on success the user is navigated to `/management/users`.

### S-CREATE-3: Create — offline blocked

- GIVEN an authorised user on the create form who is offline
- WHEN the form is loaded or the device goes offline
- THEN the submit button is disabled; `USERS.OFFLINE_NOTICE` is visible; restoring connectivity re-enables submit without a reload.

### S-CREATE-4: Create — HTTP error

- GIVEN an authorised online user who submits the create form
- WHEN the server returns a 4xx or 5xx error
- THEN an inline error is shown inside `UserCreateForm`; all field values are preserved; no navigation occurs.

### S-CREATE-5: Password validation

- GIVEN an authorised user filling the create form
- WHEN the password does not match `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` OR confirm does not match
- THEN client-side validation surfaces an error and the form MUST NOT submit.

---

### S-EDIT-1: Edit page loads with details and credentials forms

- GIVEN an authorised online user navigating to `/management/users/5/edit`
- WHEN the container mounts
- THEN `GET /v1/storeusers/5` is called; `UserDetailsForm` is pre-filled with the returned user's data; `UserCredentialsForm` renders with empty password fields.

### S-EDIT-2: Successful details update

- GIVEN an authorised online user on the edit page who modifies fullName
- WHEN they submit the details form
- THEN `PUT /v1/users/5` is called with `{ fullName, cellPhone, email, isActive }`. On success an inline success message is shown.

### S-EDIT-3: Successful password change

- GIVEN an authorised online user on the edit page who fills oldPassword and newPassword
- WHEN they submit the credentials form
- THEN `POST /v1/users/change-password/5` is called with `{ oldPassword, newPassword }`. On success the credentials form fields are cleared and a success message is shown.

### S-EDIT-4: Edit details — offline blocked

- GIVEN an authorised user on the edit page who is offline
- WHEN they attempt to submit the details form
- THEN the details submit is blocked and `USERS.OFFLINE_NOTICE` is visible.

### S-EDIT-5: Edit credentials — offline blocked

- GIVEN an authorised user on the edit page who is offline
- WHEN they attempt to submit the credentials form
- THEN the credentials submit is blocked and `USERS.OFFLINE_NOTICE` is visible.

### S-EDIT-6: isActive toggle visibility

- GIVEN a super-admin or owner-admin on the edit page
- WHEN `UserDetailsForm` renders
- THEN the `isActive` toggle is visible and editable.
- AND GIVEN a user who is NOT super-admin or owner-admin (if they can reach the page at all)
- THEN the `isActive` toggle is NOT rendered.

---

### S-CRED-1: oldPassword required — no admin bypass

- GIVEN any user (including super-admin) submitting the credentials form
- WHEN `oldPassword` field is empty
- THEN the form MUST NOT submit; a validation error is shown indicating oldPassword is required.

### S-CRED-2: Change-login field absent

- GIVEN any user on the create or edit page
- WHEN the page renders
- THEN no "new login" or "change login" field is present anywhere in the UI.

---

### S-OFFLINE-1: Reactive offline gate

- GIVEN an authorised user on any form (create or edit)
- WHEN the device goes offline while the form is displayed
- THEN the submit button(s) disable immediately without a page reload.
- AND WHEN connectivity is restored
- THEN the submit button(s) re-enable without a page reload.

---

### S-I18N-1: All copy from i18n

- GIVEN any user container or component rendered inside an `IntlProvider`
- THEN no raw Spanish or English string literals appear in the rendered output; all copy originates from `es.ts` message keys.

---

### S-ERR-1: getById failure

- GIVEN an authorised online user navigating to `/management/users/9999/edit` (non-existent)
- WHEN `GET /v1/storeusers/9999` returns an error
- THEN an error state is rendered on the page (not a crash; no redirect).

### S-ERR-2: Unhandled rejections do not propagate

- GIVEN any container in the users slice encounters an HTTP error
- THEN the error is caught and displayed inline; no unhandled rejection reaches the React error boundary.

---

## Constraints and Non-Requirements

- **No backend changes.** All endpoint contracts exist and are consumed as-is.
- **No offline write queue.** Writes blocked and rejected; no pending-sync state.
- **No domain type changes.** `StoreUser` from `@store-mgmt/domain` used unchanged.
- **No change-login field.** OQ-U3 — no backend endpoint exists.
- **No admin password bypass.** OQ-U2 — oldPassword is always required.
- **`adminFeatureLoader` NOT re-created.** Already live from Stores change; reuse as-is.
- **Post-create navigation goes to `/management/users` (not stores or any other route).**
- **`adminLoader` and `featureLoader` are NOT modified.**
- **Server-side validation is authoritative.** Client-side validation is fail-fast UX only.
