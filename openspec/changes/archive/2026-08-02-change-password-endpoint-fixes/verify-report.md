# Verification Report: change-password-endpoint-fixes

**Change**: `change-password-endpoint-fixes`
**Date**: 2026-08-02
**Mode**: HYBRID (openspec + engram)
**Verification type**: STATIC source inspection against specs/tasks/design + documented apply test evidence (8/8 E2E GREEN, 33/33 regression GREEN, build 0 errors). No git commits (constraint respected — dirty tree matches change exactly).

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 7 (1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3 = 9 checkbox items) |
| Tasks complete | 9 |
| Tasks incomplete | 0 |

All tasks `[x]` in tasks.md; apply-progress.md confirms all phases complete. Task 1.2 (no unit tests) respected — repo convention.

---

## Build & Tests Execution

**Build**: ✅ Passed (apply evidence — `dotnet build backend/src/SMCA.sln` → 0 errors, 163 pre-existing warnings, none in modified files)

**Tests**: ✅ 8/8 change-password E2E GREEN + ✅ 33/33 sibling regression GREEN (apply evidence: `UsersUpdateTests|UsersDeleteTests|UsersRolesTests|UsersActivateTests` — superset of tasks recommendation)

**Coverage**: ➖ Not configured (no openspec/config.yaml exists)

> NOTE: per orchestrator instruction, test re-run is the orchestrator's job; this report verifies implementation statically against spec/tasks/design and cross-checks the documented apply results (apply-progress.md + engram #570) against the current source.

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| UC-CPW1 Route `change-password/{id}` + `[FromBody]` | 1a/1b/1c | `UsersChangePasswordTests.cs` (all 8 via `{id}` route) | ✅ COMPLIANT |
| UC-CPW2 ProducesResponseType 200/400/401/403/404 | 2a-2e | Static: `UsersController.cs:143-147` | ✅ COMPLIANT |
| UC-CPW3 ActionCode switch → real statuses | 3a-3d | `Change_password_with_wrong_old_password_returns_400`, `Change_password_cross_tenant_owner_admin_returns_404`, `Change_own_password_returns_200_and_relogin` | ✅ COMPLIANT |
| CH-CPW1 Null-guard → 404 | 1a/1b | Static: `UpdateUserPasswordCommand.cs:48-49` | ✅ COMPLIANT (no E2E — race window) |
| CH-CPW2 VerifyPassword self branch | 2a/2b/2c | `Change_own_password_returns_200_and_relogin`, `Change_password_with_wrong_old_password_returns_400` | ✅ COMPLIANT |
| CH-CPW3 Admin tenant-scope check | 3a/3b/3c/3d | `Change_password_cross_tenant_owner_admin_returns_404`, `Change_password_same_tenant_owner_admin_returns_200`, `Change_password_super_admin_cross_tenant_returns_200` | ✅ COMPLIANT |
| CH-CPW4 Real failure ActionCodes | 4a/4b/4c | Covered by 400/404 tests above | ✅ COMPLIANT |
| CH-CPW5 UpdateAsync + SaveChangesAsync retained | 5a/5b/5c | `Change_own_password_returns_200_and_relogin` (persist proven by re-login) | ✅ COMPLIANT |
| VL-CPW1 ExistsAsync swap | 1a/1b/1c | `Change_password_with_nonexistent_id_returns_400` | ✅ COMPLIANT |
| VL-CPW2 Param renamed `userId` | 2a | Static: `UpdateUserPasswordCommandValidator.cs:40` | ✅ COMPLIANT |
| VL-CPW3 NewPassword 8 + uppercase | 3a/3b/3c | `Change_password_with_weak_new_password_returns_400` (both cases) | ✅ COMPLIANT |
| VL-CPW4 Required rules retained → real 400 | 4a/4b/4c | Static + validation pipeline precedent | ✅ COMPLIANT |
| E2E-CPW1 R8 404→400 (archive) | 1a/1b | `Change_password_with_nonexistent_id_returns_400` (400) | ✅ COMPLIANT (delta spec; main spec deferred to archive) |
| E2E-CPW2 Wrong-old pinned 400 | 2a/2b | `Change_password_with_wrong_old_password_returns_400` (real 400) | ✅ COMPLIANT |
| E2E-CPW3 Self change + re-login proof | 3a/3b/3c | `Change_own_password_returns_200_and_relogin` — re-login NEW → 200 + token; login OLD → 401 + ActionCode 401 | ✅ COMPLIANT |
| E2E-CPW4 Wrong old → real 400 | 4a/4b | `Change_password_with_wrong_old_password_returns_400` | ✅ COMPLIANT |
| E2E-CPW5 Weak NewPassword → 400 | 5a/5b | `Change_password_with_weak_new_password_returns_400` (7ch + no-uppercase) | ✅ COMPLIANT |
| E2E-CPW6 Non-existent id → 400 | 6a | `Change_password_with_nonexistent_id_returns_400` | ✅ COMPLIANT |
| E2E-CPW7 Cross-tenant OwnerAdmin → 404 | 7a/7b | `Change_password_cross_tenant_owner_admin_returns_404` | ✅ COMPLIANT |
| E2E-CPW8 Same-tenant OwnerAdmin → 200 | 8a | `Change_password_same_tenant_owner_admin_returns_200` | ✅ COMPLIANT |
| E2E-CPW9 StoreUser w/o Profile → 403 | 9a | `Change_password_as_store_user_without_permission_returns_403` (status-only) | ✅ COMPLIANT |
| E2E-CPW10 SuperAdmin cross-tenant → 200 | 10a | `Change_password_super_admin_cross_tenant_returns_200` | ✅ COMPLIANT |
| PF-CPW1 Plan doc + BEFORE/AFTER | 1a/1b/1c | `docs/plans/2026-08-02-change-password-contract-frontend.md` exists (:8-26) | ✅ COMPLIANT |
| PF-CPW2 Consumers documented | 2a/2b | Doc :30-32 (Angular + React; admin reset REMOVED) | ✅ COMPLIANT |
| PF-CPW3 Frontend tasks specified | 3a/3b/3c | Doc :36-39 (no logout on 4xx, {id} URL, tests) | ✅ COMPLIANT |
| PF-CPW4 Verification criteria | 4a | Doc :47-52 | ✅ COMPLIANT |

**Compliance summary**: 26/26 scenarios compliant (static evidence + documented apply test results).

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Route `change-password/{id}` + `[FromBody]` + `command.UserId = id` | ✅ Implemented | `UsersController.cs:142,149,151` |
| ProducesResponseType 200/400/401/403/404 | ✅ Implemented | `UsersController.cs:143-147` (`ResponseResult<bool>` on 200) |
| ActionCode switch (400→BadRequest, 401→Unauthorized, 403→StatusCode(403), 404→NotFound, _→BadRequest) | ✅ Implemented | `UsersController.cs:156-163`; zero `Ok(failure)` |
| `[HasPermission(StoreRoleFeatures.ProfileAdmin)]` retained | ✅ Implemented | `UsersController.cs:148` |
| Handler null-guard → 404 `UserNotFound` | ✅ Implemented | `UpdateUserPasswordCommand.cs:47-49` (`User? user`, no NRE) |
| Self branch `VerifyPassword(OldPassword, user.Password)` → 400 | ✅ Implemented | `UpdateUserPasswordCommand.cs:51-54`; zero HashPassword-vs-OldPassword |
| Admin gate `!IsSuperAdminOrOwnerAdmin` → 404 | ✅ Implemented | `UpdateUserPasswordCommand.cs:56-57` |
| Tenant-scope `!IsSuperAdmin && user.TenantId != TenantId.ToGuid()` → 404 | ✅ Implemented | `UpdateUserPasswordCommand.cs:59-61` (SuperAdmin bypass; ToGuid null→Empty fail-closed) |
| `HashPassword(NewPassword)` + `UpdateAsync` + `SaveChangesAsync > 0` | ✅ Implemented | `UpdateUserPasswordCommand.cs:63-65` |
| NO `StartsWith('$')` branch | ✅ Implemented | Handler read in full — absent (upgrade-by-change) |
| Validator `ExistsAsync(userId, ct)` single query | ✅ Implemented | `UpdateUserPasswordCommandValidator.cs:42` + `UserRepository.cs:99-102` (`IgnoreQueryFilters().AnyAsync`) |
| Param `userId` (was `tenantId`) | ✅ Implemented | `UpdateUserPasswordCommandValidator.cs:40` |
| NewPassword `MinimumLength(8)` + uppercase, new keys | ✅ Implemented | `UpdateUserPasswordCommandValidator.cs:35-36` (mirrors Register) |
| OldPassword/NewPassword NotNull/NotEmpty retained | ✅ Implemented | `UpdateUserPasswordCommandValidator.cs:28-34` |
| `PasswordMinLength` + `PasswordRequiresUppercase` in BOTH resx | ✅ Implemented | `I18n.resx:258-263` (ES), `I18n.en.resx:522-527` (EN); Designer.cs untouched (grep 0 hits, git status clean of it) |
| E2E 8 tests `{id}` route, re-login proof via real login endpoint | ✅ Implemented | `UsersChangePasswordTests.cs` (8 tests; :36-49 calls `/api/v1/auth/login`) |
| Plan doc row #22 → ✅ Done \| ✅ Archived | ✅ Implemented | `endpoints-e2e-coverage.md:58`; detail :306-313; E2E index :909 updated to `{id}` |
| Plan-frontend doc created | ✅ Implemented | `docs/plans/2026-08-02-change-password-contract-frontend.md` (54 lines) |
| Spec conflicts resolved in delta | ✅ Implemented | users-e2e delta E2E-CPW1 (R8 404→400) + E2E-CPW2 (wrong-old pinned 400); main spec unchanged (archive-time) |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 Route `change-password/{id}` + `[FromBody]` + `command.UserId = id` | ✅ Yes | Exact match `UsersController.cs:142-151` |
| D2 ActionCode switch mirroring AuthController.cs:30-41 | ✅ Yes | `UsersController.cs:156-163` |
| D3 Handler rewrite (null-guard 404, VerifyPassword, gate→404, tenant-scope, UpdateAsync+SaveChangesAsync) | ✅ Yes | `UpdateUserPasswordCommand.cs:47-65` — all 5 sub-parts present |
| D4 Validator ExistsAsync + rename + NewPassword policy | ✅ Yes | `UpdateUserPasswordCommandValidator.cs:35-42` |
| D5 2 resx keys both files, `{0}`/`{1}` placeholders, Designer.cs untouched | ✅ Yes | Exact D5 XML values in both files |
| D6 E2E rewrite 8 tests incl. re-login + cross-tenant seeds | ✅ Yes | 8 tests; inline Tenant+User+UserRole seeding (`SeedCustomTenantVictimAsync`, :206-218) + `CleanupTenantCascadeAsync` |
| D7 Plan doc row #22 | ✅ Yes | Statuses set at apply per design note |
| D8 Plan-frontend doc | ✅ Yes | Structure mirrors register precedent |
| File Changes table | ✅ Yes | All 7 modified + 1 created files match git status exactly; R8 main-spec archive deferred as designed |

---

## Issues Found

**CRITICAL** (must fix before archive):
- None

**WARNING** (should fix):
- None blocking. Documented risks (from apply-progress, accepted): (1) 403 test is status-only — if the permission filter ever returns a JSON envelope the assert still passes but should assert the body; (2) cross-tenant 404 vs 400 contract depends on `UserRepository.ExistsAsync` `IgnoreQueryFilters()` — verified intact at `UserRepository.cs:99-102`, so validator passes for cross-tenant users and the handler's tenant check produces 404 (correct contract); (3) re-login proof depends on `VerifyPassword` tier-3 raw-SHA256 acceptance — confirmed `BcryptHashPasswordService` is the active DI service (design #567 evidence).

**SUGGESTION** (nice to have):
- None

---

## Verdict

**PASS**

All 8 verification items (route contract, handler, validator, i18n, E2E, plan doc, plan-frontend, spec conflicts) confirmed against the CURRENT source. 26/26 spec scenarios compliant. Implementation matches design decisions D1–D8 exactly. No gaps found. Ready for archive (archive will align main users-e2e spec R8 per E2E-CPW1/2).
