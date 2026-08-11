# Tasks: E2E B-6 — Inactive Account /me 404 + Activate Tenant Isolation

## Overview

ADD-ONLY coverage delta: ONE new E2E file `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs`, EXACTLY TWO tests. No production code, no existing test touched. Capability deltas already merged — reference `openspec/specs/users-e2e/spec.md` (R5 Activate +2 rows) and `openspec/specs/authorization-e2e/spec.md` (R1.7 + Delivery note); do not re-derive. Scope rule carried verbatim from spec.md (E2E tests are untouchable; add-only).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200–240 (1 new file) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Single new E2E file with both tests | PR 1 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthMeDeactivation"` | Real PostgreSQL `localhost:5432`, db `smca_test` (WebAppFixture applies migrations) | Delete `Auth/AuthMeDeactivationTests.cs` — no other file touched |

## Phase 1: Scaffold

- [x] 1.1 Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` — `namespace SMCA.WebApi.E2ETests.Auth`, `[Collection("e2e")]`, `WebAppFixture` ctor exposing `AppTestFactory _f` (per `UsersActivateTests.cs:16-17`), usings per `AuthMeFailureTests.cs:1-6`. — Acceptance: file compiles with 2 `[Fact]` stubs; no other file changed. — Evidence: `dotnet build backend/src/SMCA.sln`.

## Phase 2: T1 — Same-tenant deactivate → 200 → real-login /me → 404 AccountInactive

- [x] 2.1 `T1_...` : seed `AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true)` (:25) + `AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null)` (:74); REAL login target `POST /api/v1/auth/login {Login, Password}` → 200 + non-empty `Data.AuthToken` (pattern `AuthLoginStoreUserTests.cs:42-48`; login BEFORE deactivation).
- [x] 2.2 Minted actor `DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)` (:228) → `POST /api/v1/users/activate {Id=su.UserId, IsActive=false}` → 200; DB read-back `IsActive==false` via `IgnoreQueryFilters` (`UsersActivateTests.cs:32-36`).
- [x] 2.3 Target REAL token `AuthTestHelpers.BearerClient(_f, token)` (:26) → `GET /api/v1/auth/me` → 404 + `Succeeded==false` + `ActionCode==404` + `Errors.ContainSingle(e => e.Code == "Auth.AccountInactive")` (`AuthMeFailureTests.cs:49-54`); exactly ONE `/me` call.
- [x] 2.4 `finally` cleanup: `AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId)` + `(_f, oa.StoreId, oa.UserId)` (:106).

## Phase 3: T2 — Cross-tenant activate → 404 envelope (isolation)

- [x] 3.1 `T2_...` : seed OA+Management tenant A (D2 minted actor); local `SeedTenantBVictimAsync()` MINIMAL seed tenant B = `Tenant.Create` + `User.Create` + `UserRole.Create(StoreUser)` (per `UsersIsolationTests.cs:77-89`) — NO Store/StoreUser/StoreModule rows (FK-safe cleanup).
- [x] 3.2 Minted actor → `POST /api/v1/users/activate {Id=victimId, IsActive=false}` → 404 + `Succeeded==false` + `Errors.NotBeEmpty()` — NO code pin (wire `App.Unexpected` via `ErrorHandlerMiddleware.cs:82`; convention `UsersActivateTests.cs:72-86`).
- [x] 3.3 `finally` cleanup: `DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantB)` (:113) + `AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId)`.

## Phase 4: Verification + Purity

- [x] 4.1 Focused run green: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthMeDeactivation"` → 2 passed, 0 failed. — Acceptance: both `[Fact]`s pass against real PostgreSQL.
- [x] 4.2 Regression: `--filter "FullyQualifiedName~Auth|FullyQualifiedName~UsersActivate"` → all pre-existing tests still green (none touched).
- [x] 4.3 Purity: `git diff --stat main...HEAD` → exactly 1 new file + openspec artifacts only; confirms scope rule (add-only E2E, zero modifications).
