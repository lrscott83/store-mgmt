# Verification Report

**Change**: `register-endpoint-fixes`
**Version**: N/A (delta specs)
**Date**: 2026-07-31

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 16 |
| Tasks complete | 16 |
| Tasks incomplete | 0 |

All 5 phases (Foundation, Core Implementation, Controller Wiring, Testing, Documentation) are marked `[x]` in `tasks.md`. All claims in `apply-progress.md` were cross-checked against the real code and confirmed present.

---

## Build & Tests Execution

**Build**: ✅ Passed (0 errors, 8 pre-existing NuGet vulnerability warnings — NU1902/NU1903, unrelated to this change)

```
Build succeeded.
    8 Warning(s)  (NU1902/NU1903 — pre-existing package vulnerabilities)
    0 Error(s)
```

**Unit tests** (Register commands + CreateStoreService): ✅ 128 passed / ❌ 0 failed

```
dotnet test Application.Tests.csproj --filter "FullyQualifiedName~Authentication.Commands.Register|FullyQualifiedName~Services.Stores.CreateStoreService"
Passed!  - Failed: 0, Passed: 128, Skipped: 0, Total: 128
```

**E2E tests** (AuthRegister*): ✅ 11 passed / ❌ 0 failed

```
dotnet test SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~Auth.AuthRegister"
Passed!  - Failed: 0, Passed: 11, Skipped: 0, Total: 11
```

**Coverage**: ➖ Not configured (no `coverage_threshold` set)

---

## Spec Compliance Matrix

### auth-register-contract (S1 — 201 + AuthDto)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Register returns 201 with AuthDto | Valid payload → `POST /api/v1/auth/register` | `AuthRegisterSuccessTests.Register_with_valid_payload_creates_owner_and_store` | ✅ COMPLIANT — Controller: `Created("/api/v1/auth/me", result)` (201). E2E asserts `HttpStatusCode.Created`, `body.Data.Login` matches, `AuthToken` not empty, `ExpiresIn` after now. Handler returns `ResponseResult.Success(new AuthDto(request.Login, token, expiresAt))` — JWT no longer discarded |

### auth-register-contract (S2a — Controller Attributes)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| `[FromBody]` on command | Inspect `RegisterAsync` annotations | Static analysis (code review) | ✅ COMPLIANT — `RegisterAsync([FromBody] RegisterCommand command)` present (AuthController.cs:90) |
| `[ProducesResponseType]` 201/400/429/500 | Inspect annotations | Static analysis (code review) | ✅ COMPLIANT — 201 (`ResponseResult<AuthDto>`), 400, 429, 500 all present (AuthController.cs:84-87) |
| `[EnableRateLimiting("RegisterPolicy")]` | Inspect annotations | Static analysis (code review) | ✅ COMPLIANT — Present on `RegisterAsync` (AuthController.cs:89) |

### auth-register-contract (S2b — Location Header)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| `Location` = `/api/v1/auth/me` | Successful registration | Static analysis (code review) | ✅ COMPLIANT — `Created("/api/v1/auth/me", result)` sets the Location header exactly as spec'd. **Deviation from design**: design specified `CreatedAtAction(nameof(GetMeAsync))`, but E2E showed minimal-API endpoint-name resolution issues; `Created("path")` was used instead (documented in archive-report). Final behavior matches the spec. |

### rate-limiting (S3a/S3b — RegisterPolicy 10 req / 10 min)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Policy configured: 10 req / 10 min sliding window per IP | Inspect `Program.cs` | Static analysis (code review) | ✅ COMPLIANT — `AddPolicy("RegisterPolicy", ...)` with `PermitLimit = 10`, `Window = TimeSpan.FromMinutes(10)`, `SegmentsPerWindow = 10`, partition by `RemoteIpAddress` (Program.cs:128-137) |
| 429 after 11th request | 10 requests already from same IP | No automated test | ⚠️ PARTIAL — **Not covered by automated tests**: the rate limiter is registered only when `!builder.Environment.IsEnvironment("Testing")` (Program.cs:111), so E2E runs in the Testing environment never exercise the 429 path. This mirrors the pre-existing `LoginPolicy` guard. Config matches spec via static analysis; behavioral 429 unverified. |

### user-repository (S4a/S4b/S4c — Real Async)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Uses `AnyAsync()`, not `Task.FromResult(All(...))`/`ToList`/sync `.Any()/.All()` | Inspect implementation | Static analysis (code review) | ✅ COMPLIANT — `return !await _users.IgnoreQueryFilters().AnyAsync(u => u.Login == login);` (UserRepository.cs:101). No sync EF constructs remain. |
| Returns true when login NOT unique / false when unique | Behavioral contract | `RegisterCommandHandlerTests` (duplicate login paths) + validator | ✅ COMPLIANT — ⚠️ **Spec wording note**: spec scenarios 4a/4b describe raw `AnyAsync` semantics ("returns true when login EXISTS"), but the method is `IsUniqueLoginAsync` and returns the **negation** (`true` = login absent/unique), preserving the original `All(t => t.Name != name)` contract. Design AD4 explicitly required "no caller change". Validator's `MustAsync(IsUniqueName)` still accepts unique logins. Implementation is backward-compatible and correct; spec table wording is inverted but behavior is unambiguous. |

### store-service (S5a/S5b — Batch Module Query + Insert)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| `GetModulesByIdsAsync` called ONCE, `GetByIdAsync` ZERO times | N modules for store type | `CreateStoreServiceTests` (mock setup line 70, verify line 637) | ✅ COMPLIANT — Code: `(await _moduleRepository.GetModulesByIdsAsync(moduleIds)).ToDictionary(m => m.Id)` then in-loop `modules.TryGetValue(...)` (CreateStoreService.cs:39-44). No `GetByIdAsync` call remains. |
| `AddRangeAsync` called ONCE, `AddAsync` ZERO times for modules | N modules persisted | `CreateStoreServiceTests` line 255: `Verify(x => x.AddAsync(It.IsAny<StoreModule>()), Times.Never)` | ✅ COMPLIANT — `await _storeModuleRepository.AddRangeAsync(storeModules)` (CreateStoreService.cs:53). Single batch call. |

### store-service (S7a/S7b/S7c — ReSeller Fault Tolerance)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Lookup throws → warning logged, registration continues | Exception in lookup | `RegisterCommandHandlerReSellerTests` (passing) + static analysis | ✅ COMPLIANT — `catch (Exception ex) { _logger.LogWarning(ex, "ReSeller lookup failed for code {Code}..."); reSeller = null; }` (RegisterCommand.cs:100-104). Logs warning with exception and continues. |
| Lookup returns null → silent continuation | Null ReSeller | `RegisterCommandHandlerReSellerTests` | ✅ COMPLIANT — `if (reSeller != null)` guards association (RegisterCommand.cs:106) |
| ReSeller found → association created | Valid ReSeller | `RegisterCommandHandlerReSellerTests` (8 assertions of `Succeeded` true) | ✅ COMPLIANT — `ReSellerOwner.Create(...)` + `AddAsync` (RegisterCommand.cs:110-111) |

**Note on AD7 scope**: design said "remove generic catch" — the empty lookup catch WAS fixed with `LogWarning`. A separate `catch (Exception)` remains around `ReSellerOwner.AddAsync` (RegisterCommand.cs:113), but that is the association-failure path returning a proper `Register.ReSellerAssociationFailed` error — intentional hard failure, not the silent catch targeted by the change.

### generic-repository (S6a/S6b — AddRangeAsync)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| `IGenericRepository` declares `Task AddRangeAsync(IEnumerable<TEntity>)` | Inspect interface | Static analysis (code review) | ✅ COMPLIANT — Declared (IGenericRepository.cs:9) |
| `GenericRepository` implements via `DbContext.AddRangeAsync()` | Inspect implementation | Static analysis (code review) | ✅ COMPLIANT — `await _dbContext.Set<TEntity>().AddRangeAsync(entities);` (GenericRepository.cs:34-37) |

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `RegisterCommand` → `ICommand<AuthDto>` | ✅ Implemented | Task 2.1 — `ICommand<AuthDto>` (RegisterCommand.cs:23) |
| Handler returns `AuthDto` with JWT | ✅ Implemented | Task 2.2 — `ResponseResult.Success(new AuthDto(request.Login, token, expiresAt))` (RegisterCommand.cs:132) |
| `ILogger<RegisterCommandHandler>` + ReSeller `LogWarning` | ✅ Implemented | Tasks 2.3 — injected, lookup catch logs with exception (RegisterCommand.cs:37, 102) |
| `IAuthTokenConfig` for `ExpiresIn` | ✅ Implemented (deviation) | Not in original design; needed to avoid hardcoding token lifetime. Matches `LoginCommandHandler` pattern. |
| Unused deps removed | ✅ Implemented | `IUserRepository`, `IHttpContextService` removed from handler/constructor |
| N+1 eliminated in `CreateStoreService` | ✅ Implemented | Tasks 2.4/2.5 — single batch query + `AddRangeAsync` |
| `[FromBody]` + 201 + `[ProducesResponseType]` + `[EnableRateLimiting]` | ✅ Implemented | Tasks 3.1-3.4 |
| `RegisterPolicy` (10 req/10 min) | ✅ Implemented | Task 1.4 |
| `IsUniqueLoginAsync` real async | ✅ Implemented | Task 1.3 — `!await AnyAsync(...)`, no CancellationToken param (design said no caller change) |
| `AddRangeAsync` interface + impl | ✅ Implemented | Tasks 1.1/1.2 |
| Tests updated to `AuthDto` assertions | ✅ Implemented | Tasks 4.1-4.3 — fixture has `MockLogger` + `MockAuthTokenConfig`; `RegisterCommandHandlerTests` assert `Data.Login`, `Data.AuthToken` not empty, `Data.ExpiresIn` after now; PerformanceTests assert token value |
| Error paths return `ResponseResult<AuthDto>` | ✅ Implemented | Task 4.4 — all `ResponseResult.Failure<AuthDto>` calls (ErrorHandlingTests pass) |
| Frontend contract doc updated | ✅ Implemented | Task 5.1 — 201 Created, `AuthDto` shape, 429 handling documented |
| Main specs synced | ✅ Implemented | `auth-http` (S2/S3 AuthDto), `rate-limiting`, `user-repository`, `store-service`, `generic-repository` all present under `openspec/specs/` with RegisterPolicy/AnyAsync/AddRangeAsync content verified |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| AD1: `ICommand<AuthDto>` return type | ✅ Yes | JWT exposed for auto-login |
| AD2: 201 Created | ✅ Yes | `Created("/api/v1/auth/me", result)` — **path deviation** from `CreatedAtAction(nameof(GetMeAsync))`; documented, spec's Location requirement met |
| AD3: RegisterPolicy 10 req / 10 min sliding window | ✅ Yes | PermitLimit 10, Window 10 min, per-IP partition |
| AD4: `AnyAsync` real async, no caller change | ✅ Yes | Negation preserved; validator untouched |
| AD5: Batch module query + Dictionary lookup | ✅ Yes | `ToDictionary(m => m.Id)` + `TryGetValue` |
| AD6: `AddRangeAsync` on generic repo | ✅ Yes | Interface + `DbContext.Set<TEntity>().AddRangeAsync` |
| AD7: ReSeller lookup logging | ✅ Yes | `LogWarning` with exception, flow continues |
| AD8: Controller hygiene attributes | ✅ Yes | All 4 attributes present |

**Unplanned addition**: `IAuthTokenConfig` dependency (not in design AD list) — necessary for `ExpiresIn` calculation; follows existing `LoginCommandHandler` pattern. Justified deviation, recorded in apply-progress and archive-report.

---

## Issues Found

### CRITICAL (must fix before archive)

None.

### WARNING (should fix)

1. **Rate-limit 429 path is not covered by any automated test** — `Program.cs` registers rate limiters only outside the `Testing` environment (Program.cs:111), so the E2E suite cannot exercise spec scenario 3b (`429` after 11 requests). The policy configuration itself is correct and verified statically. Same gap exists for `LoginPolicy` (pre-existing). If 429 coverage is desired, a dedicated E2E host without the environment guard (or a unit test of the policy options) would be needed.

2. **Spec scenario 4a/4b wording is inverted** — `user-repository/spec.md` describes `IsUniqueLoginAsync` as returning `true` when login *exists*, but the method returns `true` when the login is *unique* (absent), consistent with its name, the original `All(...)` semantics, and the "no caller change" design decision. The implementation is correct; the spec table text is misleading and should be corrected for future readers.

### SUGGESTION (nice to have)

3. **`CreatedAtAction` never used for register** — design's Location-header intent (pointing at `GetMe`) is preserved via the literal path. If route-name-based linking is desired later, the minimal-API endpoint name issue that forced `Created("path")` should be fixed first.

---

## Verdict

**PASS**

The implementation matches the spec and design across all 16 tasks. Verified against the real code, not just the apply-progress claims:

- **8/8 bug fixes** confirmed present in code: `ICommand<AuthDto>` + JWT returned (critical fix), 201 Created, `RegisterPolicy` 10/10min, real-async `IsUniqueLoginAsync`, N+1 batch query + `AddRangeAsync`, ReSeller `LogWarning`, controller attributes.
- **Build**: 0 errors.
- **Tests**: 128 unit + 11 E2E — all passing, including the E2E that asserts the full new contract (201 + `AuthDto` with valid JWT).
- **Deviations** (all documented in apply-progress/archive-report): `CreatedAtAction` → `Created("path")` (spec-compliant Location), `IAuthTokenConfig` addition, unused-dep removal. None are spec violations.

Only caveat: the 429 rate-limit behavior (spec 3b) is not exercised by automated tests because the limiter is disabled in the Testing environment — a pre-existing test-infrastructure gap, not an implementation defect.
