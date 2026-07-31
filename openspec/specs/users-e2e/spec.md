# Spec: Users E2E Tests

**Domain**: users-e2e — backend end-to-end test scenarios for Users and StoreUsers API  
**Origin**: SDD change `users-e2e`  
**Status**: Active  
**Last Updated**: 2026-07-31  

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
| Non-existent id | SuperAdmin | 400 (validator) |
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

---

## Delta for users-e2e: GetUserById Body Coverage + Seed

**Change**: `get-user-by-id-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: E2E-G1 — StoreUser Row in `SeedOwnerAdminWithStoreAsync`

`UserSeed.SeedOwnerAdminWithStoreAsync` MUST add a `StoreUser.Create(user.Id, store.Id, tenantId)` row after the Store is created, completing the User → StoreUser → Store → Owner → User graph so `ownerName`/`storeName` resolve in GetUserById responses.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Graph seeded | `SeedOwnerAdminWithStoreAsync` runs | Seed completes | StoreUser row exists linking seeded user and store |
| 1b | Existing tests unaffected | UsersList/UsersUpdate tests seed the same fixture | Tests run | Additive row only — no assertions on absence of StoreUser break |

#### Requirement: E2E-G2 — Body-Asserting GetUserById Test (RED → GREEN)

`UsersGetByIdTests` MUST add exactly ONE test where a SuperAdmin actor fetches the seeded OwnerAdmin target (actor ≠ target — self-lookup would let EF fixup mask the missing include). The test MUST assert HTTP 200 and response body: `Data.Id == target.Id`, `ownerName == "E2E OwnerAdmin"`, `storeName` not null, `roleNames` contains "OwnerAdmin". This test MUST FAIL (RED) before the include-chain fix (repository delta RR-G2) and PASS (GREEN) after.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | RED before fix | Seed graph present; `GetUserByIdIncludingStoreAndRoles` still missing `.ThenInclude(o => o.User)` | Test executes | `ownerName` is null; assertion fails (ownerName != "E2E OwnerAdmin") |
| 2b | GREEN after fix | Include chain fixed via `IncludeStoreAndRoles` helper | Test executes | 200; `Data.Id` matches; `ownerName == "E2E OwnerAdmin"`; `storeName` not null; `roleNames` contains "OwnerAdmin" |
| 2c | Fixup not masked | Actor (SuperAdmin) differs from target (OwnerAdmin) | Test executes | No EF identity-map fixup can supply `Owner.User` on the target — assertion is real |

### MODIFIED Requirements

#### Requirement: E2E-G3 — Pending Archive Alignment: users-e2e R2 Non-Existent Id → 400

(Resolved at ARCHIVE, decision D7 — implemented in this change.)

The main `openspec/specs/users-e2e/spec.md` R2 row "Non-existent id | SuperAdmin | 404" contradicted the chosen contract (400 via validator, D1=A) and the existing test `Get_nonexistent_id_returns_400` (asserts 400). At archive, the row was aligned to 400 — see R2 table above. The `Get_nonexistent_id_returns_400` test itself stays unchanged.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Contract holds | Non-existent id requested | Test `Get_nonexistent_id_returns_400` runs | Returns 400 Bad Request (unchanged) |
| 3b | Archive alignment | Change archived | users-e2e main spec updated | R2 "Non-existent id" row reads 400, matching test and contract |

### Verification Criteria

- [ ] New body test FAILS on pre-fix code, PASSES after fix (`ownerName == "E2E OwnerAdmin"`)
- [ ] `dotnet test`: UsersGetByIdTests, UsersListTests, UsersUpdateTests all pass post-fix
- [x] Main users-e2e spec R2 row aligned to 400 at archive (D7)
