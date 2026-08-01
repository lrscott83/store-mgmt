# Delta for users-e2e: UsersRolesTests — 6 New Tests + Archive Alignment

**Domain**: `users-e2e` — `UsersRolesTests.cs` (4 existing tests)
**Change**: `user-roles-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-01

---

## ADDED Requirements

### Requirement: E2E-R1 — Non-Existent UserId → 400 (Contract Verify)

Test: SuperAdmin actor POSTs AddUserRoles with `UserId = Guid.NewGuid()` → HTTP 400 + envelope (`Succeeded == false`, `Errors.NotBeEmpty()`). GREEN today and after VL-R1 — guards the 400 contract.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Contract holds | SuperAdmin; random Guid UserId | POST AddUserRoles | HTTP 400; envelope failed |

### Requirement: E2E-R2 — Non-Existent RoleId → 400 (RED → GREEN)

Test: SuperAdmin actor POSTs AddUserRoles with a non-existent RoleId (e.g. `999999`) → RED today (500 NRE `role.Name`), GREEN after CH-R4 → HTTP 400 + envelope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | RED before fix | SuperAdmin; RoleId not in DB | POST AddUserRoles | (Today) HTTP 500 — assertion fails |
| 2b | GREEN after fix | Same setup | POST AddUserRoles | HTTP 400; envelope failed |

### Requirement: E2E-R3 — Duplicate RoleIds → 200, No Duplicate Row (RED → GREEN)

Test: SuperAdmin actor POSTs AddUserRoles with duplicate `RoleIds = [X, X]` → RED today (500 composite-PK conflict at SaveChanges), GREEN after CH-R2 → HTTP 200 AND exactly one UserRole row persisted for (target, X) (DB check via `ApplicationDbContext`, `IgnoreQueryFilters`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | RED before fix | SuperAdmin; duplicate RoleIds | POST AddUserRoles | (Today) HTTP 500 — assertion fails |
| 3b | GREEN after fix | Same setup | POST AddUserRoles | HTTP 200; single UserRole row for (target, X) |

### Requirement: E2E-R4 — Both Actions Return 401 Without Token

Tests: POST AddUserRoles / DeleteUserRoles with NO Authorization header → HTTP 401 (one test per endpoint). (Main-spec R6/R7 401 rows are currently UNTESTED — this closes the gap.)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | AddUserRoles 401 | Anonymous client | POST AddUserRoles | HTTP 401 |
| 4b | DeleteUserRoles 401 | Anonymous client | POST DeleteUserRoles | HTTP 401 |

### Requirement: E2E-R5 — StoreUser Without UsersAdmin → 403

Test: actor via `AuthzSeed.SeedStoreUserAsync(_f)` (NO Users feature) POSTs AddUserRoles → HTTP 403 (filter-level `[HasPermission(UsersAdmin)]`). Cleanup: `AuthzSeed.CleanupStoreGraphAsync`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Filter 403 | StoreUser w/o Users feature | POST AddUserRoles | HTTP 403 |

### Requirement: E2E-R6 — Response Body Selected Reflects Added Role

Test: SuperAdmin actor adds ReSeller to a target; assert response `Data` contains item `Id == ((int)RoleType.ReSeller).ToString()` with `Selected == true` (boolean assert — culture-safe; no localized text).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Selected flag | Role added successfully | POST AddUserRoles; response read | `Data` item for ReSeller has `Selected == true` |

## MODIFIED Requirements

### Requirement: E2E-R7 — Pending Archive Alignment: users-e2e R6/R7 Rows

(Pending at ARCHIVE — mirrors E2E-G3/E2E-U7; main spec MUST NOT change during this change.)

At archive the main spec MUST: (1) R6 "Non-existent UserId → 404" aligned to 400; (2) R6 "Invalid RoleId → 400 or 404" aligned to 400 (`RoleNotFound`); (3) R6 row ADDED "Duplicate RoleIds → 200, no duplicate rows"; (4) R7 "Remove from non-existent user → 404" aligned to 400 (ExistsAsync contract). R6/R7 auth rows (401/403) become TESTED (E2E-R4/R5).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | Contract holds | Non-existent UserId POST AddUserRoles | Test executes | 400 (behavior unchanged; spec row wrong) |
| 7b | Archive alignment | This change archived | users-e2e main spec updated | R6/R7 rows aligned + duplicate row added per above |

## Assert Style

Status code + envelope structure (`Succeeded == false`, `Errors.NotBeEmpty()`) ONLY for error cases. Never assert localized `Description` (culture coupling). Body asserts limited to `Data.Selected` booleans (E2E-R6) and DB row-count checks (E2E-R3).

## Verification Criteria

- [ ] 6 new tests; E2E-R2/R3 RED→GREEN; R1/R4/R5/R6 coverage/contract
- [ ] All 4 existing `UsersRolesTests` still pass
- [ ] Regression: `dotnet test` — UsersRolesTests | UsersListTests | UsersUpdateTests
- [ ] Main users-e2e spec R6/R7 alignment deferred to archive (E2E-R7)
