# Design: PUT /api/v1/users/{id} — Endpoint Fixes

## Technical Approach

Mirror the GET precedent: handler-level envelope-404 guards (ownership per `UpdateUserPasswordCommand.cs:49-56`, null-race per `GetUserByIdQuery.cs:27-28`), tri-state partial updates, validator switches to existing `ExistsAsync` (1 round-trip), drop the full-column `UpdateAsync`, `bool? IsActive` gated to admins, controller metadata per `GetAllUsersAsync:29-32`. E2E proves each fix RED→GREEN using the verified `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Profile)` helper — grants Profile(70) to StoreUser role, passes `[HasPermission(ProfileAdmin)]` via `HasUserAnyFeatureInStoreAsync` (`HasPermissionAttribute.cs:100-101`), proven by `AuthMePermissionsTests.cs:66`. **No new seed helper needed.**

## Architecture Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D6 | Controller `command.Id = id` mutation | **Keep mutation** (option a) | Grep: `new UpdateUserCommand` has ZERO other construction sites; `[FromBody]` + route overwrite makes route authoritative (no body-id hijack). Record+init (option b) is technically safe (MediatR `RegisterServicesFromAssembly`, FluentValidation `AddValidatorsFromAssembly`, STJ property-based records all fine — `UpdateUserPasswordCommand` is already such a record) BUT breaks `WebApiTest/Controllers/v1/UsersController.cs:68` (`command.Id = id` on init-only) — a legacy project outside the .sln, still a 2nd touchpoint with zero behavior gain. Bugfix rule: minimal. |
| D7 | IsActive semantics | `if (_httpContextService.IsSuperAdminOrOwnerAdmin && request.IsActive.HasValue) user.IsActive = request.IsActive.Value;` | SuperAdmin self-edit: React echoes true → unchanged. OwnerAdmin staff-edit: explicit false → deactivates (intended). StoreUser self-edit: not admin → guard false → unchanged (React echoes current value, harmless). Omitted isActive → null → never applied — kills the silent deactivate bug (`UpdateUserCommand.cs:49-50` today). |
| D8 | Tri-state | `if (request.CellPhone is not null) user.CellPhone = request.CellPhone == "" ? null : request.CellPhone;` (same for Email) | null→keep, ""→clear, value→assign. FullName: NO handler guard — validator `NotNull/NotEmpty` (`UpdateUserCommandValidator.cs:22-24`), `ValidationBehavior` registered (`Application/DependencyInjection.cs:39`); handler trusts pipeline. Whitespace-only " " assigned as-is (no normalization, out of scope). |
| D9 | NRE guard | `User? user = await _userRepository.GetByIdAsync(request.Id); if (user is null) return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);` | `GetByIdAsync`→`FindAsync` (`GenericRepository.cs:82-85`) returns null when absent despite `Task<User>` signature — `User?` assign is legal, no warning (widening). Precedent: `GetUserByIdQuery.cs:25` does exactly this with a `Task<User>`-declared method (`IUserRepository.cs:15`). NO interface change — `User?` on interface = scope creep. Guard placed BEFORE ownership check and mutations. |
| D10 | UpdateAsync removal | Delete `await _userRepository.UpdateAsync(user);` (`UpdateUserCommand.cs:51`) | FindAsync tracks; handler's own `SaveChangesAsync` (line 52) persists only changed columns. `UpdateAsync` = `Entry.State=Modified` (`GenericRepository.cs:40-43`) → full-column UPDATE. **Verified `UnitOfWorkBehaviour.IsQuery()` always returns true (`UnitOfWorkBehaviour.cs:39`) → behavior never saves; handler's call IS the persistence point.** Note: no-op update now returns `Success(false)` (was true via forced Modified) — no matrix test affected. |
| D11 | Validator | `UserExists(Guid tenantId, ...)` → `UserExists(Guid userId, CancellationToken cancellationToken)`; body → `return await _userRepository.ExistsAsync(userId, cancellationToken);` | `ExistsAsync` (`IUserRepository.cs:19`, `UserRepository.cs:99-102` = `IgnoreQueryFilters().AnyAsync`) — single round-trip vs FindAsync double. Rename kills the misleading `tenantId`. IgnoreQueryFilters accepted (GET precedent AD1/AD2): existence across soft-delete is intentional; race mismatch (validator true / handler null) absorbed by D9 guard. `MustAsync(UserExists)` call site unchanged. |
| D12 | Controller metadata | Below (exact block) | Style per `GetAllUsersAsync:29-32`; D7 approved adding 404. Caveat: endpoint returns envelope-404 (HTTP 200) — `Status404NotFound` documents the semantic ActionCode-404 outcome for Swagger consumers (GET precedent omitted it; D7 supersedes). |

## Data Flow

```
PUT /api/v1/users/{id}
 → [Authorize] → [HasPermission(ProfileAdmin)] → HasUserAnyFeatureInStoreAsync   [filter]
 → Validator: Id NotNull/NotEmpty + ExistsAsync(userId, ct)  [1 query, IgnoreQueryFilters]
 → Handler: GetByIdAsync → FindAsync (TRACKED)
     → user is null ? Failure<bool>(UserErrors.NotFound, 404)          [D9 race guard]
     → request.Id != UserExternalId.ToGuid() && !IsSuperAdminOrOwnerAdmin
         ? Failure<bool>(UserErrors.NotFound, 404)                     [D1 IDOR guard]
     → tri-state CellPhone/Email [D2] → FullName assign
     → admin && IsActive.HasValue ? apply IsActive [D4] 
     → SaveChangesAsync (no UpdateAsync) → Success(saved > 0)          [D5]
```

## File Changes

| File | Action | Change |
|------|--------|--------|
| `backend/src/Application/.../Commands/UpdateUser/UpdateUserCommand.cs` | Modify | Line 20: `bool IsActive` → `bool? IsActive`. Handler (lines 43-53): `User? user` + null guard (D9) BEFORE ownership guard (D1, mirrors `UpdateUserPasswordCommand.cs:49-56` — note: password handler NREs on self-of-nonexistent; ours guards first); tri-state blocks (D2); IsActive gate (D4); delete line 51 `UpdateAsync`. |
| `.../UpdateUser/UpdateUserCommandValidator.cs` | Modify | Rename `tenantId`→`userId`; body → `ExistsAsync(userId, cancellationToken)` (line 35). |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modify | `UpdatedAsync` (lines 59-66): `[FromRoute] Guid id` explicit; add ProducesResponseType 400/401/403/404 after existing 200. |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersUpdateTests.cs` | Modify | +7 tests (below). Existing 6 tests unaffected (verified: empty-body → validator 400; nonexistent → validator ExistsAsync 400; store-user-no-feature → filter 403). |

Controller block (exact):

```csharp
[HttpPut("{id}")]
[ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[HasPermission(StoreRoleFeatures.ProfileAdmin)]
public async Task<IActionResult> UpdatedAsync([FromRoute] Guid id, [FromBody] UpdateUserCommand command)
```

## Testing Strategy (E2E only — D5, no unit tests)

Verified seed APIs: `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Profile)` → `StoreUserFixture(UserId, Login, OwnerUserId, OwnerId, StoreId, TenantId)` (grants Profile via `StoreRoleFeature.Create(store.Id, RoleType.StoreUser, fid, tenantId)` + `StoreModule` 7 + `StoreUser` row); `UserSeed.SeedOwnerAdminWithStoreAsync(_f)` → `UserWithRolesFixture(...)`; `DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123")` → Guid; `UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser)` → `UserFixture` (CellPhone "0000000000", Email=login); `DbTestHelpers.AuthedClient(_f, userId, login)`; state asserts via `DbTestHelpers.GetUserByLoginAsync(_f, login)` (IgnoreQueryFilters). Cleanup: `AuthzSeed.CleanupStoreGraphAsync(_f, storeId, userIds)` + `DbTestHelpers.CleanupUserAsync(_f, userId)`. Envelope assert pattern (AuthMeFailureTests.cs:31-36): `body.Succeeded false`, `body.ActionCode == 404`, `Errors` contains "User.NotFound". Command: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersUpdateTests"`.

| # | Test (RED→GREEN unless noted) | Setup → Body → Assert |
|---|-------------------------------|-----------------------|
| 1 | `Update_store_user_with_profile_cannot_edit_another_user_returns_envelope_404` (IDOR, RED) | actor=`SeedStoreUserAsync(_f, (int)FeatureType.Profile)`; target=`SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser)`; PUT `/api/v1/users/{target.UserId}` `{ FullName="Hacker" }` → 200 + Succeeded false + ActionCode 404 (RED today: Succeeded true). |
| 2 | `Update_partial_body_preserves_cellphone_and_email` (RED) | superAdmin actor → target plain user; PUT `{ FullName="Renamed" }` → 200; DB: `CellPhone=="0000000000"`, `Email==target.Login` (RED today: nulled). |
| 3 | `Update_empty_cellphone_clears_to_null` (RED) | superAdmin → target; PUT `{ FullName="Renamed", CellPhone="" }` → 200; DB: `CellPhone == null` (RED today: ""). |
| 4 | `Update_as_store_user_with_profile_keeps_own_is_active` (regression guard, GREEN today) | actor StoreUser+Profile → self; PUT `{ FullName="Self" }` (no isActive) → 200 + Succeeded; DB: `IsActive true`. |
| 5 | `Update_omitted_is_active_as_super_admin_does_not_deactivate` (RED) | superAdmin → target; PUT `{ FullName="Renamed" }` → 200; DB: `IsActive true` (RED today: deactivated — bool default false). |
| 6 | `Update_explicit_is_active_false_as_super_admin_deactivates` (regression guard for D4) | superAdmin → target; PUT `{ FullName="Renamed", IsActive=false }` → 200; DB: `IsActive false`. |
| 7 | `Update_as_owner_admin_edits_staff_returns_200` (regression guard for D1) | actor=`SeedOwnerAdminWithStoreAsync(_f)`; target plain user; PUT `{ FullName="Staff" }` → 200 + Succeeded true (guard must NOT over-block). |

**Discrepancy note**: proposal Affected-Areas says "6 new tests" but E2E matrix lists 7 rows — test 6 (explicit toggle) is the uncounted extra. Design includes all 7: test 6 is the cheapest guard on D4's core regression (admin toggle must still work). Drop 6 if tasks phase insists on exactly 6.

## Migration / Rollout

No data migration, no feature flags. Per-file additive revert per proposal Rollback Plan. `bool? IsActive` is DTO-only.

## Contracts / Spec Alignment

Archive-time only (not this change): `openspec/specs/users-e2e/spec.md` R3 404-row alignment + StoreUser-with-feature IDOR row.

## Open Questions

None blocking. Count discrepancy flagged above (7 vs 6 tests).
