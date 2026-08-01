# Archive Report

**Change**: order-offline-service-parity (Fase 6, Slice 2 of 3)
**Date Archived**: 2026-07-31
**Domain**: order-service
**Branch**: `feat/frontend-parity-audit`

---

## Summary

Brought React's `OrderOfflineService` (the heaviest offline service) to full 1:1 parity with
Angular's `order-offline.service.ts` (471 lines) by applying the already-ratified A/B/C/D
return-shape framework (`service-return-shape-parity` Order categorization) plus the ratified
decision gates (#1083). Every in-scope public method now mirrors Angular's name, signature,
return shape, and behavior.

Key deliverables:

| Area | What changed |
|------|--------------|
| Renames (rule 3) | `create`→`createOrder`, `update`→`updateTodayOrder`, `deactivate`→`deactivateOrder`, `filterOrders`→`filterOrdersObservable`; Angular param order restored |
| Return shapes (A/B/C/D) | `createOrder`/`getActiveTodayOrdersObservable`/`filterOrdersObservable`/`getCategoryCartItemsViewObservable` → `Promise<BaseResponseModel<T>>` (C); `getCategoryCartItemsView` → sync `BaseResponseModel` (B); `updateTodayOrder`→`DataResult<Order>`, `activateOrder`/`deactivateOrder`→`Result` (D, never throw) |
| Inventory gate | Invented `hasInventoryModule` ctor param REMOVED — gate internalized via `useAuthStore.getState().user` + `hasInventoryModuleAvailable(user)`, mirroring Angular's injected `AuthorizationService` (no ctor re-widening) |
| Cascade guard (gate c) | `deactivateOrder` restored: `updateOrderActive` failure → `Result.Failure`; `deactivateSaleCreditByOrderId` called UNCONDITIONALLY (Angular has no `isCredit` guard); its failure short-circuits BEFORE inventory restock |
| Missing methods | `getOrderById` (de-inlined 3 duplicates), `getOrdersJson`, `getActiveTodayOrdersObservable`, `getCategoryCartItemsViewObservable` ported |
| Behavior gates (d, f) | `getActiveOrdersInDay` ignores its `date` param (always today); revival on read is date-only |
| Folded discoveries | Legacy-data backfill (`isCredit=false`/`paymentType=Efectivo`) on read; date-ascending sort in `activeOrdersBetween` + filter chain |
| CRITICAL fix (post-verify) | `OrderItem.order` stamped from `product.order` (catalog display order) instead of cart index |

Out of scope (deferred, gate e): `getLastMonthSaleProfits`/`getLastMonthSales` + `getByDateRange`
(coupled to pending React-invented aggregation-service removal) and Slice 3 (edit-order-details).

## Tasks

| Metric | Value |
|--------|-------|
| Total tasks | 43 (WU0 T0.1-T0.3, WU1 T1.1-T1.19, WU2 T2.1-T2.6, WU3 T3.1-T3.9, WU4 T4.1-T4.8, WU5 T5.1-T5.6) |
| Completed | 43 |
| Incomplete | 0 |

All tasks in `tasks.md` marked `[x]`; verify independently cross-checked against actual code
state (not trusted from apply-progress alone).

## Verification Results

| Check | Result |
|-------|--------|
| Build | ✅ PASSED — `pnpm -C apps/web-store-pos build` (client + service worker, SPA mode) |
| Type check | ✅ PASSED — `pnpm -C apps/web-store-pos exec tsc --noEmit` clean, exit 0 |
| Tests | ✅ 1640/1640 passed — `npx turbo run test --force` (uncached re-run, 3/3 tasks, 116 test files) |
| Spec compliance | 14/14 scenario groups compliant (all spec Requirements have passing covering tests) |
| TDD compliance | 6/6 checks passed |
| Critical issues | ❌ None |

**Verdict**: PASS WITH WARNINGS — 0 CRITICAL / 2 WARNING / 2 SUGGESTION (both WARNINGs are
pre-existing or process-only, not regressions; do not block archive):

1. **Pre-existing `description` fallback divergence** (`details || (isCredit ? client : '')`
   vs Angular's `description: details`) — predates this SDD, unchanged by it, correctly coupled
   to out-of-scope Slice 3. Flagged for Slice 3 to resolve.
2. **Work-unit commit grouping deviates from design's 4-commit plan** — WU2+WU3 combined into
   `f6ce1c4` (same-file/same-helper compile coupling), plus one extra out-of-plan parity-fix
   commit `f958ce9`. Independently verified as faithful and non-lossy via commit diffs.

## Spec Sync

The delta spec (`specs/order-service/spec.md`) was **already merged** — this change created the
canonical main spec (no prior `order-service` spec existed), committed in `6a5ad4cd`
"docs(order-service): archive order-offline-service-parity". All 8 delta requirements are
present verbatim in `openspec/specs/order-service/spec.md`:

- Public Method Names And Signatures Mirror Angular ✅
- Return Shapes Follow The Ratified A/B/C/D Categorization ✅
- Inventory Deduction Gate Is Internal, Not A Parameter ✅
- deactivateOrder Cascade-Guard Blocks On SaleCredit Failure ✅
- getActiveOrdersInDay Ignores Its date Parameter ✅
- Revival On Read Is date-Only ✅
- getOrderById Replaces Inline Duplication ✅
- getOrdersJson Is Exposed ✅

The main spec now also contains later additions from already-archived changes (slice 3
`edit-order-details-parity` at `7ab18ec7`, `angular-react-parity-fixes` at `979ef4c0` — cart
store order-details state, edit-order-details modal, `getByDateRange` removal, and the Fase 6
Closed Capabilities section). No additional merge required.

Archive folder already lives under `openspec/changes/archive/2026-07-14-order-offline-service-parity/`
(date-prefixed per convention). Only `archive-report.md` was missing; created here to complete
the audit trail.

## Archive Contents

| Artifact | Status |
|----------|--------|
| `proposal.md` | ✅ Present |
| `design.md` | ✅ Present |
| `tasks.md` | ✅ Present (43/43 complete) |
| `specs/order-service/spec.md` | ✅ Present (delta) — merged into main spec |
| `apply-progress.md` | ✅ Present |
| `verify-report.md` | ✅ Present |
| `archive-report.md` | ✅ Created |

## Files Changed (Implementation)

| File | Action |
|------|--------|
| `frontend-react/packages/domain/src/errors/order-errors.ts` (+ test) | Added — `OrderErrors.NotExists` (WU0) |
| `frontend-react/apps/web-store-pos/app/sales/lib/services/order-offline-service.ts` | Modified — all renames/shapes/gates/methods (WU1-WU4, fixes) |
| `frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/order-offline-service.test.ts` | Modified — 102 tests, all behavior coverage |
| `frontend-react/apps/web-store-pos/app/shared/components/cart-shell.tsx` (+ test) | Modified — async `createOrder` await + envelope check |
| `frontend-react/apps/web-store-pos/app/sales/routes/today-orders.tsx` (+ sales-routes.test.tsx) | Modified — `updateTodayOrder`/`deactivateOrder` `.succeeded` checks |
| `frontend-react/apps/web-store-pos/app/sales/routes/today-stats.tsx` (+ test) | Modified — `.data` unwrap on B-shape `getCategoryCartItemsView` |

## Implementation Commits

| Commit | Content |
|--------|---------|
| `f23740b` | WU0 — `feat(domain): add OrderErrors mirroring order.errors.ts` |
| `d36e8ba` | WU1 — `feat(sales): add getOrderById/getOrdersJson/*Observable, ignore-date + date-only revival + legacy-data backfill + date-ascending sort` |
| `f958ce9` | Parity fix — `fix(order-offline-service): getOrdersJson \|\| fallback + getOrdersInDay ascending sort` |
| `f6ce1c4` | WU2+WU3 — `feat(sales): restore createOrder/updateTodayOrder/activateOrder/deactivateOrder shapes` |
| `ee0c2a3` | WU4 — `feat(sales): restore getCategoryCartItemsView B-shape + filterOrders->filterOrdersObservable C-shape` |
| `699505bd` | CRITICAL fix — `fix(order-offline-service): stamp OrderItem.order from product.order not cart index (parity)` |
| `6a5ad4cd` | Archive docs — change folder + canonical main spec committed |

## Follow-Up Items

1. **Slice 3 (edit-order-details)** — resolve the pre-existing `description` fallback divergence
   (port `getOrderDescription()` so `details` is never falsy for a real caller, or drop the
   fallback to match Angular literally). Since archived by `edit-order-details-parity`
   (`7ab18ec7`), confirm the divergence is now closed there.
2. **Gate (e)** — `getLastMonthSaleProfits`/`getLastMonthSales` + `getByDateRange` remain coupled
   to the pending React-invented aggregation-service removal (`StatisticsAggregationService`,
   `report-aggregation-service`, `inventory-today-sale-service`). Not resolved by this change.

## Engram Persistence

- **Project**: store-mgmt
- **Topic key**: `sdd/2026-07-14-order-offline-service-parity/archive-report`
- **Type**: architecture
- **Note**: All phase artifacts for this change live in the openspec filesystem (no engram
  observations exist for earlier phases — openspec mode). This archive report is persisted to
  engram per orchestrator instruction for cross-session recovery.
