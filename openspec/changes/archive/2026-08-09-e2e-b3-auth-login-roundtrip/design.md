# Design: e2e-b3-auth-login-roundtrip

## Technical Approach

ADD-ONLY: two new E2E test classes mirroring `AuthLoginOwnerAdminTests` — seed via shared `AuthzSeed`/`StoreSeed`/`DbTestHelpers`, POST `/api/v1/auth/login`, assert `ApiResponse<T>`; negatives assert one exact error code. Standard TDD (E2E-only).

> **Scope rule (verbatim)**: "In this backend test-coverage work, the agent may ONLY ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and report instead of touching anything."

## Architecture Decisions

| # | Decision | Options | Rationale |
|---|----------|---------|-----------|
| D1 | Owner-deactivation negative reuses `DbTestHelpers.DeactivateOwnerByUserIdAsync(_f, fixture.OwnerUserId)` | new local helper vs reuse | Branch 6 checks the **Owner row** (`AuthenticationService.cs:138-142`), not the owner's User. Helper targets that row via `ExecuteUpdateAsync` (NoTracking-safe, `DbTestHelpers.cs:217-226`); used at `AuthLoginOwnerAdminTests.cs:123`. |
| D2 | Store-deactivation negative reuses `StoreSeed.DeactivateStoreAsync(_f, fixture.StoreId)` | new local vs reuse | Branch 4 (`!activeStore.IsActive`, `:135-136`). NoTracking-safe pattern (`StoreSeed.cs:109-116`). |
| D3 | StoreUser cleanup passes BOTH users: `CleanupStoreGraphAsync(_f, fixture.StoreId, fixture.UserId, fixture.OwnerUserId)` | StoreUser-only vs both | `params userIds` removes Users only for listed ids; the owner User would strand. Spec requires full graph removal. |
| D4 | ReSeller cleanup is local two-step: delete `ReSeller` row by UserId (`IgnoreQueryFilters`), then `CleanupUserAsync` | extend shared helper vs local | ReSeller→User FK is `Restrict` (`ReSellerEntityTypeConfiguration.cs:28`); `CleanupUserAsync` never deletes ReSeller rows → User delete throws. Shared-helper change out of scope. |
| D5 | Inactive-reSeller negative sets `reSeller.IsActive = false` before `Add` | mutate after save vs before Add | `IsActive` is inherited (`AuditableEntity<TId>:22`, default true). Pre-Add mutation persists (tracked Added), avoiding the NoTracking trap; mirrors `SeedInactiveUserAsync`. |
| D6 | Role-only pin seeds via `SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller)`; name + comment document INTENTIONAL contract | treat as bug and "fix" | Active user + no ReSeller row → StoreUser null → 403 `Store.Inactive` (`:125-127`). Spec-mandated pin; a future "fix" must be flagged. |
| D7 | Negatives parse `ApiResponse<object>`, assert `Errors.Should().ContainSingle(e => e.Code == "...")` | status-only assert | Both codes map to 403 (`LoginCommand.cs:90`); one exact code discriminates them. |
| D8 | No per-test refresh-token cleanup | delete per test vs leave | Persisted per success (`LoginCommand.cs:59-63`); `CleanupUserAsync` ignores them; suite `ResetDataAsync` clears it. Pre-existing. |

## Data Flow

    Test ──seed (DbContext scope)──▶ smca_test
      │ POST /api/v1/auth/login {Login,Password}
      ▼
    AuthController ─▶ LoginCommandHandler ─▶ IsValidUserAsync
      │  (ReSeller short-circuit :68-77 | StoreUser chain :125-144)
      ▼
    200 AuthDto | 403 Errors[Auth.AccountInactive | Store.Inactive]
      ▼
    Assert ApiResponse ──finally──▶ cleanup (store graph | ReSeller row + CleanupUserAsync)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` | Create | `[Collection("e2e")]`, `WebAppFixture` ctor. 3 `[Fact]`s (see Testing Strategy): positive; store deactivated → 403; Owner row deactivated → 403. Cleanup `CleanupStoreGraphAsync(storeId, userId, ownerUserId)`. |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginReSellerTests.cs` | Create | Same collection/ctor. Local seed (User + UserRole + `ReSeller.Create(userId, true, 0, 25, tenantId, desc)`, no store graph) + local `CleanupReSellerAsync` (delete ReSeller row, then `CleanupUserAsync`). 3 `[Fact]`s: positive 200; `IsActive=false` → 403 `Auth.AccountInactive`; role-only pin → 403 `Store.Inactive`, intent-named + commented. |

## Interfaces / Contracts

POST contract (verified `AuthController.cs:20-28`, `LoginCommandValidator.cs` — login non-empty, password 8-128): `{"login","password"}`. 200 `{ Succeeded, Data:{ Login, AuthToken }, Errors:[] }`; 403 `{ Succeeded:false, Errors:[{ Code }] }`. Deserialize with `ApiResponse<T>` + `ApiResponse.Json`.

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| E2E (new) | StoreUser 1 positive + 2 negatives | `SeedStoreUserAsync(_f, null)`; store deactivated (branch 4) / Owner row deactivated (branch 6); assert 200 or `ContainSingle(Code == "Store.Inactive")` |
| E2E (new) | ReSeller positive + inactive row + role-only pin | local seed / `IsActive=false` / `SeedUserWithRoleAsync`; assert 200 (`Login` matches, token non-empty, `Errors` empty) or `ContainSingle` exact code |

**Reuse as-is**: `AuthzSeed.SeedStoreUserAsync`, `AuthzSeed.CleanupStoreGraphAsync`, `StoreSeed.DeactivateStoreAsync`, `DbTestHelpers.{HashPassword, CleanupUserAsync, DeactivateOwnerByUserIdAsync, SeedUserWithRoleAsync}`. `AuthedClient` deliberately unused (tests POST login directly). **Local-only**: `SeedReSellerAsync` + `CleanupReSellerAsync`. Hash validity: `HashPassword` uses the same app pepper (`DbTestHelpers.cs:28-46`); verified by `Argon2idHashPasswordService`.

## Threat Matrix

N/A — test-only files; no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The only route used is existing public `POST /api/v1/auth/login`.

## Migration / Rollout

No migration. Verification: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLogin"` (PostgreSQL `localhost:5432` / `smca_test`). Rollback = delete the two files; `git diff --stat` must show only them.

## Open Questions

- [ ] None blocking (re-run `~Auth` regression after apply; previously 69/69).

## Risks

| Risk | Mitigation |
|------|-----------|
| Role-only pin misread as bug | Intent-documenting test name + comment (spec-mandated) |
| `CleanupUserAsync` on a ReSeller user throws (FK Restrict) | D4: delete ReSeller row first — unconditional order |
| Stranded owner User row | D3: pass `OwnerUserId` to cleanup |
| NoTracking trap on local writes | Seed via tracked `Add`; cleanup via `RemoveRange`/`IgnoreQueryFilters` |
| Pre-hash backfill variance | Backfill (`:53-66`) is opportunistic, failures swallowed; outcome unaffected |

Constraint: Standard TDD (E2E-only), ADD-ONLY; two files ≈120 + ≈150 lines.