```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:7ade4eee24cc317204516604897d1cb6162263b3b0c2ab2a7810083fd03828c0
verdict: pass
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 13/13
test_command: dotnet test backend/src/Application.Tests/Application.Tests.csproj
test_exit_code: 0
test_output_hash: sha256:184e35d61857dd68a8d43a4196b04139e7c5c01e10e7bc25d520be1d1f9b9c89
build_command: dotnet build backend/src/SMCA.sln -v minimal
build_exit_code: 0
build_output_hash: sha256:287e1df6f5ad8fc2dc1a67a5d3ae0db3e48d5d2b2b130ffa3d4324494843ce8c
```

## Verification Report

**Change**: login-wrapped-dek
**Version**: auth-login-wrapped-dek + auth-login-e2e (delta specs, no version field)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 12 |
| Tasks complete | 12 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ✅ Passed — `dotnet build backend/src/SMCA.sln -v minimal` → 0 errors, 8 pre-existing NU1902/NU1903 warnings, exit 0 (sha256 `287e1df6…`).

**Tests**: ✅ 337 passed / 0 failed / 0 skipped — `dotnet test backend/src/Application.Tests/Application.Tests.csproj` → **337/337** (330 baseline + 4 wrap facts + 3 remediation facts), exit 0 (sha256 `184e35d6…`).

**E2E (filtered)**: ✅ 6 passed / 0 failed — `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLoginDekWrapTests"` → **6/6** (real PostgreSQL localhost:5432, db `smca_test`; server log shows the 401 invalid-password and 403 no-active-store branches firing), exit 0 (sha256 `d220aec1…`).

**E2E (full suite, regression)**: ✅ 348 passed / 0 failed — `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` → **348/348**, exit 0 (sha256 `b388a6be…`). Matches apply's claim exactly; roster suite (`ExportOfflineRosterTests`) green.

**Coverage**: ➖ Not available — no coverage tool detected in session capabilities; not a failure.

### Spec Compliance Matrix

auth-login-wrapped-dek (4 requirements / 7 scenarios):

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 any authenticated user gets wrap | StoreUser login receives a non-empty wrap | `LoginCommandHandlerTests.Handle_WithValidCredentials_ShouldReturnWrappedDekFields` (unit) + `AuthLoginDekWrapTests.StoreUser_login_returns_wrapped_dek_byte_equal_to_GetDek` (E2E) | ✅ COMPLIANT |
| R1 any authenticated user gets wrap | No admin permission is required | `AuthLoginDekWrapTests.StoreUser_login_returns_wrapped_dek_byte_equal_to_GetDek` — StoreUser is a plain non-admin role (RoleType.StoreUser), wrap non-empty | ✅ COMPLIANT |
| R2 KEK is Unprotect(stored envelope), never User.Password | Login wrap is byte-compatible with the roster wrap | `AuthLoginDekWrapTests.StoreUser_…_byte_equal_to_GetDek` + `OwnerAdmin_…_byte_equal_to_GetDek` — unwrap with the DB-stored pre-hash recovers bytes equal to `GetDek(storeId)` | ✅ COMPLIANT |
| R3 wrap after pre-hash backfill | First login receives the key | `AuthLoginDekWrapTests.First_login_backfills_prehash_and_returns_wrapped_dek` — seeded w/o pre-hash, login returns non-empty wrap + DB `OfflinePasswordPreHash` non-null | ✅ COMPLIANT |
| R4 degrade to empty; login never fails | SuperAdmin receives empty fields | `AuthLoginDekWrapTests.SuperAdmin_login_returns_empty_wrap_fields` (200 + 3 empty) + unit `Handle_WhenSelectedStoreIdIsEmpty_ShouldReturnEmptyFields_AndNotDeriveKey` (GetDek never called) | ✅ COMPLIANT |
| R4 degrade to empty; login never fails | Corrupt envelope degrades to empty | `LoginCommandHandlerTests.Handle_WhenDekWrapThrows_ShouldStillSucceedWithEmptyFields` — Unprotect throws, login Succeeded, 3 fields empty | ✅ COMPLIANT |
| R4 degrade to empty; login never fails | Register and Refresh deliver no wrap | `RegisterCommandHandlerTests.Handle_ShouldReturnSuccess_WithEmptyWrapFields` + `RefreshCommandHandlerTests.Refresh_withValidToken_returnsEmptyWrapFields` — both assert 3 fields empty on success (remediation `ea9e6ad4`) | ✅ COMPLIANT |

auth-login-e2e (4 requirements / 6 scenarios):

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| e2e R1 byte-compatible wraps | StoreUser login wrap equals the roster DEK | `AuthLoginDekWrapTests.StoreUser_login_returns_wrapped_dek_byte_equal_to_GetDek` | ✅ COMPLIANT |
| e2e R1 byte-compatible wraps | OwnerAdmin login wrap equals the roster DEK | `AuthLoginDekWrapTests.OwnerAdmin_login_returns_wrapped_dek_byte_equal_to_GetDek` | ✅ COMPLIANT |
| e2e R2 first-login backfill | First login backfills and wraps in one request | `AuthLoginDekWrapTests.First_login_backfills_prehash_and_returns_wrapped_dek` | ✅ COMPLIANT |
| e2e R3 empty on no store / no key on failures | SuperAdmin gets empty wrap fields | `AuthLoginDekWrapTests.SuperAdmin_login_returns_empty_wrap_fields` | ✅ COMPLIANT |
| e2e R3 empty on no store / no key on failures | Failed logins deliver no key | `AuthLoginDekWrapTests.Login_with_wrong_password_returns_401_without_dek_data` + `Login_to_inactive_store_returns_403_without_dek_data` — 401/403, `Data == null`, no AuthDto | ✅ COMPLIANT |
| e2e R4 cleanup removes seeded graph | Store graph rows are removed after each test | All 6 facts run `AuthzSeed.CleanupStoreGraphAsync` / `DbTestHelpers.CleanupUserAsync` in `finally`; helper verified FK-safe (StoreRoleFeature → StoreUser → StoreModule → Store → Owner → UserRole → User) | ✅ COMPLIANT |

**Compliance summary**: 13/13 scenarios compliant — the previously UNTESTED `Register and Refresh deliver no wrap` scenario now has passing runtime covering tests.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| AuthDto 3 trailing optional params default `""` | ✅ Implemented | `AuthDto.cs:15-17`; Register/Refresh call sites compile unchanged and stay wire-empty |
| Handler re-queries AFTER pre-hash backfill | ✅ Implemented | `LoginCommand.cs:77` after refresh-token `SaveChangesAsync` (line 75); `GetUserByIdIgnoreQueryFiltersAsync` (line 112) — mandatory: backfill is `ExecuteUpdateAsync` (UserRepository.cs:113) + `NoTracking` (CLAUDE.md trap); `RefreshCommand.cs:61` precedent |
| KEK = `Unprotect(stored envelope)`, never `User.Password` | ✅ Implemented | `LoginCommand.cs:116`; mirrors roster precedent `ExportOfflineRosterQuery.cs:118-120`; byte-parity proven by 2 E2E facts |
| Guards: null user / null preHash / Guid.Empty → empty | ✅ Implemented | `LoginCommand.cs:113-118`; null-user guard now pinned by `Handle_WhenRequeriedUserIsNull_ShouldReturnEmptyFields`; `User.SelectedStoreId` is non-nullable Guid (User.cs:25) |
| try/catch INSIDE helper, never outer 500 catch | ✅ Implemented | `LoginCommand.cs:106-130` — `LogWarning` + `("","","")`; outer catch untouched (R4: login never fails) |
| Register/Refresh compile and stay wire-empty | ✅ Implemented | `RegisterCommand.cs:132`, `RefreshCommand.cs:85` pass ≤5 args; defaults fill `""`; emptiness asserted by the 2 new unit facts |
| Roster export untouched | ✅ Implemented | `git show --stat` all 3 commits: `ExportOfflineRosterQuery.cs` / `OfflineRosterUserDto.cs` not in any diff; roster E2E green in full suite |
| New E2E file self-contained | ✅ Implemented | Local `LoginDekWrapData`, local `UnwrapDek` (PBKDF2+AES-GCM, `KekIterations = 210_000`), local `SeedStoreUserWithoutPreHashAsync`; `ExportOfflineRosterTests.cs` / `TestDtos.cs` not modified |
| DI wiring | ✅ Implemented | No change needed — 4 deps already registered; proven live by E2E facts hitting real `POST /api/v1/auth/login` |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Inline helper in handler (roster precedent) | ✅ Yes | `TryBuildLoginDekWrapAsync(Guid, CancellationToken)` matches design signature |
| `GetUserByIdIgnoreQueryFiltersAsync(userId.ToString())` re-query | ✅ Yes | Mandatory stale-entity workaround; applied after backfill + refresh save |
| KEK = Unprotect stored envelope | ✅ Yes | Never `User.Password` |
| Degrade policy: helper try/catch → warning + empty tuple | ✅ Yes | Outer catch untouched |
| Guard order user/preHash/Guid.Empty | ✅ Yes | Pre-hash null and Guid.Empty guarded before GetDek |
| AuthDto 3 trailing optional params | ✅ Yes | Exact design shape |
| E2E local DTO + local UnwrapDek | ✅ Yes | Deviation-free; apply's noted deviation (local `LoginDekWrapData` vs `ApiResponse<AuthDto>`) matches design preference |
| First-login inline seed helper | ✅ Yes | Mirrors `AuthzSeed.SeedStoreUserAsync` minus pre-hash line |
| Call site after `SaveChangesAsync` (line 63→75) | ✅ Yes | Line 77, before AuthDto construction (line 79) |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Found in apply-progress "TDD Cycle Evidence" table |
| All tasks have tests | ✅ | 12/12 tasks map to unit (7 facts) + E2E (6 facts) coverage |
| RED confirmed (tests exist) | ✅ | `LoginCommandHandlerTests.cs` (5 wrap facts incl. null-user), `RegisterCommandHandlerTests.cs` (1), `RefreshCommandHandlerTests.cs` (1), `AuthLoginDekWrapTests.cs` (6) |
| GREEN confirmed (tests pass) | ✅ | 337/337 unit + 6/6 E2E on execution |
| Triangulation adequate | ✅ | 5 unit degradation paths (populated / throw / null preHash / null user / Guid.Empty) + 6 E2E facts across 13 scenarios; `Guid.Empty` additionally pinned via `GetDek` never called |
| Safety Net for modified files | ✅ | apply reports 330/330 pre-edit for the modified unit file; E2E file is NEW (existing E2E/support files untouched — git-verified); full E2E 348/348 now |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 337 | `LoginCommandHandlerTests.cs`, `RegisterCommandHandlerTests.cs`, `RefreshCommandHandlerTests.cs` (+ entire Application.Tests) | xUnit + Moq + FluentAssertions |
| Integration | 0 | — | — |
| E2E | 348 | `AuthLoginDekWrapTests.cs` (+ entire E2E suite) | xUnit + WebAppFixture + real PostgreSQL |
| **Total** | **685** | | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected in session capabilities. (Informational, not a failure.)

### Assertion Quality
**Assertion quality**: ✅ All new assertions verify real behavior. The 7 new unit facts assert concrete values (`Be("wrapped-dek")`, `BeEmpty()`, `BeTrue()`, `Times.Never`); the remediation facts (`Handle_ShouldReturnSuccess_WithEmptyWrapFields`, `Refresh_withValidToken_returnsEmptyWrapFields`, `Handle_WhenRequeriedUserIsNull_ShouldReturnEmptyFields`) each call the production handler and assert Succeeded + 3 empty fields — no tautologies, no ghost loops, no smoke-only assertions. The 6 E2E facts assert HTTP status, wire-field non-emptiness/emptiness, byte-equality (`BeEquivalentTo(expected)` with `HaveCount(32)`), `Data == null` on failure, and DB pre-hash non-null.

### Quality Metrics
**Linter**: ➖ Not available (no separate .NET linter configured in session capabilities)
**Type Checker / Compiler**: ✅ No errors — `dotnet build backend/src/SMCA.sln -v minimal` exit 0; only pre-existing NU1902/NU1903 package-vulnerability warnings (present before this change per apply-progress).

### Git State
| Check | Result | Evidence |
|-------|--------|----------|
| Exactly 3 change commits | ✅ | `ea9e6ad4` (remediation) + `7d97ed6a` (E2E) + `aabb1b83` (prod+unit) on top of `04e6868f` archive |
| Only the 4 planned files + 3 remediation test files | ✅ | `git diff aabb1b83^ aabb1b83`: AuthDto.cs, LoginCommand.cs, LoginCommandHandlerTests.cs; `7d97ed6a`: AuthLoginDekWrapTests.cs (new); `ea9e6ad4`: +LoginCommandHandlerTests.cs, +RegisterCommandHandlerTests.cs, +RefreshCommandHandlerTests.cs (74 insertions, unit-only) |
| No existing E2E test modified | ✅ | All 3 commit stats show unit-test and new-file changes only; zero modifications to existing E2E files |
| Roster files untouched | ✅ | `ExportOfflineRosterQuery.cs` / `OfflineRosterUserDto.cs` / `ExportOfflineRosterTests.cs` / `TestDtos.cs` absent from all diffs |
| Working tree | ✅ | Only `M openspec/config.yaml` + `?? openspec/changes/login-wrapped-dek/` — planning artifacts intentionally uncommitted (per apply-progress; archive governs them) |
| Changed lines | ✅ | 640 total (566 accepted + 74 test-only remediation) — all 74 remediation lines are unit-test assertions, zero production-code risk delta |

### Issues Found
**CRITICAL**: None
**WARNING**: None
**SUGGESTION**:
1. (Optional hardening) E2E cleanup is verified by source inspection (finally blocks + FK-safe helper); a post-cleanup row-count assertion would harden e2e R4, but is not required — the helper is pre-existing, suite-proven infrastructure.

### Verdict
PASS — all 8 requirements implemented, 13/13 scenarios runtime-compliant with passing covering tests, 0 blockers, 0 CRITICAL, 0 WARNING. Full build + 337 unit + 348 E2E all green; the previously untested `Register and Refresh deliver no wrap` scenario and the null-user guard are now pinned by the remediation facts. Git state clean and scoped to the planned files. Ready for archive phase.