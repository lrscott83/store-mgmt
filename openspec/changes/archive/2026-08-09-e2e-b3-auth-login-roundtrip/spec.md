# Delta for e2e-b3-auth-login-roundtrip

**Coverage-only delta.** This change adds NEW E2E tests only — NO new behavior,
NO modified behavior: the ReSeller short-circuit (`AuthenticationService.cs:68-77`)
bypasses `HasActiveStore`, and the StoreUser branch (`:125-144`) rejects with 403
`Store.Inactive` when any of its six conditions fails. Requirements below describe
new test coverage, not new product capabilities.

**Scope rule — carried verbatim**: "In this backend test-coverage work, the
agent may ONLY ADD new E2E tests. If the work would require modifying production
source code or existing E2E tests (backend), the agent MUST stop and report
instead of touching anything."

Domains: `auth-login-e2e` (MODIFIED — fulfills archived OPTIONAL Req 2); `auth-login-reseller-e2e` (ADDED).

## ADDED Requirements

### Requirement: E2E coverage — ReSeller login roundtrip

The E2E suite MUST include new tests in
`backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginReSellerTests.cs` covering the
ReSeller short-circuit over HTTP: positive login, inactive `ReSeller` row, and
the role-only blind-zone pin.

#### Scenario: Active ReSeller logs in with no store graph

- GIVEN an active user with a correct Argon2 hash, UserRole ReSeller (4), and a `ReSeller` row (IsActive defaults true), no Store/StoreUser/Owner rows
- WHEN `POST /api/v1/auth/login` is called with the user's credentials
- THEN the response is HTTP 200 with `Succeeded == true` and `Data.AuthToken` non-empty
- AND `Data.Login` matches the seeded login and `Errors` is empty

#### Scenario: Inactive ReSeller row returns 403 `Auth.AccountInactive`

- GIVEN the same seed with `ReSeller.IsActive == false`
- WHEN login is attempted
- THEN the response is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Auth.AccountInactive"` — NOT `Store.Inactive`, proving the short-circuit fires before store checks

#### Scenario: Role-only ReSeller returns 403 `Store.Inactive` (blind-zone pin)

- GIVEN a user with UserRole ReSeller (4) seeded via the `SeedUserWithRoleAsync` shape and NO `ReSeller` row
- WHEN login is attempted
- THEN the response is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"` — not `Auth.AccountInactive` (the user is active)
- AND the test name/comment document this as the INTENTIONAL contract so a future "fix" is flagged, not silently absorbed

## MODIFIED Requirements

### Requirement: E2E coverage — StoreUser login roundtrip

The E2E suite MUST include new tests in
`backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` covering the
StoreUser branch (`AuthenticationService.cs:125-144`) over HTTP: positive login,
deactivated-store rejection, and deactivated-store-owner rejection. Tests MUST
be purely additive.
(Previously: OPTIONAL sibling in `auth-login-e2e` Req 2, archived 2026-08-06 as NOT delivered.)

#### Scenario: StoreUser logs in to an active store

- GIVEN a StoreUser seeded via `AuthzSeed.SeedStoreUserAsync` with an active Store and an active store Owner (a different user)
- WHEN `POST /api/v1/auth/login` is called with the StoreUser's credentials
- THEN the response is HTTP 200 with `Succeeded == true` and `Data.AuthToken` non-empty
- AND `Data.Login` matches the seeded login

#### Scenario: StoreUser logs in to a deactivated store

- GIVEN the same StoreUser graph with the store deactivated via `StoreSeed.DeactivateStoreAsync`
- WHEN login is attempted
- THEN the response is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"` — NOT `Auth.AccountInactive` (the user row stays active)

#### Scenario: StoreUser logs in when the store's owner is deactivated

- GIVEN the same StoreUser graph with the store's own Owner deactivated
- WHEN login is attempted
- THEN the response is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"`, pinning the `!owner.IsActive` branch of the six-condition chain

#### Scenario: Cleanup removes the full store graph

- GIVEN any StoreUser test completes
- WHEN cleanup runs `AuthzSeed.CleanupStoreGraphAsync(fixture.StoreId, fixture.UserId)`
- THEN Store, StoreUser, Owner, and User rows are removed in FK-safe order

## REMOVED Requirements

None.

## RENAMED Requirements

None.

## Non-Goals (explicit)

- Production code and existing E2E tests: untouched (CLAUDE.md rule, above).
- Shared-helper refactor of ReSeller seeding (`ToCollectTests` pattern, stays local).
- Re-pinning the >=8 existing role-only MintToken tests.
- Rate-limit 429 and refresh-token lifecycle assertions.