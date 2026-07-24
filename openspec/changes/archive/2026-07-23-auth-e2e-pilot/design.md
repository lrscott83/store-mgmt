# Design: Auth E2E Pilot — Architecture & Harness Design

**Status:** Draft
**Source planning docs:**
- [`docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md`](../../docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md)
- [`docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md`](../../docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md)

---

## Architecture Overview

The architecture is an **in-process integration test harness** built around `WebApplicationFactory<Program>`. The production API boots entirely in-process, with only the database connection overridden to point to a dedicated test database (`smca_test`). No Docker, no Testcontainers, no fake auth handlers — every middleware, filter, and pipeline component runs for real.

```
┌─────────────────────────────────────────────────────┐
│  dotnet test                                        │
│  ┌─────────────────────────────────────────────────┐│
│  │  SMCA.WebApi.E2ETests                           ││
│  │  ┌────────────────┐  ┌──────────────────────┐   ││
│  │  │ AuthPingTests  │  │ AuthLoginTests        │   ││
│  │  │ AuthMeTests    │  │ AuthRegisterTests     │   ││
│  │  └───────┬────────┘  └──────────┬───────────┘   ││
│  │          └──────────┬───────────┘                ││
│  │                     ▼                            ││
│  │          ┌─────────────────────┐                 ││
│  │          │ WebAppFixture       │                 ││
│  │          │ (CollectionFixture) │                 ││
│  │          │ - owns AppTestFactory                 ││
│  │          │ - applies migrations                  ││
│  │          └──────────┬──────────┘                 ││
│  │                     ▼                            ││
│  │          ┌─────────────────────┐                 ││
│  │          │ AppTestFactory      │                 ││
│  │          │ : WebApplicationFactory<Program>      ││
│  │          │ - overrides conn string               ││
│  │          └──────────┬──────────┘                 ││
│  └─────────────────────┼───────────────────────────┘│
│                        ▼                            │
│  ┌─────────────────────────────────────────────────┐│
│  │  SMCA.WebApi (in-process host)                  ││
│  │  - Real middleware pipeline                     ││
│  │  - Real JWT auth                                ││
│  │  - Real EF Core + Postgres                      ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Postgres        │
              │  Database:       │
              │  smca_test       │
              └──────────────────┘
```

## File Structure

```
backend/src/
├── SMCA.WebApi.E2ETests/
│   ├── SMCA.WebApi.E2ETests.csproj
│   ├── appsettings.Tests.json
│   ├── Infrastructure/
│   │   ├── AppTestFactory.cs
│   │   ├── WebAppFixture.cs
│   │   └── ApiResponse.cs
│   └── Auth/
│       ├── AuthPingTests.cs
│       ├── AuthLoginTests.cs
│       ├── AuthRegisterTests.cs
│       └── AuthMeTests.cs
├── SMCA.WebApi/
│   └── Program.cs              (modify: add partial class)
└── SMCA.sln                     (modify: add test project)
```

## Harness Components

### AppTestFactory
- Extends `WebApplicationFactory<Program>`.
- Sets environment to `"Testing"`.
- Loads `appsettings.Tests.json` last via `ConfigureAppConfiguration` so `ConnectionStrings:Application` overrides the default.

### WebAppFixture
- Implements `IAsyncLifetime` (xUnit).
- Owns a singleton `AppTestFactory`.
- On initialization creates a DI scope, resolves `ApplicationDbContext`, and calls `Database.MigrateAsync()` to apply EF migrations to `smca_test`.
- Disposes the factory on teardown.
- Paired with `[CollectionDefinition("e2e")]` for sharing across test classes.

### ApiResponse DTOs (Test-side)
- `ApiResponse<T>`: mirrors `ResponseResult<T>` shape — `Succeeded`, `Data`, `Errors`, `ActionCode`, `Message`.
- `ApiError`: `Code` + `Description`.
- Static `ApiResponse.Json`: pre-configured `JsonSerializerOptions` with `PropertyNameCaseInsensitive = true`.

## Data Isolation Strategy

1. **Dedicated database** `smca_test` — never touches the dev/prod `smca` database.
2. **Schema applied on factory init** via `Database.MigrateAsync()`.
3. **Unique random logins** per test (e.g. `me-{guid}@test.com`) — no cross-test cleanup needed for this pilot.
4. **Future:** If resource tests mutate shared rows, add between-test reset (truncate or transaction-per-test with rollback).

## JWT-in-Test Approach

- Protected endpoints (`/me`) are exercised with a **real JWT minted in-test** using the app's own `IJwtProvider` resolved from `factory.Services`.
- The same production signing key (`JwtOptions`) is used — no fake auth handler, so the real authorization pipeline (middleware, policy enforcement) is fully exercised.
- `/auth/login` is still covered as an endpoint under test, separately from token setup.

Key claims:
- `ClaimTypes.NameIdentifier` = user `Guid` (the identity claim the API reads).
- `IJwtProvider.GenerateToken(Guid userId, string userLogin)` already sets this.

## Production Code Change

- **Minimal, non-behavioral:** Append `public partial class Program {}` to `SMCA.WebApi/Program.cs`.
- Required because `Program` uses top-level statements; `WebApplicationFactory<Program>` needs the class to be accessible.

## Global Constraints

| Constraint | Value |
|-----------|-------|
| Target framework | `net8.0` |
| Test DB | `smca_test` ONLY (never `smca` dev/prod) |
| Route base | `api/v1/auth` |
| Password hash for seeding | `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(raw)))` — matches `HashPasswordService` |
| JWT identity claim | `ClaimTypes.NameIdentifier` (user Guid) |
| Response format | `ResponseResult<T>` serialized camelCase |

## Open Items to Verify During Implementation

1. EF migrations apply cleanly to an empty `smca_test` (8 migrations exist under `Infrastructure/Migrations/`).
2. `GetMeQueryHandler` tolerates a `User` with no roles/selected store.
3. Exact "controlled error" contract the API returns for bad credentials / duplicates.
