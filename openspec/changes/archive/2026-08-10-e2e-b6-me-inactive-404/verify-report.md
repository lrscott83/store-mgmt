```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:f9a0005869271adc9025704d4e313c494ca93ce68cff11b3302af6057c1676d7
verdict: pass
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 2/2
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthMeDeactivation"
test_exit_code: 0
test_output_hash: sha256:f9a0005869271adc9025704d4e313c494ca93ce68cff11b3302af6057c1676d7
build_command: dotnet build backend/src/SMCA.sln
build_exit_code: 0
build_output_hash: sha256:ca5e5406b6d049a6492fcc9f6b1038af0107925eb782ab928706f39dac925213
```

## Verification Report

**Change**: e2e-b6-me-inactive-404
**Version**: N/A (delta spec, no version field)
**Mode**: Standard (E2E-only, non-strict TDD)
**Scope rule**: ADD-ONLY new E2E tests; no production code, no existing E2E test, no support file touched — verified.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 11 |
| Tasks complete | 11 |
| Tasks incomplete | 0 |

All 11 tasks are `[x]` in `tasks.md` with evidence matching the implemented file.

### Build & Tests Execution
**Build**: ✅ Passed — `dotnet build backend/src/SMCA.sln` → exit 0, `Build succeeded.`, 0 errors, 16 warnings (all pre-existing nullability warnings in Domain/Application/Infrastructure/WebApi/unit tests; none in the new file).

```text
Build succeeded.
    16 Warning(s)
    0 Error(s)
```

**Tests (focused)**: ✅ 2 passed / 0 failed / 0 skipped — `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthMeDeactivation"` → exit 0.

```text
Passed!  - Failed:     0, Passed:     2, Skipped:     0, Total:     2, Duration: 511 ms - SMCA.WebApi.E2ETests.dll (net8.0)
```

**Tests (regression)**: ✅ 93 passed / 0 failed / 0 skipped — `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~Auth|FullyQualifiedName~UsersActivate"` → exit 0, output hash `sha256:37488e3233ae0613b66b9c16c15a7e461bbd831313e74a3da02077ba1595571e`.

```text
Passed!  - Failed:     0, Passed:    93, Skipped:     0, Total:    93, Duration: 20 s - SMCA.WebApi.E2ETests.dll (net8.0)
```

The `[ERR] Unhandled exception: User not found` lines in both runs are the EXPECTED cross-tenant/nonexistent 404 wire path: `ActivateUserCommandHandler` throws `ApiException` which `ErrorHandlerMiddleware` logs before converting to the 404 envelope — identical behavior to the pre-existing `Activate_nonexistent_returns_404` (documented in apply-progress; not a failure).

**Runtime harness**: real PostgreSQL `localhost:5432`, db `smca_test` (WebAppFixture applies migrations). Real HTTP login → activate → `/me` chain executed against the app.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 — E2E coverage same-tenant deactivation chain: activate 200 then /me 404 `Auth.AccountInactive` | OwnerAdmin deactivates same-tenant StoreUser, then /me 404s with AccountInactive | `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs > Deactivated_same_tenant_store_user_me_returns_404_account_inactive` | ✅ COMPLIANT (passed 1/1) |
| R2 — E2E coverage cross-tenant deactivation returns 404 (tenant isolation) | OwnerAdmin in tenant A deactivates a victim in tenant B | `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs > Cross_tenant_activate_returns_404` | ✅ COMPLIANT (passed 1/1) |

**Compliance summary**: 2/2 scenarios compliant, each covered by a passing runtime test.

### Correctness (Static Evidence)

**R1 — same-tenant chain** — ✅ Implemented
- OwnerAdmin seeded with Management module (`AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true)`) — minted actor.
- StoreUser target same tenant (`AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null)`); REAL login `POST /api/v1/auth/login {Login, Password}` → 200 + `Succeeded==true` + non-empty `Data.AuthToken`, performed BEFORE deactivation (a login after deactivation would 403 `Auth.AccountInactive`).
- Minted OA `POST /api/v1/users/activate {Id=su.UserId, IsActive=false}` → HTTP 200; DB read-back via `IgnoreQueryFilters` → `IsActive==false` (proves the API wrote, not a bare status).
- Target REAL token `GET /api/v1/auth/me` → HTTP 404 + `Succeeded==false` + `ActionCode==404` + `Errors.ContainSingle(e => e.Code == "Auth.AccountInactive")` — the contain-single assert discriminates the inactive-account 404 from a generic `User.NotFound` 404.
- Exactly ONE `/me` call (blacklist second-call 401 non-goal honored).
- Cleanup in `finally`: `CleanupStoreGraphAsync(su.StoreId, su.UserId, su.OwnerUserId)` + `CleanupStoreGraphAsync(oa.StoreId, oa.UserId)`.

**R2 — cross-tenant isolation** — ✅ Implemented
- OwnerAdmin + Management in tenant A (default tenant); victim seeded in custom tenant B via LOCAL `SeedTenantBVictimAsync` = MINIMAL seed: `Tenant.Create` + `User.Create` + `UserRole.Create(StoreUser)` ONLY — no Store/StoreUser/StoreModule rows (FK-safe for `CleanupTenantCascadeAsync`, which removes Store/UserRole/Owner/User/Tenant but not StoreUser).
- Minted OA `POST /api/v1/users/activate {Id=victimId, IsActive=false}` → HTTP 404 + `Succeeded==false` + `Errors.NotBeEmpty()` — envelope-only assert, NO code pin (wire yields `App.Unexpected` via `ErrorHandlerMiddleware`, per `Activate_nonexistent_returns_404` convention). The 404 comes from the tenant query filter (`UserEntityTypeConfiguration.cs:22-24`) through `GetByIdAsync` — NOT a 403 handler guard, NOT a cross-tenant write.
- Cleanup in `finally`: `DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantBId)` + `AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId)`.

**Structural checks** — ✅ all pass
- EXACTLY TWO `[Fact]`s in the file (lines 43–90, 92–116); `[Collection("e2e")]`; ctor takes `WebAppFixture` exposing `AppTestFactory _f` (per `UsersActivateTests.cs:16-17` convention).
- Real login token used for the `/me` call (not a minted token).
- `UserSeed.DeactivateUserAsync` NOT used anywhere (grep: only a comment mention on line 62; deactivation goes ONLY through the activate API — avoids the silent NoTracking no-op).
- Login BEFORE deactivation; cleanup in `finally` in both tests.

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — File `Auth/AuthMeDeactivationTests.cs`, namespace `SMCA.WebApi.E2ETests.Auth` | ✅ Yes | Sibling of `AuthMeFailureTests`/`AuthLoginOwnerAdminTests`. |
| D2 — Actor token minted via `DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)` | ✅ Yes | Tenant claim arrives via `ClaimsTransformerService` per-request (design-verified). |
| D3 — Target token from REAL `POST /auth/login`, before deactivation | ✅ Yes | B-3 gap closed; store/owner active at seed → login 200. |
| D4 — Tenant-B victim MINIMAL seed, no Store/StoreUser/StoreModule rows | ✅ Yes | FK-safe cleanup; 404 fires on tenant-filtered null lookup. |
| D5 — Cross-tenant assert envelope-only, NO code pin | ✅ Yes | `Errors.NotBeEmpty()`; stable against `App.Unexpected`. |
| D6 — Case-1 DB read-back `IsActive==false` via `IgnoreQueryFilters` | ✅ Yes | Stronger write evidence per `UsersActivateTests.cs:32-36`. |
| D7 — Cleanup: case 1 two `CleanupStoreGraphAsync`; case 2 `CleanupTenantCascadeAsync` + actor graph | ✅ Yes | Order-free independent graphs. |

No deviations from design (D1–D7 all followed; matches apply-progress claim).

### Non-Goals Honored
- ✅ No frontend suite touched (`git status --porcelain`: only the pre-existing, unrelated untracked `frontend-react/openspec/changes/offline-roster-login-actions/`).
- ✅ No production source code modified (git status shows zero production files changed).
- ✅ No existing E2E test or support file touched (the only new file under `backend/src/SMCA.WebApi.E2ETests/` is `Auth/AuthMeDeactivationTests.cs`).
- ✅ No self-activation case (actor always deactivates a different user).
- ✅ No token-blacklist second-call 401 case (T1 makes exactly ONE `/me` call; T2 makes none — `/me` not involved in the cross-tenant scenario).

### Purity
`git status --porcelain` on `feat/e2e-b6-me-inactive-404`:
```text
 M openspec/specs/authorization-e2e/spec.md
 M openspec/specs/users-e2e/spec.md
?? backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs
?? frontend-react/openspec/changes/offline-roster-login-actions/
?? openspec/changes/e2e-b6-me-inactive-404/
```
- Only new backend file: the new test file. The two ` M` files are the pre-existing delta-spec capability artifacts (R1.7 / R5 rows — openspec docs, not code). The untracked frontend dir is pre-existing and unrelated. ✅ Scope rule confirmed: add-only E2E, zero modifications to production or existing tests.

### Task Coverage
| Task | Status | Evidence match |
|------|--------|----------------|
| 1.1 Scaffold file (namespace, `[Collection("e2e")]`, WebAppFixture ctor, usings) | ✅ [x] | Lines 1–41; compiles (build 0 errors). |
| 2.1 Seed OA+Mgmt + StoreUser; REAL login → 200 + AuthToken (before deactivation) | ✅ [x] | Lines 46–59. |
| 2.2 Minted OA → activate {false} → 200; DB read-back `IsActive==false` | ✅ [x] | Lines 64–73. |
| 2.3 Real token `/me` → 404 + contain-single `Auth.AccountInactive`; one call | ✅ [x] | Lines 78–83. |
| 2.4 finally cleanup both store graphs | ✅ [x] | Lines 85–89. |
| 3.1 OA+Mgmt tenant A + minimal tenant-B victim seed (local helper) | ✅ [x] | Lines 95–96, 125–137. |
| 3.2 Minted OA → activate {victim} → 404 envelope (no code pin) | ✅ [x] | Lines 104–109. |
| 3.3 finally cleanup tenant B cascade + OA graph | ✅ [x] | Lines 111–115. |
| 4.1 Focused run green (2/2) | ✅ [x] | Re-run this verify: 2 passed, 0 failed. |
| 4.2 Regression green (93/93) | ✅ [x] | Re-run this verify: 93 passed, 0 failed. |
| 4.3 Purity: single new file + openspec artifacts only | ✅ [x] | Confirmed via `git status --porcelain` (above). |

### Issues Found
**CRITICAL**: None.
**WARNING**: None.
**SUGGESTION**:
1. Apply-progress task 4.3 cites `git diff --stat main...HEAD` as "exactly 1 new file + openspec artifacts only". That command's real output also includes the merged `e2e-b3-auth-login-roundtrip` content (HEAD is the b3 merge commit, so `main...HEAD` spans the merged branch: 10 files / 906 insertions). The scope claim itself is TRUE — verified via `git status --porcelain` (the user-specified purity check) — but the 4.3 evidence wording should be corrected during archive to cite `git status --porcelain` so the recorded command output matches the claim.

### Verdict
**PASS** — both spec requirements/scenarios covered by passing runtime E2E tests against real PostgreSQL; 11/11 tasks complete; build 0 errors; regression 93/93 green; purity confirmed (single new test file, add-only); zero findings above SUGGESTION.

### Delivery Note
- **Scope**: ONE new E2E file `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` — 138 lines (forecast ~150), EXACTLY TWO tests. No other file touched by this change.
- **PR strategy**: single PR; 400-line budget risk LOW (138 additions, well under budget); no chaining needed.
- **Risk**: LOW — test-only delta; only existing public routes exercised; rollback = delete the single file.
