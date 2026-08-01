# Apply Progress: billing-e2e-coverage-fixes

**Change**: `2026-07-28-billing-e2e-coverage-fixes`
**Date applied**: 2026-07-30
**Applied by**: SDD apply sub-agent (batch commit with other endpoint-fix changes)

---

## Implementation Record

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1.1 | Make `StoreBillingUtils` nullable-aware (`GetNextDueDate` → `DateOnly?`, `GetStatus` → `DateOnly?`, `IsPaidPlanActive` → `DateOnly?`) | ✅ Done | `42deff4b` |
| 1.2 | Add 3 `StoreBillingUtilsTests` + fix existing `IsPaidPlanActive` tests | ✅ Done | `42deff4b` |
| 1.3 | Create `BillingServiceTests` (7 tests) | ✅ Done | `42deff4b` |
| 1.4 | `StoreBillingSummary.NextDueDate` → `DateOnly?` | ✅ Done | `42deff4b` |
| 1.5 | Remove `?? DateOnly.MaxValue` magic dates | ✅ Done | `42deff4b` |
| 1.6 | Move `IDateTimeProvider` to `Application/Abstractions/Time/` | ✅ Done | `42deff4b` |
| 1.7 | Inject clock into 4 call sites (BillingService, GetMeQueryHandler, GetStoresToCollectQueryHandler, UpdateStoreCommandHandler) | ✅ Done | `42deff4b` |
| 2.1 | Create `MutableDateTimeProvider` (`Pin(DateTimeOffset)` + `IDisposable` scope) | ✅ Done | `42deff4b` |
| 2.2 | Register test clock in `AppTestFactory` + expose `Clock` on `WebAppFixture` | ✅ Done | `42deff4b` |
| 2.3 | Create `BillingSeed` helper | ✅ Done | `42deff4b` |
| 2.4 | `BackfillMigrationTests` + `PaymentStartDateBackfill` shared SQL constant | ✅ Done | `42deff4b` |
| 2.5 | Generate backfill migration `20260728194358_Backfill-PaymentStartDate-Null` + deploy SQL script | ✅ Done | `42deff4b` |
| 2.6 | `RegisterStorePaymentCommandValidator` (`StoreId.NotEmpty`) | ✅ Done | `42deff4b` |
| 2.7 | Delete dead `StoreBillingService` / `IStoreBillingService` / DI registration | ✅ Done | `42deff4b` |
| 2.8 | E2E coverage: 13 test files across 4 categories for 7 billing-affected endpoints | ✅ Done | `42deff4b` |

**Result**: 15/15 tasks complete.

## Commit

```
42deff4bc38108aaabef830ebad4555ce3df4cce
Author: Lizardo Romero Scott <lrscott83@gmail.com>
Date:   Thu Jul 30 16:24:15 2026 -0400

    fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)
```

> Note: `42deff4b` is a batch commit covering multiple SDD endpoint-fix changes. The billing-e2e-coverage-fixes tasks are the billing portion of that batch.

## Files Changed (billing portion)

| File | Change |
|------|--------|
| `backend/src/Domain/Common/Utils/StoreBillingUtils.cs` | Nullable signatures: `GetNextDueDate` → `DateOnly?`, `GetStatus` → `DateOnly?`, `IsPaidPlanActive` → `DateOnly?` |
| `backend/src/Domain/Entities/Billing/StoreBillingSummary.cs` | `NextDueDate` → `DateOnly?` |
| `backend/src/Application/Services/Billing/BillingService.cs` | Injected `IDateTimeProvider`, removed `?? DateOnly.MaxValue` |
| `backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs` | Injected clock, removed `?? DateOnly.MaxValue` |
| `backend/src/Application/Abstractions/Time/IDateTimeProvider.cs` | Relocated interface (from `Infrastructure/Interfaces/Services/`) |
| `backend/src/Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommandValidator.cs` | New validator: `StoreId.NotEmpty()` |
| `backend/src/Application/Services/Billing/StoreBillingService.cs` | Deleted (dead code, duplicates `RegisterStorePaymentCommandHandler`) |
| `backend/src/Domain/Interfaces/Services/Billing/IStoreBillingService.cs` | Deleted (dead interface) |
| `backend/src/Infrastructure/Migrations/PaymentStartDateBackfill.cs` | New shared SQL constant |
| `backend/src/Infrastructure/Migrations/20260728194358_Backfill-PaymentStartDate-Null.cs` | New EF migration (backfill sentinel → NULL) |
| `backend/scripts/06-20260728-Backfill-PaymentStartDate.sql` | Deploy SQL script |
| `backend/src/Application.Tests/DomainUtils/StoreBillingUtilsTests.cs` | +3 null-boundary/month-end tests; updated 3 `IsPaidPlanActive` calls |
| `backend/src/Application.Tests/Services/Billing/BillingServiceTests.cs` | New file, 7 tests |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/MutableDateTimeProvider.cs` | New test clock with `Pin()` scope |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/BillingSeed.cs` | New intent-revealing seed helpers |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs` | Added `Clock` property + `ConfigureTestServices` registering `IDateTimeProvider` (`RemoveAll` + `AddSingleton`) |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs` | Exposed `Clock` property |
| `backend/src/SMCA.WebApi.E2ETests/Billing/*.cs` | 13 new E2E test files (BackfillMigration, GetMeBilling, GetMeBillingStates, PaymentHappyPath, PaymentMoney, PaymentDate, RegisterStorePayment, RegisterStorePaymentValidation, GetStoresToCollect, ToCollect, ResellerCommissions, GetReSellerCommissions, StoreActivation) |

## Build & Tests

- ✅ `dotnet build SMCA.sln` — 0 errors
- ✅ `Application.Tests` — PASS (incl. 7 `BillingServiceTests`, updated `StoreBillingUtilsTests`)
- ✅ E2E suite — 237/237 passing overall
