# Billing Specification

## Purpose

Per-store paid-plan lifecycle: plan activation (owner, once), manual payment recording (super admin / ReSeller), compute-on-read overdue downgrade, collections & commission queries. No background jobs, no payment gateway.

## Domain Model

### `Store.PaymentStartDate` (modified)

| Aspect | Rule |
|--------|------|
| Type | `DateOnly?` (nullable) — `null` = never activated paid plan |
| Activation | Set to `DateOnly.FromDateTime(DateTime.UtcNow)` on first paid-module add while `null` |
| Lock | Once non-null, OwnerAdmin cannot change modules (plan is locked). SuperAdmin retains full edit. |
| Migration | Existing rows keep value (treated as activated). Alter column to nullable. |

### `StorePayment` (extended)

| Field | Type | Notes |
|-------|------|-------|
| `ReSellerId` | `Guid?` | Gestor at payment time; `null` = no commission |
| `ReSellerPercentDiscountPrice` | `float` | Snapshot of Gestor percent |
| `ReSellerDiscountPrice` | `float` | Snapshot of Gestor flat discount |
| `ReSellerAmount` | `float` | Computed commission |
| `ByReSeller` | `bool` | `true` if ReSeller recorded the payment |

### `SystemConfigurationType.PaymentGraceDays`

| Property | Value |
|----------|-------|
| Enum id | `3` |
| Seed value | `"5"` |
| Accessor | `GetPaymentGraceDaysAsync()` returning `int` (fallback `5`) |

### `SystemConfigurationType.DueSoonDays`

| Property | Value |
|----------|-------|
| Enum id | `4` |
| Default value | `"5"` (fallback when no row exists) |
| Accessor | `GetDueSoonDaysAsync()` returning `Task<int>` (fallback `5`) |

## Requirements

### R1: Billing Status State Machine

The system MUST compute `StoreBillingStatusType` from `(paymentStartDate, nextDueDate, today, dueSoonDays, graceDays)`. The `dueSoonDays` value SHALL be obtained from `ISystemConfigurationRepository.GetDueSoonDaysAsync()` (default `5`), replacing the previously hardcoded literal `5`.

| Status | Condition |
|--------|-----------|
| `NoAplica` | `paymentStartDate is null` |
| `AlDia` | `today < nextDueDate - dueSoonDays` |
| `PorVencer` | `nextDueDate - dueSoonDays <= today <= nextDueDate` |
| `EnGracia` | `nextDueDate < today <= nextDueDate + graceDays` |
| `Vencido` | `today > nextDueDate + graceDays` |

#### Scenario: Full status progression

- GIVEN `paymentStartDate = 2026-01-10`, `nextDueDate = 2026-03-10`, `dueSoonDays = 5`, `graceDays = 5`
- WHEN `today = 2026-03-04` THEN status is `AlDia`
- WHEN `today = 2026-03-05` THEN status is `PorVencer`
- WHEN `today = 2026-03-10` THEN status is `PorVencer`
- WHEN `today = 2026-03-11` THEN status is `EnGracia`
- WHEN `today = 2026-03-16` THEN status is `Vencido`

#### Scenario: No plan

- GIVEN `paymentStartDate = null`, any `nextDueDate`
- WHEN computing status THEN result is `NoAplica`

### R2: Billing Math — Pure Utils

The system MUST provide pure static methods in `StoreBillingUtils`.

#### R2.1: Commission

`GetReSellerCommission(amount, percent, flat)` = `amount - GetCurrentPrice(amount, percent, flat)`.

#### Scenario: With percent discount

- GIVEN `amount = 2000`, `percent = 25`, `flat = 0`
- WHEN computing commission THEN result SHALL be `500`

#### Scenario: No reseller

- GIVEN `amount = 1000`, `percent = 0`, `flat = 0`
- WHEN computing commission THEN result SHALL be `0`

#### R2.2: Next due date (nullable)

`GetNextDueDate(paymentStartDate, trialMonths, lastPaidBeforeDate)` accepts `DateOnly? paymentStartDate` and returns `DateOnly?`.

| Condition | Result |
|-----------|--------|
| `paymentStartDate is null` | `null` |
| `lastPaidBeforeDate` is set | `lastPaidBeforeDate` |
| Has start, no lastPaid | `paymentStartDate.AddMonths(trialMonths + 1)` |

#### Scenario: No payments

- GIVEN `paymentStartDate = 2026-01-10`, `trialMonths = 1`, `lastPaidBeforeDate = null`
- WHEN computing next due THEN result SHALL be `2026-03-10`

#### Scenario: Null start returns null

- GIVEN `paymentStartDate = null`, `trialMonths = 1`, `lastPaidBeforeDate = null`
- THEN result SHALL be `null`

#### Scenario: Month-end clamping

- GIVEN `paymentStartDate = 2026-01-31`, `trialMonths = 0`, `lastPaidBeforeDate = null`
- THEN result SHALL be `2026-02-28` (clamped to shorter month)

#### R2.3: Paid plan active check

`IsPaidPlanActive(startDate, nextDue, today, graceDays)` = `startDate != null && today <= nextDue + graceDays`.

#### Scenario: Within grace

- GIVEN `nextDue = 2026-03-10`, `today = 2026-03-15`, `graceDays = 5`
- THEN `IsPaidPlanActive` SHALL be `true`

#### Scenario: Grace expired

- GIVEN `today = 2026-03-16`
- THEN `IsPaidPlanActive` SHALL be `false`

#### R2.4: Trial check

`IsInTrial(startDate, trialMonths, today)` = `startDate != null && today <= startDate + trialMonths`.

#### Scenario: Within trial

- GIVEN `startDate = 2026-01-10`, `trialMonths = 1`, `today = 2026-02-05`
- THEN `IsInTrial` SHALL be `true`

### R2.5: StoreBillingSummary MUST expose `IsInTrial`

`Domain/Entities/Billing/StoreBillingSummary.cs` SHALL add a `bool IsInTrial { get; init; }` property.

This makes `IsInTrial` a first-class field of the billing summary contract, eliminating the need for consumers to compute it independently with hardcoded or duplicated logic.

#### Scenario: Summary carries IsInTrial

- GIVEN a `StoreBillingSummary` is constructed with `IsInTrial = true`
- WHEN the property is read
- THEN it SHALL be `true`

### R2.6: BillingService MUST compute `IsInTrial` canonically

`BillingService.GetStoreBillingSummaryAsync()` SHALL compute `IsInTrial` using:

```
StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today)
```

The `trialMonths` and `today` variables already present in the method SHALL be reused — no new config reads or clock calls.

#### Scenario: BillingService computes IsInTrial

- GIVEN `store.PaymentStartDate = 2026-01-10`, `trialMonths = 1`, `today = 2026-02-05`
- WHEN `GetStoreBillingSummaryAsync` is called
- THEN `IsInTrial` SHALL be `true`

### R2.7: GetMeQueryHandler MUST consume `billing.IsInTrial`

`GetMeQueryHandler.Handle()` SHALL use `billing.IsInTrial` from `StoreBillingSummary` instead of computing inline with a hardcoded `AddMonths(1) >= today`.

#### Scenario: GetMe reads IsInTrial from billing summary

- GIVEN a store in trial (`billing.IsInTrial = true`)
- WHEN `GetMe` is called
- THEN `CurrentUserDto.IsInTrial` SHALL be `true`

### R2.8: All billing states MUST report correct `isInTrial`

The `IsInTrial` value SHALL be consistent with `StoreBillingUtils.IsInTrial` across all states:

| `PaymentStartDate` | Condition | `IsInTrial` |
|---|---|---|
| `null` | N/A | `false` |
| Non-null | `today <= startDate + trialMonths` | `true` |
| Non-null | `today > startDate + trialMonths` | `false` |

#### Scenario: Free store (null PaymentStartDate)

- GIVEN `PaymentStartDate = null`
- WHEN computing billing summary
- THEN `IsInTrial` SHALL be `false` AND `Status` SHALL be `NoAplica`

#### Scenario: Store within trial period

- GIVEN `PaymentStartDate = 2026-01-10`, `TestingPeriodInMonths = 1`, `today = 2026-02-05`
- THEN `IsInTrial` SHALL be `true`

#### Scenario: Store past trial period

- GIVEN `PaymentStartDate = 2026-01-10`, `TestingPeriodInMonths = 1`, `today = 2026-02-20`
- THEN `IsInTrial` SHALL be `false`

### R3: Configurable DueSoonDays

The system MUST expose `DueSoonDays` as a configurable `SystemConfigurationType` entry with a database-backed repository accessor, replacing the current hardcoded `5`.

#### R3.1: SystemConfigurationType.DueSoonDays

`SystemConfigurationType` MUST add `DueSoonDays = 4`.

| Property | Value |
|----------|-------|
| Enum id | `4` |
| Default | `5` (returned when no row exists) |
| Accessor | `GetDueSoonDaysAsync()` returning `Task<int>` |

#### R3.2: ISystemConfigurationRepository.GetDueSoonDaysAsync()

`ISystemConfigurationRepository` MUST declare `Task<int> GetDueSoonDaysAsync()`.

#### R3.3: SystemConfigurationRepository.GetDueSoonDaysAsync()

`SystemConfigurationRepository` MUST implement `GetDueSoonDaysAsync()` returning `FirstOrDefaultAsync(c => c.Id == 4)?.Value ?? 5`.

#### R3.4: BillingService consumption

`BillingService.GetStoreBillingSummaryAsync()` MUST call `GetDueSoonDaysAsync()` instead of using the hardcoded literal `5` for the `dueSoonDays` parameter passed to `StoreBillingUtils.GetBillingStatus()`.

#### R3.5: GetStoresToCollectQueryHandler consumption

`GetStoresToCollectQueryHandler` MUST read `DueSoonDays` from the repository (via `ISystemConfigurationRepository`) instead of the hardcoded `5`.

#### Scenario: DueSoonDays=5 (default) — backward compatible

- GIVEN no `SystemConfiguration` row with `Id == 4` exists
- WHEN `GetDueSoonDaysAsync()` is called
- THEN it SHALL return `5`
- AND billing status computation behaves identically to today's hardcoded behavior

#### Scenario: DueSoonDays configured via database

- GIVEN a `SystemConfiguration` row with `Id == 4` and `Value == "7"`
- WHEN `GetDueSoonDaysAsync()` is called
- THEN it SHALL return `7`
- AND `PorVencer` window shifts accordingly (wider by 2 days)

#### Scenario: BillingService test uses mock

- GIVEN `BillingService` constructed with a mock `ISystemConfigurationRepository`
- WHEN `GetStoreBillingSummaryAsync` is invoked
- THEN the mock's `GetDueSoonDaysAsync()` SHALL be called and its return value used

#### Scenario: GetStoresToCollect test uses mock

- GIVEN `GetStoresToCollectQueryHandler` with a mock `ISystemConfigurationRepository`
- WHEN the handler filters stores by status
- THEN the mock's `GetDueSoonDaysAsync()` SHALL be called

### R4: Enforcement — Overdue Downgrade

The system MUST exclude non-free (paid) modules from entitlement when the store is overdue.

| Enforcement point | Behavior |
|-------------------|----------|
| `GetMeQueryHandler` | `FilterForBilling(modules, isPaidPlanActive)` — when inactive, keep only `PriceIncluded` modules |
| `HasPermissionAttribute` | Mirror filter using `IsPaidPlanActiveAsync().Result` |

`CurrentUserDto` MUST expose new fields: `PaymentDueDate` (`DateOnly?`), `IsInTrial` (`bool`), `PaymentStatus` (`string`).

#### Scenario: Overdue store → free downgrade

- GIVEN store has one free module (id=20) and one paid module (id=60), and billing says `IsPaidPlanActive = false`
- WHEN `FilterForBilling` is applied
- THEN `StoreModuleIds` SHALL contain only `[20]`

#### Scenario: Paid store → full access

- GIVEN `IsPaidPlanActive = true`
- WHEN `FilterForBilling` is applied
- THEN all modules SHALL be returned unchanged

### R5: RegisterStorePayment

The system MUST provide `POST /stores/{storeId}/payments` for recording manual payments.

| Aspect | Rule |
|--------|------|
| Authorization | SuperAdmin (any store) or ReSeller (own stores via `ReSellerOwner`) |
| Guard: never activated | `PaymentStartDate is null` → reject |
| Guard: reseller not owner | `IsStoreOwnedByReSellerUserAsync` false → reject |
| Amount | Sum of `GetCurrentPrice` for all active, non-`PriceIncluded` `StoreModules` |
| Commission | Compute via `GetReSellerCommission` from `ReSellerOwner` snapshot (zero if no reseller) |
| Due advance | `newDueDate = currentNextDue + 1 month` |
| `StorePayment` created | Status `Paid` (5), `PaidDate = UtcNow`, all reseller snapshots, `ByReSeller = (caller is ReSeller)` |

#### Scenario: Super admin records payment (no reseller)

- GIVEN store with no reseller, active paid modules totaling 2000
- WHEN super admin posts payment
- THEN `StorePayment` is created with `Price=2000`, `ReSellerId=null`, `ReSellerAmount=0`, `ByReSeller=false`

#### Scenario: ReSeller records payment with commission

- GIVEN store's owner has `ReSellerOwner` with `PercentDiscountPrice=25`, amount=2000
- WHEN ReSeller posts payment
- THEN `ReSellerAmount = 500`, `ByReSeller = true`, `ReSellerId` is set

#### Scenario: ReSeller not owning store

- GIVEN ReSeller posts payment for a store not linked to them
- THEN system SHALL reject with error

### R6: GetStoresToCollect

The system MUST provide `GET /stores/to-collect` returning stores with `PorVencer` or `EnGracia` status.

| Scope | Behavior |
|-------|----------|
| SuperAdmin | All stores with paid plan |
| ReSeller | Only stores whose owner belongs to them |

`StoreToCollectDto`: `StoreId`, `StoreName`, `OwnerName`, `Amount` (paid-module total), `NextDueDate`, `Status`.

#### Scenario: Filtered collection

- GIVEN two stores (one `PorVencer`, one `AlDia`)
- WHEN calling `GetStoresToCollect`
- THEN only the `PorVencer` store SHALL be returned

#### Scenario: Scoped by reseller

- GIVEN a ReSeller queries collections
- WHEN the store list includes stores from other resellers
- THEN only their own stores SHALL appear

### R7: GetReSellerCommissions

The system MUST provide `GET /stores/reseller-commissions` returning commissions grouped by year/month.

| Field | Source |
|-------|--------|
| `Year`, `Month` | Payment period |
| `PaymentCount` | Count of paid rows |
| `TotalCommission` | Sum of `ReSellerAmount` |

| Scope | Behavior |
|-------|----------|
| SuperAdmin | All `StorePayment` with `ReSellerId != null` |
| ReSeller | Only payments where `ReSeller.UserId == caller` |

#### Scenario: Grouped commissions

- GIVEN 3 paid rows: 2 in 2026-05 (commissions 500, 300), 1 in 2026-06 (commission 200)
- WHEN querying commissions
- THEN results SHALL be `{2026,5, count 2, total 800}` and `{2026,6, count 1, total 200}`

### R8: PaymentStartDate Backfill

The system MUST backfill sentinel `0001-01-01` values on `Store.PaymentStartDate` to `NULL` via an EF Core migration. The SQL MUST be defined as a shared constant (`PaymentStartDateBackfill.Sql`), referenced by both the migration `Up()` and its verification test. `Down()` MUST be empty (reverting would reintroduce the sentinel).

#### Scenario: Sentinel converted to null

- GIVEN a Store row with `PaymentStartDate = DATE '0001-01-01'`
- WHEN the backfill SQL executes
- THEN `PaymentStartDate` SHALL be `NULL`

### R9: IDateTimeProvider Clock Injection

The system MUST read the current date through `IDateTimeProvider` in 4 call sites: `BillingService.GetStoreBillingSummaryAsync`, `GetMeQueryHandler`, `GetStoresToCollectQueryHandler`, `UpdateStoreCommandHandler`. (Previously: `DateTime.UtcNow`.)

The interface SHALL reside in `Application.Abstractions.Time`. The `Infrastructure.Interfaces.Services` copy SHALL be deleted.

#### Scenario: BillingService clock-aware status

- GIVEN `BillingService` constructed with clock returning 2026-03-16
- AND a store with `PaymentStartDate = 2026-01-10`, due 2026-03-10, grace 5 days
- WHEN `GetStoreBillingSummaryAsync` is called
- THEN status SHALL be `Vencido`

### R10: RegisterStorePaymentValidator

`POST /stores/{storeId}/payments` MUST validate `StoreId` is not empty via FluentValidation.

#### Scenario: Empty store id

- GIVEN POST to `/stores/{Guid.Empty}/payments`
- THEN response SHALL be 400 with error code `StoreId`

### R11: BillingService Unit Coverage

`BillingService` MUST have unit tests covering: free store (`NoAplica`, no throw), unknown store (`NoAplica`), paid store without payments (amount = sum of module prices), paid store with payment (uses last payment price), reseller commission computation, months-active never negative.

### R12: StoreDto.PaymentStartDate MUST Be Nullable

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

### R13: Store Seed MUST NOT Set PaymentStartDate for Free Stores

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

### R14: Regression — All Existing Tests MUST Pass

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
