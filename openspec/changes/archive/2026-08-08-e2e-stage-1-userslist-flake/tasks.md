# Tasks: e2e-stage-1-userslist-flake

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

| Field | Value |
|-------|-------|
| Estimated changed lines | ~10-20 (2 files: 1 line + 4 lines + 1 using) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit, no PR |
| Delivery strategy | commit-only on `feat/e2e-stage-1-s1-01-backend` (no PR) |
| Chain strategy | pending (n/a — commit-only, no PR) |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | OrderBy + reset + verify (all tasks) | None (commit-only) | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~List_includeInactive_true_includes_inactive_user"` | Full E2E suite — per-run reset exercises real drop + re-migrate on `smca_test` | `git revert` the commit; 2-file diff, no data migration |

**Strict TDD**: RED already proven (exploration: 319/320 full-suite fail + isolation pass at 1088 rows, stash A/B). No new tests — scope = exactly 2 files; existing E2E tests untouchable (non-negotiable). GREEN = both edits land + flaky test passes in full suite.

## Phase 1: Implementation (2 files)

- [x] 1.1 `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs:42` — in `GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync`, insert `OrderBy(u => u.Id)` between `.IgnoreQueryFilters()` and `.Take(1000)`. DoD: exact shape `query.IgnoreQueryFilters().OrderBy(u => u.Id).Take(1000).ToListAsync(cancellationToken)`; :33 and :53 untouched; compiles.
- [x] 1.2 `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs` — add `using Npgsql;`; replace line 28 `await db.Database.MigrateAsync();` with `NpgsqlConnection.ClearAllPools(); await db.Database.EnsureDeletedAsync(); await db.Database.MigrateAsync();` (inside existing `using var scope`, after `var db`). DoD: compiles — if transitive Npgsql doesn't surface, add explicit `PackageReference Include="Npgsql"` to `SMCA.WebApi.E2ETests.csproj` (design contingency); reset touches hardcoded `smca_test` only.

## Phase 2: Verification

- [x] 2.1 Focused test: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~List_includeInactive_true_includes_inactive_user"` → PASS (1/1).
- [x] 2.2 Full E2E: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` → 320/320 (twice), flake gone. Then full `dotnet test backend/src/SMCA.sln` → Domain 22/22, Application.Tests 330/330, E2E 320/320.
- [x] 2.3 EF "Take without OrderBy" warning — in-scope super-admin query SILENCED (spec R1 scenario 3; verified by isolated runs). NOTE: full-suite output still shows pre-existing warnings from OUT-OF-SCOPE queries (`UserRepository.cs:33/:53`, `OwnerRepository.cs:27/:79`) — spec explicitly excludes them; locked scope forbids touching. Documented in apply-progress.md deviation note.
