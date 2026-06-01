# Exploration: phase4-mgmt-users (Users sub-domain, 2 of 3 Management slice)

**Change:** phase4-mgmt-users
**Phase:** Explore
**Status:** Done
**Date:** 2026-06-01
**Mode:** Hybrid (engram id 214 + this file)
**Branch:** feat/phase4-mgmt-users (stacked on feat/phase4-mgmt-stores)

OUT of scope: configurations (separate change phase4-mgmt-configurations).

## Current State

### Infrastructure already available (no changes needed)
- `adminFeatureLoader([EFeatures.Users])` — factory already live in `apps/web-store-pos/app/auth/routes/loaders.ts:51-57`. Reused directly, no new factory.
- `StoreUser` interface — `packages/domain/src/models/store.ts:68-77` (`id, storeId, storeName, login, fullName, cellPhone, email, isActive`).
- `ERoles.StoreUser = 3`, `EFeatures.Users = 72` in domain enums.
- `BaseRepository<T>`, `StorageKeys`, `useOnlineStatus`, `useAuthStore`, `apiClient` — available unchanged.
- `MENU.USERS` key exists in `es.ts`.

### Stores slice = exact precedent to mirror
- `app/management/stores/` — containers in `routes/`, presentationals in `components/`, HTTP service in `lib/services/`. 515/515 tests.
- Pattern: container owns loader + side-effects; presentational pure props-in/callbacks-out; HTTP service thin async over `apiClient`.

### Ghost state for Users
- No `/management/users` routes in `app/routes.ts`.
- No `app/management/users/` directory, no `userHttpService`, no `USERS.*` i18n keys.

## Angular Legacy — Key Findings
- TWO services: `UserService` (`/v1/users/`) used by list via `GET /users/all/true` (returns minimal `User[]` — no `login`/`storeId`); `StoreUserService` (`/v1/storeusers`) used only by create, `getStoreUsers()` → `GET /storeusers/list/true` returns full `StoreUser[]`.
- The Angular list uses the wrong service for the PRD domain model (`StoreUser`). Pre-existing inconsistency.
- `EditUserCredentialsComponent` exists but is NOT wired in `EditUserComponent`. It calls `changePassword(id, oldPassword, newPassword)` requiring `oldPassword`. PRD says admin reset does NOT require old password. Direct contradiction.

## Confirmed Endpoint Contracts (from Angular source)
| Operation | Method + Path | Payload | Returns |
|-----------|---------------|---------|---------|
| List (Angular used) | `GET /v1/users/all/true` | — | `User[]` |
| List (full model) | `GET /v1/storeusers/list/true` | — | `StoreUser[]` |
| Get by id | `GET /v1/users/:id` | — | `User` |
| Create store user | `POST /v1/storeusers` | `{ storeId, fullName, login, password, cellPhone, email, roleIds: [3] }` | `boolean` |
| Edit details | `PUT /v1/users/:id` | `{ fullName, cellPhone, email, isActive }` | `boolean` |
| Deactivate | `DELETE /v1/users/:id` | — | `boolean` |
| Activate | `POST /v1/users/activate` | `{ id, isActive: true }` | `boolean` |
| Change password | `POST /v1/users/change-password/:id` | `{ oldPassword, newPassword }` | `boolean` |
| Change login | NO EVIDENCE — no Angular method | — | Unknown |

## Affected Areas
- `app/routes.ts` — add 3 users routes
- `app/shared/lib/i18n/es.ts` — add `USERS.*` keys (~20-25)
- NEW `app/management/users/routes/`: user-list.tsx, user-create.tsx, user-edit.tsx + tests
- NEW `app/management/users/components/`: user-list.tsx, user-create-form.tsx, user-details-form.tsx, user-credentials-form.tsx + tests
- NEW `app/management/users/lib/services/user-http-service.ts` + tests
- `app/auth/routes/loaders.ts` — NO CHANGE

## Open Questions (resolved at proposal — see proposal.md)
- OQ-U1 (CRITICAL): which list endpoint — `/users/all/true` (minimal) vs `/storeusers/list/true` (full StoreUser).
- OQ-U2 (CRITICAL): credentials reset requires `oldPassword` (Angular) or admin bypass (PRD)?
- OQ-U3 (CRITICAL): does a `changeLogin` endpoint exist? If not, drop login-change field.
- OQ-U4: getUserById endpoint for edit container (resolves with OQ-U1).
- OQ-U5: credentials form in scope (PRD yes) or defer?

## Risks
1. Wrong list endpoint → incomplete data (missing `login`/`storeId`). High impact.
2. Credentials backend mismatch — PRD vs Angular `oldPassword`. Conservative default safe.
3. `changeLogin` not implemented → runtime error if field included.
4. PR size borderline ~350-450 lines. Forecast at tasks.

## Recommendation
Approach A — full PRD scope (3 routes, create, edit-details + credentials), mirroring Stores architecture, with OQ-U1/U2/U3 resolved at proposal.
