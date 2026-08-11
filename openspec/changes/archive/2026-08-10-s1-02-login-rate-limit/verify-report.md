```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:760b43e73ea57036c9a94fef8e1d804dc9b28d9c61c4cf30befe76d4bbd1a563
verdict: pass
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 7/7
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~LoginRateLimitPoliciesTests"
test_exit_code: 0
test_output_hash: sha256:30a2c8e36c20a0ac9e97d410afad5ec7fc633e47aad41bf684bb569536228a70
build_command: dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
build_exit_code: 0
build_output_hash: sha256:fb7ae16eab02197e3512ce9f4507d3f75e557d5d5486ebf85fa3b101fddbd11f
```

## Verification Report

**Change**: s1-02-login-rate-limit
**Version**: N/A (coverage-only delta)
**Mode**: Standard (no Strict TDD runner active; no production code in change)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 12 |
| Tasks complete | 12 |
| Tasks incomplete | 0 |

All tasks 1.1-1.5, 2.1-2.3, 3.1-3.4 checked; 3/3 Definition-of-Done boxes checked. No pending task blocks full verification.

### Build & Tests Execution
**Build**: âœ… Passed (0 errors)
```text
dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
â†’ exit 0; 153 Warning(s), 0 Error(s). Warnings are pre-existing NU1902/NU1903 (package advisories) and CS86xx nullability across Domain/Infrastructure/Application/WebApi and other test files. Rebuild (forced) confirms LoginRateLimitPoliciesTests.cs(57,9) CS8602 mirrors RateLimitPoliciesTests.cs(57,9) CS8602 exactly â€” same warning, same column; no new warning class introduced by this file.
```

**Tests**: âœ… 4 passed (focused) / âœ… 8 passed (regression)
```text
Focused:   --filter "FullyQualifiedName~LoginRateLimitPoliciesTests" â†’ Passed! Failed: 0, Passed: 4, Skipped: 0, Total: 4, Duration: 13 ms (exit 0)
Regression: --filter "FullyQualifiedName~RateLimiting" --no-build â†’ Passed! Failed: 0, Passed: 8, Skipped: 0, Total: 8, Duration: 13 ms (exit 0)
```

**Coverage**: âž– Not available â€” no coverage command defined for this change; factory tests are assertion-based.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| New Login policy parity test file | File lands additive and standalone | `LoginRateLimitPoliciesTests.cs` (new, 89 lines) + `git status`/`git diff` | âœ… COMPLIANT |
| Options match production config | Config parity | `LoginRateLimitPoliciesTests > Login_policy_options_match_production_config` | âœ… COMPLIANT |
| Limiter behavior matches options | Acquire within and beyond limit | `LoginRateLimitPoliciesTests > Login_policy_limiter_behavior_matches_options` | âœ… COMPLIANT |
| Partition key is per IP | Two IPs | `LoginRateLimitPoliciesTests > Login_policy_partition_key_is_per_ip` | âœ… COMPLIANT |
| Null IP maps to "unknown" | Null IP | `LoginRateLimitPoliciesTests > Login_policy_null_ip_maps_to_unknown_partition` | âœ… COMPLIANT |
| Coverage boundary â€” factory pins options/partition, not HTTP 429 | Boundary is documented, not re-tested | Docs wording (README.md:96, S1-02.md:82, S1-02-backend.md:27) + no production diff | âœ… COMPLIANT |
| Docs coverage-state updates | Docs reflect real coverage | 3 doc-line diffs (1+/1- each) | âœ… COMPLIANT |

**Compliance summary**: 7/7 scenarios compliant (4 runtime-passed factory tests + 3 verified by source/git evidence).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| New Login policy parity test file | âœ… Implemented | namespace `SMCA.WebApi.E2ETests.RateLimiting`; usings 1-7 identical to original (no `Microsoft.Extensions.Http`); no `[Collection]`, no fixture, no PostgreSQL; helpers `ContextWithIp`/`BuildLimiter`/`OptionsOf` (:13-35) byte-for-byte identical to `RateLimitPoliciesTests.cs:13-35`; only call sites Registerâ†’Login |
| Options match production config | âœ… Implemented | `OptionsOf(RateLimitPolicies.Login(ContextWithIp(null)))` â†’ PermitLimit 5, Window 1min, SegmentsPerWindow 3, QueueLimit 0 â€” matches `RateLimitPolicies.cs:15-24` |
| Limiter behavior matches options | âœ… Implemented | ReplenishmentPeriod 20s (1min/3), CurrentAvailablePermits 5, `AttemptAcquire(6)` throws `ArgumentOutOfRangeException` "*permit limit of 5*", `AttemptAcquire(5)` acquired |
| Partition key is per IP | âœ… Implemented | "203.0.113.10" vs "203.0.113.11" â†’ distinct keys matching each IP |
| Null IP maps to "unknown" | âœ… Implemented | null `RemoteIpAddress` â†’ `"unknown"` (production fallback `?? "unknown"` pinned) |
| Coverage boundary | âœ… Implemented | Docs credit 429 to Playwright; factory pinning to new file; no production change (`Program.cs` guard untouched) |
| Docs coverage-state updates | âœ… Implemented | README.md:96 / S1-02.md:82 / S1-02-backend.md:27 each 1+/1-, coverage-state only, no invented runs |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 New standalone file; helpers copied | âœ… Yes | Helpers byte-for-byte; protected file untouched |
| D2 No `[Collection("e2e")]`, no fixture | âœ… Yes | Collection-less, DB-free, hermetic |
| D3 Test names mirror `Register_policy_*` convention | âœ… Yes | `Login_policy_options_match_production_config`, `_limiter_behavior_matches_options`, `_partition_key_is_per_ip`, `_null_ip_maps_to_unknown_partition` |
| D4 Docs wording "fija el lÃ­mite", never "cubre el 429 HTTP" | âœ… Yes | Grep over the 3 edited lines: 429 HTTP credited to Playwright in both mentions |
| D5 No csproj/package change | âœ… Yes | No csproj in git status; xUnit/FluentAssertions/reflection BCL suffice |

### Scope / Purity (git evidence)
- `git diff --stat` = 3 doc files, 1+/1- each (README.md, S1-02.md, S1-02-backend.md).
- `git status --porcelain` = 3 modified docs + 1 new untracked test file + `openspec/changes/s1-02-login-rate-limit/` artifacts. Exactly 1 new test + 3 docs, as specified.
- `git diff -- backend/src/SMCA.WebApi.E2ETests/RateLimiting/RateLimitPoliciesTests.cs` = **empty** â†’ protected existing test untouched.
- No production file touched (`Program.cs`, `AuthController.cs`, `RateLimitPolicies.cs` unchanged â€” not in git status).
- Note: `frontend-react/openspec/changes/offline-roster-login-actions/` appears untracked in git status â€” it belongs to a DIFFERENT change, not part of s1-02-login-rate-limit, and touches no code.

### Issues Found
**CRITICAL**: None
**WARNING**: None
**SUGGESTION**:
1. Helper duplication (~20 lines) is intentional and documented (design D1); if a third policy appears, extracting shared helpers requires user authorization because the original file is protected.
2. `LoginRateLimitPoliciesTests.cs:57` CS8602 nullability warning is a faithful mirror of the original `RateLimitPoliciesTests.cs:57` â€” accepted by design; do not "fix" it silently (it would deviate from the mirror contract).

### Verdict
PASS â€” 7/7 requirements and 7/7 scenarios compliant; focused 4/4 and regression 8/8 green; change is additive-only with zero production and zero protected-test footprint; docs wording verified (factory pinning credited to the new file, HTTP 429 credited to Playwright only).
