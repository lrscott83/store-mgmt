# Tasks: phase3-analytics-expenses

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated new files | 15 |
| Estimated modified files | 7 |
| Estimated changed lines | 900–1 200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Slice 1 (foundation + Expenses) → Slice 2 (Reports) → Slice 3 (Statistics) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — orchestrator must ask user before apply |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

> **Test baseline note**: The spec assumes 287 passing tests. `sdd-apply` MUST run `pnpm test` at the start of each slice and record the actual count. Adjust the "> 287" acceptance target accordingly before marking any slice complete.

---

## Dependency Order

```
Slice 1 (foundation + Expenses)       Slice 2 (Reports)       Slice 3 (Statistics)
─────────────────────────────       ─────────────────────       ────────────────────
date-utils.ts (extract)        ──►  ReportAggregationService    recharts dep
  ├─ refactor OrderOfflineService        today-report.tsx         chart-core.tsx
  └─ refactor InventoryOfflineService    route + i18n           lazy chart wrappers
ExpenseOfflineService                    registration             StatisticsAggregationService
today-expenses.tsx                                               dashboard.tsx
expenses-history.tsx                                             route + i18n
expense components                                               registration
route registration + i18n
menu-config.ts
```

- **date-utils FIRST**: Reports and Statistics aggregation services import from it; extraction must be byte-identical so existing order/inventory tests remain green.
- **Expenses is independent of Reports/Statistics**: Slice 1 can ship without Slice 2/3.
- **recharts only in Slice 3**: Never import it outside `chart-core.tsx`.
- Within each slice, route registration (`routes.ts`) is the LAST task — each slice must leave `routes.ts` and the app buildable after each incremental edit.

---

### Suggested Work Units (chained PRs)

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | date-utils extraction + ExpenseOfflineService + Expenses routes & components + menu item + i18n | PR 1 | Base = main. Gate items 1, 2, 5, 6, 7, 8, 9, 10, 18. |
| 2 | ReportAggregationService + /reports/today route + i18n | PR 2 | Base = PR 1 branch. Gate items 3, 11, 12, 13, 18, 24. |
| 3 | recharts dep + chart-core + lazy chart wrappers + StatisticsAggregationService + /stats/dashboard route + i18n | PR 3 | Base = PR 2 branch. Gate items 4, 14, 15, 16, 17, 20, 23. |

---

## Slice 1 — Foundation + Expenses

### Phase 1.A — date-utils extraction (RED → GREEN → verify)

- [ ] **1.A.1** `RED` Create `app/shared/lib/date-utils.test.ts`: write failing unit tests for `startOfDay` (zeroes time, S-DATE-1/2) and `addDays` (positive, negative, zero delta, no mutation — S-DATE-3/4/5, month boundary, DST boundary). Ref: SDATE-1 to SDATE-3, S-DATE-1 to S-DATE-5.
- [ ] **1.A.2** `GREEN` Create `app/shared/lib/date-utils.ts` exporting `startOfDay(date: Date): Date` and `addDays(date: Date, days: number): Date` — byte-identical implementations copied from `OrderOfflineService`. Run `pnpm test`; both new tests and all pre-existing order/inventory tests must pass.
- [ ] **1.A.3** `REFACTOR` In `app/sales/lib/services/order-offline-service.ts`: replace local `startOfDay`/`addDays` definitions with `import { startOfDay, addDays } from '~/shared/lib/date-utils'`. Behavior-preserving only.
- [ ] **1.A.4** `REFACTOR` In `app/inventory/lib/services/inventory-offline-service.ts`: same import swap. Run `pnpm test` — MUST exit 0 with same count as baseline. Ref: CC-4, acceptance gate #6, #22.
- [ ] **1.A.5** `VERIFY` Confirm byte-identical extraction: existing order+inventory unit tests remain green; no new failures. This is a hard gate — do not continue to 1.B if any existing test breaks.

### Phase 1.B — ExpenseOfflineService (RED → GREEN)

- [ ] **1.B.1** `RED` Create `app/expenses/lib/services/expense-offline-service.test.ts`: failing tests for `create`, `getAll`, `getById`, `update`, `delete` (no-op on missing id), `getActiveToday` (filters to current day), `getByDateRange` (inclusive both ends), `note` defaults to `''`. Use `localStorage.clear()` in `beforeEach`. Ref: EXP-1 to EXP-7, S-EXP-1 to S-EXP-7.
- [ ] **1.B.2** `GREEN` Create `app/expenses/lib/services/expense-offline-service.ts`: wrap `new BaseRepository<Expense>('expenses', ['date','createdDate','updatedDate'])`. Implement all methods per spec. `Expense.note` coerced to `''` if falsy at create/update boundary. Run `pnpm test`; all S-EXP-1 to S-EXP-7 green. Ref: EXP-1/2/3/4/5/6/7, acceptance gate #7.

### Phase 1.C — Expense Components (smoke renders)

- [ ] **1.C.1** Create `app/expenses/components/expense-form-modal.tsx`: form for type/total/date/paymentType/note; validation total > 0; no submit without valid total. Ref: EXP-9 (validation). Smoke render test: renders form fields + disables submit when total = 0.
- [ ] **1.C.2** Create `app/expenses/components/expense-list.tsx`: displays expense rows; shows delete button (today only); shows edit control. Smoke render: renders list items; delete absent when `allowDelete={false}`. Ref: EXP-10/15.
- [ ] **1.C.3** Create `app/expenses/components/expense-filters.tsx`: date-range picker + type multi-select. Smoke render: renders filter controls. Ref: EXP-17/18.
- [ ] **1.C.4** Create `app/expenses/components/expense-pagination.tsx`: page/limit controls. Smoke render: renders pagination. Ref: EXP-20.

### Phase 1.D — Expenses Routes

> **ADDITIVE RULE**: Do NOT edit `today-quantities.tsx` or `today-sales-profit.tsx` for any reason. Ref: acceptance gate #24, REP-14.

- [ ] **1.D.1** Create `app/expenses/routes/today-expenses.tsx`: `export const loader = featureLoader([EFeatures.TodayExpenses])` (value 80); `export default function TodayExpensesPage()`; container calls `ExpenseOfflineService.getActiveToday()` + `create`/`update`/`delete`; shows running total; empty state. Ref: EXP-8/9/10/11/12/13/21, CC-1. Smoke render test.
- [ ] **1.D.2** Create `app/expenses/routes/expenses-history.tsx`: `export const loader = featureLoader([EFeatures.ExpensesHistory])` (value 102); `export default function ExpensesHistoryPage()`; date-range + type filter; pagination; filtered total; edit allowed; NO add button; NO delete control. Ref: EXP-15/16/17/18/19/20, CC-1. Smoke render test.

### Phase 1.E — Menu + i18n + Route Registration

- [ ] **1.E.1** Add `EXPENSES.*` i18n keys to `app/shared/lib/i18n/es.ts` (all keys for labels, empty states, form fields, expense type names). Ref: CC-3, acceptance gate #18.
- [ ] **1.E.2** Add `ExpensesHistory` item to `EXPENSES` group in `app/shared/lib/config/menu-config.ts`: path `/expenses/expenses`, EFeatures.ExpensesHistory. Ref: EXP-22, acceptance gate #5.
- [ ] **1.E.3** `ROUTE REGISTRATION (last in slice)` Add two routes to `app/routes.ts` under `app-layout`: `expenses/today` → `today-expenses.tsx`, `expenses/expenses` → `expenses-history.tsx`. Ref: EXP-8/14, CC-2, acceptance gate #1 #2.
- [ ] **1.E.4** `SLICE 1 BUILD GATE` Run `pnpm -C apps/web-store-pos exec tsc --noEmit` (exits 0) and `pnpm -C apps/web-store-pos build` (succeeds). Run `pnpm test` (≥ baseline count). All Slice 1 acceptance gate items (#1, #2, #5, #6, #7, #8, #9, #10, #18, #22, #24) verified.

**Slice 1 acceptance gate coverage**: items 1, 2, 5, 6, 7, 8, 9, 10, 18, 22, 24 of the 24-item spec gate.

---

## Slice 2 — Reports

> **HARD CONSTRAINT**: Do NOT modify `today-quantities.tsx` or `today-sales-profit.tsx`. Reports is purely additive. Ref: REP-14, acceptance gate #24.

### Phase 2.A — ReportAggregationService (RED → GREEN)

- [ ] **2.A.1** `RED` Create `app/reports/lib/services/report-aggregation-service.test.ts`: failing tests for `getTodayReport(date)` — mock `OrderOfflineService` + `InventoryOfflineService`; assert `totalRevenue`, `orderCount`, `revenueByPaymentType` (all PaymentType keys present even at 0), `topProducts`, `availableQty = sum(InventoryEntry.available)`, only `isActive === true` orders counted, cancelled orders excluded. Include `receivedToday`/`consumedToday`/`netChange` assertions. Ref: REP-2 to REP-8/15, S-REP-1 to S-REP-10.
- [ ] **2.A.2** `GREEN` Create `app/reports/lib/services/report-aggregation-service.ts`: `constructor(storeId)`; `getTodayReport(): ReportSummary`. View models: `ReportSummary` (date, orderCount, totalRevenue, totalCost, totalProfit, available: ReportProductAvailable[]); `ReportProductAvailable` (productId, productName, available = sum InventoryEntry.available per product). `availableQty` MUST be `sum(InventoryEntry.available)` — NOT `product.availableQuantity`. Run `pnpm test`; all S-REP-1 to S-REP-10 green. Ref: REP-2 to REP-8, acceptance gate #11.

### Phase 2.B — Reports Route

- [ ] **2.B.1** Create `app/reports/routes/today-report.tsx`: `export const loader = featureLoader([EFeatures.TodayReports])` (value 50); `export default function TodayReportPage()`; loads on mount + `Actualizar` button (no polling); empty states (zero values shown, no crash). Read-only — no mutations. Ref: REP-1/9/10/11/12/13, CC-1. Smoke render test.

### Phase 2.C — i18n + Route Registration

- [ ] **2.C.1** Add `REPORTS.*` i18n keys to `app/shared/lib/i18n/es.ts`. Ref: CC-3, acceptance gate #18.
- [ ] **2.C.2** `ROUTE REGISTRATION (last in slice)` Add one route to `app/routes.ts` under `app-layout`: `reports/today` → `today-report.tsx`. Ref: REP-1, CC-2, acceptance gate #3.
- [ ] **2.C.3** `SLICE 2 BUILD GATE` Run `pnpm -C apps/web-store-pos exec tsc --noEmit` + `pnpm -C apps/web-store-pos build` + `pnpm test`. Acceptance gate items #3, #11, #12, #13, #18, #24 verified.

**Slice 2 acceptance gate coverage**: items 3, 11, 12, 13, 18, 24.

---

## Slice 3 — Statistics

### Phase 3.A — recharts Dependency

- [ ] **3.A.1** Add `recharts` to `apps/web-store-pos/package.json` dependencies. Run `pnpm install`. Ref: CC-7, acceptance gate #23.

### Phase 3.B — StatisticsAggregationService (RED → GREEN)

- [ ] **3.B.1** `RED` Create `app/statistics/lib/services/statistics-aggregation-service.test.ts`: failing tests for `getLast30DaysSales(today?)` — exactly 30 entries, zero-order days present with 0 values, cancelled orders excluded, date keys are YYYY-MM-DD strings, `totalRevenue` and `orderCount` correct. Add failing tests for `getLast30DaysProfit(today?)` — `calculateOrderProfit(orderItem)` called per item, `InventoryOfflineService` NOT called, `grossProfit`/`totalRevenue`/`totalCost` correct per day. Ref: STAT-2 to STAT-7, S-STAT-1 to S-STAT-8.
- [ ] **3.B.2** `GREEN` Create `app/statistics/lib/services/statistics-aggregation-service.ts`: `constructor(storeId)`; `getLast30DaysSales(today?: Date): DailySalesPoint[]`; `getLast30DaysProfit(today?: Date): DailyProfitPoint[]`. Use `addDays` from `shared/lib/date-utils.ts`. Profit via `calculateOrderProfit(orderItem)` using embedded `productCosts` — NEVER read InventoryEntries. Fill gaps with zero-value entries for all 30 days. View models: `DailySalesPoint { date: string; totalRevenue: number; orderCount: number }`, `DailyProfitPoint { date: string; grossProfit: number; totalRevenue: number; totalCost: number }`. Run `pnpm test`; all S-STAT-1 to S-STAT-8 green. Ref: STAT-2 to STAT-7, acceptance gate #14, #15.

### Phase 3.C — Chart Components

- [ ] **3.C.1** Create `app/statistics/components/chart-core.tsx`: SOLE importer of recharts (LineChart, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer). No other file may import recharts. Exports `ChartCore` (or named chart components built on recharts primitives). Ref: STAT-8, CC-6, acceptance gate #17.
- [ ] **3.C.2** Create `app/statistics/components/sales-chart.tsx`: `const Core = React.lazy(() => import('./chart-core').then(m => ({ default: m.ChartCore })))`. Presentational: primary Y = `totalRevenue`; tooltip shows `orderCount`; `ResponsiveContainer`; `<Suspense fallback={GENERAL.LOADING}>`. Empty state when all 30 days are zero. Smoke render test: fallback renders; component mounts. Ref: STAT-9/10/12, acceptance gate #16.
- [ ] **3.C.3** Create `app/statistics/components/profit-chart.tsx`: same lazy pattern as sales-chart; Y = `grossProfit`; tooltip shows `totalRevenue`/`totalCost`/`grossProfit`; `ResponsiveContainer`; Suspense fallback. Empty state. Smoke render test. Ref: STAT-10/11/12, acceptance gate #16. Currency format: `$`-prefix (no Intl.NumberFormat). Ref: STAT-13.

### Phase 3.D — Statistics Route

- [ ] **3.D.1** Create `app/statistics/routes/dashboard.tsx`: `export const loader = featureLoader([EFeatures.Dashboard])` (value 60); `export default function DashboardPage()`; imports only lazy wrappers (`sales-chart.tsx`, `profit-chart.tsx`), NEVER `chart-core.tsx` or recharts directly. Uses `StatisticsAggregationService`. Ref: STAT-1/8, CC-1, acceptance gate #4.

### Phase 3.E — i18n + Route Registration + Bundle Verification

- [ ] **3.E.1** Add `STATISTICS.*` i18n keys to `app/shared/lib/i18n/es.ts` (chart titles, labels, empty state messages). Ref: CC-3, acceptance gate #18.
- [ ] **3.E.2** `ROUTE REGISTRATION (last in slice)` Add one route to `app/routes.ts` under `app-layout`: `stats/dashboard` → `dashboard.tsx`. Route path MUST be `stats/dashboard` not `statistics/dashboard`. Ref: STAT-1, CC-2, acceptance gate #4.
- [ ] **3.E.3** `BUNDLE SPLIT VERIFICATION` Run `pnpm -C apps/web-store-pos build`. Inspect build output: confirm recharts appears in a lazy chunk (not in the entry chunk or auth chunk). If recharts bleeds into the entry bundle, the chart-core import chain is broken — fix before marking complete. Ref: STAT-8, CC-6, acceptance gate #17, #20.
- [ ] **3.E.4** `SLICE 3 FINAL GATE` Run `pnpm -C apps/web-store-pos exec tsc --noEmit` (exits 0). Run `pnpm test` (exits 0, ≥ baseline count). Acceptance gate items #4, #14, #15, #16, #17, #19, #20, #21, #22, #23 verified.

**Slice 3 acceptance gate coverage**: items 4, 14, 15, 16, 17, 19, 20, 21, 22, 23.

---

## Cross-cutting Constraints (apply to all slices)

- **kebab-case filenames** enforced on every new file (CC-8).
- **Route modules**: every route file MUST have `export default function XxxPage()` + `export const loader = featureLoader([EFeatures.X])` (CC-1).
- **i18n**: all smoke render tests wrap components in `<IntlProvider locale="es" messages={esMessages}>`.
- **recharts isolation**: only `chart-core.tsx` imports recharts. If any other file does a recharts import, the build gate (3.E.3) will catch it — but do not allow it in code review either.
- **No Intl.NumberFormat**: currency displayed with `$`-prefix string concatenation (STAT-13).
- **Read-only invariant for Reports**: `ReportAggregationService` and `today-report.tsx` make zero mutations to any repository.
- **Profit invariant for Statistics**: `calculateOrderProfit(orderItem)` is the only cost source. `InventoryOfflineService` is NOT called anywhere in statistics aggregation.

---

## Acceptance Gate Summary

| Gate Item | Slice |
|-----------|-------|
| 1 — /expenses/today registered (featureLoader 80) | Slice 1 |
| 2 — /expenses/expenses registered (featureLoader 102) | Slice 1 |
| 3 — /reports/today registered (featureLoader 50) | Slice 2 |
| 4 — /stats/dashboard registered (featureLoader 60) | Slice 3 |
| 5 — ExpensesHistory menu item → /expenses/expenses | Slice 1 |
| 6 — date-utils.ts exports startOfDay + addDays + tests | Slice 1 |
| 7 — ExpenseOfflineService all methods + tests | Slice 1 |
| 8 — Today Expenses add/edit/delete + running total | Slice 1 |
| 9 — History: no add, no delete | Slice 1 |
| 10 — History filter + pagination | Slice 1 |
| 11 — ReportAggregationService aggregations | Slice 2 |
| 12 — Reports empty states | Slice 2 |
| 13 — Reports Actualizar button | Slice 2 |
| 14 — getDailySales 30 entries, correct values | Slice 3 |
| 15 — getDailyProfit via calculateOrderProfit | Slice 3 |
| 16 — Chart empty + loading states | Slice 3 |
| 17 — recharts absent from auth/login bundle | Slice 3 |
| 18 — i18n keys present in es.ts | Slice 1 + 2 + 3 |
| 19 — tsc --noEmit exits 0 | Slice 3 final gate |
| 20 — pnpm build succeeds; recharts in stats chunk | Slice 3 |
| 21 — pnpm test exits 0 with > 287 passing | Slice 3 final gate |
| 22 — All pre-existing tests pass | Slice 1 (1.A.5) + 3 |
| 23 — recharts in package.json | Slice 3 |
| 24 — today-quantities.tsx + today-sales-profit.tsx unchanged | Slice 1 guard + Slice 2 guard |
