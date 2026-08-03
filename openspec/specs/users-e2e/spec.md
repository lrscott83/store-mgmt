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
- Documenting known bugs (test behavior only): of the original 3 known bugs, "Activate ignores IsActive=false" and the activate 400-mask guard bug are **FIXED** by `activate-user-endpoint-fixes` (see R5 + appended delta); the remaining "StoreName Guid in response" bug is documented only

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
| Update as StoreUser (no Profile feature) | StoreUser | 403 (filter-level) |
| Update other user as StoreUser+Profile | StoreUser+Profile | 200, envelope ActionCode 404 (IDOR denied, anti-enumeration) |
| Update as ReSeller | ReSeller | 403 |
| Update without token | Anonymous | 401 |
| Non-existent id | SuperAdmin | 400 (validator) |
| Missing required body fields | SuperAdmin | 400 |

## R4: Delete User (DELETE {id})

| Scenario | Actor | Expected |
|----------|-------|----------|
| Soft-delete active user | SuperAdmin | 200, IsActive=false |
| Delete own id (self-delete) | SuperAdmin | 400 (CannotDeleteSelf guard) |
| Delete as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Delete as StoreUser | StoreUser | 403 (handler-level DontHavePermission guard, even with Users feature) |
| Delete without token | Anonymous | 401 |
| Already inactive user | SuperAdmin | 200, IsActive stays false |
| Non-existent id | SuperAdmin | 404 |

## R5: Activate User (POST activate)

| Scenario | Actor | Expected |
|----------|-------|----------|
| Activate inactive user | SuperAdmin | 200, IsActive=true |
| Deactivate with IsActive=false body | SuperAdmin | 200, IsActive=false |
| Activate as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Activate as StoreUser | StoreUser | 403 (handler-level DontHavePermission guard, even with Users feature) |
| Non-existent id | SuperAdmin | 404 |
| Activate without token | Anonymous | 401 |
| POST verb to GET-only route | SuperAdmin | 405 (verb mismatch) |

## R6: Add User Roles (POST AddUserRoles)

| Scenario | Actor | Expected |
|----------|-------|----------|
| Add roles to active user | SuperAdmin | 200, roles assigned |
| Add roles reactivates inactive user | SuperAdmin | 200, IsActive=true |
| Add roles as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Add roles as StoreUser | StoreUser | 403 (filter-level) |
| Add roles without token | Anonymous | 401 |
| Empty RoleIds | SuperAdmin | 400 |
| Invalid RoleId | SuperAdmin | 400 (RoleNotFound) |
| Non-existent UserId | SuperAdmin | 400 (validator ExistsAsync) |
| Duplicate RoleIds | SuperAdmin | 200, no duplicate rows |

## R7: Delete User Roles (POST DeleteUserRoles)

| Scenario | Actor | Expected |
|----------|-------|----------|
| Remove roles from user | SuperAdmin | 200, roles removed, IsActive=false |
| Remove as OwnerAdmin+UsersAdmin | OwnerAdmin+Management | 200 |
| Remove as StoreUser | StoreUser | 403 (filter-level) |
| Remove without token | Anonymous | 401 |
| Remove non-existent role | SuperAdmin | 200 (idempotent) |
| Remove from non-existent user | SuperAdmin | 400 (validator ExistsAsync) |

## R8: Change Password (POST change-password/{id})

| Scenario | Actor | Expected |
|----------|-------|----------|
| Change with correct OldPassword | SuperAdmin | 200, password changed |
| Change as OwnerAdmin+ProfileAdmin | OwnerAdmin+Management | 200 |
| Change with wrong OldPassword | SuperAdmin | 400 (pinned — real HTTP 400, not 200+envelope, not 403) |
| Change as StoreUser | StoreUser | 403 |
| Change without token | Anonymous | 401 |
| Missing NewPassword/MinLength | SuperAdmin | 400 |
| Non-existent UserId | SuperAdmin | 400 (validator ExistsAsync) |

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

---

## Delta for users-e2e: UsersUpdateTests — 7 New Tests (RED → GREEN)

**Change**: `update-user-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: E2E-U1 — IDOR: StoreUser+Profile Editing Another User → Envelope 404 (RED → GREEN)

Test `Update_other_user_as_store_user_with_profile_feature_returns_envelope_404`: a StoreUser WITH the Profile feature (`AuthzSeed.SeedStoreUserAsync((int)FeatureType.Profile)`) PUTs a DIFFERENT user's id. Expected: HTTP 200 + envelope `ActionCode=404` (`succeeded=false`). Was RED before CH-U1 (returned 200 `data:true` — the existing filter-403 test cannot catch this actor) and GREEN after. Actor ≠ target to avoid EF fixup masking.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | RED before fix | StoreUser+Profile actor; target ≠ actor | PUT other user `{FullName}` | (Today) 200 `succeeded:true` — assertion fails |
| 1b | GREEN after fix | Same setup | PUT other user `{FullName}` | HTTP 200; envelope `succeeded:false`; ActionCode 404 |

#### Requirement: E2E-U2 — Partial Body Preserves Email and CellPhone (RED → GREEN)

Test `Update_partial_body_preserves_email_and_cellphone`: SuperAdmin → DIFFERENT user, body `{FullName}` only. Asserts HTTP 200 AND target's Email/CellPhone unchanged. Was RED before CH-U2 (silently nulled), GREEN after.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | RED before fix | Body omits email/cellPhone | PUT `{FullName}` | Email/CellPhone nulled — assertion fails |
| 2b | GREEN after fix | Same setup | PUT `{FullName}` | HTTP 200; Email/CellPhone unchanged |

#### Requirement: E2E-U3 — Empty String Clears CellPhone (RED → GREEN)

Test `Update_with_empty_cellphone_clears_value`: SuperAdmin → DIFFERENT user, body `{FullName, cellPhone: ""}`. Asserts HTTP 200 AND target CellPhone becomes null. (This test caught the D10 revert regression in Batch B.)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Clear applied | Target has non-null CellPhone | PUT `cellPhone: ""` | HTTP 200; CellPhone == null |

#### Requirement: E2E-U4 — Omitted IsActive Never Deactivates (RED → GREEN)

Two tests: (a) `Update_as_store_user_with_profile_keeps_own_is_active` — StoreUser+Profile → self, body `{FullName}` only → IsActive unchanged (added in Batch D to close the verify WARNING on the non-admin branch; body MUST include `isActive:false` so the admin-gate ignore branch is genuinely exercised); (b) `Update_omitting_isActive_preserves_active_state` — SuperAdmin → DIFFERENT user, body `{FullName}` only → IsActive unchanged. (b) was RED before CH-U4 (silently deactivated); both GREEN after.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Non-admin self | Active StoreUser+Profile edits self | PUT omits isActive | HTTP 200; IsActive still true |
| 4b | Admin target | Active target; SuperAdmin edits | PUT omits isActive | HTTP 200; IsActive still true (RED today: false) |

#### Requirement: E2E-U5 — Explicit isActive:false as Admin Deactivates

Test `Update_explicit_is_active_false_as_super_admin_deactivates`: SuperAdmin → DIFFERENT user, body `{FullName, isActive: false}`. Asserts HTTP 200 AND target IsActive == false — proves the D4 admin toggle still works.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Admin toggle | Active target | PUT `isActive: false` | HTTP 200; IsActive == false |

#### Requirement: E2E-U6 — Legit OwnerAdmin Edits Staff User → 200

Test `Update_owner_admin_edits_staff_returns_200`: OwnerAdmin actor → a DIFFERENT staff user (actor ≠ target), body `{FullName}`. Asserts HTTP 200 + envelope `succeeded:true` — proves the CH-U1 guard does not block legit admin edits. (Existing `Update_as_owner_admin_returns_200` targets self; this new test uses a distinct target.)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Admin legit path | OwnerAdmin actor; staff target ≠ actor | PUT `{FullName}` | HTTP 200; `succeeded:true` |

### MODIFIED Requirements

#### Requirement: E2E-U7 — Archive Alignment Resolved: users-e2e R3 Non-Existent Id → 400 + IDOR Row

(Resolved at ARCHIVE — implemented in this change; mirrors the GET change's E2E-G3 pattern.)

The main R3 row "Non-existent id | SuperAdmin | 404" contradicted the contract (400 via validator `ValidationException`) and the existing test `Update_nonexistent_id_returns_400` (asserts 400). At archive: (1) that row was aligned to 400; (2) an IDOR row was added ("Update other user as StoreUser+Profile → 200 + envelope ActionCode 404"). R3's "Update as StoreUser → 403" row refers to StoreUser WITHOUT the Profile feature (filter-level 403) — unchanged. See R3 table above.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | Contract holds | Non-existent id PUT | `Update_nonexistent_id_returns_400` runs | Returns 400 (unchanged) |
| 7b | Archive alignment | This change archived | users-e2e main spec updated | R3 "Non-existent id" row reads 400; IDOR row added |

### Verification Criteria

- [ ] 7 new tests FAIL on pre-fix code, PASS after fixes (E2E-U1 proves the IDOR the 403 test can't)
- [ ] All 6 existing `UsersUpdateTests` still pass (status-only assertions — D2/D4 change no asserted behavior)
- [ ] Regression: `dotnet test` — UsersListTests | UsersUpdateTests
- [x] Main users-e2e spec R3 row aligned to 400 + IDOR row added at archive (E2E-U7)

---

## Delta for users-e2e: UsersDeleteTests — 5 Rows (2 New, 1 Renamed, 2 Kept)

**Change**: `delete-user-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: E2E-D1 — Non-Existent Id Re-asserted to 404 (RED → GREEN)

`Delete_nonexistent_returns_400` MUST be renamed `Delete_nonexistent_returns_404` and MUST assert `NotFound` + `UserNotFound`. RED today (400 via validator rule VL-D1), GREEN after VL-D1 removal + CH-D3. (Final assertion form per house pattern: status code + envelope structure — `Succeeded == false`, `Errors.NotBeEmpty()`; no localized-text asserts — see verify Addendum.)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | RED before fix | `SeedSuperAdminAsync`; DELETE random Guid | Test executes | (Today) 400 BadRequest — assertion fails |
| 1b | GREEN after fix | Same setup | Test executes | HTTP 404 + `UserNotFound` |

### ADDED Requirements

#### Requirement: E2E-D2 — StoreUser with Users Feature → 403 (RED → GREEN)

New test `Delete_as_store_user_with_users_feature_returns_403`: actor via `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (passes the `[HasPermission(UsersAdmin)]` filter, hits the handler guard), target a seeded victim. MUST assert HTTP 403 + `DontHavePermission`. Cleanup: `CleanupStoreGraphAsync`. RED today (400 `UserNotFound` from handler), GREEN after CH-D1.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | RED before fix | StoreUser+Users actor; victim seeded | Test executes | (Today) 400 — assertion fails |
| 2b | GREEN after fix | Same setup | Test executes | HTTP 403 + `DontHavePermission` |

#### Requirement: E2E-D3 — Self-Delete as SuperAdmin → 400 (RED → GREEN)

New test `Delete_self_as_super_admin_returns_400`: SuperAdmin (`SeedSuperAdminAsync`) DELETEs own id. MUST assert HTTP 400 + `CannotDeleteSelf`. Cleanup: `CleanupUserAsync`. RED today (200 — self soft-delete), GREEN after CH-D2.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | RED before fix | SuperAdmin; own id | Test executes | (Today) 200 — assertion fails |
| 3b | GREEN after fix | Same setup | Test executes | HTTP 400 + `CannotDeleteSelf` |

#### Requirement: E2E-D4 — Pending Archive Alignment: users-e2e R4 (D6)

(Resolved at ARCHIVE — mirrors E2E-U7/E2E-G3 pattern; main spec MUST NOT change during this change.)

At archive the main spec R4 MUST: (1) ADD row "Delete self as SuperAdmin → 400"; (2) CLARIFY the existing "Delete as StoreUser → 403" row as feature-granted → handler-level 403 (CH-D1); (3) leave the "Non-existent id → 404" row UNCHANGED (already correct per D1).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Archive alignment | This change archived | users-e2e main spec updated | Self-delete row added; StoreUser row clarified; non-existent row stays 404 |

## Kept (no delta)

`Delete_as_super_admin_soft_deletes` (200, IsActive=false) and `Delete_without_token_returns_401` — unchanged behavior, remain GREEN.

### Verification Criteria

- [x] 5 tests in `UsersDeleteTests`: 2 new RED→GREEN (E2E-D2, E2E-D3), 1 renamed + re-asserted RED→GREEN (E2E-D1), 2 kept GREEN
- [x] Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersDeleteTests"` (Postgres `smca_test`) — **5/5 GREEN**
- [x] Regression: `UsersListTests | UsersUpdateTests` GREEN
- [x] Main users-e2e spec R4 aligned at archive (E2E-D4): self-delete row added, StoreUser row clarified, non-existent row stays 404

---

## Delta for users-e2e: UsersActivateTests — 4 Tests + Known-Bug Reversal

**Change**: `activate-user-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: E2E-A1 — IsActive=false Deactivates (RED → GREEN)

`Activate_sets_active_true_ignoring_request` (codifies the bug) MUST be replaced by `Activate_false_deactivates`: send `IsActive:false` → assert HTTP 200 AND DB `user.IsActive == false`. RED before fix (handler forces `true`), GREEN after CH-A2.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | RED before fix | Active target; body `IsActive:false` | Test executes | (Today) 200 IsActive=true — assertion fails |
| 1b | GREEN after fix | Same setup | Test executes | HTTP 200; DB IsActive == false |

### ADDED Requirements

#### Requirement: E2E-A2 — Activate True Happy Path

New test `Activate_true_activates`: target deactivated via `UserSeed.DeactivateUserAsync` (or seeded inactive); send `IsActive:true` → assert HTTP 200 AND DB `user.IsActive == true`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Activate | Inactive target; body `IsActive:true` | Test executes | HTTP 200; DB IsActive == true |

#### Requirement: E2E-A3 — Non-Existent Id Re-asserted to 404 (RED → GREEN)

`Activate_nonexistent_returns_400` MUST be renamed `Activate_nonexistent_returns_404` and MUST assert HTTP 404 + envelope (`Succeeded == false`, `Errors.NotBeEmpty()`). RED before fix (400 via validator VL-A1), GREEN after VL-A1 removal + CH-A3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | RED before fix | `SeedSuperAdminAsync`; activate random Guid | Test executes | (Today) 400 — assertion fails |
| 3b | GREEN after fix | Same setup | Test executes | HTTP 404; envelope `Succeeded == false` |

#### Requirement: E2E-A4 — StoreUser with Users Feature → 403 (RED → GREEN)

New test `Activate_as_store_user_with_users_feature_returns_403`: actor via `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (passes the `[HasPermission(UsersAdmin)]` filter → hits handler guard); victim via `DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin)`. Cleanup: `AuthzSeed.CleanupStoreGraphAsync` + `DbTestHelpers.CleanupUserAsync`. Assert HTTP 403 + envelope. RED before fix (400 `UserNotFound`), GREEN after CH-A1.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | RED before fix | StoreUser+Users actor; victim seeded | Test executes | (Today) 400 — assertion fails |
| 4b | GREEN after fix | Same setup | Test executes | HTTP 403; envelope `Succeeded == false` |

#### Requirement: E2E-A5 — Archive Alignment Resolved: users-e2e R5 + Known-Bug Reversal

(Resolved at ARCHIVE — mirrors E2E-D4/E2E-U7/E2E-G3 pattern; main spec MUST NOT change during apply.)

At archive the main spec was updated with all 5 edits: (1) line 20 Out-of-Scope note amended — "fixing the 3 known bugs" reversed for bug #1 (Activate ignores IsActive=false — FIXED by CH-A2) and the 400-guard bug (auth → 403 CH-A1; non-existent → 404 CH-A3); (2) R5 row "Deactivate with IsActive=false body → 200, IsActive=true (KNOWN BUG)" flipped to "200, IsActive=false"; (3) Known Bugs table row "Activate ignores IsActive=false" REMOVED (StoreName Guid row stays); (4) R5 row "Non-existent id | SuperAdmin | 404" ADDED; (5) R5 "Activate as StoreUser → 403" clarified as feature-granted → handler-level 403 (CH-A1).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Archive alignment | This change archived | users-e2e main spec updated | All 5 edits applied per above |

## Assert Style (all 4 tests)

Status code + envelope structure (`Succeeded == false`, `Errors.NotBeEmpty()`) ONLY. NEVER assert localized `Description` (culture coupling — delete-user Batch B regression).

### Verification Criteria

- [x] 4 tests in `UsersActivateTests`: 2 renamed/replaced RED→GREEN (A1, A3), 2 new (A2 GREEN, A4 RED→GREEN)
- [x] Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersActivateTests"` (Postgres `smca_test`) — **4/4 GREEN**
- [x] Regression: `UsersDeleteTests | UsersUpdateTests | UsersListTests` GREEN (32/32)
- [x] Main users-e2e spec R5 aligned at archive (E2E-A5): all 5 edits applied per above

---

## Delta for users-e2e: UsersRolesTests — 6 New Tests + Archive Alignment

**Change**: `user-roles-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: E2E-R1 — Non-Existent UserId → 400 (Contract Verify)

Test: SuperAdmin actor POSTs AddUserRoles with `UserId = Guid.NewGuid()` → HTTP 400 + envelope (`Succeeded == false`, `Errors.NotBeEmpty()`). GREEN today and after VL-R1 — guards the 400 contract.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Contract holds | SuperAdmin; random Guid UserId | POST AddUserRoles | HTTP 400; envelope failed |

#### Requirement: E2E-R2 — Non-Existent RoleId → 400 (RED → GREEN)

Test: SuperAdmin actor POSTs AddUserRoles with a non-existent RoleId (e.g. `999999`) → RED today (500 NRE `role.Name`), GREEN after CH-R4 → HTTP 400 + envelope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | RED before fix | SuperAdmin; RoleId not in DB | POST AddUserRoles | (Today) HTTP 500 — assertion fails |
| 2b | GREEN after fix | Same setup | POST AddUserRoles | HTTP 400; envelope failed |

#### Requirement: E2E-R3 — Duplicate RoleIds → 200, No Duplicate Row (RED → GREEN)

Test: SuperAdmin actor POSTs AddUserRoles with duplicate `RoleIds = [X, X]` → RED today (500 composite-PK conflict at SaveChanges), GREEN after CH-R2 → HTTP 200 AND exactly one UserRole row persisted for (target, X) (DB check via `ApplicationDbContext`, `IgnoreQueryFilters`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | RED before fix | SuperAdmin; duplicate RoleIds | POST AddUserRoles | (Today) HTTP 500 — assertion fails |
| 3b | GREEN after fix | Same setup | POST AddUserRoles | HTTP 200; single UserRole row for (target, X) |

#### Requirement: E2E-R4 — Both Actions Return 401 Without Token

Tests: POST AddUserRoles / DeleteUserRoles with NO Authorization header → HTTP 401 (one test per endpoint). (Main-spec R6/R7 401 rows are now TESTED — gap closed.)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | AddUserRoles 401 | Anonymous client | POST AddUserRoles | HTTP 401 |
| 4b | DeleteUserRoles 401 | Anonymous client | POST DeleteUserRoles | HTTP 401 |

#### Requirement: E2E-R5 — StoreUser Without UsersAdmin → 403

Test: actor via `AuthzSeed.SeedStoreUserAsync(_f)` (NO Users feature) POSTs AddUserRoles → HTTP 403 (filter-level `[HasPermission(UsersAdmin)]`, empty `ForbidResult` body — assert STATUS CODE ONLY). Cleanup: `AuthzSeed.CleanupStoreGraphAsync`. (Test was originally written with JSON envelope body asserts on the filter-level 403 and failed with `JsonException` — fixed in apply to status-code-only per sibling convention `UsersListTests`/`StoreRoleAccessTests`/`UsersUpdateTests`.)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Filter 403 | StoreUser w/o Users feature | POST AddUserRoles | HTTP 403 |

#### Requirement: E2E-R6 — Response Body Selected Reflects Added Role

Test: SuperAdmin actor adds ReSeller to a target; assert response `Data` contains item `Id == ((int)RoleType.ReSeller).ToString()` with `Selected == true` (boolean assert — culture-safe; no localized text).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Selected flag | Role added successfully | POST AddUserRoles; response read | `Data` item for ReSeller has `Selected == true` |

### MODIFIED Requirements

#### Requirement: E2E-R7 — Archive Alignment Resolved: users-e2e R6/R7 Rows

(Resolved at ARCHIVE — mirrors E2E-G3/E2E-U7/E2E-D4/E2E-A5 pattern.)

The main spec R6/R7 tables were updated at archive per this requirement: (1) R6 "Non-existent UserId → 404" aligned to **400** (validator `ExistsAsync`); (2) R6 "Invalid RoleId → 400 or 404" aligned to **400 (`RoleNotFound`)**; (3) R6 row ADDED **"Duplicate RoleIds → 200, no duplicate rows"**; (4) R7 "Remove from non-existent user → 404" aligned to **400** (ExistsAsync contract). R6/R7 auth rows (401/403) are now TESTED (E2E-R4/R5) and annotated accordingly.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | Contract holds | Non-existent UserId POST AddUserRoles | Test executes | 400 (behavior unchanged; spec row wrong) |
| 7b | Archive alignment | This change archived | users-e2e main spec updated | R6/R7 rows aligned + duplicate row added per above |

## Assert Style

Status code + envelope structure (`Succeeded == false`, `Errors.NotBeEmpty()`) ONLY for error cases. Never assert localized `Description` (culture coupling). Filter-level 403 (`ForbidResult`) → status-code-only assert. Body asserts limited to `Data.Selected` booleans (E2E-R6) and DB row-count checks (E2E-R3).

### Verification Criteria

- [x] 6 new tests; E2E-R2/R3/R6 RED→GREEN; R1/R4/R5 coverage/contract
- [x] All 4 existing `UsersRolesTests` still pass
- [x] Regression: `dotnet test` — UsersRolesTests | UsersListTests | UsersUpdateTests | UsersActivateTests | UsersDeleteTests — **47/47 GREEN** (verify re-run 2026-08-01)
- [x] Main users-e2e spec R6/R7 aligned at archive (E2E-R7): all 4 edits applied per above

---

## Delta for users-e2e: ChangePassword Contract Rewrite + Archive Alignment

**Change**: `change-password-endpoint-fixes`

### MODIFIED Requirements

#### Requirement: E2E-CPW1 — R8 "Non-Existent UserId → 404" Aligned to 400 (RESOLVED at ARCHIVE)

(Resolved at ARCHIVE — mirrors E2E-R7/E2E-U7 pattern; implemented in this change.)

The main `openspec/specs/users-e2e/spec.md` R8 row "Non-existent UserId | SuperAdmin | 404" contradicted the chosen contract (400 via validator `ExistsAsync`, decision D3 — UpdateUser precedent `Update_nonexistent_id_returns_400`). At archive the row reads **400** (validator). See R8 table above.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Contract holds | SuperAdmin; random Guid id in route | POST `change-password/{id}` | HTTP 400; envelope failed |
| 1b | Archive alignment | This change archived | users-e2e main spec updated | R8 non-existent row reads 400 |

#### Requirement: E2E-CPW2 — R8 "Wrong OldPassword → 400 or 403" Pinned to Real HTTP 400 (RESOLVED at ARCHIVE)

(Resolved at ARCHIVE — same archive step as E2E-CPW1.)

The R8 row "Change with wrong OldPassword | SuperAdmin | 400 or 403" reads **400** at archive. Product decision D2: the caller is already authenticated, so 401 is reserved for invalid credentials at the auth filter; a 200+envelope failure would make the React consumer (`change-password.tsx`) call `logout()` on any resolved response.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Contract holds | Authenticated user; wrong OldPassword | POST `change-password/{id}` | Real HTTP 400; envelope failed |
| 2b | Archive alignment | This change archived | users-e2e main spec updated | R8 wrong-OldPassword row reads 400 (not "400 or 403") |

### ADDED Requirements

#### Requirement: E2E-CPW3 — Self Change + Re-Login Proves the Password Actually Changed (RED → GREEN)

Rewrite `Change_own_password_returns_200` (today a false positive — asserts `StatusCode == OK` only): after a successful self change, re-login with the NEW password MUST return 200, and login with the OLD password MUST return 401. Assert real status codes + envelope structure; never localized `Description` (culture coupling).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | New password works | User changes own password | Re-login with new password | HTTP 200 |
| 3b | Old password dead | Password changed | Login with old password | HTTP 401 |
| 3c | RED before fix | Broken `HashPassword` compare in handler | Test executes | Old password still logs in → 3b fails |

#### Requirement: E2E-CPW4 — Wrong Old Password → Real HTTP 400 (RED → GREEN)

Authenticated actor POSTs `change-password/{id}` (self) with a wrong `oldPassword`. MUST assert HTTP 400 + envelope (`Succeeded == false`, `Errors.NotBeEmpty()`). RED today (200+envelope via `ErrorHandlerMiddleware`-untouched business failure), GREEN after CH-CPW2 + UC-CPW3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | RED before fix | Self; wrong oldPassword | POST `change-password/{id}` | (Today) HTTP 200 envelope-failed — assertion fails |
| 4b | GREEN after fix | Same setup | POST `change-password/{id}` | HTTP 400; envelope failed |

#### Requirement: E2E-CPW5 — Weak NewPassword → 400 via Validation Pipeline

New test: authenticated actor POSTs with a NewPassword that is `< 8` chars, and a second case with no uppercase letter → HTTP 400 + envelope (validation pipeline, `ValidationException`). Guards VL-CPW3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Too short | NewPassword = `"abc123"` (7 chars) | POST `change-password/{id}` | HTTP 400 |
| 5b | No uppercase | NewPassword = `"alllowercase123"` | POST `change-password/{id}` | HTTP 400 |

#### Requirement: E2E-CPW6 — Non-Existent Id → 400 (Validator `ExistsAsync`, Single Query)

SuperAdmin actor POSTs `change-password/{guid-new}` → HTTP 400 + envelope. Guards the D3 contract; the validator swap (VL-CPW1) MUST issue a single lightweight `ExistsAsync` — no full `GetByIdAsync` double-fetch.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Contract holds | SuperAdmin; random Guid in route | POST `change-password/{id}` | HTTP 400; envelope failed |

#### Requirement: E2E-CPW7 — Cross-Tenant OwnerAdmin Target → HTTP 404 (RED → GREEN)

New test: OwnerAdmin actor (ProfileAdmin feature) POSTs `change-password/{id}` where the target user's `TenantId` differs from the actor's tenant claim → HTTP 404 + envelope (anti-enumeration, decision D4). RED today (200 — cross-tenant reset succeeds via `FindAsync` filter-skip), GREEN after CH-CPW3 + UC-CPW3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | RED before fix | OwnerAdmin actor; victim in another tenant | POST `change-password/{victimId}` | (Today) HTTP 200 — assertion fails |
| 7b | GREEN after fix | Same setup | POST `change-password/{victimId}` | HTTP 404; envelope failed |

#### Requirement: E2E-CPW8 — Same-Tenant OwnerAdmin+ProfileAdmin Reset → 200

OwnerAdmin actor (ProfileAdmin) POSTs `change-password/{id}` for a DIFFERENT staff user in the SAME tenant (actor ≠ target) → HTTP 200 + `succeeded:true`. Proves the tenant-scope guard (CH-CPW3) does not block legit admin resets.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 8a | Admin legit path | OwnerAdmin actor; same-tenant staff target ≠ actor | POST `change-password/{id}` | HTTP 200; `succeeded:true` |

#### Requirement: E2E-CPW9 — StoreUser Without ProfileAdmin → 403 (Filter-Level)

StoreUser WITHOUT the Profile feature POSTs `change-password/{id}` (any target) → HTTP 403, filter-level `[HasPermission(ProfileAdmin)]` — assert STATUS CODE ONLY (`ForbidResult` has an empty body; sibling convention `UsersListTests`). Rewrites today's `Change_password_as_other_user_without_permission_returns_403` to the `{id}` route contract (body `UserId` no longer exists). Cleanup: `AuthzSeed.CleanupStoreGraphAsync`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 9a | Filter 403 | StoreUser w/o Profile feature | POST `change-password/{id}` | HTTP 403 |

#### Requirement: E2E-CPW10 — SuperAdmin Resets Another Tenant's User → 200

SuperAdmin actor POSTs `change-password/{id}` for a user in a DIFFERENT tenant → HTTP 200 + `succeeded:true`. Proves SuperAdmin bypasses the tenant-scope check (CH-CPW3).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 10a | SuperAdmin scope | SuperAdmin; cross-tenant target | POST `change-password/{id}` | HTTP 200; `succeeded:true` |

## Assert Style

Status code + envelope structure (`Succeeded == false`, `Errors.NotBeEmpty()`) ONLY for error cases. Never assert localized `Description`. Filter-level 403 → status-code-only assert. Re-login asserts (3a/3b) via the standard login endpoint.

### Verification Criteria

- [x] 2 existing tests rewritten to `{id}` route contract; 3a/3b re-login proves actual password change (kills the 200-false-positive)
- [x] RED→GREEN: E2E-CPW4 (400 real), E2E-CPW7 (404 cross-tenant)
- [x] Coverage/contract: E2E-CPW5 (weak → 400), E2E-CPW6 (nonexistent → 400), E2E-CPW8 (same-tenant admin 200), E2E-CPW9 (403 filter), E2E-CPW10 (SuperAdmin cross-tenant 200)
- [x] Regression: `dotnet test` — UsersChangePasswordTests | UsersListTests | UsersUpdateTests (Postgres `smca_test`) — 8/8 + 33/33 GREEN (apply evidence)
- [x] Main users-e2e spec R8 aligned at archive (E2E-CPW1 + E2E-CPW2): non-existent → 400, wrong-old pinned 400, route `{id}`
