# Tasks: DeleteUser Endpoint Fixes — DELETE /api/v1/users/{id}

**Change**: `delete-user-endpoint-fixes`
**Sequence**: RED→GREEN. **NO GIT OPERATIONS** (dirty tree — prior uncommitted changes stay intact). No unit tests, no interface/schema changes. Apply-time verify: `GetByIdAsync` has NO CancellationToken overload (`IGenericRepository.cs:22`) — call WITHOUT token; `UpdateAsync` KEPT (`ApplicationDbContext.cs:45` NoTracking → FindAsync untracked); validator `_localizer` KEPT (used by retained rules).

## Phase 1: Application Layer

- [x] 1.1 `backend/src/Application/Features/UserManagement/Users/Commands/DeleteUser/DeleteUserCommand.cs`: add `using Domain.Common.Extensions;`. Guard chain: 403 `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)` when `!_httpContextService.IsSuperAdminOrOwnerAdmin` (FIRST) → 400 `ApiException(_localizer["CannotDeleteSelf"], HttpStatusCode.BadRequest)` when `request.Id == _httpContextService.UserExternalId.ToGuid()` (BEFORE any repo call) → `var user = await _userRepository.GetByIdAsync(request.Id);` (NO token) → null → 404 `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` → `user.IsActive = false;` → `await _userRepository.UpdateAsync(user);` (KEEP) → `return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);`. Keep existing usings (`System.Net`, `Application.Exceptions`, …). Acceptance: compiles; guard order 403→400→404→soft-delete.
- [x] 1.2 `.../DeleteUser/DeleteUserCommandValidator.cs`: REMOVE `MustAsync(UserExists)` rule, `UserExists` method, `_userRepository` field, ctor `IUserRepository` param, `using Domain.Interfaces.Repositories;`. KEEP `NotNull`+`NotEmpty` rules, `_localizer`, usings (`Microsoft.Extensions.Localization`, `Resources`). Acceptance: no DB access/repo refs; mirrors `DeactivateStoreCommandValidator`.

## Phase 2: WebApi Layer

- [x] 2.1 `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` `DeleteUserAsync`: add `[ProducesResponseType(StatusCodes.Status400BadRequest)]` / `Status401Unauthorized` / `Status403Forbidden` / `Status404NotFound` after the 200; `[FromRoute] Guid id`; `<param name="id">User Id</param>` XML doc. Mirror uncommitted `UpdatedAsync` block verbatim. Acceptance: metadata matches `UpdatedAsync`.

## Phase 3: Resources

- [x] 3.1 `backend/src/Resources/Localization/I18n.resx`: add `<data name="CannotDeleteSelf" xml:space="preserve"><value>No puedes eliminarte a ti mismo</value></data>` as FIRST data entry (after last `</resheader>` ~line 119, before `ClientNotFound`); rename `<data name="UserNotFoud"` → `UserNotFound` (line 246), value/position unchanged. Acceptance: XML valid; key present; grep `UserNotFoud` → 0 in .resx.
- [x] 3.2 `backend/src/Resources/Localization/I18n.en.resx`: same `CannotDeleteSelf` entry, value "You cannot delete yourself", between `BaseFee` and `CarrierAddressIsMain`; rename `UserNotFoud` → `UserNotFound` (line 504). Acceptance: XML valid.

## Phase 4: E2E Tests

- [x] 4.1 `backend/src/SMCA.WebApi.E2ETests/Users/UsersDeleteTests.cs`: rename `Delete_nonexistent_returns_400` → `Delete_nonexistent_returns_404`, assert `HttpStatusCode.NotFound` (+ `UserNotFound`). Keep soft-delete 200 + no-token 401 tests.
- [x] 4.2 Same file — NEW `Delete_as_store_user_with_users_feature_returns_403`: actor `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (usings already present: `SMCA.WebApi.E2ETests.Infrastructure`, `Domain.Common.Enums`), victim `DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin)`; DELETE → `Forbidden` + `DontHavePermission`; cleanup `AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `DbTestHelpers.CleanupUserAsync(_f, victim.UserId)` (pattern `UsersUpdateTests.cs`).
- [x] 4.3 Same file — NEW `Delete_self_as_super_admin_returns_400`: `SeedSuperAdminAsync`; DELETE own id → `BadRequest` + `CannotDeleteSelf`; cleanup `CleanupUserAsync`. Acceptance: compiles; 5 tests total (2 kept, 1 renamed, 2 new).

## Phase 5: Verify + Archive-Time

- [x] 5.1 ORCHESTRATOR-EXECUTED after apply (NOT apply): `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersDeleteTests"` → 5 GREEN (Postgres `smca_test`); regression `--filter "FullyQualifiedName~UsersListTests|FullyQualifiedName~UsersUpdateTests"`.
- [x] 5.2 ARCHIVE-TIME (NOT apply): `openspec/specs/users-e2e/spec.md` R4 — add self-delete row (SuperAdmin → 400); clarify StoreUser 403 row (feature-granted → handler-level); non-existent row stays 404.
- [x] 5.3 ARCHIVE-TIME (NOT apply): `docs/plans/endpoints-e2e-coverage.md` row 54 → Done/Archived + `delete-user-endpoint-fixes` (mirror rows 52-53).
