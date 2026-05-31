# Exploration: phase4-profile (User Profile + Change Password)

**Change:** phase4-profile
**Phase:** Explore
**Status:** Done
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)

---

## Scope

Phase 4, scoped to **Profile only** (edit profile + change password). NOT management, NOT admin.

## PRD Requirements (docs/prd/profile.md)

- **EditProfile**: pre-fill from `currentUser`; fields fullName (required), cellPhone (optional), email (optional, email format). Submit → `PUT /v1/users/{id}`, then update `currentUser` + `AUTH_MODEL` in localStorage. Online required; offline disables submit with inline notice.
- **ChangePassword**: oldPassword (required), newPassword (required, min length), confirmPassword (must match). Submit → `POST /v1/users/change-password/{id}` with Credentials. Online required; consider logout + redirect to login on success. Wrong-password error inline without clearing form.
- **Offline gate**: `navigator.onLine` + `online`/`offline` events, real-time (not just on submit).
- **Navigation**: both routes reached from the navbar top-right user dropdown, NOT the sidebar.

## Current State

- Nav scaffolding present: `menu-config.ts` L90-95 `MENU.PROFILE` group with `/profile/edit` + `/profile/change-password` (EFeatures.Profile=70). i18n `MENU.PROFILE/EDIT_PROFILE/CHANGE_PASSWORD` present (es.ts L57, 97-98). `EFeatures.Profile=70` defined (enums L31).
- Routes NOT registered in `app/routes.ts`. No `app/profile/` directory exists.
- Navbar (`app/shared/components/navbar.tsx`) user dropdown has only logout — no profile links.
- Missing `PROFILE.*` form-level i18n keys.

## CRITICAL: Auth / User Data Model + Backend (CONFIRMED REAL API)

- Current user held in Zustand `useAuthStore` (`app/shared/lib/stores/auth-store.ts`): `{ user: UserModel|null, isAuthenticated, isLoading, error }`.
- After login `UserModel` written to TWO localStorage keys: `StorageKeys.AUTH_MODEL` (versioned, expiry) and `StorageKeys.CURRENT_USER` (`'currentUser'`).
- `UserModel` carries all profile fields. `password` is always `''` — NEVER stored locally.
- `Credentials` domain type already exists (`packages/domain/src/models/auth.ts`): `{ userId, oldPassword, newPassword }`.
- **Real backend, no mock**: `api-client.ts` Axios, `baseURL: import.meta.env['API_URL']`, Bearer token interceptor, 401→auto-logout. `auth-http-service.ts` does `POST /v1/auth/login`, `/register`.
- Profile endpoints (confirmed from legacy Angular `frontend/src/app/_services/user/user.service.ts`): `PUT /v1/users/{id}` `{ fullName, cellPhone, email, isActive }`; `POST /v1/users/change-password/{id}` `{ oldPassword, newPassword }`. NOT yet in React HTTP layer — need a `profileHttpService`.
- Password validation is entirely SERVER-SIDE. No local hash/compare anywhere.

## Legacy Angular Flow

EditProfile → `UserService.editUser()` → PUT. ChangePassword → `UserService.changePassword()` → POST (admin used it editing others; navigated to /management/users, no logout). Angular password regex: `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` — 1 digit, 1 lower, 1 upper, 8-30 chars. PRD says only "minimum length" — ALIGNMENT OPEN QUESTION.

## Approaches

- **A (RECOMMENDED): route containers + `profile-http-service` + `auth-store.updateUser()`** Consistent with all existing patterns; HTTP isolated; store is single source of truth (navbar reads it). Add `updateUser(user)` action mirroring `setUser()` (writes BOTH localStorage keys + Zustand). Add reusable `useOnlineStatus()` hook for real-time offline detection.
- **B: inline API calls in route components (like register.tsx).** Fewer files but mixes HTTP+state; register.tsx doesn't update the store, profile MUST. Rejected.
- **C: new `useProfileStore`.** Over-engineering; profile data already in auth-store. Rejected.

## File Map

New: `app/profile/routes/edit-profile.tsx`, `app/profile/routes/change-password.tsx`, `app/profile/routes/__tests__/profile-routes.test.tsx`, `app/profile/lib/services/profile-http-service.ts`, `app/shared/lib/hooks/use-online-status.ts`.
Modified: `app/routes.ts` (register 2 routes), `app/shared/components/navbar.tsx` (dropdown links + close on nav), `app/shared/lib/i18n/es.ts` (PROFILE.* keys), `app/shared/lib/stores/auth-store.ts` (updateUser action).

## Risks / Open Questions

1. **featureLoader storeId**: `featureLoader` defaults to `params.storeId`; profile routes have no `:storeId` param. For StoreUser the check fails if storeId undefined. Fix: `featureLoader([EFeatures.Profile], useAuthStore.getState().user?.selectedStoreId)` at module scope (getState works outside React).
2. **Dual localStorage sync**: `updateUser()` must write BOTH AUTH_MODEL and CURRENT_USER or navbar shows stale fullName.
3. **Password-change token invalidation** (OPEN, user/backend): does the API invalidate the token? Safe default = always logout on success. NEEDS DECISION.
4. **Password strength** (OPEN, user/backend): enforce Angular regex (1 digit/1 lower/1 upper/8-30) or PRD "min length"? NEEDS DECISION.
5. Navbar dropdown should close on link click.
6. `profileHttpService` must be created (PUT + POST).
7. register.tsx has hardcoded English strings — profile must be fully i18n.

## Next Recommended

`sdd-propose` (after the 2 open questions are answered).
