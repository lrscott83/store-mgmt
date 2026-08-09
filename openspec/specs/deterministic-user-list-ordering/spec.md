# Delta for deterministic-user-list-ordering

**Change**: `e2e-stage-1-userslist-flake`
**Status**: Active
**Domain**: new capability — deterministic super-admin user-list window (production query ordering + E2E fixture reset)

No MODIFIED/REMOVED requirements. Cross-referenced specs stay unchanged: `repository` RR2 (`.Take(1000)` cap) and `users-e2e` R1 (List Users scenarios).

## Purpose

Eliminate the nondeterminism that flakes `UsersListTests.List_includeInactive_true_includes_inactive_user` (UsersListTests.cs:80-98). The super-admin list query (`UserRepository.cs:36-43`) applies `.Take(1000)` with no `OrderBy`; with the never-reset shared `smca_test` DB at 1088 users (> cap), which rows land in the 1000-row window is heap-order luck. Ordering alone is insufficient (a >1000-row table still truncates the seeded row); the per-run reset alone is insufficient (the query stays unordered). Together they make the seeded `inactive-{guid}` row deterministically present.

## ADDED Requirements

### Requirement: R1 — Deterministic Ordering Before Take(1000) on the Super-Admin List Query

`UserRepository.GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync` MUST apply an `OrderBy` on a stable column BEFORE `.Take(1000)` (UserRepository.cs:42). The returned 1000-row window SHALL be identical for identical table state across runs and contexts. No pagination semantics change: the cap, filters, includes, and `IgnoreQueryFilters()` remain as documented in `repository` RR2 (unchanged).

#### Scenario: Full-suite context cannot shift the window
- GIVEN identical rows in the `User` table
- WHEN the super-admin query executes twice — once in isolation, once mid-suite
- THEN the same 1000-row window SHALL be returned both times

#### Scenario: Freshly seeded row inside the window
- GIVEN a table below the 1000 cap and a freshly seeded `inactive-{guid}` user
- WHEN `GET /api/v1/users/all/true` executes as super admin
- THEN the seeded row SHALL be present in the returned `Data` list

#### Scenario: EF Core warning silenced
- GIVEN the query now carries an `OrderBy` operator
- WHEN the query executes
- THEN no "Take without OrderBy" runtime warning SHALL be emitted

### Requirement: R2 — Per-Run Database Reset in WebAppFixture

`WebAppFixture.InitializeAsync` MUST reset the E2E database (`smca_test`) after `MigrateAsync()` (WebAppFixture.cs:28) and before any test seeds data, so the `User` table starts empty (or below the Take cap) at the start of every test run and cannot accumulate past the cap across runs.

#### Scenario: Fresh run starts under the cap
- GIVEN a polluted `smca_test` carrying 1088+ users from prior runs
- WHEN a new E2E test run starts
- THEN the `User` table SHALL contain zero rows (or fewer than 1000) before the first test seeds

#### Scenario: No accumulation across runs
- GIVEN two consecutive full-suite runs
- WHEN the second run's fixture initializes
- THEN the reset SHALL remove rows left behind by the first run, including leaked seeds

### Requirement: R3 — Guard: Flaky Test Untouched and Green

`UsersListTests.List_includeInactive_true_includes_inactive_user` (UsersListTests.cs:80-98) MUST NOT be modified, and MUST pass both in isolation and in the full suite (320/320). Its assertion — `Data` contains the seeded `inactive-{guid}` login — remains the honest acceptance criterion. No weakening, rename, skip, or re-assert.

#### Scenario: Flake gone in full suite
- GIVEN a polluted DB with >1000 users and R1 + R2 implemented
- WHEN the full E2E suite runs
- THEN the freshly seeded inactive user always appears in the list result and the unmodified test passes

#### Scenario: Isolation still green
- GIVEN the same test run alone
- WHEN it executes unchanged
- THEN it SHALL pass

## Open Parameters (design decides HOW)

- **OrderBy column**: `u.Id` vs `u.CreatedAt` vs another stable column (repo conventions).
- **Reset strategy**: drop/recreate vs truncate (FK order) vs another mechanism; MUST preserve referential integrity and run only against the E2E database.

## Explicitly Out of Scope

- No modification of any existing E2E test (R3 guard); no manual purge of `smca_test` (user declined)
- No changes to the other two `Take(1000)` repository methods (UserRepository.cs:33, 53) or pagination semantics
- No other production code changes

## Verification Criteria

- [ ] Full E2E suite green (320/320); R3 test unmodified
- [ ] EF Core "Take without OrderBy" warning gone on `/users/all` queries
- [ ] Repeated runs keep `smca_test` user count under the cap (reset works)
- [ ] R3 test passes isolated AND in full suite
