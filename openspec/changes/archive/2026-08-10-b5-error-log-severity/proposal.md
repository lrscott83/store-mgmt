# Proposal: Business Rejections Log at Warning, Not Error

## Intent

Business rejections (`ValidationException`, `ApiException` — 400/403/404/409) log at Error with the full exception object (`:62`), flooding ops logs with `[ERR] Unhandled exception: User not found` noise. Expected rejections: status + envelope already answer the client. Change: log them at Warning without the exception object; genuine faults keep Error with stack.

## Scope

### In Scope
- Edit `SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs` generic catch `:60-62` ONLY: `ValidationException` AND `ApiException` → `_logger.LogWarning("Request rejected: {Message}", error.Message)` (no exception arg → no stack). All other types keep `LogError(error, ...)` (KeyNotFound → ERR+404, unknown → ERR+500).
- NEW test file `SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` (new dir; no Moq → hand-rolled recording ILogger<T>).
- Cases: ValidationException → Warning + null exception arg + 400 envelope; ApiException 400 & 404 → Warning, no exception, correct status/ActionCode; unknown InvalidOperationException → Error + exception + 500; KeyNotFoundException → Error + 404 (pin current); client-disconnect BadHttpRequestException → Debug + no response.

### Out of Scope
- Client-disconnect branch `:39-59` — already Debug (commit 75b3264c), untouched.
- Live-connection malformed request stays 500+ERR (separate decision).
- Orphaned `WebApiTest/Middlewares/ErrorHandlerMiddleware.cs` (not in SMCA.sln) — future cleanup only.
- No other production file; no existing E2E test touched.

## Capabilities

### New Capabilities
- `error-handler-logging`: log-level contract — ValidationException/ApiException log Warning (message only, no stack); unknown faults and KeyNotFoundException log Error with exception; client disconnect logs Debug. Response envelope/status unchanged.

### Modified Capabilities
None.

## Approach

One-line change in the generic catch: business-rejection cases log `LogWarning("Request rejected: {Message}", error.Message)`. `ValidationException` extends `ApiException` (`Application/Exceptions/ValidationException.cs`), so the existing switch order (Validation first) is kept. Envelope/status/ActionCode/Errors untouched. Tests drive the real pipeline via WebAppFixture, asserting log entries and HTTP responses. Precedent: `AuthenticationService.cs` logs rejections at Warning.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs:60-62` | Modified | LogWarning for Validation/ApiException |
| `SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` | New | Recording-logger E2E suite |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Warning level hides a genuine fault | Low | Unknown/KeyNotFound stay Error; Warning stays visible to ops |
| Response-contract regression | Low | Tests assert envelope/status/ActionCode unchanged |

## Rollback Plan

Revert the single-file diff (restore `:62`); Error logging returns. Tests stay; flipping expectations requires user approval.

## Dependencies

None. No new packages (no Moq), no migrations, no config change.

## Success Criteria

- [ ] New E2E file green: 5 cases (Warning/Error/Debug levels + envelopes)
- [ ] No existing E2E test modified or failing
- [ ] Only `ErrorHandlerMiddleware.cs` changed in production
- [ ] `[ERR] Unhandled exception:` noise gone for business-rejection paths

## Delivery Forecast

1 production file (tiny diff) + 1 test file. Single PR; under 400-line budget; no chain.
