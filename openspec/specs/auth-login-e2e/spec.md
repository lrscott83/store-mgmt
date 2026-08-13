# auth-login-e2e Capability Specification

**Capability**: auth-login-e2e — E2E coverage for login rejection (403 `Store.Inactive`) and login-delivered wrapped DEK
**Origin**: SDD changes `e2e-stage-1-s1-02`, `e2e-b3-auth-login-roundtrip`, `login-wrapped-dek`
**Source**: `docs/testing/e2e-stage-1/S1-02.md:72` (declared E2E coverage gap); `login-wrapped-dek` (wrapped DEK delivery coverage)
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
- StoreUser persona roundtrip (`AuthenticationService.cs:125-144`) — Requirement 2, DELIVERED by change `e2e-b3-auth-login-roundtrip` (previously archived 2026-08-06 as OPTIONAL / NOT delivered in the baseline). Now covered by new `AuthLoginStoreUserTests.cs`: 1 positive + 2 negative `[Fact]`s.

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

### Requirement: E2E coverage — StoreUser login roundtrip

The E2E suite MUST include a new `AuthLoginStoreUserTests` class covering the
StoreUser persona branch (`AuthenticationService.cs:125-144`) over HTTP: a
StoreUser with an active store MUST receive HTTP 200 with `Succeeded == true`
and a non-empty `Data.AuthToken`; a StoreUser whose store — or whose store's
owner — is deactivated MUST receive HTTP 403, `Succeeded == false`, and exactly
one error whose `Code == "Store.Inactive"`. The tests MUST be purely additive:
existing tests MUST NOT be modified, and no production code MUST be changed.

#### Scenario: StoreUser logs in to an active store

- GIVEN a StoreUser seeded via `AuthzSeed.SeedStoreUserAsync` with an active Store and an active store Owner (a different user)
- WHEN `POST /api/v1/auth/login` is called with the StoreUser's credentials
- THEN the response status is HTTP 200 with `Succeeded == true`
- AND `Data.Login` matches the seeded login and `Data.AuthToken` is non-empty

#### Scenario: StoreUser logs in to a deactivated store

- GIVEN a StoreUser seeded via `AuthzSeed.SeedStoreUserAsync` whose store is deactivated via `StoreSeed.DeactivateStoreAsync`
- WHEN `POST /api/v1/auth/login` is called with the StoreUser's credentials
- THEN the response status is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"` — not `Auth.AccountInactive` (the user row itself stays active)

#### Scenario: StoreUser logs in when the store's owner is deactivated

- GIVEN a StoreUser graph whose store's Owner is deactivated
- WHEN `POST /api/v1/auth/login` is called with the StoreUser's credentials
- THEN the response status is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"` (the `!owner.IsActive` branch of the six-condition chain)

#### Scenario: Cleanup removes the full store graph

- GIVEN any StoreUser test completes
- WHEN cleanup runs `AuthzSeed.CleanupStoreGraphAsync(fixture.StoreId, fixture.UserId)`
- THEN Store, StoreUser, Owner, and User rows are removed in FK-safe order

> **Delivery note (2026-08-09)**: DELIVERED by change `e2e-b3-auth-login-roundtrip`.
> Previously archived 2026-08-06 as OPTIONAL / NOT delivered in `e2e-stage-1-s1-02`.

### Requirement: E2E — StoreUser and OwnerAdmin receive byte-compatible wraps

The suite MUST include a new `AuthLoginDekWrapTests` class in a NEW file
`backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginDekWrapTests.cs` with
`[Fact]`s proving a StoreUser and an OwnerAdmin each receive HTTP 200 with
non-empty `wrappedDek`/`wrapSalt`/`wrapIv`, and that a LOCAL `UnwrapDek`
helper (PBKDF2 + AES-GCM) in the new file recovers bytes byte-equal to
`IStoreDataKeyProvider.GetDek(storeId)`. The new file MUST define its own
unwrap helper and response DTO — `ExportOfflineRosterTests.cs` and
`TestDtos.cs` MUST NOT be modified.

#### Scenario: StoreUser login wrap equals the roster DEK

- GIVEN a StoreUser seeded via AuthzSeed.SeedStoreUserAsync (SelectedStoreId and pre-hash set)
- WHEN login returns HTTP 200
- THEN the three fields are non-empty and unwrap to GetDek(storeId) bytes

#### Scenario: OwnerAdmin login wrap equals the roster DEK

- GIVEN an OwnerAdmin with a resolvable store DEK
- WHEN login returns HTTP 200
- THEN the three fields are non-empty and unwrap to GetDek bytes

### Requirement: E2E — first-login backfill delivers the wrap

The suite MUST include a `[Fact]` seeding a user WITHOUT a pre-hash,
logging in, and asserting the response wrap fields are non-empty AND the
persisted `OfflinePasswordPreHash` is non-null.

#### Scenario: First login backfills and wraps in one request

- GIVEN a StoreUser seeded without OfflinePasswordPreHash
- WHEN login succeeds
- THEN the response wrap fields are non-empty and the DB pre-hash is non-null

### Requirement: E2E — empty fields on no store; no key on failed logins

The suite MUST include `[Fact]`s asserting a SuperAdmin login returns HTTP
200 with all three wrap fields empty, invalid credentials return 401, and
an inactive-store login returns 403 — both failures with no AuthDto.

#### Scenario: SuperAdmin gets empty wrap fields

- GIVEN a SuperAdmin seeded without SelectedStoreId
- WHEN login returns HTTP 200
- THEN wrappedDek/wrapSalt/wrapIv are all empty

#### Scenario: Failed logins deliver no key

- GIVEN invalid credentials or a deactivated store
- WHEN login is attempted
- THEN the response is 401 or 403 with no AuthDto data

### Requirement: E2E — cleanup removes the seeded graph

Each new `[Fact]` MUST clean up via `AuthzSeed.CleanupStoreGraphAsync` /
`CleanupTenantCascadeAsync`, matching existing Auth E2E conventions.

#### Scenario: Store graph rows are removed after each test

- GIVEN any new AuthLoginDekWrapTests `[Fact]` completes
- WHEN cleanup runs the AuthzSeed cleanup helper
- THEN Store, StoreUser, Owner, and User rows are removed in FK-safe order

> **Delivery note (2026-08-13)**: ADDED by change `login-wrapped-dek` — new
> `AuthLoginDekWrapTests.cs` (6 facts) covering wrapped-DEK delivery on login,
> byte-compatible with the roster wrap; purely additive (new file only, no
> existing E2E test or support file modified).

## Verification Criteria

- [x] New `[Fact]` `Login_with_inactive_store_returns_403` present in `AuthLoginFailureTests.cs`, ADD-ONLY (+21/-0) — commit `c7cb8cee`; existing Facts untouched
- [x] Filtered run `FullyQualifiedName~AuthLoginFailureTests`: 3/3 passed against real PostgreSQL `smca_test`
- [x] Auth regression filter `FullyQualifiedName~Auth`: 69/69 passed, no regression
- [x] Server log confirms the `store.IsActive == false` branch was exercised (`Store.Inactive` error, "no active store")
- [x] Requirement 2 (StoreUser sibling): DELIVERED by change `e2e-b3-auth-login-roundtrip` (new `AuthLoginStoreUserTests.cs`, 1 positive + 2 negatives) — verification run pending in that change's sdd-verify
