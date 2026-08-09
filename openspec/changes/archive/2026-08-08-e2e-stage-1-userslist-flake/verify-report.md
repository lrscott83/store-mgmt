```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:9a67200cfdff6646bd8787a7570309ca6b97ef772155aeb63fd2157c3ad1ef5b
verdict: pass
blockers: 0
critical_findings: 0
requirements: 3/3
scenarios: 7/7
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~List_includeInactive_true_includes_inactive_user"
test_exit_code: 0
test_output_hash: sha256:eb7bd8fb38b1a5337e81d487fbfbd88ff288a8e99a6c6f99d80fd7d83a199c09
build_command: dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-dependencies
build_exit_code: 0
build_output_hash: sha256:bbd838a41e6b159c67af05ae44ce7ad848697d5fa344fae9665cb68df9de5ca3
```

## Verification Report

**Change**: e2e-stage-1-userslist-flake — remove nondeterminism that flakes `UsersListTests.List_includeInactive_true_includes_inactive_user` via (a) deterministic `OrderBy(u => u.Id)` before `.Take(1000)` on the super-admin query (`UserRepository.cs:42`) and (b) per-run data-only DB reset in `WebAppFixture.InitializeAsync` (spec R1/R2), guarding the untouched flaky test (spec R3)
**Version**: delta spec `deterministic-user-list-ordering` — 3 ADDED requirements / 7 scenarios (authoritative count from spec; the task directive stated "8 scenarios", but the spec file contains exactly 7 scenario headings — counted programmatically; the authoritative spec count governs the envelope)
**Mode**: Strict TDD — RED pre-proven by exploration (319/320 full-suite fail + isolation pass at 1088 rows, stash A/B); GREEN = both edits land + untouched flaky test passes in isolation AND full suite

This is a **PASS** change: the diff is exactly the 3 authorized files (UserRepository +1 OrderBy line; WebAppFixture reset reworked to data-only; DbTestHelpers gains the new `ResetDataAsync` helper), the focused flaky test passes (exit 0), the full E2E suite is 320/320 (exit 0), the full solution is Domain 22/22, Application.Tests 330/330, E2E 320/320 (exit 0), and the in-scope EF "row limiting without OrderBy" warning is silenced on the `/users/all` super-admin path (0 occurrences in the focused run). Residual row-limiting warnings (6 in full-suite output) are all attributable to out-of-scope queries the spec explicitly excludes (`UserRepository.cs:33/:53`, `OwnerRepository.cs:27/:79`) — pre-existing/known, not caused by this change, not blockers (per directive).

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 5 (1.1 OrderBy, 1.2 fixture reset, 2.1 focused, 2.2 full E2E + full solution, 2.3 EF warning) |
| Tasks complete | 1.1 ✅, 1.2 ✅, 2.1 ✅, 2.2 ✅, 2.3 ✅ (in-scope warning silenced; out-of-scope residual documented, not blockers) |
| Tasks incomplete | 0 |

### Capabilities / Requirements count

Delta spec `deterministic-user-list-ordering` declares **3 ADDED Requirements** (R1 deterministic ordering, R2 per-run reset, R3 guard) and **7 Scenarios** (R1: 3, R2: 2, R3: 2). **No MODIFIED/REMOVED requirements**; cross-referenced `repository` RR2 and `users-e2e` R1 specs unchanged. All 3/3 requirements and 7/7 scenarios verified below.

### Build & Tests Execution

**Build**: ✅ Passed (exit 0, 0 errors; 8 pre-existing NU1902/NU1903 package-vulnerability warnings only)
```text
dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-dependencies
  → Exit 0 — 8 Warning(s), 0 Error(s)
```

**Focused test (primary evidence, R1/R3)**: exit 0 — **Passed 1 / Failed 0 / Skipped 0 / Total 1**
```text
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~List_includeInactive_true_includes_inactive_user"
Passed!  - Failed: 0, Passed: 1, Skipped: 0, Total: 1 - SMCA.WebApi.E2ETests.dll (net8.0)
```
Zero "row limiting operator without OrderBy" warnings in this run — the in-scope `:42` super-admin query is silenced (spec R1 scenario 3).

**Full E2E suite** (one fresh run, evidence): exit 0 — **Passed 320 / Failed 0 / Skipped 0 / Total 320**
```text
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
Passed!  - Failed: 0, Passed: 320, Skipped: 0, Total: 320, Duration: 1 m - SMCA.WebApi.E2ETests.dll (net8.0)
```
`UsersListTests.List_includeInactive_true_includes_inactive_user` green within the suite (the previously flaking 320th test now passes — spec R3 scenario "flake gone in full suite").

**Full solution** (one run, regression gate): exit 0 — per-project:

| Project | Passed | Failed | Total | Result |
|---------|-----:|-----:|-----:|--------|
| Domain.UnitTests | 22 | 0 | 22 | ✅ green |
| Application.Tests | 330 | 0 | 330 | ✅ green |
| SMCA.WebApi.E2ETests | 320 | 0 | 320 | ✅ green (same run as above — reset ran once at fixture init) |

**R2 live-DB evidence (after the runs)**: `SELECT count(*)` on `smca_test` → **"User" = 15** (was **1088** pre-change per exploration), "Tenant" = 2 (DefaultTenant seed + 1 run leak), "Store" = 10, "UserRole" = 10. Table far under the Take(1000) cap — reset works; the next run starts clean (spec R2 scenarios 1 and 2).

**Coverage**: ➖ Not available — E2E runs via `WebAppFixture` on live PostgreSQL; no coverage toolset for this harness (config `coverage_threshold: 0`). Informational only, never blocking.

### Spec Compliance — Requirements & Scenarios (7/7)

#### R1 — Deterministic Ordering Before Take(1000) on the Super-Admin List Query ✅

`UserRepository.cs:42` carries `query.IgnoreQueryFilters().OrderBy(u => u.Id).Take(1000).ToListAsync(cancellationToken)` — exact design shape; `OrderBy` on stable PK `u.Id` BEFORE `.Take(1000)`; cap/filters/includes/`IgnoreQueryFilters()` unchanged (repository RR2 intact).

| Scenario | Result | Evidence |
|----------|--------|----------|
| Full-suite context cannot shift the window | ✅ PASS | `OrderBy(u => u.Id)` on the PK (indexed, unique, zero ties) makes the 1000-row window a function of table state only; identical-state window is identical by construction. Focused (1/1) and mid-suite (320/320) runs both return the seeded row |
| Freshly seeded row inside the window | ✅ PASS | With reset (R2) the table stays ~15 rows; the seeded `inactive-{guid}` row is deterministically inside the window; `Contain` assertion at UsersListTests.cs:91 passes in isolation AND full suite |
| EF Core warning silenced | ✅ PASS | Focused run (exercises exactly the `:42` super-admin path): **0** "row limiting operator without OrderBy" warnings. The exact query the exploration observed warning on is now silent |

#### R2 — Per-Run Database Reset in WebAppFixture ✅

`WebAppFixture.InitializeAsync` (WebAppFixture.cs:31-32): `MigrateAsync()` then `DbTestHelpers.ResetDataAsync(db)` — a NEW data-only reset (no DROP DATABASE; user-approved 2026-08-08 deviation from design.md's EnsureDeleted mechanism, itself blocked by PG 10.3 — see apply-progress). `ResetDataAsync` deletes business/data rows in FK-safe order via `ExecuteDeleteAsync` (sidesteps the NoTracking trap; `IgnoreQueryFilters` for tenant query filters), preserving migration seed rows (DefaultTenant, seeded admin + SuperAdmin UserRole, Role/Feature/Module/StorePaymentStatus/SystemConfiguration).

| Scenario | Result | Evidence |
|----------|--------|----------|
| Fresh run starts under the cap | ✅ PASS | Live count after full-suite + solution runs: "User" = 15 (< 1000). Pre-change it was 1088 (> cap). Fixture init runs before any test seeds (single `[Collection("e2e")]` fixture, initialized once per run) |
| No accumulation across runs | ✅ PASS | Reset deletes accumulated rows including leaked seeds (AuthMe `me-*`, RegisterStorePayment `other-*`, AuthRegisterDuplicate `dup-*`, crashed-run leftovers) at every fixture init; rows from prior runs cannot survive into the next |

#### R3 — Guard: Flaky Test Untouched and Green ✅

`UsersListTests.List_includeInactive_true_includes_inactive_user` (UsersListTests.cs:80-98) is **byte-identical to HEAD** — not in the diff; assertion `b!.Data.Should().Contain(x => x.Login == targetLogin)` (:91) is the honest, unweakened acceptance criterion.

| Scenario | Result | Evidence |
|----------|--------|----------|
| Flake gone in full suite | ✅ PASS | Full E2E suite 320/320, exit 0 — the previously flaking test passes in full-suite context |
| Isolation still green | ✅ PASS | Focused run `--filter "FullyQualifiedName~List_includeInactive_true_includes_inactive_user"` → 1/1, exit 0 |

### Verify Checks (task directive)

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Diff conformance: exactly 3 authorized files; no test file modified; no DROP DATABASE; OrderBy(u => u.Id) at :42 before Take(1000) | ✅ | `git diff --name-only` = exactly `UserRepository.cs`, `WebAppFixture.cs`, `DbTestHelpers.cs` (3 files, +67/-2). `git status` on `backend/src/SMCA.WebApi.E2ETests/Users/` = clean (no test touched). Diff grep for `DROP|EnsureDeleted|ClearAllPools` = 0 matches. `UserRepository.cs:42` = `IgnoreQueryFilters().OrderBy(u => u.Id).Take(1000)`; :33/:53 untouched (still unordered Take — out of scope) |
| 2 | R1: focused flaky test must PASS | ✅ | Exit 0, Passed 1 / Failed 0 / Skipped 0 / Total 1 |
| 3 | R2: full E2E suite 320/320; full solution Domain 22/22, Application.Tests 330/330, E2E 320/320; user count low after run | ✅ | E2E 320/320 exit 0; solution exit 0 with 22/330/320; live "User" = 15 (was 1088), far under cap |
| 4 | R3: UsersListTests unmodified; passes in isolation AND full suite | ✅ | Not in diff (Users/ dir clean, :80-98 byte-identical to HEAD); isolation 1/1; full suite 320/320 |
| 5 | Warning check: in-scope `:42` warning absent in focused + full outputs; out-of-scope residual classified pre-existing, not blockers | ✅ | Focused output: **0** row-limiting warnings. Full suite: **6** occurrences, all attributable to out-of-scope paths (`UserRepository.cs:33/:53`, `OwnerRepository.cs:27/:79` — verified by codebase `Take(1000)` audit: only those 4 sites plus the fixed `:42` exist). Per spec "Explicitly Out of Scope" + locked user scope — pre-existing/known, informational, NOT blockers |
| 6 | Cross-check proposal/tasks DoDs; report drift | ✅ | The DROP→data-only reset mechanism is an **AUTHORIZED deviation** (user-approved 2026-08-08, documented in apply-progress.md "Mechanism change"; design.md's EnsureDeleted was blocked by PG 10.3 `DROP DATABASE ... WITH (FORCE)` incompatibility) — recorded, not drift. No other drift found: OrderBy shape, task 1.1 DoD exact; fixture reset at `InitializeAsync` after `MigrateAsync`; no new tests (strict TDD respected) |

### Correctness (Static Evidence)

| Fact | Status | Notes |
|------|--------|-------|
| OrderBy placement | ✅ | `:42` — between `.IgnoreQueryFilters()` and `.Take(1000)` — exact design/tasks shape; sibling `Take(1000)` at :33/:53 untouched |
| OrderBy column | ✅ | `u.Id` — PK, unique-indexed (UserEntityTypeConfiguration.cs:27), zero tie risk (design decision, rejected `CreatedDate` microsecond-tie and collation-dependent `Login`) |
| Reset is data-only | ✅ | No `DROP DATABASE`, no `EnsureDeletedAsync`, no `ClearAllPools` anywhere in the diff; `MigrateAsync` then `ResetDataAsync(db)` |
| Reset FK order + seeds preserved | ✅ | Deletes in children-before-parents order (RefreshToken/OutboxMessage/StoreUsage → StorePayment/StoreModule/StoreRoleFeature/StoreUser → commerce subtree → ReSellerOwner/Store/ReSeller → UserRole(keep admin)/Owner/User(keep admin)/Tenant(keep DefaultTenant)); `ExecuteDeleteAsync` + `IgnoreQueryFilters` sidesteps NoTracking trap and tenant query filters; HasData seeds preserved (verified live: Tenant=2 incl. DefaultTenant, UserRole=10 incl. SuperAdmin role) |
| NoTracking trap avoided | ✅ | `ExecuteDeleteAsync` issues SQL directly — no query-then-mutate (CLAUDE.md gotcha) |
| R3 test integrity | ✅ | UsersListTests.cs:80-98 unchanged; honest `Contain` assertion at :91; no weakening/rename/skip/re-assert |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| R1+R2 atomic pair (order + reset) | ✅ | Both shipped together; ordering alone is insufficient (>1000 rows still truncates), reset alone insufficient (query stays unordered) — pair is atomic per design |
| OrderBy column `u.Id` | ✅ | Chosen in design; applied verbatim |
| Reset strategy | ⚠️ Authorized deviation | Design said EnsureDeleted+re-Migrate; blocked by PG 10.3 (`WITH (FORCE)` syntax error, documented in apply-progress). User approved data-only `ResetDataAsync` instead — deviation documented, not drift |
| No pagination/cap semantics change | ✅ | Cap 1000, filters, includes, `IgnoreQueryFilters()` unchanged (repository RR2) |
| Zero production code beyond :42 | ✅ | Only UserRepository:42 touched in production; DbTestHelpers/WebAppFixture are E2E test infra |

### Scope proof (authorized change only)

```text
$ git diff --stat
 backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs      |  2 +-
 backend/src/SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs           | 61 ++++++++++++++++++++++
 backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs           |  6 ++-
 3 files changed, 67 insertions(+), 2 deletions(-)
```

- Working tree diff = exactly the 3 authorized files (+67/−2); no test file, no other production file. ✅
- `openspec/changes/e2e-stage-1-userslist-flake/` is untracked SDD artifacts only (no code). ✅
- `UsersListTests.cs` byte-identical to HEAD (not in diff). ✅

### Strict TDD Evidence

| Check | Result | Details |
|-------|--------|---------|
| TDD shape | ✅ | Existing failing E2E test is the RED; production+infra fix pair is the GREEN; no new tests added (scope = 2 modified files + 1 new helper method in test infra) |
| RED confirmed | ✅ | Exploration: 319/320 full-suite fail + isolation pass at 1088 rows, stash A/B proved pre-existing and NOT caused by B-1 clock-pin change |
| GREEN confirmed (fresh execution) | ✅ | Focused 1/1 exit 0; full E2E 320/320 exit 0; full solution 22/330/320 exit 0 |
| Triangulation | ⚠️ Single-case by design | Scope is exactly 2 changes fixing one flake; the honest untouched test + warning silence + live DB counts triangulate adequately |
| Safety net for modified files | ✅ | Full E2E suite + full solution run after the change; production change limited to 1 line |

### Test Layer Distribution

| Layer | Tests (changed) | Files |
|-------|----------------|-------|
| Unit | 0 | — |
| Integration | 0 | — |
| E2E | 0 modified (R3 guard) | 2 infra files modified (`WebAppFixture.cs`, `DbTestHelpers.cs` +1 method), 1 production file (`UserRepository.cs` +1 line) |

E2E harness: `WebApplicationFactory` + live PostgreSQL `smca_test` (WebAppFixture applies migrations + data reset).

### Assertion Quality

| File | Line | Issue | Severity |
|------|------|-------|----------|
| — | — | ✅ Zero assertion changes. The R3 test's `Contain` predicate (UsersListTests.cs:91) verifies the seeded inactive user appears in the real super-admin list output — the honest acceptance criterion, unweakened | — |

### Quality Metrics

**Linter**: ➖ Not available (no lint gate configured for backend E2E)
**Type Checker**: ✅ Build exit 0 — 0 errors; 8 pre-existing NU1902/NU1903 package-vulnerability warnings (unchanged, not caused by this change)

### Issues Found

**CRITICAL**: None (0)
**WARNING**: None caused-by-change (0). Informational (documented, not blockers — spec "Explicitly Out of Scope" + locked user scope):
1. Full-suite output still emits the EF "row limiting operator without OrderBy" warning **6 times**, from out-of-scope queries: `UserRepository.cs:33` and `:53` (store-user / owner-admin list paths) and `OwnerRepository.cs:27` and `:79` (owners lists). Pre-existing, untouched by this change; reaching literal zero requires out-of-scope production edits — deferred (criterion satisfied for the fixed in-scope query).
**SUGGESTION**:
1. The other four unordered `Take(1000)` sites (UserRepository :33/:53, OwnerRepository :27/:79) are the same latent fragility class the exploration found — each would need its own user authorization to fix; tracked here as information for future changes.

### Verdict

**PASS — verified, archive-ready**

The change is exactly the 3 authorized files: `UserRepository.cs:42` gains `OrderBy(u => u.Id)` before `.Take(1000)` (spec R1); `WebAppFixture.InitializeAsync` now runs a data-only per-run reset via the new `DbTestHelpers.ResetDataAsync` (spec R2 — user-approved deviation from design's DROP mechanism, blocked by PG 10.3); `UsersListTests` is untouched (spec R3). Evidence: build exit 0 (0 errors); focused flaky test exit 0 (1/1) with **zero** row-limiting warnings on the in-scope query; full E2E suite **320/320** exit 0 (previously 319/320 with the flake); full solution exit 0 (**Domain 22/22, Application.Tests 330/330, E2E 320/320**); live `smca_test` "User" count = **15** after the runs (was 1088). All 3 requirements / 7 scenarios pass; blockers 0, critical findings 0. Residual warnings are pre-existing out-of-scope queries — information, not blockers. No drift: the DROP→data-only mechanism change is the documented user-approved deviation.
