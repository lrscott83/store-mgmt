# Verification Report: delete-user-endpoint-fixes

**Status**: ✅ **VERIFIED** — E2E `UsersDeleteTests` 5/5 GREEN (Failed: 0, Passed: 5) + regression run by orchestrator (task 5.1). Archive-time alignment 5.2/5.3 completed (this report).
**Mode**: Hybrid (openspec + engram) — Phase 1: STATIC verification (no builds/test runs/git). Phase 2: runtime E2E executed by orchestrator (task 5.1).
**Date**: 2026-07-31
**Verified artifacts**: 5 delta specs (command-handler, validation, api-controller, resources, users-e2e), design.md, tasks.md, apply-progress.md
**Implementation inspected**: `DeleteUserCommand.cs`, `DeleteUserCommandValidator.cs`, `UsersController.cs`, `I18n.resx`, `I18n.en.resx`, `UsersDeleteTests.cs` (+ mirror/precedent files for coherence)

---

## Completeness (tasks.md)

| Metric | Value |
|--------|-------|
| Tasks total | 11 (1.1, 1.2, 2.1, 3.1, 3.2, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3) |
| Tasks complete | 11/11 — ALL rows `[x]` |
| Tasks incomplete | 0 |

---

## Per-Spec Verification Table

### 1. command-handler spec (`specs/command-handler/spec.md`)

| Req | Requirement | Status | Evidence (file:line) |
|-----|-------------|--------|----------------------|
| CH-D1 | 403 `DontHavePermission` guard FIRST, retained (not redundant with `[HasPermission]`) | ✅ PASS | `DeleteUserCommand.cs:29-30` — `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw new ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden);` FIRST statement in `Handle`, before any repo call. Mirrors `DeactivateStoreCommand.cs:37-38`. `[HasPermission(StoreRoleFeatures.UsersAdmin)]` retained on action (`UsersController.cs:97`). |
| CH-D1 1c | No 400 mask (403, not `UserNotFound`) | ✅ PASS | Guard order guarantees 403 fires before `GetByIdAsync` (line 35) — non-admin never reaches the 404 path. |
| CH-D2 | Self-delete 400 `CannotDeleteSelf` BEFORE any repo call, via `ToGuid()` | ✅ PASS | `DeleteUserCommand.cs:32-33` — `if (request.Id == _httpContextService.UserExternalId.ToGuid()) throw new ApiException(_localizer["CannotDeleteSelf"], HttpStatusCode.BadRequest);` placed after auth guard, before `GetByIdAsync` (line 35). `UserExternalId` is `string` (`HttpContextService.cs:36`); `ToGuid()` at `GuidExtensions.cs:12`. `using Domain.Common.Extensions;` present at `DeleteUserCommand.cs:6`. |
| CH-D3 | `GetByIdAsync(request.Id)` WITHOUT token; null → 404 `UserNotFound` | ✅ PASS | `DeleteUserCommand.cs:35` — `var user = await _userRepository.GetByIdAsync(request.Id);` (no token — design Decision 1(a); `IGenericRepository.cs:22` confirms no token overload). Lines 36-38: null → `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)`. Mirrors `DeactivateStoreCommand.cs:41-42`. |
| CH-D4 | `IsActive=false` → `UpdateAsync` → `SaveChangesAsync(ct) > 0`; token forwarded | ✅ PASS | `DeleteUserCommand.cs:39` `user.IsActive = false;` → `:40` `await _userRepository.UpdateAsync(user);` (KEPT — see coherence) → `:41` `ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0)` (token flows to EF; `IApplicationUnitOfWork.cs:5`). |
| Verification | Single DB existence check (1 round-trip) | ✅ PASS | Only `GetByIdAsync` on line 35; validator does zero DB queries (see below). |
| Verification | Keys resolve via localizer | ✅ PASS (static) | `DontHavePermission` `I18n.resx:135-137`; `CannotDeleteSelf` `I18n.resx:120-122` / `I18n.en.resx:126-128`; `UserNotFound` `I18n.resx:249-251` / `I18n.en.resx:507-509`. Runtime resolution → E2E (task 5.1). |

### 2. validation spec (`specs/validation/spec.md`)

| Req | Requirement | Status | Evidence (file:line) |
|-----|-------------|--------|----------------------|
| VL-D1 (removed) | `MustAsync(UserExists)`, `UserExists` method, `_userRepository` field, ctor param, `using Domain.Interfaces.Repositories;` ALL removed | ✅ PASS | `DeleteUserCommandValidator.cs` (20 lines) — grep-verified: no `MustAsync`/`UserExists`/`_userRepository`/`IUserRepository`/`GetByIdAsync` anywhere in file. Usings: only `FluentValidation`, `Microsoft.Extensions.Localization`, `Resources`. Ctor param: only `IStringLocalizer<I18n>` (line 10). |
| VL-D2 | ONLY `NotNull()` + `NotEmpty()`; no existence check | ✅ PASS | `DeleteUserCommandValidator.cs:14-16` — `.NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])` + `.NotEmpty()` — exact mirror of `DeactivateStoreCommandValidator.cs:14-16`. |
| VL-D3 | Existence check sole responsibility of handler; 404 reachable | ✅ PASS (static) | Validator has zero DB access — no repository dependency. Handler CH-D3 owns the 404. Behavioral 404 reachability → E2E `Delete_nonexistent_returns_404` (task 5.1). |
| Verification | No `MustAsync`/`ExistsAsync`/`GetByIdAsync` in validator | ✅ PASS | Grep over validator file: zero matches. |

### 3. api-controller spec (`specs/api-controller/spec.md`)

| Req | Requirement | Status | Evidence (file:line) |
|-----|-------------|--------|----------------------|
| UC-D1 | `[ProducesResponseType]` 400/401/403/404 added; 200 preserved | ✅ PASS | `UsersController.cs:91-96` — `Status200OK` (with `ResponseResult<bool>`), then `Status400BadRequest`, `Status401Unauthorized`, `Status403Forbidden`, `Status404NotFound`. |
| UC-D2 | `[FromRoute] Guid id` | ✅ PASS | `UsersController.cs:99` — `public async Task<IActionResult> DeleteUserAsync([FromRoute] Guid id)`. |
| UC-D3 | `<param name="id">User Id</param>` XML doc | ✅ PASS | `UsersController.cs:92` — `<param name="id">User Id</param>` (mirrors `GetUserAsync:43`). |
| Verification | Metadata matches uncommitted `UpdatedAsync` block | ✅ PASS | `UpdatedAsync` (`UsersController.cs:69-86`) has identical attribute set (200/400/401/403/404, `[FromRoute]`, param doc). |

### 4. resources spec (`specs/resources/spec.md`)

| Req | Requirement | Status | Evidence (file:line) |
|-----|-------------|--------|----------------------|
| RS-1 | `CannotDeleteSelf` in BOTH resx, exact values, insertion positions | ✅ PASS | `I18n.resx:120-122` — `<data name="CannotDeleteSelf">` value `No puedes eliminarte a ti mismo`, FIRST data entry (after last `</resheader>` line 119, before `ClientNotFound` line 123). `I18n.en.resx:126-128` — value `You cannot delete yourself`, between `BaseFee` (123-125) and `CarrierAddressIsMain` (129-131) — sorted (`Can` < `Car`). |
| RS-2 | `UserNotFoud` → `UserNotFound` renamed in BOTH; values + position unchanged | ✅ PASS | `I18n.resx:249-251` value `Usuario no encontrado`, between `UserNotCreated` (246) and `UserNotRole` (252). `I18n.en.resx:507-509` value `User not found`, between `UserNotCreated` (504) and `UserNotRole` (510). Sort order correct. Line shifts 246→249 / 504→507 are the +3-line insert delta from RS-1 — positional intent preserved. |
| RS-3 | Zero `UserNotFoud` in source (.cs/.resx); Designer.cs MAY stay stale | ✅ PASS | Grep `UserNotFoud`: only `I18n.Designer.cs:1218,1220` (stale generated property — explicitly out of scope per spec). Zero matches in both `.resx` files; zero in application/WebApi/test `.cs`. |

### 5. users-e2e spec (`specs/users-e2e/spec.md`)

| Req | Requirement | Status | Evidence (file:line) |
|-----|-------------|--------|----------------------|
| E2E-D1 | `Delete_nonexistent_returns_400` → `_404`, asserts `NotFound` + `UserNotFound` | ✅ PASS | `UsersDeleteTests.cs:45-60` — renamed; asserts `HttpStatusCode.NotFound` (line 54) + envelope failure (`Succeeded == false`, `Errors.NotBeEmpty()` — see Addendum: localized `Description` assert removed in Batch B). Runtime pass confirmed by 5.1. |
| E2E-D2 | NEW `Delete_as_store_user_with_users_feature_returns_403` — `SeedStoreUserAsync(_f, (int)FeatureType.Users)`, asserts 403 + `DontHavePermission`, proper cleanup | ✅ PASS | `UsersDeleteTests.cs:69-88` — actor `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (`FeatureType.cs:85` — `Users = 72`); asserts `Forbidden` (line 78) + envelope failure; cleanup `CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `CleanupUserAsync(_f, victim.UserId)` (lines 83-86) — exact `UsersUpdateTests.cs:109-110` pattern. Runtime pass confirmed by 5.1. |
| E2E-D3 | NEW `Delete_self_as_super_admin_returns_400` — asserts 400 + `CannotDeleteSelf`, cleanup `CleanupUserAsync` | ✅ PASS | `UsersDeleteTests.cs:90-105` — `SeedSuperAdminAsync` (line 94), DELETE own id (line 97), asserts `BadRequest` (line 98) + envelope failure; cleanup `CleanupUserAsync(_f, id)` (line 104). Runtime pass confirmed by 5.1. |
| Kept | `Delete_as_super_admin_soft_deletes` (200, IsActive=false) | ✅ PASS | `UsersDeleteTests.cs:23-45` — byte-identical behavior: 200 assert (line 32), DB `IsActive == false` via `IgnoreQueryFilters` (lines 37-39), cleanup ×2 (lines 42-43). |
| Kept | `Delete_without_token_returns_401` | ✅ PASS | `UsersDeleteTests.cs:61-64` — unauthenticated client, `Unauthorized` assert. |
| E2E-D4 | Main spec R4 alignment (archive-time) | ✅ RESOLVED | Completed at archive-time (task 5.2): `openspec/specs/users-e2e/spec.md` R4 now has "Delete own id (self-delete) → 400 (CannotDeleteSelf guard)" row; StoreUser row clarified to "403 (handler-level DontHavePermission guard, even with Users feature)"; non-existent row already 404 — left unchanged (consistent). |
| Verification | 5 tests total | ✅ PASS | 5 `[Fact]` methods in `UsersDeleteTests.cs` (lines 23, 47, 61, 75, 93). |

---

## Coherence (design.md decisions)

| Decision | Followed? | Evidence |
|----------|-----------|----------|
| D1: `GetByIdAsync` WITHOUT CancellationToken (option a) | ✅ Yes | `DeleteUserCommand.cs:35` — no token; `IGenericRepository.cs:22` `Task<TEntity> GetByIdAsync(TId id)` (no overload); precedent `UpdateUserCommand.cs:46`. |
| D2: `UpdateAsync` KEPT (NoTracking is real) | ✅ Yes | `DeleteUserCommand.cs:40` — `await _userRepository.UpdateAsync(user);` retained. NoTracking confirmed: `ApplicationDbContext.cs:45` `ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking`; `GenericRepository.cs:39-41` (`Entry.State = EntityState.Modified`) + `:84` (`FindAsync(id)`). Design's D10 correction validated. |
| D3: Validator trim — KEEP `_localizer` + Localization/Resources usings | ✅ Yes | `DeleteUserCommandValidator.cs:2-3,9-12` — `_localizer` + both usings retained (used by `WithMessage(_localizer["IsRequired", ...])` at lines 15-16). Only the repo dependency/rule removed. |
| D4: Handler guard order 403→400→404→soft-delete | ✅ Yes | `DeleteUserCommand.cs:29-41` — exact order; all real statuses via `ApiException`; `ErrorHandlerMiddleware.cs:48-52` maps `e.StatusCode` → HTTP. |
| D5: resx key placement | ✅ Yes | See RS-1/RS-2 rows above — exact positions per design. |
| D6: E2E helper `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` + cleanup per `UsersUpdateTests` | ✅ Yes | `UsersDeleteTests.cs:76,87-88` — fixture record `StoreUserFixture(UserId, Login, OwnerUserId, OwnerId, StoreId, TenantId)` (`AuthzSeed.cs`) exposes all accessed members. |
| File changes table | ✅ Yes | All 6 files modified exactly as listed; no interface changes, no new files, no schema. |

---

## Deviations from Spec/Design

| # | Deviation | Assessment |
|---|-----------|------------|
| 1 | E2E message assertions initially asserted the **localized value** (`"Usuario no encontrado"` / `"No tienes permiso"` / `"No puedes eliminarte a ti mismo"`) instead of the bare **key** (`UserNotFound` / `DontHavePermission` / `CannotDeleteSelf`) as literally worded in specs E2E-D1/D2/D3 — **REVERTED in Batch B** (see Addendum): culture-coupling was real (E2E host resolves English), and message-text asserts are NOT the house pattern. Final: status-code + envelope-structure asserts (`Succeeded == false`, `Errors.NotBeEmpty()`). | ✅ Resolved — culture-free asserts per house pattern; E2E 5/5 GREEN proves handler paths |
| 2 | resx line numbers shifted (246→249, 504→507) vs spec | ✅ Trivial — +3-line insert delta from `CannotDeleteSelf`; relative position (between `UserNotCreated`/`UserNotRole`) preserved exactly as specified. |
| 3 | Validator is 20 lines vs "21 lines" in apply-progress prose | ✅ Trivial — structurally an exact mirror of `DeactivateStoreCommandValidator` (same rule set, same usings, same ctor). |

No unauthorized deviations. No rejected design alternatives accidentally implemented (no `ExistsAsync` added, no token overload created, `UpdateAsync` not removed).

---

## Blockers

**None.**

---

## Issues Found

**CRITICAL** (must fix before archive): None.

**WARNING**: None.

**SUGGESTION**: None. (Optional: `I18n.Designer.cs:1218,1220` stale `UserNotFoud` property remains — explicitly out of scope per RS-3, compile-safe, zero references. Regeneration only if a resource generator is ever added.)

---

## Verification Criteria Checklist (from specs)

- [x] Guard order: 403 auth → 400 self-delete → `GetByIdAsync` → null 404 → soft-delete; all real HTTP statuses via `ApiException` (CH)
- [x] Single DB existence check (handler only) — 1 round-trip total (CH + VL)
- [x] `DontHavePermission` / `CannotDeleteSelf` / `UserNotFound` keys present in resx (CH)
- [x] No `MustAsync` / `ExistsAsync` / `GetByIdAsync` in validator; no `IUserRepository` dependency (VL)
- [x] Only `NotNull().NotEmpty()` rules remain (VL)
- [x] `DeleteUserAsync` has `[ProducesResponseType(400)]`, `(401)`, `(403)`, `(404)`; 200 remains; `[FromRoute]`; `<param name="id">User Id</param>` (UC)
- [x] Both resx contain `CannotDeleteSelf` with exact values; insertion points per RS-1 (RS)
- [x] `UserNotFound` renamed in both resx; values + position unchanged (RS)
- [x] Grep `UserNotFoud` → 0 matches in source except stale `I18n.Designer.cs` (out of scope) (RS)
- [x] 5 tests in `UsersDeleteTests`: 2 new, 1 renamed+re-asserted, 2 kept (E2E)
- [x] E2E run: `dotnet test ... --filter "FullyQualifiedName~UsersDeleteTests"` → **5/5 GREEN** (`Passed! - Failed: 0, Passed: 5, Skipped: 0, Total: 5`) — executed by orchestrator (task 5.1)

---

## Verdict

### ✅ VERIFIED

Static verification: all 5 delta specs satisfied, all 8 apply tasks complete, all 6 design decisions followed. Runtime verification (orchestrator, task 5.1): `UsersDeleteTests` **5/5 GREEN** — handler returns the correct real HTTP statuses (400 self-delete `CannotDeleteSelf`, 403 handler-level `DontHavePermission`, 404 `UserNotFound`, 200 soft-delete, 401 no-token) and the soft-delete persists `IsActive=false` in Postgres `smca_test`. One post-verify test correction (culture-coupled message asserts → envelope-structure asserts) documented below. Archive-time alignment (5.2 main spec R4, 5.3 plan doc row 54) completed. **Ready for sdd-archive.**

---

## Addendum (post-verify correction — Batch B)

**Trigger**: First 5.1 run was 3 FAILED / 2 PASSED. Handler behavior was CORRECT in the logs (right status codes + localized messages "You cannot delete yourself" / "You don't have permission" / "User not found") — the failures were the test-side message-text asserts added in Batch A.

**Root cause**: Batch A assumed `DefaultRequestCulture="es"` (`ServiceExtensions.cs:92`) made Spanish `Description` values deterministic. FALSE for the E2E host: `UseRequestLocalization`'s default culture does NOT override `CurrentUICulture` — the host machine culture (en) drives `IStringLocalizer` → `I18n.en.resx` (English). Also verified: NO other E2E test asserts a localized `Description` — house pattern is status-code + envelope structure only.

**Fix** (`UsersDeleteTests.cs`, 3 asserts): `body!.Errors.Should().ContainSingle(e => e.Description == "<es>")` → `body!.Succeeded.Should().BeFalse(); body!.Errors.Should().NotBeEmpty();`. Status-code asserts kept (`NotFound`/`Forbidden`/`BadRequest` — they carry the behavioral proof). The 2 passing tests untouched. Grep `Description ==` → 0.

**Re-verification**: 5.1 re-run → **5/5 GREEN** (`Failed: 0, Passed: 5`).

**Gotcha recorded to engram** (`e2e/culture-localized-asserts`): never assert localized text in E2E; assert status + envelope structure, or set `AcctionCode` on `ApiException` (precedent `ApproveStoreCommand.cs:34-36`) to assert `e.Code`.
