# Proposal: phase4-profile (User Profile + Change Password)

**Change:** phase4-profile
**Phase:** Propose
**Status:** Done
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)
**Approach:** A — route containers + `profileHttpService` + `auth-store.updateUser()` + `useOnlineStatus()`

Deliver self-service profile management to the React 19 PWA POS: an authenticated user can edit their own profile (full name, cell phone, email) and change their own password. Both operations hit the REAL backend over the existing Axios api-client. Unlike the just-completed Synchronization slice, Profile has NO offline write path — edits and password changes are online-only and gate in real time on connectivity.

---

## Intent

| Question | Answer |
|----------|--------|
| What problem | Authenticated users have no way to update their own profile or rotate their password in the React app. Nav scaffolding (`menu-config.ts`, `EFeatures.Profile=70`, `MENU.*` i18n) exists but the routes are unregistered and the navbar dropdown only offers logout. |
| Why now | Phases 1-3 and Phase 4 Synchronization are complete. Profile is the remaining Phase 4 self-service slice and unblocks parity with the legacy Angular profile flow. |
| What success looks like | A user opens the navbar top-right dropdown, picks Edit Profile or Change Password, submits while online, and (a) sees their profile persisted to backend + reflected immediately in the navbar, or (b) changes their password and is logged out and redirected to `/login`. Offline disables submit with a live inline notice. All copy is Spanish via react-intl. |

---

## Scope

### In scope

- Two route containers under a new `app/profile/` feature directory: `edit-profile` and `change-password`.
- A new `profileHttpService` (module-scope singleton) wrapping `PUT /v1/users/{id}` and `POST /v1/users/change-password/{id}`.
- A new `auth-store.updateUser(user)` action that writes the updated `UserModel` to BOTH localStorage keys (`AUTH_MODEL` + `CURRENT_USER`) and Zustand state.
- A new reusable `useOnlineStatus()` hook (real-time `online`/`offline` event listeners) for connectivity gating.
- Route registration for both profile routes in `app/routes.ts`, each guarded by `featureLoader`.
- Navbar user-dropdown links to both routes, closing the dropdown on navigation.
- ~15 new `PROFILE.*` Spanish i18n keys in `es.ts`.
- Client-side password validation using the LOCKED Angular regex and a confirm-match check.
- Smoke tests for both route containers.

### Out of scope

- User management screens (admin editing OTHER users) — `/management/*` stays untouched.
- Admin / super-admin flows, role or feature assignment.
- The Synchronization Send/Receive slice (already delivered) — no changes to sync code.
- Any new domain types (`Credentials` and `UserModel` already cover the contract).
- Offline write/queue support for profile or password (online-only by design).
- Backend changes — endpoints already exist and are consumed as-is.

### File list

**New:**
- `app/profile/routes/edit-profile.tsx`
- `app/profile/routes/change-password.tsx`
- `app/profile/routes/__tests__/profile-routes.test.tsx`
- `app/profile/lib/services/profile-http-service.ts`
- `app/shared/lib/hooks/use-online-status.ts`

**Modified:**
- `app/routes.ts` — register `/profile/edit` and `/profile/change-password`.
- `app/shared/components/navbar.tsx` — add two dropdown links + close-on-nav.
- `app/shared/lib/i18n/es.ts` — add `PROFILE.*` keys.
- `app/shared/lib/stores/auth-store.ts` — add `updateUser(user)` action.

All paths relative to `frontend-react/apps/web-store-pos/`.

---

## Approach (Approach A)

### Building blocks

| Block | Responsibility |
|-------|----------------|
| `profileHttpService` | Module-scope singleton (mirrors `authHttpService`). `updateProfile(userId, { fullName, cellPhone, email, isActive })` → `PUT /v1/users/{id}`. `changePassword(userId, { oldPassword, newPassword })` → `POST /v1/users/change-password/{id}`. Uses shared `apiClient` (Bearer + 401 interceptors already wired). |
| `auth-store.updateUser(user)` | Patches the user in Zustand AND writes BOTH `StorageKeys.AUTH_MODEL` and `StorageKeys.CURRENT_USER`, same as `setUser()`. Single source of truth; navbar reads `user.fullName` from here. |
| `useOnlineStatus()` | Returns live `isOnline` boolean by subscribing to `online`/`offline` window events; cleans up on unmount. Reusable beyond profile. |
| Route containers | Follow the `today-expenses.tsx` template: named export + `export default`, module-scope `featureLoader` loader, read user from `useAuthStore`, instantiate/consume the HTTP service inline. |

### Edit-profile flow

1. Load: pre-fill form from `useAuthStore` user (`fullName` required, `cellPhone` optional, `email` optional + email-format).
2. Gate: `useOnlineStatus()` drives a live inline offline notice; submit disabled while offline.
3. Submit: `profileHttpService.updateProfile(user.id, payload)` (carry `isActive` from current user).
4. On success: build the updated `UserModel` and call `auth-store.updateUser(updatedUser)` — Zustand + both localStorage keys updated, navbar reflects new name immediately. Show success feedback.
5. On error: inline error, form preserved.

### Change-password flow

1. Fields: `oldPassword` (required), `newPassword` (required), `confirmPassword` (required).
2. Client validation BEFORE the call: `newPassword` must match the LOCKED regex `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` AND `confirmPassword === newPassword`. Block submit with inline messages on failure.
3. Gate: same `useOnlineStatus()` offline handling as edit-profile.
4. Submit: `profileHttpService.changePassword(user.id, { oldPassword, newPassword })`.
5. On success (LOCKED decision): `auth-store.logout()` then `navigate('/login')`.
6. On error (e.g. wrong old password): inline error WITHOUT clearing the form.

### Online gating

`useOnlineStatus()` is consumed by both containers. When offline: submit button disabled + inline notice rendered; the moment connectivity returns (`online` event) the control re-enables without a reload.

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Extend `auth-store` with `updateUser()` instead of a new `useProfileStore` | Profile data already lives in `useAuthStore` and the navbar reads from it. A second store would split the source of truth and risk stale reads. `updateUser()` mirrors the existing `setUser()` dual-key write — minimal, consistent. |
| Pass storeId to `featureLoader` via module-scope `getState()` | Profile routes have no `:storeId` URL param; `featureLoader` defaults to `params.storeId`, which would fail the StoreUser check. Using `featureLoader([EFeatures.Profile], useAuthStore.getState().user?.selectedStoreId)` at module scope works because Zustand `getState()` is callable outside React render. |
| Logout + redirect to `/login` on successful password change | LOCKED user decision. The backend may invalidate the token after a password change; forcing re-auth is the safe default and avoids a silently-dead session. Legacy Angular navigated to `/management/users`, but that was an admin-editing-another-user flow, not self-service. |
| Use the Angular password regex client-side | LOCKED user decision: `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` (≥1 digit, ≥1 lower, ≥1 upper, 8-30 chars). Keeps the React client aligned with backend/legacy validation; server remains the authority but we fail fast. |
| Separate `profileHttpService` rather than extending `authHttpService` | Keeps the auth service focused on auth lifecycle; profile/user-management calls live in their own module-scope singleton following the established HTTP-layer pattern. |
| Navbar dropdown links (NOT sidebar), close on nav | PRD/exploration: profile is reached from the top-right user dropdown. Closing on link click prevents a lingering open menu after navigation. |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Dual localStorage drift — partial write leaves navbar showing a stale `fullName` | `updateUser()` MUST write BOTH `AUTH_MODEL` and `CURRENT_USER` atomically, identical to `setUser()`. Covered by a smoke assertion. |
| `featureLoader` storeId — StoreUser blocked when storeId is undefined | Pass `useAuthStore.getState().user?.selectedStoreId` as the loader's storeId arg at module scope. |
| Password-change token invalidation uncertainty | Resolved by the LOCKED logout-on-success decision — always re-auth, no reliance on backend token behavior. |
| Offline submit attempts / lost connectivity mid-form | `useOnlineStatus()` listens to live events; submit stays disabled while offline and re-enables automatically when back online. |
| Navbar dropdown stays open after navigating | Explicitly close the dropdown on link click. |

---

## Out of Scope (explicit)

- User/management screens (`/management/*`), admin editing other users.
- Admin and super-admin role/feature management.
- The Synchronization Send/Receive slice (already shipped).
- Offline write or queueing for profile/password.
- New domain models or backend endpoint changes.

---

## Open Questions

None. The two prior open questions (password strength, post-change logout) are LOCKED by user decision.

---

## Next Recommended

`sdd-spec` and `sdd-design` (can run in parallel).
