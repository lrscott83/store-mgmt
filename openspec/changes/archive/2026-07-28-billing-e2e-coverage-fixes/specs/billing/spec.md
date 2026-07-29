# Delta for billing

Delta against `openspec/specs/billing/spec.md`. Null is the domain model for "billing clock never started" — every change pushes magic dates toward `null`.

## ADDED Requirements

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

## MODIFIED Requirements

### R1: Billing Status State Machine (nullable signatures)

`GetStatus` MUST accept `DateOnly?` for both `paymentStartDate` and `nextDueDate`. When either is `null`, result SHALL be `NoAplica`. (Previously: non-nullable `DateOnly`.)

`IsPaidPlanActive` MUST also change `nextDueDate` from `DateOnly` to `DateOnly?`. Not used in production code — only in 3 existing `StoreBillingUtilsTests` — so the change is safe and isolated to tests.

#### Scenario: Null start is NoAplica
- GIVEN `paymentStartDate = null`, `nextDueDate = null`
- WHEN computing status
- THEN result SHALL be `NoAplica`

### R2.2: GetNextDueDate (nullable return)

`GetNextDueDate` MUST accept `DateOnly? paymentStartDate` and return `DateOnly?`.

| Condition | Result |
|-----------|--------|
| `paymentStartDate is null` | `null` |
| `lastPaidBeforeDate` is set | `lastPaidBeforeDate` |
| Has start, no lastPaid | `paymentStartDate.AddMonths(trialMonths + 1)` |

(Previously: accepted `DateOnly`, returned `DateOnly`, substituted magic dates.)

#### Scenario: Null start returns null
- GIVEN `paymentStartDate = null`, `trialMonths = 1`, `lastPaidBeforeDate = null`
- THEN result SHALL be `null`

### R2.4: GetNextDueDate month-end clamping
- GIVEN `paymentStartDate = 2026-01-31`, `trialMonths = 0`, `lastPaidBeforeDate = null`
- THEN result SHALL be `2026-02-28` (clamped to shorter month)

## REMOVED Requirements

### R3: StoreBillingService / IStoreBillingService

(Reason: `RecordManualPaymentAsync` duplicates `RegisterStorePaymentCommandHandler` while omitting the reseller-ownership guard and the +1 month due-date advance. Registered in DI but injected nowhere.)
