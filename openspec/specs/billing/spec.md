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

## Requirements

### R1: Billing Status State Machine

The system MUST compute `StoreBillingStatusType` from `(paymentStartDate, nextDueDate, today, dueSoonDays, graceDays)`.

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

<!-- R3 removed: StoreBillingService/IStoreBillingService dead code deleted -->

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
