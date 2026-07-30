# Delta Spec: fix-istrial-duplicate

## Parent Spec

`openspec/specs/billing/spec.md`

## Problem

`GetMeQueryHandler` (line 99) computes `IsInTrial` inline with a **hardcoded**
`AddMonths(1)`, duplicating — and diverging from — the canonical
`StoreBillingUtils.IsInTrial(paymentStartDate, trialMonths, today)` which reads
the configurable `trialMonths` from `SystemConfiguration.TestingPeriodInMonths`.

If `TestingPeriodInMonths` is ever changed from `1`, `GetMe` would report
`isInTrial` incorrectly while every other consumer of `BillingService` uses the
correct configurable value.

**Root cause:** `StoreBillingSummary` has no `IsInTrial` property, so consumers
must compute it themselves — and `GetMeQueryHandler`'s inline computation ignores
the configured trial period.

---

## R1: StoreBillingSummary MUST expose `IsInTrial`

`Domain/Entities/Billing/StoreBillingSummary.cs` SHALL add a computed
`bool IsInTrial { get; init; }` property.

This makes `IsInTrial` a first-class field of the billing summary contract,
eliminating the need for consumers to compute it.

### Before

```csharp
public class StoreBillingSummary
{
    public Guid StoreId { get; init; }
    // … existing fields, NO IsInTrial
}
```

### After

```csharp
public class StoreBillingSummary
{
    public Guid StoreId { get; init; }
    public bool IsInTrial { get; init; }
    // … existing fields unchanged
}
```

---

## R2: BillingService MUST compute `IsInTrial` canonically

`Application/Services/Billing/BillingService.GetStoreBillingSummaryAsync()` SHALL
compute `IsInTrial` using the canonical util:

```csharp
StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today)
```

The same `trialMonths` and `today` variables already present in the method SHALL
be reused — no new config reads or clock calls.

The result SHALL be assigned to the new `StoreBillingSummary.IsInTrial` property.

**Data flow:**

```
BillingService.GetStoreBillingSummaryAsync()
  └─ trialMonths = await _configRepository.GetTestingPeriodInMonthsAsync()
  └─ today = DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime)
  └─ IsInTrial = StoreBillingUtils.IsInTrial(paymentStartDate, trialMonths, today)
       └─ StoreBillingSummary.IsInTrial  ← single source of truth
```

### Before (line ~83–96 — return statement fragment)

```csharp
return new StoreBillingSummary
{
    // … existing fields, NO IsInTrial
};
```

### After

```csharp
return new StoreBillingSummary
{
    // … existing fields …
    IsInTrial = StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today),
};
```

---

## R3: GetMeQueryHandler MUST consume `billing.IsInTrial`

`GetMeQueryHandler.Handle()` line 99 SHALL replace the inline computation with
the summary field.

### Before (line 99)

```csharp
IsInTrial = billing.PaymentStartDate is not null && billing.PaymentStartDate.Value.AddMonths(1) >= today,
```

### After

```csharp
IsInTrial = billing.IsInTrial,
```

The local `today` variable (line 82) is no longer needed for this computation
but SHALL be left in place — it may be used by other parts of the handler.

---

## R4: All billing states MUST report correct `isInTrial`

The `IsInTrial` value SHALL be consistent with
`StoreBillingUtils.IsInTrial(paymentStartDate, trialMonths, today)` across all
billing states:

| `PaymentStartDate` | `today` relative to `startDate + trialMonths` | `IsInTrial` |
|---|---|---|
| `null` | N/A | `false` |
| Non-null | `today <= startDate.AddMonths(trialMonths)` | `true` |
| Non-null | `today > startDate.AddMonths(trialMonths)` | `false` |

The trial check is independent of payment status — a store can be in trial while
also being `AlDia`, `PorVencer`, etc. The only disallowed combination is
`IsInTrial == true` when `PaymentStartDate == null`.

---

## Scenarios

### S1: Free store (null PaymentStartDate)

**Given** a store with `PaymentStartDate = null`
**When** `GetStoreBillingSummaryAsync` is called
**Then** `IsInTrial` SHALL be `false`
**And** `Status` SHALL be `NoAplica`

### S2: Store within trial period

**Given** a store with `PaymentStartDate = 2026-01-10`
**And** `TestingPeriodInMonths = 1`
**When** `today = 2026-02-05` (within trial)
**Then** `IsInTrial` SHALL be `true`

**Given** a store with `PaymentStartDate = 2026-01-10`
**And** `TestingPeriodInMonths = 3` (configured differently)
**When** `today = 2026-03-05` (day 54 — still within 3-month trial)
**Then** `IsInTrial` SHALL be `true`

### S3: Store past trial period

**Given** a store with `PaymentStartDate = 2026-01-10`
**And** `TestingPeriodInMonths = 1`
**When** `today = 2026-02-20` (past 1-month trial)
**Then** `IsInTrial` SHALL be `false`

**Given** a store with `PaymentStartDate = 2026-01-10`
**And** `TestingPeriodInMonths = 1`
**When** `today = 2026-01-10` (exactly on start date, day 0)
**Then** `IsInTrial` SHALL be `true` (boundary: day 0 is within trial)

### S4: Regression — existing GetMe assertions unchanged

**Given** the existing E2E tests in `GetMeBillingStatesTests.cs` that assert
`CurrentUserDto` properties
**When** the change is applied
**Then** all existing assertions on `PaymentDueDate`, `PaymentStatus`,
`StoreModuleIds`, and other `CurrentUserDto` fields SHALL remain unchanged

**And** at least one existing test SHALL additionally assert
`body.Data.IsInTrial.Should().Be(expectedValue)` to validate the new field.

### S5: Regression — billing E2E suite passes

**Given** the full billing E2E test suite (31 tests via `BillingSeed`)
**When** the change is applied
**Then** all billing E2E tests SHALL pass

---

## Verification Matrix

| Check | How |
|---|---|
| `StoreBillingSummary.IsInTrial` added | Review `Domain/Entities/Billing/StoreBillingSummary.cs` |
| `BillingService` computes via util | Review `Application/Services/Billing/BillingService.cs` |
| `GetMeQueryHandler` reads `billing.IsInTrial` | Review line 99 of `GetMeQuery.cs` — no `AddMonths` in scope |
| No remaining inline `AddMonths(1)` in GetMe | Grep for `AddMonths` in `GetMeQuery.cs` — must be absent |
| E2E test asserts `isInTrial` | Review `GetMeBillingStatesTests.cs` for new assertion |
| All billing E2E tests pass | `dotnet test SMCA.WebApi.E2ETests --filter "Billing"` |
| All unit tests pass | `dotnet test` at solution root |

---

## Out of Scope (explicit)

- Refactoring `StoreBillingUtils.IsInTrial` signature or behavior
- Changing `SystemConfiguration` or `TestingPeriodInMonths` values
- Other call sites of `StoreBillingUtils.IsInTrial` or `StoreBillingSummary`
- Frontend changes
- Removing the local `today` variable in `GetMeQueryHandler`
