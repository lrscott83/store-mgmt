# Delta for b5-error-log-severity

Change: Business rejections log at Warning (message only); genuine faults keep Error with stack.

Scope note: `SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs` generic catch (`:60-62`) is the ONLY production file edited (user-authorized). All tests are NEW files; no existing E2E test is touched.

## ADDED Requirements

### Requirement: Business rejections log at Warning without stack

The system MUST log `ValidationException` and `ApiException` rejections at Warning level with the message only — no exception object, no stack trace — in `ErrorHandlerMiddleware`. This covers the 400/403/404/409 envelope paths. The HTTP response (status, `ResponseResult<T>` envelope, `ActionCode`, `Errors`) MUST remain unchanged. `ValidationException` MUST be matched before `ApiException` (subclass order preserved).

#### Scenario: ValidationException rejection

- GIVEN a request whose pipeline throws `ValidationException`
- WHEN the middleware generic catch handles it
- THEN one Warning entry is logged with `{Message}` and no exception argument
- AND the response is unchanged: status 400, ActionCode 400, validation `Errors` preserved

#### Scenario: ApiException 400 and 404 rejections

- GIVEN a request whose pipeline throws `ApiException` with status 400 or 404
- WHEN the middleware generic catch handles it
- THEN one Warning entry is logged with no exception argument
- AND response status and ActionCode equal the exception status, single-error `Errors` list preserved

### Requirement: Genuine faults keep Error with stack

The system MUST log unknown exception types and `KeyNotFoundException` at Error level WITH the exception object, preserving the 500 and 404 envelopes respectively.

#### Scenario: Unknown exception type

- GIVEN a request whose pipeline throws `InvalidOperationException`
- WHEN the middleware generic catch handles it
- THEN an Error entry is logged with the exception argument present
- AND the response is unchanged: status 500, ActionCode 500

#### Scenario: KeyNotFoundException

- GIVEN a request whose pipeline throws `KeyNotFoundException`
- WHEN the middleware generic catch handles it
- THEN an Error entry is logged with the exception argument present
- AND the response is unchanged: status 404, ActionCode 404

### Requirement: Client-disconnect branch stays at Debug

The system MUST keep the client-disconnect branch (`IsClientDisconnect` filter, catch `:39-59`) logging at Debug level with no HTTP response written; this change MUST NOT alter that branch.

#### Scenario: Client disconnect

- GIVEN a request aborted mid-body (`BadHttpRequestException` "Unexpected end of request content" or `RequestAborted`)
- WHEN the client-disconnect filter catches it
- THEN a Debug entry is logged and no HTTP response body is written

### Requirement: New E2E test file proves the contract

A NEW file `SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` (new `Middlewares` directory) MUST be added. It MUST instantiate the real `ErrorHandlerMiddleware` directly (`new ErrorHandlerMiddleware(throwingRequestDelegate, recordingLogger)` + `Invoke(context)`) and assert, for each case above: recorded log level, presence/absence of the exception argument, and unchanged HTTP envelope. Direct instantiation is chosen over WebAppFixture (D1, user-approved 2026-08-10): it exercises the real middleware catch/switch/serializer/HttpResponse, covers all six cases deterministically (including client-disconnect, which a live TestServer request cannot produce reliably), and needs no PostgreSQL/AppTestFactory. It MUST use a hand-rolled recording `ILogger<T>` (no Moq — not referenced in the E2E project). No existing test file MAY be modified.

#### Scenario: Test suite coverage

- GIVEN the new test file with one case per requirement, instantiating the real middleware directly with a throwing `RequestDelegate` and a recording `ILogger<T>`
- WHEN the E2E suite runs
- THEN all cases pass and no existing E2E test is modified
