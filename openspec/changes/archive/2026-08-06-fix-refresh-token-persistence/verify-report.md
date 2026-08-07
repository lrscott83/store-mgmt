```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:6260c57229bd27d8d9f41ade2cf8e71967e821af94ec28c805122bbd411e21dc
verdict: pass
blockers: 0
critical_findings: 0
requirements: 4/4
scenarios: 4/4
test_command: dotnet test backend/src/SMCA.sln --no-build --no-restore
test_exit_code: 0
test_output_hash: sha256:6260c57229bd27d8d9f41ade2cf8e71967e821af94ec28c805122bbd411e21dc
build_command: dotnet build backend/src/Application.Tests/Application.Tests.csproj --no-dependencies
build_exit_code: 0
build_output_hash: sha256:f0880910455e5389b2ae41971434fbec72f973fcaf743afb99245b69e414a7b8
```

## Verification Report

**Change**: fix-refresh-token-persistence
**Version**: N/A (delta spec, first version)
**Mode**: Strict TDD
**Branch**: fix/refresh-token-persistence
**Commits**: a20fddbc (implementation, 7 files, +240/−7) + b87ee9d0 (tasks.md check-off)
**Evidence revision preimage**: raw full-suite test output (`dotnet test backend/src/SMCA.sln --no-build --no-restore`, minimal verbosity)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 16 |
| Tasks complete | 16 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ✅ Passed
```text
dotnet build backend/src/Application.Tests/Application.Tests.csproj --no-dependencies
Exit 0 — 0 errors, 15 warnings (pre-existing CS8620/CS8602 nullable + NU1903/NU1902 package advisories in untouched files/packages)
build_output_hash: sha256:f0880910455e5389b2ae41971434fbec72f973fcaf743afb99245b69e414a7b8
```

**Tests (handler filter)**: ✅ 35/35 passed
```text
dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~LoginCommandHandlerTests|FullyQualifiedName~RefreshCommandHandlerTests|FullyQualifiedName~RevokeCommandHandlerTests" --no-build --no-restore
Exit 0 — Passed: 35, Failed: 0, Skipped: 0 (Login 18 + Refresh 7 incl. R4 Theory null/revoked/expired + Revoke 6; matches apply GREEN)
test_output_hash: sha256:3ec302011eee1432f0fcae6a87e139fde8cc1d45241ff46216e97c0116d8944a
```

**Tests (full solution regression)**: ✅ 653/653 passed
```text
dotnet test backend/src/SMCA.sln --no-build --no-restore -v minimal
Exit 0 — Domain.UnitTests 22/22, Application.Tests 326/326, SMCA.WebApi.E2ETests 305/305
test_output_hash: sha256:6260c57229bd27d8d9f41ade2cf8e71967e821af94ec28c805122bbd411e21dc
```

**Coverage**: ➖ Not available — no coverage tool configured; changed-file coverage analysis skipped (not a failure).

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1: Login persists the issued refresh token | Successful login with a unique superadmin persists the refresh token | `LoginCommandHandlerTests.Handle_WithValidCredentials_ShouldCallAdd_AndSaveChangesAsync` | ✅ COMPLIANT |
| R2: Refresh persists the rotated refresh token | Valid old token rotates and persists | `RefreshCommandHandlerTests.Refresh_rotatesToken_persistsChanges` | ✅ COMPLIANT |
| R3: Revoke persists the revocation | Revoke request persists the revocation | `RevokeCommandHandlerTests.Revoke_specificToken_persistsRevocation` | ✅ COMPLIANT |
| R4: Failure paths must not save | Invalid refresh token fails without saving | `RefreshCommandHandlerTests.Refresh_withInvalidToken_ShouldNotSave` (Theory: null/revoked/expired) | ✅ COMPLIANT |

**Compliance summary**: 4/4 scenarios compliant (all covering tests passed at runtime).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| R1 | ✅ Implemented | `LoginCommand.cs:62-63` — `_refreshTokenRepository.Add(refreshToken)` then `await _applicationUnitOfWork.SaveChangesAsync(cancellationToken)` inside success path; invalid credentials return at L50-54 before staging |
| R2 | ✅ Implemented | `RefreshCommand.cs:77-80` — `Update(existingToken)` + `Add(newRefreshToken)` then one `SaveChangesAsync`; false comment at L73 replaced with explicit persistence warning (L77) |
| R3 | ✅ Implemented | `RevokeCommand.cs:47-50` — specific-token save inside `!token.IsRevoked` guard after `Update`; L66-68 revoke-all single save when `activeTokens.Count > 0` |
| R4 | ✅ Implemented | Login invalid credentials (L50-54); Refresh null/revoked/expired (`!IsActive`, L50-55) and user-not-found (L59-64) return before any save; Revoke idempotent — no save when nothing staged; `IsActive => !IsExpired && !IsRevoked` covers both revoked and expired |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1: Option B — explicit saves in the 3 handlers | ✅ Yes | `IApplicationUnitOfWork` injected and `SaveChangesAsync` called after staging in all 3; `UnitOfWorkBehaviour` functionally untouched |
| D2: Ctor param appended as LAST | ✅ Yes | Login L34, Refresh L32, Revoke L27 — UoW is the last ctor parameter in all three; `using Application.UnitOfWorks;` present |
| D3: Revoke save placement — "save iff staged" | ✅ Yes | Specific-token inside `!IsRevoked` guard; revoke-all one save after loop only when `Count > 0` |
| D4: Dead pipeline — comment-only warning | ✅ Yes | `UnitOfWorkBehaviour.cs:38-40` — "Do not rely on this pipeline behaviour to persist changes…" added; `return true;` unchanged |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress (Engram #643, topic `sdd/fix-refresh-token-persistence/apply-progress`): baseline safety net 27/27; RED 3 failed (Times.Once save assertions) / 32 passed; GREEN filter 35/35; full SMCA.sln 653/653 — narrative cycle evidence |
| All tasks have tests | ✅ | 16/16 tasks covered — 7 new save assertions across 3 test files; comment-only/verification tasks proven by diff + run evidence |
| RED confirmed (tests exist) | ✅ | 3/3 changed test files exist; all 7 design-table assertions located (Login 3, Refresh 2, Revoke 2) |
| GREEN confirmed (tests pass) | ✅ | 35/35 filter, 326/326 Application.Tests, 653/653 full solution — independently re-run this phase, all exit 0 |
| Triangulation adequate | ✅ | R4 Theory triangulates null/revoked/expired (3 cases); success paths assert save-once + staging + value (e.g. `stagedToken.UserId`) |
| Safety Net for modified files | ✅ | Baseline 27/27 pre-RED (attested); full 653/653 green now; zero E2E files touched (diff empty, both commit ranges) |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 35 changed-scope (326 full Application.Tests) | 3 changed | xUnit, Moq, FluentAssertions |
| Integration | 0 | 0 | — |
| E2E | 305 (regression only, untouched) | 0 changed | WebApplicationFactory + real PostgreSQL |
| **Total** | **653** | **3 changed** | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected (not a failure).

### Assertion Quality
**Assertion quality**: ✅ All 7 new assertions verify real behavior — `SaveChangesAsync`/`Update`/`Add` `Times.Once`/`Times.Never` verifies the persistence contract the spec mandates; R4 Theory asserts `Times.Never` across null/revoked/expired; value assertions (`.Be(...)`, `stagedToken.UserId`) accompany type checks; no tautologies, no ghost loops, no smoke tests.

### Quality Metrics
**Linter**: ➖ Not available
**Type Checker**: ✅ 0 errors (build exit 0); warnings CS8620/CS8602/NU1903/NU1902 pre-existing in files/packages untouched by this change

### E2E-Touch Proof
`git diff --name-only a20fddbc b87ee9d0 -- backend/src/SMCA.WebApi.E2ETests/` → EMPTY (exit 0, no files)
`git diff --name-only e8d6ba9c a20fddbc -- backend/src/SMCA.WebApi.E2ETests/` → EMPTY (E2E_EMPTY)
Full change range `e8d6ba9c..b87ee9d0`: 8 files — 3 handlers, 1 comment-only behaviour, 3 test files, tasks.md. Zero E2E files modified. E2E suite ran green (305/305) as regression evidence.

### Issues Found
**CRITICAL**: None
**WARNING**: None
**SUGGESTION**:
1. Revoke revoke-all branch (`Count > 0` → single `SaveChangesAsync`) has no direct `Verify` on the save; `Revoke_withoutToken_revokesAllActive` asserts repo `Update` `Times.Exactly(2)` but not the UoW save. No-save side is covered (`Revoke_alreadyRevoked_isIdempotent`, `Revoke_withoutToken_noActiveTokens_returnsSuccess`). Optional gap; non-blocking.
2. Pre-existing package advisories surfaced by build: NU1903 `System.Text.Json` 8.0.1 (high, Domain), NU1903 `AutoMapper` 13.0.1 (high, Application), NU1902 `RestSharp` 110.2.0 (moderate, Infrastructure) — unrelated to this change; track separately.
3. Pre-existing nullable warnings (CS8620/CS8602) in Application.Tests files untouched by this change.

### Verdict
PASS — 4/4 requirements and 4/4 scenarios compliant with passing runtime evidence, 16/16 tasks complete, design fully coherent, full 653/653 regression green, E2E untouched.
