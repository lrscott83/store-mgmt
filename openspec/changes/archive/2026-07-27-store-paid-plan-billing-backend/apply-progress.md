# Apply Progress: store-paid-plan-billing-backend

**Change**: `2026-07-27-store-paid-plan-billing-backend`
**Date applied**: 2026-07-27 → 2026-07-30 (implementation + follow-up consolidation batches)
**Applied by**: SDD apply sub-agent (openspec mode)

---

## Implementation Record

All 9 tasks from `tasks.md` were implemented. The primary implementation landed in a single batch commit `b57fc3e4`, with two follow-up commits refining the same feature (`4eb56c07` consolidation, `42deff4b` endpoint fixes).

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | `PaymentGraceDays` system config (enum `3`, accessor, seed `"5"`, migration) | ✅ Done | `b57fc3e4` |
| 2 | `StoreBillingUtils` — pure math: commission, due date, status, trial, active (TDD) | ✅ Done | `b57fc3e4` |
| 3 | `Store.PaymentStartDate` → `DateOnly?`, activate-on-first-paid, owner lock, migration | ✅ Done | `b57fc3e4` |
| 4 | `StorePayment` reseller fields (5 cols), FK + index, migration | ✅ Done | `b57fc3e4` |
| 5 | Billing orchestration layer | ✅ Done | `b57fc3e4` + `4eb56c07` |
| 6 | Enforcement: `FilterForBilling` in `GetMeQueryHandler` + `HasPermissionAttribute`, payment fields on `CurrentUserDto` | ✅ Done | `b57fc3e4` + `42deff4b` |
| 7 | `RegisterStorePaymentCommand` — `POST /stores/{id}/payments` | ✅ Done | `b57fc3e4` |
| 8 | `GetStoresToCollectQuery` — `GET /stores/to-collect` | ✅ Done | `b57fc3e4` |
| 9 | `GetReSellerCommissionsQuery` — `GET /stores/reseller-commissions` | ✅ Done | `b57fc3e4` |

### Commit History (billing-related)

```
b57fc3e4  feat(billing): implement store paid-plan billing backend        (2026-07-27)
957cab34  fix(billing): gate collections/commissions routes on StorePayment feature  (2026-07-27)
4eb56c07  feat(backend): offline roster export + billing consolidation    (2026-07-29)
42deff4b  fix(api): resolve bugs across stores, auth, users endpoints     (2026-07-30)
```

## Key Deviations from Design (applied during implementation)

Documented in the archive-report as delta specs DS-1..DS-5 — all confirmed present in the final code:

| Delta | Summary | Evidence |
|-------|---------|----------|
| DS-1 | `HasPermissionAttribute` class-level vs action-level detection (skip class-level when action has its own `[HasPermission]`) | `HasPermissionAttribute.cs` lines 51-78 |
| DS-2 | New `StorePaymentAdmin` feature (`FeatureType.StorePayment = 91`) instead of `ReSellerAdmin` for billing endpoints | `StoreRoleFeatures.cs`, `FeatureType.cs`, `StoresController.cs` |
| DS-3 | `SetTenantContext` on `ApplicationDbContext` for E2E test support | `ApplicationDbContext.cs` line 56 |
| DS-4 | Separate `PUT /stores/{storeId}/payment-date` endpoint instead of `PaymentStartDate` in `UpdateStoreCommand` | `StoresController.cs` lines 110-115, `SetStorePaymentDateCommand.cs` |
| DS-5 | `IBillingService`/`BillingService` becomes the orchestration layer (billing summary read model); original `IStoreBillingService` interfaces created then removed | `IBillingService.cs`, `BillingService.cs`, `StoreBillingSummary.cs` |

**Note on DS-5 evolution**: `IStoreBillingService.cs` and `StoreBillingService.cs` were created in `b57fc3e4` but **deleted** in `4eb56c07` (offline roster export commit). The final architecture keeps a single orchestration point: `IBillingService.GetStoreBillingSummaryAsync(Guid storeId)` returning `StoreBillingSummary`. Commands/queries (`RegisterStorePaymentCommand`, `GetStoresToCollectQuery`, `GetReSellerCommissionsQuery`) use repos + `StoreBillingUtils` directly.

## Files Changed (final state)

| File | Change |
|------|--------|
| `Domain/Common/Utils/StoreBillingUtils.cs` | Created — `StoreBillingStatusType` enum + 5 static methods + `FilterForBilling` |
| `Domain/Common/Enums/SystemConfigurationType.cs` | Added `PaymentGraceDays = 3` |
| `Domain/Common/Enums/FeatureType.cs` | Added `StorePayment = 91` |
| `Domain/Common/Enums/StoreRoleFeatures.cs` | Added `StorePaymentAdmin` |
| `Domain/Entities/Stores/Store.cs` | `PaymentStartDate` → `DateOnly?`, nullable factory/ctor |
| `Domain/Entities/StorePayments/StorePayment.cs` | 5 reseller fields + extended `Create` factory |
| `Domain/Entities/Billing/StoreBillingSummary.cs` | Created — billing read model |
| `Domain/Interfaces/Services/Billing/IBillingService.cs` | Created — `GetStoreBillingSummaryAsync` |
| `Domain/Interfaces/Repositories/IStorePaymentRepository.cs` | Added `GetLastByStoreIdAsync`, `GetByStoreIdAsync`, `GetPaidMonthsCountAsync`, `GetAllPaidWithReSellerAsync`, `GetPaidWithReSellerByReSellerUserAsync` |
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Added `GetStoreWithModulesAndReSellerOwnerAsync`, `IsStoreOwnedByReSellerUserAsync`, `GetPaidStoresAsync`, `GetPaidStoresByReSellerUserAsync` |
| `Domain/Interfaces/Repositories/IModuleRepository.cs` | Added `GetModulesByIdsAsync` |
| `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | Added `GetPaymentGraceDaysAsync`, `GetDueSoonDaysAsync` |
| `Application/Services/Billing/BillingService.cs` | Created — orchestration service (repos + config + utils, config caching) |
| `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Injects `IBillingService`, applies `FilterForBilling`, sets payment fields |
| `Application/Dtos/Authentication/CurrentUserDto.cs` | Added `PaymentDueDate`, `IsInTrial`, `PaymentStatus` |
| `Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs` | Created — role guard, commission snapshot, due advance |
| `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs` | Created — `PorVencer`/`EnGracia` filter, role scoping |
| `Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/GetReSellerCommissionsQuery.cs` | Created — grouping by year/month, role scoping |
| `Application/Dtos/StoreManagement/StoreToCollectDto.cs` | Created |
| `Application/Dtos/StoreManagement/ReSellerCommissionDto.cs` | Created |
| `Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` | Activation-on-first-paid + owner lock |
| `Application/Features/StoreManagement/StorePayments/Commands/SetStorePaymentDate/SetStorePaymentDateCommand.cs` | Created — DS-4 endpoint |
| `Application/Services/Stores/CreateStoreService.cs` | Passes `null` for `PaymentStartDate` |
| `SMCA.WebApi/Filters/HasPermissionAttribute.cs` | Injects `IBillingService`, mirrors `FilterForBilling`, class/action detection |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | 3 new billing endpoints + `payment-date` endpoint |
| `Application/DependencyInjection.cs` | Registers `IBillingService`/`BillingService` |
| `Infrastructure/Persistence/Contexts/ApplicationDbContext.cs` | `SetTenantContext` (DS-3) |
| `Infrastructure/Persistence/Repositories/*` | New query methods implemented (SystemConfiguration, StorePayment, Store, Module) |
| `Infrastructure/Persistence/EntityConfigurations/*` | `PaymentGraceDays` seed `"5"`, `StorePayment` FK + index for `ReSellerId` |
| `Infrastructure/Migrations/` | `20260727164714_Add-PaymentGraceDays-SystemConfig`, `20260727165912_StorePayment-ReSeller-Commission-Fields`, `20260728194358_Backfill-PaymentStartDate-Null` |

### Test files

| File | Type | Status |
|------|------|--------|
| `Application.Tests/DomainUtils/StoreBillingUtilsTests.cs` | Unit | ✅ Created (`b57fc3e4`) |
| `Application.Tests/Services/Billing/BillingServiceTests.cs` | Unit | ✅ Created (`4eb56c07`) — replaces planned `StoreBillingServiceTests.cs` (DS-5) |
| `Application.Tests/Authentication/Queries/GetMe/GetMeOverdueDowngradeTests.cs` | Unit | ✅ Created (`b57fc3e4`, updated `42deff4b`) |
| `Application.Tests/Features/StoreManagement/StorePayments/Commands/RegisterStorePaymentCommandTests.cs` | Unit | ✅ Created (`b57fc3e4`) |
| `Application.Tests/Features/StoreManagement/StorePayments/Queries/GetStoresToCollectQueryTests.cs` | Unit | ✅ Created (`b57fc3e4`) |
| `Application.Tests/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissionsQueryTests.cs` | Unit | ✅ Created (`b57fc3e4`) |
| `Application.Tests/Features/StoreManagement/UpdateStorePaymentStartDateTests.cs` | Unit | ⚠️ **Never created** — behavior covered by E2E `StoreActivationTests.cs` instead |
| `SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs` | E2E | ✅ Created |
| `SMCA.WebApi.E2ETests/Billing/RegisterStorePaymentTests.cs` | E2E | ✅ Created |
| `SMCA.WebApi.E2ETests/Billing/GetStoresToCollectTests.cs` | E2E | ✅ Created |
| `SMCA.WebApi.E2ETests/Billing/GetReSellerCommissionsTests.cs` | E2E | ✅ Created |
| `SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs` | E2E | ✅ Created (`4eb56c07`) — covers Task 3 activation/lock scenarios |
| `SMCA.WebApi.E2ETests/Billing/` (PaymentDateTests, PaymentMoneyTests, PaymentHappyPathTests, BackfillMigrationTests, etc.) | E2E | ✅ Created (`4eb56c07`, billing-e2e-coverage-fixes) |

## Build & Tests (run during this apply/verify pass)

- ✅ `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj` — 0 errors (8 pre-existing NU package vulnerability warnings)
- ✅ Unit: `Application.Tests` — 300/300 PASS (32 billing-related)
- ✅ E2E: `SMCA.WebApi.E2ETests` — 237/237 PASS (39 billing-related, Postgres `smca_test`)

## Remaining Tasks

- [ ] None — all 9 tasks implemented and verified. Tasks.md commit steps (1.5, 2.4, 3.7, 4.4, 5.6, 6.7, 7.7, 8.7, 9.7) were consolidated into the batch commits listed above; the change is archived.
