# Design: Business Rejections Log at Warning (b5-error-log-severity)

## Technical Approach

One production-line change inside the generic catch of `ErrorHandlerMiddleware` (`:60-62`): business rejections (`ValidationException`, `ApiException`) log at **Warning with message only**; all other types keep `LogError(error, ...)`. The HTTP response contract (status, `ResponseResult<T>` envelope, `ActionCode`, `Errors`) is untouched.

Proven by a NEW E2E test file that **instantiates the real middleware directly** with a hand-rolled recording `ILogger<T>` and a throwing `RequestDelegate`. This exercises the real catch/switch/serializer/`HttpResponse` code with full determinism — including the client-disconnect branch, which cannot be triggered reliably through a live TestServer request. Envelope assertions reuse the existing `ApiResponse<T>` deserialization helper. No WebAppFactory, no PostgreSQL, no Moq, no new packages.

Spec note (flagged for verify): spec.md says "drive the real pipeline via WebAppFixture". The contract proven — real middleware class, real log calls, real serializer, real `HttpResponse` — is identical; only the driver differs (see D1). `WebAppFixture` additionally requires a live PostgreSQL `smca_test`; direct invocation makes these tests hermetic.

## Architecture Decisions

| # | Decision | Options considered | Rationale |
|---|----------|--------------------|-----------|
| D1 | Drive middleware via **direct instantiation** (`new ErrorHandlerMiddleware(throwNext, logger)` + `Invoke(context)`) | (B) WebAppFactory + test-only throwing controller via `AddApplicationPart` | Verified surface: public ctor `(RequestDelegate, ILogger<ErrorHandlerMiddleware>)`, method `Invoke(HttpContext)`, no other deps. (B) needs a NEW factory + controller (scope: 1 test file), requires modifying shared `AppTestFactory` (existing harness file — not authorized), and **cannot deterministically produce the disconnect `BadHttpRequestException`**. A is deterministic for all 6 cases and DB-free. |
| D2 | **Nested private `RecordingLogger<T>`** in the test file | Moq (not referenced in E2E csproj — verified), shared `Infrastructure/` helper | One-file additive, zero footprint; captures `(LogLevel, Exception, formatted Message)`. |
| D3 | Reuse existing `Infrastructure/ApiResponse<T>` + `ApiResponse.Json` (case-insensitive) | New local envelope DTO | Already has `Succeeded/ActionCode/Errors(Code,Description)/Message`; camelCase body deserializes fine; no new file. |
| D4 | **Single `if`/`else` inside the existing generic catch** (`error is ValidationException or ApiException`) | Separate `catch` clauses; switch-case split | One catch preserves the envelope/shared setup flow; pattern-OR logs both types identically; response switch order (Validation before ApiException — subclass) stays as-is. |
| D5 | Test class **not** in `[Collection("e2e")]` | Join collection | No DB needed; hermetic and fast; avoids `WebAppFixture` startup + PG dependency. |

## Data Flow

    Test case ──throws─→ RequestDelegate ──> ErrorHandlerMiddleware.Invoke(context)
                          (throw ex)              │
                       recording ILogger ◄── LogWarning/LogError/LogDebug
                                                 │
                          context.Response.StatusCode + MemoryStream body
                                                 │
                   assertions: log entries + envelope JSON (ApiResponse<object>)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs` | Modify (`:60-62` ONLY, user-authorized) | Generic catch: business rejections → Warning without exception; others keep `LogError` |
| `backend/src/SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` | Create (new `Middlewares/` dir) | 6-case suite: `RecordingLogger<T>` + direct-invocation harness + envelope assertions |

No other file. No existing E2E test or support file touched.

## Interfaces / Contracts

**Production edit** (`ErrorHandlerMiddleware.cs:60-62` — exactly this shape):

```csharp
catch (Exception error)
{
    if (error is ValidationException or ApiException)
        _logger.LogWarning("Request rejected: {Message}", error.Message);   // no exception arg → no stack
    else
        _logger.LogError(error, "Unhandled exception: {Message}", error.Message);
    // response shaping switch (:64-94) unchanged — Validation before ApiException
```

**Recording logger** (nested private class in test file):

```csharp
private sealed class RecordingLogger<T> : ILogger<T>
{
    private readonly List<(LogLevel Level, Exception? Exception, string Message)> _entries = new();
    public IReadOnlyList<(LogLevel, Exception?, string)> Entries { get { lock (_entries) return _entries.ToList(); } }
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel logLevel) => true;
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
        Func<TState, Exception?, string> formatter)
    { lock (_entries) _entries.Add((logLevel, exception, formatter(state, exception))); }
}
```

**Invoke harness** (private static helper):

```csharp
private static async Task<(int Status, string Body, RecordingLogger<ErrorHandlerMiddleware> Logs)> Run(Exception thrown)
{
    var logger = new RecordingLogger<ErrorHandlerMiddleware>();
    var middleware = new ErrorHandlerMiddleware(_ => throw thrown, logger);
    var context = new DefaultHttpContext { Response = { Body = new MemoryStream() } };
    await middleware.Invoke(context);                       // public async Task Invoke(HttpContext) — verified
    context.Response.Body.Position = 0;
    var body = await new StreamReader(context.Response.Body).ReadToEndAsync();
    return (context.Response.StatusCode, body, logger);
}
```

## Testing Strategy

| Case | Exception construction (verified ctors) | Assert log | Assert HTTP |
|------|------------------------------------------|------------|-------------|
| R1 Validation | `new ValidationException("Validation failed") { Errors = { new Error("Name", "Name is required") } }` | 1× Warning, `Exception is null`, message `"Request rejected: ..."` | 400, `actionCode` 400, `errors[0]` = `("Name","Name is required")` — **pins Validation-before-ApiException switch order** |
| R2 ApiException 400 | `new ApiException("Invalid operation", HttpStatusCode.BadRequest) { AcctionCode = "App.InvalidOperation" }` | 1× Warning, `Exception is null` | 400, `actionCode` 400, `errors[0].code` = `"App.InvalidOperation"` |
| R3 ApiException 404 | `new ApiException("User not found", HttpStatusCode.NotFound)` (AcctionCode null) | 1× Warning, `Exception is null` | 404, `actionCode` 404, `errors[0].code` = `"App.Unexpected"` |
| R4 unknown | `new InvalidOperationException("boom")` | 1× Error, `Exception is not null` | 500, `actionCode` 500 |
| R4 KeyNotFound | `new KeyNotFoundException("missing")` | 1× Error, `Exception is not null` | 404, `actionCode` 404 |
| R5 disconnect | `new BadHttpRequestException("Unexpected end of request content")` (RequestAborted not cancelled) | 1× Debug, `Exception is not null` (branch logs WITH exception — assert level + no response, NOT null arg) | `Body.Length == 0`, StatusCode 200 (no response written) |

Envelope deserialization: `JsonSerializer.Deserialize<ApiResponse<object>>(body, ApiResponse.Json)`.

**TDD note (strict_tdd)**: run the new file RED first against current code — the 4 Warning cases fail (currently `LogError`); Error/Debug cases already pass (pin current behavior). Then apply the production edit.

## Threat Matrix

No routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is touched — test-only change plus one logging statement.

| Row | Applicable | Reason |
|-----|-----------|--------|
| Routing / endpoint exposure | N/A | No route, controller, or map changes; `Program.cs:162` untouched |
| Shell commands / subprocesses | N/A | None invoked by this change |
| VCS / PR automation | N/A | None |
| Executable-file classification | N/A | None |
| Process integration | N/A | Log call only; no process boundary |

Production-edit risk is a logging-statement swap, covered in Risks.

## Migration / Rollout

No migration, no config, no feature flag. **Focused run**:

```
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ErrorHandlerMiddlewareTests"
```

Full suite after: `dotnet test backend/src/SMCA.sln`. **Rollback**: revert the single-file diff (`:62` → `LogError` again); tests stay green except the Warning cases (flip requires user approval per scope rule).

## Open Questions

- [x] None blocking. Spec's "WebAppFixture" wording deviates from the chosen driver (D1) — contract preserved; verify phase must accept the deviation or a spec revision needs user approval (separate change).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Warning hides a genuine fault | Low | Unknown/KeyNotFound stay Error; Warning visible to ops |
| Envelope regression | Low | Every case asserts status + `actionCode` + `errors` |
| Verify rejects WebAppFixture deviation | Low | Documented in D1 + spec note; single-file proof of contract equivalence |
| `DefaultHttpContext` diverges from Kestrel | Low | Middleware uses only `Response.ContentType/StatusCode/Body` + serializer — no Kestrel-specific API |
