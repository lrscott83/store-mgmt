# Delta for users-e2e

Delta for change `e2e-stage-1-s3-03`. Extends the users-e2e enforcement window with 2 ADDED requirements that pin the tenant-isolation invariant on `PUT /v1/users/{id}` (H-11). No product behavior is added or modified — the requirements describe E2E coverage of existing behavior.

## ADDED Requirements

### Requirement: E2E-I1: Cross-tenant PUT /v1/users/{id} returns envelope 404 and does not write

The system MUST document via an E2E test that an OwnerAdmin caller from the default tenant updating a user whose `TenantId` differs from the caller's receives HTTP 200 (controller always `Ok`) with envelope `Succeeded=false`, `ActionCode=404`, error code `User.NotFound`, and NO DB write (target `FullName` unchanged).

(Documented-RED note: this invariant was expected to fail today because `UpdateUserCommand` resolves via `FindAsync` (`GenericRepository.cs:82-85`), which was believed to skip the tenant query filter. Evidence on EF Core 8.0.1 shows `FindAsync` DOES apply the tenant query filter on this path, so the test passes on the invariant and now guards the regression. Coupling: if the user lookup is ever switched to `IgnoreQueryFilters`, E2E-I1 flips RED and MUST be fixed in the same change as the defect.)

#### Scenario: OwnerAdmin updates a user in another tenant

- GIVEN an authenticated OwnerAdmin caller in the default tenant
- AND a victim user seeded in a custom tenant (`TenantId` differs from the caller's)
- WHEN the OwnerAdmin sends PUT /v1/users/{victimId} with a new FullName
- THEN the response MUST be HTTP 200 with envelope Succeeded=false
- AND ActionCode MUST be 404
- AND Errors MUST contain the User.NotFound code
- AND the victim's FullName MUST NOT be written to the database

### Requirement: E2E-I2: Same-tenant cross-store PUT /v1/users/{id} returns 200 and persists

The system MUST document via an E2E test that an OwnerAdmin caller CAN update a user in a DIFFERENT store of the SAME tenant: HTTP 200 + envelope `Succeeded=true` + the DB write persists (target `FullName` changed). Isolation on `PUT /v1/users/{id}` is tenant-only, NOT store-level.

(Coupling: a future tenant-scope guard MUST mirror `UpdateUserPasswordCommand.cs:62-64` (TenantId-only) and MUST NOT block this legit same-tenant path.)

#### Scenario: OwnerAdmin updates a user in another store of the same tenant

- GIVEN an authenticated OwnerAdmin caller in the default tenant with a Management store (Store A)
- AND a target StoreUser in the same default tenant with a different store (Store B)
- WHEN the OwnerAdmin sends PUT /v1/users/{targetId} with a new FullName
- THEN the response MUST be HTTP 200 with envelope Succeeded=true
- AND the target's FullName MUST be persisted in the database

## Assert Style

Status code + envelope structure + stable `Code` keys only. NEVER assert localized `Description` (culture coupling). DB asserts via `DbTestHelpers.GetUserByLoginAsync` (`IgnoreQueryFilters`).

## Verification Criteria

- [x] Test 1 GREEN on the invariant (documented-RED premise invalidated by evidence: `FindAsync` applies the tenant query filter on EF Core 8.0.1)
- [x] Test 2 GREEN; same-tenant cross-store PUT returns 200 and persists
- [x] Verify report records the documented PASS (invariant holds); change not blocked
- [x] Zero edits to existing E2E tests; zero production code changes
