# Proposal: S1-02 — E2E coverage for inactive-store login → 403 `Store.Inactive`

Change: `e2e-stage-1-s1-02` · Branch: `feat/e2e-s1-02`

## Intent

`docs/testing/e2e-stage-1/S1-02.md:72` declares an untested assertion: login with an **inactive store** must return HTTP 403, `Succeeded=false`, single error code `Store.Inactive`. Exploration verified the branch is real and reachable — `LoginCommand.cs:84-86` maps `Store.Inactive` → 403; `AuthenticationService.HasActiveStore` genuinely evaluates `store.IsActive` (store loaded with `IgnoreQueryFilters`, `UserRepository.cs:95`) — yet grep proves zero E2E coverage (`Store.Inactive`, `StoreInactive`, `Store.IsActive` absent from the suite). Only the sibling account-inactive branch (`Auth.AccountInactive`, `AuthLoginFailureTests.cs:43`) is tested. This change closes that gap with a purely additive test.

## Scope

### In Scope
- One new `[Fact]` in `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs`: login with a deactivated store → 403, `Succeeded=false`, single error `Code == "Store.Inactive"`.
- Optional sibling `[Fact]` covering the StoreUser persona branch (`AuthenticationService.cs:127-128`) — included only if the user wants both personas.
- After verify: flip the 🆕 mark at `docs/testing/e2e-stage-1/S1-02.md:72,80` (docs touch, not an E2E test).

### Out of Scope
- Rate-limit 429 assertion — unreachable under `Testing` env (README H-12); Playwright is the documented venue.
- Any Playwright/frontend work (S1-02 frontend coverage stays PENDIENTE, tracked separately).
- Zero edits to existing E2E tests and zero production code changes (CLAUDE.md non-negotiable rule).

## Capabilities

### New Capabilities
None — no new behavioral domain; test-coverage closure for already-specified login behavior.

### Modified Capabilities
None — no requirement changes. Coverage state is tracked in `docs/testing/e2e-stage-1/S1-02.md`, not in `openspec/specs/`. sdd-spec has no delta to write.

## Approach

Mirror the existing inactive-ACCOUNT Fact (`AuthLoginFailureTests.cs:43-61`):

1. Seed with `UserSeed.SeedOwnerAdminWithStoreAsync` (User+Owner+Store+StoreModule+OwnerAdmin role+**StoreUser row**). Do NOT use `StoreSeed.SeedStoresAdminUserAsync` — no StoreUser row, would pass for the wrong reason.
2. `StoreSeed.DeactivateStoreAsync` (IgnoreQueryFilters + AsTracking).
3. `POST /api/v1/auth/login` with `"Password123"`; assert 403, `Succeeded=false`, `Errors.ContainSingle(e => e.Code == "Store.Inactive")`.
4. Cleanup: `AuthzSeed.CleanupStoreGraphAsync(_f, fixture.StoreId, fixture.UserId)` (FK-safe; `CleanupUserAsync` alone strands rows).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs` | Modified | +1 (optional +1) new `[Fact]`; existing tests untouched |
| `docs/testing/e2e-stage-1/S1-02.md:72,80` | Modified | 🆕 → covered after verify (docs only) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Test passes for wrong reason (seed without StoreUser row) | Low | Mandate `SeedOwnerAdminWithStoreAsync`; trap documented in exploration |
| Postgres `smca_test` unavailable | Med | Suite prerequisite; verify runs the E2E project |
| Accidental edit of existing tests | Low | ADD-ONLY rule carried into apply; diff review |

## Rollback Plan

`git revert` the commit adding the Fact(s); `AuthLoginFailureTests.cs` returns to prior state. No schema, config, or production code involved.

## Dependencies

- PostgreSQL `localhost:5432` (`smca_test`); `WebAppFixture` applies migrations.
- Seeds/helpers already exist: `UserSeed.SeedOwnerAdminWithStoreAsync`, `StoreSeed.DeactivateStoreAsync`, `AuthzSeed.CleanupStoreGraphAsync` — zero new helpers.

## Success Criteria

- [ ] New `[Fact]` passes against real DB: inactive store → 403, `Succeeded=false`, single `Store.Inactive` error.
- [ ] Existing `AuthLoginFailureTests.cs` tests and full E2E suite still pass.
- [ ] `S1-02.md:72` flips to covered; grep finds `Store.Inactive` in the suite.

## Proposal question round

Scope was settled with the user: one OwnerAdmin Fact is the baseline deliverable. Open assumption: the StoreUser sibling is NOT in the baseline — include it only if both personas should be covered in this change.
