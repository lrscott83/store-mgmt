# Verify Report: user-roles-endpoint-fixes

**Change**: `user-roles-endpoint-fixes`
**Verifier**: sdd-verify sub-agent
**Date**: 2026-08-01
**Mode**: openspec (filesystem) + engram
**Constraints honored**: no git mutations, no source edits, temp artifacts in `C:\Users\Appollo\AppData\Local\Temp\opencode`

---

## Executive Summary

Implementation is **behaviorally correct and fully spec-compliant**, build is **0 errors**, the DB-backed E2E suite ran against real Postgres (`smca_test`), and **all 3 RED→GREEN tests now pass** (nonexistent-role 400, duplicate-roleIds 200 single-row, Selected body assert). The single RED test is a **defect in a NEW test's expectations**, not in the implementation: `Add_roles_as_store_user_without_users_admin_returns_403` asserts a JSON envelope body on a filter-level 403, but the `HasUserPermissionRequirementFilter` returns `ForbidResult()` (empty body by design — the established sibling convention is status-code-only asserts). The 403 status assertion in that test PASSED; only the body deserialize failed. **Status: FAILED (test defect, 1 test) — fix via apply, then re-verify.**

---

## Completeness (tasks)

| Metric | Value |
|--------|-------|
| Tasks total | 12 (1.1–4.1 + 4.2 gates) |
| Tasks complete | 11 (1.1–3.1, 4.1) |
| Tasks deferred | 4.2 (verify gates — this report) |

Task 4.2 was explicitly deferred from apply (no build/test during apply). This report executes those gates. No core task incomplete.

---

## Build & Tests Execution

**Build**: ✅ PASSED — `dotnet build SMCA.sln` (Debug, net8.0, full `--no-incremental` rebuild): **0 Errors, 163 Warnings**.

Warning analysis (all pre-existing, none introduced by this change):
- Nullable warnings (CS8618 ×128, CS8603 ×68, CS8602 ×26, CS1998 ×20, CS8629 ×20, etc.) — codebase-wide pre-existing.
- Package vulnerability NU1903 (AutoMapper, System.Text.Json) / NU1902 (RestSharp) — pre-existing dependency debt.
- Only warning touching a changed file: `RoleRepository.cs(31,20) CS8603 Possible null reference return` — located in `GetRoleByNameAndTenantIdIgnoreQueryFiltersAsync`, a PRE-EXISTING method NOT modified by this change. The modified methods (`GetAllActiveRolesAsync`, `GetRolesByIds`) produce zero warnings.
- **NEW warnings introduced: NONE.**

**Tests (E2E, real Postgres `smca_test`)**: ✅ 10/11 passed, ❌ 1 failed, 0 skipped — `dotnet test src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersRolesTests"` (workdir `backend`).

**Regression**: ✅ 46/47 passed, ❌ 1 failed (same test) — `--filter "FullyQualifiedName~UsersRolesTests|UsersListTests|UsersUpdateTests|UsersActivateTests|UsersDeleteTests"`.

**Failed test**:
- `SMCA.WebApi.E2ETests.Users.UsersRolesTests.Add_roles_as_store_user_without_users_admin_returns_403`
  - Error: `System.Text.Json.JsonException: The input does not contain any JSON tokens` at `UsersRolesTests.cs:202` (`ReadFromJsonAsync`).
  - Assertion at line 201 (`r.StatusCode.Should().Be(HttpStatusCode.Forbidden)`) PASSED — the 403 contract is verified correct at runtime.
  - Cause: actor seeded with `AuthzSeed.SeedStoreUserAsync(_f, null)` (no Users feature) → `HasUserPermissionRequirementFilter` (`HasPermissionAttribute.cs:104`) sets `ForbidResult()` → HTTP 403 with EMPTY body. Test then parses a JSON envelope → JsonException.
  - Established sibling convention for filter-level 403 is **status-code-only** (no body parse): `UsersListTests.List_as_store_user_returns_403` (:55-56), `StoreRoleAccessTests` (:21-22, :33-34), `UsersUpdateTests.Update_as_store_user_returns_403` (:49-52). The `UsersActivateTests.Activate_as_store_user_with_users_feature_returns_403` body-assert passes only because there the filter PASSES (actor granted the Users feature = UsersAdmin feature type) and the 403 comes from business logic (`ApiException: You don't have permission`) with an envelope body.
  - **Verdict: test-expectation defect (should fix in apply): drop the two body asserts (align with status-code-only convention), OR seed the Users feature and assert the business-level envelope.** Not an implementation regression.

**Coverage**: Not configured (`openspec/config.yaml` — no coverage_threshold referenced in this flow).

---

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| VL-R1 AddUserRoles ExistsAsync | 1a/1b/1c exists/absent/no full fetch | `Add_roles_with_nonexistent_user_returns_400` (new) + static | ✅ COMPLIANT — 400 on random GUID; validator calls `ExistsAsync(userId, ct)`; zero GetByIdAsync/FindAsync; `UserRepository.cs:99-102` single `IgnoreQueryFilters().AnyAsync` verified |
| VL-R2 DeleteUserRoles ExistsAsync | 2a/2b/2c user + batch kept | static (validator) + `Delete_roles_returns_200` (existing) | ✅ COMPLIANT — validator swapped; `DeleteUserRolesCommand` handler batch `GetActiveUserRolesByIds` untouched (read) |
| VL-R3 Non-existent RoleId → 400 | 3a bad role / 3b duplicates | `Add_roles_with_nonexistent_role_id_returns_400` (new, RED→GREEN) | ✅ COMPLIANT — PASSED; RoleId 999999 → 400 envelope (was 500 NRE). 3b static: duplicate-tolerant validator + handler Distinct |
| CH-R1 No user load / request.UserId | 1a/1b | static (`AddUserRolesCommand.cs` + `Add_roles_returns_200`) | ✅ COMPLIANT — no `_userRepository`; `UserRole.Create(request.UserId, roleId, tenantId)`; no `user.Id` deref |
| CH-R2 Duplicate RoleIds dedup | 2a/2b | `Add_roles_with_duplicate_role_ids_returns_200_single_row` (new, RED→GREEN) | ✅ COMPLIANT — PASSED; `[X,X]` → 200; DB exactly 1 UserRole row |
| CH-R3 Single materialized lookup | 3a/3b | static + `Add_role_already_active_is_idempotent` (existing) | ✅ COMPLIANT — 1× `GetByUserIdAsync` → `ToDictionary(ur => ur.RoleId)`; zero repo queries in foreach; reactivation tracked |
| CH-R4 VisibleRoleService null-guard | 4a-4d | `Add_roles_with_nonexistent_role_id_returns_400` (4a) + static (4b-4d) | ✅ COMPLIANT — `TryGetValue` miss → false → 400; 3-branch rules byte-identical (`VisibleRoleService.cs:35-44`) |
| CH-R5 Single batched query | 5a | static | ✅ COMPLIANT — `GetRolesByIds(roleIds.ToHashSet())` 1 query; grep: only caller |
| CH-R6 Query cleanup | 6a/6b/6c | `Add_roles_response_selected_true_for_added_role` (new, RED→GREEN) + static | ✅ COMPLIANT — PASSED; no user load, `int.Parse` compare, direct `ResponseResult.Success`, no `Task.FromResult` |
| RR-R1 GetByUserIdAsync contract | 1a/1b/1c | static + runtime (all Add tests exercise it) | ✅ COMPLIANT with documented deviation (see Coherence) — single Where query, no Include, active+inactive |
| UC-R1 [FromBody] both actions | 1a/1b | static (controller source) | ✅ COMPLIANT — both params decorated |
| UC-R2 ProducesResponseType 400/401/403/404 | 2a-2j | static + runtime 401/403 tests | ✅ COMPLIANT — both actions declare 400/401/403/404 + existing 200; 401/403 statuses verified at runtime |
| E2E-R1 Non-existent User → 400 | 1a | `Add_roles_with_nonexistent_user_returns_400` (new) | ✅ COMPLIANT — PASSED |
| E2E-R2 Non-existent Role → 400 | 2a/2b | `Add_roles_with_nonexistent_role_id_returns_400` (new, RED→GREEN) | ✅ COMPLIANT — PASSED |
| E2E-R3 Duplicate RoleIds → 200 | 3a/3b | `Add_roles_with_duplicate_role_ids_returns_200_single_row` (new, RED→GREEN) | ✅ COMPLIANT — PASSED |
| E2E-R4 401 both actions | 4a/4b | `Add_roles_without_token_returns_401` + `Delete_roles_without_token_returns_401` (new) | ✅ COMPLIANT — both PASSED |
| E2E-R5 StoreUser 403 | 5a | `Add_roles_as_store_user_without_users_admin_returns_403` (new) | ❌ FAILING — 403 status VERIFIED correct at runtime, but test asserts envelope body on empty-body `ForbidResult` → JsonException. TEST DEFECT (fix in apply) |
| E2E-R6 Selected reflects added role | 6a | `Add_roles_response_selected_true_for_added_role` (new, RED→GREEN) | ✅ COMPLIANT — PASSED; `Data.Single(ReSeller).Selected == true` |
| E2E-R7 archive alignment | 7a/7b | n/a (archive-time) | ➖ Not applicable this change |

**Compliance summary**: 16/17 scenarios compliant (E2E-R5 status verified correct; its TEST is defective). 0 implementation regressions.

---

## Correctness (Static — Structural Evidence)

| File | Status | Notes |
|------|--------|-------|
| `IRoleRepository.cs:10` | ✅ | `GetRolesByIds(HashSet<int>)` (D1) |
| `RoleRepository.cs:36-42` | ✅ | Batch impl `IgnoreQueryFilters().Where(r => roleIds.Contains(r.Id)).ToListAsync()`; no NotImplementedException |
| `RoleRepository.cs:20-27` | ✅ | `GetAllActiveRolesAsync` latent-bug fix `r.IsActive && (r.Id != (int)RoleType.SuperAdmin || includeSuperAdminRole)` — logic verified correct (SuperAdmin only when flag true, others when active). Sole caller = `GetUserRolesByUserIdQuery.cs:40` (grep-verified) |
| `IUserRoleRepository.cs:16` | ✅ | `GetByUserIdAsync(Guid, CancellationToken)` added |
| `UserRoleRepository.cs:35-41` | ✅ | Explicit `AsTracking().Where(ur => ur.UserId == userId).ToListAsync(ct)` — no FindAsync/Include; returns active+inactive |
| `VisibleRoleService.cs` | ✅ | Batch fetch → ToDictionary; `TryGetValue` miss → false (CH-R4); 3-branch rules verbatim :35-44 (CH-R4 4b-4d) |
| `AddUserRolesCommand.cs` | ✅ | No user repo; `request.UserId`; `.Distinct()`; materialized ToDictionary; tracked reactivation, no UpdateAsync; SaveChanges + Send kept |
| `AddUserRolesCommandValidator.cs` | ✅ | `ExistsAsync(userId, ct)`; visibility rule + RoleNotFound preserved; no new deps |
| `DeleteUserRolesCommandValidator.cs` | ✅ | `ExistsAsync` swap; NotNull/NotEmpty RoleIds kept |
| `GetUserRolesByUserIdQuery.cs` | ✅ | No user load; `GetActiveRoleIdsByUser(query.UserId)`; `Contains(int.Parse(role.Id))`; direct Success return |
| `UsersController.cs:108-134` | ✅ | `[FromBody]` both params; ProducesResponseType 400/401/403/404 + 200 both; URL casing `AddUserRoles`/`DeleteUserRoles` UNCHANGED; sibling edits intact (GetAll/GetById/Update/Delete/Activate untouched, change-password untouched) |
| `UsersRolesTests.cs` | ✅ structure / ❌ 1 test | 11 total (4 existing + 7 new) present; 10 pass |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 GetRolesByIds repurposed int-keyed | ✅ Yes | Signature + impl per design |
| D2 VisibleRoleService shape | ✅ Yes | Batch + dictionary + null-guard false + rules verbatim |
| D3 GetByUserIdAsync contract | ⚠️ Deviated (documented) | `AsTracking()` added — REQUIRED: `ApplicationDbContext` has `QueryTrackingBehavior.NoTracking` default; tracked reactivation (`IsActive = true`, no UpdateAsync) silently no-ops without it. Sibling `update-user-endpoint-fixes` Batch B documented the identical trap. Zero behavior change for read-only callers. Also signature `IReadOnlyList<UserRole>` + CancellationToken per orchestrator instruction (apply-progress deviation #3) vs tasks.md `IEnumerable<UserRole>` — acceptable, additive |
| D4 Handler flow | ✅ Yes | No user load; request.UserId; tracked mutation; no UpdateAsync |
| D5 Distinct in handler | ✅ Yes | `request.RoleIds.Distinct()` at foreach |
| D6 Controller metadata | ✅ Yes | [FromBody] + 400/401/403/404 on both; casing unchanged |
| D7 Query cleanup | ✅ Yes | int compare; no Task.FromResult; no user dep |
| (undocumented) GetAllActiveRolesAsync fix | ⚠️ Extra fix (documented in apply-progress #2) | Not in tasks.md but REQUIRED: original WHERE returned ONLY SuperAdmin — would break E2E-R6 and the query's purpose. Verified correct and needed |

---

## Issues Found

**CRITICAL** (must fix before archive):
1. **`Add_roles_as_store_user_without_users_admin_returns_403` test defect** — asserts `Succeeded==false` + `Errors.NotBeEmpty()` (lines 202-204) on a filter-level 403 whose body is EMPTY (`ForbidResult`). Fix in apply: drop the two body asserts (status-code-only, matching `UsersListTests`/`StoreRoleAccessTests`/`UsersUpdateTests` convention) OR seed the Users feature so the 403 comes from business logic with an envelope (matching `UsersActivateTests` convention). The 403 status contract itself is CORRECT (assert passed at runtime).

**WARNING** (should fix):
- None from this change. Pre-existing: 163 build warnings (nullable + package vulnerabilities NU1902/NU1903), `RoleRepository.cs:31` CS8603 (pre-existing method).

**SUGGESTION** (nice to have):
- Spec RR-R1 signature text (`IEnumerable<UserRole>`) vs implementation (`IReadOnlyList<UserRole>` + ct) — align spec text at archive, or note the orchestrator override in the archived spec.
- E2E-R7 main-spec alignment (users-e2e R6/R7 rows) remains deferred to archive per spec.

---

## Verdict

**FAIL** (blocking: 1 new test RED — test-expectation defect; implementation behavior fully correct and spec-compliant)

All implementation requirements verified correct (static + runtime). Build 0 errors, no new warnings. 3/3 RED→GREEN tests pass. The single RED test asserts an envelope body that filter-level 403s never produce (empty `ForbidResult`); its status-code assertion passes, proving the 403 contract. Fix the test in apply (align to status-code-only convention), re-run `--filter "FullyQualifiedName~UsersRolesTests"` → expect 11/11 GREEN, then archive.

---

## Artifacts

- openspec report: `openspec/changes/pending/user-roles-endpoint-fixes/verify-report.md`
- engram: topic_key `sdd/user-roles-endpoint-fixes/verify-report` (project `store-mgmt`)

## Risks / Unverified

- Test DB: VERIFIED AVAILABLE (Postgres on localhost:5432; fixture `MigrateAsync` to `smca_test` succeeded; docker daemon itself not confirmed — direct TCP connection confirmed).
- `ToDictionary(ur => ur.RoleId)` in handler throws if DB ever holds duplicate (user, role) rows — DB invariant; noted in apply-progress; not triggered in any test.
- `.AsTracking()` dependency for reactivation persistence — future refactor removing it silently breaks reactivation (documented).
- The 3 deviations (AsTracking, GetAllActiveRolesAsync fix, IReadOnlyList signature) are documented in apply-progress.md and verified necessary.

---

# Re-verification (2026-08-01) — Test-only fix applied

**Trigger**: Apply fixed the single RED test (`Add_roles_as_store_user_without_users_admin_returns_403`) by dropping the two JSON envelope body asserts — it now asserts status-code-only (`r.StatusCode.Should().Be(HttpStatusCode.Forbidden)`), matching the established sibling convention (`UsersListTests`, `StoreRoleAccessTests`, `UsersUpdateTests`). No implementation code changed. This section supersedes the FAIL verdict below.

## Execution (real Postgres `smca_test`, localhost:5432 — port confirmed reachable)

| Gate | Command | Result |
|------|---------|--------|
| Build | `dotnet build SMCA.sln` (workdir `backend/src`) | ✅ **0 Errors**, 11 warnings (incremental; all pre-existing nullable CS86xx + NU1902/NU1903 package vulnerabilities; none from changed files) |
| Targeted E2E | `dotnet test src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersRolesTests"` (workdir `backend`) | ✅ **11/11 passed** — Failed: 0, Passed: 11, Skipped: 0, Total: 11, Duration: 996 ms |
| Regression | `--filter "FullyQualifiedName~UsersRolesTests\|FullyQualifiedName~UsersListTests\|FullyQualifiedName~UsersUpdateTests\|FullyQualifiedName~UsersActivateTests\|FullyQualifiedName~UsersDeleteTests"` | ✅ **47/47 passed** — Failed: 0, Passed: 47, Skipped: 0, Total: 47, Duration: 3 s |

**Failed tests**: NONE.

## Resolution of prior CRITICAL issue

- `SMCA.WebApi.E2ETests.Users.UsersRolesTests.Add_roles_as_store_user_without_users_admin_returns_403` — previously ❌ (JsonException: `The input does not contain any JSON tokens` at `ReadFromJsonAsync`). Now ✅ **PASSED** — status-code-only assert; the filter-level 403 (`ForbidResult()`, empty body) contract is verified at runtime without body parsing. Static confirm: `UsersRolesTests.cs:191-208` contains no `ReadFromJsonAsync` on the 403 response.

## Compliance matrix delta

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| E2E-R5 StoreUser 403 | 5a | `Add_roles_as_store_user_without_users_admin_returns_403` (fixed) | ✅ **COMPLIANT** — PASSED |

**Compliance summary (re-verified)**: **17/17 scenarios compliant** (previously 16/17 + 1 test defect). 0 implementation regressions. All 11 `UsersRolesTests` (4 existing + 7 new, incl. 3 RED→GREEN) green; full 5-class Users regression 47/47 green (was 46/47).

## Re-verification verdict

**PASS** — all gates green. **READY FOR ARCHIVE.**

Remaining pre-existing risks unchanged (see original report): 163-warning debt in full rebuild (nullable + package vulnerabilities), `ToDictionary` duplicate-row invariant, `.AsTracking()` dependency for reactivation persistence, RR-R1 spec signature text vs `IReadOnlyList<UserRole>` implementation (align at archive).
