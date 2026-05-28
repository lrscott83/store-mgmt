# Exploration: phase3-analytics-expenses

## Current State

Phase 2 delivered: auth, home, sales (products, POS, orders, credits), and inventory (entries, egress, available, today-quantities, today-sales-profit). The app is an offline-first PWA using localStorage via `BaseRepository<T>` and module-scoped service instances (no DI container).

**What already exists that Phase 3 builds on:**

- `OrderOfflineService` — full CRUD + `getByDateRange(from, to)` + `getActiveOrdersInDay(date)`. Already the aggregation backbone.
- `InventoryOfflineService` — `getByDate(date)`, `getAll()`, FIFO deduction, stock queries.
- `calculateOrderProfit(orderItem)` in `profit-calculator.ts` — already computes revenue/cost/profit/margin per OrderItem.
- `today-sales-profit.tsx` — aggregates profit per product for today using the above. Uses `useEffect` + inline service instantiation.
- `today-quantities.tsx` — aggregates entries/sold/egressed per product for today.
- `EFeatures` enum: `TodayExpenses=80`, `ExpensesHistory=102`, `TodayReports=50`, `Dashboard=60` — all values already exist, no additions needed.
- `EModules`: `Expenses=8`, `Reports=5`, `Statistics=6` — all present.
- Domain: `Expense` interface fully defined in `packages/domain/src/models/expense.ts` with correct fields. `ExpenseType` and `PaymentType` enums already in `enums/index.ts`.
- `BaseRepository<T>` — generic, handles Map serialization, date revival, and per-store keying via `StorageKeys.entityKey()`. `ExpenseOfflineService` can be a thin wrapper around `new BaseRepository<Expense>('expenses', ['date', 'createdDate', 'updatedDate'])`.
- `menu-config.ts` already has `MENU.EXPENSES` group with `TodayExpenses` item; `MENU.REPORTS` and `MENU.STATISTICS` groups also exist. Missing: `ExpensesHistory` menu item.
- `routes.ts` has NO expenses/reports/statistics routes yet — all three modules are greenfield at the route level.
- i18n `es.ts` has `MENU.TODAY_EXPENSES`, `MENU.EXPENSES_HISTORY`, `MENU.TODAY_REPORTS`, `MENU.DASHBOARD` keys. Feature-specific keys (form labels, expense types, chart titles) are missing and must be added.
- `featureLoader()` in `auth/routes/loaders.ts` is the established pattern for feature-gated routes — no changes needed.

---

## Module Summaries and Ambiguity Flags

### Expenses Module

Two routes: `/expenses/today` (EFeatures.TodayExpenses=80) and `/expenses/expenses` (EFeatures.ExpensesHistory=102).

- `today`: add expense, list today's expenses, edit/delete with confirmation, running total.
- `history`: filter by date range and expense type, paginated list, total for filtered set.

**Ambiguities:**
1. Edit from history: PRD section 4.2 says "does not allow adding new expenses (read + edit only from history)" — contradictory wording. Is edit allowed from history? Must be resolved before proposal.
2. Delete from history: not mentioned. Likely intentional (only today's entries are deletable). Needs confirmation.
3. Pagination: PRD says "pagination or virtual scrolling" — which is preferred? Virtual scroll adds complexity; simple pagination recommended.
4. `Expense.note` is `string` (non-optional in domain) — must default to `''` when empty on form submit.

### Reports Module

Single route: `/reports/today` (EFeatures.TodayReports=50). Reads products, inventory-entries, and orders from localStorage.

**Overlap with existing inventory routes:**
- `today-quantities.tsx` (Inventory module) shows per-product entered/sold/egressed/net-change for today — overlaps with Reports "Inventory Status" section.
- `today-sales-profit.tsx` (Inventory module) shows per-product revenue/cost/profit/margin — overlaps with Reports "Sales Summary."
- BUT: Reports is a separate module (Reports=5 vs Inventory=3), different feature IDs, combined single-page layout. The two inventory routes stay as-is. Reports re-implements similar aggregations in a unified layout for the Reports module.
- Key difference: Inventory profit route filters by `discountFromInvantory`; Reports aggregates ALL orders.

**Ambiguities:**
1. `product.availableQuantity` referenced in PRD does not exist on the `Product` domain model (only `availableToSale: boolean` exists). "Current available" must mean sum of `InventoryEntry.available` per product from `InventoryOfflineService`. Proposal must clarify.
2. "Updates automatically" — since all data is localStorage + `useEffect`, updates only happen on mount. Proposal must define: mount-only, manual refresh button, or polling interval.
3. Order status filter: `Order.isActive` = true is the "completed" proxy. No separate status enum exists. Consistent with existing code.

### Statistics Module

Single route: `/statistics/dashboard` (EFeatures.Dashboard=60). Two chart components for last-30-days: `LastMonthSalesComponent` (bar/area) and `LastMonthSaleProfitsComponent` (line/area). Recharts is the specified library, lazy-loaded.

**Critical discrepancy:** PRD says route path is `/statistics/dashboard` but `menu-config.ts` has it as `/stats/dashboard`. Must be reconciled.

**Ambiguities:**
1. Route path: `/statistics/dashboard` (PRD) vs `/stats/dashboard` (menu-config). Pick one before proposal.
2. Cost source for profit: PRD says "look up cost from InventoryEntries" but `calculateOrderProfit(orderItem)` already uses `orderItem.productCosts` (FIFO cost baked in at order creation). The correct approach is to use `calculateOrderProfit` — re-reading InventoryEntries would give wrong results for historical data where stock has been partially depleted.
3. Sales chart Y-axis: PRD says "order count OR total revenue" — must pick a primary metric.
4. Currency formatting: existing code uses `$` prefix directly (not Intl.NumberFormat). Proposal should standardize this or defer to a later phase.

---

## Affected Areas

| File/Path | Reason |
|---|---|
| `apps/web-store-pos/app/routes.ts` | Add expenses/reports/statistics routes |
| `apps/web-store-pos/app/shared/lib/config/menu-config.ts` | Add ExpensesHistory item; fix Statistics path |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Add feature-specific i18n keys for all 3 modules |
| `apps/web-store-pos/app/expenses/` | New feature folder (routes, components, lib/services) |
| `apps/web-store-pos/app/reports/` | New feature folder (routes only — aggregates from existing services) |
| `apps/web-store-pos/app/statistics/` | New feature folder (routes, components with charts, lib/services) |
| `packages/domain/src/` | No new models needed — Expense is complete, all enums complete |
| `apps/web-store-pos/package.json` | Add `recharts` dependency |

---

## Reuse Map

| Existing Asset | Reused By | How |
|---|---|---|
| `BaseRepository<Expense>('expenses', ['date', 'createdDate', 'updatedDate'])` | `ExpenseOfflineService` | Thin wrapper, identical to orders/credits pattern |
| `OrderOfflineService.getByDateRange(from, to)` | Reports, Statistics | Date-range filtering already implemented |
| `OrderOfflineService.getActiveOrdersInDay(date)` | Reports | Direct call, same pattern as today-quantities |
| `calculateOrderProfit(orderItem)` in `profit-calculator.ts` | Statistics profit chart, Reports | Call per orderItem across 30-day window |
| `InventoryOfflineService.getByDate(date)` | Reports | Already implemented |
| `featureLoader([EFeatures.X])` | All 3 new route modules | No changes needed |
| `useAuthStore` selector for storeId | All new routes | Standard pattern |
| `EFeatures.*` / `EModules.*` enum values | All new routes | Already defined, no domain rebuild needed |

---

## Approaches for the Analytics Layer

### Approach A — On-the-fly aggregation in route components (current Phase 2 pattern)

Each route computes aggregations directly in `useEffect` by calling existing services inline.

- Pros: Zero new abstraction; consistent with today-quantities/today-sales-profit patterns; simple.
- Cons: Aggregation logic co-located in route files; hard to reuse between Reports and Statistics; re-reads all localStorage on every mount; logic untestable without rendering the component.
- Effort: Low.

### Approach B — Dedicated aggregation service layer (recommended for Reports + Statistics)

Add `ReportAggregationService` (under `reports/lib/services/`) and `StatisticsAggregationService` (under `statistics/lib/services/`). They call `OrderOfflineService` + `InventoryOfflineService` and return shaped view models (`DailySalesPoint[]`, `DailyProfitPoint[]`, report summary structs).

- Pros: Aggregation logic is unit-testable in isolation (critical for Strict TDD); route components stay thin; reusable across multiple consumers; consistent with offline service layer pattern; uses `calculateOrderProfit` correctly.
- Cons: One extra layer per module; slightly more boilerplate; services are still plain classes at module scope.
- Effort: Medium — write 2 aggregation services + tests.

### Approach C — Precomputed/cached summaries in localStorage

Maintain a `daily-stats` key updated on every order save/cancel.

- Pros: Instant reads even at high order volume.
- Cons: High complexity (invalidation, Angular backward-compat, crash-safety); completely overkill for typical small-store data sizes where 30-day O(n) scan takes <5ms.
- Effort: High.

## Recommendation

**Hybrid: Approach A for Expenses + Approach B for Reports and Statistics.**

Expenses is a simple CRUD module with trivial filtering — direct service calls in route components are fine and consistent. Reports and Statistics have non-trivial aggregation logic (30-day rollups, profit computation, payment-type breakdown, top-sellers) that is shared between the two modules. Extracting to aggregation services:
1. Keeps route components thin (container-presentational convention).
2. Makes aggregation logic independently testable — required by Strict TDD.
3. Avoids duplicating the "group orders by day" loop.

Approach C is premature optimization. localStorage scans for 30 days of orders are synchronous and <5ms at typical volumes.

Additionally: factor `startOfDay` / `addDays` date helpers (currently duplicated in OrderOfflineService and InventoryOfflineService) into `shared/lib/date-utils.ts` before writing more copies.

---

## Open Questions for Proposal Phase

1. Expenses history — edit/delete: Is history view edit-only (no delete), or read-only? PRD contradicts itself.
2. Expenses pagination: Simple page/limit or virtual scroll? (Recommendation: simple pagination.)
3. Reports auto-refresh: Mount-only, manual refresh button, or polling? PRD says "updates automatically."
4. Reports available quantity source: Confirm it's sum of `InventoryEntry.available` from InventoryOfflineService (not a product field).
5. Statistics route path: `/statistics/dashboard` vs `/stats/dashboard` — pick one and reconcile PRD + menu-config.
6. Statistics cost source: Confirm use of `calculateOrderProfit(orderItem)` with embedded `productCosts`, not re-reading InventoryEntries.
7. Statistics sales chart Y-axis: Order count or total revenue as primary metric?
8. Currency formatting: Use existing `$` prefix pattern or introduce `Intl.NumberFormat`?
9. `Expense.note` non-optional: Confirm default `''` for empty notes.
10. Synchronization compatibility: Verify `lizoft.store-expenses-{storeId}` key matches Angular source at implementation time.

---

## Risks

1. today-sales-profit / today-quantities overlap with Reports: Without clear boundaries, risk of duplicating aggregation. Scope Reports as a combined dashboard only; do NOT refactor existing inventory routes in Phase 3.
2. Recharts bundle leak: Incorrect lazy-loading will put the chart library in the auth bundle. Validate with bundle analysis.
3. 30-day scan performance: O(n) localStorage read is acceptable today but should be documented. Revisit only if users report slowness.
4. `startOfDay`/`addDays` duplication: Currently copied in two services. Adding more copies increases maintenance debt. Extract to shared utility in Phase 3.
5. Recharts not yet in package.json: Must install + verify Vite tree-shaking config.
6. `Expense.note` non-optional: Must enforce `note: value ?? ''` at form submit layer.
7. menu-config missing `ExpensesHistory` item: Must be added alongside the history route.

## Ready for Proposal

Yes. Three questions should be resolved before writing the proposal (can be decided by the team): (1) Expenses history edit/delete scope, (2) Reports refresh strategy, (3) Statistics route path. All other ambiguities have a clear default recommendation that the proposal phase can codify.
