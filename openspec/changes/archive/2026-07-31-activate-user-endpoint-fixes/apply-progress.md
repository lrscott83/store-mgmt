# Apply Progress: activate-user-endpoint-fixes

**Change**: `activate-user-endpoint-fixes`
**Mode**: HYBRID (engram + openspec) — Standard workflow (E2E RED-ability is asserted in the design; build/tests NOT run by apply — orchestrator executes 4.1 verify).
**No git operations** (dirty tree — edits are additive/surgical on top of uncommitted `UpdatedAsync` metadata). No resx edits, no interface/schema changes, no unit tests, no CancellationToken on `GetByIdAsync`, `CreateStoreUser` untouched.

---

## Completed (Phases 1–3)

- [x] **1.1** `ActivateUserCommand.cs` — MOVED `backend/src/Application/Features/Management/Users/Commands/ActivateUser/` → `backend/src/Application/Features/UserManagement/Users/Commands/ActivateUser/`; namespace decl → `Application.Features.UserManagement.Users.Commands.ActivateUser`. Guard chain in `Handle` rewritten (exact mirror of post-archive `DeleteUserCommand.cs`):
  1. `!_httpContextService.IsSuperAdminOrOwnerAdmin` → 403 `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)` — FIRST (was: 400 `UserNotFound`)
  2. `var user = await _userRepository.GetByIdAsync(request.Id);` — NO CancellationToken (no overload on `IGenericRepository.cs:22`; precedent `UpdateUserCommand.cs:46`)
  3. null → 404 `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` (was: 400)
  4. `user.IsActive = request.IsActive;` — replaces hardcoded `true` (CH-A2)
  5. `await _userRepository.UpdateAsync(user);` — KEPT (NoTracking at `ApplicationDbContext.cs:45` → FindAsync untracked; `UpdateAsync` = attach mechanism; dropping = silent no-op)
  6. `return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);`
  Usings unchanged (all 9 existing kept — same set as DeleteUser minus `Domain.Common.Extensions`, not needed: no self-delete guard).

- [x] **1.2** `ActivateUserCommandValidator.cs` — MOVED to same new folder; namespace decl updated. Trimmed to exact 21-line mirror of `DeleteUserCommandValidator.cs`: REMOVED `MustAsync(UserExists)` rule, `UserExists` method, `_userRepository` field, ctor `IUserRepository` param, `using Domain.Interfaces.Repositories;` + dead `System`/`Collections.Generic`/`Linq`/`Text`/`Threading.Tasks` usings. KEPT `NotNull()`+`NotEmpty()` rules, `_localizer`, `using Microsoft.Extensions.Localization;` + `using Resources;`. Zero DB access (VL-A1/VL-A2/VL-A3).

- [x] **1.3** Namespace move (option B) — post-move grep `Features\.Management\.Users\.Commands\.ActivateUser` across `backend/` → **0 hits**. `Features/Management/Users/Commands/` retains only `CreateStoreUser` (untouched; `ActivateUser` empty folder removed). Exactly 3 refs migrated (command decl, validator decl, controller using).

- [x] **2.1** `UsersController.cs` — line 3 `using` → `Application.Features.UserManagement.Users.Commands.ActivateUser;`. `ActivateUserAsync` (`:89-102` post-edit): `[ProducesResponseType]` 400/401/403/404 added after existing 200 (`typeof(ResponseResult<bool>)`) — verbatim metadata mirror of `DeleteUserAsync` block. `[FromBody] ActivateUserCommand command` signature + XML doc kept. Additive only: uncommitted `UpdatedAsync` (`:56-70`) and post-archive `DeleteUserAsync` (`:72-87`) blocks untouched (verified by re-read).

- [x] **3.1** `UsersActivateTests.cs` — `Activate_sets_active_true_ignoring_request` (KNOWN BUG test) REPLACED by `Activate_false_deactivates_user`: seed SuperAdmin + `SeedUserWithRoleAsync(OwnerAdmin)` victim + `UserSeed.DeactivateUserAsync`; POST `{ Id, IsActive = false }` → 200; DB check `user.IsActive.Should().BeFalse()` via `IgnoreQueryFilters()`; cleanup ×2. RED pre-fix (handler forced `true`), GREEN post-1.1.

- [x] **3.2** Same file — NEW `Activate_true_activates_user`: same setup (deactivate first); POST `{ Id, IsActive = true }` → 200 + DB `IsActive == true`. Fills the `true`-body coverage gap.

- [x] **3.3** Same file — `Activate_nonexistent_returns_400` RENAMED `Activate_nonexistent_returns_404`: `SeedSuperAdminAsync`; POST random `Guid` → `HttpStatusCode.NotFound` + envelope `Succeeded == false` + `Errors.NotBeEmpty()` (mirror `UsersDeleteTests:46-60`). RED today (validator 400 via VL-A1), GREEN post-VL-A1 removal + CH-A3.

- [x] **3.4** Same file — NEW `Activate_as_store_user_with_users_feature_returns_403`: actor `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (Users=72 passes `[HasPermission(UsersAdmin)]` filter), victim `DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin)`; POST → `HttpStatusCode.Forbidden` + envelope (`Succeeded == false`, `Errors.NotBeEmpty()`); cleanup `AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `DbTestHelpers.CleanupUserAsync(_f, victim.UserId)` (exact `UsersDeleteTests:70-88` pattern). RED today (400 `UserNotFound` — handler 400-guard fires before existence check), GREEN post-CH-A1.

Total: **4 tests** (1 replaced, 1 renamed, 2 new) — matches tasks.md acceptance.

## Assertion style (all 4 tests)

Status-code + envelope structure (`Succeeded == false`, `Errors.NotBeEmpty()`) ONLY. NEVER localized `Description` (culture coupling — delete-user Batch B regression: E2E host resolves localizer to en). NEVER `Code` ("App.Unexpected" for ApiException without AcctionCode). DB `IsActive` asserts are behavior checks, not message asserts.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `backend/src/Application/Features/Management/Users/Commands/ActivateUser/ActivateUserCommand.cs` | Moved → deleted | Old location (folder removed, empty after move) |
| `backend/src/Application/Features/Management/Users/Commands/ActivateUser/ActivateUserCommandValidator.cs` | Moved → deleted | Old location (folder removed, empty after move) |
| `backend/src/Application/Features/UserManagement/Users/Commands/ActivateUser/ActivateUserCommand.cs` | Created (moved) | Namespace; guard chain 403→404→assign→UpdateAsync→SaveChangesAsync(ct) |
| `backend/src/Application/Features/UserManagement/Users/Commands/ActivateUser/ActivateUserCommandValidator.cs` | Created (moved) | 21-line structural-only validator, no DB refs |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modified | Using line 3; 4 `[ProducesResponseType]` attrs on ActivateUserAsync (additive) |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersActivateTests.cs` | Rewritten | 4 tests (1 replaced, 1 renamed, 2 new) |

## Deviations from Design

None — implementation matches design.md (guard-chain order, validator mirror, namespace move, additive controller metadata, E2E assert style).

## Issues Found

None. (Note: `CleanupStoreGraphAsync` removes the store graph but NOT the owner user — passes `actor.OwnerUserId` explicitly per `UsersUpdateTests`/`UsersDeleteTests` convention.)

## Remaining Tasks (NOT apply)

- [ ] **4.1** ORCHESTRATOR verify: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersActivateTests"` → 4 GREEN (Postgres `smca_test`); regression `UsersDeleteTests | UsersUpdateTests | UsersListTests` GREEN.
- [ ] **5.1** Archive-time: spec deltas (`users-e2e` R5 flip + known-bug row removal; `command-handler` CH-A1..A3; `validation` VL-A1; `api-controller` UC-A1).
- [ ] **5.2** Archive-time: `docs/plans/endpoints-e2e-coverage.md:55` row 19 → `✅ Done | 🔶 Applied | activate-user-endpoint-fixes`.
- [ ] **5.3** Archive-time: annotate ActivateStore debt (guard 400 `UserNotFound` + validator `StoreExists` double-query) per decision C.

## Status

8/8 apply-phase tasks complete (1.1, 1.2, 1.3, 2.1, 3.1–3.4). Ready for orchestrator verify (4.1).
