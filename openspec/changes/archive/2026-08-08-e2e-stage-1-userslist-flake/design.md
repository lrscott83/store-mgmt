# Design: e2e-stage-1-userslist-flake

## Technical Approach

Two changes that must ship together make the super-admin user-list window deterministic:

1. `UserRepository.cs:42` — add `OrderBy(u => u.Id)` before `.Take(1000)` in `GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync` (spec R1).
2. `WebAppFixture.InitializeAsync` — per-run drop-and-recreate of `smca_test` (spec R2), removing the rows that accumulate past the 1000-row cap.

The untouched flaky test (UsersListTests.cs:80-98) is the honest acceptance criterion (spec R3). Ordering alone is insufficient (a >1000-row table still truncates the seeded row); the reset alone is insufficient (the query stays unordered). The pair is atomic — never ship one without the other.

## Architecture Decisions

### Decision: OrderBy column — `u.Id`

| Option | Tradeoff | Decision |
|---|---|---|
| `OrderBy(u => u.Id)` | PK, globally unique, indexed (`UserEntityTypeConfiguration.cs:27` HasKey); zero tie risk; fully deterministic; cheapest index scan | **Chosen** |
| `OrderBy(u => u.CreatedDate)` | `AuditableEntity.cs:24` defaults `DateTimeOffset.UtcNow`, set by `SetAuditableColumns` on save; two inserts in the same microsecond tie → non-deterministic tiebreak without a ThenBy | Rejected |
| `OrderBy(u => u.Login)` | Unique index (:28); nicer display order; collation-dependent | Rejected (no display contract; Id is cheaper) |

**Rationale**: sibling list repos order by display semantics (`FeatureRepository.cs:36` `OrderBy(f => f.Order)`, `StoreUserRepository.cs:50` names) — the user list has none. Consumers verified **display-only**: the only caller is `GetAllUsersQuery.cs:40` (super-admin branch) → `UserListDto`; the frontend `user-list.tsx` renders cards with no client-side sort; no unit test asserts order (grep: zero matches in `Application.Tests`). No contract breaks. `u.Id` is the strongest deterministic key and silences the EF "Take without OrderBy" warning.

### Decision: Reset strategy — `EnsureDeletedAsync` + re-`MigrateAsync`

| Option | Tradeoff | Decision |
|---|---|---|
| `NpgsqlConnection.ClearAllPools()` + `EnsureDeletedAsync()` + `MigrateAsync()` | Re-applies all 14 migrations; restores every HasData seed; future-proof (new tables auto-covered); touches only `smca_test` (fixture's hardcoded env string, WebAppFixture.cs:21-22) | **Chosen** |
| TRUNCATE in FK order | Must preserve ~8 HasData-seeded tables or FK/role lookups break (`User.TenantId`→Tenant, `UserRole.RoleId`→Role); hand-maintained table list | Rejected |
| `TRUNCATE ... CASCADE` | Wipes seeds too; breaks tests referencing `DataUtils.DefaultTenant.Id` and RoleType ids | Rejected |

**Rationale**: migrations seed via `HasData` (`TenantEntityTypeConfiguration.cs:25` DefaultTenant, `UserEntityTypeConfiguration.cs:46` admin user, `RoleEntityTypeConfiguration.cs:34-52`). Drop + re-migrate is the simplest robust mechanism EF already exposes, restores pristine seeded state, and needs no FK-topology maintenance. Npgsql pools connections by default — a pooled connection to `smca_test` makes `DROP DATABASE` fail, so `ClearAllPools()` must precede. Both calls are standard `DatabaseFacade` APIs; `Npgsql` is transitively available to the test project (Infrastructure → Npgsql.EntityFrameworkCore.PostgreSQL). Mid-run wipe is impossible: the single `[Collection("e2e")]` fixture (WebAppFixture.cs:38-39) initializes once per run, before any seed.

## Data Flow

```
Fixture InitializeAsync (once per run)
  env conn string → smca_test → ClearAllPools → EnsureDeleted → Migrate (seeds restored)
Test seeds rows → User table starts ≈ 0, never accumulates across runs
GET /users/all/true → UsersController:35 → GetAllUsersQuery:40
  → UserRepository:42 OrderBy(Id).Take(1000) → UserListDto → display
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs` | Modify (line 42 only) | `OrderBy(u => u.Id)` before `.Take(1000)` in `GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync`. The other two `Take(1000)` methods (:33, :53) stay untouched (spec out-of-scope). |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs` | Modify (`InitializeAsync`, replacing :28) | Per-run DB reset: ClearAllPools → EnsureDeleted → Migrate. |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersListTests.cs` | Untouched | R3 guard — flaky test stays as-is. |

## Interfaces / Contracts

No public API change. Signature, cap, filters, includes, and `IgnoreQueryFilters()` unchanged (repository RR2). Exact shapes:

```csharp
// UserRepository.cs:42
return await query.IgnoreQueryFilters().OrderBy(u => u.Id).Take(1000).ToListAsync(cancellationToken);

// WebAppFixture.InitializeAsync — replaces the MigrateAsync-only line 28
using Npgsql; // transitive via Infrastructure

NpgsqlConnection.ClearAllPools();        // close pooled conns so DROP DATABASE succeeds
await db.Database.EnsureDeletedAsync();  // drop smca_test
await db.Database.MigrateAsync();        // recreate + apply migrations + HasData seeds
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| E2E (existing, untouched) | R3 flaky test `List_includeInactive_true_includes_inactive_user` | Full suite `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` → 320/320; isolation `--filter "FullyQualifiedName~UsersListTests"` → 14/14. RED precondition already proven by exploration: 319/320 full-suite fail + isolation pass at 1088 rows. |
| E2E (determinism) | R1 stable window / EF warning gone | Hit `/users/all/true` mid-suite; assert no "Take without OrderBy" warning in output; identical window for identical table state. |
| E2E (reset) | R2 no accumulation | Two consecutive full-suite runs; after each, `SELECT count(*) FROM "User"` on `smca_test` → starts near zero (only migration-seeded admin + current run's rows), never reaches 1000. |

Strict TDD: no new tests (scope = exactly 2 files); the failing untouched test is the RED, the fix pair is the GREEN.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The reset is an in-process EF `DatabaseFacade` operation against the fixture-scoped `smca_test` connection string.

## Migration / Rollout

No data migration, no feature flag, no deploy steps. Commit-only on `feat/e2e-stage-1-s1-01-backend`. Note: local dev data in `smca_test` is now wiped at each run start — intended behavior (user declined a manual purge; this is the durable anti-accumulation fix).

## Open Questions

- None blocking. Contingency: if the transitive `Npgsql` reference does not surface at compile time (unexpected `PrivateAssets`), add an explicit `PackageReference Include="Npgsql"` to `SMCA.WebApi.E2ETests.csproj` — one extra line, still within reset scope.
