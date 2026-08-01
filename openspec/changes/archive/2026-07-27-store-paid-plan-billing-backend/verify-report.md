# Verify Report: store-paid-plan-billing-backend

**Change**: `2026-07-27-store-paid-plan-billing-backend`
**Verification date**: 2026-07-31
**Verdict**: ✅ **PASS** (with 2 documented gaps — see Risks)

---

## Spec Requirement Verification

| Req | Spec | Real Code Evidence | Verdict |
|-----|------|--------------------|---------|
| R1 | 5-state status machine (`NoAplica`/`AlDia`/`PorVencer`/`EnGracia`/`Vencido`) | `StoreBillingStatusType` enum + `StoreBillingUtils.GetStatus` in `Domain/Common/Utils/StoreBillingUtils.cs` — 5-branch logic matches spec table exactly | ✅ PASS |
| R2.1 | `GetReSellerCommission(amount, percent, flat)` = amount − GetCurrentPrice | `StoreBillingUtils.GetReSellerCommission` delegates to `CurrentPriceServiceUtils.GetCurrentPrice` | ✅ PASS |
| R2.2 | `GetNextDueDate` — no payments: start + trial + 1 month; with payment: last `PaymentBeforeDate` | `StoreBillingUtils.GetNextDueDate` — `lastPaidBeforeDate ?? startDate.AddMonths(trialMonths + 1)` | ✅ PASS |
| R2.3 | `IsPaidPlanActive` = start ≠ null && today ≤ nextDue + grace | `StoreBillingUtils.IsPaidPlanActive` — exact match | ✅ PASS |
| R2.4 | `IsInTrial` = start ≠ null && today ≤ start + trial | `StoreBillingUtils.IsInTrial` — exact match | ✅ PASS |
| R3 | Orchestration service produces billing status from repos + utils | `IBillingService.GetStoreBillingSummaryAsync` via `BillingService` (`Application/Services/Billing/BillingService.cs`) — loads store, modules, last payment, configs; delegates to utils. **Deviation**: design named it `IStoreBillingService.GetStatusAsync`/`IsPaidPlanActiveAsync`; final code consolidated into `IBillingService`/`StoreBillingSummary` (DS-5, see Risks). | ✅ PASS |
| R4 | Enforcement at two gates: `GetMeQueryHandler` + `HasPermissionAttribute`; `CurrentUserDto` exposes `PaymentDueDate`/`IsInTrial`/`PaymentStatus` | Both gates verified: `GetMeQuery.cs` (line 70-71) injects `IBillingService` and applies `StoreBillingUtils.FilterForBilling`; `HasPermissionAttribute.cs` (line 87-88) mirrors it. `CurrentUserDto` has all 3 fields (line 101-103 in GetMe). | ✅ PASS |
| R5 | `POST /stores/{id}/payments` — SuperAdmin any store / ReSeller own store; guards; amount; commission; due advance; `Paid` status | `RegisterStorePaymentCommand.cs` — role guard (line 50), reseller ownership check (line 62), never-activated guard (line 68), amount = sum of `GetCurrentPrice` on active non-free modules (line 72-74), commission from `ReSellerOwner` snapshot (line 77-83), due advance +1 month (line 91-92), `StorePayment.Create` with `Paid` status + `ByReSeller` (line 96-108). Endpoint at `StoresController.cs` line 163-167. | ✅ PASS |
| R6 | `GET /stores/to-collect` — `PorVencer`/`EnGracia` only, role-scoped | `GetStoresToCollectQuery.cs` — role guard (line 51), `GetPaidStoresAsync` vs `GetPaidStoresByReSellerUserAsync` (line 55-57), status filter (line 88-89), amount (line 92-95), ordered by `NextDueDate` (line 108). Endpoint at `StoresController.cs` line 169-173. | ✅ PASS |
| R7 | `GET /stores/reseller-commissions` — grouped by year/month, `PaymentCount`, `TotalCommission` = sum `ReSellerAmount` | `GetReSellerCommissionsQuery.cs` — role guard (line 40), `GetAllPaidWithReSellerAsync` vs `GetPaidWithReSellerByReSellerUserAsync` (line 47/52), group by `(Year, Month)` (line 56), sum `ReSellerAmount` (line 62). Endpoint at `StoresController.cs` line 175-179. | ✅ PASS |
| Data | `PaymentGraceDays = 3`, seed `"5"`, accessor fallback 5 | `SystemConfigurationType.cs` line 14; seed in `SystemConfigurationEntityTypeConfiguration.cs`; `GetPaymentGraceDaysAsync` in `SystemConfigurationRepository.cs` | ✅ PASS |
| Data | `Store.PaymentStartDate` → `DateOnly?` | `Store.cs` line 33 — `public DateOnly? PaymentStartDate { get; set; } = null;` | ✅ PASS |
| Data | `StorePayment` 5 reseller fields + extended factory | `StorePayment.cs` lines 21-25 (fields), 39-53 (`Create` with all params, `PaidDate = UtcNow`, `StorePaymentCreatedEvent`) | ✅ PASS |
| Data | Migrations additive | `20260727164714_Add-PaymentGraceDays-SystemConfig`, `20260727165912_StorePayment-ReSeller-Commission-Fields`, `20260728194358_Backfill-PaymentStartDate-Null` (backfills `'-infinity'` → `NULL`) | ✅ PASS |

## Delta Specs Verification (DS-1..DS-5 from archive-report)

| Delta | Real Code Evidence | Verdict |
|-------|--------------------|---------|
| DS-1: class-level vs action-level `[HasPermission]` detection | `HasPermissionAttribute.cs` lines 51-78 — checks `MethodInfo.GetCustomAttributes` for `HasPermissionAttribute`, skips class-level filter when action has its own | ✅ PASS |
| DS-2: `StorePaymentAdmin` feature (was `ReSellerAdmin`) | `StoreRoleFeatures.cs` line 106-107 — `[HasRoles(SuperAdmin, ReSeller)] [HasFeature(FeatureType.StorePayment)]`; `FeatureType.cs` line 102 — `StorePayment = 91`; all 3 billing endpoints use `[HasPermission(SuperAdmin, StorePaymentAdmin)]` | ✅ PASS |
| DS-3: `SetTenantContext` for E2E | `ApplicationDbContext.cs` line 56 — `public void SetTenantContext(...)` | ✅ PASS |
| DS-4: separate `SetStorePaymentDate` endpoint | `StoresController.cs` lines 110-115 — `PUT {storeId}/payment-date` `[HasPermission(SuperAdmin)]`; `SetStorePaymentDateCommand.cs` exists | ✅ PASS |
| DS-5: `IBillingService`/`BillingService` orchestration | `IBillingService.cs` + `BillingService.cs` + `StoreBillingSummary.cs` exist and are the active orchestration. `IStoreBillingService.cs`/`StoreBillingService.cs` were created in `b57fc3e4` then **deleted** in `4eb56c07` — final code has only `IBillingService`. | ✅ PASS |

## Build Verification

| Step | Result |
|------|--------|
| `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj` | ✅ 0 errors, 8 warnings (pre-existing NU1902/NU1903 package vulnerabilities — not introduced by this change) |
| `dotnet test Application.Tests` (billing filter) | ✅ 32/32 PASS |
| `dotnet test Application.Tests` (full) | ✅ 300/300 PASS |
| `dotnet test SMCA.WebApi.E2ETests --filter ~Billing` | ✅ 39/39 PASS (real Postgres) |
| `dotnet test SMCA.WebApi.E2ETests` (full) | ✅ 237/237 PASS |

## Risks / Gaps (honest findings)

1. **`UpdateStorePaymentStartDateTests.cs` never created** — tasks.md task 3.3 (activation + owner-lock unit tests) was marked "pending — not in this apply batch" and no unit test file exists in `Application.Tests`. **However**, the behavior IS covered by E2E `SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs` (`Paid_module_on_null_start_sets_paymentStartDate_to_today`, `Free_modules_only_leaves_paymentStartDate_null`), so the spec behavior is tested — just at E2E level, not unit level as designed.

2. **`StoreBillingServiceTests.cs` never created** — tasks.md task 5.2 planned a `StoreBillingServiceTests` file. The final code has `BillingServiceTests.cs` instead (DS-5 consolidation), which tests the same orchestration through `IBillingService`. Spec behavior verified.

3. **Archive-report claims 192/192 E2E** — current suite is 237/237 (the suite grew with the `billing-e2e-coverage-fixes` work in `4eb56c07`). Not a defect — the archive report was accurate at its time.

4. **Pre-existing package vulnerabilities** — 8 NU warnings (System.Text.Json, AutoMapper, RestSharp). Out of scope for this change.

## Final Verdict

**PASS** ✅ — All 7 spec requirements (R1-R7) and all data-model changes are implemented in real code and verified by build + 300 unit tests + 237 E2E tests (including 39 billing-specific). The 5 delta specs are present and match the archive-report. Two test-file names in `tasks.md` were consolidated into different files (`BillingServiceTests.cs` for Task 5; E2E `StoreActivationTests.cs` for Task 3) — behavior coverage is complete either way. Safe to consider archived.
