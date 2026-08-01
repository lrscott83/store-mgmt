# Delta for command-handler: AddUserRoles Handler + GetUserRolesByUserId Query + VisibleRoleService

**Domain**: `command-handler` — `AddUserRolesCommand.cs`, `GetUserRolesByUserIdQuery.cs`, `VisibleRoleService.cs`
**Change**: `user-roles-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-01

---

## ADDED Requirements

### Requirement: CH-R1 — AddUserRoles Handler Uses request.UserId, No User Load

The handler MUST NOT load the User entity (no `_userRepository.GetByIdAsync`); `UserRole.Create` MUST use `request.UserId`. User-existence is guaranteed by the validator (VL-R1 → 400); dropping the load eliminates the `user.Id` NRE at the root and removes one DB query per request. If `IUserRepository` becomes unused in the handler, the dependency MUST be removed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | No user query | Any AddUserRoles request | Handler executes | Zero User repository queries; `request.UserId` used for creation |
| 1b | No NRE path | User deleted mid-request (race) | Handler executes | No `user.Id` dereference exists — no 500 |

### Requirement: CH-R2 — Duplicate RoleIds Deduplicated

The handler MUST process `request.RoleIds` deduplicated (`.Distinct()`). Duplicate RoleIds MUST NOT create duplicate `UserRole` rows (composite-PK conflict → 500 today); the response MUST be 200 with no duplicate rows.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Duplicates | `RoleIds = [5, 5]` | Handler processes | One row created; `SaveChangesAsync` succeeds; 200 |
| 2b | Idempotent repeat | Role already active, repeated in batch | Handler processes | No duplicate row; still 200 |

### Requirement: CH-R3 — Single Materialized User-Role Lookup (N+1 Killed)

The handler MUST load the user's existing `UserRole` rows ONCE via the new `IUserRoleRepository.GetByUserIdAsync(request.UserId)` (RR-R1) and resolve per-role state in memory. Zero repository queries inside the `foreach` over `RoleIds`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Single batch query | N role IDs; M existing rows | Handler processes | Exactly 1 roles query; per-role state from in-memory lookup |
| 3b | Role already active | Existing row found in batch | Handler processes | Row reactivated (`IsActive = true`) via in-memory match |

### Requirement: CH-R4 — VisibleRoleService Null-Guard Returns False

`IsVisibleRoleToCurrentUser` MUST return `false` when the role fetch yields null (non-existent roleId) — never dereference `role.Name` (500 today). The grant rules MUST be preserved exactly: ordinary role visible iff `role.IsActive`; SuperAdmin role visible only to a super-admin actor; OwnerAdmin role visible to a super-admin actor or an owner-admin actor with the role active.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Null role | Non-existent roleId | Visibility check | Returns false → validation 400 `RoleNotFound` (VL-R3) |
| 4b | Ordinary role | Active / inactive role | Visibility check | Visible iff `role.IsActive` (unchanged) |
| 4c | SuperAdmin role | SuperAdmin / non-super actor | Visibility check | Visible only to super-admin actor (unchanged) |
| 4d | OwnerAdmin role | OwnerAdmin / other actor | Visibility check | Visible to super-admin or active owner-admin (unchanged) |

### Requirement: CH-R5 — VisibleRoleService Single Batched Query

`AreVisibleRolesToCurrentUserAsync` MUST issue ONE query for the whole `RoleIds` batch; zero per-role `GetByIdAsync` calls.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Batch query | N role IDs | `AreVisibleRolesToCurrentUserAsync` runs | 1 query; N in-memory rule evaluations |

### Requirement: CH-R6 — GetUserRolesByUserId Query Cleanup

The query handler MUST NOT load the User entity (no `GetByIdAsync`; use `query.UserId` for `GetActiveRoleIdsByUser` — no NRE), MUST return the result directly (no redundant `Task.FromResult`), and MUST set `Selected` by numeric id comparison (`activeRoleIds.Contains(roleId)`), not string comparison (`r.ToString() == role.Id`). Unused dependencies MUST be removed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | No user load | Any query | Handler executes | Zero User repository queries; no NRE |
| 6b | Selected correct | User has role X | Handler maps | `Selected == true` for role X via int compare |
| 6c | Sync return | Any query | Handler returns | Direct `ResponseResult.Success(...)` — no `Task.FromResult` |

## Verification Criteria

- [ ] Handler: zero User queries; `request.UserId` in `UserRole.Create`; `.Distinct()`; single roles query (RR-R1)
- [ ] VisibleRoleService: null-guard → false; single batch query; grant rules byte-identical
- [ ] Query handler: no user load; no `Task.FromResult`; `Selected` int compare
- [ ] No 500 on: deleted-user race, non-existent RoleId, duplicate RoleIds
