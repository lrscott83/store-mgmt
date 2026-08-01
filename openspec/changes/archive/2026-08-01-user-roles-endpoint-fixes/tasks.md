# Tasks: User Roles Endpoint Fixes

**Change**: `user-roles-endpoint-fixes` — `POST /api/v1/users/AddUserRoles` + `DeleteUserRoles` (UsersController.cs:108-126)
**Sequence**: RED→GREEN; mirror archived `2026-07-31-update-user-endpoint-fixes`. **NO GIT COMMITS** — dirty tree untouched; gates are build/test only.

## Phase 1: Repository Contracts + Implementations (group A)

- [ ] 1.1 `backend/src/Domain/Interfaces/Repositories/IRoleRepository.cs` line 10: `GetRolesByIds(HashSet<Guid>)` → `GetRolesByIds(HashSet<int>)` (D1; zero callers verified)
- [ ] 1.2 `backend/src/Infrastructure/Persistence/Repositories/RoleRepository.cs` lines 36-39: replace `NotImplementedException` with `_roles.IgnoreQueryFilters().Where(r => roleIds.Contains(r.Id)).ToListAsync()` (D1)
- [ ] 1.3 `backend/src/Domain/Interfaces/Repositories/IUserRoleRepository.cs`: add `Task<IEnumerable<UserRole>> GetByUserIdAsync(Guid userId)` (D3)
- [ ] 1.4 `backend/src/Infrastructure/Persistence/Repositories/UserRoleRepository.cs`: implement `GetByUserIdAsync` = `_userRoles.Where(ur => ur.UserId == userId).ToListAsync()` — explicit Where (respects tenant filter), NO FindAsync/Include; returns active+inactive rows (D3; pattern `GetActiveUserRolesByIds`:28-33)

## Phase 2: Application Layer (groups B–E)

- [ ] 2.1 `backend/src/Application/Services/Roles/VisibleRoleService.cs`: batch fetch `GetRolesByIds(roleIds.ToHashSet())` → `ToDictionary(r => r.Id)`; per-id `TryGetValue`, missing → `return false` (CH-R4 null-guard); 3-branch rules (:31-37) moved verbatim to private `IsVisibleRoleToCurrentUser(Role? role)` (D2; kills per-role N+1)
- [ ] 2.2 `backend/src/Application/Features/UserManagement/Users/Commands/AddUserRoles/AddUserRolesCommand.cs` handler: drop `_userRepository` field+ctor + user load (:40); `UserRole.Create(request.UserId, roleId, tenantId)` (:48); `foreach (request.RoleIds.Distinct())` (D5); one `GetByUserIdAsync` → `ToDictionary(ur => ur.RoleId)`; present+inactive → `IsActive = true` (tracked, NO `UpdateAsync`); keep SaveChangesAsync + Send (D4)
- [ ] 2.3 `.../Commands/AddUserRoles/AddUserRolesCommandValidator.cs` :32-33: `UserExists` → `_userRepository.ExistsAsync(userId, cancellationToken)` (VL-R1; visibility rule + deps preserved)
- [ ] 2.4 `.../Commands/DeleteUserRoles/DeleteUserRolesCommandValidator.cs` :28-29: same `GetByIdAsync` → `ExistsAsync` swap (VL-R2); handler + RoleIds rules untouched
- [ ] 2.5 `.../Queries/GetUserRolesByUserId/GetUserRolesByUserIdQuery.cs`: drop `_userRepository` dep + user load (:42,:47); `GetActiveRoleIdsByUser(query.UserId)`; `role.Selected = activeRolesInUser.Contains(int.Parse(role.Id))` (:49 int compare); direct `return ResponseResult.Success(listViewDtos)` — no `Task.FromResult` (:50) (D7; no load ⇒ no NRE; empty user → 200 all-false)

## Phase 3: Controller Metadata (group F)

- [ ] 3.1 `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` :108-114 + :120-126: `[FromBody]` on both command params; add `[ProducesResponseType]` 400/401/403/404 after existing 200 (D6; mirror `ActivateUserAsync`:90-99). URL casing UNCHANGED

## Phase 4: E2E Tests + Verify (group G)

- [ ] 4.1 `backend/src/SMCA.WebApi.E2ETests/Users/UsersRolesTests.cs`: add 7 tests; existing 4 unchanged (seeds `SeedSuperAdminAsync`/`SeedUserWithRoleAsync`/`AuthedClient`; error envelope asserts `Succeeded==false`+`Errors.NotBeEmpty()`; DB via `ApplicationDbContext`+`IgnoreQueryFilters`; 403 via `AuthzSeed.SeedStoreUserAsync`+`CleanupStoreGraphAsync`; never assert localized `Description`)
  - GREEN: `Add_roles_with_nonexistent_user_returns_400` (E2E-R1); `Add_roles_without_token_returns_401` (R4a); `Delete_roles_without_token_returns_401` (R4b); `Add_roles_as_store_user_without_users_admin_returns_403` (R5)
  - RED→GREEN: `Add_roles_with_nonexistent_role_id_returns_400` — RoleId `999999` → 400 (today 500 NRE) (R2); `Add_roles_with_duplicate_role_ids_returns_200_single_row` — `[X,X]` → 200, exactly 1 UserRole row (R3); `Add_roles_response_selected_true_for_added_role` — Data `Id==((int)RoleType.ReSeller).ToString()` has `Selected==true` (R6)
- [ ] 4.2 Define verify commands (DO NOT run during apply unless instructed): `dotnet build` solution → 0 errors; `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersRolesTests"` → 7 new + 4 existing GREEN; regression `--filter "FullyQualifiedName~UsersRolesTests|UsersListTests|UsersUpdateTests"`; needs Postgres `smca_test` up
