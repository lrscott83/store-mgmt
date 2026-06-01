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
