# Tasks: offline-online-service-parity — Slice 1 (Formal Interfaces + Offline Query/Financial APIs)

Governs spec #673, design #674, proposal #671, decision #670. Strict TDD (init #64): every method/fix = RED→GREEN. Bug-fix tasks deviate from Angular per angular-bugs-policy #648 (fix, not replicate) — noted inline.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1300 total (WU1 ~100; WU2 Order ~280-350; WU3 Expense ~140; WU4 SaleCredit ~140; WU5 Inventory ~280-350; WU6 Statistics ~110) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (by size); delivery is commits-only (no PR/push) |
| Suggested split | WU1 → WU2 → WU3 → WU4 → WU5 → WU6 → Final regression, one commit per unit |
| Delivery strategy | commits-only, no PR/push (hybrid persistence, work-unit commits) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type | Dependency |
|------|------|-------------|------------|
| 1 | BaseService<T>/ProductService/ProductCategoryService interfaces + `implements` wiring | feat | None |
| 2 | Order offline query/financial + top-products fix | feat | After WU1 (domain build) |
| 3 | Expense offline query/financial | feat | After WU1 |
| 4 | SaleCredit offline query/financial | feat | After WU1 |
| 5 | Inventory offline query/financial + FIFO/cross-product fixes | feat | After WU1 |
| 6 | Statistics expense-netting fix | fix | After WU3 (needs ExpenseOfflineService methods) |

## WU1: Formal Interfaces (packages/domain) — Req: BaseService<T>, ProductService/ProductCategoryService

- [x] 1.1 RED: `packages/domain/src/services/__tests__/base-service.test.ts` (or tsc-only type test) asserting `BaseService<T>` shape (`getAll/getById/delete`) is exported.
- [x] 1.2 GREEN: create `packages/domain/src/services/base-service.ts`, `product-service.ts` (extends BaseService<Product>: getByBarcode, update), `product-category-service.ts` (extends BaseService<ProductCategory>: getByName, save — explicit `getProductCategories()`-style completeness per spec #673 bug fix #3).
- [x] 1.3 GREEN: export new service files from `packages/domain/src/index.ts`; run `pnpm -C packages/domain build`.
- [ ] 1.4 GREEN: `frontend-react/apps/web-store-pos/app/sales/lib/services/product-offline-service.ts` add `implements ProductService`; `product-category-offline-service.ts` add `implements ProductCategoryService`.
- [x] 1.5 GREEN: `order-offline-service.ts`, `expense-offline-service.ts`, `sale-credit-offline-service.ts`, `inventory-offline-service.ts` add `implements BaseService<T>`.
- [x] 1.6 Gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`, `pnpm -C apps/web-store-pos build`; commit `feat(domain): export BaseService/ProductService/ProductCategoryService interfaces + implements wiring`.

## WU2: Order Offline Query/Financial APIs — Req: Order APIs

- [x] 2.1 RED (`order-offline-service.test.ts`): `activateOrder(id)` sets `isActive=true`, no cascade.
- [x] 2.2 GREEN: implement `activateOrder`.
- [x] 2.3 RED: `getActiveOrdersPriceBetweenDates/Today/Yesterday` sum `order.total` over active orders in window.
- [x] 2.4 GREEN: implement via raw-boundary `active*Between` helper (ADR-5).
- [x] 2.5 RED: `getActiveOrdersProfitBetweenDates/Today/Yesterday` sum profit via `calculateOrderProfit` (price*qty − cost*qty).
- [x] 2.6 GREEN: implement, reusing `~/inventory/lib/profit-calculator`.
- [x] 2.7 RED: `getOrdersInDay(date)` **honors the passed date param** (Angular bug: ignores it, always `new Date()` — FIXED per angular-bugs-policy #648, deviation noted).
- [x] 2.8 GREEN: implement `getOrdersInDay` respecting `date`.
- [x] 2.9 RED: `getTopProductsProfitInLastMonth(top?)` / `getTopProductsSaleQuantityInLastMonth(top?)` — **honor the `top` param** (default 5 when unspecified); assert a non-5 `top` value (e.g. `top=3` and `top=8`) returns that many entries, not hardcoded 5 (Angular bug: `slice(0,5)` ignores `top` — FIXED per angular-bugs-policy #648, OVERRIDING design's "replicate exactly" note per orchestrator directive).
- [x] 2.10 GREEN: implement top-products over active orders in rolling last-29-days window, grouped by productId, sorted desc, sliced by `top ?? 5`.
- [x] 2.11 RED: `filterOrders(isCredit,paymentType?,start?,end?)` sync — isCredit tri-state (-1 any/1 credit/0 non-credit).
- [x] 2.12 GREEN: implement `filterOrders` (sync replacement of `filterOrdersObservable`).
- [x] 2.13 RED/GREEN: `create()` accepts optional `details?: string` (description = `details || (isCredit ? clientName : '')`).
- [x] 2.14 Gate: `pnpm test`, `tsc --noEmit`, build; commit `feat(web-store-pos): port Order offline query/financial APIs + fix date-param and top-N bugs`.

## WU3: Expense Offline Query/Financial APIs — Req: Expense APIs

- [x] 3.1 RED (`expense-offline-service.test.ts`): `getActiveExpensesPriceBetweenDates/Today/Yesterday` sum active expense totals in window.
- [x] 3.2 GREEN: implement.
- [x] 3.3 RED: `getExpensesTotalBefore(date)/Total()/Yesterday()` sum active expense.total before threshold.
- [x] 3.4 GREEN: implement (`Total` = before tomorrow-start, `Yesterday` = before today-start).
- [x] 3.5 RED: `filterExpenses(type?,paymentType?,start?,end?)` sync replacement of `filterExpensesObservable`.
- [x] 3.6 GREEN: implement.
- [x] 3.7 Gate: `pnpm test`, `tsc --noEmit`, build; commit `feat(web-store-pos): port Expense offline query/financial methods` (69c6916).

## WU4: SaleCredit Offline Query/Financial APIs — Req: SaleCredit APIs

- [x] 4.1 RED (`sale-credit-offline-service.test.ts`): `getSaleCreditsTotalBefore/Total/TotalYesterday` sum active credits before threshold.
- [x] 4.2 GREEN: implement.
- [x] 4.3 RED: `getActiveSaleCreditsPriceToday/Yesterday` (any paid state) and `getActiveUnpaidSaleCreditsPriceToday/Yesterday` (unpaid only) sums.
- [x] 4.4 GREEN: implement both pairs.
- [x] 4.5 RED: `filterSaleCredits(isPaid,client?,start?,end?)` — isPaid only constrains when truthy, client substring match.
- [x] 4.6 GREEN: implement.
- [x] 4.7 Gate: `pnpm test`, `tsc --noEmit`, build; commit `feat(web-store-pos): port SaleCredit offline query/financial methods` (a391280).

## WU5: Inventory Offline Query/Financial APIs + FIFO/Cross-Product Fixes — Req: Inventory APIs

- [x] 5.1 RED (`inventory-offline-service.test.ts`): `getInventoryCostTotalBefore/Total/Yesterday` = Σ(available*costPrice) before threshold.
- [x] 5.2 GREEN: implement.
- [x] 5.3 RED: `filterInventoryEntries(productId?,start?,end?)`.
- [x] 5.4 GREEN: implement.
- [x] 5.5 RED: `getInventoryEntriesView()` — per-product FIFO breakdown, sorted by `order` asc, entries `{id, costPrice, quantity: available}`, plus total `productAvailable` (emit `id`, not Angular's `inventoryId`).
- [x] 5.6 GREEN: implement.
- [x] 5.7 RED: `amortizeSoldEntry(productId,entryId)` throws `EntryNotExists`/`SaleNotExistsWithThisEntry`; else zeroes `available`, `quantity -= available`.
- [x] 5.8 GREEN: implement.
- [x] 5.9 RED: `updateAvailableInventories(productId,qty)` — **corrected FIFO decrement** (hand-derived correct values; Angular bug: `total -= available` AFTER zeroing `available` double-counts — FIXED, no cost-consumption record, returns false if none available).
- [x] 5.10 GREEN: implement corrected FIFO decrement.
- [x] 5.11 RED: `updateInventoryEntry(oldProductId,entryId,newProductId,qty,costPrice)` cross-product reassignment — **corrected bucket move** (hand-derived correct values; Angular bug: old/new-list mix-up — FIXED); validates `isNotSoldEntry` + target availability.
- [x] 5.12 GREEN: implement corrected cross-product reassignment as a distinct method (existing same-product `update` untouched).
- [x] 5.13 Gate: `pnpm test`, `tsc --noEmit`, build; commit `feat(web-store-pos): port Inventory offline query/financial methods + FIFO bug fixes` (4c17cb2).

## WU6: Statistics Expense-Netting Fix — Req: Daily Profit Nets Out Expenses

- [x] 6.1 RED (`statistics-aggregation-service.test.ts`): day with order profit 1000 + active expenses 300 → `getDailyProfit` returns 700 (not 1000); day with 0 expenses unaffected; only-expenses day → negative profit; inactive/soft-deleted expenses excluded (delegated to ExpenseOfflineService's own active-only filtering); out-of-range expenses ignored; per-bucket isolation across the 30-day window (verified 30 distinct call windows, each `[start, start+1day)`).
- [x] 6.2 GREEN: inject `ExpenseOfflineService` into `StatisticsAggregationService` ctor; `getDailyProfit` = `orderProfit(day) − expenseService.getActiveExpensesPriceBetweenDates(dayStart, addDays(dayStart,1))`; keep React's correct per-day window (ADR-6, do not replicate Angular's window bug).
- [x] 6.3 Verify `getDailySales` and existing no-expense tests remain green (netting subtracts 0).
- [x] 6.4 Gate: `pnpm test`, `tsc --noEmit`, build; commit `fix(web-store-pos): net expenses out of daily profit statistics` (9988fbc).

## Final: Full Regression Gate

- [x] 7.1 Grep-confirmed no remaining `filter*Observable`/RxJS/`BaseResponseModel` usages left in ported methods (only doc-comment mentions of the Angular source names remain); confirmed bug-fix deviations (date-param honoring — WU2, top-N honoring — WU2, FIFO decrement — WU5, cross-product reassignment — WU5, expense-netting per-day window — WU6) are each covered by a RED test with hand-derived expected values.
- [x] 7.2 Full gate run clean across all six work units: `pnpm test` → 1360/1360 web-store-pos tests passed (0 failed), 69/69 domain tests passed (domain untouched this batch); `pnpm -C apps/web-store-pos exec tsc --noEmit` → clean; `pnpm -C apps/web-store-pos build` → SPA build succeeded (same pre-existing unrelated api-client.ts dynamic/static dual-import vite warning as Batch 1, not a new issue).
- [x] 7.3 Tasks file updated with commit hashes (see WU3-WU6 gate lines above); no PR/push — commits-only delivery confirmed on branch `feat/frontend-parity-audit`.
