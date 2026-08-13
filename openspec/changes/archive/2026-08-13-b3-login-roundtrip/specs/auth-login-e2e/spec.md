# Delta for auth-login-e2e

**Change**: `b3-login-roundtrip`
**Coverage-only delta.** B-3 roundtrips were DELIVERED by archived change
`e2e-b3-auth-login-roundtrip` (2026-08-09, PASS). Extends the StoreUser login
roundtrip requirement with the two residual `HasActiveStore` branches — branch 1
(role-only StoreUser, no `StoreUser` row), branch 2 (`StoreUser.IsActive == false`)
— plus the plan-doc deliverable (`plan-backend.md` B-3 → DELIVERED). NO new
behavior, NO production code, NO existing-E2E edits.

**Scope rule — carried verbatim**: "In this backend test-coverage work, the agent
may only ADD new E2E tests. If the work would require modifying production source
code or existing E2E tests (backend), the agent MUST stop and notify the user for
review and approval before touching anything."

## ADDED Requirements

### Requirement: E2E plan doc — B-3 states DELIVERED

`docs/testing/e2e-stage-1/plan-backend.md` B-3 MUST be corrected (doc-only) so its
coverage table states StoreUser and ReSeller real-login roundtrips as DELIVERED
(change `e2e-b3-auth-login-roundtrip`, 2026-08-09) and notes the StoreUser branch
1/2 residuals now pinned by this change. No production code and no existing E2E
test MUST be touched.

#### Scenario: B-3 table is truthful about delivered personas

- GIVEN `plan-backend.md` B-3 lines 106-111 currently list StoreUser and ReSeller as "falta"
- WHEN the doc is updated per this change
- THEN the table states StoreUser and ReSeller DELIVERED and notes the StoreUser branch 1/2 residual pins

## MODIFIED Requirements

### Requirement: E2E coverage — StoreUser login roundtrip

The E2E suite MUST include an `AuthLoginStoreUserTests` class covering the
StoreUser persona branch (`AuthenticationService.cs:125-144`) over HTTP: a
StoreUser with an active store MUST receive HTTP 200 with `Succeeded == true`
and a non-empty `Data.AuthToken`; a StoreUser whose store — or whose store's
owner — is deactivated MUST receive HTTP 403, `Succeeded == false`, and exactly
one error whose `Code == "Store.Inactive"`; a user with the StoreUser role but
NO `StoreUser` row (branch 1) and a StoreUser whose row has `IsActive == false`
(branch 2) MUST likewise receive HTTP 403 with exactly one error whose
`Code == "Store.Inactive"`. Tests MUST be purely additive: existing tests MUST
NOT be modified, no production code changed.
(Previously: covered active-store 200 and deactivated-store/deactivated-owner 403; branches 1-2 unpinned over HTTP.)

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

#### Scenario: Role-only StoreUser is rejected with 403 `Store.Inactive` (branch 1)

- GIVEN a user with the StoreUser role (3) seeded via `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.StoreUser)` and NO `StoreUser` row (no store graph)
- WHEN `POST /api/v1/auth/login` is called with the user's credentials
- THEN the response is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"` — NOT `Auth.AccountInactive` (the user row is active), pinning `storeUser is null` (`AuthenticationService.cs:126-127`)
- AND the test documents this as the intentional blind-zone contract (mirroring the ReSeller role-only pin D6) and cleans up the seeded user only

#### Scenario: StoreUser with inactive row is rejected with 403 `Store.Inactive` (branch 2)

- GIVEN a StoreUser seeded via `AuthzSeed.SeedStoreUserAsync` whose `StoreUser.IsActive` is set to `false` via a NoTracking-safe tracked update / `ExecuteUpdateAsync` (mirroring `DbTestHelpers.DeactivateOwnerByUserIdAsync`)
- WHEN `POST /api/v1/auth/login` is called with the StoreUser's credentials
- THEN the response is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"` — NOT `Auth.AccountInactive` (the user row stays active), pinning `!storeUser.IsActive` (`AuthenticationService.cs:129-130`)
- AND cleanup removes the full store graph via `AuthzSeed.CleanupStoreGraphAsync` with both user ids

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
- ReSeller work: persona complete (`AuthLoginReSellerTests.cs`).
- Branches 3/5 of `HasActiveStore` (Store null, Owner null): DB-impossible (FK-required) — no test.
- Rate-limit 429 and refresh-token lifecycle assertions.