# Verify Report: phase4-profile (User Profile + Change Password)

**Change:** phase4-profile
**Phase:** Verify
**Verdict:** PASS WITH WARNINGS
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)

---

## Test Suite Results (ACTUAL)

| Check | Result |
|-------|--------|
| `pnpm test` | **454 passed, 44 files** (baseline was 403, +51 net-new) |
| `tsc --noEmit` | **Clean — zero errors** |
| `build` | **Success** (one pre-existing dynamic+static import warning, not a regression) |

---

## Requirement Verification

### Feature Gating (FEAT)

| Req | Status | Evidence |
|-----|--------|----------|
| FEAT-1 | PASS | `routes.ts` line 48: `route('profile/edit', 'profile/routes/edit-profile.tsx')` inside `app-layout` |
| FEAT-2 | PASS | `routes.ts` line 49: `route('profile/change-password', 'profile/routes/change-password.tsx')` inside `app-layout` |
| FEAT-3 | PASS | Both containers have `featureLoader([EFeatures.Profile], useAuthStore.getState().user?.selectedStoreId)` at module scope |
| FEAT-4 | PASS | `EFeatures.Profile = 70` confirmed in domain enum; featureLoader pattern identical to other guarded routes |

### HTTP Service (HTTP)

| Req | Status | Evidence |
|-----|--------|----------|
| HTTP-1 | PASS | `app/profile/lib/services/profile-http-service.ts` exists as module-scope object literal singleton |
| HTTP-2 | PASS | `updateProfile(userId, payload)` calls `apiClient.put('/v1/users/${userId}', payload)` |
| HTTP-3 | PASS | `changePassword(userId, payload)` calls `apiClient.post('/v1/users/change-password/${userId}', payload)` |
| HTTP-4 | PASS | Both use shared `apiClient` static import; no own Axios instance |
| HTTP-5 | PASS | No import from `auth-http-service` anywhere in the service file |

### Auth Store Extension (STORE)

| Req | Status | Evidence |
|-----|--------|----------|
| STORE-1 | PASS | `updateUser(user: UserModel)` action present in interface and implementation |
| STORE-2 | PASS | Writes to both `StorageKeys.AUTH_MODEL` and `StorageKeys.CURRENT_USER` |
| STORE-3 | PASS | `set({ user: updatedUser })` updates Zustand state |
| STORE-4 | PASS | `updateUser` only calls `set({ user: updatedUser })` — no touch of `isAuthenticated`, `isLoading`, or `error` |

### useOnlineStatus Hook (HOOK)

| Req | Status | Evidence |
|-----|--------|----------|
| HOOK-1 | PASS | `use-online-status.ts` at `app/shared/lib/hooks/use-online-status.ts` |
| HOOK-2 | PASS | `useState(navigator.onLine)` initialisation; returns `isOnline: boolean` |
| HOOK-3 | PASS | `window.addEventListener` for both events; cleanup in `useEffect` return |
| HOOK-4 | PASS | No imports from `app/profile/` anywhere in the hook file |

### Edit-Profile Container (EDIT)

| Req | Status | Evidence |
|-----|--------|----------|
| EDIT-1 | PASS | File at `app/profile/routes/edit-profile.tsx`; named export `EditProfilePage` + `export default EditProfilePage` |
| EDIT-2 | PASS | `export const loader = featureLoader([EFeatures.Profile], useAuthStore.getState().user?.selectedStoreId)` |
| EDIT-3 | PASS | `initialValues` derived from `useAuthStore().user` and passed to form on mount |
| EDIT-4 | PASS | `isActive: user.isActive` forwarded in payload; not exposed as UI field |
| EDIT-5 | PASS | `submitDisabled = isLoading \|\| !isOnline`; offline notice rendered when `!isOnline` |
| EDIT-6 | PASS | `await profileHttpService.updateProfile(...)` → `updateUser(updatedUser)` → `setSuccessMessage` |
| EDIT-7 | PASS | `catch` sets `error` state without resetting form fields (fields owned by child component's local state) |
| EDIT-8 | PASS | `if (!fullName.trim()) { setValidationError...; return; }` before HTTP call |
| EDIT-9 | PASS (with note) | `isValidEmail()` runs before HTTP call; uses `type="text" inputMode="email"` — see WARNING-1 below |

### Change-Password Container (PWD)

| Req | Status | Evidence |
|-----|--------|----------|
| PWD-1 | PASS | File at `app/profile/routes/change-password.tsx`; named + default export `ChangePasswordPage` |
| PWD-2 | PASS | Same `featureLoader` pattern as EDIT-2 |
| PWD-3 | PASS | Three `type="password"` inputs: `oldPassword`, `newPassword`, `confirmPassword` |
| PWD-4 | PASS | Three validation checks run in order before HTTP call; LOCKED regex `/(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/` confirmed |
| PWD-5 | PASS | Same offline gate as EDIT-5 |
| PWD-6 | PASS (LOCKED) | On success: `logout()` called in container, then `navigate('/login')` |
| PWD-7 | PASS | `catch` sets `error` without resetting form fields |
| PWD-8 | PASS | Mismatch uses `PROFILE.PASSWORD_MISMATCH`; regex failure uses `PROFILE.PASSWORD_REGEX_ERROR` — distinct messages |

### Navbar (NAV)

| Req | Status | Evidence |
|-----|--------|----------|
| NAV-1 | PASS | `<Link to="/profile/edit">` with `MENU.EDIT_PROFILE` key |
| NAV-2 | PASS | `<Link to="/profile/change-password">` with `MENU.CHANGE_PASSWORD` key |
| NAV-3 | PASS | Both links have `onClick={() => setIsUserMenuOpen(false)}` |
| NAV-4 | PASS | Logout button remains at bottom of dropdown, unchanged |

### Internationalisation (I18N)

| Req | Status | Evidence |
|-----|--------|----------|
| I18N-1 | PASS | All visible strings use `intl.formatMessage({ id: 'PROFILE.*' })`; no hardcoded strings in TSX |
| I18N-2 | PASS | All 15 minimum required keys present in `es.ts` (verified individually) |
| I18N-3 | PASS | 21 total PROFILE.* keys added (6 beyond minimum) |
| I18N-4 | PASS | `MENU.EDIT_PROFILE` and `MENU.CHANGE_PASSWORD` present in `es.ts` |

### Offline Behavior (OFFLINE)

| Req | Status | Evidence |
|-----|--------|----------|
| OFFLINE-1 | PASS | No offline write queue; submit disabled when offline |
| OFFLINE-2 | PASS | Form pre-fills from `useAuthStore` (Zustand, hydrated from localStorage) |
| OFFLINE-3 | PASS | `useOnlineStatus()` is reactive; hook subscribes to `online`/`offline` events |

### Error Handling (ERR)

| Req | Status | Evidence |
|-----|--------|----------|
| ERR-1 | PASS | `catch` in `edit-profile.tsx` → `setError(intl.formatMessage({ id: 'PROFILE.UPDATE_ERROR' }))` |
| ERR-2 | PASS | `catch` in `change-password.tsx` → `setError(...)` without field reset |
| ERR-3 | PASS | Both containers use generic catch-all; form state preserved (fields in child local state) |
| ERR-4 | PASS | `try/catch` in both containers; no unhandled promise rejections |

### Testing (TEST)

| Req | Status | Evidence |
|-----|--------|----------|
| TEST-1 | PASS | `app/profile/routes/__tests__/profile-routes.test.tsx` exists and passes |
| TEST-2 | PASS | Edit-profile: pre-fill, offline-disable, success (updateProfile+updateUser), error inline — all covered |
| TEST-3 | PASS | Change-password: regex-block, mismatch-block, offline-block, success→logout+navigate, error inline — all covered |
| TEST-4 | PASS | All test files using `useIntl` wrap in `IntlProvider` |
| TEST-5 | PASS | `useOnlineStatus` mocked via `vi.mock('~/shared/lib/hooks/use-online-status', ...)` in route tests |

---

## Apply-Reported Risks — Specific Verification

### Risk 1: `type="text"` + `inputMode="email"` for email input (EDIT-9)

**Assessment: WARNING-1**

The email input in `edit-profile-form.tsx` uses `type="text" inputMode="email"`. The reason documented in apply-progress is valid: native `type="email"` intercepted form submit before JS validation ran, preventing the test from observing the custom error message. The JS `isValidEmail()` function runs before the HTTP call and blocks submission with an inline error message, fully satisfying spec EDIT-9 from a behavioral standpoint.

However, using `type="text"` loses two browser-native benefits compared to `type="email"`:
- The browser's built-in email format accessibility hint in some screen readers
- Native form autocomplete type hinting for `email`

`inputMode="email"` preserves the mobile keyboard. This is a valid, acceptable deviation per apply-progress notes. No spec requirement mandates `type="email"` specifically.

**Verdict: WARNING** — functionally correct, minor accessibility trade-off. Not a blocker.

### Risk 2: Dynamic+static import mix for `api-client.ts`

**Assessment: SUGGESTION-1**

Confirmed pre-existing: `auth-store.ts` uses `void import('../http/api-client')` (dynamic, for the background `/me` refresh) while `profile-http-service.ts` imports it statically. The build warning is produced by Vite and is identical to the warning present before this change. This is not a regression introduced by phase4-profile.

---

## Locked Decision Verification

| Decision | Status |
|----------|--------|
| Password regex `/(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/` | CONFIRMED — exact literal in `change-password-form.tsx` line 5 |
| Password-change success → `logout()` + `navigate('/login')` in container | CONFIRMED — `change-password.tsx` lines 31–32 |
| Online-only, no offline write path | CONFIRMED — no queue, submit disabled when offline |
| Await-then-update for profile edit | CONFIRMED — `await profileHttpService.updateProfile(...)` then `updateUser(...)` |
| Logout/redirect in container not service | CONFIRMED — `profileHttpService` is pure transport; side effects in `change-password.tsx` |
| Routes + EFeatures.Profile + navbar wiring | CONFIRMED — `routes.ts`, `navbar.tsx`, enum value 70 all verified |

---

## Findings

### WARNINGS

**WARNING-1** — `type="text" inputMode="email"` on email input (EDIT-9 deviation)

The email `<input>` uses `type="text"` instead of `type="email"`. The documented reason (browser native validation intercepted form submit before JS validation) is technically valid. JS validation fully satisfies the spec requirement. The loss is minor accessibility semantic — not functionality. Recommend future sprint consider test isolation approach that doesn't require this workaround (e.g., user-event library's `type` vs fireEvent, or testing the validation function directly).

### SUGGESTIONS

**SUGGESTION-1** — Unanchored password regex allows overly long substring match

The locked regex `/(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/` is unanchored. A 31-character string like `"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1A"` (31 chars) passes because the regex matches the first 30 characters as a substring. The spec states this regex is LOCKED — no change is required or permitted. Documenting for awareness.

**SUGGESTION-2** — No test for `STORE-2` localStorage dual-write at integration level

The auth-store unit tests verify `updateUser` writes both `AUTH_MODEL` and `CURRENT_USER` to localStorage. The route-container integration tests mock `updateUser`, so they don't exercise the store method directly. This is correct practice (unit + integration separation), but worth noting that the localStorage behavior is only tested at the unit level.

---

## Task Completeness

All 22 tasks are checked `[x]` in `tasks.md` and confirmed against code:

- Phases 1–5 all implemented with TDD cycle evidence
- 7 new test files created
- 2 existing files modified (auth-store.ts, es.ts)
- 4 existing files wired (routes.ts, navbar.tsx, auth-store.test.ts, loaders.test.ts)
- Test count delta: 403 → 454 (+51), matches apply-progress claim

---

## Summary

**Verdict: PASS WITH WARNINGS**

- 0 CRITICAL issues
- 1 WARNING (email input type deviation — functionally correct, minor accessibility trade-off)
- 2 SUGGESTIONS (unanchored regex noted, localStorage dual-write only unit-tested)

All spec requirements implemented and tested. All locked decisions honored. Test suite passes at expected count. TypeScript is clean. Build succeeds.

---

**Next:** `sdd-archive`
