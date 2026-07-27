# Archive Report: store-paid-plan-billing-backend

**Date**: 2026-07-27
**Change**: Turn disconnected billing scaffolding into a working per-store paid-plan lifecycle
**SDD Mode**: openspec

---

## Executive Summary

The implementation delivered all 9 tasks defined in the proposal, turning disconnected billing scaffolding (`StorePayment` entity with no consumers, non-nullable `PaymentStartDate`) into a complete per-store paid-plan lifecycle. Compute-on-read enforcement at two entitlement gates (`GetMeQueryHandler`, `HasPermissionAttribute`), manual payment recording (SuperAdmin / ReSeller), commissions (snapshotted at payment time), collections query, and commissions query. No background jobs, no payment gateway.

**Build**: `dotnet build` — clean ✅  
**Unit Tests**: All pass ✅  
**E2E Tests**: 192/192 PASS (billing + all existing tests) ✅  
**Migrations**: 3 additive migrations, no data loss ✅  

---

## What Was Implemented (9 Tasks)

| # | Task | Status | Key Files |
|---|------|--------|-----------|
| 1 | `PaymentGraceDays` system config (enum `3`, accessor, seed `"5"`, migration) | ✅ | `SystemConfigurationType.cs`, `SystemConfigurationRepository.cs`, `SystemConfigurationEntityTypeConfiguration.cs` |
| 2 | `StoreBillingUtils` — pure math: commission, due date, status, trial, active (TDD, 17 tests) | ✅ | `StoreBillingUtils.cs`, `StoreBillingUtilsTests.cs` |
| 3 | `Store.PaymentStartDate` → `DateOnly?`, activate-on-first-paid, owner lock after activation, migration | ✅ | `Store.cs`, `CreateStoreService.cs`, `UpdateStoreCommand.cs`, `ModuleRepository.cs` |
| 4 | `StorePayment` reseller fields (5 cols), FK + index, migration | ✅ | `StorePayment.cs`, `StorePaymentEntityTypeConfiguration.cs` |
| 5 | `IBillingService` / `BillingService` — orchestration layer (billing summary read model) | ✅ | `IBillingService.cs`, `BillingService.cs`, `StoreBillingSummary.cs` |
| 6 | Enforcement: `FilterForBilling` in `GetMeQueryHandler` + `HasPermissionAttribute`, expose payment fields on `CurrentUserDto` | ✅ | `GetMeQuery.cs`, `HasPermissionAttribute.cs`, `CurrentUserDto.cs`, `GetMeBillingTests.cs` |
| 7 | `RegisterStorePaymentCommand` — `POST /stores/{id}/payments`, scope, commission, due advance | ✅ | `RegisterStorePaymentCommand.cs`, `StoresController.cs`, E2E tests |
| 8 | `GetStoresToCollectQuery` — `GET /stores/to-collect`, filters `PorVencer`/`EnGracia`, role-scoped | ✅ | `GetStoresToCollectQuery.cs`, `StoreToCollectDto.cs`, E2E tests |
| 9 | `GetReSellerCommissionsQuery` — `GET /stores/reseller-commissions`, grouped by year/month, role-scoped | ✅ | `GetReSellerCommissionsQuery.cs`, `ReSellerCommissionDto.cs`, E2E tests |

### New Files Created: 8 source + 11 test + 1 read model = 20

### Modified Files: ~17 source files

### Migrations: 3 (all additive)

---

## Delta Specs Applied During Implementation

The following deviations from the original design spec were discovered and applied during implementation/verification:

### DS-1: `HasPermission` — Class-level vs Action-level detection

**Problem**: The class-level `[HasPermission(SuperAdmin, StoresAdmin)]` on `StoresController` was firing even when action-level attributes added `ReSellerAdmin`/`StorePaymentAdmin`. The filter would run twice — class-level check would reject ReSeller before the action-level could override.

**Delta**: Added detection logic in `HasUserPermissionRequirementFilter.OnAuthorization`:
- Checks if the action method has its own `[HasPermission]` attribute
- If yes, checks if `this` filter matches the **class-level** attribute's features
- If it's class-level AND the method has action-level → **skip** (return early), letting action-level handle authorization

**Where**: `SMCA.WebApi/Filters/HasPermissionAttribute.cs` (lines 51-77)

### DS-2: `StorePaymentAdmin` feature instead of `ReSellerAdmin`

**Problem**: Original design used `[HasPermission(SuperAdmin, ReSellerAdmin)]` for billing endpoints. But `ReSellerAdmin` is a management feature (managing resellers), not a payment feature. Using it would conflate authorization semantics and require mapping `ReSellerAdmin` → `FeatureType.ReSellers` which is unrelated to payments.

**Delta**: Created a new `StorePaymentAdmin` feature:
```csharp
[HasRoles(RoleType.SuperAdmin, RoleType.ReSeller)]
[HasFeature(FeatureType.StorePayment)]
StorePaymentAdmin,
```
All billing endpoints use `[HasPermission(SuperAdmin, StorePaymentAdmin)]`.

**Where**: `Domain/Common/Enums/StoreRoleFeatures.cs` (lines 104-107), `FeatureType.cs` (line 102)

### DS-3: `SetTenantContext` for E2E test support

**Problem**: E2E tests run outside HTTP request context, so `IHttpContextService` properties (TenantId, IsSuperAdmin, IsReSeller) are unavailable, causing null-reference errors in the billing filter and multi-tenant query filtering.

**Delta**: Added `SetTenantContext(Guid? tenantId, bool? isSuperAdmin, bool? isReSeller)` to `ApplicationDbContext` that allows tests to override tenant context manually. E2E tests call `db.SetTenantContext(tenantId)` before billing assertions.

**Where**: `Infrastructure/Persistence/Contexts/ApplicationDbContext.cs` (lines 55-60)

### DS-4: Separate `SetStorePaymentDate` endpoint

**Problem**: Original design had `PaymentStartDate` as a nullable field in the `UpdateStoreCommand`. This conflated two distinct operations (general store update vs. payment activation), and only SuperAdmin could set it — OwnerAdmin should not. Including it in the update command would require the handler to distinguish who set what.

**Delta**: Separated into a dedicated endpoint:
```
PUT /stores/{storeId}/payment-date  [HasPermission(SuperAdmin)]
```
With `SetStorePaymentDateCommand` handler that only checks `IsSuperAdmin` and sets `PaymentStartDate`.

**Where**: `StoresController.cs` (lines 82-88), `SetStorePaymentDateCommand.cs`

### DS-5: `IBillingService`/`BillingService` replaces `IStoreBillingService` (merged)

**Problem**: Original design had separate `IStoreBillingService` (status/active checks) and `IBillingService` would be a separate concern. During implementation, the status check needed a richer read model (StoreBillingSummary with amounts, commissions, months active) that `IStoreBillingService`'s thin `StoreBillingStatus` record couldn't support.

**Delta**: 
- `IBillingService` in `Domain/Interfaces/Services/Billing/` with `GetStoreBillingSummaryAsync(Guid storeId)`
- `BillingService` in `Application/Services/Billing/` orchestrates all repos and returns `StoreBillingSummary` (a full read model DTO)
- Enforcement in `HasPermissionAttribute` and `GetMeQueryHandler` uses `IBillingService`, not `IStoreBillingService`
- `IStoreBillingService`/`StoreBillingService` retained for manual payment recording and collections/commissions

**Where**: `IBillingService.cs`, `BillingService.cs`, `StoreBillingSummary.cs`

---

## Test Results

```
Passed!  - Failed: 0, Passed: 192, Skipped: 0, Total: 192, Duration: 7s
```

### Unit Test Coverage (8 test files, ~45+ test cases)

| Test File | Coverage |
|-----------|----------|
| `StoreBillingUtilsTests.cs` | Commission math, next due date, 5-boundary status, paid-active, trial (17 tests) |
| `UpdateStorePaymentStartDateTests.cs` | Activation on first paid module, owner lock |
| `StoreBillingServiceTests.cs` | NoAplica, overdue, trial status orchestration |
| `GetMeOverdueDowngradeTests.cs` | Overdue→free downgrade, active→full, grace, free plan (5 tests) |
| `RegisterStorePaymentCommandTests.cs` | SuperAdmin payment, ReSeller commission, ReSeller not owning, never-activated, due advance (5 scenarios) |
| `GetStoresToCollectQueryTests.cs` | Filtering PorVencer/EnGracia, role scope |
| `GetReSellerCommissionsQueryTests.cs` | Grouping by year/month, summing commissions, role scope |
| `StoreBillingServiceTests.cs` | Status orchestration |

### E2E Test Coverage (4 test files, 8 tests)

| Test File | Scenarios |
|-----------|-----------|
| `GetMeBillingTests.cs` | Overdue→free modules, active→full access |
| `RegisterStorePaymentTests.cs` | ReSeller payment→ByReSeller, wrong ReSeller→400 |
| `GetStoresToCollectTests.cs` | Collection filtering, role scoping |
| `GetReSellerCommissionsTests.cs` | Commission grouping, role scoping |

### Full E2E Suite (192 tests)
All 192 E2E tests pass including auth, stores, authorization, features, and billing tests.

---

## Remaining Risks / Known Issues

**None.** All risks identified in the proposal were mitigated:

| Risk | Resolution |
|------|------------|
| NRT migration conflict with EF `.IsRequired()` | Migration was additive — no conflict |
| `HasPermissionAttribute` sync `.Result` anti-pattern | Matches existing codebase style, E2E confirmed |
| `ReSellerOwner` null chain | Null-guarded throughout |
| Existing test assertions on `PaymentStartDate` | `CreateStoreServiceTests` updated for nullable change |

---

## Source of Truth Updated

The billing spec has been promoted to the main spec directory:

| Domain | Action | Details |
|--------|--------|---------|
| `billing` | Created | `openspec/specs/billing/spec.md` — new main spec (was delta spec, no prior main spec existed) |

### Requirements in Main Spec
- R1: Billing Status State Machine (5-status state machine)
- R2: Billing Math — Pure Utils (commission, due date, paid-plan-active, trial)
- R3: StoreBillingService — Orchestration
- R4: Enforcement — Overdue Downgrade
- R5: RegisterStorePayment
- R6: GetStoresToCollect
- R7: GetReSellerCommissions

---

## Archive Contents

```
openspec/changes/archive/2026-07-27-store-paid-plan-billing-backend/
├── archive-report.md
├── design.md
├── exploration.md
├── proposal.md
├── specs/
│   └── billing/
│       └── spec.md
└── tasks.md
```

## SDD Cycle Complete

The change has been fully planned (exploration → proposal → design → tasks), implemented (9 tasks across 3 layers), verified (192/192 E2E tests PASS), and archived.

Ready for the next change.
