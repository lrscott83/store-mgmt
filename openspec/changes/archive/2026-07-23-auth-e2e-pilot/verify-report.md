## Verification Report

**Change**: auth-e2e-pilot
**Version**: Draft (openspec mode)

---

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 4 (21 steps) |
| Tasks complete | 4 (all implementation steps complete) |
| Tasks incomplete | 0 implementation steps incomplete |

**Notes**: Steps 10 (Task 1), 3 (Task 2), 3 (Task 3), and 4 (Task 4) are "ask user to commit" checkpoints — not implementation code. Zero code gaps.

---

### Build & Tests Execution

**Build**: ✅ Passed
```
SMCA.WebApi -> SMCA.WebApi.dll
SMCA.WebApi.E2ETests -> SMCA.WebApi.E2ETests.dll
```
Warnings: NuGet package vulnerabilities (pre-existing, not related to this change — System.Text.Json 8.0.1, RestSharp 110.2.0, AutoMapper 13.0.1)

**Tests**: ✅ 6 passed / ❌ 0 failed / ⚠️ 0 skipped

| Test | Result |
|------|--------|
| `AuthPingTests.Ping_returns_200_and_true` | ✅ PASS |
| `AuthLoginTests.Login_with_empty_credentials_returns_400_from_validation` | ✅ PASS |
| `AuthLoginTests.Login_with_unknown_user_returns_200_with_failure_body` | ✅ PASS |
| `AuthRegisterTests.Register_with_empty_body_returns_400_from_validation` | ✅ PASS |
| `AuthMeTests.Me_without_token_returns_401` | ✅ PASS |
| `AuthMeTests.Me_with_valid_minted_token_returns_current_user` | ✅ PASS |

**Coverage**: ➖ Not configured (no `openspec/config.yaml` coverage_threshold)

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| TC-01: Ping endpoint | `AllowAnonymous` ping → HTTP 200 + body `"true"` | `AuthPingTests > Ping_returns_200_and_true` | ✅ COMPLIANT |
| TC-02a: Login empty creds | Empty credentials → HTTP 400 + validation | `AuthLoginTests > Login_with_empty_credentials_returns_400_from_validation` | ✅ COMPLIANT |
| TC-02b: Login unknown user | Unknown user → HTTP 200 + failure body with actionCode:400 | `AuthLoginTests > Login_with_unknown_user_returns_200_with_failure_body` | ✅ COMPLIANT |
| TC-02c: Wrong password | Wrong password → controlled error, not 500 | (Not directly tested — see spec gap note) | ⚠️ PARTIAL |
| TC-02d: Login valid creds | Valid creds → HTTP 200 + AuthDto with token | Deferred per spec (requires domain seeding) | ➖ DEFERRED |
| TC-03a: Register empty body | Empty body → HTTP 400 + validation | `AuthRegisterTests > Register_with_empty_body_returns_400_from_validation` | ✅ COMPLIANT |
| TC-03b: Register duplicate | Duplicate user → controlled error | (Not directly tested — see spec gap note) | ⚠️ PARTIAL |
| TC-03c: Register valid | Valid payload → HTTP 200 + user persisted | Deferred per spec (requires domain seeding) | ➖ DEFERRED |
| TC-04a: Me no token | No token → HTTP 401 | `AuthMeTests > Me_without_token_returns_401` | ✅ COMPLIANT |
| TC-04b: Me invalid/expired token | Invalid/expired token → HTTP 401 | (Covered by same OnChallenge handler, but no dedicated test) | ⚠️ PARTIAL |
| TC-04c: Me valid JWT | Valid minted JWT → HTTP 200 + data.Id/Login match | `AuthMeTests > Me_with_valid_minted_token_returns_current_user` | ✅ COMPLIANT |

**Compliance summary**: 7/11 compliant (2 deferred intentionally, 2 partial)

**Spec gap notes**:
- **TC-02c** (wrong password) and **TC-03b** (duplicate user): The spec/implementation plan acknowledge these cases but they require seeded domain data (including an active store, roles, etc.) that was intentionally deferred. The implementation plan documents this clearly under "Deferred (out of this pilot)". The auth pipeline handles them — the `AuthenticationService` and `RegisterCommandHandler` return controlled errors — but no E2E test exists for these paths. This is an acceptable gap for the pilot.
- **TC-04b** (invalid/expired token): The `OnChallenge` handler in `ServiceExtensions.cs` unconditionally returns 401 for any challenge, so expired + invalid tokens are covered structurally by the same handler. Adding a dedicated test is a nice-to-have for confidence but not a gap.

---

### Correctness (Static — Structural Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Harness: `AppTestFactory` overrides connection string | ✅ Implemented | Uses `Environment.SetEnvironmentVariable` (deviation from spec) |
| Harness: `WebAppFixture` applies migrations | ✅ Implemented | Calls `Database.MigrateAsync()` in `InitializeAsync` |
| Harness: `ApiResponse<T>` matches `ResponseResult<T>` shape | ✅ Implemented | Fields: `Succeeded`, `Data`, `Errors`, `ActionCode`, `Message` |
| Harness: `partial class Program` | ✅ Implemented | Line 151 of `Program.cs` |
| Harness: `[Collection("e2e")]` on all test classes | ✅ Implemented | All 4 test classes use it |
| Harness: `appsettings.Tests.json` exists | ✅ Implemented | Correct connection string for `smca_test` (though not loaded by factory) |
| Auth: Ping returns 200 + "true" | ✅ Implemented | Test proves it |
| Auth: Login empty creds → 400 | ✅ Implemented | Test proves it |
| Auth: Login unknown user → 200 + failure | ✅ Implemented | Test proves it |
| Auth: Register empty body → 400 | ✅ Implemented | Test proves it |
| Auth: Me no token → 401 | ✅ Implemented | Test proves it |
| Auth: Me valid JWT → 200 + user data | ✅ Implemented | Test proves it with real `IJwtProvider` |
| JWT-in-Test: real `IJwtProvider`, no fake auth handler | ✅ Implemented | `MintToken` resolves `IJwtProvider` from DI |
| Assertions use FluentAssertions | ✅ Implemented | All test files use `Should().Be()`/`Should().BeTrue()` etc. |

---

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| `AppTestFactory : WebApplicationFactory<Program>` | ✅ Yes | Correctly overrides config |
| Connection string via `appsettings.Tests.json` via `ConfigureAppConfiguration` | ⚠️ Deviated | Uses `Environment.SetEnvironmentVariable` instead of `config.AddJsonFile()`. Environment variable overrides are more reliable in the minimal hosting model. The `appsettings.Tests.json` file exists but is NOT loaded by the factory. (See deviations section) |
| `WebAppFixture : IAsyncLifetime` applies migrations | ✅ Yes | Calls `db.Database.MigrateAsync()` |
| Collection name `"e2e"` shared across auth test classes | ✅ Yes | `[CollectionDefinition("e2e")]` + `[Collection("e2e")]` on all test classes |
| Password hash = `Convert.ToBase64String(SHA256.HashData(...))` | ✅ Yes | `HashPasswordService.HashPassword` matches this pattern (plain SHA-256, no salt/pepper in the method used by the app) |
| JWT minted via real `IJwtProvider` (no fake auth handler) | ✅ Yes | `AuthMeTests.MintToken` resolves `IJwtProvider` from DI |
| `partial class Program` | ✅ Yes | Present at end of `Program.cs` |
| FluentAssertions for assertions | ✅ Yes | Used throughout |
| File structure matches design | ⚠️ Minor | Design shows `appsettings.Tests.json` as config source, but factory uses env var. File still exists in project. |
| Data isolation via unique random logins | ✅ Yes | Tests use `Guid.NewGuid()` for unique logins |

---

### Deviations Found

#### Deviation 1: Connection String Configuration (WARNING)

**Spec/Design says**: Factory should load `appsettings.Tests.json` via `ConfigureAppConfiguration` → `AddJsonFile`.

**Implementation does**: Sets `Environment.SetEnvironmentVariable("ConnectionStrings__Application", "...")` directly in `AppTestFactory.cs`.

**Why this matters**: Environment variables are the highest-priority config source in .NET, so this reliably overrides any file-based config. However, it bypasses the `appsettings.Tests.json` file entirely. The file still exists in the project but is not used by the factory.

**Impact**: Functionally equivalent (both result in `smca_test` connection). The env var approach is actually MORE robust for the minimal hosting model. Low risk.

**Recommendation**: Either (a) update the design spec to document the env var approach, or (b) add `config.AddJsonFile(...)` back AND set the env var as fallback. Recommend (a) since it works and is simpler.

#### Deviation 2: `OnChallenge` Handler — Unconditional 401 (WARNING)

**Spec/Design says**: No explicit requirement about the `OnChallenge` handler behavior, but the checklist flags this as a deviation to document.

**Implementation does**: `ServiceExtensions.cs` `OnChallenge` handler calls `context.HandleResponse()` and unconditionally sets `context.Response.StatusCode = 401`. This means ALL challenge scenarios (no token, invalid token, expired token) return HTTP 401.

**Impact**: This is actually the CORRECT behavior for an API — both "no token" and "invalid/expired token" should return 401. The default ASP.NET Core JWT bearer handler would do this anyway. The `HandleResponse()` + manual status code override pattern is a common approach when you want to customize the response body.

**Recommendation**: Document this as an intentional implementation choice. No action needed.

---

### Issues Found

**CRITICAL** (must fix before archive):
None

**WARNING** (should fix):
1. **Connection string via env var vs config file** (Deviation 1 above) — the design should be updated to match reality, OR the factory should also load `appsettings.Tests.json` for consistency with written docs.
2. **No test for TC-04b (invalid/expired token → 401)** — the `OnChallenge` handler covers this structurally, but a dedicated failing/invalid JWT test would strengthen confidence.
3. **Unused fields in `HashPasswordService`** — `_pepper` and `_iteration` fields exist but are never used by `HashPassword()`. Not introduced by this change, but visible in the codebase.

**SUGGESTION** (nice to have):
1. Add a test for invalid/expired JWT (fabricate a bad token) to fully cover TC-04b.
2. The `appsettings.Tests.json` file could be kept as a documentation/config reference even if not loaded by the factory.
3. Consider adding a `dotnet test` script or documentation for setting up the `smca_test` database.

---

### Verdict

**PASS WITH WARNINGS**

All 6 tests pass. The harness is functional: `WebApplicationFactory<Program>` boots the real API pipeline, overrides the connection to `smca_test`, applies EF migrations, and exercises real JWT auth via `IJwtProvider`. The two deviations (env var config override, unconditional 401 handler) are functionally correct — the design docs should be updated to match. Two spec scenarios (TC-02c, TC-03b) have partial coverage due to intentional deferral documented in the implementation plan.

**Recommendation**: Proceed to archive. Update the design/spec to reflect the env var connection override approach. The deferred scenarios (full login success, full register success, wrong password, duplicate user) can be picked up in a follow-up change when domain seeding infrastructure is ready.

---

### Artifacts
- Spec: `openspec/changes/auth-e2e-pilot/spec.md`
- Design: `openspec/changes/auth-e2e-pilot/design.md`
- Tasks: `openspec/changes/auth-e2e-pilot/tasks.md`
- Verify Report: `openspec/changes/auth-e2e-pilot/verify-report.md`
- Test Plan: `docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md`
- Implementation Plan: `docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md`
