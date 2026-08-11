# error-handler-logging Specification

## Purpose

Defines the log-level contract for `SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs`: expected business rejections log at Warning with message only; genuine faults log at Error with the exception object; client disconnects log at Debug. Logging behavior MUST never alter the HTTP response contract.

## Requirements

### Requirement: Business rejections log at Warning without exception

The system MUST log `ValidationException` and `ApiException` (400/403/404/409 envelopes) at Warning level passing only the message — no exception object, no stack trace. The HTTP response (status, `ActionCode`, `Errors`) MUST be identical to pre-change behavior.

#### Scenario: Validation rejection is Warning, message only

- GIVEN the pipeline throws `ValidationException`
- WHEN the middleware generic catch handles it
- THEN one Warning entry is logged with `{Message}` and a null exception argument
- AND the 400 envelope with validation `Errors` is returned unchanged

#### Scenario: ApiException rejection is Warning, message only

- GIVEN the pipeline throws `ApiException` with status 400 or 404
- WHEN the middleware generic catch handles it
- THEN one Warning entry is logged with a null exception argument
- AND response status/ActionCode match the exception status with `Errors` intact

### Requirement: Genuine faults log at Error with exception

The system MUST log unknown exception types and `KeyNotFoundException` at Error level WITH the exception object (stack trace); responses remain 500 and 404 respectively.

#### Scenario: Unknown fault keeps Error and 500

- GIVEN the pipeline throws `InvalidOperationException`
- WHEN the middleware generic catch handles it
- THEN an Error entry is logged with the exception argument present
- AND the 500 envelope is unchanged

#### Scenario: KeyNotFound keeps Error and 404

- GIVEN the pipeline throws `KeyNotFoundException`
- WHEN the middleware generic catch handles it
- THEN an Error entry is logged with the exception argument present
- AND the 404 envelope is unchanged

### Requirement: Client disconnect logs at Debug

The system MUST log client-disconnect events (`BadHttpRequestException` "Unexpected end of request content" or aborted request) at Debug level and MUST NOT write an HTTP response for them.

#### Scenario: Client disconnect is Debug, no response

- GIVEN a request aborted mid-body
- WHEN the client-disconnect filter catches it
- THEN a Debug entry is logged and no response body is written

### Requirement: Logging never alters the response contract

The system MUST NOT change the HTTP envelope, status code, `ActionCode`, or `Errors` as a consequence of log-level behavior.

#### Scenario: Envelope stability across all levels

- GIVEN each rejection/fault type
- WHEN the middleware handles it
- THEN the serialized response matches the pre-change contract exactly
