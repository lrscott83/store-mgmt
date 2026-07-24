# Spec: Auth E2E Pilot — Test Cases & Acceptance Criteria

**Status:** Draft
**Source planning docs:**
- [`docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md`](../../docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md)
- [`docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md`](../../docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md)

---

## Route Base

All endpoints under `api/v1/auth` (per `BaseApiController.cs:11` → `[Route("api/v1/[controller]")]`).

## Response Contract

`ResponseResult<T>` serializes (camelCase) as:

```json
{
  "succeeded": true,
  "data": { ... },
  "errors": [{ "code": "string", "description": "string" }],
  "actionCode": 0,
  "message": "string or null"
}
```

- On success: `succeeded: true`, `actionCode: null`.
- On failure: `succeeded: false`, `errors` populated.

## Harness Requirements

### Test Project
- `SMCA.WebApi.E2ETests` (net8.0), added to `SMCA.sln`.
- References `SMCA.WebApi` (production API).

### Required NuGet Packages
- `Microsoft.AspNetCore.Mvc.Testing` — `WebApplicationFactory`
- `xunit`, `Microsoft.NET.Test.Sdk`, `xunit.runner.visualstudio`
- `FluentAssertions`
- `coverlet.collector`

### WebApplicationFactory
- `AppTestFactory : WebApplicationFactory<Program>` overrides `ConnectionStrings:Application` with the test connection via `ConfigureWebHost` / `ConfigureAppConfiguration`.

### Partial Program
- Append `public partial class Program {}` to `SMCA.WebApi/Program.cs` so `WebApplicationFactory<Program>` can reference it.

### xUnit Collection Fixture
- `WebAppFixture : IAsyncLifetime` owns the factory and applies EF migrations on init.
- Collection name `"e2e"` shared across all auth test classes.

### JWT in Test
- Resolve `IJwtProvider` from `factory.Services` and mint a valid JWT with the **production signing key** for authorized test scenarios.
- No fake auth handler — the real authorization pipeline is exercised.

### Connection Configuration
- Test DB: dedicated `smca_test` (never dev/prod).
- Loaded from `appsettings.Tests.json` in the test project.
- Optional override via environment variable `E2E_TEST_CONNECTION`.

```json
{
  "ConnectionStrings": {
    "Application": "Host=127.0.0.1;Port=5432;Database=smca_test;Username=postgres;Password=postgres;Persist Security Info=True;Include Error Detail=True"
  }
}
```

### Data Isolation Strategy
- Dedicated database `smca_test` only.
- Schema applied on factory init via EF migrations (`ApplicationDbContext.Database.MigrateAsync()`).
- Tests use unique random logins (e.g. `me-{guid}@test.com`) so no cross-test cleanup is required for this pilot.
- Future resource tests that mutate shared rows should add between-test reset (truncate or transaction-per-test).

### Response DTOs (test-side)
- `ApiResponse<T>` fields: `Succeeded`, `Data`, `Errors` (list of `ApiError`), `ActionCode`, `Message`.
- `ApiError` fields: `Code`, `Description`.
- `ApiResponse.Json`: `JsonSerializerOptions` with `PropertyNameCaseInsensitive = true`.

---

## Test Cases — Auth Endpoints

### TC-01: GET `api/v1/auth/ping` (Harness Smoke Test)

| ID | Scenario | Assertion |
|----|----------|-----------|
| TC-01a | `AllowAnonymous` ping | HTTP 200, response body is `"true"` |

### TC-02: POST `api/v1/auth/login`

| ID | Scenario | Assertion |
|----|----------|-----------|
| TC-02a | Empty credentials (Login="" + Password="") | HTTP 400, `succeeded: false`, `errors` not empty (FluentValidation) |
| TC-02b | Unknown user (random login, valid password format) | HTTP 200, `succeeded: false`, `actionCode: 400` (controller wraps failure in `Ok()`) |
| TC-02c | Wrong password for known user | Controlled error (documented status/body), not 500 |
| TC-02d | Valid credentials (known user) | HTTP 200, `succeeded: true`, `data` is `AuthDto` with non-empty token **(deferred — full happy-path requires domain seeding)** |

### TC-03: POST `api/v1/auth/register`

| ID | Scenario | Assertion |
|----|----------|-----------|
| TC-03a | Empty/invalid body (all fields empty/null) | HTTP 400, `succeeded: false`, `errors` not empty |
| TC-03b | Duplicate user | Controlled error |
| TC-03c | Valid payload | HTTP 200, `succeeded: true`, user persisted in `smca_test` **(deferred — full happy-path requires domain seeding)** |

### TC-04: GET `api/v1/auth/me`

| ID | Scenario | Assertion |
|----|----------|-----------|
| TC-04a | Valid minted JWT (seeded active user) | HTTP 200, `succeeded: true`, `data.Id` matches seeded user ID, `data.Login` matches seeded login |

---

## Open Items

1. Confirm EF migrations exist and apply cleanly to an empty `smca_test` (8 migrations exist under `Infrastructure/Migrations/`).
2. Confirm `LoginCommand` / `RegisterCommand` DTO shapes and `AuthDto` / `CurrentUserDto` fields for assertions.
3. Confirm the exact "controlled error" contract (status + body) the API returns for bad credentials / duplicates.
4. Confirm `GetMeQueryHandler` tolerates a `User` with no roles/selected store (Task 4 risk).
