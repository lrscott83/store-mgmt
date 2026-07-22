# E2E test plan — SMCA.WebApi `/auth` (vertical pilot)

Date: 2026-07-22
Status: Draft (pending user review)
Scope owner: backend / SMCA.WebApi

## Context

- Backend: .NET 8, Clean Architecture. Production API = `SMCA.WebApi` (in `SMCA.sln`).
- Persistence: EF Core 8 + Npgsql (Postgres). DbContext = `ApplicationDbContext`. Connection key `ConnectionStrings:Application` (`Program.cs:62`).
- Auth: JWT via `IJwtProvider` / `JwtOptions` (`Program.cs:67`). Controllers versioned under `api/v1/[controller]` (`BaseApiController.cs:11`).
- API style: MVC controllers → MediatR (`Sender.Send(...)`), responses wrapped in `ResponseResult<T>`.
- Existing tests: `Application.Tests`, `Domain.UnitTests` — all **unit** (xUnit + FluentAssertions + Moq + EF Core InMemory + coverlet). **No integration/e2e infrastructure exists** (`Microsoft.AspNetCore.Mvc.Testing` and Testcontainers are absent).

## Goal

Establish the e2e harness with the smallest viable slice: in-process tests exercising the **real SMCA.WebApi pipeline** (routing, JWT authorization, FluentValidation, MediatR, EF Core) against a **real Postgres**, driven by `dotnet test`. Prove the pattern on the `auth` resource, then replicate for other resources later.

## Non-goals (explicit)

- No CI wiring.
- No Docker / Testcontainers — the test DB is provided by configuration (see below).
- No other resources (stores, users, owners, resellers, features, usages).
- No performance testing.
- Legacy projects `WebApi` / `WebApiTest` (not in `SMCA.sln`) are ignored.

## Test project

`SMCA.WebApi.E2ETests` (net8.0), added to `SMCA.sln`, references `SMCA.WebApi`.

### Required NuGet packages (the only additions)

- `Microsoft.AspNetCore.Mvc.Testing` — `WebApplicationFactory`
- `xunit`, `Microsoft.NET.Test.Sdk`, `xunit.runner.visualstudio`
- `FluentAssertions`
- `coverlet.collector`

(No Testcontainers. No environment/tooling install steps — this is a test plan, not a setup guide.)

## Harness design

- `AppTestFactory : WebApplicationFactory<Program>` overrides `ConnectionStrings:Application` with the test connection (see Connection configuration) via `ConfigureWebHost` / `ConfigureAppConfiguration`, so the whole app talks to the test DB while keeping every other service real.
- Production code change (minimal, non-behavioral): append `public partial class Program {}` to `SMCA.WebApi/Program.cs`. `Program` uses top-level statements; `WebApplicationFactory<Program>` needs the class accessible.
- Auth helper (design decision: **JWT emitted in test**): resolve `IJwtProvider` from `factory.Services` and mint a valid JWT with the **same production signing key** for the authorized `/me` case — no fake auth handler, so the real authorization pipeline is exercised. `/auth/login` is still covered as an endpoint under test, separately from token setup.
- xUnit collection fixture so the factory/DB connection is shared across the auth test class.

## Connection configuration

The test DB is provided by configuration, defaulting to a dedicated database `smca_test` (never dev/prod). Loaded from `appsettings.Tests.json` in the test project, with optional override via environment variable `E2E_TEST_CONNECTION`.

Base DB today (`appsettings.json`): `Database=smca`, user/pass `postgres`. Test DB uses the `_test` suffix (`smca_test`) — underscore, not hyphen, because an unquoted Postgres identifier cannot contain `-`.

```json
// appsettings.Tests.json (in SMCA.WebApi.E2ETests)
{
  "ConnectionStrings": {
    "Application": "Host=127.0.0.1;Port=5432;Database=smca_test;Username=postgres;Password=postgres;Persist Security Info=True;Include Error Detail=True"
  }
}
```

## Data isolation strategy

Without an ephemeral container the DB persists across runs, so isolation is the suite's responsibility:

- Dedicated database `smca_test` only.
- Schema applied on factory init via EF migrations (`ApplicationDbContext.Database.MigrateAsync()`); fallback `EnsureCreatedAsync()` if migrations are not runnable clean (verify — see Open items).
- Reset touched tables between tests (truncate, or transaction-per-test with rollback) so tests do not contaminate each other.
- Seed the known auth user at the start of each test/class that needs it.

## Test cases — `auth`

Route base: `api/v1/auth`. Assertions with FluentAssertions on HTTP status + deserialized `ResponseResult<T>` + DB state where relevant.

### POST `api/v1/auth/login`
- Seeded valid credentials → 200 + `ResponseResult<AuthDto>` with a non-empty token.
- Wrong password → controlled error (documented status/body), not 500.
- Unknown user → controlled error.
- Empty / invalid body → 400 (FluentValidation).

### POST `api/v1/auth/register`
- Valid payload → 200 + `ResponseResult<AuthDto>` and the user is persisted in `smca_test`.
- Duplicate user → controlled error.
- Invalid body → 400.

### GET `api/v1/auth/me`
- Valid minted JWT → 200 + `ResponseResult<CurrentUserDto>` matching the seeded user.
- No token → 401.
- Invalid / expired token → 401.

### GET `api/v1/auth/ping`
- `AllowAnonymous` → 200 (smoke test that the harness + pipeline boot correctly).

## Production code change

- `SMCA.WebApi/Program.cs`: add `public partial class Program {}` (end of file). Non-behavioral; required for `WebApplicationFactory<Program>`.

## Risks

- No Docker/ephemeral DB ⇒ no automatic "clean, reproducible DB per run" guarantee; mitigated by a dedicated `smca_test` DB + disciplined between-test cleanup. Shared or parallel use of `smca_test` will cause flakiness — keep it single-user/local for this pilot.
- Postgres must be reachable at the configured connection when tests run.

## Open items to verify during implementation

- Confirm EF migrations exist and apply cleanly to an empty `smca_test` (otherwise use `EnsureCreated` or generate migrations).
- Confirm `LoginCommand` / `RegisterCommand` DTO shapes and `AuthDto` / `CurrentUserDto` fields for assertions.
- Confirm the exact "controlled error" contract (status + body) the API returns for bad credentials / duplicates, to assert against real behavior rather than an assumption.
