# Proposal: Auth E2E Pilot — SMCA.WebApi `/auth`

**Status:** Draft
**Scope:** backend / SMCA.WebApi
**Source planning docs:**
- [`docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md`](../../docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md)
- [`docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md`](../../docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md)

---

## Context

- **Backend:** .NET 8, Clean Architecture. Production API = `SMCA.WebApi` (in `SMCA.sln`).
- **Persistence:** EF Core 8 + Npgsql (Postgres). DbContext = `ApplicationDbContext`. Connection key `ConnectionStrings:Application`.
- **Auth:** JWT via `IJwtProvider` / `JwtOptions`. Controllers versioned under `api/v1/[controller]`.
- **API style:** MVC controllers → MediatR (`Sender.Send(...)`), responses wrapped in `ResponseResult<T>`.
- **Existing tests:** `Application.Tests`, `Domain.UnitTests` — all unit (xUnit + FluentAssertions + Moq + EF Core InMemory + coverlet). **No integration/e2e infrastructure exists** (`Microsoft.AspNetCore.Mvc.Testing` and Testcontainers are absent).

## Goal

Establish the e2e harness with the smallest viable slice: in-process tests exercising the **real SMCA.WebApi pipeline** (routing, JWT authorization, FluentValidation, MediatR, EF Core) against a **real Postgres**, driven by `dotnet test`. Prove the pattern on the `auth` resource, then replicate for other resources later.

## Scope

1. **New test project:** `SMCA.WebApi.E2ETests` (net8.0) added to `SMCA.sln`.
2. **Harness infrastructure:**
   - `AppTestFactory : WebApplicationFactory<Program>` overrides connection string to test DB.
   - `WebAppFixture` (xUnit collection fixture) owns factory + applies EF migrations.
   - `ApiResponse<T>` DTOs for parsing `ResponseResult<T>` responses.
3. **Production code change (minimal, non-behavioral):** Append `public partial class Program {}` to `SMCA.WebApi/Program.cs`.
4. **Test coverage for 4 auth endpoints:**
   - `GET /api/v1/auth/ping` — harness smoke test (AllowAnonymous).
   - `POST /api/v1/auth/login` — contract tests (validation, unknown user, wrong password).
   - `POST /api/v1/auth/register` — validation test (empty body → 400).
   - `GET /api/v1/auth/me` — authorization tests (no token, valid minted JWT).

## Non-goals

- No CI wiring.
- No Docker / Testcontainers — the test DB is provided by configuration.
- No other resources (stores, users, owners, resellers, features, usages).
- No performance testing.
- Legacy projects `WebApi` / `WebApiTest` (not in `SMCA.sln`) are ignored.
- Full happy-path login/register (requires heavy domain seeding) — deferred to follow-up.

## Risks

1. **No ephemeral DB** ⇒ no automatic "clean, reproducible DB per run" guarantee. Mitigated by a dedicated `smca_test` DB + disciplined between-test cleanup. Shared or parallel use of `smca_test` will cause flakiness — keep it single-user/local for this pilot.
2. **Postgres must be reachable** at the configured connection when tests run.
3. **`GetMeQueryHandler` may require more than a bare `User` row** (e.g. roles, selected store). If so, extend the seed or flag for follow-up.
