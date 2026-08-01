# Exploration: delete-user-endpoint-fixes

**Change**: `delete-user-endpoint-fixes`
**Endpoint**: `DELETE /api/v1/users/{id}` — `UsersController.DeleteUserAsync` (`backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs:72-81`)
**Date**: 2026-07-31
**Mode**: hybrid (engram + openspec)
**Method**: Every finding re-verified against real source. House patterns checked against archived precedents (`delete-store-endpoint-fixes`, `update-user-endpoint-fixes`, `get-user-by-id-endpoint-fixes`). Working tree is dirty (prior uncommitted endpoint fixes) — read-only exploration, nothing touched.

---

## CRITICAL NUANCE — F2 conflicts with D1 (must be resolved in proposal)

The task text (F2) suggests switching the validator to `ExistsAsync` (mirror `UpdateUserCommandValidator.cs:33-36`). **That fix is INCOMPATIBLE with D1 (real HTTP 404).**

- If the `MustAsync(UserExists)` rule survives (with `ExistsAsync` — which returns `false` for a truly non-existent id), the validator fails first → `ValidationException` → HTTP 400 (`ValidationBehaviour.cs:24-25` → `ErrorHandlerMiddleware.cs:42-47`). The handler's 404 (D1) becomes **dead code** for the standard non-existent case, and the E2E `Delete_nonexistent_returns_404` test stays RED forever.
- The DIRECT house precedent resolved this exact conflict: the archived `delete-store-endpoint-fixes` change **REMOVED the existence rule from the validator entirely** (`specs/validation/spec.md` VL1, VL3, VL4 — "The store existence check SHALL be the sole responsibility of the handler… The validator SHALL NOT duplicate this check"). Post-fix `DeactivateStoreCommandValidator.cs:1-21` has ONLY `NotNull`/`NotEmpty` and no repository dependency.
- The `ExistsAsync` pattern belongs to the UPDATE/GET family, whose contract is deliberately 400-via-validator. DELETE's contract (R4) is 404 — the handler owns the check.

**RECOMMENDATION (mirror DeleteStore, not UpdateUser):** Remove the `MustAsync(UserExists)` rule, the `UserExists` method, the `_userRepository` field, and the `using Domain.Interfaces.Repositories;` import from `DeleteUserCommandValidator`. The handler's single `GetByIdAsync` (already needed to soft-delete) then serves as the only existence check → nonexistent AND cross-tenant both → null → 404. This kills F2 (one DB call, not two) and makes D1 reachable. The `IUserRepository.ExistsAsync` method (`IUserRepository.cs:19`, `UserRepository.cs:99-102`) is NOT needed for this change.

---

## Per-Finding Verification

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| F1 | Misleading auth guard: permission problem reported as 400 "UserNotFound" | **CONFIRMED** | `DeleteUserCommand.cs:37-38` — `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest)`. House pattern `DeactivateStoreCommand.cs:37-38` (class `DeleteStoreCommandHandler`): `ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden)`. Key `DontHavePermission` EXISTS: `I18n.resx:132-134` ("No tienes permiso"), `I18n.en.resx:183-185` ("You don't have permission"), `I18n.Designer.cs:255-258`. |
| F2 | Double DB round-trip (validator + handler) | **CONFIRMED, but fix differs from task text** | `DeleteUserCommandValidator.cs:32` `GetByIdAsync(tenantId) != null` (materializes tracked entity via `FindAsync`, `GenericRepository.cs:82-85`); handler `DeleteUserCommand.cs:40` `GetByIdAsync(request.Id)` again. See CRITICAL NUANCE above: correct resolution = REMOVE the rule (DeleteStore precedent `specs/validation/spec.md` VL1/VL3/VL4), NOT switch to `ExistsAsync` (UpdateUser's 400-contract pattern — would strand D1). `ExistsAsync` exists (`IUserRepository.cs:19`, `UserRepository.cs:99-102`, `IgnoreQueryFilters().AnyAsync`) but is not needed. |
| F3 | Contract inconsistency: spec R4 says 404, handler+test say 400 | **CONFIRMED** | Spec `openspec/specs/users-e2e/spec.md:73` — "Non-existent id \| SuperAdmin \| 404" (row already correct per D1). Handler `DeleteUserCommand.cs:42` — 400. E2E `UsersDeleteTests.cs:45-57` — test `Delete_nonexistent_returns_400` asserts `BadRequest`. D1 feasible: `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` mirrors `DeactivateStoreCommand.cs:41-42` (StoreNotFound 404). Feasibility DEPENDS on the F2 resolution (validator rule must go or the 404 never fires). |
| F4 | Missing ProducesResponseType + missing `[FromRoute]` | **CONFIRMED** | `UsersController.cs:75-77` — Delete has only `200 OK`. Get (`:46-49`) and Update (`:60-64`) already have 400/401/403 (+404 on Update). `DeleteUserAsync(Guid id)` at `:78` lacks `[FromRoute]`. The uncommitted diff for `UpdatedAsync` shows the exact prior pattern (added 400/401/403/404 + `[FromRoute] Guid id`) — mirror it verbatim. |
| F5 | No self-delete guard (SuperAdmin can soft-delete self / another SuperAdmin) | **CONFIRMED** | No self-check anywhere in `DeleteUserCommand.cs`. `CannotDeleteSelf` does NOT exist in `I18n.resx`, `I18n.en.resx`, or `I18n.Designer.cs` (grep: zero matches). Feasible: `if (request.Id == _httpContextService.UserExternalId.ToGuid()) throw new ApiException(_localizer["CannotDeleteSelf"], HttpStatusCode.BadRequest);` — `UserExternalId` is string (`IHttpContextService.cs:6`), `ToGuid()` at `Domain/Common/Extensions/GuidExtensions.cs:12`. Precedents: `UpdateUserCommand.cs:6,50` (`request.Id != ...ToGuid()`), `UpdateUserPasswordCommand.cs:49`. Needs `using Domain.Common.Extensions;`. Guard order: after the auth guard (403), before `GetByIdAsync`. Behavior change: SuperAdmin can no longer soft-delete own account — no frontend calls DELETE (user-edit screen is OwnerAdmin→other staff; profile screens never DELETE; see update-user explore.md F-patterns). |
| F6 | Localizer key `UserNotFound` missing — only typo `UserNotFoud` | **CONFIRMED** | `I18n.resx:246-248` (value "Usuario no encontrado"), `I18n.en.resx:504-506` (value "User not found"), `I18n.Designer.cs:1218-1220` (auto-generated property). **Zero** source references to `UserNotFoud` — only the Designer.cs property itself. **42** source usages of `_localizer["UserNotFound"]` across ~20 files (validators + handlers: `DeleteUserRolesCommandValidator.cs:21`, `UpdateUserCommandValidator.cs:20`, `GetUserByIdQueryValidator.cs:20`, `UpdateUserPasswordCommandValidator.cs:26`, `ActivateUserCommandValidator.cs:25`, `ActivateUserCommand.cs:38,42`, `GetStoreUserByIdQueryValidator.cs:24`, `GetStoreUserByIdQuery.cs:36`, `GetStoreUsersQuery.cs:38`, `ExportOfflineRosterQuery.cs:64,71`, `CreateStoreUserCommand.cs:57`, `GetAllOwnersQuery.cs:38`, `CreateOwnerCommand.cs:48`, `GetAllReSellersQuery.cs:37`, `CreateReSellerCommand.cs:62`, `CreateTenantCommand.cs:44`, `ActivateFeaturesCommand.cs:45`, `GetAvailableFeaturesToStoreQuery.cs:37`, `GetAvailableModulesToStoreQuery.cs:37`, `RegisterStorePaymentCommand.cs:51`, `GetStoresToCollectQuery.cs:52`, `GetReSellerCommissionsQuery.cs:41`, `SetStorePaymentDateCommand.cs:41`, `UpdateStoreDailyUsageCommand.cs:48`, `DeleteUserCommand.cs:38,42`). All currently fall back to the literal string "UserNotFound" (IStringLocalizer behavior). Renaming the key localizes ALL of them. **Position unchanged in both files**: stays between `UserNotCreated` and `UserNotRole` (`UserNotFound` sorts after `UserNotCreated`, before `UserNotRole` — verified in both resx). **Designer.cs will NOT regenerate on `dotnet build`** (`Resources/Resources.csproj` is a bare SDK csproj — no `Generator` wiring); the stale `UserNotFoud` property remains but is compile-safe (nothing references it). Precedent: `I18n.Designer.cs` last touched in "Initial Commit" — never modified since. Optional: hand-rename the Designer property for cleanliness (not required). |
| F7 | Clean code: `tenantId` copypaste + missing ct propagation | **CONFIRMED** | `DeleteUserCommandValidator.cs:30-32` — param named `tenantId`, `GetByIdAsync(tenantId)` without `cancellationToken`. `UpdateUserCommandValidator.cs:33-36` already fixed (`userId` + ct passed to `ExistsAsync`). **Moot if F2 resolution removes the method entirely** (DeleteStore pattern). |
| F8 | XML docs: missing `<param name="id">` | **CONFIRMED** | `UsersController.cs:72-74` — Delete summary has no `<param>`. Get's format at `:43`: `<param name="id">User Id</param>`. |
| MIRROR | `WebApiTest/Controllers/v1/UsersController.cs:72-80` — needs same changes? | **NO CHANGE** | Calls `new DeleteUserCommand(id)` — command type/ctor unchanged by this fix. WebApiTest is NOT in `SMCA.sln` (Select-String: no match) — orphaned project. Precedent: delete-store touched WebApiTest ONLY because it referenced a non-existent class (`proposal.md:11` — compile fix, not feature mirror); update-user did NOT modify the WebApiTest controller (`design.md:11` — only constrained the design to not break it); `auth-e2e-pilot/proposal.md:43` — "Legacy projects WebApi / WebApiTest (not in SMCA.sln) are ignored"; `backend-test-and-debt-closure/design.md:86` — "WebApiTest/ (orphaned, not in SMCA.sln — pre-existing)". resx rename is compile-safe for it (string-key lookups). |

## Spec R4 (D6) — current vs needed

`openspec/specs/users-e2e/spec.md:64-73`:

| Spec row | Status |
|----------|--------|
| Soft-delete active user → 200 | tested (`UsersDeleteTests.cs:19-43`) |
| Delete as OwnerAdmin+UsersAdmin → 200 | **untested** — not in D5 scope |
| Delete as StoreUser → 403 (`:70`) | row exists; new E2E will be StoreUser **WITH** Users feature (handler-level 403 per D2). A StoreUser without the feature → filter-level 403 (`HasPermissionAttribute.cs:104`). Both are 403 — row stays valid; delta can clarify handler-level. |
| Delete without token → 401 | tested (`:59-64`) |
| Already inactive user → 200, IsActive stays false | untested — unchanged behavior, not in D5 scope |
| Non-existent id → 404 (`:73`) | **already correct** per D1 — NO row change needed (opposite of the R2/R3 archive alignments, which went 404→400; here code moves TO the spec) |

**D6 additions at archive**: (1) add "Delete self as SuperAdmin → 400" row; (2) delta note clarifying the StoreUser 403 row (feature-granted → handler-level 403).

---

## Files to Change (complete list)

| File | Change |
|------|--------|
| `backend/src/Application/Features/UserManagement/Users/Commands/DeleteUser/DeleteUserCommand.cs` | F1: auth guard → `DontHavePermission` + `HttpStatusCode.Forbidden`; D3: self-delete guard (`CannotDeleteSelf` + 400) before the DB call; D1: null-user → `UserNotFound` + `HttpStatusCode.NotFound`; add `using Domain.Common.Extensions;` |
| `backend/src/Application/Features/UserManagement/Users/Commands/DeleteUser/DeleteUserCommandValidator.cs` | F2/F7: remove `MustAsync(UserExists)` rule, `UserExists` method, `_userRepository` field, `using Domain.Interfaces.Repositories;` — leave only `NotNull`/`NotEmpty` (mirror `DeactivateStoreCommandValidator.cs`). Constructor drops `IUserRepository`. |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | F4: add `400/401/403/404 ProducesResponseType` + `[FromRoute] Guid id` (mirror the `UpdatedAsync` diff); F8: `<param name="id">User Id</param>` |
| `backend/src/Resources/Localization/I18n.resx` | F5: add `CannotDeleteSelf` (first data entry); F6: rename `UserNotFoud` → `UserNotFound` (line 246, value unchanged) |
| `backend/src/Resources/Localization/I18n.en.resx` | F5: add `CannotDeleteSelf` (between `BaseFee` and `CarrierAddressIsMain`); F6: rename `UserNotFoud` → `UserNotFound` (line 504, value unchanged) |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersDeleteTests.cs` | F3: `Delete_nonexistent_returns_400` → `Delete_nonexistent_returns_404` (assert `NotFound`); D5: new `Delete_as_store_user_with_users_feature_returns_403`; new self-delete test (SuperAdmin deletes self → 400). Keep 200 + 401 tests. |
| `openspec/specs/users-e2e/spec.md` | D6 at archive: R4 add self-delete row + handler-level 403 clarification delta (non-existent row already 404 — no change) |
| `docs/plans/endpoints-e2e-coverage.md` | Line 54: `DELETE /api/v1/users/{id}` row ⬜ Pending → ✅ Done/Applied (mirror line 47 delete-store row). File already modified in dirty tree — merge carefully. |
| `backend/src/WebApiTest/Controllers/v1/UsersController.cs` | **NO CHANGE** (orphaned, compiles fine, no broken reference) |
| `backend/src/Resources/Localization/I18n.Designer.cs` | **Optional** hand-rename `UserNotFoud` property (stale otherwise; compile-safe to skip — precedent: never touched) |

## Exact resx entry structure (copy the `<data>` format from existing keys)

**I18n.resx** (Spanish — values mirror `DontHavePermission` style "No tienes permiso"):
- `CannotDeleteSelf` goes **before** line 120 (`<data name="ClientNotFound"` — first data entry; `Can` < `Cli`; nothing precedes it after the `</resheader>` block at line 119):
```xml
  <data name="CannotDeleteSelf" xml:space="preserve">
    <value>No puedes eliminarte a ti mismo</value>
  </data>
```
- Rename at line 246: `name="UserNotFoud"` → `name="UserNotFound"` (value "Usuario no encontrado" unchanged; position unchanged between `UserNotCreated` and `UserNotRole`).

**I18n.en.resx** (English):
- `CannotDeleteSelf` goes **between** `BaseFee` (lines 123-125) and `CarrierAddressIsMain` (line 126) — `Can` < `Car` ('n' < 'r'):
```xml
  <data name="CannotDeleteSelf" xml:space="preserve">
    <value>You cannot delete yourself</value>
  </data>
```
- Rename at line 504: `name="UserNotFoud"` → `name="UserNotFound"` (value "User not found" unchanged; position unchanged between `UserNotCreated` and `UserNotRole`).

Note: wording of the two values is a proposal — confirm with user at proposal time.

## E2E seed helpers for the 403 StoreUser scenario (file:line)

| Helper | Definition | Use |
|--------|-----------|-----|
| `AuthzSeed.SeedStoreUserAsync(factory, int? grantedFeatureId)` | `SMCA.WebApi.E2ETests/Infrastructure/AuthzSeed.cs:69-96` — creates Owner→Store→StoreModule(Management)+StoreUser+UserRole(StoreUser); grants `StoreRoleFeature.Create(store.Id, RoleType.StoreUser, fid, tenantId)` when `grantedFeatureId` set | **403 test**: `SeedStoreUserAsync(_f, (int)FeatureType.Users)` (Users=72, `FeatureType.cs:85`). StoreUser passes `[HasPermission(UsersAdmin)]` filter (`StoreRoleFeatures.cs:187-190` UsersAdmin=HasFeature(Users); `HasPermissionAttribute.cs:98-106`), then handler guard `!IsSuperAdminOrOwnerAdmin` → **403 Forbidden** after F1 fix. |
| `AuthzSeed.CleanupStoreGraphAsync(factory, storeId, params userIds)` | `AuthzSeed.cs:98-115` — removes StoreRoleFeature/StoreUser/StoreModule/Store/Owner/UserRole/User | 403 test cleanup (precedent `UsersUpdateTests.cs:109`) |
| `DbTestHelpers.SeedSuperAdminAsync(factory, login, password)` | `DbTestHelpers.cs:24-35` | self-delete + 404 tests |
| `DbTestHelpers.AuthedClient(factory, userId, login)` | `DbTestHelpers.cs:120-126` | authenticated client for all tests |
| `DbTestHelpers.CleanupUserAsync(factory, userId)` | `DbTestHelpers.cs:58-80` | cleanup (handles Owner FK first) |
| `DbTestHelpers.SeedUserWithRoleAsync(factory, roleId)` | `DbTestHelpers.cs:108-118` | existing victim seeding (200 test) |

E2E run command (precedent `update-user-endpoint-fixes/explore.md:91-94`, requires Postgres `smca_test` running):
`dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersDeleteTests"`

## Other issues found (out of scope, worth flagging)

1. **`ActivateUserCommand.cs:37-42`** — the EXACT same F1 anti-pattern (auth guard throws 400 `UserNotFound`; null-user throws 400) + `ActivateUserCommandValidator.cs:25` same `MustAsync(UserExists)` double-query. Same bug family on `POST /api/v1/users/activate` — candidate for a follow-up change.
2. **`DeleteUserRolesCommandValidator.cs:28-29`** — same `GetByIdAsync != null` existence pattern (param correctly named `userId` there). Adjacent, out of scope.
3. **Project-wide 400-vs-404 mismatch** — 20+ handlers throw `ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest)` for null users (`GetAllOwnersQuery.cs:38`, `GetStoreUserByIdQuery.cs:36`, etc.). The F6 rename fixes their message text; the status-code contract stays 400 for them (only DELETE moves to 404 per R4). Not this change's scope.
4. **`I18n.Designer.cs` staleness** after the F6 rename — harmless (nothing references the property), but if the team wants the strongly-typed surface correct, hand-rename `UserNotFoud` → `UserNotFound` at lines 1218-1220 (or regenerate in VS).
5. **Test naming** — rename `Delete_nonexistent_returns_400` alongside the assert change; convention in this suite is `{Verb}_{scenario}_returns_{status}`.
6. **`ErrorHandlerMiddleware.cs`** — already in the dirty tree (modified by prior changes) and already maps `ApiException.StatusCode` → HTTP status (`:48-53`); **no change needed** for 403/404 — they flow through automatically.

## Risks

- **F2-vs-D1 contradiction** if the proposal keeps `ExistsAsync` in the validator: handler 404 unreachable, `Delete_nonexistent_returns_404` RED forever. Resolution REQUIRED at proposal: remove the validator rule (DeleteStore precedent).
- **Dirty working tree** (prior uncommitted endpoint fixes): `UsersController.cs`, `openspec/specs/users-e2e/spec.md`, `UsersUpdateTests.cs`, `ErrorHandlerMiddleware.cs`, `docs/plans/endpoints-e2e-coverage.md` all have uncommitted edits — apply phase must edit incrementally without reverting them; orchestrator must sequence commits carefully (precedent: GET verify-report Deviation 3).
- **Self-delete guard is a behavior change** (SuperAdmin can no longer soft-delete own account) — verified no frontend calls DELETE, but confirm with user at proposal.
- **resx wording** (`CannotDeleteSelf` values) is a proposal — confirm at proposal/spec.
- **Designer.cs not auto-regenerated** on `dotnet build` — expected; document in apply notes.
- **403 test assertion** depends on the F1 fix being in place (today it would 403 anyway from the filter for StoreUser-without-feature, but with the Users feature it passes the filter and today's handler throws 400 `UserNotFound` → the test asserts 403 → RED before F1, GREEN after) — proper RED→GREEN capability.

## Ready for Proposal

Yes. All 8 findings verified with file:line evidence; one contradiction (F2 vs D1) surfaced with the archived DeleteStore precedent as the resolution; WebApiTest mirror confirmed no-change; resx insertion points and entry structures captured exactly; E2E helper matrix mapped. The proposal MUST resolve: (1) remove validator rule vs keep ExistsAsync (recommended: remove), (2) `CannotDeleteSelf` value wording, (3) whether the self-delete behavior change is acceptable.
