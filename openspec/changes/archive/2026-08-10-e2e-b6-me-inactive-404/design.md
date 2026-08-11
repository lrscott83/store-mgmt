# Design: E2E B-6 — Inactive Account /me 404 + Activate Tenant Isolation

## Technical Approach

ADD-ONLY: ONE new E2E file, EXACTLY TWO tests. Positive chain (same-tenant deactivate → 200 → real-login /me → 404 `Auth.AccountInactive`) mirrors `UsersActivateTests` (minted actor, DB read-back) + `AuthMeFailureTests.cs:39-60` (contain-single assert) + B-3 `AuthLoginStoreUserTests` (real login). Negative (cross-tenant → 404 envelope) mirrors `Activate_nonexistent_returns_404` + `UsersIsolationTests.SeedCustomTenantVictimAsync`. Standard TDD (E2E-only).

> **Scope rule (verbatim)**: "In this backend test-coverage work, the agent may ONLY ADD new E2E tests. Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization (both suites: `backend/src/SMCA.WebApi.E2ETests/`, `frontend-react/e2e/` incl. support files). Adding NEW E2E tests is allowed. If the work would require modifying production source code or existing E2E tests, STOP and report instead."

## Architecture Decisions

| # | Decision | Options | Rationale |
|---|----------|---------|-----------|
| D1 | File `Auth/AuthMeDeactivationTests.cs` (namespace `SMCA.WebApi.E2ETests.Auth`) | `Users/` dir vs `Auth/` | Chain's discriminating assert is the `/me` 404; file is sibling of `AuthMeFailureTests`/`AuthLoginOwnerAdminTests`; spec/proposal name kept. |
| D2 | Actor token minted via `DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)` | real login vs minted | `SeedOwnerAdminAsync` sets `OfflinePasswordPreHash` so real login works, but minted is the `UsersActivateTests` convention and cheaper; tenant claim arrives via `ClaimsTransformerService` (per-request), not the JWT — verified `JwtProvider.cs:20-25` + `ClaimsTransformerService.cs:40`. |
| D3 | Target token from REAL `POST /auth/login` | minted vs real | B-3 closes the gap MintToken never reached; target's store/owner active at seed → login 200 (`AuthLoginStoreUserTests`). Login BEFORE deactivation (login after would 403 `Auth.AccountInactive`). |
| D4 | Tenant-B victim = MINIMAL seed: `Tenant.Create` + `User.Create` + `UserRole.Create(StoreUser)` (per `UsersIsolationTests.cs:77-89`) — no Store/StoreUser/StoreModule rows | realistic full graph vs minimal | 404 fires on `FindAsync` null (tenant filter `UserEntityTypeConfiguration.cs:22-24`); minimal is sufficient AND FK-safe — `CleanupTenantCascadeAsync` (verified) removes StoreRoleFeature/StoreModule/Store/UserRole/Owner/User/Tenant but NOT StoreUser; a StoreUser row would strand on Store delete. |
| D5 | Cross-tenant assert: 404 + `Succeeded==false` + `Errors.NotBeEmpty()` — NO code pin | pin `User.NotFound` vs envelope-only | Verified wire: bare `ApiException` → middleware `e.AcctionCode ?? "App.Unexpected"` (`ErrorHandlerMiddleware.cs:82`) → code is `App.Unexpected`, unlike Update's Result-based `User.NotFound`. Envelope-only is the only stable assert. |
| D6 | Case-1 DB read-back `IsActive==false` (`IgnoreQueryFilters`, `UsersActivateTests.cs:32-36`) | status-only vs read-back | Stronger evidence the API wrote; existing convention. |
| D7 | Cleanup: case 1 = two `CleanupStoreGraphAsync` (target `su.StoreId, su.UserId, su.OwnerUserId` per B-3 D3; actor `oa.StoreId, oa.UserId`); case 2 = `CleanupTenantCascadeAsync(tenantB)` + actor graph | shared helper only | Independent graphs → order-free; `CleanupTenantCascadeAsync` filters by tenantId only, never touches `DefaultTenant`. |

## Data Flow

    SeedOwnerAdminAsync(_f, withManagementModule: true)   SeedStoreUserAsync(_f, null)     [case 2] Tenant.Create + User + UserRole(tenant B)
              │ (tenant A = DefaultTenant)                       │ (same tenant A)                        │
              ▼                                                   ▼                                            ▼
    POST /auth/login {su.Login} ──▶ 200 AuthDto.AuthToken (REAL token, before deactivation)
              ▼
    AuthedClient(oa) ──▶ POST /users/activate {Id: su.UserId, IsActive: false} ──▶ 200 (+DB read-back IsActive==false)
              ▼
    BearerClient(REAL token) ──▶ GET /auth/me ──▶ 404 {Succeeded:false, ActionCode:404, Errors:[Auth.AccountInactive]}
              ▼
    finally: CleanupStoreGraphAsync ×2 (case 1) | CleanupTenantCascadeAsync + CleanupStoreGraphAsync (case 2)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` | Create | `[Collection("e2e")]`, `WebAppFixture` ctor (`AppTestFactory _f` per `UsersActivateTests`). 2 `[Fact]`s; try/finally cleanup. Local-only `SeedTenantBVictimAsync` returning `(TenantId, UserId, Login)`. |

No other file touched. No production code. No existing E2E test touched.

## Interfaces / Contracts

- `POST /api/v1/auth/login` body `{login, password}` → 200 `ApiResponse<AuthDto>` (`Data.AuthToken`); 403 envelope on inactive (`LoginCommand.cs:89-90`).
- `POST /api/v1/users/activate` body `{Id, IsActive}` → `[HasPermission(UsersAdmin)]`; handler guard 403 (`ActivateUserCommand.cs:37-38`); same-tenant 200; cross-tenant/nonexistent → thrown `ApiException` 404 → middleware envelope `App.Unexpected`.
- `GET /api/v1/auth/me` → 404 `{Succeeded:false, ActionCode:404, Errors:[{Code:"Auth.AccountInactive"}]}` (`GetMeQuery.cs:63-67`); single call — blacklist second-call 401 out of scope (spec non-goal).

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| E2E (new) | T1 `Deactivated_same_tenant_store_user_me_returns_404_account_inactive` | Seed OA+Mgmt + StoreUser; REAL login target → token; minted OA `POST activate {false}` → 200 + DB read-back `IsActive==false`; target REAL token `GET /me` → 404 + `ContainSingle(e => e.Code == "Auth.AccountInactive")` |
| E2E (new) | T2 `Cross_tenant_activate_returns_404` | OA+Mgmt (tenant A); victim in tenant B (minimal seed); minted OA `POST activate {victimId}` → 404 + `Succeeded==false` + `Errors.NotBeEmpty()` (no code pin) |

**Reuse**: `AuthzSeed.SeedOwnerAdminAsync` (:25), `SeedStoreUserAsync` (:74), `CleanupStoreGraphAsync` (:106); `DbTestHelpers.{AuthedClient, CleanupTenantCascadeAsync, HashPassword}`; `AuthTestHelpers.BearerClient`; `ApiResponse<T>`/`ApiResponse.Json`; `AuthDto`. **Local-only**: `SeedTenantBVictimAsync` (UsersIsolationTests shape).

## Threat Matrix

N/A — test-only file; no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Only existing public routes exercised.

## Migration / Rollout

No migration. Verification: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthMeDeactivation"`; regression `~Auth` + `~UsersActivate`; purity `git diff --stat main...HEAD` = 1 new file + openspec artifacts only. Rollback = delete the file.

## Open Questions

- [ ] None blocking. (Coupling documented, not blocking: if `ActivateUserCommand` ever sets `AcctionCode`, cross-tenant wire code changes — envelope-only assert stays green.)

## Risks

| Risk | Mitigation |
|------|------------|
| `UserSeed.DeactivateUserAsync` silent NoTracking no-op | Deactivation ONLY via activate API (the point of the test); never the helper |
| Cross-tenant wire code is `App.Unexpected`, not `User.NotFound` | D5 envelope-only assert; verified against middleware |
| `CleanupTenantCascadeAsync` misses StoreUser rows → FK | D4 minimal tenant-B seed (no StoreUser row) |
| Minted token lacks tenant claim | Verified: `ClaimsTransformerService` injects per-request from DB row; `UsersIsolationTests` already proves the filter fires for minted actors |
| `/me` second call 401 (blacklist) | Exactly ONE `/me` call per test (spec non-goal) |
| NoTracking trap on local writes | Seeds via tracked `Add`; cleanup via `RemoveRange`/`IgnoreQueryFilters`; never query-then-mutate-then-Save |

Constraint: Standard TDD (E2E-only), ADD-ONLY; one file < 250 lines.
