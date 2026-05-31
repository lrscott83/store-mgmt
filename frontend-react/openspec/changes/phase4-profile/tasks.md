# Tasks: phase4-profile (User Profile + Change Password)

**Change:** phase4-profile
**Phase:** Tasks
**Status:** Ready for apply
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)
**TDD Mode:** Strict (RED → GREEN per work unit)

---

## Baseline Test Count

Phase 3 archive baseline: 353. Phase 4-sync added 50 → **403 total**.
**Action required at apply start**: run the full test suite and record the actual current count before any file is touched. All apply batches MUST end with `count >= baseline + new tests written in that batch`.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550–700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (foundation + service + hook + store) → PR 2 (containers + forms + navbar + i18n + routes) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation: service + hook + store extension + unit tests | PR 1 | Base: `feat/phase4-sync-ui`; no UI changes; independently mergeable |
| 2 | UI: forms + containers + navbar + routes + i18n + integration tests | PR 2 | Base: PR 1 branch; depends on unit 1 |

---

## Phase 1 — Foundation (Service, Hook, Store) — PR 1 scope

> All tasks in this phase are independently testable. Follow RED → GREEN strictly.

- [ ] 1.1 **RED** — Write `app/profile/lib/services/__tests__/profile-http-service.test.ts`: assert `updateProfile` calls `PUT /v1/users/{id}` via `apiClient` with correct payload; assert `changePassword` calls `POST /v1/users/change-password/{id}`. Mock `apiClient`. Confirms HTTP-1 through HTTP-5.
- [ ] 1.2 **GREEN** — Create `app/profile/lib/services/profile-http-service.ts`: module-scope object literal singleton with `updateProfile(userId, payload)` and `changePassword(userId, payload)`. Wire `apiClient`. Tests must pass.
- [ ] 1.3 **RED** — Write `app/shared/lib/hooks/__tests__/use-online-status.test.ts`: `renderHook`, assert initial value from `navigator.onLine`; dispatch `offline` → `isOnline` becomes `false`; dispatch `online` → `true`; unmount → listeners removed. Confirms HOOK-1 through HOOK-3, S-HOOK-1.
- [ ] 1.4 **GREEN** — Create `app/shared/lib/hooks/use-online-status.ts`: `useState(navigator.onLine)` + `useEffect` with `online`/`offline` listeners + cleanup. Tests must pass.
- [ ] 1.5 **RED** — Extend `app/shared/lib/stores/__tests__/auth-store.test.ts` (or create if absent): assert `updateUser(user)` writes `StorageKeys.AUTH_MODEL` and `StorageKeys.CURRENT_USER`, updates `state.user`, sets `password: ''`, and does NOT mutate `isAuthenticated`/`isLoading`/`error`. Confirms STORE-1 through STORE-4, S-STORE-1.
- [ ] 1.6 **GREEN** — Add `updateUser(user: UserModel)` action to `app/shared/lib/stores/auth-store.ts`: dual localStorage write matching `setUser()` pattern, Zustand state update, `password: ''` forced. Tests must pass.
- [ ] 1.7 **VERIFY** — Run full suite; confirm count ≥ baseline + tests added in 1.1 / 1.3 / 1.5.

---

## Phase 2 — i18n Keys

- [ ] 2.1 **Add** `PROFILE.*` keys to `app/shared/lib/i18n/es.ts`: all 15 minimum keys from spec I18N-2 (`EDIT_TITLE`, `FULL_NAME`, `CELL_PHONE`, `EMAIL`, `SAVE`, `UPDATE_SUCCESS`, `UPDATE_ERROR`, `CHANGE_PASSWORD_TITLE`, `OLD_PASSWORD`, `NEW_PASSWORD`, `CONFIRM_PASSWORD`, `CHANGE_PASSWORD_SUBMIT`, `PASSWORD_REGEX_ERROR`, `PASSWORD_MISMATCH`, `OFFLINE_NOTICE`). Also add design extras: `SAVING`, `SUCCESS`, `ERROR`, `PASSWORD_RULES`, `REQUIRED`, `INVALID_EMAIL`. Confirm I18N-4: add `MENU.EDIT_PROFILE` / `MENU.CHANGE_PASSWORD` if absent.

---

## Phase 3 — Presentational Forms

- [ ] 3.1 **RED** — Write tests for `EditProfileForm` in `app/profile/components/__tests__/edit-profile-form.test.tsx`: renders with `initialValues`; blocks submit when `fullName` empty (EDIT-8); shows email-format error for invalid email (EDIT-9); disables submit + shows notice when `isOnline=false` (EDIT-5); calls `onSubmit` callback with correct payload when valid. Wrap in `IntlProvider` (TEST-4).
- [ ] 3.2 **GREEN** — Create `app/profile/components/edit-profile-form.tsx`: presentational; props = `{ initialValues, isOnline, isLoading, onSubmit, error, successMessage }`; `fullName` required; `email` optional with format check; `isActive` forwarded in submit payload (EDIT-3, EDIT-4, EDIT-7, EDIT-8, EDIT-9). Tests must pass.
- [ ] 3.3 **RED** — Write tests for `ChangePasswordForm` in `app/profile/components/__tests__/change-password-form.test.tsx`: blocks submit when regex fails (S-PWD-2, PWD-4); shows distinct mismatch message (S-PWD-3, PWD-8); disables submit when offline (PWD-5); calls `onSubmit` with `{ oldPassword, newPassword }` when valid. Wrap in `IntlProvider`.
- [ ] 3.4 **GREEN** — Create `app/profile/components/change-password-form.tsx`: presentational; props = `{ isOnline, isLoading, onSubmit, error }`; three password fields; `PASSWORD_REGEX` const `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}`; regex + mismatch + empty guards before `onSubmit`. Tests must pass.

---

## Phase 4 — Route Containers

> These are the integration-tested work units. Mock `profileHttpService` and `useOnlineStatus`; wrap in `IntlProvider` + `MemoryRouter` or `createMemoryRouter`.

- [ ] 4.1 **RED** — In `app/profile/routes/__tests__/profile-routes.test.tsx` write **edit-profile** integration tests (spec TEST-2, S-EDIT-1 through S-EDIT-5): form pre-fills from mocked `useAuthStore`; offline disables submit + shows notice; successful submit calls `profileHttpService.updateProfile` + `auth-store.updateUser`; error response shows inline error without clearing form.
- [ ] 4.2 **GREEN** — Create `app/profile/routes/edit-profile.tsx`: named `EditProfilePage` export + default export + module-scope `loader = featureLoader([EFeatures.Profile], useAuthStore.getState().user?.selectedStoreId)`. Container reads `useAuthStore`; calls `profileHttpService.updateProfile`; on success calls `auth-store.updateUser(updatedUser)` where `updatedUser = { ...currentUser, ...submitted, password: '' }`; shows `PROFILE.UPDATE_SUCCESS`; on error shows `PROFILE.UPDATE_ERROR`. Wires `EditProfileForm` (EDIT-1 through EDIT-7). Tests must pass.
- [ ] 4.3 **RED** — In same test file write **change-password** integration tests (spec TEST-3, S-PWD-1 through S-PWD-5): regex failure blocks submit; mismatch blocks submit; offline blocks submit; success → `auth-store.logout()` + `navigate('/login')`; error → inline message, form intact.
- [ ] 4.4 **GREEN** — Create `app/profile/routes/change-password.tsx`: named `ChangePasswordPage` export + default + same `loader` pattern. Container calls `profileHttpService.changePassword`; on success calls `logout()` then `navigate('/login')` (PWD-6); on error shows inline error. Wires `ChangePasswordForm` (PWD-1 through PWD-8). Tests must pass.
- [ ] 4.5 **VERIFY** — Run full suite; confirm count ≥ baseline + all tests added in phases 3–4.

---

## Phase 5 — Wiring (Routes + Navbar)

- [ ] 5.1 **Add routes** in `app/routes.ts`: register `/profile/edit` (lazy `EditProfilePage`) and `/profile/change-password` (lazy `ChangePasswordPage`) inside the app-layout route group, each with the module-scope `loader`. Confirms FEAT-1, FEAT-2, FEAT-3.
- [ ] 5.2 **Update navbar** in `app/shared/components/navbar.tsx`: add `<Link to="/profile/edit">` with `MENU.EDIT_PROFILE` label and `<Link to="/profile/change-password">` with `MENU.CHANGE_PASSWORD` label inside the user dropdown; add close-dropdown handler on both links. Confirms NAV-1 through NAV-4.
- [ ] 5.3 **RED** — Write/extend navbar tests to assert: both links render in the user dropdown; clicking either link closes the dropdown; logout link still present. Confirms S-NAV-1, S-NAV-2.
- [ ] 5.4 **GREEN** — Make navbar tests pass (adjust close-on-click wiring if needed).
- [ ] 5.5 **VERIFY** — Run full suite; confirm final count ≥ 403 + all net-new tests written across all phases.

---

## Spec Coverage Matrix

| Req group | Tasks covering it |
|-----------|-------------------|
| FEAT-1–4 | 5.1 |
| HTTP-1–5 | 1.1, 1.2 |
| STORE-1–4 | 1.5, 1.6 |
| HOOK-1–4 | 1.3, 1.4 |
| EDIT-1–9 | 3.1, 3.2, 4.1, 4.2 |
| PWD-1–8 | 3.3, 3.4, 4.3, 4.4 |
| NAV-1–4 | 5.2, 5.3, 5.4 |
| I18N-1–4 | 2.1 |
| OFFLINE-1–3 | 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2 |
| ERR-1–4 | 4.1, 4.2, 4.3, 4.4 |
| TEST-1–5 | 1.1, 1.3, 1.5, 3.1, 3.3, 4.1, 4.3 |
