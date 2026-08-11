# Tasks: Business Rejections Log at Warning, Not Error

## Overview

Change `b5-error-log-severity` moves business rejections (`ValidationException`, `ApiException`) in `ErrorHandlerMiddleware` from `LogError(error, ...)` to `LogWarning("Request rejected: {Message}", error.Message)` — no exception object, no stack. Genuine faults (unknown types, `KeyNotFoundException`) keep Error with stack; the client-disconnect branch stays Debug. HTTP envelope/status/`ActionCode`/`Errors` are untouched. Proven by a NEW hermetic E2E test file that instantiates the real middleware directly (user-approved deviation from spec's WebAppFixture wording, design D1).

**Scope guard (verbatim, non-negotiable — carries into apply)**: ONLY `backend/src/SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs:60-62` may be edited in production (user-authorized). All tests are NEW files. Never modify, delete, rename, skip, weaken, or "fix" an existing E2E test (either suite, incl. support files) without explicit authorization.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~210 (1-line prod diff + ~200-line test file) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Log-level fix + hermetic proof suite | PR 1 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ErrorHandlerMiddlewareTests"` | N/A — hermetic in-process harness (real middleware + `DefaultHttpContext` + `MemoryStream`); no live server, no PostgreSQL | Revert `ErrorHandlerMiddleware.cs:60-62` only; test file stays (4 Warning cases flip — requires user approval) |

## Phase 1: RED — New Hermetic Test File (E2E, additive only)

- [x] 1.1 Create `backend/src/SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` (new `Middlewares/` dir); class NOT in `[Collection("e2e")]`; add nested private `RecordingLogger<T>` implementing `ILogger<T>` capturing `(LogLevel, Exception?, Message)` (thread-safe list, `IsEnabled` true). Evidence: file compiles in E2E csproj (no Moq — not referenced).
- [x] 1.2 Add static `Run(Exception)` harness: `new ErrorHandlerMiddleware(_ => throw thrown, logger)`, `DefaultHttpContext` with `MemoryStream` response body, `await middleware.Invoke(context)`, return `(Status, Body, Logs)`. Evidence: helper in test file.
- [x] 1.3 R1 ValidationException case: `new ValidationException("Validation failed") { Errors = { new Error("Name", "Name is required") } }` → expect 1× Warning with null exception, message starts "Request rejected:", 400, actionCode 400, `errors[0]` = `("Name","Name is required")` — pins Validation-before-ApiException switch order. Deserialize via `ApiResponse<object>` + `ApiResponse.Json`.
- [x] 1.4 R2 ApiException 400 case: `new ApiException("Invalid operation", HttpStatusCode.BadRequest) { AcctionCode = "App.InvalidOperation" }` → expect 1× Warning, null exception, 400, actionCode 400, `errors[0].code` = "App.InvalidOperation".
- [x] 1.5 R3 ApiException 404 case: `new ApiException("User not found", HttpStatusCode.NotFound)` (AcctionCode null) → expect 1× Warning, null exception, 404, actionCode 404, `errors[0].code` = "App.Unexpected".
- [x] 1.6 R4 unknown case: `new InvalidOperationException("boom")` → expect 1× Error, exception present, 500, actionCode 500.
- [x] 1.7 R4 KeyNotFound case: `new KeyNotFoundException("missing")` → expect 1× Error, exception present, 404, actionCode 404.
- [x] 1.8 R5 client-disconnect case: `new BadHttpRequestException("Unexpected end of request content")` (RequestAborted NOT cancelled) → expect 1× Debug, exception PRESENT (branch logs with exception — assert level + empty response, NOT null arg), `Body.Length == 0`, status 200.
- [x] 1.9 Run focused filter `--filter "FullyQualifiedName~ErrorHandlerMiddlewareTests"` → expect EXACTLY the 3 Warning-expecting cases to fail (R1, R2, R3 — currently `LogError` at `:62`); Error (R4×2) and Debug (R5) cases pass, pinning current behavior. Evidence: test run output.

> TDD note: design's TDD note says "4 Warning cases" but the authoritative 6-case table lists 3 Warning cases (R1–R3) — the RED run will show exactly 3 failures, which is correct. Do NOT add a fake or stub middleware — RED must run against the real `ErrorHandlerMiddleware`.

## Phase 2: Production Edit (single file, user-authorized)

- [x] 2.1 Edit `backend/src/SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs` generic catch ONLY (`:60-62`): `if (error is ValidationException or ApiException) _logger.LogWarning("Request rejected: {Message}", error.Message); else _logger.LogError(error, "Unhandled exception: {Message}", error.Message);` — exact shape from design; response-shaping switch (`:64-94`) unchanged.
- [x] 2.2 Verify no other production file touched: client-disconnect catch (`:39-59`), `Program.cs`, other middleware untouched. Evidence: `git diff --stat` shows 1 production file.

## Phase 3: GREEN — Prove the Contract

- [x] 3.1 Rerun focused filter `--filter "FullyQualifiedName~ErrorHandlerMiddlewareTests"` → 6/6 pass (R1–R3 Warning green; R4×2 Error + R5 Debug unchanged). Evidence: test run output.
- [x] 3.2 Envelope stability check: every case asserts status + `actionCode` + `errors` via `JsonSerializer.Deserialize<ApiResponse<object>>(body, ApiResponse.Json)` — contract identical to pre-change. Evidence: same focused run.

## Phase 4: Verification — Regression + Purity

- [x] 4.1 Build: `dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (no errors; no PG needed for this file).
- [x] 4.2 Regression: no existing E2E test modified — `git diff` on `backend/src/SMCA.WebApi.E2ETests/` shows ONLY the new `Middlewares/ErrorHandlerMiddlewareTests.cs`. Full suite `dotnet test backend/src/SMCA.sln` runs only if PostgreSQL `smca_test` is available (not required for hermetic file).
- [x] 4.3 Purity: `git status --porcelain` → exactly new test file + `ErrorHandlerMiddleware.cs` modified + openspec artifacts; pre-existing untracked `frontend-react/openspec/changes/offline-roster-login-actions/` is unrelated and untouched.

## Dependencies

- 1.x (RED) → 2.x (edit) → 3.x (GREEN) → 4.x (verify). No packages, no migrations, no config.
- Every RED case must target the REAL middleware — direct instantiation per design D1/D5, no Moq, no WebAppFixture.
