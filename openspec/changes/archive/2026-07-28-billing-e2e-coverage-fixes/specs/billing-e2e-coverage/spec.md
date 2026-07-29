# billing-e2e-coverage Specification

**Purpose**: End-to-end coverage for all 7 billing-affected endpoints across 4 categories per endpoint: HappyPath, EdgeCase, ErrorHandling, Integration. Tests MUST pin the clock through `MutableDateTimeProvider` and seed via `BillingSeed`. No production behavior changes.

## Test Infrastructure

### R1: Mutable Test Clock

The system MUST provide `MutableDateTimeProvider` (implements `Application.Abstractions.Time.IDateTimeProvider`) in `E2ETests`. It SHALL default to real time and expose `Pin(DateTimeOffset)` returning `IDisposable` that restores the clock on dispose. Registered in `AppTestFactory.ConfigureWebHost` via `ConfigureTestServices` (must be added from scratch — currently only `ConfigureAppConfiguration` exists), exposed on `WebAppFixture` as `Clock`.

### R2: BillingSeed Helper

The system MUST provide `BillingSeed` with intent-revealing factory methods: `SeedFreeStoreAsync`, `SeedPaidStoreAsync(paymentStartDate)`, `SeedPaidStoreWithReSellerAsync(...)`, `SeedPaymentAsync(...)`, `CleanupAsync(seeded)`. Named for the billing state they produce, not for their parameters.

## E2E Coverage Requirements

### R3: GET /auth/me — 3 new billing states

Existing coverage: `Vencido` excludes paid modules, `AlDia` includes all. This change adds:

#### Scenario: Free store (null start)
- GIVEN a store with `PaymentStartDate = null` and only free modules
- WHEN `GET /auth/me`
- THEN `PaymentStatus` SHALL be `"NoAplica"`, `PaymentDueDate` SHALL be null, all modules returned, no crash

#### Scenario: PorVencer
- GIVEN clock pinned to PorVencer window (due -5 to due day)
- WHEN `GET /auth/me`
- THEN status SHALL be `"PorVencer"`, all modules included

#### Scenario: EnGracia
- GIVEN clock pinned to EnGracia window (due to due+5)
- WHEN `GET /auth/me`
- THEN status SHALL be `"EnGracia"`, all modules included

### R4: PUT /stores/{id}/payment-date — 4 categories

#### Scenario: ReSeller rejected
- GIVEN an authenticated ReSeller user
- WHEN `PUT /stores/{id}/payment-date`
- THEN 403

#### Scenario: Unknown store returns 400
- GIVEN non-existent store id
- THEN 400

#### Scenario: Empty StoreId returns 400 code StoreId
- GIVEN `Guid.Empty` as route id
- THEN 400 with error code `StoreId`

#### Scenario: Missing PaymentStartDate returns 400
- GIVEN body without `PaymentStartDate`
- THEN 400 with error code `PaymentStartDate`

### R5: POST /stores/{id}/payments — 4 categories

#### Scenario: SuperAdmin pays any store
- GIVEN SuperAdmin user
- WHEN POST to any known store
- THEN 200, `StorePayment` persisted

#### Scenario: Unauthenticated
- GIVEN no auth header
- THEN 401

#### Scenario: OwnerAdmin role rejected
- GIVEN an OwnerAdmin user (not SuperAdmin, not ReSeller)
- THEN 403

#### Scenario: Store with null PaymentStartDate
- GIVEN a store with `PaymentStartDate = null`
- THEN 400

#### Scenario: Amount equals module sum
- GIVEN 1 paid module at price 1000
- WHEN payment recorded
- THEN `StorePayment.Price` = 1000

#### Scenario: Reseller commission persisted
- GIVEN reseller at 15% on 1000 amount
- THEN `ReSellerAmount` = 150

### R6: GET /stores/to-collect — 4 categories

#### Scenario: ReSeller sees own stores
- GIVEN stores from multiple resellers
- WHEN ReSeller queries
- THEN only reseller-owned stores returned

#### Scenario: AlDia excluded
- GIVEN AlDia and PorVencer stores
- THEN AlDia NOT in results

#### Scenario: Vencido excluded
- GIVEN Vencido stores
- THEN Vencido NOT in results

#### Scenario: PorVencer and EnGracia included
- GIVEN stores with those statuses
- THEN both included

#### Scenario: Role rejection
- GIVEN non-SuperAdmin/non-ReSeller
- THEN 403

### R7: GET /stores/reseller-commissions — 4 categories

#### Scenario: SuperAdmin sees all
- GIVEN payments from multiple resellers
- WHEN SuperAdmin queries
- THEN all commission groups returned

#### Scenario: Unauthenticated
- GIVEN no auth header
- THEN 401

#### Scenario: Role rejection
- GIVEN non-SuperAdmin/non-ReSeller
- THEN 403

### R8: PUT /stores/{id} — Activation on first paid

#### Scenario: Paid module on null start sets PaymentStartDate = today
- GIVEN store with `PaymentStartDate = null`
- WHEN a paid (non-PriceIncluded) module is assigned
- THEN `PaymentStartDate` SHALL be set to today (via clock)

#### Scenario: Free modules only leaves null
- GIVEN store with `PaymentStartDate = null`
- WHEN only free modules assigned
- THEN `PaymentStartDate` SHALL remain null

#### Scenario: Existing PaymentStartDate unchanged
- GIVEN store with `PaymentStartDate = 2026-01-10`
- WHEN adding more modules
- THEN `PaymentStartDate` SHALL not change

### R9: POST /features/activate — Statistics price assertion

#### Scenario: Statistics module price is 1000
- GIVEN the Features/activate flow
- THEN the Statistics module `Price` field SHALL be exactly 1000
