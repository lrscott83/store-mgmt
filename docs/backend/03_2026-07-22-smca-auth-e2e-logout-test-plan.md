# E2E test plan — SMCA.WebApi `/auth`: logout + validation (03)

> Scope note: this plan (the `03` pair) covers the `/auth/logout` suite **and** the full
> validation-error suite for the auth endpoints that have validators (`login`, `register`).
> `me`/`ping`/`logout` have no validators. Implementation lives in
> `03_...-logout-validation-implementation-plan.md`.

Date: 2026-07-22
Status: Draft (pending user review)
Scope owner: backend / SMCA.WebApi
Depends on: `01_2026-07-22-smca-auth-e2e-test-plan.md` (harness) + its implementation plan.

## Context

The `auth` controller exposes five endpoints. Plans `01` and `02` cover four of them
(`login`, `register`, `me`, `ping`). **`logout` has no e2e suite anywhere** — this plan
defines it and only it. No scenario from `01`/`02` is repeated. The harness
(`WebApplicationFactory<Program>` + config-provided `smca_test` Postgres + JWT minted in-test)
is reused as-is from `01`.

## Goal

Cover `GET api/v1/auth/logout` end-to-end against the real SMCA.WebApi pipeline (routing →
anonymous-tolerant JWT auth → MediatR → `IUserRepository` on `smca_test` → `SignOutAsync`),
asserting all three handler branches, and pin the non-obvious `200`-not-`404` contract so a
regression is caught.

## Non-goals

- No new test project, no new NuGet packages — extend `01`'s `SMCA.WebApi.E2ETests`.
- No Docker, no CI.
- No re-testing `login` / `register` / `me` / `ping` (covered by `01`/`02`).
- No token-revocation behavior — the current JWT scheme is stateless (see Risks).
- No `400 invalid body` case: `LogoutQuery` is an empty `record`, nothing to validate.

## Endpoint under test

`GET api/v1/auth/logout` — `AuthController.Logout([FromQuery] LogoutQuery query)`.

- `[AllowAnonymous]` (no token required to reach the handler).
- `LogoutQuery` is an **empty** `record` → no validation.
- Returns `ResponseResult<bool>` wrapped by the controller in `Ok(...)`.

### What it does (verified against `LogoutQuery.cs`)

`LogoutQueryHandler.Handle` has exactly three branches:

- **A — no principal:** `HttpContextService.UserExternalId` is null/empty → `ResponseResult.Success(true)` (short-circuit, no DB hit).
- **B — user found:** parse `UserExternalId` → Guid, load the `User` with `IgnoreQueryFilters()`; if found → `SignOutAsync()` → `Success(true)`.
- **C — user missing:** token carries a valid `UserExternalId` but no matching `User` row → `ResponseResult.Failure<bool>(UserErrors.NotFound, 404)`.

### External dependencies / mocking list

- **`IHttpContextService`** — real (supplies `UserExternalId` from the JWT principal; `SignOutAsync`). Not mocked; exercised through the real pipeline.
- **`IUserRepository` / `ApplicationDbContext`** — real, against `smca_test` Postgres (branches B/C read `User`).
- **`IJwtProvider`** — real; used **in the test** to mint tokens (same production signing key), per the `01` harness decision. Nothing is mocked.

## Critical contract fact (pin this, do not assume)

The controller always returns `Ok(...)` (HTTP 200). `ErrorHandlerMiddleware` maps an HTTP
status **only for thrown exceptions**. Branch C returns a *controlled* `Failure(..., 404)`
— it is not thrown — so the client sees **HTTP 200** with the failure encoded in the body
(`succeeded=false`, `actionCode=404`, `errors=[{ code:"User.NotFound" }]`), **not HTTP 404**.
Asserting `StatusCode == 404` would fail against real behavior.

## Harness reuse (no new project, no new packages)

Reuse `01`'s `SMCA.WebApi.E2ETests`: `AppTestFactory`, `WebAppFixture` (collection `"e2e"`),
`ApiResponse<T>` / `ApiResponse.Json`, and the `DbTestHelpers` (seed super-admin / lookup /
cleanup) introduced by `02`. Token minting resolves `IJwtProvider` from `factory.Services`
exactly as `01` does for `/me`.

Suggested new file: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLogoutTests.cs` (one class,
the cases below as `[Fact]`s). Every write-heavy case cleans up its seed in a `finally`.

## Test cases — `logout`

Route: `GET api/v1/auth/logout`. Assert on HTTP status + deserialized
`ResponseResult<bool>` envelope (`{ succeeded, data, errors:[{code,description}], actionCode }`).

### Happy path

1. **Anonymous logout (no `Authorization` header)** — branch A.
   `GET /api/v1/auth/logout` with no token → **HTTP 200**, `succeeded=true`, `data=true`.
   No DB row touched (smoke that the anonymous short-circuit works).

2. **Authenticated logout with a valid minted JWT for a seeded user** — branch B.
   Seed a super-admin (`DbTestHelpers.SeedSuperAdminAsync`), mint a JWT for that user id via
   `IJwtProvider`, send `Authorization: Bearer <token>` →
   **HTTP 200**, `succeeded=true`, `data=true`. Cleanup: `CleanupUserAsync`.

### Edge cases

3. **Malformed / garbage Bearer token** — branch A (non-obvious).
   `Authorization: Bearer not-a-real-jwt`. Because the endpoint is `[AllowAnonymous]`, a bad
   token does **not** yield 401 (contrast with `/me`, which 401s in `01`). The principal is
   simply unauthenticated → `UserExternalId` empty → **HTTP 200**, `succeeded=true`, `data=true`.
   Pins the deliberate asymmetry between `logout` and `me`.

4. **Expired token** — branch A (same asymmetry).
   Mint a token with an already-past expiry → treated as unauthenticated under `AllowAnonymous`
   → **HTTP 200**, `succeeded=true`, `data=true`. (Optional if token minting cannot backdate
   expiry easily; case 3 already proves the asymmetry.)

### Error handling

5. **Valid JWT whose user does not exist** — branch C (THE contract pin).
   Mint a structurally valid JWT for a **random Guid** with no `User` row → the handler returns
   the controlled `Failure(UserErrors.NotFound, 404)`.
   Assert: **HTTP 200** (controller `Ok`), `succeeded=false`, `actionCode=404`, and an error with
   `code == "User.NotFound"`. **Do NOT assert HTTP 404** — see "Critical contract fact".

### Integration

6. **Real pipeline exercised end-to-end** — routing → JWT auth (anonymous-tolerant) → MediatR →
   `IUserRepository` (`smca_test`) → `IHttpContextService.SignOutAsync`.
   The e2e value here is the **branch/status contract** (cases 1–5) plus proving the seeded user
   is reachable through the real repository in branch B. Server-side session assertion is not
   applicable (stateless JWT — see Risks).

## Validation error cases — `login` + `register`

Every FluentValidation failure throws `ValidationException` → **HTTP 400**, `errors[].code` = the
**property name**. `me`/`ping`/`logout` have no validators (nothing to cover).

### POST `api/v1/auth/login` — `LoginCommandValidator`

| Rule | Case | code |
|---|---|---|
| `Login` required | `Login=""` | `Login` |
| `Password` required | `Password=""` | `Password` |
| `Password` MinimumLength(8) | `Password="abc"` | `Password` |

### POST `api/v1/auth/register` — `RegisterCommandValidator`

| Rule | Case | code |
|---|---|---|
| `Login` required | `Login=""` | `Login` |
| `Login` unique (IsUniqueName) | duplicate | **not here** — bypassed by query-filter bug; pinned as the register-duplicate 500 in `02` |
| `Password` required | `Password=""` | `Password` |
| `Password` MinimumLength(8) | `Password="Ab1"` | `Password` |
| `Password` uppercase | `Password="password123"` | `Password` |
| `FullName` required | `FullName=""` | `FullName` |
| `CellPhone` required | `CellPhone=""` | `CellPhone` |
| `Email` format (When non-empty) | `Email="not-an-email"` | `Email` |
| `StoreName` required | `StoreName=""` | `StoreName` |

## Data isolation

- Cases 1, 3, 4, 5 create **no** rows → no cleanup.
- Case 2 seeds one `User` + one `UserRole`; delete both in a `finally` via
  `DbTestHelpers.CleanupUserAsync`. Use a unique random `Login` per run.

## Risks

- **Stateless JWT scheme:** `SignOutAsync` has no server-side session/cookie to clear, so there is
  no post-logout server state to assert (case 6 is limited to the branch/status contract). If
  token revocation is added later (denylist / refresh-token rotation), extend case 6 to assert the
  token no longer authenticates a subsequent `/me` call.
- **Shared `smca_test` DB (inherited from `01`):** no ephemeral/per-run DB; parallel or shared use
  causes flakiness. Keep the suite single-user/local; case 2 cleans its seed in a `finally`.
- **Contract gotcha:** branch C surfaces as HTTP 200 with `actionCode=404`, not HTTP 404 (see
  "Critical contract fact"). Asserting the wrong layer produces a red test against correct behavior.

## Open items to verify during implementation

- Confirm the JWT claim that `IHttpContextService.UserExternalId` reads (sub / nameidentifier),
  so the minted token in cases 2 and 5 populates it correctly.
- Confirm `IJwtProvider` can mint a token for an arbitrary user id/login without a persisted user
  (needed for case 5); if it requires a real user, seed-then-delete before the call.
- Confirm the response envelope casing after camelCase serialization (`succeeded`, `data`,
  `actionCode`, `errors[].code`).
