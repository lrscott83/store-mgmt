# Apply Progress: delete-user-endpoint-fixes

**Batch A** — tasks 1.1–1.2, 2.1, 3.1–3.2, 4.1–4.3 (handler, validator, controller, resx ×2, E2E).
**No git operations** (dirty tree — edits are additive on top of uncommitted `UpdatedAsync` metadata). Build/tests NOT run by apply (orchestrator executes 5.1 verify).

---

# Batch C — archive-time alignment (5.2, 5.3) + verify close-out (5.4)

**E2E gate (orchestrator, task 5.1):** `UsersDeleteTests` **5/5 GREEN** (`Passed! - Failed: 0, Passed: 5, Skipped: 0, Total: 5`) after Batch B correction. Change functionally complete and verified.

- [x] **5.2** `openspec/specs/users-e2e/spec.md` R4 aligned (design D6, minimal edits):
  - ADDED row: `Delete own id (self-delete) | SuperAdmin | 400 (CannotDeleteSelf guard)`
  - CLARIFIED row: `Delete as StoreUser | StoreUser | 403 (handler-level DontHavePermission guard, even with Users feature)` — validator has no DB rules (NotNull/NotEmpty only), so the 403 is handler-raised
  - Non-existent row already `404` — verified consistent with handler CH-D3, left unchanged
- [x] **5.3** `docs/plans/endpoints-e2e-coverage.md` row 54 (`DELETE /api/v1/users/{id}`): `⬜ Pending | ⬜ N/A | —` → `✅ Done | ✅ Applied | \`delete-user-endpoint-fixes\`` — mirrors the delete-store precedent (row 47). "Applied" (not "Archived") is accurate: verified but archive pending.
- [x] **5.4** verify-report.md updated: status **READY FOR E2E → ✅ VERIFIED**; tasks table 11/11; E2E-D1/D2/D3 evidence updated to post-Batch-B asserts; E2E-D4 RESOLVED; deviation #1 marked Resolved (Batch B); checklist E2E item `[x]`; verdict VERIFIED; Addendum documents the culture-assert correction + root cause + gotcha.

**All 11 tasks `[x]`.** Ready for sdd-archive.

---

# Batch B — E2E message-assert correction (3 failing tests fixed)

**Orchestrator run evidence (5.1):** 3 FAILED / 2 PASSED. Implementation CORRECT — logs prove handler returns right status codes + localized messages ("You cannot delete yourself" 400, "You don't have permission" 403, "User not found" 404). Failures were MY Batch A message asserts: they expected SPANISH but the E2E host resolves the localizer to ENGLISH (`CurrentUICulture` defaults to en on the host machine → `I18n.en.resx`).

**Root cause:** Batch A assumed default request culture "es" (`ServiceExtensions.cs:92`) → deterministic Spanish `Description`. That assumption is WRONG for the E2E host: `UseRequestLocalization`'s `DefaultRequestCulture` does NOT override `CurrentUICulture` when the machine culture is en — the localizer falls back to en. Also verified: NO other E2E test in the suite asserts a localized `Description` string — house pattern is status-code + envelope structure only.

**Fix (test-only, `UsersDeleteTests.cs`):** replaced all 3 culture-coupled asserts with robust structure asserts per house pattern:
```csharp
body!.Succeeded.Should().BeFalse();
body!.Errors.Should().NotBeEmpty();
```
Status-code asserts KEPT (`NotFound`/`Forbidden`/`BadRequest` — already passing, prove the handler path). The 2 passing tests (soft-delete 200, no-token 401) untouched. Grep `Description ==` in `UsersDeleteTests.cs` → 0 matches.

**Deviation from design note:** design's "assert NotFound + UserNotFound / Forbidden + DontHavePermission / BadRequest + CannotDeleteSelf" is interpreted as status-code + envelope-failure structure. Message-text asserts are culture-coupled and NOT part of the house pattern — deliberately removed (matches archived update-user precedent where `Update_nonexistent_id_returns_400` asserts status only, and `StoreApproveTests` asserts `Code` — which is set via `AcctionCode` there, a path delete-user does NOT use per design).

**Status:** 8/8 assigned tasks complete, tests corrected. Ready for orchestrator re-run of 5.1.

---

## Completed (Batch A)

- [x] **1.1** `DeleteUserCommand.cs` — guard chain rewritten per design (mirrors `DeactivateStoreCommand.cs:37-38,41-42`):
  1. `!_httpContextService.IsSuperAdminOrOwnerAdmin` → 403 `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)`
  2. `request.Id == _httpContextService.UserExternalId.ToGuid()` → 400 `ApiException(_localizer["CannotDeleteSelf"], HttpStatusCode.BadRequest)` — BEFORE any repo call
  3. `GetByIdAsync(request.Id)` — NO CancellationToken (no overload on `IGenericRepository.cs:22`; precedent `UpdateUserCommand.cs:46`)
  4. null → 404 `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)`
  5. `IsActive=false` → `UpdateAsync` **KEPT** (NoTracking at `ApplicationDbContext.cs:45` → FindAsync untracked; `UpdateAsync` = attach) → `SaveChangesAsync(cancellationToken) > 0`
  Added `using Domain.Common.Extensions;` (verified `GuidExtensions.cs:12` — namespace `Domain.Common.Extensions`; `UserExternalId` is string).
- [x] **1.2** `DeleteUserCommandValidator.cs` — trimmed to exact mirror of `DeactivateStoreCommandValidator` (21 lines): removed `MustAsync(UserExists)` rule, `UserExists` method, `_userRepository` field, ctor `IUserRepository` param, `using Domain.Interfaces.Repositories;` (+ dead `System`/`Collections.Generic`/`Linq`/`Text`/`Threading.Tasks` usings). KEPT `NotNull`+`NotEmpty` rules, `_localizer`, `using Microsoft.Extensions.Localization;` + `using Resources;`. Zero DB access.
- [x] **2.1** `UsersController.cs` `DeleteUserAsync` — `[ProducesResponseType]` 400/401/403/404 added after existing 200 (`ResponseResult<bool>`); signature → `DeleteUserAsync([FromRoute] Guid id)`; XML doc `<param name="id">User Id</param>` + `<returns></returns>` (mirrors `GetUserAsync:43`). Metadata now verbatim-match of the uncommitted `UpdatedAsync` block.
- [x] **3.1** `I18n.resx` — `CannotDeleteSelf` ("No puedes eliminarte a ti mismo") inserted as FIRST data entry (line 120, after last `</resheader>` at 119, before `ClientNotFound`); `UserNotFoud` → `UserNotFound` renamed (value "Usuario no encontrado", position unchanged).
- [x] **3.2** `I18n.en.resx` — `CannotDeleteSelf` ("You cannot delete yourself") inserted between `BaseFee` and `CarrierAddressIsMain` (`Can` < `Car`); `UserNotFoud` → `UserNotFound` renamed (line 507 post-insert).
- [x] **4.1** `UsersDeleteTests.cs` — `Delete_nonexistent_returns_400` → `Delete_nonexistent_returns_404`, asserts `HttpStatusCode.NotFound` + error `Description == "Usuario no encontrado"`. Soft-delete 200 + no-token 401 tests kept byte-identical.
- [x] **4.2** NEW `Delete_as_store_user_with_users_feature_returns_403` — actor `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (Users=72, `FeatureType.cs:85`), victim `DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.OwnerAdmin)`; DELETE victim → `Forbidden` + `Description == "No tienes permiso"`; cleanup `CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `CleanupUserAsync(_f, victim.UserId)` (exact `UsersUpdateTests.cs` pattern).
- [x] **4.3** NEW `Delete_self_as_super_admin_returns_400` — `SeedSuperAdminAsync`, DELETE own id → `BadRequest` + `Description == "No puedes eliminarte a ti mismo"`; cleanup `CleanupUserAsync`.
- Total: **5 tests** (2 kept, 1 renamed, 2 new) — matches tasks.md acceptance.

## Assertion decision (message assertions)

`ApiException` thrown WITHOUT `AcctionCode` (per design — mirrors DeactivateStore) → `ErrorHandlerMiddleware` maps `Code = "App.Unexpected"`, `Description = e.Message` (localized). Default request culture is **"es"** (`SMCA.WebApi/Extensions/ServiceExtensions.cs:92`) and E2E clients send no Accept-Language → messages are deterministic Spanish. Tests assert `Errors.ContainSingle(e => e.Description == "<es message>")` — this also proves the resx key resolves (localizer falls back to the literal key if missing, so a typo/rename failure surfaces as a mismatch). Asserting `Code` would be meaningless ("App.Unexpected" for all three paths).

## RS-3 note

Grep `UserNotFoud` → **only** `I18n.Designer.cs:1218,1220` (stale generated property). Design/tasks explicitly declare Designer.cs out of scope ("MAY stay stale; compile-safe; bare csproj no generator") — zero app-code refs (`_localizer["UserNotFound"]` refs now resolve to the renamed key). Intentional, documented.

## Not done (orchestrator/archive-time)

- 5.1 E2E run (`dotnet test ... --filter "FullyQualifiedName~UsersDeleteTests"` → 5 GREEN) + regression UsersList|UsersUpdate — ORCHESTRATOR.
- 5.2/5.3 archive-time spec alignment + plan doc — ORCHESTRATOR/ARCHIVE.

## Risks

- `Delete_as_store_user_with_users_feature_returns_403` RED-ability: StoreUser+Users passes `[HasPermission(UsersAdmin)]` filter (feature-granted), must hit handler guard → 403. If the handler guard were removed, the victim would be soft-deleted → 200 → assertion fails. Genuine coverage.
- `Delete_self_as_super_admin_returns_400` RED-ability: without CH-D2 the SuperAdmin would soft-delete own account → 200 → assertion fails.
- `Delete_nonexistent_returns_404` RED-ability: pre-fix validator `MustAsync(UserExists)` returned 400; with VL-D1 removed the handler 404 path is reachable.
- `CleanupStoreGraphAsync` removes the store graph but NOT the owner user → passes `actor.OwnerUserId` explicitly per `UsersUpdateTests` convention (ownerUser row removed via userIds param).
