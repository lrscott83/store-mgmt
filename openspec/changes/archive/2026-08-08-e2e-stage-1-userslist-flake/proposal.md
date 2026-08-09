# Proposal: e2e-stage-1-userslist-flake

**Change ID**: `e2e-stage-1-userslist-flake` — branch `feat/e2e-stage-1-s1-01-backend`, 2026-08-08

## Intent

Remove the nondeterminism that flakes `UsersListTests.List_includeInactive_true_includes_inactive_user` (UsersListTests.cs:80-98). The super-admin list query at `UserRepository.cs:42` applies `.Take(1000)` with no `OrderBy`, so the returned 1000-row window is heap-order luck. EF Core warns at runtime ("Take without OrderBy... unpredictable results"); the shared, never-reset `smca_test` DB is at 1088 users (> 1000 cap). The test passes in isolation and fails in the full suite (319/320): transient rows added before it run shift the heap and push the freshly seeded `inactive-{guid}` row out of the window.

Ordering alone does not fix the flake — the per-run reset keeps the table under the cap; together they make it deterministic.

## Scope

### In Scope (user-authorized 2026-08-08 — only these)
- `UserRepository.cs:42` (production): deterministic `OrderBy` before `.Take(1000)`.
- `WebAppFixture.InitializeAsync` (test infra): per-run DB reset so `smca_test` starts clean.
- Existing test `List_includeInactive_true_includes_inactive_user` stays untouched — honest and passing deterministically.

### Out of Scope / Non-Goals
- No manual purge of `smca_test` (user declined).
- No test weakening/rename/skip; no other tests or production code touched.
- No API/pagination contract changes (cap semantics unchanged).
- Exploration options 2 (remove/paginate cap) and 4 (fix leaking seeds) declined by user.

## Capabilities

> Contract for sdd-spec. Research: `openspec/specs/repository` (RR2 cap), `openspec/specs/users-e2e` (R1).

### New Capabilities
- `deterministic-user-list-ordering`: super-admin list query MUST `OrderBy` before `.Take(1000)` (stable window; EF warning silenced); `WebAppFixture` MUST reset the E2E DB per run. Cross-references repository RR2 cap (unchanged).

### Modified Capabilities
- None — no existing spec requirement changes; tests untouched (user scope).

## User Impact

None visible: internal determinism + test hygiene. Cost: full E2E suite runs slightly slower (per-run reset).

## Approach

1. Add `OrderBy` (column TBD — see Open Questions) before `.Take(1000)` at `UserRepository.cs:42`.
2. After `MigrateAsync()`, reset the DB per run in `WebAppFixture.InitializeAsync` (strategy TBD — see Open Questions).
3. Strict TDD: the untouched flaky test must pass in isolation AND full suite; no new tests unless the design requires them.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs:42` | Modified | OrderBy added before Take(1000) |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs:14-29` | Modified | Per-run DB reset after MigrateAsync |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersListTests.cs:80-98` | Untouched | Flaky test stays as-is; must pass |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Ordering changes returned list order | Med | Admin list has no order contract; OrderBy column decided in design; verify consumers |
| Reset breaks tests assuming pre-seeded rows | Low | Suite seeds all data it needs; full-suite green required |
| Per-run reset slows the suite | Low | Accepted tradeoff |

## Rollback Plan

`git revert` the commit; both edits are self-contained, behavior-scoped, no data migration.

## Dependencies

None. No EF migration needed (ordering + fixture reset only).

## Rollout

Commit-only on current branch `feat/e2e-stage-1-s1-01-backend`; no PR requested. No deploy steps.

## Open Questions

None blocking. Design-phase decisions (do NOT assume here):
- OrderBy column: `u.Id` vs `u.CreatedAt` (repo conventions).
- Reset strategy: drop/recreate vs truncate (FK order).

## Success Criteria

- [ ] Full E2E suite green (320/320); flaky test untouched.
- [ ] EF Core "Take without OrderBy" warning gone on `/users/all` queries.
- [ ] Repeated runs keep `smca_test` user count under the cap (reset works).
- [ ] Isolation AND full-suite runs both pass the previously flaky test.
