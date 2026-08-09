# Apply Progress: e2e-stage-1-userslist-flake

- **Status**: `all_done` — all tasks completed; full solution green (Domain 22/22, Application.Tests 330/330, E2E 320/320)
- **Date**: 2026-08-08 (updated after user-approved mechanism change)
- **Branch**: feat/e2e-stage-1-s1-01-backend
- **Artifact store mode**: both (openspec + engram)
- **Strict TDD**: RED proven by exploration (319/320 full-suite fail + isolation pass at 1088 rows); GREEN reached — all verification tasks pass.

## History (previous attempt — preserved)

First apply attempt applied `UserRepository.cs:42` OrderBy and a `WebAppFixture` reset using `NpgsqlConnection.ClearAllPools()` + `EnsureDeletedAsync()` + `MigrateAsync()`. That DROP mechanism was **BLOCKED**: the fixture hit `Npgsql.PostgresException 42601: syntax error at or near "WITH"` on `DROP DATABASE smca_test WITH (FORCE);` — the server on localhost:5432 is PostgreSQL **10.3**, and EF Core 8 Npgsql always emits `WITH (FORCE)` (requires PG 13+). See previous blocking evidence below.

## Mechanism change — user-approved 2026-08-08 (deviation from design.md)

The user **rejected dropping ANY database** (including the test DB) and approved replacing the DROP mechanism with a **DATA-ONLY cleanup**:

- Removed `NpgsqlConnection.ClearAllPools()` + `EnsureDeletedAsync()` from `WebAppFixture.InitializeAsync` (also removed the now-unused `using Npgsql;`).
- `MigrateAsync()` remains (applies migrations + HasData seeds).
- Added `DbTestHelpers.ResetDataAsync(ApplicationDbContext)` — a NEW helper method (third authorized file: DbTestHelpers.cs was only to gain the method; no existing method was modified). It deletes rows from the business/data tables in FK-safe order (children before parents; every FK in the model is `DeleteBehavior.Restrict`) using `ExecuteDeleteAsync` (EF Core 8), which sidesteps the NoTracking trap documented in CLAUDE.md. `IgnoreQueryFilters()` everywhere the tenant query filters would hide rows.
- **Preserved seed rows**: DefaultTenant (`Tenant`), seeded admin user + its SuperAdmin `UserRole` (`User`, `UserRole`), and untouched seed tables (`Role`, `Feature`, `Module`, `StorePaymentStatus`, `SystemConfiguration`) — verified against the final model snapshot (`ApplicationDbContextModelSnapshot.cs`): HasData exists only on those 8 entities. `TenantId` is an index, NOT an FK — no FK to Tenant.
- Delete order in `ResetDataAsync`: RefreshToken → OutboxMessage → StoreUsage → StorePayment → StoreModule → StoreRoleFeature → StoreUser → InventoryEntryCost → OrderItem → Order → InventoryEntry → Product → ProductCategory → ReSellerOwner → Store → ReSeller → UserRole (keep admin seed) → Owner → User (keep admin seed) → Tenant (keep DefaultTenant).
- No DROP DATABASE. No PG 13+ requirement. The database persists; only accumulated data rows are deleted.

## Files changed (authorized scope — exactly 2 modified + 1 added method)

| File | Change | Status |
|---|---|---|
| `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs:42` | `query.IgnoreQueryFilters().OrderBy(u => u.Id).Take(1000).ToListAsync(cancellationToken)` — exact design shape; :33 and :53 untouched | Applied, compiles |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs` | Reset reworked: removed ClearAllPools + EnsureDeletedAsync (+ `using Npgsql;`); `MigrateAsync()` then `await DbTestHelpers.ResetDataAsync(db)` (data-only reset) | Applied, compiles |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs` | ADDED `ResetDataAsync(ApplicationDbContext)` (new public helper; no existing method modified) + usings for RefreshToken/StoreUsage/StorePayment/StoreUser/OutboxMessage | Applied, compiles |

No test files touched (`UsersListTests` untouched — R3 guard respected). No other production code touched.

## Task status

- [x] 1.1 UserRepository OrderBy — DoD shape verified, compiles
- [x] 1.2 WebAppFixture reset — DoD compiles (data-only reset replaces DROP, user-approved)
- [x] 2.1 Focused test PASS — `--filter "FullyQualifiedName~List_includeInactive_true_includes_inactive_user"` → 1/1 PASS (fixture init OK, no drop, no FK errors)
- [x] 2.2 Full E2E 320/320 — ran twice (both PASS); full solution `dotnet test backend/src/SMCA.sln` → Domain 22/22, Application.Tests 330/330, E2E 320/320
- [x] 2.3 EF "Take without OrderBy" warning — in-scope super-admin query SILENCED (see deviation note)

## Verification evidence

1. **Focused test** (`List_includeInactive_true_includes_inactive_user`): **PASS** (1/1). Fixture init completed — no FK violations, no DROP.
2. **Full E2E suite** (twice): **320/320 PASS** (0 failed; ~1m 7s / 59s — reset adds expected overhead).
3. **Full solution**: `dotnet test backend/src/SMCA.sln` → **Domain.UnitTests 22/22, Application.Tests 330/330, SMCA.WebApi.E2ETests 320/320**, exit code 0.
4. **Reset works (R2)**: live counts on `smca_test` after the full run — `User`=15 (was **1088** pre-change), `Tenant`=2 (DefaultTenant + 1 run leak), `UserRole`=10, `Store`=10, `RefreshTokens`=4. The reset wipes prior-run accumulation at each fixture init; the next run starts under the Take(1000) cap (spec R2 scenario "fresh run starts under the cap").
5. **OrderBy intact (R1)**: `UserRepository.cs:42` verified present with exact shape; flaky test green in isolation AND full suite (spec R3).

## Deviation note — EF "row limiting" warning (task 2.3)

- **In scope — SILENCED**: the super-admin `/users/all` query (`UserRepository.cs:42`, the query spec R1 targets and the one exploration observed warning on) now carries `OrderBy` and emits **no** "row limiting operator without OrderBy" warning. Proven by the isolated runs: the flaky super-admin test run shows zero occurrences; the isolated `UsersListTests` class (14/14) shows exactly ONE occurrence, from the owner-admin sub-test (`List_as_owner_admin_..._200`).
- **Out of scope — residual (pre-existing)**: the full suite still emits the warning from queries the spec explicitly lists as out of scope (`UserRepository.cs:33/:53` — store-user/owner-admin paths — and `OwnerRepository.cs:27/:79` — owners lists). Locked user scope forbids touching them. 6 occurrences in the full-suite run, all attributable to those paths (verified by full codebase `Take(` audit: only those plus the fixed :42 exist). **Decision recorded**: cannot reach literal "zero occurrences in full-suite output" without touching out-of-scope production code; criterion satisfied for the fixed query (spec R1 scenario 3).

## Previous blocking evidence (superseded — kept for lineage)

1. Focused test run failed at fixture init: `Npgsql.PostgresException 42601: syntax error at or near "WITH"` on `DROP DATABASE smca_test WITH (FORCE);` (WebAppFixture.cs:32, `EnsureDeletedAsync`).
2. `SHOW server_version` on localhost:5432 → **10.3**. `DROP DATABASE ... WITH (FORCE)` requires PostgreSQL 13+. EF Core 8 Npgsql always emits `WITH (FORCE)`.
3. No other connections: `pg_stat_activity` for `smca_test` → zero rows. A plain DROP would have succeeded — but mechanism change required user approval (given).

## Not done

- No commit (orchestrator handles). No native review gates run (per instructions).
