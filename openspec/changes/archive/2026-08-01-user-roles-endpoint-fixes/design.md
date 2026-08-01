# Design: User Roles Endpoint Fixes

## Technical Approach

Mirror the sibling endpoint-fix changes (`update-user-endpoint-fixes` D6–D12): validators → lightweight `ExistsAsync`; handler → no user load + null-guard-free flow via `request.UserId`; N+1 killed with single batched queries on both sides (visibility via a repurposed int-keyed `GetRolesByIds`, user-roles via new `GetByUserIdAsync`); controller metadata per `DeleteUserAsync:78-82`. Additive-only edits; no git mutations; E2E proves RED→GREEN.

## Architecture Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Batched role-visibility query (spec open question) | **Repurpose dead stub**: `GetRolesByIds(HashSet<Guid>)` → `GetRolesByIds(HashSet<int>)`, implemented as `IgnoreQueryFilters().Where(r => roleIds.Contains(r.Id)).ToListAsync()` | Stub has ZERO callers (grep), is type-wrong (Role is `AuditableEntity<int>` — Role.cs:9), throws `NotImplementedException` (RoleRepository.cs:36-39). Reuse-impossible; new int-keyed method removes dead code. HashSet<int> matches sibling `GetActiveUserRolesByIds` (UserRoleRepository.cs:28). Role has NO query filter (RoleEntityTypeConfiguration); `IgnoreQueryFilters()` mirrors the 2 existing RoleRepository methods + current FindAsync behavior. Pure-SQL visibility predicate rejected: grant rules are actor-dependent (`IHttpContextService.IsSuperAdmin/IsOwnerAdmin`) and name-based (`ApplicationAdminRoleNameUtils`) — in-memory evaluation after one fetch is required to keep rules byte-identical (CH-R4). |
| D2 | VisibleRoleService shape | `AreVisibleRolesToCurrentUserAsync`: one fetch → `roles.ToDictionary(r => r.Id)` → per id `TryGetValue` → null ⇒ `return false` (CH-R4 null-guard); else evaluate the EXACT 3-branch rules (VisibleRoleService.cs:31-37) in a private `IsVisibleRoleToCurrentUser(Role? role)` | N+1 killed (1 query, CH-R5); rules read `role.Name` as today — byte-identical semantics; missing role → false → validator 400 `RoleNotFound` (VL-R3). Duplicate RoleIds idempotent via dictionary. |
| D3 | New repo method contract | `Task<IEnumerable<UserRole>> GetByUserIdAsync(Guid userId)` on `IUserRoleRepository`; impl `_userRoles.Where(ur => ur.UserId == userId).ToListAsync()` — **explicit Where, NOT FindAsync**, no `.Include`; returns ALL rows (active+inactive) | `FindAsync` (GenericRepository.cs:82-85) SKIPS the global tenant filter (UserRoleEntityTypeConfiguration.cs:20) → cross-tenant leak. Explicit `Where` respects it — same filtered rows the current deferred `Where(...)` re-queries return (behavior-preserving). Caller decides activation (RR-R1). Pattern: `GetActiveUserRolesByIds` (UserRoleRepository.cs:28-33). |
| D4 | Handler flow (CH-R1/R2/R3) | Drop `_userRepository` field+ctor; `var existing = (await _userRoleRepository.GetByUserIdAsync(request.UserId)).ToDictionary(ur => ur.RoleId);` `foreach (var roleId in request.RoleIds.Distinct())`: missing → `UserRole.Create(request.UserId, roleId, tenantId)` + `AddAsync`; present && inactive → `IsActive = true` (tracked mutation, **no `UpdateAsync`**); then `SaveChangesAsync` + mediator Send | No `user.Id` dereference (NRE root gone); `request.UserId` authoritative (validator owns 400 via ExistsAsync). Tracked mutation persists only changed columns — mirrors update-user D10 (`UpdateAsync` = full-column UPDATE). |
| D5 | Distinct placement | **Handler** — `request.RoleIds.Distinct()` at the foreach | Handler owns command semantics (CH-R1); validator stays duplicate-tolerant (VL-R3 3b passes) since batch fetch + dictionary handle dups idempotently. |
| D6 | Controller contract (UC-R1/R2) | Both actions: `[FromBody]` on command param + `[ProducesResponseType]` 400/401/403/404 + existing 200 (block mirrors `DeleteUserAsync:78-82`) | Matches `ActivateUserAsync:99` / `UpdatedAsync:66`; Swagger gap closed. 404 documents envelope-404 semantic per archived D12 precedent. URL casing `AddUserRoles`/`DeleteUserRoles` UNCHANGED (debt). |
| D7 | Query cleanup (CH-R6) | Drop `_userRepository` dep + user load; `GetActiveRoleIdsByUser(query.UserId)`; `role.Selected = activeRolesInUser.Contains(int.Parse(role.Id));`; direct `return ResponseResult.Success(listViewDtos);` | `ListViewDto.Id` is `string` (ListViewDto.cs:5) → int parse required for numeric compare; no NRE; no `Task.FromResult`. |

## Data Flow

```
POST /api/v1/users/AddUserRoles  [Authorize] → [HasPermission(UsersAdmin)]
 → Validator: ExistsAsync(userId,ct) [1 q] + AreVisibleRolesToCurrentUserAsync
     → GetRolesByIds(HashSet<int>) [1 q, IgnoreQueryFilters] → in-memory rules (null→false) [D1/D2]
 → Handler [D4]: GetByUserIdAsync(userId) [1 q] → foreach Distinct(roleIds)
     → Create(request.UserId,…) | reactivate (tracked)  → SaveChangesAsync → GetUserRolesByUserIdQuery
 → Query [D7]: GetActiveRoleIdsByUser(query.UserId) [1 q] → Selected via int.Contains → Success direct
```

## File Changes

| File | Action | Change |
|------|--------|--------|
| `backend/src/Domain/Interfaces/Repositories/IRoleRepository.cs` | Modify | Line 10: `GetRolesByIds(HashSet<Guid>)` → `GetRolesByIds(HashSet<int>)` |
| `backend/src/Infrastructure/Persistence/Repositories/RoleRepository.cs` | Modify | Lines 36-39: implement batch (`IgnoreQueryFilters().Where(r => roleIds.Contains(r.Id)).ToListAsync()`) |
| `backend/src/Application/Services/Roles/VisibleRoleService.cs` | Modify | Batch fetch + dictionary; null-guard → false; rules :31-37 preserved verbatim (D1/D2) |
| `backend/src/Domain/Interfaces/Repositories/IUserRoleRepository.cs` | Modify | Add `Task<IEnumerable<UserRole>> GetByUserIdAsync(Guid userId)` |
| `backend/src/Infrastructure/Persistence/Repositories/UserRoleRepository.cs` | Modify | Implement `GetByUserIdAsync` (explicit Where → ToListAsync; no FindAsync/Include) |
| `.../Commands/AddUserRoles/AddUserRolesCommand.cs` | Modify | Handler: drop `_userRepository`; `request.UserId`; `.Distinct()`; materialized lookup; tracked reactivation (D4/D5) |
| `.../Commands/AddUserRoles/AddUserRolesCommandValidator.cs` | Modify | `UserExists` → `_userRepository.ExistsAsync(userId, cancellationToken)` (UserRepository.cs:99-102) |
| `.../Commands/DeleteUserRoles/DeleteUserRolesCommandValidator.cs` | Modify | Same ExistsAsync swap (VL-R2); batch handler untouched |
| `.../Queries/GetUserRolesByUserId/GetUserRolesByUserIdQuery.cs` | Modify | CH-R6 cleanup (D7) |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modify | Lines 108-114 & 120-126: `[FromBody]` + ProducesResponseType 400/401/403/404 (D6) |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersRolesTests.cs` | Modify | +6 tests (below) |

## Testing Strategy (E2E — no unit tests, mirrors sibling changes)

Setup/assert conventions per archived design: `DbTestHelpers.SeedSuperAdminAsync` / `SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser)` / `AuthedClient`; envelope asserts `Succeeded == false` + `Errors.NotBeEmpty()`; DB checks via `ApplicationDbContext` + `IgnoreQueryFilters`; `AuthzSeed.SeedStoreUserAsync(_f)` + `AuthzSeed.CleanupStoreGraphAsync` for 403. Never assert localized `Description`; body asserts limited to `Data.Selected` booleans.

| # | Test | RED→GREEN | Asserts |
|---|------|-----------|---------|
| 1 | `Add_roles_with_nonexistent_user_returns_400` | GREEN today (contract guard) | POST random-Guid UserId → 400 + envelope failed |
| 2 | `Add_roles_with_nonexistent_role_id_returns_400` | **RED** (today 500 NRE `role.Name`) | POST RoleId `999999` → 400 + envelope failed |
| 3 | `Add_roles_with_duplicate_role_ids_returns_200_single_row` | **RED** (today 500 PK conflict) | POST `[X,X]` → 200; DB: exactly 1 UserRole row for (target, X) |
| 4 | `Add_roles_without_token_returns_401` | GREEN (untested contract) | No auth header → 401 |
| 5 | `Delete_roles_without_token_returns_401` | GREEN (untested contract) | No auth header → 401 |
| 6 | `Add_roles_as_store_user_without_users_admin_returns_403` | GREEN (filter contract) | StoreUser w/o Users feature → 403 |
| 7 | `Add_roles_response_selected_true_for_added_role` | **RED** (today 500 on NRE path w/ fresh target) | Body `Data` item `Id == ((int)RoleType.ReSeller).ToString()` has `Selected == true` |

Regression: existing 4 `UsersRolesTests` unchanged; run `dotnet test` — UsersRolesTests | UsersListTests | UsersUpdateTests.

## Migration / Rollout

No migration, no feature flags. Per-file additive revert per proposal Rollback Plan. `GetRolesByIds`/`GetByUserIdAsync` are additive contract changes (stub had no callers).

## Contracts / Spec Alignment

Archive-time only (not this change): main `users-e2e` spec R6/R7 404-rows → 400 alignment + duplicate-role row (E2E-R7).

## Open Questions

None blocking. Note: proposal says "6 E2E" — plan above lists 7 test methods because E2E-R4 covers both endpoints as two methods (matches spec E2E-R4 4a/4b; count is per spec row, not proposal prose).
