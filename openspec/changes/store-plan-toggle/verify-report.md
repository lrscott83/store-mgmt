# Verify Report: store-plan-toggle

**Date**: 2026-09-02
**Scope**: Only the changes made by this change (user-mandated; pre-existing failing tests excluded)
**Verdict**: **PASS**

## 1. Scoped Test Results

| Suite | Result |
|---|---|
| Backend `Application.Tests` — filter `ToggleStorePlan\|GetStoresByCurrentUser` | ✅ 12/12 passed (8 toggle + 4 query-widening) |
| Frontend `store-list.test.tsx` | ✅ 16/16 passed (incl. 5 new toggle-plan tests) |
| Frontend `store-card-list.test.tsx` | ✅ 15/15 passed (incl. Change Plan gear item tests) |

## 2. Billing Verification (Task 5.1 — R8/R12) — code review

- `StoreBillingUtils.GetStatus(null, ...)` returns `NoAplica` (StoreBillingUtils.cs:33) ✅
- `FilterForBilling` with `NoAplica` returns **all module ids** (StoreBillingUtils.cs:55-56) — a store toggled to Free keeps its free modules accessible ✅
- `GetNextDueDate` with null `paymentStartDate` returns null — billing clock cleanly reset (StoreBillingUtils.cs:27) ✅

**Conclusion**: Paid→Free nullification degrades safely. No downstream consumer assumes monotonic non-null `PaymentStartDate`.

## 3. Business Rules Spot-Check (read-only)

`ToggleStorePlanCommand.cs`:
- Role guard: only SuperAdmin or ReSeller (lines 70-73) ✅
- Precondition: store active (81-82) ✅
- Precondition: owner's linked User active (84-85) ✅
- ReSeller ownership check when not SuperAdmin (88-94) ✅
- Free→Paid: `paymentStartDate = today` via `IDateTimeProvider` (119), adds ALL paid modules, reactivates soft-deleted ones with refreshed pricing (121-150), generates/reactivates StoreRoleFeatures (153-165) ✅
- Paid→Free: `paymentStartDate = null` (174), soft-deletes paid modules (180-184), deactivates their StoreRoleFeatures (187-193) ✅
- NoTracking gotcha handled: explicit `UpdateAsync(store)` before `SaveChangesAsync` (106-109) ✅

Frontend:
- `/admin/stores` loader swapped `superAdminLoader` → `resellerLoader` (store-list.tsx:13); `superAdminLoader` remains frozen in loaders.ts ✅
- Direction-aware confirm dialog: Free→Paid shows "Activar plan pago", Paid→Free shows "Desactivar plan pago" (store-list.tsx:80-103) ✅
- Gear menu "Cambiar plan" item only renders for active stores with `onToggle` wired (store-card-list.tsx:64-66) ✅
- List re-fetches after successful toggle (store-list.tsx:99) ✅

## 4. E2E Tests (Tasks 4.3 / 4.4) — deferred, recommendation

New backend E2E tests (xUnit + WebAppFixture) and Playwright flows are permitted (adding only) but were outside this verify scope. Recommended scenarios for a follow-up work unit:

1. SuperAdmin Free→Paid toggle (happy path) — DB assertions: PaymentStartDate set, paid StoreModules active, StoreRoleFeatures generated
2. SuperAdmin Paid→Free toggle — PaymentStartDate null, paid modules soft-deleted, features deactivated
3. ReSeller toggle on own store (happy) / on foreign store (rejected)
4. Toggle blocked: inactive store / inactive owner user
5. GetMe after Paid→Free returns free modules only (billing NoAplica path)
6. Frontend Playwright: gear → "Cambiar plan" → confirm → list refreshes

**Recommendation**: defer to a dedicated E2E work unit (matches the repo's E2E coverage workflow).

## 5. Typecheck

Verified during apply: 0 new errors (3 pre-existing files on base unchanged).
