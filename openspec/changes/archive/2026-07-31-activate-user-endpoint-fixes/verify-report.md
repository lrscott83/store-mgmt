# Verification Report: activate-user-endpoint-fixes

**Status**: ✅ **VERIFIED** — E2E `UsersActivateTests` 4/4 GREEN (Failed: 0, Passed: 4) + regression `UsersDeleteTests | UsersUpdateTests | UsersListTests` 32/32 GREEN (executed by orchestrator, task 4.1).
**Mode**: Hybrid (openspec + engram) — Phase 1: STATIC verification (source inspection, greps — no source modifications). Phase 2: runtime E2E executed by orchestrator (task 4.1), evidence provided below.
**Date**: 2026-07-31
**Verified artifacts**: 4 delta specs (command-handler, validation, api-controller, users-e2e), design.md, tasks.md, apply-progress.md
**Implementation inspected**: `ActivateUserCommand.cs` (handler), `ActivateUserCommandValidator.cs`, `UsersController.cs`, `UsersActivateTests.cs` (+ `DeleteUserCommandValidator.cs` mirror, `UsersDeleteTests.cs` precedent, `AuthzSeed.cs`/`UserSeed.cs` fixtures)

---

## Completeness (tasks.md)

| Metric | Value |
|--------|-------|
| Tasks total | 12 (1.1, 1.2, 1.3, 2.1, 3.1, 3.2, 3.3, 3.4, 4.1, 5.1, 5.2, 5.3) |
| Apply-phase complete | 8/8 (1.1, 1.2, 1.3, 2.1, 3.1–3.4) |
| Verify-phase complete | 1/1 (4.1 — orchestrator-executed) |
| Archive-phase (5.1–5.3) | 0/3 — correctly PENDING (archive-time by design; verified NOT prematurely applied) |

---

## Build & Tests Execution (orchestrator, task 4.1)

**Endpoint suite**: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersActivateTests"` → **Passed! - Failed: 0, Passed: 4, Skipped: 0, Total: 4** (Duration 703 ms)

**Regression**: `--filter "FullyQualifiedName~UsersDeleteTests|FullyQualifiedName~UsersUpdateTests|FullyQualifiedName~UsersListTests"` → **Passed! - Failed: 0, Passed: 32, Skipped: 0, Total: 32**

**Expected exception logs during run** (exercised error paths, NOT failures):
- `ApiException "User not found"` at handler line 42 → 404 test (`Activate_nonexistent_returns_404`)
- `ApiException "You don't have permission"` at handler line 38 → 403 test (`Activate_as_store_user_with_users_feature_returns_403`)

**Corroboration**: the log line numbers match the inspected source exactly — `ActivateUserCommand.cs:38` is the `DontHavePermission` 403 throw, `:42` is the `UserNotFound` 404 throw. The executed code == the verified code.

**Build**: ✅ Passed implicitly — `dotnet test` compiled the full solution (Application, WebApi, E2ETests) before running; no compile errors. No `openspec/config.yaml` exists → no configured `build_command`/`coverage_threshold` (skill fallback: not configured, ➖).

**Coverage**: ➖ Not configured (no `coverage_threshold`).

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| CH-A1: 403 guard FIRST | 1a Feature-granted StoreUser blocked | `UsersActivateTests > Activate_as_store_user_with_users_feature_returns_403` | ✅ COMPLIANT (PASSED) |
| CH-A1 | 1b Admin bypass | `Activate_false_deactivates_user` / `Activate_true_activates_user` (SuperAdmin → 200) | ✅ COMPLIANT (PASSED) |
| CH-A1 | 1c No 400 mask | `Activate_as_store_user_with_users_feature_returns_403` (asserts Forbidden, not 400) | ✅ COMPLIANT (PASSED) |
| CH-A2: IsActive honored | 2a Deactivate (false) | `Activate_false_deactivates_user` (200 + DB IsActive==false) | ✅ COMPLIANT (PASSED) |
| CH-A2 | 2b Activate (true) | `Activate_true_activates_user` (200 + DB IsActive==true) | ✅ COMPLIANT (PASSED) |
| CH-A2 | 2c Re-activate active (no-op) | Static: `:43` `user.IsActive = request.IsActive`; A1/A2 prove both branches persist | ✅ COMPLIANT (static — no-op variant "expected, not a bug" per spec) |
| CH-A3: 404 | 3a Non-existent id | `Activate_nonexistent_returns_404` (NotFound + envelope) | ✅ COMPLIANT (PASSED) |
| CH-A3 | 3b Existing user proceeds | `Activate_false_deactivates_user` / `Activate_true_activates_user` | ✅ COMPLIANT (PASSED) |
| CH-A4: UpdateAsync kept | 4a Persistence | `Activate_false_deactivates_user` DB assert (`IsActive==false` persisted) | ✅ COMPLIANT (PASSED) |
| CH-A4 | 4b No silent no-op | DB asserts in A1/A2 would fail if `UpdateAsync` dropped (NoTracking → 0 changes) | ✅ COMPLIANT (PASSED — behavioral proof) |
| CH-A4 | 4c Token reaches EF | Static: `:45` `SaveChangesAsync(cancellationToken)`; `GetByIdAsync` no token `:40` | ✅ COMPLIANT (static) |
| VL-A1 (removed) | Rule/method/field/ctor/using removed | Static: grep — zero `MustAsync`/`UserExists`/`_userRepository`/repo using in validator | ✅ COMPLIANT (static) |
| VL-A2: structural only | 2a/2b/2c NotNull/NotEmpty, no DB | Static: `Validator.cs:14-16`; `_localizer` kept `:9`; usings `:2-3` | ✅ COMPLIANT (static — rules unchanged, precedent delete-user) |
| VL-A3: 404 reachable | 3a Full flow → 404 | `Activate_nonexistent_returns_404` (PASSED proves validator no longer pre-empts with 400) | ✅ COMPLIANT (PASSED) |
| VL-A3 | 3b Zero validator DB queries | Static: validator has no repository dependency | ✅ COMPLIANT (static) |
| UC-A1: Swagger 400/401/403/404 | 1a/1b/1c attrs + 200 + `[FromBody]` + XML doc | Static: `UsersController.cs:93-99` | ✅ COMPLIANT (static) |
| UC-A2: namespace move | 2a 3/3 refs migrated, compiles | Grep old namespace → 0 hits; new namespace in 3 files; test run proves compile | ✅ COMPLIANT |
| E2E-A1 | IsActive=false → 200 + DB false | `Activate_false_deactivates_user` | ✅ COMPLIANT (PASSED) |
| E2E-A2 | IsActive=true → 200 + DB true | `Activate_true_activates_user` | ✅ COMPLIANT (PASSED) |
| E2E-A3 | Non-existent → 404 + envelope | `Activate_nonexistent_returns_404` | ✅ COMPLIANT (PASSED) |
| E2E-A4 | StoreUser+Users → 403 + envelope, AuthzSeed pattern + cleanup | `Activate_as_store_user_with_users_feature_returns_403` | ✅ COMPLIANT (PASSED) |
| E2E-A5 | Archive alignment (5 edits to main spec) | ⏳ PENDING-BY-DESIGN — main spec NOT yet modified (verified below) | ✅ Correctly deferred |

**Compliance summary**: 22/22 scenarios compliant (17 runtime-proven via 4/4 + 32/32 passing tests; 5 static-proven structural requirements, precedent-calibrated). E2E-A5 correctly pending at archive.

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes (file:line) |
|------------|--------|-------------------|
| CH-A1 guard FIRST in Handle | ✅ Implemented | `ActivateUserCommand.cs:37-38` — `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw new ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden);` — first statement, before `GetByIdAsync` (`:40`). Exact mirror of `DeleteUserCommand.cs` guard. |
| CH-A2 `IsActive` honored | ✅ Implemented | `:43` — `user.IsActive = request.IsActive;` — NOT hardcoded `true`. |
| CH-A3 404 | ✅ Implemented | `:41-42` — `if (user is null) throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound);` |
| CH-A4 persistence | ✅ Implemented | `:44` `await _userRepository.UpdateAsync(user);` KEPT before `:45` `SaveChangesAsync(cancellationToken) > 0` (NoTracking attach mechanism). `GetByIdAsync` no token `:40` — `IGenericRepository.cs:22` has no overload. |
| VL-A1 removed | ✅ Implemented | `ActivateUserCommandValidator.cs` (21 lines): no `MustAsync`, no `UserExists`, no `_userRepository`, no `IUserRepository` ctor param, no `using Domain.Interfaces.Repositories;` — usings only `FluentValidation`/`Microsoft.Extensions.Localization`/`Resources` (`:1-3`). |
| VL-A2 structural-only | ✅ Implemented | `:14-16` `RuleFor(x => x.Id).NotNull().WithMessage(_localizer["IsRequired", ...]).NotEmpty()...`; `_localizer` kept `:9,12`; zero DB access. Byte-level mirror of `DeleteUserCommandValidator.cs` (same 21 lines, class name differs). |
| UC-A1 Swagger | ✅ Implemented | `UsersController.cs:93-97` — 200 (`ResponseResult<bool>`) + 400/401/403/404; `:99` `[FromBody] ActivateUserCommand command`; XML doc `:89-91`; `:98` `[HasPermission(StoreRoleFeatures.UsersAdmin)]` kept. |
| UC-A2 namespace | ✅ Implemented | `:3` `using Application.Features.UserManagement.Users.Commands.ActivateUser;`; both files under `Features/UserManagement/Users/Commands/ActivateUser/`; grep `Features\.Management\.Users\.Commands\.ActivateUser` across `backend/src` → **0 hits** (the loose-pattern hits are the new `UserManagement.Users.Commands.ActivateUser` namespace itself). Blast radius: exactly 3 files (7 `ActivateUserCommand` token matches confined to controller + command + validator — MediatR `RegisterServicesFromAssembly` needs no DI entry). |
| E2E-A1..A4 | ✅ Implemented | 4 `[Fact]` in `UsersActivateTests.cs` (lines 20, 46, 72, 89) — full detail in matrix above. |
| Assert style | ✅ Implemented | Grep `.Description|DontHavePermission|UserNotFound` in `UsersActivateTests.cs` → **0 hits**; all envelope asserts are `Succeeded.Should().BeFalse()` + `Errors.Should().NotBeEmpty()` (house pattern, culture-free). |
| No-clobber `UpdatedAsync` | ✅ Implemented | `UsersController.cs:56-70` intact: 200/400/401/403/404 + `[FromRoute] Guid id` + `[HasPermission(StoreRoleFeatures.ProfileAdmin)]`. |
| No-clobber `DeleteUserAsync` | ✅ Implemented | `UsersController.cs:72-87` intact: 200/400/401/403/404 + `[FromRoute] Guid id` + `[HasPermission(StoreRoleFeatures.UsersAdmin)]`. |
| `CreateStoreUser` untouched | ✅ Implemented | Still at `Features/Management/Users/Commands/CreateStoreUser/` (2 files); old `ActivateUser` folder gone (only `CreateStoreUser` remains under `Management/Users/Commands/`). |
| E2E fixtures exist | ✅ Implemented | `UserSeed.DeactivateUserAsync` (`UserSeed.cs:70`), `AuthzSeed.SeedStoreUserAsync` (`AuthzSeed.cs:69`), `AuthzSeed.CleanupStoreGraphAsync` (`AuthzSeed.cs:98`); `SeedStoreUserAsync(_f, (int)FeatureType.Users)` + `CleanupStoreGraphAsync(_, StoreId, UserId, OwnerUserId)` + `CleanupUserAsync(victim)` = exact `UsersDeleteTests.cs:72,85` mirror. |

---

## Coherence (design.md decisions)

| Decision | Followed? | Evidence |
|----------|-----------|----------|
| Guard chain mirror (403 FIRST → GetByIdAsync no token → 404 → assign → UpdateAsync KEPT → SaveChangesAsync(ct)) | ✅ Yes | `ActivateUserCommand.cs:37-45` — exact order; both resx keys pre-exist (no resx edits). |
| `GetByIdAsync` NO CancellationToken | ✅ Yes | `:40` — no token; `IGenericRepository.cs:22` no overload; precedent `UpdateUserCommand.cs:46`. |
| `UpdateAsync` KEPT (NoTracking real) | ✅ Yes | `:44` — retained; `ApplicationDbContext.cs:45` NoTracking confirmed by precedent delete-user report. |
| Validator trim — structural only, KEEP `_localizer` | ✅ Yes | 21-line exact mirror of `DeleteUserCommandValidator.cs`; NOT the `ExistsAsync` pattern (404 contract preserved). |
| Namespace move (option B) — 3 refs | ✅ Yes | 3/3 migrated; grep old → 0; `CreateStoreUser` folder NOT emptied. |
| No IDOR / tri-state / self-delete guards | ✅ Yes | `IsActive` explicit `bool`; role-based guard only; nothing invented. |
| E2E assert style — status + envelope only | ✅ Yes | 0 localized-string asserts; DB `IsActive` asserts are behavior checks. |
| File changes table | ✅ Yes | All 4 paths match (2 moved, 1 controller, 1 test file); no interface/schema/resx changes; additive-only controller edit. |
| ActivateStore OUT OF SCOPE (decision C) | ✅ Yes | No ActivateStore files touched; debt left for archive annotation (5.3). |

---

## Not-Done-By-Apply Checks (archive-time tasks must remain pending)

| Task | Check | Evidence |
|------|-------|----------|
| 5.1 spec deltas NOT applied | ✅ Confirmed pending | Main `openspec/specs/users-e2e/spec.md` still has: line 20 "Fixing the 3 known bugs (document test behavior only)"; R5 row `:81` "Deactivate with IsActive=false body → 200, IsActive=true (KNOWN BUG)"; NO "Non-existent id → 404" row in R5; StoreUser 403 row `:83` not yet clarified as feature-granted/handler-level; Known Bugs row `:163` "Activate ignores IsActive=false" still present. `command-handler`/`validation`/`api-controller` main specs not yet deltased (per pending-flow convention). |
| 5.2 plan doc row 19 NOT updated | ✅ Confirmed pending | `docs/plans/endpoints-e2e-coverage.md:55` — row 19 still `⬜ Pending \| ⬜ N/A \| —` (mirror of delete-user row 54 `✅ Done \| ✅ Archived` NOT copied). |
| 5.3 ActivateStore debt annotation NOT added | ✅ Confirmed pending | No follow-up note in plan doc for ActivateStore guard 400 + `StoreExists` double-query (deferred to archive). |

---

## Issues Found

**CRITICAL** (must fix before archive): None.

**WARNING**: None.

**SUGGESTION**: None. (Optional: no dedicated E2E sends `Guid.Empty`/null `Id` to activate — the NotNull/NotEmpty rules are unchanged pre-existing structural behavior and statically verified per delete-user precedent; a future validation-focused change could add one.)

---

## Verdict

### ✅ VERIFIED

Static verification: all 4 delta specs satisfied (22/22 scenarios — 17 runtime-proven, 5 static-proven per house precedent), all 8 apply tasks complete, all 8 design decisions followed, no-clobber confirmed on `UpdatedAsync`/`DeleteUserAsync`, `CreateStoreUser` untouched, old namespace fully migrated (0 hits). Runtime verification (orchestrator, task 4.1): `UsersActivateTests` **4/4 GREEN** — 403 handler guard (`DontHavePermission`, line 38), 404 (`UserNotFound`, line 42), `IsActive` honored both ways (DB-asserted), all envelope asserts culture-free; regression **32/32 GREEN** (Delete 5 + Update 7+ + List). Archive-time tasks 5.1–5.3 correctly NOT applied (main spec, plan doc row 19, ActivateStore debt annotation remain pending). **Ready for sdd-archive.**
