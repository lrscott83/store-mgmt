# Delta for users-e2e: UsersDeleteTests — 5 Rows (2 New, 1 Renamed, 2 Kept)

**Domain**: `users-e2e` — `UsersDeleteTests.cs`
**Change**: `delete-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## MODIFIED Requirements

### Requirement: E2E-D1 — Non-Existent Id Re-asserted to 404 (RED → GREEN)

`Delete_nonexistent_returns_400` MUST be renamed `Delete_nonexistent_returns_404` and MUST assert `NotFound` + `UserNotFound`. RED today (400 via validator rule VL-D1), GREEN after VL-D1 removal + CH-D3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | RED before fix | `SeedSuperAdminAsync`; DELETE random Guid | Test executes | (Today) 400 BadRequest — assertion fails |
| 1b | GREEN after fix | Same setup | Test executes | HTTP 404 + `UserNotFound` |

## ADDED Requirements

### Requirement: E2E-D2 — StoreUser with Users Feature → 403 (RED → GREEN)

New test `Delete_as_store_user_with_users_feature_returns_403`: actor via `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (passes the `[HasPermission(UsersAdmin)]` filter, hits the handler guard), target a seeded victim. MUST assert HTTP 403 + `DontHavePermission`. Cleanup: `CleanupStoreGraphAsync`. RED today (400 `UserNotFound` from handler), GREEN after CH-D1.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | RED before fix | StoreUser+Users actor; victim seeded | Test executes | (Today) 400 — assertion fails |
| 2b | GREEN after fix | Same setup | Test executes | HTTP 403 + `DontHavePermission` |

### Requirement: E2E-D3 — Self-Delete as SuperAdmin → 400 (RED → GREEN)

New test `Delete_self_as_super_admin_returns_400`: SuperAdmin (`SeedSuperAdminAsync`) DELETEs own id. MUST assert HTTP 400 + `CannotDeleteSelf`. Cleanup: `CleanupUserAsync`. RED today (200 — self soft-delete), GREEN after CH-D2.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | RED before fix | SuperAdmin; own id | Test executes | (Today) 200 — assertion fails |
| 3b | GREEN after fix | Same setup | Test executes | HTTP 400 + `CannotDeleteSelf` |

### Requirement: E2E-D4 — Pending Archive Alignment: users-e2e R4 (D6)

(Resolved at ARCHIVE — mirrors E2E-U7/E2E-G3 pattern; main spec MUST NOT change during this change.)

At archive the main spec R4 MUST: (1) ADD row "Delete self as SuperAdmin → 400"; (2) CLARIFY the existing "Delete as StoreUser → 403" row as feature-granted → handler-level 403 (CH-D1); (3) leave the "Non-existent id → 404" row UNCHANGED (already correct per D1).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Archive alignment | This change archived | users-e2e main spec updated | Self-delete row added; StoreUser row clarified; non-existent row stays 404 |

## Kept (no delta)

`Delete_as_super_admin_soft_deletes` (200, IsActive=false) and `Delete_without_token_returns_401` — unchanged behavior, remain GREEN.

## Verification Criteria

- [ ] 5 tests in `UsersDeleteTests`: 2 new RED→GREEN (E2E-D2, E2E-D3), 1 renamed + re-asserted RED→GREEN (E2E-D1), 2 kept GREEN
- [ ] Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersDeleteTests"` (Postgres `smca_test`)
- [ ] Regression: `UsersListTests | UsersUpdateTests` GREEN
- [ ] Main users-e2e spec untouched during this change (R4 alignment deferred to archive)
