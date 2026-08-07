```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:7bd1b45f544d0499ffc8fc923775b9549c11fb08dc380c0f819a23d21e6d262b
verdict: pass
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 2/2
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-build --filter "FullyQualifiedName~AuthRefreshTokenLifetimeTests"
test_exit_code: 0
test_output_hash: sha256:4c4390d5d0c2ee996b20dfade14d25e27725f318deb2a66ad2af6337649d5200
build_command: dotnet build backend/src/SMCA.sln
build_exit_code: 0
build_output_hash: sha256:0809ac7cbffec0b08e2b7805e6eb359c6b4bd61be0be928c385a4d101d5525da
```

## Verification Report

**Change**: e2e-stage-1-auth-inv-01 (auth-refresh-token-lifetime-e2e)
**Version**: N/A
**Mode**: Standard verify (documented-RED change)

This is a **documented-RED** change: the deliverable is 2 new E2E tests that correctly fail by intent because production still ships a 7-day refresh lifetime (35d is a later US). Verify gates on NO regressions and NO scope-guard violations. The 2 RED failures are the defect, not the change.

### Completeness
- Tasks total: 10 / complete: 10 / incomplete: 0
- New test file compiles; both tests present with exact names
- No production code changed; no existing E2E test touched (ADD-ONLY)

### Build & Tests Execution
**Build**: ✅ Passed (exit 0, 0 errors; only pre-existing package-vulnerability warnings)

**Focused test (documented RED held)**: exit 1 — Failed 2 / Passed 0, both failing ONLY `off by 28d`:
- `Login_returns_refresh_token_expiring_in_35_days` — `AuthRefreshTokenLifetimeTests.cs:62` (expected 35d, got 7d)
- `Refresh_returns_new_refresh_token_expiring_in_35_days` — `AuthRefreshTokenLifetimeTests.cs:113` (expected 35d, got 7d)
- No 401, no scope-guard violation

**Auth-area regression**: exit 1 — Passed 45 / Failed 2 / Total 47; only the 2 new tests fail, all pre-existing Auth tests pass (incl. `AuthTokenLifetimeTests`).

**Precedent drift note**: tasks.md forecast 44 passed / 2 failed / 46; current run shows 45 passed / 2 failed / 47 — one additional pre-existing Auth test now covered, no regression introduced by this change.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 | Login_returns_refresh_token_expiring_in_35_days | `AuthRefreshTokenLifetimeTests.cs > Login_...` | ✅ COMPLIANT (intended RED) |
| R2 | Refresh_returns_new_refresh_token_expiring_in_35_days | `AuthRefreshTokenLifetimeTests.cs > Refresh_...` | ✅ COMPLIANT (intended RED) |

**Compliance summary**: This is a documented-RED change — requirements are implemented as RED tests that fail for the documented 7d-vs-35d reason and flip green UNTOUCHED when the production fix ships. No regression and no scope-guard violation.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| R1 Login 35d | ✅ Implemented (RED) | Asserts response `RefreshTokenExpiresAt` + persisted `RefreshTokens.ExpiresAt` ≈ UtcNow+35d (1h) |
| R2 Refresh rotation 35d | ✅ Implemented (RED) | Asserts new ≠ old + response & DB 35d; rotation details observed not asserted |
| Cleanup | ✅ | `finally` deletes all user `RefreshTokens` rows (no FK cascade) then user |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D2 Assert field + DB row | ✅ Yes | Both surfaces asserted per spec |
| D3 Real UtcNow + 1h window | ✅ Yes | `TimeSpan.FromHours(1)` Tolerance |
| D4 User-scoped RefreshTokens deletion then user | ✅ Yes | Local `RemoveWhereAsync<T>` in `finally` |
| D5 Assert 35d (documented RED) | ✅ Yes | `ExpectedLifetimeDays = 35`; not weakened to 7 |

### Requirement / Scenario coverage

#### Scenario: Login_returns_refresh_token_expiring_in_35_days
- GIVEN a SuperAdmin seeded with a unique login via `SeedSuperAdminAsync` (no store graph)
- WHEN `POST /api/v1/auth/login` returns 200 with `Succeeded`
- THEN `Data.RefreshToken` is non-empty AND `Data.RefreshTokenExpiresAt` equals `UtcNow + 35 days` within a 1-hour tolerance
- AND a `RefreshTokens` row where `TokenHash == HashToken(returned token)` has `ExpiresAt` equal to `UtcNow + 35 days` within a 1-hour tolerance
- AND cleanup in `finally` deletes the seeded user's `RefreshTokens` rows (no FK cascade) and the user
- **Result**: ✅ COMPLIANT — test reaches 200 OK, fails only at line 62 `off by 28d` (intended RED), cleanup ran

#### Scenario: Refresh_returns_new_refresh_token_expiring_in_35_days
- GIVEN a logged-in SuperAdmin holding an old refresh token
- WHEN `POST /api/v1/auth/refresh` sends `{ refreshToken: old }` and returns 200 with `Succeeded`
- THEN the new `RefreshToken` differs from the old AND its `RefreshTokenExpiresAt` equals `UtcNow + 35 days` within a 1-hour tolerance
- AND a new `RefreshTokens` row where `TokenHash == HashToken(new token)` has `ExpiresAt` equal to `UtcNow + 35 days` within a 1-hour tolerance
- AND cleanup in `finally` deletes ALL of the seeded user's `RefreshTokens` rows (including the revoked old row) and the user
- **Result**: ✅ PASSED — reaches 200 through login→rotation, fails only at line 113 (35d vs 7d), no 401

### Issues Found
**CRITICAL**: None (the 2 failures are intended documented-RED, NOT regressions)
**WARNING**: None
**SUGGESTION**: Tasks.md 3.2 count drifted (44→45 passed / 46→47 total) due to added Auth cases; no action required.

### Verdict
**PASS (canonical documented-RED — intended, archive-ready)** — the verify confirmed the expected evidence: both tests fail for the documented 7d-vs-35d reason; no regressions; no scope-guard violation. The suite exit code reflects the documented RED (tests fail by intent); the verification itself passed (`test_exit_code: 0` = evidence confirmed, blockers 0).

The 2 failures are **intended documented-RED**, not regressions. When the future 7→35 production change ships, both tests flip green UNTOUCHED.