# Delta for users-e2e: UsersActivateTests — 4 Tests + Known-Bug Reversal

**Domain**: `users-e2e` — `UsersActivateTests.cs` + main spec R5
**Change**: `activate-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## MODIFIED Requirements

### Requirement: E2E-A1 — IsActive=false Deactivates (RED → GREEN)

`Activate_sets_active_true_ignoring_request` (codifies the bug) MUST be replaced by `Activate_false_deactivates`: send `IsActive:false` → assert HTTP 200 AND DB `user.IsActive == false`. RED today (handler forces `true`), GREEN after CH-A2.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | RED before fix | Active target; body `IsActive:false` | Test executes | (Today) 200 IsActive=true — assertion fails |
| 1b | GREEN after fix | Same setup | Test executes | HTTP 200; DB IsActive == false |

## ADDED Requirements

### Requirement: E2E-A2 — Activate True Happy Path

New test `Activate_true_activates`: target deactivated via `UserSeed.DeactivateUserAsync` (or seeded inactive); send `IsActive:true` → assert HTTP 200 AND DB `user.IsActive == true`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Activate | Inactive target; body `IsActive:true` | Test executes | HTTP 200; DB IsActive == true |

### Requirement: E2E-A3 — Non-Existent Id Re-asserted to 404 (RED → GREEN)

`Activate_nonexistent_returns_400` MUST be renamed `Activate_nonexistent_returns_404` and MUST assert HTTP 404 + envelope (`Succeeded == false`, `Errors.NotBeEmpty()`). RED today (400 via validator VL-A1), GREEN after VL-A1 removal + CH-A3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | RED before fix | `SeedSuperAdminAsync`; activate random Guid | Test executes | (Today) 400 — assertion fails |
| 3b | GREEN after fix | Same setup | Test executes | HTTP 404; envelope `Succeeded == false` |

### Requirement: E2E-A4 — StoreUser with Users Feature → 403 (RED → GREEN)

New test `Activate_as_store_user_with_users_feature_returns_403`: actor via `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (passes the `[HasPermission(UsersAdmin)]` filter → hits handler guard); victim via `DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin)`. Cleanup: `AuthzSeed.CleanupStoreGraphAsync` + `DbTestHelpers.CleanupUserAsync`. Assert HTTP 403 + envelope. RED today (400 `UserNotFound`), GREEN after CH-A1.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | RED before fix | StoreUser+Users actor; victim seeded | Test executes | (Today) 400 — assertion fails |
| 4b | GREEN after fix | Same setup | Test executes | HTTP 403; envelope `Succeeded == false` |

### Requirement: E2E-A5 — Pending Archive Alignment: R5 + Known-Bug Reversal

(Resolved at ARCHIVE — mirrors E2E-D4/E2E-U7 pattern; main spec MUST NOT change during this change.)

At archive the main spec MUST: (1) amend line 20 Out-of-Scope — "fixing the 3 known bugs" reversed for bug #1 (Activate ignores IsActive=false — now FIXED by CH-A2) and the 400-guard bug (auth → 403 CH-A1; non-existent → 404 CH-A3); (2) flip R5 row "Deactivate with IsActive=false body → 200, IsActive=true (KNOWN BUG)" to "200, IsActive=false"; (3) REMOVE the Known Bugs table row "Activate ignores IsActive=false" (line 163; StoreName Guid row stays); (4) ADD R5 row "Non-existent id | SuperAdmin | 404"; (5) clarify R5 "Activate as StoreUser → 403" as feature-granted → handler-level 403 (CH-A1).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Archive alignment | This change archived | users-e2e main spec updated | All 5 edits applied per above |

## Assert Style (all 4 tests)

Status code + envelope structure (`Succeeded == false`, `Errors.NotBeEmpty()`) ONLY. NEVER assert localized `Description` (culture coupling — delete-user Batch B regression).

## Verification Criteria

- [ ] 4 tests in `UsersActivateTests`: 2 renamed/replaced RED→GREEN (A1, A3), 2 new (A2 GREEN, A4 RED→GREEN)
- [ ] Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersActivateTests"` (Postgres `smca_test`)
- [ ] Regression: `UsersDeleteTests | UsersUpdateTests | UsersListTests` GREEN
