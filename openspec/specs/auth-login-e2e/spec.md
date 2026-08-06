# auth-login-e2e Capability Specification

**Capability**: auth-login-e2e — E2E coverage for inactive-store login returning HTTP 403 `Store.Inactive`
**Origin**: SDD change `e2e-stage-1-s1-02`
**Source**: `docs/testing/e2e-stage-1/S1-02.md:72` (declared E2E coverage gap)
**Status**: Active

## Purpose

Coverage-only capability spec. Change `e2e-stage-1-s1-02` adds NO new behavior and
MODIFIES NO existing behavior: the `POST /api/v1/auth/login` contract for an
inactive store (HTTP 403, `Succeeded=false`, single error code `Store.Inactive`)
is already specified behavior (`LoginCommand.cs:84-86` maps both
`Auth.AccountInactive` and `Store.Inactive` to 403; `AuthenticationService.cs:112-114`
evaluates `store.IsActive`). This spec only closes the E2E coverage gap declared
at `docs/testing/e2e-stage-1/S1-02.md:72`. Requirements below describe the test
coverage, not new product capabilities.

## Capability Scope

### In Scope

- One new `[Fact]` in `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs` covering the inactive-store login rejection — Requirement 1, the baseline deliverable.
- Optional sibling `[Fact]` covering the StoreUser persona branch (`AuthenticationService.cs:127-128`) — Requirement 2, OPTIONAL and NOT part of the baseline deliverable; included only if both personas are to be covered in the change.

### Out of Scope

- Rate-limit 429 assertion: out of scope — unreachable under `Testing` env (README H-12); Playwright is the documented venue.
- Playwright/frontend coverage for S1-02: remains PENDIENTE, tracked separately.
- Edits to existing E2E tests and any production code changes: prohibited (CLAUDE.md non-negotiable rule).

## Requirements

### Requirement: E2E coverage — inactive store login returns 403 `Store.Inactive` (OwnerAdmin)

The E2E suite MUST include a new `[Fact]` in
`backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs` that logs in as
an OwnerAdmin whose store has been deactivated and asserts the login is rejected
with HTTP 403, `Succeeded == false`, and exactly one error whose
`Code == "Store.Inactive"`. The test MUST be purely additive: existing tests in
the file MUST NOT be modified, and no production code MUST be changed.

#### Scenario: OwnerAdmin logs in to a deactivated store

- GIVEN an OwnerAdmin user seeded with an active `StoreUser` row
  (`UserSeed.SeedOwnerAdminWithStoreAsync`) and a store deactivated via
  `StoreSeed.DeactivateStoreAsync`
- WHEN `POST /api/v1/auth/login` is called with the owner's credentials
- THEN the response status is HTTP 403
- AND `Succeeded` is `false` and `Errors` contains exactly one entry with `Code == "Store.Inactive"`

#### Scenario: Seed includes the StoreUser row (guards wrong-reason pass)

- GIVEN the login test seeds the OwnerAdmin graph with `SeedOwnerAdminWithStoreAsync`
  (which creates the `StoreUser` row), NOT `StoreSeed.SeedStoresAdminUserAsync`
  (which omits it)
- WHEN the store is deactivated and login is attempted
- THEN the `Store.Inactive` rejection originates from `store.IsActive == false`
  (the `:112-114` branch), not from a missing `StoreUser.Store` navigation
- AND the test therefore fails a regression where the store becomes active again

#### Scenario: Cleanup removes the full store graph

- GIVEN the login failure test completes
- WHEN cleanup runs `AuthzSeed.CleanupStoreGraphAsync(fixture.StoreId, fixture.UserId)`
- THEN Store, StoreUser, Owner, and User rows are removed in FK-safe order
- AND `DbTestHelpers.CleanupUserAsync` alone is NOT used (it strands rows via FK `Owner_User_UserId`)

### Requirement: E2E coverage — inactive store login as StoreUser (optional sibling)

The E2E suite MAY include a sibling `[Fact]` covering the StoreUser persona
branch (`AuthenticationService.cs:127-128`): a StoreUser whose store is
deactivated MUST receive the same rejection as the OwnerAdmin — HTTP 403,
`Succeeded == false`, single error `Code == "Store.Inactive"`. This requirement
is OPTIONAL and NOT part of the baseline deliverable; include it only if both
personas are to be covered in this change.

#### Scenario: StoreUser logs in to a deactivated store

- GIVEN a StoreUser seeded via `AuthzSeed.SeedStoreUserAsync` whose store is deactivated
- WHEN `POST /api/v1/auth/login` is called with the StoreUser's credentials
- THEN the response status is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"`

> **Archive note (2026-08-06)**: OPTIONAL requirement — NOT delivered in change
> `e2e-stage-1-s1-02` (user did not opt in; baseline is OwnerAdmin-only per the
> settled scope, design decision D2). If both personas are wanted later, it is a
> separate ~25-line additive change. See `archive-report.md` of the change.

## Verification Criteria

- [x] New `[Fact]` `Login_with_inactive_store_returns_403` present in `AuthLoginFailureTests.cs`, ADD-ONLY (+21/-0) — commit `c7cb8cee`; existing Facts untouched
- [x] Filtered run `FullyQualifiedName~AuthLoginFailureTests`: 3/3 passed against real PostgreSQL `smca_test`
- [x] Auth regression filter `FullyQualifiedName~Auth`: 69/69 passed, no regression
- [x] Server log confirms the `store.IsActive == false` branch was exercised (`Store.Inactive` error, "no active store")
- [ ] Requirement 2 (StoreUser sibling): not delivered — OPTIONAL, excluded by settled scope
