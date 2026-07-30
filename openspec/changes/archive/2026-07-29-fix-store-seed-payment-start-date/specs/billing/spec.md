# Delta for billing

## MODIFIED Requirements

### Requirement: StoreDto.PaymentStartDate MUST Be Nullable

The system MUST expose `StoreDto.PaymentStartDate` as `DateOnly?` (nullable).
(Previously: `DateOnly` non-nullable — free stores returned sentinel `0001-01-01`.)

When a free store is returned via the API, `PaymentStartDate` SHALL be `null`.
When a paid store is returned, `PaymentStartDate` SHALL be the actual date.

#### Scenario: Get store by ID (free store)

- GIVEN a store with no payment start date (free store)
- WHEN `GET /stores/{id}` is called
- THEN response `paymentStartDate` is `null`

#### Scenario: Get store by ID (paid store)

- GIVEN a store with `PaymentStartDate = 2026-03-10`
- WHEN `GET /stores/{id}` is called
- THEN response `paymentStartDate` is `"2026-03-10"`

## ADDED Requirements

### Requirement: Store Seed MUST NOT Set PaymentStartDate for Free Stores

`StoreSeed.SeedStoreAsync`, `SeedStoresAdminUserAsync`, and
`SeedStoreInNewTenantAsync` MUST NOT pass a `paymentStartDate` argument when
creating stores that have no payment parameters.

`Store.Create(…)`'s `paymentStartDate` parameter defaults to `null`, so the
callers simply drop the `DateOnly.FromDateTime(DateTime.UtcNow)` argument.

#### Scenario: Seed free store

- GIVEN `StoreSeed.SeedStoreAsync` is called with no payment parameters
- WHEN a store is created
- THEN its `PaymentStartDate` is `null`

#### Scenario: Seed store with admin user

- GIVEN `StoreSeed.SeedStoresAdminUserAsync` is called with no payment params
- WHEN a store is created
- THEN its `PaymentStartDate` is `null`

#### Scenario: Seed store in new tenant

- GIVEN `StoreSeed.SeedStoreInNewTenantAsync` is called with no payment params
- WHEN a store is created
- THEN its `PaymentStartDate` is `null`

### Requirement: Regression — All Existing Tests MUST Pass

All billing E2E tests (31 tests via `BillingSeed`), store CRUD E2E tests (via
`StoreSeed`), and solution-wide unit tests MUST remain green after the seed and
DTO changes.

#### Scenario: Billing E2E tests pass

- GIVEN the billing E2E test suite (31 tests)
- WHEN the seed and DTO changes are applied
- THEN all billing E2E tests pass

#### Scenario: Store CRUD E2E tests pass

- GIVEN the store CRUD E2E test suite
- WHEN the changes are applied
- THEN all store CRUD E2E tests pass

#### Scenario: Unit tests pass

- GIVEN all unit tests in the solution
- WHEN the changes are applied
- THEN all unit tests pass
