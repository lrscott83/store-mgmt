# Tasks: UpdateUser Endpoint Fixes

**Change**: `update-user-endpoint-fixes` — `PUT /api/v1/users/{id}` (`UsersController.UpdatedAsync`)
**Sequence**: RED→GREEN. Batch A (source fixes + E2E tests 1–4 written RED) → Batch B (run to GREEN) → Batch C (E2E tests 5–6 + full suite). **NO GIT COMMITS** — user forbade them; batch boundaries verified via build+test, not commits.

## Phase 1: Batch A — Handler, Validator, Controller, E2E RED

- [x] 1.1 `backend/src/Application/Features/UserManagement/Users/Commands/UpdateUser/UpdateUserCommand.cs` line 20: `bool IsActive` → `bool? IsActive`
- [x] 1.2 Same file handler: `User? user = await _userRepository.GetByIdAsync(request.Id);` + null guard `if (user is null) return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);` (D9, BEFORE ownership guard); D1 IDOR guard `if (request.Id != UserExternalId.ToGuid() && !IsSuperAdminOrOwnerAdmin) return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);` (mirror `UpdateUserPasswordCommand.cs:49-56`); D2 tri-state `if (request.CellPhone is not null) user.CellPhone = request.CellPhone == "" ? null : request.CellPhone;` (same for Email); FullName always assigned; D4 `if (_httpContextService.IsSuperAdminOrOwnerAdmin && request.IsActive.HasValue) user.IsActive = request.IsActive.Value;`; DELETE `await _userRepository.UpdateAsync(user);` (D10 — FindAsync tracks; keep own `SaveChangesAsync`); forward CancellationToken
- [x] 1.3 `.../UpdateUser/UpdateUserCommandValidator.cs`: rename `tenantId`→`userId`; `UserExists` body → `return await _userRepository.ExistsAsync(userId, cancellationToken);` (D11)
- [x] 1.4 `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` `UpdatedAsync`: `[FromRoute] Guid id` + `[ProducesResponseType(StatusCodes.Status400BadRequest)]` / `Status401Unauthorized` / `Status403Forbidden` / `Status404NotFound` after existing 200 (D12 — exact block in design.md)
- [x] 1.5 `backend/src/SMCA.WebApi.E2ETests/Users/UsersUpdateTests.cs`: add E2E tests 1–4 (table below), RED on pre-fix code
- [x] 1.6 Build gate: `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj` — 0 errors

## Phase 2: Batch B — Run to GREEN

- [x] 2.1 `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersUpdateTests"` → tests 1–4 GREEN; existing 6 still pass (`Update_as_super_admin_returns_200` partial `{FullName}` must hold under D2/D4)
- [x] 2.2 Iterate fixes until GREEN (no commit) — D10 reverted (NoTracking context): restored `UpdateAsync` in handler; 10/10 GREEN x2 runs

## Phase 3: Batch C — Remaining E2E + Full Suite

- [x] 3.1 Add E2E tests 5–6 (table below)
- [x] 3.2 Run UsersUpdateTests filter → 12/12 pass (6 new + 6 existing)
- [x] 3.3 Regression: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersListTests|FullyQualifiedName~UsersUpdateTests"` — 26/26 pass (12 Update + 8 UsersList + 6 StoreUsersList)

## Phase 4: Archive-Time Flags (NOT this change)

- [ ] 4.1 At archive, `openspec/specs/users-e2e/spec.md` R3: align "Non-existent id → 404" row to 400; add IDOR row "Update other user as StoreUser+Profile → 200 + envelope ActionCode 404"; no-feature StoreUser→403 row unchanged (E2E-U7)
- [ ] 4.2 At archive, repository spec: document `ExistsAsync(Guid id, CancellationToken ct = default)` token param (RR-U1 gap; zero new methods)

### E2E tests (exact names — all in `UsersUpdateTests.cs`)

Seed/assert helpers: `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Profile)` (grants Profile), `DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123")`, `UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser)` (CellPhone "0000000000", Email=login), `UserSeed.SeedOwnerAdminWithStoreAsync(_f)`, `DbTestHelpers.AuthedClient(_f, userId, login)`, `DbTestHelpers.GetUserByLoginAsync(_f, login)`; cleanup `AuthzSeed.CleanupStoreGraphAsync` + `DbTestHelpers.CleanupUserAsync`. Envelope assert pattern `AuthMeFailureTests.cs:31-36`.

1. `Update_other_user_as_store_user_with_profile_feature_returns_envelope_404` — StoreUser+Profile actor; target = other seeded user; PUT `{FullName="Hacker"}` → HTTP 200 + `Succeeded=false` + `ActionCode==404` + Errors contains "User.NotFound"
2. `Update_partial_body_preserves_email_and_cellphone` — SuperAdmin → target; PUT `{FullName="Renamed"}` → 200; DB Email==login, CellPhone=="0000000000"
3. `Update_with_empty_cellphone_clears_value` — SuperAdmin → target; PUT `{FullName="Renamed", CellPhone=""}` → 200; DB CellPhone null
4. `Update_omitting_isActive_preserves_active_state` — SuperAdmin → target; PUT `{FullName="Renamed"}` (no isActive) → 200; DB IsActive true
5. `Update_explicit_is_active_false_as_super_admin_deactivates` — SuperAdmin → target; PUT `{FullName="Renamed", IsActive=false}` → 200; DB IsActive false
6. `Update_owner_admin_edits_staff_returns_200` — OwnerAdmin actor; target ≠ actor; PUT `{FullName="Staff"}` → 200 + `Succeeded=true`

E2E run needs Postgres `smca_test` up.
