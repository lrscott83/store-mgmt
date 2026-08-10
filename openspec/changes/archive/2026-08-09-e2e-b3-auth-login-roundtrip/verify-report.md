```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:c1f42bc9843915a941a25be7933a29087eaf8afd922583bbcf5d9822dff93701
verdict: pass
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 7/7
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLogin"
test_exit_code: 0
test_output_hash: sha256:0b3129b55fcddfe2e972b18e8929475e6b9814e91479fe088f43bdf4d03a49dc
build_command: dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
build_exit_code: 0
build_output_hash: sha256:4bc0a4607a70e8bbc8eed5af2bd79710cd72b7bc141a5c22c354b809938270b3
```

# Verify Report — e2e-b3-auth-login-roundtrip

**Change**: e2e-b3-auth-login-roundtrip
**Version**: spec.md (current delta)
**Mode**: Standard (E2E-only change; strict-TDD RED/GREEN unit cycles intentionally absent, per owners-* precedent — NOT a deviation)

> **Scope rule (verbatim, non-negotiable)**: "In this backend test-coverage work the agent may ONLY ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and report instead of touching anything."

## Executive Summary

**PASS.** The change delivers exactly the two planned ADD-ONLY E2E test classes — `AuthLoginStoreUserTests.cs` (3 `[Fact]`s) and `AuthLoginReSellerTests.cs` (3 `[Fact]`s) — with zero production-code changes and zero modifications to existing E2E tests. All 6 new facts passed at runtime against real PostgreSQL `smca_test`; the full `~Auth` regression is green (87/87). Every one of the 7 spec scenarios (change spec) and all capability requirements (auth-login-e2e Req 2; auth-login-reseller-e2e R1–R3) map to a green covering test. Design decisions D1–D8 are honored with no deviations. The no-scope-violation diff gate is clean: only the 2 new test files + this change's openspec artifacts.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 14 |
| Tasks complete | 14 |
| Tasks incomplete | 0 |

## No-Scope-Violation Gate

`git diff --stat main...HEAD` (merge-base `042baf54`):

| File | Action |
|------|--------|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginReSellerTests.cs` | A (161) |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` | A (111) |
| `openspec/changes/e2e-b3-auth-login-roundtrip/{proposal,spec,design,tasks}.md` | A |
| `openspec/specs/auth-login-e2e/spec.md` | M (Req 2 flipped to DELIVERED at spec time — expected, not a verify action) |
| `openspec/specs/auth-login-reseller-e2e/spec.md` | A |

- No production source file modified. No existing E2E test file modified. ✅ gate passed.
- `git status` shows a single untracked entry `frontend-react/openspec/changes/offline-roster-login-actions/` — pre-existing, explicitly out of scope (instructed to ignore). ✅

## Spec Compliance Matrix (change spec — authoritative counts: 2 requirements, 7 scenarios)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| ADDED: ReSeller roundtrip | Active ReSeller logs in with no store graph | `AuthLoginReSellerTests.Active_re_seller_logs_in_with_no_store_graph` | ✅ COMPLIANT |
| ADDED: ReSeller roundtrip | Inactive ReSeller row returns 403 `Auth.AccountInactive` | `AuthLoginReSellerTests.Inactive_re_seller_row_is_rejected_with_403` | ✅ COMPLIANT |
| ADDED: ReSeller roundtrip | Role-only ReSeller returns 403 `Store.Inactive` (blind-zone pin) | `AuthLoginReSellerTests.Login_RoleOnlyReSellerWithoutReSellerRow_ReturnsStoreInactive` | ✅ COMPLIANT |
| MODIFIED: StoreUser roundtrip | StoreUser logs in to an active store | `AuthLoginStoreUserTests.StoreUser_logs_in_to_an_active_store` | ✅ COMPLIANT |
| MODIFIED: StoreUser roundtrip | StoreUser logs in to a deactivated store (branch 4) | `AuthLoginStoreUserTests.StoreUser_with_deactivated_store_is_rejected_with_403` | ✅ COMPLIANT |
| MODIFIED: StoreUser roundtrip | StoreUser logs in when the store owner is deactivated (branch 6) | `AuthLoginStoreUserTests.StoreUser_with_deactivated_store_owner_is_rejected_with_403` | ✅ COMPLIANT |
| MODIFIED: StoreUser roundtrip | Cleanup removes the full store graph | `finally` in all 3 StoreUser facts: `CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId)` | ✅ COMPLIANT |

**Compliance summary**: 7/7 scenarios compliant, 2/2 requirements compliant.

## Capability Spec Traceability

| Capability | Requirement | Evidence | Result |
|------------|-------------|----------|--------|
| auth-login-e2e | Req 2 StoreUser roundtrip (DELIVERED here) | 3 StoreUser facts above | ✅ 4/4 scenarios |
| auth-login-reseller-e2e | R1 positive 200 | `Active_re_seller_logs_in_with_no_store_graph` | ✅ |
| auth-login-reseller-e2e | R2 inactive row 403 `Auth.AccountInactive` | `Inactive_re_seller_row_is_rejected_with_403` | ✅ |
| auth-login-reseller-e2e | R3 blind-zone pin 403 `Store.Inactive` | `Login_RoleOnlyReSellerWithoutReSellerRow_ReturnsStoreInactive` | ✅ |

## Build & Tests Execution (runtime evidence, real PostgreSQL localhost:5432 smca_test)

**Tests — focused (declared command)**: ✅ 17 passed / 0 failed / 0 skipped (exit 0, 5 s)
```text
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLogin"
Passed!  - Failed: 0, Passed: 17, Skipped: 0, Total: 17, Duration: 5 s - SMCA.WebApi.E2ETests.dll (net8.0)
test_output_hash: sha256:0b3129b55fcddfe2e972b18e8929475e6b9814e91479fe088f43bdf4d03a49dc
```
(17 = 11 pre-existing AuthLogin-surface facts + 6 new facts. Per-test names of the 6 new facts captured from the `~Auth` verbosity=normal run.)

**Tests — regression**: ✅ 87 passed / 0 failed (exit 0, 22.2 s)
```text
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~Auth"
Test Run Successful. Total tests: 87, Passed: 87, Total time: 22.2365 Seconds
```
(87 vs the 69 recorded in an earlier change is EXPECTED: additional auto-landed coverage also lives under `~Auth`.)

**Build**: ✅ 0 errors / 8 warnings (exit 0, 5.09 s)
```text
dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --nologo
8 Warning(s), 0 Error(s); Time Elapsed 00:00:05.09
build_output_hash: sha256:4bc0a4607a70e8bbc8eed5af2bd79710cd72b7bc141a5c22c354b809938270b3
```
(Warnings are pre-existing NU1902/NU1903 package-vulnerability advisories in Domain/Infrastructure — unrelated to this change.)

**Server-side branch evidence** (from the WebAppFixture log embedded in test output):
- `reseller-…: reseller is inactive` → R2 short-circuit `Auth.AccountInactive` branch fired.
- `role4-…: no active store` → R3 blind-zone pin fired (role-only user fell through to the store chain).
- `suser-…: no active store` ×2 → StoreUser negatives exercised the `HasActiveStore` chain (branch 4 and branch 6 both land in `Store.Inactive`).
- No `no active store` entry for the StoreUser/ReSeller positives → success path reached `Result.Success`.

## Correctness (Static Evidence + Anti-False-Positive Reasoning)

| Check | Status | Notes |
|-------|--------|-------|
| Negatives assert exactly-one error code | ✅ | All 4 negatives use `Errors.Should().ContainSingle(e => e.Code == "...")` — `Store.Inactive` vs `Auth.AccountInactive` cannot be confused |
| Role-only pin asserts intended contract + documented | ✅ | Intent-named `Login_RoleOnlyReSellerWithoutReSellerRow_ReturnsStoreInactive`; XML comment (`AuthLoginReSellerTests.cs:134-141`) documents the MintToken divergence as BY DESIGN |
| StoreUser positive genuinely exercises the chain | ✅ | Seeded graph satisfies all six conditions: StoreUser row active (`StoreUser.Create` default), Store active (`AuditableEntity.IsActive` default `true`; the `false` arg in `Store.Create` is `approved`), Owner active (default `true`) and belongs to a DIFFERENT user (`SeedStoreUserAsync`) |
| Cleanup proves full graph removal | ✅ | `CleanupStoreGraphAsync(params userIds)` removes StoreRoleFeature→StoreUser→StoreModule→Store→Owner→per-user UserRole/User in FK-safe order; both UserIds passed (D3) |

## Coherence (Design D1–D8)

| Decision | Followed? | Evidence |
|----------|-----------|----------|
| D1 Owner-deactivation negative reuses `DeactivateOwnerByUserIdAsync(_f, f.OwnerUserId)` | ✅ Yes | `AuthLoginStoreUserTests.cs:96`; helper uses `ExecuteUpdateAsync` (NoTracking-safe, `DbTestHelpers.cs:217-226`) |
| D2 Store-deactivation negative reuses `StoreSeed.DeactivateStoreAsync(_f, f.StoreId)` | ✅ Yes | `AuthLoginStoreUserTests.cs:70`; helper uses `AsTracking()` (`StoreSeed.cs:109-116`) |
| D3 Cleanup passes BOTH users (`OwnerUserId`) | ✅ Yes | `:55`, `:82`, `:108` — all three StoreUser facts |
| D4 ReSeller cleanup: ReSeller row first (`IgnoreQueryFilters`), then user | ✅ Yes | `AuthLoginReSellerTests.cs:77-85`; FK Restrict confirmed at `ReSellerEntityTypeConfiguration.cs:28` |
| D5 Inactive row sets `IsActive = false` BEFORE `Add` | ✅ Yes | `:60-66` — tracked `Added` persists; NoTracking trap avoided |
| D6 Role-only pin via `SeedUserWithRoleAsync((int)RoleType.ReSeller)` + intent name/comment | ✅ Yes | `:134-141`, `:143-145` |
| D7 Negatives parse `ApiResponse<object>` + `ContainSingle(exact code)` | ✅ Yes | `:78`, `:104`, `:126`, `:154` |
| D8 No per-test refresh-token cleanup | ✅ Yes | Neither file touches refresh tokens; suite-level `ResetDataAsync` clears them (pre-existing) |

**Deviations**: None.

## Issues Found

**CRITICAL**: None
**WARNING**: None
**SUGGESTION**: None

## Risks & Observations

- **Role-only pin semantics**: active user + ReSeller UserRole + no row → real login 403 `Store.Inactive`, while existing MintToken tests mint tokens for this shape. Intentional, pinned and documented — a future "fix" must flag and re-decide, not silently absorb.
- **Refresh-token accumulation**: each successful login persists a refresh token; per-test cleanup ignores them; collection `ResetDataAsync` clears before next collection. Pre-existing (D8), not a regression.
- **87-vs-69 `~Auth` count**: expected — earlier auto-landed coverage also lives under `~Auth`.
- **Pre-hash backfill**: opportunistic, failures swallowed; outcome unaffected.

## Verdict

**PASS** — 7/7 spec scenarios compliant with green runtime evidence, 2/2 requirements, all 14 tasks complete, zero scope violations, zero deviations, zero blockers. **Next recommended: `archive`.**