# Spec: Users E2E Tests

**Domain**: users-e2e — backend end-to-end test scenarios for Users and StoreUsers API  
**Origin**: SDD change `users-e2e`  
**Status**: Active  
**Last Updated**: 2026-07-24  

## Purpose

Define backend E2E test scenarios that validate all Users and StoreUsers API endpoints, covering happy paths, auth matrix (no token, wrong role, correct role), validation edge cases, and documented known bugs.

## In Scope
- UsersController (8 endpoints): GetAllUsers, GetById, Update, Delete, Activate, AddUserRoles, DeleteUserRoles, ChangePassword
- StoreUsersController (3 endpoints): List, GetById, Create
- Auth matrix: Anonymous (401), StoreUser/ReSeller (403), OwnerAdmin+UsersAdmin/ProfileAdmin (200), SuperAdmin (200)

## Out of Scope
- StoreUsers Update/Delete (no endpoints exist)
- Password complexity validation (handler doesn't enforce)
- Fixing the 3 known bugs (document test behavior only)

---

## R1: List Users (GET all/{includeInactive})

| Scenario | Actor | Expected |
|----------|-------|----------|
| List as SuperAdmin | SuperAdmin | 200, returns users |
| List as OwnerAdmin with UsersAdmin | OwnerAdmin+Management | 200, own tenant only |
| List as StoreUser | StoreUser | 403 |
| List as ReSeller | ReSeller | 403 |
| List without token | Anonymous | 401 |
| includeInactive=true | SuperAdmin | 200, includes inactive users |
| includeInactive=false | SuperAdmin | 200, excludes inactive users |
| includeInactive=not-a-bool | SuperAdmin | 400 |

## R2: Get User by Id (GET {id})

| Scenario | Actor | Expected |
|----------|-------|----------|
| Get existing user | SuperAdmin | 200, user returned |
| Get existing (OwnerAdmin+UsersAdmin) | OwnerAdmin+Management | 200 |
| Get as StoreUser | StoreUser | 403 |
| Get as ReSeller | ReSeller | 403 |
| Get without token | Anonymous | 401 |
| Non-existent id | SuperAdmin | 404 |
| Invalid id format | SuperAdmin | 400 or 404 |

## R3: Update User (PUT {id})

| Scenario | Actor | Expected |
|----------|-------|----------|
| Update full name | SuperAdmin | 200, name updated |
| Update as OwnerAdmin+ProfileAdmin | OwnerAdmin+Management | 200 |
| SuperAdmin toggles IsActive=false | SuperAdmin | 200, deactivated |
| OwnerAdmin toggles IsActive=true | OwnerAdmin+ProfileAdmin | 200, reactivated |
| Update as StoreUser | StoreUser | 403 |
| Update as ReSeller | ReSeller | 403 |
| Update without token | Anonymous | 401 |
| Non-existent id | SuperAdmin | 404 |
| Missing required body fields | SuperAdmin | 400 |

## R4: Delete User (DELETE {id})

| Scenario | Actor | Expected |
|----------|-------|----------|
| Soft-delete active user | SuperAdmin | 200, IsActive=false |
| Delete as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Delete as StoreUser | StoreUser | 403 |
| Delete without token | Anonymous | 401 |
| Already inactive user | SuperAdmin | 200, IsActive stays false |
| Non-existent id | SuperAdmin | 404 |

## R5: Activate User (POST activate)

| Scenario | Actor | Expected |
|----------|-------|----------|
| Activate inactive user | SuperAdmin | 200, IsActive=true |
| Deactivate with IsActive=false body | SuperAdmin | 200, IsActive=true (KNOWN BUG) |
| Activate as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Activate as StoreUser | StoreUser | 403 |
| Activate without token | Anonymous | 401 |
| POST verb to GET-only route | SuperAdmin | 405 (verb mismatch) |

## R6: Add User Roles (POST AddUserRoles)

| Scenario | Actor | Expected |
|----------|-------|----------|
| Add roles to active user | SuperAdmin | 200, roles assigned |
| Add roles reactivates inactive user | SuperAdmin | 200, IsActive=true |
| Add roles as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Add roles as StoreUser | StoreUser | 403 |
| Add roles without token | Anonymous | 401 |
| Empty RoleIds | SuperAdmin | 400 |
| Invalid RoleId | SuperAdmin | 400 or 404 |
| Non-existent UserId | SuperAdmin | 404 |

## R7: Delete User Roles (POST DeleteUserRoles)

| Scenario | Actor | Expected |
|----------|-------|----------|
| Remove roles from user | SuperAdmin | 200, roles removed, IsActive=false |
| Remove as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Remove as StoreUser | StoreUser | 403 |
| Remove without token | Anonymous | 401 |
| Remove non-existent role | SuperAdmin | 200 (idempotent) |
| Remove from non-existent user | SuperAdmin | 404 |

## R8: Change Password (POST change-password)

| Scenario | Actor | Expected |
|----------|-------|----------|
| Change with correct OldPassword | SuperAdmin | 200, password changed |
| Change as OwnerAdmin+ProfileAdmin | OwnerAdmin+Management | 200 |
| Change with wrong OldPassword | SuperAdmin | 400 or 403 |
| Change as StoreUser | StoreUser | 403 |
| Change without token | Anonymous | 401 |
| Missing NewPassword/MinLength | SuperAdmin | 400 |
| Non-existent UserId | SuperAdmin | 404 |

## R9: List Store Users (GET list/{includeInactive})

| Scenario | Actor | Expected |
|----------|-------|----------|
| List as SuperAdmin | SuperAdmin | 200, returns store users |
| List as OwnerAdmin with UsersAdmin | OwnerAdmin+Management | 200 |
| List as StoreUser | StoreUser | 403 |
| List without token | Anonymous | 401 |
| includeInactive=true | SuperAdmin | 200, includes inactive |
| includeInactive=not-a-bool | SuperAdmin | 400 |

## R10: Get Store User by Id (GET {id})

| Scenario | Actor | Expected |
|----------|-------|----------|
| Get existing store user | SuperAdmin | 200, user returned |
| Get as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Get as StoreUser | StoreUser | 403 |
| Get without token | Anonymous | 401 |
| Non-existent id | SuperAdmin | 404 |

## R11: Create Store User (POST /)

| Scenario | Actor | Expected |
|----------|-------|----------|
| Create full user (Login, Password, FullName, RoleIds) | SuperAdmin | 200 or 201, user created |
| Create with optional CellPhone and Email | SuperAdmin | 200, fields stored |
| Create as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Create as StoreUser | StoreUser | 403 |
| Create without token | Anonymous | 401 |
| Missing required Login | SuperAdmin | 400 |
| Missing required Password | SuperAdmin | 400 |
| Duplicate Login | SuperAdmin | 400 or 409 |
| Empty RoleIds | SuperAdmin | 400 |
| GET verb to POST route | SuperAdmin | 405 (verb mismatch) |

## Known Bugs (Test Documents, Does Not Fix)

| Bug | Endpoint | Behavior | Test Strategy |
|-----|----------|----------|---------------|
| Activate ignores IsActive=false | POST activate | Always sets true | Assert IsActive=true regardless of request body |
| StoreName Guid in response | List store users | StoreName = GUID | Assert StoreName exists, not its value |

## Verification Criteria

1. All 11 requirement groups have at least one happy-path test
2. Auth matrix verified per endpoint: 401 (no token), 403 (wrong role), 200 (correct role)
3. includeInactive parameter tested: true, false, and non-bool
4. Verb mismatch tested for POST-only and GET-only routes
5. Validation scenarios test each required field
6. Known bugs have tests that document actual behavior
7. All tests passing on `dotnet test`

## Related Specifications
- **authorization-e2e** (auth /me, stores enforcement E2E; separate change)
- **management-users** (frontend Users UI; separate domain)

## Implementation
- Test project: `SMCA.WebApi.E2ETests`
- Infrastructure: `UserSeed` (user fixture helper), `AuthzSeed` (role/feature fixtures)
- Auth helpers: `GetSuperAdminToken()`, `GetOwnerAdminToken()`, `GetStoreUserToken()`, `GetReSellerToken()`