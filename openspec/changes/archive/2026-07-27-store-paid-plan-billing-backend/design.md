# Design: Store Paid-Plan Billing Backend

## Technical Approach

Three-layer architecture with compute-on-read enforcement: pure static math (`StoreBillingUtils`) → orchestration service (`IStoreBillingService`) → enforcement at two entitlement gates (`GetMeQueryHandler`, `HasPermissionAttribute`). No background jobs, no payment gateway. Payments recorded manually via command, commission derived from `ReSellerOwner` snapshot at payment time.

```
Layer 1: Domain/Common/Utils/StoreBillingUtils     ← pure static, no dependencies
Layer 2: Application/Services/Billing/StoreBillingService  ← orchestrates repos + config
Layer 3: GetMeQueryHandler + HasPermissionAttribute         ← compute-on-read enforcement
         ↓
   Controller endpoints (3 new): POST payments, GET to-collect, GET reseller-commissions
```

## Architecture Decisions

| # | Decision | Option | Chosen | Rationale |
|---|----------|--------|--------|-----------|
| 1 | Enforcement timing | Background job vs compute-on-read | **Compute-on-read** | Reversible, no destructive writes, auto-recovers on payment. Matches existing codebase pattern (no Hangfire/Quartz). Cost: N+1 on `GetMe` — mitigated by single-store context. |
| 2 | Payment math location | Inline in handler vs static utility | **Static `StoreBillingUtils`** | Mirrors existing `CurrentPriceServiceUtils` pattern. Fully unit-testable, zero mocking needed. |
| 3 | `PaymentStartDate` activation | Always set at creation vs first paid module | **First paid module** | Decouples "store exists" from "store is on paid plan". Owner activates by choosing a paid module — intentional action. |
| 4 | Owner plan lock | Soft (UI-only) vs hard (backend) | **Hard (backend `ApiException`)** | Once `PaymentStartDate != null`, guard in `UpdateStoreCommandHandler` blocks Owner from changing modules. SuperAdmin bypasses. |
| 5 | ReSeller commission storage | Computed per-request vs snapshotted on payment | **Snapshotted** | Avoids drift if `ReSellerOwner` discounts change later. `StorePayment` stores `ReSellerId`, percent, flat, and computed amount. |
| 6 | Entitlement filter location | Single point vs two points | **Two points** | `GetMeQueryHandler` for module list; `HasPermissionAttribute` for feature-gate. Both must agree; extracting `FilterForBilling` as static helper ensures consistency. |
| 7 | Money type | `decimal` vs `float` | **`float`** | Already the codebase standard (`CurrentPriceServiceUtils`, `StorePayment.Price`). Consistency over purity. |
| 8 | Controller auth widening | Modify class-level vs action-level | **Action-level `[HasPermission]`** | Class-level `[HasPermission(SuperAdmin, StoresAdmin)]` stays. New endpoints add `[HasPermission(SuperAdmin, ReSellerAdmin)]` at action level. No regression on existing endpoints. |

## Data Flow

```
Store Payment Recording:
  POST /stores/{id}/payments (SuperAdmin | ReSeller)
    → RegisterStorePaymentCommand
    → IStoreRepository.GetStoreWithModulesAndReSellerOwnerAsync
    → IStorePaymentRepository.GetLatestPaidByStoreIdAsync
    → StoreBillingUtils.GetNextDueDate + GetReSellerCommission
    → StorePayment.Create (snapshots reseller, sets ByReSeller)
    → IStorePaymentRepository.AddAsync + SaveChangesAsync

GetMe Enforcement:
  GET /v1/auth/me
    → GetMeQueryHandler
    → IStoreBillingService.GetStatusAsync(storeId)
       ├─ ISystemConfigurationRepository (grace, trial)
       ├─ IStorePaymentRepository.GetLatestPaidByStoreIdAsync
       └─ StoreBillingUtils (GetNextDueDate, GetStatus, IsPaidPlanActive)
    → FilterForBilling(rawModules, paidPlanActive)
    → CurrentUserDto { PaymentDueDate, IsInTrial, PaymentStatus }
```

## File Changes

### New Files (8)

| File | Purpose |
|------|---------|
| `Domain/Common/Utils/StoreBillingUtils.cs` | Pure static: `StoreBillingStatusType` enum, `GetStatus`, `GetNextDueDate`, `IsPaidPlanActive`, `IsInTrial`, `GetReSellerCommission` |
| `Application/Abstractions/Billing/IStoreBillingService.cs` | Interface: `GetStatusAsync`, `IsPaidPlanActiveAsync`; `StoreBillingStatus` record |
| `Application/Services/Billing/StoreBillingService.cs` | Orchestrates repos + config + utils |
| `Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs` | Handler with commission, snapshots, due-date advance |
| `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs` | Collections, scoped by role |
| `Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/GetReSellerCommissionsQuery.cs` | Commission totals grouped by period |
| `Application/Dtos/StoreManagement/StoreToCollectDto.cs` | StoreId, StoreName, OwnerName, Amount, NextDueDate, Status |
| `Application/Dtos/StoreManagement/ReSellerCommissionDto.cs` | Year, Month, PaymentCount, TotalCommission |

### Modified Files (17)

| File | Change |
|------|--------|
| `Domain/Common/Enums/SystemConfigurationType.cs` | Add `PaymentGraceDays = 3` |
| `Domain/Entities/Stores/Store.cs` | `PaymentStartDate` → `DateOnly?`, update factory/ctor |
| `Domain/Entities/StorePayments/StorePayment.cs` | Add 5 fields: `ReSellerId`, `ReSellerPercentDiscountPrice`, `ReSellerDiscountPrice`, `ReSellerAmount`, `ByReSeller`. Update `Create` factory. |
| `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | Add `GetPaymentGraceDaysAsync()` |
| `Domain/Interfaces/Repositories/IStorePaymentRepository.cs` | Add `GetLatestPaidByStoreIdAsync`, `GetPaidWithReSellerByReSellerUserAsync`, `GetAllPaidWithReSellerAsync` |
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Add `GetStoreWithModulesAndReSellerOwnerAsync`, `IsStoreOwnedByReSellerUserAsync`, `GetPaidStoresAsync`, `GetPaidStoresByReSellerUserAsync` |
| `Domain/Interfaces/Repositories/IModuleRepository.cs` | Add `GetModulesByIdsAsync` |
| `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs` | Implement `GetPaymentGraceDaysAsync` |
| `Infrastructure/Persistence/Repositories/StorePaymentRepository.cs` | Implement new query methods |
| `Infrastructure/Persistence/Repositories/StoreRepository.cs` | Implement new query methods |
| `Infrastructure/Persistence/Repositories/ModuleRepository.cs` | Implement `GetModulesByIdsAsync` |
| `Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs` | Seed `PaymentGraceDays = "5"` |
| `Infrastructure/Persistence/EntityConfigurations/StorePaymentEntityTypeConfiguration.cs` | FK + index for `ReSellerId` |
| `Application/Dtos/Authentication/CurrentUserDto.cs` | Add `PaymentDueDate`, `IsInTrial`, `PaymentStatus` |
| `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Inject `IStoreBillingService`, `FilterForBilling`, set new DTO fields |
| `Application/Services/Stores/CreateStoreService.cs` | Pass `null` for `PaymentStartDate` |
| `Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` | Activation-on-first-paid, owner lock after activation |
| `SMCA.WebApi/Filters/HasPermissionAttribute.cs` | Inject `IStoreBillingService`, filter paid modules |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Add 3 endpoints with action-level `[HasPermission(SuperAdmin, ReSellerAdmin)]` |
| `Application/DependencyInjection.cs` | Register `IStoreBillingService` |

## Interfaces / Contracts

### `StoreBillingUtils` (static, no interface)
```
static float GetReSellerCommission(float amount, float percent, float flat)
static DateOnly GetNextDueDate(DateOnly paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate)
static StoreBillingStatusType GetStatus(DateOnly? paymentStartDate, DateOnly nextDueDate, DateOnly today, int dueSoonDays, int graceDays)
static bool IsPaidPlanActive(DateOnly? paymentStartDate, DateOnly nextDueDate, DateOnly today, int graceDays)
static bool IsInTrial(DateOnly? paymentStartDate, int trialMonths, DateOnly today)
```

### `IStoreBillingService` (application service)
```
Task<StoreBillingStatus> GetStatusAsync(Guid storeId)
Task<bool> IsPaidPlanActiveAsync(Guid storeId)

record StoreBillingStatus(DateOnly? PaymentStartDate, DateOnly? NextDueDate,
    StoreBillingStatusType Status, bool IsInTrial, bool IsPaidPlanActive)
```

### `RegisterStorePaymentCommand`
```
POST /api/v1/stores/{storeId}/payments
→ 200 ResponseResult<bool>
Auth: [HasPermission(SuperAdmin, ReSellerAdmin)]
```

### `GetStoresToCollectQuery`
```
GET /api/v1/stores/to-collect
→ 200 ResponseResult<List<StoreToCollectDto>>
Auth: [HasPermission(SuperAdmin, ReSellerAdmin)]
```

### `GetReSellerCommissionsQuery`
```
GET /api/v1/stores/reseller-commissions
→ 200 ResponseResult<List<ReSellerCommissionDto>>
Auth: [HasPermission(SuperAdmin, ReSellerAdmin)]
```

## Database Changes

| Migration | Changes |
|-----------|---------|
| `Add-PaymentGraceDays-SystemConfig` | Insert `SystemConfiguration { Id=3, Key="PaymentGraceDays", Value="5" }` |
| `Store-PaymentStartDate-Nullable` | Alter `Store.PaymentStartDate` → nullable `DateOnly` |
| `StorePayment-ReSeller-Commission-Fields` | Add 5 columns to `StorePayment` + FK to `ReSeller` (optional) + index on `ReSellerId` |

All migrations are additive — no data loss. Existing `Store.PaymentStartDate` values are preserved (treated as already-activated).

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| **Unit (StoreBillingUtils)** | Commission math, due date, status boundaries, `IsPaidPlanActive`, `IsInTrial` | Direct static calls, no mocks. Theory with boundary values (due-soon at ±5d, grace at ±5d). |
| **Unit (StoreBillingService)** | Status orchestration, paid-plan-active for overdue/trial/active | Mock `IStoreRepository`, `IStorePaymentRepository`, `ISystemConfigurationRepository` |
| **Unit (UpdateStoreHandler)** | Activation on first paid module, owner lock after activation | Mock all deps. Capture `store.PaymentStartDate` |
| **Unit (GetMeHandler)** | `FilterForBilling` static helper — overdue → only `PriceIncluded` modules | Direct call, no mocks |
| **Unit (RegisterPayment)** | SuperAdmin creates payment, ReSeller creates with commission, ReSeller not owning store → exception, never-activated → exception, due date advance | Mock repos, capture `StorePayment` via `Callback` |
| **Unit (GetStoresToCollect)** | Filter to `PorVencer`/`EnGracia` only, role scope | Mock `IStoreBillingService.GetStatusAsync` per store |
| **Unit (GetReSellerCommissions)** | Group by year/month, sum commissions, role scope | Mock repo data |
| **E2E (GetMeBilling)** | Overdue store → free modules only + `PaymentStatus == "Vencido"`; active store → paid modules present | Real Postgres `smca_test`, seed via `DbTestHelpers` |
| **E2E (RegisterPayment)** | ReSeller POST → `ByReSeller=true`, `ReSellerAmount>0`; wrong ReSeller → 400 | Real Postgres, seed reseller+owner+store |

## Migration / Rollout

No feature flag needed — enforcement is compute-on-read (reversible). Deploy order: Tasks 1-4 (data model) → Task 5 (service) → Tasks 6-7 (enforcement + payment) → Tasks 8-9 (queries). Rollback: revert commits per task. Existing `PaymentStartDate` values preserved.

## Open Questions

None — fully specified in the approved design spec and implementation plan.
