# API Endpoints — E2E Coverage Inventory

**Date**: 2026-07-29  
**Project**: SMCA Store Management  
**Route Base**: `api/v1/[controller]` (from `BaseApiController`)  

---

## Overview

| Controller | Total Endpoints | Tested | Untested | Coverage | Review & Fix |
|---|---|---|---|---|---|
| AuthController | 5 | 5 | 0 | 100% | |
| StoresController | 12 | 10 | 2 | 83% | |
| UsersController | 8 | 8 | 0 | 100% | |
| OwnersController | 5 | 5 | 0 | 100% | ✅ Reviewed |
| FeaturesController | 3 | 3 | 0 | 100% | |
| StoreUsersController | 4 | 3 | 1 | 75% | |
| UsagesController | 3 | 1 | 2 | 33% | |
| ModulesController | 1 | 0 | 1 | 0% | |
| TenantsController | 8 | 0 | 8 | 0% | |
| ProductCategoriesController | 5 | 0 | 5 | 0% | |
| ProductsController | 11 | 0 | 11 | 0% | |
| ReSellersController | 5 | 0 | 5 | 0% | |
| PingController | 1 | 0 | 1 | 0% | |
| WeatherForecastController | 1 | 0 | 1 | 0% | |
| **TOTAL** | **72** | **35** | **37** | **49%** | |

---

## api-endpoint-review Status

Tracks which endpoints have been reviewed via `api-endpoint-review` skill and whether their fixes were applied/archived.

| # | Prioridad | Endpoint | Controller | Review Status | Fix Status | SDD Change |
|---|---|---|---|---|---|---|
| 1 | CRITICAL | `POST /api/v1/auth/login` | `AuthController.AuthAsync` | ✅ Done | ✅ Archived | `auth-login-security-fixes` |
| 2 | CRITICAL | `GET /api/v1/auth/logout` | `AuthController.Logout` | ✅ Done | ✅ Archived | `logout-endpoint-fixes` |
| 3 | CRITICAL | `GET /api/v1/auth/me` | `AuthController.GetMeAsync` | ✅ Done | ✅ Archived | `getme-endpoint-fixes` |
| 4 | CRITICAL | `POST /api/v1/auth/register` | `AuthController.RegisterAsync` | ✅ Done | ✅ Applied | `register-endpoint-fixes` |
| 5 | CRITICAL | `GET /api/v1/auth/ping` | `AuthController.PingAsync` | ✅ Done | ⬜ N/A (unused endpoint, no fixes applied) | — |
| 6 | CRITICAL | `POST /api/v1/stores` | `StoresController.CreateStoreAsync` | ✅ Done | ✅ Applied | `create-store-endpoint-fixes` |
| 7 | CRITICAL | `GET /api/v1/stores/by-current-user` | `StoresController.GetStoresByCurrentUserQueryAsync` | ✅ Done | ✅ Applied | `stores-by-current-user-fixes` |
| 8 | CRITICAL | `GET /api/v1/stores/list/{includeInactive}` | `StoresController.GetStoresAsync` | ✅ Done | ✅ Applied | `stores-list-endpoint-fixes` |
| 9 | CRITICAL | `GET /api/v1/stores/{id}` | `StoresController.GetStoreByIdAsync` | ✅ Done | ✅ Applied | `store-getbyid-fixes` |
| 10 | CRITICAL | `PUT /api/v1/stores/{id}` | `StoresController.UpdatedStoreAsync` | ✅ Done | ✅ Archived | `update-store-endpoint-fixes` |
| 11 | CRITICAL | `DELETE /api/v1/stores/{id}` | `StoresController.DeleteAsync` | ✅ Done | ✅ Applied | `delete-store-endpoint-fixes` |
| 12 | CRITICAL | `PUT /api/v1/stores` | `StoresController.SetMyStoreIdAsync` | ✅ Done | ✅ Archived | `set-my-store-endpoint-fixes` |
| 13 | CRITICAL | `POST /api/v1/stores/approve` | `StoresController.ApproveStoreAsync` | ✅ Done | ✅ Archived | `approve-store-endpoint-fixes` |
| 14 | CRITICAL | `POST /api/v1/stores/disapprove` | `StoresController.DisapproveStoreAsync` | ✅ Done | ✅ Archived | `approve-store-endpoint-fixes` |
| 15 | CRITICAL | `GET /api/v1/users/all/{includeInactive}` | `UsersController.GetAllUsersAsync` | ✅ Done | ✅ Archived | `get-users-all-endpoint-fixes` |
| 16 | CRITICAL | `GET /api/v1/users/{id}` | `UsersController.GetUserAsync` | ✅ Done | ✅ Archived | `get-user-by-id-endpoint-fixes` |
| 17 | CRITICAL | `PUT /api/v1/users/{id}` | `UsersController.UpdatedAsync` | ✅ Done | ✅ Archived | `update-user-endpoint-fixes` |
| 18 | CRITICAL | `DELETE /api/v1/users/{id}` | `UsersController.DeleteUserAsync` | ✅ Done | ✅ Archived | `delete-user-endpoint-fixes` |
| 19 | CRITICAL | `POST /api/v1/users/activate` | `UsersController.ActivateUserAsync` | ✅ Done | ✅ Archived | `activate-user-endpoint-fixes` |
| 20 | CRITICAL | `POST /api/v1/users/AddUserRoles` | `UsersController.AddUserRolesAsync` | ✅ Done | ✅ Archived | `user-roles-endpoint-fixes` |
| 21 | CRITICAL | `POST /api/v1/users/DeleteUserRoles` | `UsersController.RemoveUserRolesAsync` | ✅ Done | ✅ Archived | `user-roles-endpoint-fixes` |
| 22 | CRITICAL | `POST /api/v1/users/change-password` | `UsersController.ChangePasswordAsync` | ✅ Done | ✅ Archived | `change-password-endpoint-fixes` |
| 23 | CRITICAL | `GET /api/v1/Owners/all/{includeInactive}` | `OwnersController.GetAllOwnersAsync` | ✅ Done | ✅ Applied | `owners-getall-endpoint-fixes` |
| 24 | CRITICAL | `GET /api/v1/Owners/{id}` | `OwnersController.GetOwnerAsync` | ✅ Done | ✅ Applied | `owners-getbyid-endpoint-fixes` |
| 25 | CRITICAL | `POST /api/v1/Owners` | `OwnersController.CreateOwnerAsync` | ✅ Done | ✅ Applied | `owners-create-endpoint-fixes` |
| 26 | CRITICAL | `PUT /api/v1/Owners/{id}` | `OwnersController.UpdatedAsync` | ✅ Done | ✅ Applied | `owners-update-endpoint-fixes` |
| 27 | CRITICAL | `DELETE /api/v1/Owners/{id}` | `OwnersController.DeleteOwnerAsync` | ⬜ Pending | ⬜ N/A | — |
| 28 | HIGH | `POST /api/v1/stores/{storeId}/payments` | `StoresController.RegisterStorePaymentAsync` | ⬜ Pending | ⬜ N/A | — |
| 29 | HIGH | `PUT /api/v1/stores/{storeId}/payment-date` | `StoresController.SetStorePaymentDateAsync` | ⬜ Pending | ⬜ N/A | — |
| 30 | HIGH | `GET /api/v1/stores/to-collect` | `StoresController.GetStoresToCollectAsync` | ⬜ Pending | ⬜ N/A | — |
| 31 | HIGH | `GET /api/v1/stores/reseller-commissions` | `StoresController.GetReSellerCommissionsAsync` | ⬜ Pending | ⬜ N/A | — |
| 32 | HIGH | `GET /api/v1/Features/all/{includeInactive}` | `FeaturesController.GetFeaturesAsync` | ⬜ Pending | ⬜ N/A | — |
| 33 | HIGH | `POST /api/v1/Features/activate` | `FeaturesController.ActivateFeaturesAsync` | ⬜ Pending | ⬜ N/A | — |
| 34 | HIGH | `GET /api/v1/Features/available` | `FeaturesController.GetAvailableFeaturesToStoreQueryAsync` | ⬜ Pending | ⬜ N/A | — |

---

## Follow-up Debt

### ActivateStoreCommand — guard bug + validator double-query (dead code, decision C)

`ActivateStoreCommand.cs:46-47` (`backend/src/Application/Features/StoreManagement/Stores/Commands/ActivateStore/`) shares the same guard bug fixed by `activate-user-endpoint-fixes` on the Users side: it throws `ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest)` instead of `DontHavePermission` + `HttpStatusCode.Forbidden` when the actor is not SuperAdmin/OwnerAdmin. Its validator (`ActivateStoreCommandValidator.cs:20,24-27`) also carries the double-query existence rule (`MustAsync(StoreExists)` → full `GetStoreByIdIncludingModulesAsync` load in the validator + another in the handler), the exact pattern removed from ActivateUser/DeleteUser. The handler additionally lacks a null-check on the fetched store (`:49-50` — would NRE if the validator existence rule were removed without adding one).

**Status**: Dead code today — zero callers (grep across `backend/src` hits only the command + validator files; `ApproveStore` is self-contained; no endpoint exposes `ActivateStore`).

**Options**: (A) fix if ever wired up — mirror `activate-user-endpoint-fixes`: 403 `DontHavePermission` guard, remove validator double-query, add null-check → 404; (B) remove as dead code.

**Logged at archive**: `activate-user-endpoint-fixes` (user decision C — out of scope; plan doc note only, no code changes).

---

### User roles endpoints — URL casing + `GetAllActiveRolesAsync` latent bug

- **URL casing debt**: `POST /api/v1/users/AddUserRoles` and `POST /api/v1/users/DeleteUserRoles` use PascalCase routes, inconsistent with `all/{includeInactive}`, `activate`, `change-password`. NOT changed in `user-roles-endpoint-fixes` (user decision — breaking change for frontend + E2E tests). If ever normalized, requires coordinated frontend + test update.
- **`GetAllActiveRolesAsync` latent bug fixed** (in `user-roles-endpoint-fixes`, RoleRepository.cs): original WHERE only returned SuperAdmin role (or nothing when `includeSuperAdminRole=false`) despite the "GetAllActiveRoles" name. Fixed to `r.Id != (int)RoleType.SuperAdmin || includeSuperAdminRole`. Sole caller is `GetUserRolesByUserIdQuery` (grep-verified) — no other endpoint affected.
- **`GetRolesByIds` dead stub repurposed**: `IRoleRepository.GetRolesByIds(HashSet<Guid>)` was a `NotImplementedException` stub with zero callers; repurposed to `HashSet<int>` (Role keys are `int`) and implemented as batched `IgnoreQueryFilters().Where(r => roleIds.Contains(r.Id))` — used by `VisibleRoleService` to kill the per-role N+1.

---

## CRITICAL Priority

### POST `/api/v1/auth/login`
- **Purpose**: Authenticate user with credentials, return JWT token
- **Controller**: `AuthController.AuthAsync()` — `[AllowAnonymous]`
- **Authorization**: None (anonymous)
- **E2E Tests**:
  - `AuthLoginTests.cs` — happy path login
  - `AuthLoginSuccessTests.cs` — successful login scenarios
  - `AuthLoginFailureTests.cs` — invalid credentials, disabled user
  - `AuthLoginValidationTests.cs` — validation errors (missing fields, bad format)
- **Coverage**: ✅ **Full** (success, failure, validation)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD auth-login-security-fixes)

### GET `/api/v1/auth/logout`
- **Purpose**: Logout current session, invalidate token
- **Controller**: `AuthController.Logout()` — `[AllowAnonymous]`
- **Authorization**: None (anonymous)
- **E2E Tests**:
  - `AuthLogoutTests.cs` — logout with valid/invalid tokens, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + SDD `logout-endpoint-fixes` — token blacklist, AccessToken refactor, dead code removal)

### GET `/api/v1/auth/me`
- **Purpose**: Get current authenticated user's profile and permissions
- **Controller**: `AuthController.GetMeAsync()`
- **Authorization**: `[Authorize]`
- **E2E Tests**:
  - `AuthMeTests.cs` — returns current user info
  - `AuthMeFailureTests.cs` — unauthenticated access, invalid token
  - `AuthMePermissionsTests.cs` — permission claims in response
  - `StoreScopingTests.cs` — verifies scoped store after setting store
  - `GetMeBillingTests.cs` (Billing/) — billing state in /me
  - `GetMeBillingStatesTests.cs` (Billing/) — billing status transitions
- **Coverage**: ✅ **Full** (auth, permissions, billing states, store scoping)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `getme-endpoint-fixes` — archived 2026-07-29)

### POST `/api/v1/auth/register`
- **Purpose**: Register a new user account
- **Controller**: `AuthController.RegisterAsync()` — `[AllowAnonymous]`
- **Authorization**: None (anonymous)
- **E2E Tests**:
  - `AuthRegisterTests.cs` — basic registration
  - `AuthRegisterSuccessTests.cs` — successful registration flow
  - `AuthRegisterValidationTests.cs` — validation errors
  - `AuthRegisterDuplicateTests.cs` — duplicate registration handling
- **Coverage**: ✅ **Full** (success, validation, duplicate)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `register-endpoint-fixes` — AuthDto, 201, rate limiting, real async, N+1 fix, batch insert, ReSeller logging)

### GET `/api/v1/auth/ping`
- **Purpose**: Health check within auth context
- **Controller**: `AuthController.PingAsync()` — `[AllowAnonymous]`
- **Authorization**: None (anonymous)
- **E2E Tests**:
  - `AuthPingTests.cs`
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### POST `/api/v1/stores`
- **Purpose**: Create a new store
- **Controller**: `StoresController.CreateStoreAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `StoreCreateTests.cs` — creation with valid/invalid data, duplicate names, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `create-store-endpoint-fixes` — 6 issues resolved: validator query, error msg, N+1 batch, DTO init, 201 Created, tests)

### GET `/api/v1/stores/by-current-user`
- **Purpose**: Get stores accessible to the current authenticated user
- **Controller**: `StoresController.GetStoresByCurrentUserQueryAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `StoresByCurrentUserTests.cs` — returns stores for user
  - `StoresAuthorizationTests.cs` (Auth/) — authorization by role
  - `StoresHarnessSmokeTests.cs` — smoke test for harness setup
  - `StoreRoleAccessTests.cs` (Stores/) — role-based store visibility
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `stores-by-current-user-fixes` — 6 bugs fixed: non-superadmin store filter, OwnerName NRE, DefaultStore in-DB filter, hardcoded `true`, missing ProducesResponseType, missing XML docs)

### GET `/api/v1/stores/list/{includeInactive}`
- **Purpose**: List all stores, optionally including inactive ones
- **Controller**: `StoresController.GetStoresAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `StoresListTests.cs` — active only, include inactive, owner name populated, 401, 403
  - `GetStoresQueryTests.cs` (Application.Tests) — handler unit tests
- **Coverage**: ✅ **Full** (E2E + unit)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `stores-list-endpoint-fixes` — Include fix NRE, ProducesResponseType 401/403, XML docs, WebApiTest param fix, unit + E2E tests)

### GET `/api/v1/stores/{id}`
- **Purpose**: Get store by ID
- **Controller**: `StoresController.GetStoreByIdAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `StoreGetByIdTests.cs` — existing store, non-existent ID, empty GUID, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `store-getbyid-fixes` — 7 bugs fixed: NRE missing Owner include, wrong handler name, Task.FromResult redundant, double DB query in validator, missing ProducesResponseType 401/403/400, missing XML docs, wrong namespace in service, null check race condition)

### PUT `/api/v1/stores/{id}`
- **Purpose**: Update store details
- **Controller**: `StoresController.UpdatedStoreAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `StoreUpdateTests.cs` — update name, modules, duplicate name, authorization
  - `StoreActivationTests.cs` (Billing/) — activation via store update
  - `StoreAuthorizationTests.cs` (Auth/) — authorization check
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `update-store-endpoint-fixes` — fire-and-forget async fix, N+1 batch loading, lightweight store existence check, auth 403 code, missing ProducesResponseType, unused import)

### DELETE `/api/v1/stores/{id}`
- **Purpose**: Deactivate (soft-delete) a store
- **Controller**: `StoresController.DeleteAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### PUT `/api/v1/stores`
- **Purpose**: Set current working store ID for the user session
- **Controller**: `StoresController.SetMyStoreIdAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `StoreScopingTests.cs` (Auth/) — sets store, then verifies /auth/me reflects it
  - `UsagesSmokeTests.cs` (Auth/) — sets store as setup for usage test
- **Coverage**: ⚠️ **Partial** (tested as setup step, not a dedicated test of the endpoint itself)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `set-my-store-endpoint-fixes` — 6 bugs fixed: NRE null-user, handler rename, validator over-fetch, missing ProducesResponseType, store access validation, redundant .NotNull())

### POST `/api/v1/stores/approve`
- **Purpose**: Approve a store for activation
- **Controller**: `StoresController.ApproveStoreAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**:
  - `StoreApproveTests.cs` — approve store, re-approve, unauthenticated, invalid ID (unknown → 404)
  - `StoreAuthorizationTests.cs` (Auth/) — authorization check
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `approve-store-endpoint-fixes` — 8 issues fixed: double DB query + over-fetching removed, dead auth guard removed, null check → 404, ProducesResponseType 400/401/403/404, XML docs, [FromBody], misleading test name fixed. Same fixes applied to DisapproveStore in same change.)

### POST `/api/v1/stores/disapprove`
- **Purpose**: Disapprove/reject a store
- **Controller**: `StoresController.DisapproveStoreAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**:
  - `StoreDisapproveTests.cs` — disapprove, re-disapprove, unauthenticated, invalid ID (unknown → 404)
  - `StoreAuthorizationTests.cs` (Auth/) — authorization check
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (fixed alongside approve-store-endpoint-fixes — same 8 issues, same pattern)

### GET `/api/v1/users/all/{includeInactive}`
- **Purpose**: List all users, optionally including inactive
- **Controller**: `UsersController.GetAllUsersAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersListTests.cs` — list active/inactive, role filtering, invalid bool, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `get-users-all-endpoint-fixes` — 8 issues fixed: NRE missing ThenInclude, CancellationToken propagation, Take(1000) safety cap, ProducesResponseType 400/401/403, [FromRoute], FluentValidation validator, RoleNames init, DRY Include helper)

### GET `/api/v1/users/{id}`
- **Purpose**: Get user by ID
- **Controller**: `UsersController.GetUserAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersGetByIdTests.cs` — existing user, non-existent, unauthenticated, unauthorized role
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `get-user-by-id-endpoint-fixes` — 400 contract kept + lightweight `ExistsAsync` (AnyAsync), OwnerName `.ThenInclude(o => o.User)` fix, race-guard envelope 404, CancellationToken propagation, ProducesResponseType 400/401/403, UserDto NRT `string?` + `RoleNames = []`, N1 `GetByLoginWithRelatedAsync` same fix, E2E body-asserting test RED→GREEN; spec `users-e2e` R2 aligned 404→400)

### PUT `/api/v1/users/{id}`
- **Purpose**: Update user profile
- **Controller**: `UsersController.UpdatedAsync()`
- **Authorization**: `[HasPermission(ProfileAdmin)]`
- **E2E Tests**:
  - `UsersUpdateTests.cs` — 13 tests: update own profile (super admin, owner admin), 403 store user without feature, 401 unauthenticated, 400 empty body, 400 non-existent id, IDOR envelope-404 (store user with Profile feature → other user), partial body preserves email/cellphone, empty cellphone clears, omitted isActive preserved, explicit isActive:false deactivates (admin), owner admin edits staff → 200, store user self-edit isActive ignored
- **Coverage**: ✅ **Full** (13 E2E tests)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `update-user-endpoint-fixes` — 8 issues resolved: IDOR ownership guard envelope-404, tri-state partial update (null=keep / ""=clear / value=assign), NRE race guard, validator ExistsAsync single round-trip, bool? IsActive admin-gated, UpdateAsync retained for NoTracking DbContext, ProducesResponseType 400/401/403/404 + [FromRoute], validator param rename)

### DELETE `/api/v1/users/{id}`
- **Purpose**: Delete a user
- **Controller**: `UsersController.DeleteUserAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersDeleteTests.cs` — delete user, non-existent, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `delete-user-endpoint-fixes` — see status table; detail section previously stale as "Pending")

### POST `/api/v1/users/activate`
- **Purpose**: Activate or deactivate a user
- **Controller**: `UsersController.ActivateUserAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersActivateTests.cs` — 4 tests: activate (IsActive=true → 200), deactivate (IsActive=false → 200), non-existent id → 404, StoreUser with Users feature → 403
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `activate-user-endpoint-fixes` — 6 issues fixed: IsActive honored (hardcoded `true` → `request.IsActive`), 403 `DontHavePermission` guard first (feature-granted StoreUser blocked — no more 400 `UserNotFound` mask), 404 `UserNotFound` for non-existent id, validator structural-only (double round-trip `MustAsync(UserExists)` removed), Swagger `[ProducesResponseType]` 400/401/403/404, namespace moved to `UserManagement.Users.Commands.ActivateUser`; 4 E2E tests RED→GREEN)

### POST `/api/v1/users/AddUserRoles`
- **Purpose**: Add roles to a user
- **Controller**: `UsersController.AddUserRolesAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersRolesTests.cs` — add roles, duplicate roles, delete roles
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `user-roles-endpoint-fixes` — 500 NRE `role.Name` fixed, 500 NRE `user.Id` race removed, 500 duplicate-RoleIds PK conflict fixed, N+1 killed in handler + VisibleRoleService, validators `GetByIdAsync` → `ExistsAsync`, `GetByUserIdAsync` repo method, query cleanup, `[FromBody]` + ProducesResponseType 400/401/403/404, 7 E2E tests incl. RED→GREEN)

### POST `/api/v1/users/DeleteUserRoles`
- **Purpose**: Remove roles from a user
- **Controller**: `UsersController.RemoveUserRolesAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersRolesTests.cs` — add then delete roles
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (fixed alongside `user-roles-endpoint-fixes` — validator `ExistsAsync` swap, `[FromBody]` + ProducesResponseType, shared `GetUserRolesByUserId` query cleanup, Delete Selected body assert test)

### POST `/api/v1/users/change-password`
- **Purpose**: Change a user's password (self-service or admin reset)
- **Controller**: `UsersController.ChangePasswordAsync()`
- **Authorization**: `[HasPermission(ProfileAdmin)]`
- **E2E Tests**:
  - `UsersChangePasswordTests.cs` — 8 tests: self change + re-login proof (new password 200 / old password 401), wrong old password → 400, weak new password → 400, non-existent id → 400, cross-tenant OwnerAdmin → 404 (anti-enumeration), same-tenant OwnerAdmin → 200, StoreUser without Profile → 403 (filter-level), SuperAdmin cross-tenant → 200
- **Coverage**: ✅ **Full**
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `change-password-endpoint-fixes` — route `change-password/{id}` + `[FromBody]` + `command.UserId = id`, broken random-salt self-verify fixed via `VerifyPassword` (BCrypt + legacy SHA256 fallback), null-guard → 404, admin gate 400→404, tenant-scope check closes cross-tenant IDOR (SuperAdmin bypass), NewPassword policy 8+uppercase with new resx keys, real ActionCode→HTTP status mapping 400/401/403/404, E2E seeds store raw SHA256 accepted by VerifyPassword tier-3)

### GET `/api/v1/Owners/all/{includeInactive}`
- **Purpose**: List all owners, optionally including inactive
- **Controller**: `OwnersController.GetAllOwnersAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersListTests.cs` — list active/inactive, authorization
  - `OwnersListGapTests.cs` — edge cases: missing permissions, invalid bool
  - `OwnersListAuthTests.cs` — 403 auth rejection test (NEW)
- **Coverage**: ✅ **Full** (27/27 E2E tests, 2 new)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `owners-getall-endpoint-fixes` — 7 issues fixed: auth gate 400→403, `.Take(1000)` safety cap, `[ProducesResponseType]` 400/401/403/500, XML doc "Get all owners" + `<param>`, Guid.Empty guard, CancellationToken propagation, null guard)

### GET `/api/v1/Owners/{id}`
- **Purpose**: Get owner by ID
- **Controller**: `OwnersController.GetOwnerAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersGetByIdTests.cs` — existing owner, non-existent (envelope 404), empty GUID, unauthenticated
- **Coverage**: ✅ **Full** (27/27 E2E, 3 GetById-specific)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `owners-getbyid-endpoint-fixes` — 7 issues fixed: N+1 includes, double-query eliminado + 400→404 envelope, CancellationToken propagation, `[ProducesResponseType]` 400/401/403/404/500, XML doc "Get owner by id", null guard, validator structural-only. ⚠️ Breaking: 400→404 envelope ActionCode)

### POST `/api/v1/Owners`
- **Purpose**: Create a new owner
- **Controller**: `OwnersController.CreateOwnerAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersCreateTests.cs` — happy path creation, 201 Created, OwnerDto response, Location header
  - `OwnersCreateValidationTests.cs` — validation errors, duplicate login 409, unauthorized 403, password complexity
  - `OwnersCreateGapTests.cs` — ReSeller creation 201, missing ReSeller 400
- **Coverage**: ✅ **Full** (31/31 Owners E2E, 13 Create-specific)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `owners-create-endpoint-fixes` — 9 fixes: NRE null guard, 200→201 Created + OwnerDto + Location, auth gate 400→403, duplicate 400→409, [ProducesResponseType] 201/400/401/403/409/500, password complexity, Guest doc, XML docs. ⚠️ Breaking: 200→201, bool→OwnerDto, 400→403, 400→409)

### PUT `/api/v1/Owners/{id}`
- **Purpose**: Update owner details
- **Controller**: `OwnersController.UpdatedAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersUpdateTests.cs` — 6 tests: persist (200 + OwnerDto), 404 nonexistent, 400 empty FullName, 400 invalid Email, 403 OwnerAdmin, 404 cross-tenant IDOR
  - `OwnersUpdateGapTests.cs` — 2 tests: 400 empty CellPhone, 400 nonexistent ReSeller
- **Coverage**: ✅ **Full** (8 E2E tests, 2 new)
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `owners-update-endpoint-fixes` — 14 bugs fixed: NoTracking User persistence, null guard → 404, tenant-scope IDOR guard, OwnerAdmin auth alignment, ResponseResult\<OwnerDto\>, ProducesResponseType 400/401/403/404/500, validator structural-only, double-query removed, lightweight AsTracking query, ReSeller null guard, XML docs, param rename, redundant HasValue removed, 2 new E2E tests. ⚠️ Breaking: bool→OwnerDto, 400→404, OwnerAdmin→403)

### DELETE `/api/v1/Owners/{id}`
- **Purpose**: Delete an owner
- **Controller**: `OwnersController.DeleteOwnerAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersDeleteTests.cs` — delete owner, non-existent, unauthorized role
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

---

## HIGH Priority

### POST `/api/v1/stores/{storeId}/payments`
- **Purpose**: Register a payment for a store
- **Controller**: `StoresController.RegisterStorePaymentAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StorePaymentAdmin)]`
- **E2E Tests**:
  - `PaymentHappyPathTests.cs` — first payment, subsequent payments, free store edge case
  - `PaymentMoneyTests.cs` — payment amounts, currency, multiple payments
  - `RegisterStorePaymentTests.cs` — registration flow, store scoping
  - `RegisterStorePaymentValidationTests.cs` — invalid store ID
  - `ToCollectTests.cs` — payment changes "to-collect" state
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### PUT `/api/v1/stores/{storeId}/payment-date`
- **Purpose**: Set a store's payment start date (SuperAdmin only)
- **Controller**: `StoresController.SetStorePaymentDateAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**:
  - `PaymentDateTests.cs` — set date, update date, invalid store, permissions
  - `StoreUpdateTests.cs` — partially tests as part of store update flow
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/stores/to-collect`
- **Purpose**: Get stores pending payment collection
- **Controller**: `StoresController.GetStoresToCollectAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StorePaymentAdmin)]`
- **E2E Tests**:
  - `GetStoresToCollectTests.cs` — retrieves to-collect list, filtering
  - `ToCollectTests.cs` — state transitions, payments affecting collection status
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/stores/reseller-commissions`
- **Purpose**: Get reseller commission summaries
- **Controller**: `StoresController.GetReSellerCommissionsAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StorePaymentAdmin)]`
- **E2E Tests**:
  - `GetReSellerCommissionsTests.cs` — commission retrieval
  - `ResellerCommissionsTests.cs` — commission calculations, authorization
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/Features/all/{includeInactive}`
- **Purpose**: List all features, optionally including inactive
- **Controller**: `FeaturesController.GetFeaturesAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**:
  - `FeaturesListTests.cs` — list active/inactive features
  - `FeaturesListGapTests.cs` — invalid bool, permissions gap, unauthenticated
  - `FeaturesListAuthTests.cs` — authorization scenarios
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### POST `/api/v1/Features/activate`
- **Purpose**: Activate features for the current tenant
- **Controller**: `FeaturesController.ActivateFeaturesAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**:
  - `FeaturesActivateTests.cs` — activate, idempotency (double activation)
  - `FeaturesActivateGapTests.cs` — edge cases, body handling, wrong HTTP method
  - `FeaturesActivateAuthTests.cs` — authorization by role
  - `StoreActivationTests.cs` (Billing/) — activation via store update triggers feature activation
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/Features/available`
- **Purpose**: Get features available to assign to a store
- **Controller**: `FeaturesController.GetAvailableFeaturesToStoreQueryAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `FeaturesAvailableTests.cs` — available features retrieval
  - `FeaturesAvailableGapTests.cs` — edge cases, wrong HTTP method
  - `FeaturesAvailableAuthTests.cs` — authorization scenarios
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

---

## MEDIUM Priority

### GET `/api/v1/StoreUsers/list/{includeInactive}`
- **Purpose**: List store users, optionally including inactive
- **Controller**: `StoreUsersController.GetStoreUsersAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `StoreUsersListTests.cs` — list active/inactive, invalid bool, authorization, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/StoreUsers/{id}`
- **Purpose**: Get store user by ID
- **Controller**: `StoreUsersController.GetStoreUserByIdAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `StoreUsersCrudTests.cs` — gets a user after creation, non-existent ID
- **Coverage**: ⚠️ **Partial** (tested within CRUD flow, no dedicated test file)
- **Review**: ⬜ Pending

### POST `/api/v1/StoreUsers`
- **Purpose**: Create a store user
- **Controller**: `StoreUsersController.CreateStoreUserAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `StoreUsersCrudTests.cs` — create, duplicate, validation
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/StoreUsers/{storeId}/offline-roster`
- **Purpose**: Export offline roster for a store
- **Controller**: `StoreUsersController.ExportOfflineRosterAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `ExportOfflineRosterTests.cs` — roster export, store scoping, non-existent store, concurrent access
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/Modules/ToStore`
- **Purpose**: Get available modules for a store
- **Controller**: `ModulesController.GetAvailableModulesToStoreQueryAsync()`
- **Authorization**: `[HasPermission(StoresAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

---

## LOW Priority

### GET `/api/v1/Ping`
- **Purpose**: Health check / ping
- **Controller**: `PingController.Ping()`
- **Authorization**: `[AllowAnonymous]`
- **E2E Tests**: **None found** (only `/api/v1/auth/ping` is tested, which is a different endpoint)
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### POST `/api/v1/usages/store-daily-usage`
- **Purpose**: Update store daily usage statistics
- **Controller**: `UsagesController.ApproveStoreAsync()`
- **Authorization**: `[HasPermission(ProfileAdmin)]`
- **E2E Tests**:
  - `UsagesSmokeTests.cs` (Auth/) — basic smoke test for usage submission
- **Coverage**: ⚠️ **Partial** (smoke test only, no full coverage)
- **Review**: ⬜ Pending

### GET `/api/v1/usages/stores-last-week`
- **Purpose**: Get usage data for stores over the last week
- **Controller**: `UsagesController.GetStoreLastWeekUsagesQueryAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/usages/stores-last-month`
- **Purpose**: Get usage data for stores over the last month
- **Controller**: `UsagesController.GetStoreLastMonthUsagesQueryAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Tenants/list`
- **Purpose**: List tenants including active features
- **Controller**: `TenantsController.GetTenantsIncludingActiveFeaturesAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Tenants/all/{includeInactive}`
- **Purpose**: List all tenants, optionally including inactive
- **Controller**: `TenantsController.GetTenantsAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### POST `/api/v1/Tenants/CreateTenant`
- **Purpose**: Create a new tenant
- **Controller**: `TenantsController.CreateTenantAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### PUT `/api/v1/Tenants`
- **Purpose**: Set current working tenant for the session
- **Controller**: `TenantsController.SetMyTenantIdAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Tenants/GetTenantFeatures`
- **Purpose**: Get features for current tenant (public)
- **Controller**: `TenantsController.GetTenantFeaturesAsync()`
- **Authorization**: `[AllowAnonymous]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Tenants/{id}`
- **Purpose**: Get tenant by ID
- **Controller**: `TenantsController.GetTenantByIdAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### PUT `/api/v1/Tenants/{id}`
- **Purpose**: Update tenant details
- **Controller**: `TenantsController.UpdatedTenantAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### DELETE `/api/v1/Tenants/{id}`
- **Purpose**: Delete a tenant
- **Controller**: `TenantsController.DeleteAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/ProductCategories/all/{includeInactive}`
- **Purpose**: List all product categories
- **Controller**: `ProductCategoriesController.GetAllProductCategoriesAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/ProductCategories/catalog`
- **Purpose**: Get product categories catalog view
- **Controller**: `ProductCategoriesController.GetProductCategoriesViewAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### POST `/api/v1/ProductCategories`
- **Purpose**: Create a product category
- **Controller**: `ProductCategoriesController.CreateProductCategoryAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### PUT `/api/v1/ProductCategories/{id}`
- **Purpose**: Update a product category
- **Controller**: `ProductCategoriesController.UpdatedAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/ProductCategories/maxOrder`
- **Purpose**: Get maximum category order value
- **Controller**: `ProductCategoriesController.GetMaxProductCategoryOrderAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Products/{id}`
- **Purpose**: Get product by ID
- **Controller**: `ProductsController.GetProductByIdQueryAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Products/hasAnyAvailableToSaleProduct`
- **Purpose**: Check if any product is available for sale
- **Controller**: `ProductsController.HasAnyAvailableToSaleProductAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Products/toSaleByCategoryId/{categoryId}`
- **Purpose**: Get products available for sale by category
- **Controller**: `ProductsController.GetAvailableToSaleProductsAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Products/availableByCategoryId/{categoryId}`
- **Purpose**: Get available products by category
- **Controller**: `ProductsController.GetAvailableProductsAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Products/toEntry`
- **Purpose**: Get products pending entry
- **Controller**: `ProductsController.GetToEntryProductsAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### POST `/api/v1/Products`
- **Purpose**: Create a single product
- **Controller**: `ProductsController.CreateProductAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### PUT `/api/v1/Products/{id}`
- **Purpose**: Update a product
- **Controller**: `ProductsController.UpdatedAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### DELETE `/api/v1/Products/{id}`
- **Purpose**: Delete a product
- **Controller**: `ProductsController.DeleteProductAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### POST `/api/v1/Products/createProducts`
- **Purpose**: Bulk create products
- **Controller**: `ProductsController.CreateProductsAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### POST `/api/v1/Products/import`
- **Purpose**: Import products from CSV
- **Controller**: `ProductsController.ImportProductsAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/Products/maxOrderByCategoryId/{categoryId}`
- **Purpose**: Get max product order within a category
- **Controller**: `ProductsController.GetMaxProductOrderByCategoryIdAsync()`
- **Authorization**: `[HasPermission(ProductsAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/ReSellers/all/{includeInactive}`
- **Purpose**: List all resellers
- **Controller**: `ReSellersController.GetAllReSellersAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/ReSellers/{id}`
- **Purpose**: Get reseller by ID
- **Controller**: `ReSellersController.GetReSellerAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### POST `/api/v1/ReSellers`
- **Purpose**: Create a new reseller
- **Controller**: `ReSellersController.CreateReSellerAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### PUT `/api/v1/ReSellers/{id}`
- **Purpose**: Update a reseller
- **Controller**: `ReSellersController.UpdatedAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### DELETE `/api/v1/ReSellers/{id}`
- **Purpose**: Delete a reseller
- **Controller**: `ReSellersController.DeleteReSellerAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/WeatherForecast`
- **Purpose**: Get sample weather forecast (template controller)
- **Controller**: `WeatherForecastController.Get()`
- **Authorization**: None (no auth attributes)
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

---

## Endpoints WITHOUT E2E Coverage (Complete List)

### Controllers with zero test coverage:
| # | Method | Endpoint | Controller | Permission |
|---|---|---|---|---|
| 1 | GET | `/api/v1/stores/list/{includeInactive}` | `StoresController.GetStoresAsync` | SuperAdmin, StoresAdmin |
| 2 | DELETE | `/api/v1/stores/{id}` | `StoresController.DeleteAsync` | SuperAdmin |
| 3 | GET | `/api/v1/Modules/ToStore` | `ModulesController.GetAvailableModulesToStoreQueryAsync` | StoresAdmin |
| 4 | GET | `/api/v1/Ping` | `PingController.Ping` | AllowAnonymous |
| 5 | GET | `/api/v1/usages/stores-last-week` | `UsagesController.GetStoreLastWeekUsagesQueryAsync` | SuperAdmin |
| 6 | GET | `/api/v1/usages/stores-last-month` | `UsagesController.GetStoreLastMonthUsagesQueryAsync` | SuperAdmin |
| 7 | GET | `/WeatherForecast` | `WeatherForecastController.Get` | None |
| 8 | GET | `/api/v1/Tenants/list` | `TenantsController.GetTenantsIncludingActiveFeaturesAsync` | SuperAdmin |
| 9 | GET | `/api/v1/Tenants/all/{includeInactive}` | `TenantsController.GetTenantsAsync` | SuperAdmin |
| 10 | POST | `/api/v1/Tenants/CreateTenant` | `TenantsController.CreateTenantAsync` | SuperAdmin |
| 11 | PUT | `/api/v1/Tenants` | `TenantsController.SetMyTenantIdAsync` | SuperAdmin |
| 12 | GET | `/api/v1/Tenants/GetTenantFeatures` | `TenantsController.GetTenantFeaturesAsync` | AllowAnonymous |
| 13 | GET | `/api/v1/Tenants/{id}` | `TenantsController.GetTenantByIdAsync` | SuperAdmin |
| 14 | PUT | `/api/v1/Tenants/{id}` | `TenantsController.UpdatedTenantAsync` | SuperAdmin |
| 15 | DELETE | `/api/v1/Tenants/{id}` | `TenantsController.DeleteAsync` | SuperAdmin |
| 16 | GET | `/api/v1/ProductCategories/all/{includeInactive}` | `ProductCategoriesController.GetAllProductCategoriesAsync` | ProductsAdmin |
| 17 | GET | `/api/v1/ProductCategories/catalog` | `ProductCategoriesController.GetProductCategoriesViewAsync` | ProductsAdmin |
| 18 | POST | `/api/v1/ProductCategories` | `ProductCategoriesController.CreateProductCategoryAsync` | ProductsAdmin |
| 19 | PUT | `/api/v1/ProductCategories/{id}` | `ProductCategoriesController.UpdatedAsync` | ProductsAdmin |
| 20 | GET | `/api/v1/ProductCategories/maxOrder` | `ProductCategoriesController.GetMaxProductCategoryOrderAsync` | ProductsAdmin |
| 21 | GET | `/api/v1/Products/{id}` | `ProductsController.GetProductByIdQueryAsync` | ProductsAdmin |
| 22 | GET | `/api/v1/Products/hasAnyAvailableToSaleProduct` | `ProductsController.HasAnyAvailableToSaleProductAsync` | ProductsAdmin |
| 23 | GET | `/api/v1/Products/toSaleByCategoryId/{categoryId}` | `ProductsController.GetAvailableToSaleProductsAsync` | ProductsAdmin |
| 24 | GET | `/api/v1/Products/availableByCategoryId/{categoryId}` | `ProductsController.GetAvailableProductsAsync` | ProductsAdmin |
| 25 | GET | `/api/v1/Products/toEntry` | `ProductsController.GetToEntryProductsAsync` | ProductsAdmin |
| 26 | POST | `/api/v1/Products` | `ProductsController.CreateProductAsync` | ProductsAdmin |
| 27 | PUT | `/api/v1/Products/{id}` | `ProductsController.UpdatedAsync` | ProductsAdmin |
| 28 | DELETE | `/api/v1/Products/{id}` | `ProductsController.DeleteProductAsync` | ProductsAdmin |
| 29 | POST | `/api/v1/Products/createProducts` | `ProductsController.CreateProductsAsync` | ProductsAdmin |
| 30 | POST | `/api/v1/Products/import` | `ProductsController.ImportProductsAsync` | ProductsAdmin |
| 31 | GET | `/api/v1/Products/maxOrderByCategoryId/{categoryId}` | `ProductsController.GetMaxProductOrderByCategoryIdAsync` | ProductsAdmin |
| 32 | GET | `/api/v1/ReSellers/all/{includeInactive}` | `ReSellersController.GetAllReSellersAsync` | SuperAdmin |
| 33 | GET | `/api/v1/ReSellers/{id}` | `ReSellersController.GetReSellerAsync` | SuperAdmin |
| 34 | POST | `/api/v1/ReSellers` | `ReSellersController.CreateReSellerAsync` | SuperAdmin |
| 35 | PUT | `/api/v1/ReSellers/{id}` | `ReSellersController.UpdatedAsync` | SuperAdmin |
| 36 | DELETE | `/api/v1/ReSellers/{id}` | `ReSellersController.DeleteReSellerAsync` | SuperAdmin |
| 37 | GET | `/api/v1/StoreUsers/{id}` | `StoreUsersController.GetStoreUserByIdAsync` | UsersAdmin |

### Endpoints with partial coverage:
| # | Method | Endpoint | Controller | Coverage |
|---|---|---|---|---|
| 1 | PUT | `/api/v1/stores` | `StoresController.SetMyStoreIdAsync` | ⚠️ Only tested as setup, no dedicated endpoint test |
| 2 | POST | `/api/v1/usages/store-daily-usage` | `UsagesController.ApproveStoreAsync` | ⚠️ Smoke test only |
| 3 | GET | `/api/v1/StoreUsers/{id}` | `StoreUsersController.GetStoreUserByIdAsync` | ⚠️ Only tested via CRUD flow |

---

## E2E Test File Index

### Auth/ (14 files)
| File | Endpoint(s) |
|---|---|
| `AuthLoginTests.cs` | POST `/api/v1/auth/login` |
| `AuthLoginSuccessTests.cs` | POST `/api/v1/auth/login` |
| `AuthLoginFailureTests.cs` | POST `/api/v1/auth/login` |
| `AuthLoginValidationTests.cs` | POST `/api/v1/auth/login` |
| `AuthLogoutTests.cs` | GET `/api/v1/auth/logout` |
| `AuthMeTests.cs` | GET `/api/v1/auth/me` |
| `AuthMeFailureTests.cs` | GET `/api/v1/auth/me` |
| `AuthMePermissionsTests.cs` | GET `/api/v1/auth/me` |
| `AuthPingTests.cs` | GET `/api/v1/auth/ping` |
| `AuthRegisterTests.cs` | POST `/api/v1/auth/register` |
| `AuthRegisterSuccessTests.cs` | POST `/api/v1/auth/register` |
| `AuthRegisterValidationTests.cs` | POST `/api/v1/auth/register` |
| `AuthRegisterDuplicateTests.cs` | POST `/api/v1/auth/register` |
| `StoreScopingTests.cs` | PUT `/api/v1/stores` (set store) + GET `/api/v1/auth/me` (verify) |
| `StoresAuthorizationTests.cs` | GET `/api/v1/stores/by-current-user`, POST `/api/v1/stores/approve`, POST `/api/v1/stores/disapprove`, PUT `/api/v1/stores/{id}` |
| `UsagesSmokeTests.cs` | PUT `/api/v1/stores` (set store) + POST `/api/v1/usages/store-daily-usage` |

### Billing/ (13 files)
| File | Endpoint(s) |
|---|---|
| `GetMeBillingTests.cs` | GET `/api/v1/auth/me` |
| `GetMeBillingStatesTests.cs` | GET `/api/v1/auth/me` |
| `GetReSellerCommissionsTests.cs` | GET `/api/v1/stores/reseller-commissions` |
| `GetStoresToCollectTests.cs` | GET `/api/v1/stores/to-collect` |
| `PaymentDateTests.cs` | PUT `/api/v1/stores/{storeId}/payment-date` |
| `PaymentHappyPathTests.cs` | POST `/api/v1/stores/{storeId}/payments` |
| `PaymentMoneyTests.cs` | POST `/api/v1/stores/{storeId}/payments` |
| `RegisterStorePaymentTests.cs` | POST `/api/v1/stores/{storeId}/payments` |
| `RegisterStorePaymentValidationTests.cs` | POST `/api/v1/stores/{storeId}/payments` |
| `ResellerCommissionsTests.cs` | GET `/api/v1/stores/reseller-commissions` |
| `StoreActivationTests.cs` | PUT `/api/v1/stores/{id}` (update store to activate) |
| `ToCollectTests.cs` | GET `/api/v1/stores/to-collect`, POST `/api/v1/stores/{storeId}/payments` |
| `BackfillMigrationTests.cs` | (No endpoint — data migration test only) |

### Features/ (8 files)
| File | Endpoint(s) |
|---|---|
| `FeaturesActivateTests.cs` | POST `/api/v1/Features/activate` |
| `FeaturesActivateGapTests.cs` | POST `/api/v1/Features/activate` |
| `FeaturesActivateAuthTests.cs` | POST `/api/v1/Features/activate` |
| `FeaturesAvailableTests.cs` | GET `/api/v1/Features/available` |
| `FeaturesAvailableGapTests.cs` | GET `/api/v1/Features/available` |
| `FeaturesAvailableAuthTests.cs` | GET `/api/v1/Features/available` |
| `FeaturesListTests.cs` | GET `/api/v1/Features/all/{includeInactive}` |
| `FeaturesListGapTests.cs` | GET `/api/v1/Features/all/{includeInactive}` |
| `FeaturesListAuthTests.cs` | GET `/api/v1/Features/all/{includeInactive}` |

### Owners/ (8 files)
| File | Endpoint(s) |
|---|---|
| `OwnersCreateTests.cs` | POST `/api/v1/Owners` |
| `OwnersCreateGapTests.cs` | POST `/api/v1/Owners` |
| `OwnersCreateValidationTests.cs` | POST `/api/v1/Owners` |
| `OwnersDeleteTests.cs` | DELETE `/api/v1/Owners/{id}` |
| `OwnersGetByIdTests.cs` | GET `/api/v1/Owners/{id}` |
| `OwnersListTests.cs` | GET `/api/v1/Owners/all/{includeInactive}` |
| `OwnersListGapTests.cs` | GET `/api/v1/Owners/all/{includeInactive}` |
| `OwnersUpdateTests.cs` | PUT `/api/v1/Owners/{id}` |
| `OwnersUpdateGapTests.cs` | PUT `/api/v1/Owners/{id}` |

### Stores/ (9 files)
| File | Endpoint(s) |
|---|---|
| `StoreApproveTests.cs` | POST `/api/v1/stores/approve` |
| `StoreAuthorizationTests.cs` | GET `/api/v1/stores/by-current-user`, POST `/api/v1/stores/approve`, POST `/api/v1/stores/disapprove`, PUT `/api/v1/stores/{id}` |
| `StoreCreateTests.cs` | POST `/api/v1/stores` |
| `StoreDisapproveTests.cs` | POST `/api/v1/stores/disapprove` |
| `StoreGetByIdTests.cs` | GET `/api/v1/stores/{id}` |
| `StoreRoleAccessTests.cs` | GET `/api/v1/stores/by-current-user` |
| `StoresByCurrentUserTests.cs` | GET `/api/v1/stores/by-current-user` |
| `StoresHarnessSmokeTests.cs` | GET `/api/v1/stores/by-current-user` |
| `StoreUpdateTests.cs` | PUT `/api/v1/stores/{id}`, PUT `/api/v1/stores/{storeId}/payment-date` |

### Users/ (8 files)
| File | Endpoint(s) |
|---|---|
| `ExportOfflineRosterTests.cs` | GET `/api/v1/StoreUsers/{storeId}/offline-roster` |
| `StoreUsersCrudTests.cs` | POST `/api/v1/StoreUsers`, GET `/api/v1/StoreUsers/{id}` |
| `StoreUsersListTests.cs` | GET `/api/v1/StoreUsers/list/{includeInactive}` |
| `UsersActivateTests.cs` | POST `/api/v1/users/activate` |
| `UsersChangePasswordTests.cs` | POST `/api/v1/users/change-password/{id}` |
| `UsersDeleteTests.cs` | DELETE `/api/v1/users/{id}` |
| `UsersGetByIdTests.cs` | GET `/api/v1/users/{id}` |
| `UsersListTests.cs` | GET `/api/v1/users/all/{includeInactive}` |
| `UsersRolesTests.cs` | POST `/api/v1/users/AddUserRoles`, POST `/api/v1/users/DeleteUserRoles` |
| `UsersUpdateTests.cs` | PUT `/api/v1/users/{id}` (13 tests) |

---

## Key Findings

### Strengths
1. **Auth endpoints**: 100% E2E coverage across all 5 endpoints (login, logout, me, register, ping)
2. **Users CRUD**: 100% coverage on all 8 user management endpoints
3. **Owners CRUD**: 100% coverage on all 5 owner endpoints
4. **Features**: 100% coverage on all 3 feature endpoints
5. **Billing/payments**: Comprehensive coverage across payment, collection, and commission endpoints
6. **Store operations**: Good coverage on create, read, update, approve, disapprove, and by-current-user

### Critical Gaps
1. **Products & ProductCategories**: **0% coverage** — 16 endpoints with zero tests
2. **Tenants**: **0% coverage** — 8 endpoints with zero tests
3. **ReSellers**: **0% coverage** — 5 endpoints with zero tests
4. **Stores DELETE**: No E2E test for store deactivation
5. **Modules**: No E2E test for `GET /Modules/ToStore`
7. **Usages**: Two out of three usage endpoints untested (stores-last-week, stores-last-month)
8. **PingController**: Not tested (only AuthController's ping endpoint is tested)

### Recommended Priority for New Tests
1. **IMMEDIATE**: Products + ProductCategories (16 endpoints, core sales feature)
2. **HIGH**: Tenants (multi-tenant management, SuperAdmin only)
3. **HIGH**: Stores DELETE (data deletion path)
4. **MEDIUM**: ReSellers (reseller management, SuperAdmin only)
5. **LOW**: Modules, Usages (stores-last-week/month), PingController
