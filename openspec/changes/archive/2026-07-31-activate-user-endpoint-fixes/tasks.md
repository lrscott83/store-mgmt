# Tasks: ActivateUser Endpoint Fixes — POST /api/v1/users/activate

**Change**: `activate-user-endpoint-fixes`
**Sequence**: RED→GREEN. **NO GIT OPERATIONS** (dirty tree — additive edits only; prior uncommitted changes stay intact). No unit tests, no resx edits (`DontHavePermission`/`UserNotFound` keys exist), no interface/schema changes, no CancellationToken on `GetByIdAsync` (`IGenericRepository.cs:22` no overload). Apply-time: `UpdateAsync` KEPT BEFORE `SaveChangesAsync` (`ApplicationDbContext.cs:45` NoTracking → FindAsync untracked; dropping UpdateAsync = silent no-op); validator `_localizer` KEPT. ActivateStore OUT OF SCOPE (decision C) — untouched.

## Phase 1: Application Layer (handler + validator + namespace move)

- [x] 1.1 Move `backend/src/Application/Features/Management/Users/Commands/ActivateUser/ActivateUserCommand.cs` → `.../UserManagement/Users/Commands/ActivateUser/ActivateUserCommand.cs`; namespace decl → `Application.Features.UserManagement.Users.Commands.ActivateUser`. Guard chain in `Handle`: 403 `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)` when `!_httpContextService.IsSuperAdminOrOwnerAdmin` (FIRST) → `var user = await _userRepository.GetByIdAsync(request.Id);` (NO token) → null → 404 `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` → `user.IsActive = request.IsActive;` → `await _userRepository.UpdateAsync(user);` (KEEP) → `ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0)`. Acceptance: guard order 403→404→assign→persist; compiles.
- [x] 1.2 Move `.../ActivateUser/ActivateUserCommandValidator.cs` → same new folder; namespace decl updated. REMOVE `MustAsync(UserExists)` rule, `UserExists` method, `_userRepository` field, ctor `IUserRepository` param, `using Domain.Interfaces.Repositories;` (+ dead System/Collections/Linq/Text/Threading usings). KEEP `NotNull()`+`NotEmpty()`, `_localizer`, usings (`Microsoft.Extensions.Localization`, `Resources`). Acceptance: no DB/repo refs; 21-line mirror of `DeleteUserCommandValidator.cs`.
- [x] 1.3 Grep `Management.Users.Commands.ActivateUser` across `backend/` → 0 hits (3/3 refs migrated). Do NOT touch `Features/Management/Users/Commands/CreateStoreUser` (folder not emptied).

## Phase 2: WebApi Layer

- [x] 2.1 `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs`: line 3 `using` → `UserManagement.Users.Commands.ActivateUser`; `ActivateUserAsync` (:89-98): add `[ProducesResponseType]` 400/401/403/404 after existing 200 (`typeof(ResponseResult<bool>)`); keep `[FromBody]` + XML doc. Additive only — do NOT clobber uncommitted `UpdatedAsync` (:59-70) or post-archive `DeleteUserAsync` (:77-87). Acceptance: 4 new attrs; 200 remains; signature intact.

## Phase 3: E2E Tests

- [x] 3.1 `backend/src/SMCA.WebApi.E2ETests/Users/UsersActivateTests.cs`: rename `Activate_sets_active_true_ignoring_request` → `Activate_false_deactivates`: `SeedSuperAdminAsync` + `SeedUserWithRoleAsync` victim + `UserSeed.DeactivateUserAsync`; POST `{Id, IsActive=false}` → 200 + DB `IsActive==false` (`IgnoreQueryFilters`); cleanup ×2. RED today → GREEN after CH-A2.
- [x] 3.2 Same file — NEW `Activate_true_activates`: same setup; POST `{Id, IsActive=true}` → 200 + DB `IsActive==true`; same cleanup. Fills `true` coverage gap.
- [x] 3.3 Same file — rename `Activate_nonexistent_returns_400` → `Activate_nonexistent_returns_404`: `SeedSuperAdminAsync`; POST random Guid → `NotFound` + `Succeeded==false` + `Errors.NotBeEmpty()`; cleanup (mirror `UsersDeleteTests:46-60`). RED today → GREEN after VL-A1 removal + CH-A3.
- [x] 3.4 Same file — NEW `Activate_as_store_user_with_users_feature_returns_403`: actor `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)`; victim `SeedUserWithRoleAsync((int)RoleType.OwnerAdmin)`; POST → `Forbidden` + envelope; cleanup `CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `CleanupUserAsync(victim)` (mirror `UsersDeleteTests:70-88`). RED today → GREEN after CH-A1. Acceptance: 4 tests total; assert status + envelope ONLY — NEVER localized `Description`.

## Phase 4: Verify

- [ ] 4.1 ORCHESTRATOR-EXECUTED after apply (NOT apply): `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersActivateTests"` → 4 GREEN (Postgres `smca_test`); regression `--filter "FullyQualifiedName~UsersDeleteTests|FullyQualifiedName~UsersUpdateTests|FullyQualifiedName~UsersListTests"` GREEN.

## Phase 5: Archive-Time (NOT apply)

- [ ] 5.1 Spec deltas: `openspec/specs/users-e2e/spec.md` — flip line 20 Out-of-Scope bug note; R5 row "Deactivate → 200, IsActive=true (KNOWN BUG)" → `200, IsActive=false`; ADD row "Non-existent id | SuperAdmin | 404"; clarify StoreUser 403 row as feature-granted → handler-level; remove known-bugs row (line 163; StoreName Guid row stays). Mirror CH-A1..A3 → `command-handler/spec.md`, VL-A1 → `validation/spec.md`, UC-A1 → `api-controller/spec.md`.
- [ ] 5.2 `docs/plans/endpoints-e2e-coverage.md:55` (row 19): `⬜ Pending` → `✅ Done | 🔶 Applied | activate-user-endpoint-fixes` (mirror delete-user row 54).
- [ ] 5.3 Annotate ActivateStore debt per decision C: guard 400 `UserNotFound` + validator `StoreExists` double-query remain — follow-up note in plan doc; no code changes.
