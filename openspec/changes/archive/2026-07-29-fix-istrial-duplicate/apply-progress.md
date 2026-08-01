# Apply Progress: fix-istrial-duplicate

**Change**: `2026-07-29-fix-istrial-duplicate`
**Date applied**: 2026-07-30
**Applied by**: SDD apply sub-agent (batch commit with other endpoint-fix changes)

---

## Implementation Record

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1.1 | Add `public bool IsInTrial { get; init; }` to `StoreBillingSummary.cs` | ✅ Done | `42deff4b` |
| 2.1 | Compute `IsInTrial` in `BillingService.cs` via `StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today)` | ✅ Done | `42deff4b` |
| 2.2 | Replace inline `AddMonths(1) >= today` with `billing.IsInTrial` in `GetMeQuery.cs` | ✅ Done | `42deff4b` |
| 3.1 | Add `.Be(false)` assert for `isInTrial` in `Me_freeStore_returnsNoAplica` | ✅ Done | `42deff4b` |
| 3.2 | Add `.Be(false)` assert for `isInTrial` in `Me_PorVencer_returnsStatus` | ✅ Done | `42deff4b` |
| 3.3 | Add `.Be(false)` assert for `isInTrial` in `Me_EnGracia_returnsStatus` | ✅ Done | `42deff4b` |
| 3.4 | Full regression: `dotnet test backend/src/SMCA.sln` → ALL PASS | ✅ Done | `42deff4b` |

All 7 tasks complete — **7/7**.

## Commit

```
42deff4bc38108aaabef830ebad4555ce3df4cce
Author: Lizardo Romero Scott <lrscott83@gmail.com>
Date:   Thu Jul 30 16:24:15 2026 -0400

    fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)
```

## Files Changed

| File | Change |
|------|--------|
| `backend/src/Domain/Entities/Billing/StoreBillingSummary.cs` | Added `public bool IsInTrial { get; init; }` property (single source of truth field) |
| `backend/src/Application/Services/Billing/BillingService.cs` | Compute `var isInTrial = StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today)` and assign `IsInTrial = isInTrial` in the summary |
| `backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Replaced inline `PaymentStartDate.Value.AddMonths(1) >= today` with `IsInTrial = billing.IsInTrial` |
| `backend/src/SMCA.WebApi.E2ETests/Billing/GetMeBillingStatesTests.cs` | Added `body.Data.IsInTrial.Should().Be(...)` asserts in `Me_freeStore_returnsNoAplica`, `Me_PorVencer_returnsStatus`, `Me_EnGracia_returnsStatus` |

## Build & Tests

- ✅ `dotnet build SMCA.sln` — 0 errors
- ✅ E2E `GetMeBillingStatesTests` (`--filter "GetMeBilling"`) — PASS
- ✅ Full regression `dotnet test backend/src/SMCA.sln` — ALL PASS (E2E suite 237/237, same batch run as sibling changes)

## Notes

The `IsInTrial` duplication is eliminated: `GetMeQueryHandler` no longer computes trial status inline with a hardcoded 1-month window. The canonical `StoreBillingUtils.IsInTrial(paymentStartDate, trialMonths, today)` (which reads `TestingPeriodInMonths` from `SystemConfiguration`) is now the single source of truth, computed once in `BillingService` and consumed by `GetMe`.
