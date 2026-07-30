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
| OwnersController | 5 | 5 | 0 | 100% | |
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
| 3 | CRITICAL | `GET /api/v1/auth/me` | `AuthController.GetMeAsync` | ✅ Done | 🔶 Applied (pending archive) | `getme-endpoint-fixes` |
| 4 | CRITICAL | `POST /api/v1/auth/register` | `AuthController.RegisterAsync` | ✅ Done | ✅ Applied | `register-endpoint-fixes` |
| 5 | CRITICAL | `GET /api/v1/auth/ping` | `AuthController.PingAsync` | ✅ Done | ⬜ N/A (unused endpoint, no fixes applied) | — |
| 6 | CRITICAL | `POST /api/v1/stores` | `StoresController.CreateStoreAsync` | ✅ Done | ✅ Applied | `create-store-endpoint-fixes` |
| 7 | CRITICAL | `GET /api/v1/stores/by-current-user` | `StoresController.GetStoresByCurrentUserQueryAsync` | ⬜ Pending | ⬜ N/A | — |
| 8 | CRITICAL | `GET /api/v1/stores/list/{includeInactive}` | `StoresController.GetStoresAsync` | ⬜ Pending | ⬜ N/A | — |
| 9 | CRITICAL | `GET /api/v1/stores/{id}` | `StoresController.GetStoreByIdAsync` | ⬜ Pending | ⬜ N/A | — |
| 10 | CRITICAL | `PUT /api/v1/stores/{id}` | `StoresController.UpdatedStoreAsync` | ⬜ Pending | ⬜ N/A | — |
| 11 | CRITICAL | `DELETE /api/v1/stores/{id}` | `StoresController.DeleteAsync` | ⬜ Pending | ⬜ N/A | — |
| 12 | CRITICAL | `PUT /api/v1/stores` | `StoresController.SetMyStoreIdAsync` | ⬜ Pending | ⬜ N/A | — |
| 13 | CRITICAL | `POST /api/v1/stores/approve` | `StoresController.ApproveStoreAsync` | ⬜ Pending | ⬜ N/A | — |
| 14 | CRITICAL | `POST /api/v1/stores/disapprove` | `StoresController.DisapproveStoreAsync` | ⬜ Pending | ⬜ N/A | — |
| 15 | CRITICAL | `GET /api/v1/users/all/{includeInactive}` | `UsersController.GetAllUsersAsync` | ⬜ Pending | ⬜ N/A | — |
| 16 | CRITICAL | `GET /api/v1/users/{id}` | `UsersController.GetUserAsync` | ⬜ Pending | ⬜ N/A | — |
| 17 | CRITICAL | `PUT /api/v1/users/{id}` | `UsersController.UpdatedAsync` | ⬜ Pending | ⬜ N/A | — |
| 18 | CRITICAL | `DELETE /api/v1/users/{id}` | `UsersController.DeleteUserAsync` | ⬜ Pending | ⬜ N/A | — |
| 19 | CRITICAL | `POST /api/v1/users/activate` | `UsersController.ActivateUserAsync` | ⬜ Pending | ⬜ N/A | — |
| 20 | CRITICAL | `POST /api/v1/users/AddUserRoles` | `UsersController.AddUserRolesAsync` | ⬜ Pending | ⬜ N/A | — |
| 21 | CRITICAL | `POST /api/v1/users/DeleteUserRoles` | `UsersController.RemoveUserRolesAsync` | ⬜ Pending | ⬜ N/A | — |
| 22 | CRITICAL | `POST /api/v1/users/change-password` | `UsersController.ChangePasswordAsync` | ⬜ Pending | ⬜ N/A | — |
| 23 | CRITICAL | `GET /api/v1/Owners/all/{includeInactive}` | `OwnersController.GetAllOwnersAsync` | ⬜ Pending | ⬜ N/A | — |
| 24 | CRITICAL | `GET /api/v1/Owners/{id}` | `OwnersController.GetOwnerAsync` | ⬜ Pending | ⬜ N/A | — |
| 25 | CRITICAL | `POST /api/v1/Owners` | `OwnersController.CreateOwnerAsync` | ⬜ Pending | ⬜ N/A | — |
| 26 | CRITICAL | `PUT /api/v1/Owners/{id}` | `OwnersController.UpdatedAsync` | ⬜ Pending | ⬜ N/A | — |
| 27 | CRITICAL | `DELETE /api/v1/Owners/{id}` | `OwnersController.DeleteOwnerAsync` | ⬜ Pending | ⬜ N/A | — |
| 28 | HIGH | `POST /api/v1/stores/{storeId}/payments` | `StoresController.RegisterStorePaymentAsync` | ⬜ Pending | ⬜ N/A | — |
| 29 | HIGH | `PUT /api/v1/stores/{storeId}/payment-date` | `StoresController.SetStorePaymentDateAsync` | ⬜ Pending | ⬜ N/A | — |
| 30 | HIGH | `GET /api/v1/stores/to-collect` | `StoresController.GetStoresToCollectAsync` | ⬜ Pending | ⬜ N/A | — |
| 31 | HIGH | `GET /api/v1/stores/reseller-commissions` | `StoresController.GetReSellerCommissionsAsync` | ⬜ Pending | ⬜ N/A | — |
| 32 | HIGH | `GET /api/v1/Features/all/{includeInactive}` | `FeaturesController.GetFeaturesAsync` | ⬜ Pending | ⬜ N/A | — |
| 33 | HIGH | `POST /api/v1/Features/activate` | `FeaturesController.ActivateFeaturesAsync` | ⬜ Pending | ⬜ N/A | — |
| 34 | HIGH | `GET /api/v1/Features/available` | `FeaturesController.GetAvailableFeaturesToStoreQueryAsync` | ⬜ Pending | ⬜ N/A | — |

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
- **Review**: ✅ **Done** (api-endpoint-review + fixes via SDD `getme-endpoint-fixes` — pending archive)

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
- **Review**: ⬜ Pending

### GET `/api/v1/stores/list/{includeInactive}`
- **Purpose**: List all stores, optionally including inactive ones
- **Controller**: `StoresController.GetStoresAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**: **None found**
- **Coverage**: ❌ **None**
- **Review**: ⬜ Pending

### GET `/api/v1/stores/{id}`
- **Purpose**: Get store by ID
- **Controller**: `StoresController.GetStoreByIdAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `StoreGetByIdTests.cs` — existing store, non-existent ID, empty GUID, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### PUT `/api/v1/stores/{id}`
- **Purpose**: Update store details
- **Controller**: `StoresController.UpdatedStoreAsync()`
- **Authorization**: `[HasPermission(SuperAdmin, StoresAdmin)]`
- **E2E Tests**:
  - `StoreUpdateTests.cs` — update name, modules, duplicate name, authorization
  - `StoreActivationTests.cs` (Billing/) — activation via store update
  - `StoreAuthorizationTests.cs` (Auth/) — authorization check
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

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
- **Review**: ⬜ Pending

### POST `/api/v1/stores/approve`
- **Purpose**: Approve a store for activation
- **Controller**: `StoresController.ApproveStoreAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**:
  - `StoreApproveTests.cs` — approve store, re-approve, unauthenticated, invalid ID
  - `StoreAuthorizationTests.cs` (Auth/) — authorization check
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### POST `/api/v1/stores/disapprove`
- **Purpose**: Disapprove/reject a store
- **Controller**: `StoresController.DisapproveStoreAsync()`
- **Authorization**: `[HasPermission(SuperAdmin)]`
- **E2E Tests**:
  - `StoreDisapproveTests.cs` — disapprove, re-disapprove, unauthenticated, invalid ID
  - `StoreAuthorizationTests.cs` (Auth/) — authorization check
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/users/all/{includeInactive}`
- **Purpose**: List all users, optionally including inactive
- **Controller**: `UsersController.GetAllUsersAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersListTests.cs` — list active/inactive, role filtering, invalid bool, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/users/{id}`
- **Purpose**: Get user by ID
- **Controller**: `UsersController.GetUserAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersGetByIdTests.cs` — existing user, non-existent, unauthenticated, unauthorized role
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### PUT `/api/v1/users/{id}`
- **Purpose**: Update user profile
- **Controller**: `UsersController.UpdatedAsync()`
- **Authorization**: `[HasPermission(ProfileAdmin)]`
- **E2E Tests**:
  - `UsersUpdateTests.cs` — update own profile, update others, authorization, validation
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### DELETE `/api/v1/users/{id}`
- **Purpose**: Delete a user
- **Controller**: `UsersController.DeleteUserAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersDeleteTests.cs` — delete user, non-existent, unauthenticated
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### POST `/api/v1/users/activate`
- **Purpose**: Activate or deactivate a user
- **Controller**: `UsersController.ActivateUserAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersActivateTests.cs` — activate/deactivate, non-existent ID
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### POST `/api/v1/users/AddUserRoles`
- **Purpose**: Add roles to a user
- **Controller**: `UsersController.AddUserRolesAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersRolesTests.cs` — add roles, duplicate roles, delete roles
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### POST `/api/v1/users/DeleteUserRoles`
- **Purpose**: Remove roles from a user
- **Controller**: `UsersController.RemoveUserRolesAsync()`
- **Authorization**: `[HasPermission(UsersAdmin)]`
- **E2E Tests**:
  - `UsersRolesTests.cs` — add then delete roles
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### POST `/api/v1/users/change-password`
- **Purpose**: Change current user's password
- **Controller**: `UsersController.ChangePasswordAsync()`
- **Authorization**: `[HasPermission(ProfileAdmin)]`
- **E2E Tests**:
  - `UsersChangePasswordTests.cs` — change password, validation
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/Owners/all/{includeInactive}`
- **Purpose**: List all owners, optionally including inactive
- **Controller**: `OwnersController.GetAllOwnersAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersListTests.cs` — list active/inactive, authorization
  - `OwnersListGapTests.cs` — edge cases: missing permissions, invalid bool
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### GET `/api/v1/Owners/{id}`
- **Purpose**: Get owner by ID
- **Controller**: `OwnersController.GetOwnerAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersGetByIdTests.cs` — existing owner, non-existent, empty GUID
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### POST `/api/v1/Owners`
- **Purpose**: Create a new owner
- **Controller**: `OwnersController.CreateOwnerAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersCreateTests.cs` — happy path creation
  - `OwnersCreateValidationTests.cs` — validation errors (missing fields, invalid data)
  - `OwnersCreateGapTests.cs` — authorization gap scenarios
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

### PUT `/api/v1/Owners/{id}`
- **Purpose**: Update owner details
- **Controller**: `OwnersController.UpdatedAsync()`
- **Authorization**: `[HasPermission(OwnersAdmin)]`
- **E2E Tests**:
  - `OwnersUpdateTests.cs` — update name, isActive, non-existent, validation
  - `OwnersUpdateGapTests.cs` — edge cases: empty cellphone, invalid reSellerId
- **Coverage**: ✅ **Full**
- **Review**: ⬜ Pending

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
| `UsersChangePasswordTests.cs` | POST `/api/v1/users/change-password` |
| `UsersDeleteTests.cs` | DELETE `/api/v1/users/{id}` |
| `UsersGetByIdTests.cs` | GET `/api/v1/users/{id}` |
| `UsersListTests.cs` | GET `/api/v1/users/all/{includeInactive}` |
| `UsersRolesTests.cs` | POST `/api/v1/users/AddUserRoles`, POST `/api/v1/users/DeleteUserRoles` |
| `UsersUpdateTests.cs` | PUT `/api/v1/users/{id}` |

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
5. **Stores LIST**: No E2E test for the `GET /stores/list/{includeInactive}` endpoint
6. **Modules**: No E2E test for `GET /Modules/ToStore`
7. **Usages**: Two out of three usage endpoints untested (stores-last-week, stores-last-month)
8. **PingController**: Not tested (only AuthController's ping endpoint is tested)

### Recommended Priority for New Tests
1. **IMMEDIATE**: Products + ProductCategories (16 endpoints, core sales feature)
2. **HIGH**: Tenants (multi-tenant management, SuperAdmin only)
3. **HIGH**: Stores DELETE (data deletion path)
4. **MEDIUM**: ReSellers (reseller management, SuperAdmin only)
5. **MEDIUM**: Stores LIST (basic listing endpoint)
6. **LOW**: Modules, Usages (stores-last-week/month), PingController
