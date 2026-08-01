# Design: DELETE /api/v1/users/{id} — Endpoint Fixes

## Technical Approach

Six targeted fixes in the DeleteUser pipeline (handler, validator, controller metadata, both resx, E2E). Contract semantics mirror the archived delete-store precedent (handler owns existence + cross-tenant → 404; validator becomes a pure `NotNull`/`NotEmpty` shape-check with no repo dependency); controller metadata mirrors the uncommitted `UpdatedAsync` diff verbatim. Handler guard order: 403 → 400 self-delete → `GetByIdAsync` → 404 → soft-delete, all real HTTP statuses via `ApiException` (`ErrorHandlerMiddleware` maps `StatusCode` → HTTP; no middleware change). No interface changes, no unit tests, no schema. Changes are additive on the dirty tree (uncommitted `UpdatedAsync` metadata in `UsersController.cs`).

## Architecture Decisions

### Decision: CancellationToken on `GetByIdAsync` — OMIT (option a)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| (a) Omit token | No interface change, zero blast radius | ✅ Chosen |
| (b) `GetByIdAsync(TId, CancellationToken)` overload on `IGenericRepository` | Interface change — every repository consumer touched | ❌ Rejected |
| (c) New token method on `IUserRepository` only | Scope creep, new member | ❌ Rejected |

**Rationale**: `IGenericRepository.cs:22` — `Task<TEntity> GetByIdAsync(TId id)`, no token; `GenericRepository.cs:82-85` → `FindAsync(id)` internally, no token. Corrected precedent `UpdateUserCommand.cs:46` calls `GetByIdAsync(request.Id)` WITHOUT token. Spec CH-D4's literal `GetByIdAsync(request.Id, cancellationToken)` is satisfied by dropping the token from the call — the handler's `SaveChangesAsync(cancellationToken)` (`DeleteUserCommand.cs:45`) is the EF persistence point carrying it. Verify at apply.

### Decision: `UpdateAsync` KEPT — NoTracking is real

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep `await _userRepository.UpdateAsync(user)` | Attaches untracked entity via full-column UPDATE | ✅ Chosen |
| Remove it (archived update-user design D10) | Nothing persists — D10's "FindAsync tracks" claim is FALSE for this DbContext | ❌ Rejected |

**Rationale**: `ApplicationDbContext.cs:45` sets `QueryTrackingBehavior.NoTracking` in the ctor → `FindAsync` returns UNTRACKED. `UpdateAsync` = `Entry.State=Modified` (`GenericRepository.cs:40-43`) is the attach mechanism; without it `SaveChangesAsync` sees no changes. The implemented (uncommitted) update-user code already corrected D10 and re-added `UpdateAsync` with this exact comment (`UpdateUserCommand.cs:59-63`). Delete handler line 44 is UNCHANGED — do NOT remove (spec CH-D4 4a persists via it).

### Decision: Validator trim — KEEP `_localizer`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep `_localizer` + `using Microsoft.Extensions.Localization`/`Resources` (mirror `DeactivateStoreCommandValidator`) | Used by retained `NotNull`/`NotEmpty` messages | ✅ Chosen |
| Remove `_localizer` + usings (task-prompt assumption) | Would break `.NotNull().WithMessage(_localizer["IsRequired", ...])` — assumption FALSE | ❌ Rejected |

**Rationale**: Verified: `DeleteUserCommandValidator.cs:24-25` (retained rules) use `_localizer["IsRequired", "{PropertyName}"]`; `DeactivateStoreCommandValidator.cs:9,12,15-16` keeps localizer + both usings. Remove ONLY: `MustAsync(UserExists)` rule (line 26), `UserExists` method (30-33), `_userRepository` field (16, 20), ctor `IUserRepository` param (18), `using Domain.Interfaces.Repositories;` (line 2).

### Decision: Handler guard order

403 `DontHavePermission` (mirror `DeactivateStoreCommand.cs:37-38`) → 400 `CannotDeleteSelf` (`request.Id == _httpContextService.UserExternalId.ToGuid()`; needs `using Domain.Common.Extensions;` — `GuidExtensions.cs:12`; `UserExternalId` is string) BEFORE any repo call (spec CH-D2) → `GetByIdAsync` → null → 404 `UserNotFound` (mirror `DeactivateStoreCommand.cs:41-42`) → `IsActive=false` → `UpdateAsync` → `SaveChangesAsync(ct) > 0`. Auth guard RETAINED — a feature-granted StoreUser passes `[HasPermission]` but must 403 here (spec CH-D1).

### Decision: resx key placement

`CannotDeleteSelf`: FIRST data entry in `I18n.resx` (between `</resheader>` line 119 and `ClientNotFound` line 120); `I18n.en.resx` between `BaseFee` (123-125) and `CarrierAddressIsMain` (126) — `Can` < `Car`. Rename `UserNotFoud`→`UserNotFound` at `I18n.resx:246` / `I18n.en.resx:504`; values + positions unchanged (between `UserNotCreated`/`UserNotRole`). `I18n.Designer.cs` untouched (zero refs, compile-safe; bare csproj, no generator).

### Decision: E2E helper choice

`AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (Users=72, `FeatureType.cs:85`) → `StoreUserFixture(UserId, Login, OwnerUserId, OwnerId, StoreId, TenantId)` — grants Users, passes `[HasPermission(UsersAdmin)]`, hits handler guard → 403 (RED today: 400). Cleanup per precedent `UsersUpdateTests.cs:109-110`: `CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `CleanupUserAsync(_f, victim.UserId)`.

## Data Flow

```
DELETE /api/v1/users/{id}
 → [Authorize] → [HasPermission(UsersAdmin)]                    [filter]
 → Validator: Id NotNull/NotEmpty only — ZERO DB queries        [VL-D2]
 → Handler: IsSuperAdminOrOwnerAdmin ? else 403 DontHavePermission
     → id == self ? 400 CannotDeleteSelf                        [no DB call yet]
     → GetByIdAsync → FindAsync (UNTRACKED — NoTracking)
     → null ? 404 UserNotFound
     → user.IsActive = false → UpdateAsync (Entry.State=Modified)
     → SaveChangesAsync(ct) > 0 → 200
```

## File Changes

| File | Action | Change |
|------|--------|--------|
| `backend/src/Application/.../Commands/DeleteUser/DeleteUserCommand.cs` | Modify | Line 38 → 403 `DontHavePermission`; NEW self-delete guard (400 `CannotDeleteSelf`) before line 40; line 42 → 404 `UserNotFound`; add `using Domain.Common.Extensions;`. Lines 40/44/45 (`GetByIdAsync(request.Id)`, `UpdateAsync`, `SaveChangesAsync(ct)`) UNCHANGED |
| `.../DeleteUser/DeleteUserCommandValidator.cs` | Modify | Remove rule/method/field/ctor-param/using per Decision 3; result mirrors `DeactivateStoreCommandValidator.cs` (21 lines) |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modify | `DeleteUserAsync` (75-81): add `[ProducesResponseType]` 400/401/403/404 after 200; `[FromRoute] Guid id`; `<param name="id">User Id</param>` — additive on uncommitted `UpdatedAsync` |
| `backend/src/Resources/Localization/I18n.resx` | Modify | Insert `CannotDeleteSelf` at line 120; rename line 246 `UserNotFoud`→`UserNotFound` |
| `backend/src/Resources/Localization/I18n.en.resx` | Modify | Insert `CannotDeleteSelf` between lines 125/126; rename line 504 |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersDeleteTests.cs` | Modify | Rename + re-assert 404 test; add 2 tests (403 StoreUser, self-delete 400); keep 200 + 401 |

## Testing Strategy (E2E only — no unit tests, house precedent)

| # | Test | Setup → Assert | RED/GREEN |
|---|------|----------------|-----------|
| 1 | `Delete_as_super_admin_soft_deletes` | `SeedSuperAdminAsync` + `SeedUserWithRoleAsync` victim; DELETE → 200; DB `IsActive==false` (`IgnoreQueryFilters`); cleanup `CleanupUserAsync` ×2 | GREEN (kept) |
| 2 | `Delete_nonexistent_returns_404` (RENAMED from `_400`) | `SeedSuperAdminAsync`; DELETE random Guid → `NotFound` + `UserNotFound`; cleanup `CleanupUserAsync` | RED today 400 → GREEN |
| 3 | `Delete_without_token_returns_401` | unauthenticated client → 401 | GREEN (kept) |
| 4 | `Delete_as_store_user_with_users_feature_returns_403` (NEW) | `SeedStoreUserAsync(_f, (int)FeatureType.Users)` actor + `SeedUserWithRoleAsync` victim; DELETE → `Forbidden` + `DontHavePermission`; cleanup `CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `CleanupUserAsync(victim)` | RED today 400 → GREEN |
| 5 | `Delete_self_as_super_admin_returns_400` (NEW) | `SeedSuperAdminAsync`; DELETE own id → `BadRequest` + `CannotDeleteSelf`; cleanup `CleanupUserAsync` | RED today 200 → GREEN |

Command: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersDeleteTests"` (Postgres `smca_test`). Regression: `UsersListTests|UsersUpdateTests` GREEN.

## Migration / Rollout

None — no schema, no feature flags. Revert = per-file (remove guards; restore validator rule + repo ctor; drop metadata + resx keys/rename; revert tests). Dirty tree: additive edits only, NO git operations.

## Contracts / Spec Alignment

Archive-time only: `openspec/specs/users-e2e/spec.md` R4 — add self-delete row (SuperAdmin → 400); clarify StoreUser 403 row (feature-granted → handler-level CH-D1); non-existent row already 404 — unchanged. Plan `docs/plans/endpoints-e2e-coverage.md` line 54 (`DELETE /api/v1/users/{id}`) → `✅ Done | ✅ Archived | delete-user-endpoint-fixes` (mirror lines 52-53).

## Open Questions

None blocking. Notes: (1) CH-D4 token literal resolved via Decision 1 (a) — verify at apply; (2) task-prompt "remove `_localizer`" assumption corrected — KEEP it (used by retained rules).
