# Spec: phase4-profile (User Profile + Change Password)

**Change:** phase4-profile
**Phase:** Spec
**Status:** Done
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)

---

## Scope Statement

Add self-service profile management to the React 19 POS PWA. An authenticated user can edit their own profile (full name, cell phone, email) and change their own password via two new route containers under `app/profile/`. Both operations require an active network connection and hit the real backend. On successful password change the user is logged out and redirected to `/login`. No offline write path exists. All copy is Spanish via react-intl.

---

## Requirements

### Feature Gating (FEAT)

**FEAT-1** — The `/profile/edit` route MUST be registered in `app/routes.ts` and guarded by `featureLoader([EFeatures.Profile], storeId)`.

**FEAT-2** — The `/profile/change-password` route MUST be registered in `app/routes.ts` and guarded by `featureLoader([EFeatures.Profile], storeId)`.

**FEAT-3** — Because profile routes carry no `:storeId` URL parameter, the `storeId` argument passed to `featureLoader` MUST be resolved at module scope via `useAuthStore.getState().user?.selectedStoreId`. Passing `undefined` is NOT acceptable and must NOT reach the StoreUser check.

**FEAT-4** — A user without the `EFeatures.Profile` (value `70`) feature assigned MUST NOT be able to access either profile route; the loader redirect MUST behave identically to any other featureLoader-guarded route rejection.

---

### HTTP Service (HTTP)

**HTTP-1** — A new `profileHttpService` module-scope singleton MUST exist at `app/profile/lib/services/profile-http-service.ts`.

**HTTP-2** — `profileHttpService` MUST expose `updateProfile(userId: string, payload: { fullName: string; cellPhone?: string; email?: string; isActive: boolean })` calling `PUT /v1/users/{id}` via the shared `apiClient`.

**HTTP-3** — `profileHttpService` MUST expose `changePassword(userId: string, payload: { oldPassword: string; newPassword: string })` calling `POST /v1/users/change-password/{id}` via the shared `apiClient`.

**HTTP-4** — Neither method may define its own Axios instance. Both MUST share the existing `apiClient` so that the Bearer-token interceptor and 401-auto-logout already wired there apply automatically.

**HTTP-5** — `profileHttpService` MUST NOT be imported from or extend `authHttpService`. The two services are independent module-scope singletons.

---

### Auth Store Extension (STORE)

**STORE-1** — `auth-store.ts` MUST gain a new `updateUser(user: UserModel)` action.

**STORE-2** — `updateUser` MUST write the updated `UserModel` to BOTH `StorageKeys.AUTH_MODEL` and `StorageKeys.CURRENT_USER` localStorage keys using the same serialisation pattern as the existing `setUser()` action.

**STORE-3** — `updateUser` MUST also update the `user` field in the Zustand store state so that any component subscribing to `useAuthStore` (including the navbar) immediately reflects the new value without a reload.

**STORE-4** — `updateUser` MUST NOT touch `isAuthenticated`, `isLoading`, `error`, or any other state slice beyond `user`.

---

### `useOnlineStatus` Hook (HOOK)

**HOOK-1** — A new reusable hook `useOnlineStatus()` MUST exist at `app/shared/lib/hooks/use-online-status.ts`.

**HOOK-2** — The hook MUST return a live `isOnline: boolean` initialised from `navigator.onLine`.

**HOOK-3** — The hook MUST subscribe to the `window` `online` and `offline` events and update `isOnline` reactively. It MUST remove both listeners on unmount.

**HOOK-4** — `useOnlineStatus` MUST NOT import anything from `app/profile/`; it is a shared primitive.

---

### Edit-Profile Route Container (EDIT)

**EDIT-1** — The edit-profile container MUST live at `app/profile/routes/edit-profile.tsx`, export `EditProfilePage` as a named export, and also export it as `default`.

**EDIT-2** — The module MUST export `loader` using the pattern `export const loader = featureLoader([EFeatures.Profile], useAuthStore.getState().user?.selectedStoreId)`.

**EDIT-3** — On mount the form MUST be pre-filled from `useAuthStore`'s `user`: `fullName` (required field), `cellPhone` (optional), `email` (optional, email-format).

**EDIT-4** — The `isActive` flag from the current user MUST be forwarded in the `updateProfile` payload without exposing it as an editable UI field.

**EDIT-5** — While offline (`useOnlineStatus` returns `false`) the submit button MUST be disabled and an inline offline notice MUST be visible. The notice MUST disappear and the button MUST re-enable automatically when the `online` event fires — without a page reload.

**EDIT-6** — On submit `profileHttpService.updateProfile(user.id, payload)` is called. On success:
  - Build an updated `UserModel` from the response or current user merged with the submitted fields.
  - Call `auth-store.updateUser(updatedUser)`.
  - The navbar MUST reflect the new `fullName` immediately (same render cycle or next React flush).
  - A success feedback indicator MUST be shown (message, toast, or equivalent).

**EDIT-7** — On HTTP error the inline error message MUST be shown and the form MUST be preserved (no reset to pre-fill values).

**EDIT-8** — `fullName` is required; submitting with an empty `fullName` MUST be blocked client-side before any HTTP call.

**EDIT-9** — `email`, when provided, MUST pass a basic email-format check client-side before the HTTP call; an invalid email format MUST show an inline validation message.

---

### Change-Password Route Container (PWD)

**PWD-1** — The change-password container MUST live at `app/profile/routes/change-password.tsx`, export `ChangePasswordPage` as a named export, and also export it as `default`.

**PWD-2** — The module MUST export `loader` using the same `featureLoader` pattern as EDIT-2.

**PWD-3** — The form MUST have three fields: `oldPassword` (required), `newPassword` (required), `confirmPassword` (required). All are password-type inputs.

**PWD-4** — Client-side validation MUST run BEFORE any HTTP call. The submit button MUST be disabled (and/or inline messages shown) when any of the following is true:
  - `oldPassword` is empty.
  - `newPassword` does NOT match the LOCKED regex: `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` (at least 1 digit, at least 1 lowercase letter, at least 1 uppercase letter, length 8–30 characters inclusive).
  - `confirmPassword` does not equal `newPassword`.

**PWD-5** — While offline the submit button MUST be disabled and an inline offline notice MUST be visible, identical in behaviour to EDIT-5.

**PWD-6** — On submit `profileHttpService.changePassword(user.id, { oldPassword, newPassword })` is called. On success (LOCKED):
  - `auth-store.logout()` MUST be called.
  - The router MUST navigate to `/login`.
  - No success toast or intermediate UI is required (the redirect is the confirmation).

**PWD-7** — On HTTP error (e.g., wrong old password) an inline error message MUST be shown. The form MUST NOT be cleared or reset.

**PWD-8** — `newPassword` and `confirmPassword` mismatch MUST surface as a distinct inline message separate from the regex-failure message.

---

### Navbar (NAV)

**NAV-1** — The user dropdown in `app/shared/components/navbar.tsx` MUST include a link to `/profile/edit` labelled with the `MENU.EDIT_PROFILE` i18n key.

**NAV-2** — The user dropdown MUST include a link to `/profile/change-password` labelled with the `MENU.CHANGE_PASSWORD` i18n key.

**NAV-3** — Clicking either link MUST close the dropdown before or as navigation occurs. A dropdown that remains open after navigation is a defect.

**NAV-4** — The logout link that is already present MUST NOT be removed or repositioned.

---

### Internationalisation (I18N)

**I18N-1** — All user-visible strings in both profile containers MUST be supplied via `useIntl` / `FormattedMessage`; no hardcoded Spanish or English strings are permitted in TSX.

**I18N-2** — A set of `PROFILE.*` keys MUST be added to `app/shared/lib/i18n/es.ts`. The minimum required keys are:

| Key | Purpose |
|-----|---------|
| `PROFILE.EDIT_TITLE` | Page heading for edit-profile |
| `PROFILE.FULL_NAME` | Label for fullName field |
| `PROFILE.CELL_PHONE` | Label for cellPhone field |
| `PROFILE.EMAIL` | Label for email field |
| `PROFILE.SAVE` | Submit button label for edit-profile |
| `PROFILE.UPDATE_SUCCESS` | Success message after profile update |
| `PROFILE.UPDATE_ERROR` | Generic error message for profile update failure |
| `PROFILE.CHANGE_PASSWORD_TITLE` | Page heading for change-password |
| `PROFILE.OLD_PASSWORD` | Label for oldPassword field |
| `PROFILE.NEW_PASSWORD` | Label for newPassword field |
| `PROFILE.CONFIRM_PASSWORD` | Label for confirmPassword field |
| `PROFILE.CHANGE_PASSWORD_SUBMIT` | Submit button label for change-password |
| `PROFILE.PASSWORD_REGEX_ERROR` | Inline message when newPassword fails the regex |
| `PROFILE.PASSWORD_MISMATCH` | Inline message when confirmPassword !== newPassword |
| `PROFILE.OFFLINE_NOTICE` | Inline notice shown when the user is offline |

**I18N-3** — Additional `PROFILE.*` keys beyond the minimum table are permitted; the 15 listed above are the floor.

**I18N-4** — The navbar links added under NAV-1 and NAV-2 MAY reuse existing `MENU.EDIT_PROFILE` / `MENU.CHANGE_PASSWORD` keys if those already exist in `es.ts` with correct Spanish copy; if absent they MUST be added.

---

### Offline Behavior (OFFLINE)

**OFFLINE-1** — Neither edit-profile nor change-password has an offline write queue. When offline, the only allowed action is to view the current form state; submit is blocked (EDIT-5, PWD-5).

**OFFLINE-2** — Profile data displayed in the form (fullName, cellPhone, email) MUST be read from the Zustand store (which is hydrated from localStorage on load), so the form is pre-fillable even when offline.

**OFFLINE-3** — The offline notice MUST be a live reactive indicator driven by `useOnlineStatus()` events, NOT a one-time check on component mount.

---

### Error Handling (ERR)

**ERR-1** — HTTP 4xx errors from `PUT /v1/users/{id}` MUST surface as an inline error in the edit-profile form.

**ERR-2** — HTTP 4xx errors from `POST /v1/users/change-password/{id}` (e.g., 400 wrong old password) MUST surface as an inline error in the change-password form without resetting any field.

**ERR-3** — HTTP 5xx or network errors in both containers MUST show a generic inline error message. The form MUST remain intact.

**ERR-4** — No unhandled promise rejections may propagate from either container to the React error boundary.

---

### Testing (TEST)

**TEST-1** — A smoke-test suite MUST exist at `app/profile/routes/__tests__/profile-routes.test.tsx`.

**TEST-2** — Edit-profile smoke tests MUST cover:
  - Form pre-fills from auth-store user on render.
  - Submit button is disabled when offline (mock `useOnlineStatus` returning `false`).
  - Successful submit calls `profileHttpService.updateProfile` with the correct payload and calls `auth-store.updateUser`.
  - Error response shows inline error without clearing the form.

**TEST-3** — Change-password smoke tests MUST cover:
  - Submit is disabled when `newPassword` does not match the LOCKED regex.
  - Submit is disabled when `confirmPassword !== newPassword`.
  - Submit button is disabled when offline.
  - Successful submit calls `auth-store.logout()` and navigates to `/login`.
  - Error response shows inline error without clearing the form.

**TEST-4** — Test files that use `useIntl` MUST wrap the component under test in `IntlProvider` (consistent with project convention).

**TEST-5** — `useOnlineStatus` MUST be mockable in tests (either via a manual mock or by injecting a stub); tests MUST NOT depend on the real `navigator.onLine` value of the test runner.

---

## Acceptance Scenarios

### S-FEAT-1: Feature-gated route access

**Given** a user whose assigned features do NOT include `EFeatures.Profile` (70)
**When** they navigate to `/profile/edit` or `/profile/change-password`
**Then** the featureLoader redirects them away (same as any other gated route) and neither container renders.

### S-FEAT-2: Authorised access

**Given** a user whose assigned features include `EFeatures.Profile`
**When** they navigate to `/profile/edit`
**Then** the edit-profile form renders, pre-filled with `fullName`, `cellPhone`, and `email` from the auth store.

---

### S-EDIT-1: Successful profile update

**Given** an authenticated online user on `/profile/edit`
**When** they change `fullName` to "María García" and submit
**Then**
  - `PUT /v1/users/{id}` is called with `{ fullName: "María García", cellPhone: ..., email: ..., isActive: ... }`
  - `auth-store.updateUser(updatedUser)` is called with the updated `UserModel`
  - Both `StorageKeys.AUTH_MODEL` and `StorageKeys.CURRENT_USER` localStorage entries reflect the new name
  - The navbar displays "María García" without a page reload
  - A success message is visible in the form area.

### S-EDIT-2: Profile update — HTTP error

**Given** an authenticated online user who submits the edit-profile form
**When** the server returns a 4xx error
**Then**
  - An inline error message is displayed
  - All form field values remain as the user typed them (no reset)
  - `auth-store.updateUser` is NOT called.

### S-EDIT-3: Edit profile — offline gate

**Given** an authenticated user on `/profile/edit` who loses network connectivity
**When** `useOnlineStatus` fires the `offline` event
**Then**
  - The submit button becomes disabled
  - An inline offline notice becomes visible
  - When connectivity is restored (`online` event) the button re-enables and the notice disappears without a reload.

### S-EDIT-4: Empty fullName blocked

**Given** an authenticated online user on `/profile/edit`
**When** they clear the `fullName` field and attempt to submit
**Then** the HTTP call is NOT made and a client-side validation message is displayed.

### S-EDIT-5: Invalid email format blocked

**Given** an authenticated online user on `/profile/edit`
**When** they enter "not-an-email" in the email field and submit
**Then** the HTTP call is NOT made and a client-side email-format error is displayed.

---

### S-PWD-1: Successful password change

**Given** an authenticated online user on `/profile/change-password`
**When** they supply a valid `oldPassword`, a `newPassword` that satisfies `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}`, and a matching `confirmPassword`, then submit
**Then**
  - `POST /v1/users/change-password/{id}` is called with `{ oldPassword, newPassword }`
  - `auth-store.logout()` is called
  - The user is navigated to `/login`.

### S-PWD-2: Password regex failure

**Given** an authenticated online user on `/profile/change-password`
**When** they enter a `newPassword` that does NOT match `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` (e.g., `"password"` — no digit, no uppercase)
**Then**
  - The HTTP call is NOT made
  - An inline message corresponding to `PROFILE.PASSWORD_REGEX_ERROR` is displayed.

### S-PWD-3: Confirm password mismatch

**Given** an authenticated online user on `/profile/change-password`
**When** `newPassword` is `"ValidPass1"` and `confirmPassword` is `"DifferentPass1"`
**Then**
  - The HTTP call is NOT made
  - An inline message corresponding to `PROFILE.PASSWORD_MISMATCH` is displayed (distinct from the regex error).

### S-PWD-4: Wrong old password — server error

**Given** an authenticated online user who submits the change-password form
**When** the server returns a 4xx (wrong old password)
**Then**
  - An inline error message is shown
  - `oldPassword`, `newPassword`, and `confirmPassword` fields retain their values
  - `auth-store.logout()` is NOT called.

### S-PWD-5: Change password — offline gate

**Given** an authenticated user on `/profile/change-password` who is offline
**When** the form is loaded or the device goes offline
**Then**
  - The submit button is disabled
  - An inline offline notice matching `PROFILE.OFFLINE_NOTICE` is visible
  - Connectivity restoration re-enables submit without a reload.

---

### S-STORE-1: `updateUser` dual-key write

**Given** `auth-store.updateUser(user)` is called with a `UserModel`
**Then**
  - `localStorage.getItem(StorageKeys.AUTH_MODEL)` reflects the new user
  - `localStorage.getItem(StorageKeys.CURRENT_USER)` reflects the new user
  - `useAuthStore.getState().user` equals the new user
  - No other state slice (`isAuthenticated`, `isLoading`, `error`) is modified.

---

### S-HOOK-1: `useOnlineStatus` reactivity

**Given** a component consuming `useOnlineStatus()`
**When** `window.dispatchEvent(new Event('offline'))` is fired
**Then** `isOnline` becomes `false`.

**When** `window.dispatchEvent(new Event('online'))` is subsequently fired
**Then** `isOnline` becomes `true`.

**When** the component unmounts
**Then** both event listeners are removed (no memory leak).

---

### S-NAV-1: Navbar dropdown links

**Given** an authenticated user viewing the navbar
**When** they open the user dropdown
**Then** links to `/profile/edit` and `/profile/change-password` are present alongside the existing logout link.

### S-NAV-2: Dropdown closes on navigation

**Given** the user dropdown is open
**When** the user clicks the Edit Profile or Change Password link
**Then** the dropdown closes and the user is navigated to the corresponding route.

---

### S-I18N-1: All copy sourced from i18n

**Given** either profile container is rendered inside an `IntlProvider`
**Then** no raw Spanish or English string literals appear in the rendered output; all copy originates from `es.ts` message keys.

---

## Constraints & Non-Requirements

- No offline write queue: this is an online-only feature by explicit design decision.
- No new domain types: `UserModel` and `Credentials` already cover the data contract.
- No backend changes: endpoints `PUT /v1/users/{id}` and `POST /v1/users/change-password/{id}` are consumed as-is.
- No admin or management UI changes: `/management/*` is out of scope.
- No new Zustand store: profile state lives in the existing `useAuthStore`.
- Server-side validation is authoritative; client-side validation (EDIT-8, EDIT-9, PWD-4) is fail-fast UX only.
