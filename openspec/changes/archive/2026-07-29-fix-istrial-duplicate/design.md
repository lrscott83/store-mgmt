# Design: fix-istrial-duplicate

## Technical Approach

Consolidate `IsInTrial` computation into `StoreBillingSummary`, computed once in `BillingService` via the canonical `StoreBillingUtils.IsInTrial`. `GetMeQueryHandler` reads `billing.IsInTrial` instead of reimplementing inline logic with a hardcoded `AddMonths(1)`.

## Architecture Decisions

### AD1: IsInTrial as simple property on StoreBillingSummary

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `bool IsInTrial { get; set; }` on entity | DTO-like entity gets a computed field; caller sets it | ✓ Adopted |
| Computed property calling `StoreBillingUtils.IsInTrial` | Entity would need `trialMonths` and `today` — doesn't own them | Rejected — entity lacks config context |
| New domain service/extension | Overkill for a single boolean; existing pattern uses BillingService | Rejected — violates minimal change |

**Rationale**: `StoreBillingSummary` is already a projection assembled by `BillingService`. Adding `IsInTrial` as a settable property follows the existing pattern of `Status`, `NextDueDate`, etc. — all computed in the service layer.

### AD2: BillingService computation placement

Compute after `trialMonths` and `today` are available (lines ~49-56). Insert before the `return new StoreBillingSummary { ... }` block.

```csharp
var isInTrial = StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today);
```

No new dependencies — `store.PaymentStartDate`, `trialMonths`, and `today` are already in scope.

### AD3: GetMeQueryHandler — remove today

Replacing line 99 with `IsInTrial = billing.IsInTrial` renders the `today` local (line 82) unused. **Remove the `today` declaration.** The `_dateTimeProvider` field and constructor param remain — removing them changes the public constructor signature, which is scope creep per the proposal. A no-op usage `_ = _dateTimeProvider;` is optional noise; the unused-param warning is acceptable.

### AD4: No refactor to IDateTimeProvider in GetMe

The `_dateTimeProvider` stays injected but unused. Removing it would change `GetMeQueryHandler`'s constructor, potentially breaking DI registrations or tests. This is explicitly out of scope.

## Data Flow

```
BillingService.GetStoreBillingSummaryAsync()
  │
  ├─ reads TestingPeriodInMonths → trialMonths
  ├─ reads IDateTimeProvider.UtcNow → today
  │
  ├─ StoreBillingUtils.IsInTrial(paymentStartDate, trialMonths, today)
  │     ↓
  │   bool isInTrial            ← single source of truth
  │
  └─ new StoreBillingSummary { IsInTrial = isInTrial, ... }
       │
       ▼
GetMeQueryHandler.Handle()
  └─ billing.IsInTrial          ← consumes, no duplicate logic
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Domain/Entities/Billing/StoreBillingSummary.cs` | Modify | Add `public bool IsInTrial { get; set; }` property |
| `Application/Services/Billing/BillingService.cs` | Modify | Compute `isInTrial` via `StoreBillingUtils.IsInTrial`, assign to summary |
| `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Modify | Replace inline `AddMonths(1) >= today` with `billing.IsInTrial`; remove unused `today` local |
| `SMCA.WebApi.E2ETests/Billing/GetMeBillingStatesTests.cs` | Modify | Add `body.Data.IsInTrial.Should().Be(...)` in existing test cases |

## Interfaces / Contracts

No new interfaces. `StoreBillingSummary` gains one public property. The `IBillingService` interface is unchanged — the new field flows through the existing `StoreBillingSummary` return type.

```csharp
// StoreBillingSummary.cs — new property
public bool IsInTrial { get; set; }

// BillingService.cs — new line before return
var isInTrial = StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today);
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| E2E | Free store (no PaymentStartDate) | Assert `IsInTrial == false` in existing `Me_freeStore_returnsNoAplica...` test |
| E2E | Paid store within trial (May 18 + 2mo trial, clock Jul 15) | Assert `IsInTrial == true` in existing `Me_PorVencer...` test |
| E2E | Paid store past trial (May 10 + 2mo trial, clock Jul 15) | Assert `IsInTrial == false` in existing `Me_EnGracia...` test |

All existing tests pin the clock via `_fixture.Clock.Pin(...)`. No new test methods needed — add one assertion per existing test.

**Trial period math** (with `TestingPeriodInMonths=2` seed data):
- PaymentStartDate May 18 → trial ends Jul 18 → Jul 15 = **in trial**
- PaymentStartDate May 10 → trial ends Jul 10 → Jul 15 = **past trial**
- PaymentStartDate null → **not in trial**

## Migration / Rollout

No migration required. The change is purely computational — no schema, no data, no feature flags. Deploy with next release.

## Open Questions

None. All decisions are resolved by the codebase analysis above.
