# Billing Endpoint Coverage and Fixes — Design

Date: 2026-07-28
Status: approved (pending spec review)
Scope: `backend` — billing endpoints, their tests, and the defects the tests expose.

## Context

The backend recently gained a store billing subsystem: four new endpoints plus billing
enforcement wired into `GET /auth/me`. The existing end-to-end suite covers 8 billing
cases, all of them on stores seeded with `PaymentStartDate = today`. The most common
production shape — a free store that never activated a paid plan, i.e.
`PaymentStartDate = null` — has no test at all.

Two defects live in that untested path. This design covers both the tests and the fixes,
as a single deliverable: every new test that exposes a defect is written red, the defect
is fixed, and the test ends green.

## Scope

In scope (7 endpoints):

| Endpoint | State |
|---|---|
| `PUT /api/v1/stores/{storeId}/payment-date` | new |
| `POST /api/v1/stores/{storeId}/payments` | new |
| `GET /api/v1/stores/to-collect` | new |
| `GET /api/v1/stores/reseller-commissions` | new |
| `GET /api/v1/auth/me` | updated — billing enforcement |
| `PUT /api/v1/stores/{id}` | updated — activation-on-first-paid |
| `POST /api/v1/features/activate` | updated — module/feature seeding |

Out of scope:

- The sweep of the remaining 102 `RuleFor` validation rules across the other 42
  validators. That is a separate spec with its own plan.
- `/api/v1/usages/*` endpoints — not part of billing.
- `DateTime.UtcNow` usages outside billing (`LoginCommand`, `GetStoreLastUsagesQuery`,
  `CreateOwnerService`).

## Findings

### F1 — The nullable migration has no data backfill

Migration `20250116145520_Create-ReSeller-StorePayment-Tables` created
`Store.PaymentStartDate` as `NOT NULL` with `defaultValue: new DateOnly(1, 1, 1)` — a
sentinel, never a real date.

Migration `20260727165912_StorePayment-ReSeller-Commission-Fields` altered the column to
nullable but did not convert existing rows. Every pre-existing store still holds
`0001-01-01`, which is not `null`, so `StoreBillingUtils.GetStatus` classifies it as
`Vencido`, and `GetMeQueryHandler.FilterForBilling` strips every paid module from it.

### F2 — `?? DateOnly.MaxValue` is unrepresentable arithmetic

`BillingService.GetStoreBillingSummaryAsync` and `GetStoresToCollectQueryHandler` pass
`store.PaymentStartDate ?? DateOnly.MaxValue` into
`StoreBillingUtils.GetNextDueDate`, which computes `paymentStartDate.AddMonths(trialMonths + 1)`.
`DateOnly.AddMonths` throws `ArgumentOutOfRangeException` when the result falls outside
the representable range, so a free store with no payments is expected to fail `/auth/me`
with a 500.

This is a hypothesis derived from reading the code, not an observed failure. The first
unit test written under this design confirms or refutes it before any fix is applied.

Root cause of both: `null` is the correct domain model for "the billing clock never
started", but the code repeatedly substitutes a magic date for it.

## Production changes

### C1 — Backfill migration

A new EF migration whose `Up()` runs:

```sql
UPDATE "Store" SET "PaymentStartDate" = NULL WHERE "PaymentStartDate" = DATE '0001-01-01'
```

`Down()` is intentionally empty: reverting would reintroduce the sentinel.

Policy decision: **all** sentinel rows become `null`. No pre-existing store starts
billing automatically. Activating a store for billing is an explicit operator action
through `PUT /stores/{id}/payment-date`. Rationale: a data migration is irreversible in
practice, so the chosen option is the one that cannot interrupt service or fabricate
debt for an existing customer.

The SQL literal lives in a shared constant referenced by both the migration and its test,
so the test cannot drift from the statement it verifies.

### C2 — `GetNextDueDate` returns `DateOnly?`

`StoreBillingUtils.GetNextDueDate` changes signature to accept `DateOnly?` and return
`DateOnly?`, returning `null` when `paymentStartDate` is `null`. A store without a paid
plan has no next due date; the type now says so.

Both call sites drop the `?? DateOnly.MaxValue` substitution. `GetStatus` already returns
`NoAplica` for a null `paymentStartDate`; its signature adapts to the nullable due date.

### C3 — Relocate `IDateTimeProvider`

Move the interface from `Infrastructure/Interfaces/Services/IDateTimeProvider.cs` to
`Application/Abstractions/Time/IDateTimeProvider.cs`, matching the existing convention
used by `IHttpContextService` (interface in `Application/Abstractions/`, implementation in
`SMCA.WebApi/Services/`). The implementations in `SMCA.WebApi/Services/DateTimeProvider.cs`
and `WebApiTest/Services/DateTimeProvider.cs` are unchanged apart from their `using`.

Inject it in the four billing call sites that currently read `DateTime.UtcNow`:
`BillingService`, `GetMeQueryHandler`, `GetStoresToCollectQueryHandler`,
`UpdateStoreCommandHandler`.

This is a pure refactor: the existing suite must stay green across it.

### C4 — `RegisterStorePaymentCommandValidator`

`POST /stores/{storeId}/payments` has no validator. Add one with `StoreId` `NotEmpty`,
following the shape of `SetStorePaymentDateCommandValidator`.

### C5 — Delete `StoreBillingService`

`Application/Services/Billing/StoreBillingService.cs` is registered in DI and injected
nowhere. Its `RecordManualPaymentAsync` duplicates `RegisterStorePaymentCommandHandler`
while omitting the reseller-ownership guard and the `+1 month` due-date advance. Remove
the class, its interface `IStoreBillingService`, and the DI registration.

## Test strategy

Two layers, split by what each is good at.

**Unit tests** (`Application.Tests`) cover calendar arithmetic and handler logic.
`StoreBillingUtils` is a pure static class that already takes `today` as a parameter, so
no infrastructure is needed. Boundary cases belong here: they run in milliseconds and
point at the exact function when they fail.

This layer is already well covered. `Application.Tests` contains handler tests for
`RegisterStorePaymentCommand`, `GetStoresToCollectQuery`, `GetReSellerCommissionsQuery`,
`GetMeQueryHandler.FilterForBilling` (all five billing states), `CreateStoreService`, and
`StoreBillingUtils`. The plan must not duplicate them.

The gap in this layer is narrow and specific: **`BillingService` has no test file at all**,
and it is the class that holds the `?? DateOnly.MaxValue` substitution of F2. The only
billing class without coverage is the one carrying the defect.

**End-to-end tests** (`SMCA.WebApi.E2ETests`) cover wiring: authentication, role guards,
tenant scoping, persistence, serialization. They exercise each billing state once through
HTTP, not the arithmetic behind it.

Two rules apply to every test written under this design:

1. **Negative tests assert the error code, not just the status.** A 400 proves nothing on
   its own — it may be failing for a different reason than intended. Follow the existing
   convention (`Update_empty_name_returns_400_code_Name`).
2. **Money tests assert money.** Amounts and commissions are verified by reading the
   persisted `StorePayment` and comparing concrete numbers (e.g. a $1000 module at 10%
   discount with a reseller at 15% yields a $900 payment and a $135 commission).

## Coverage matrix

### `GET /auth/me` — billing enforcement

Existing: `Vencido` excludes paid modules; `AlDia` includes all.

To add:
- Free store (`PaymentStartDate = null`) returns `NoAplica`, all modules, no crash — **F2**
- `PorVencer` returns the status and keeps all modules
- `EnGracia` returns the status and keeps all modules (grace must not restrict access)
- `IsInTrial` is true within the trial window and false after it. Note that
  `GetMeQueryHandler` computes this inline as `PaymentStartDate.AddMonths(1) >= today`,
  with the month count hard-coded, rather than calling `StoreBillingUtils.IsInTrial` with
  the configured trial period. The test pins the current behaviour; see Known debt.

### `PUT /stores/{storeId}/payment-date`

Existing: SuperAdmin 200; OwnerAdmin 403; unauthenticated 401.

To add:
- ReSeller is rejected
- Unknown store id returns 400
- Empty route id returns 400 with code `StoreId`
- Missing or malformed `PaymentStartDate` returns 400 with code `PaymentStartDate`

### `POST /stores/{storeId}/payments`

Existing: ReSeller pays own store 200 and persists; ReSeller pays store not owned 400.

To add:
- SuperAdmin pays any store 200
- Unauthenticated 401
- Non-SuperAdmin/non-ReSeller role rejected
- Store with `PaymentStartDate = null` returns 400
- Unknown store id returns 400
- Amount equals the sum of active non-free `StoreModule` current prices, discounts applied
- Reseller commission is persisted from the `ReSellerOwner` snapshot
- The persisted `PaymentBeforeDate` advances the due date by one month
- Two consecutive payments advance it by two months
- Empty route id returns 400 with code `StoreId` (covers C4)

### `GET /stores/to-collect`

Existing: SuperAdmin 200; results ordered by due date; unauthenticated 401.

To add:
- ReSeller sees only stores it owns
- `AlDia` stores are excluded
- `Vencido` stores are excluded
- `PorVencer` and `EnGracia` stores are included
- Non-SuperAdmin/non-ReSeller role rejected
- Amount reflects discounts on active non-free modules

### `GET /stores/reseller-commissions`

Existing: ReSeller gets own commissions grouped by period.

To add:
- SuperAdmin sees commissions across all resellers
- Unauthenticated 401
- Non-SuperAdmin/non-ReSeller role rejected
- Grouping by year/month with descending order and correct `PaymentCount`
- Payments without a reseller are excluded

### `PUT /stores/{id}` — activation-on-first-paid

No coverage today at either layer. Unit tests are listed above; the end-to-end cases below
verify the same rules through HTTP and persistence.

To add:
- Assigning a paid module to a store with `PaymentStartDate = null` sets it to today
- Assigning only free modules leaves it `null`
- A store that already has a `PaymentStartDate` keeps it unchanged

### `POST /features/activate`

Covered by 7 existing tests. Add one assertion: the Statistics module price is set to 1000.

### Unit tests (`Application.Tests`)

`StoreBillingUtilsTests` already covers commission, due-date derivation with and without a
prior payment, all five status boundaries, `IsPaidPlanActive` and `IsInTrial`. To add:

- `GetNextDueDate` with a null start date returns `null`
- `GetStatus` with a null due date returns `NoAplica`
- `GetNextDueDate` calendar boundary: 31 January plus one month

New file `BillingServiceTests` — the class has no coverage today:

- Store with `PaymentStartDate = null` returns `NoAplica`, a null `NextDueDate`, and does
  not throw — **F2**
- Store with only free modules reports `PlanType = "Free"`
- Store with a paid module and a start date reports `PlanType = "Paid"`
- `CurrentMonthAmount` falls back to the sum of paid module prices when there is no payment
- `CurrentMonthAmount` uses the last payment's price when one exists
- `ReSellerCommission` is computed only when the last payment was made by a reseller
- `MonthsActive` is never negative

Activation-on-first-paid is covered end-to-end only, not at the handler level.
`UpdateStoreCommandHandler` takes ten dependencies and calls
`_storeRepository.Where(...).Any(...)`, so a handler-level test has to mock a repository
that returns `IQueryable` and ends up asserting the shape of the query rather than the
rule. The three activation rules are fully exercised through HTTP and persistence in the
end-to-end matrix below.

## Test infrastructure

### Mutable clock

`MutableDateTimeProvider` in `E2ETests/Infrastructure/`, registered through
`builder.ConfigureTestServices(...)` in `AppTestFactory` — the first service override in
this project — and exposed on `WebAppFixture` as `Clock`.

Every test that moves the clock restores it, through an `IDisposable` scope that makes
restoration automatic. The `e2e` collection currently runs serially, so a shared mutable
clock is safe today; the disposable scope is what keeps it safe if that ever changes.

### Billing seeds

New `BillingSeed` helper with intent-revealing entry points:

- `SeedFreeStoreAsync()` — `PaymentStartDate = null`, free module only
- `SeedPaidStoreAsync(paymentStartDate)` — paid module assigned
- `SeedPaymentAsync(storeId, paymentBeforeDate)` — prior payment for due-date derivation

Named for the state they produce, not for their parameters.

### Backfill migration test

Inserts a `Store` row with `PaymentStartDate = '0001-01-01'` via raw SQL, executes the
shared backfill constant, and asserts the value is `NULL`.

## Work order

Strict TDD — each step starts with a failing test.

1. `BillingServiceTests` (new) plus the three missing `StoreBillingUtilsTests` cases → C2
   (`DateOnly?`) → green. Confirms or refutes F2.
2. C3 (relocate and inject `IDateTimeProvider`) — pure refactor, existing suite stays green.
3. `/auth/me` free-store e2e test → green via the fix from step 1.
4. C1 backfill migration + its test.
5. C4 validator + its test.
6. The remaining coverage matrix, endpoint by endpoint.
7. C5 delete `StoreBillingService`.

## Delivery

Two pull requests, to keep each within a reviewable budget:

- **PR 1** — steps 1–5 and 7: production fixes, clock relocation, unit tests, migration,
  validator, dead-code removal. Small enough to review closely, and it is where the real
  risk lives.
- **PR 2** — step 6: the end-to-end coverage matrix. Larger but mechanical.

## Known debt (not addressed here)

- `StoreSeed.SeedStoreAsync` seeds `PaymentStartDate = today` unconditionally, which is
  what hid F2. The correct default is `null`, matching production, but changing it would
  break roughly 60 tests unrelated to billing. It needs its own change.
- The due-soon window is hard-coded to 5 days in both `BillingService` and
  `GetStoresToCollectQueryHandler`, while the grace period is configurable through
  `SystemConfiguration`. The inconsistency is left as-is; tests pin current behaviour.
- `GetMeQueryHandler` computes `IsInTrial` inline with a hard-coded one-month window,
  ignoring the configured `TestingPeriodInMonths` and duplicating
  `StoreBillingUtils.IsInTrial`. Two sources of truth for the same rule. Fixing it changes
  behaviour for any tenant configured with a trial other than one month, so it needs its
  own change with product sign-off.
- `Domain.Tests` exists on disk but is not referenced by `SMCA.sln`, and duplicates a test
  file from `Domain.UnitTests`. Billing unit tests go in `Application.Tests`, which is
  where the existing ones live.
- `BillingService` names its trial variable `trialDays` while reading a value in months
  (`GetTestingPeriodInMonthsAsync`), then applies `Math.Max(1, trialDays)`. Behaviour is
  correct; the naming is misleading. Not renamed here to keep the diff focused.
