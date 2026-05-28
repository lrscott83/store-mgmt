# Spec: phase3-analytics-expenses

**Change:** phase3-analytics-expenses  
**Phase:** Spec  
**Status:** Active  
**Date:** 2026-05-28

---

## Scope Statement

After Phase 3 is applied the following MUST be true:

1. Four new routes are registered, feature-gated, and reachable: `/expenses/today`, `/expenses/expenses`, `/reports/today`, `/stats/dashboard`.
2. `ExpenseOfflineService` provides full CRUD (`getAll`, `getByDateRange`, `getToday`, `save`, `delete`) against `lizoft.store-expenses-{storeId}` in localStorage.
3. Today's Expenses route allows adding, editing, and deleting today's expenses and shows a running total.
4. Expenses History route allows browsing and editing (but NOT adding or deleting) past expenses with date-range and type filters, pagination, and a filtered total.
5. Reports route aggregates today's active orders and inventory entries into a read-only combined dashboard; manual "Actualizar" refresh re-reads; `product.available` = sum of `InventoryEntry.available`.
6. Statistics route shows two last-30-days charts (daily total revenue, daily gross profit) via recharts loaded lazily; profit computed via `calculateOrderProfit(orderItem)` using embedded `productCosts`.
7. `startOfDay` and `addDays` date helpers exist in `shared/lib/date-utils.ts` and are the sole canonical implementations used across the new services.
8. `recharts` is not present in any bundle except the statistics route chunk.
9. The ExpensesHistory menu item is present in `menu-config.ts`.
10. All feature-specific i18n keys are present in `es.ts`.
11. `pnpm test` passes with more tests than the current 287; `tsc --noEmit` is clean; `pnpm build` succeeds.

Anything outside this list is out of scope for Phase 3:
- Existing inventory routes (`today-quantities`, `today-sales-profit`) are NOT modified.
- No new domain model fields or enum values are added (all exist).
- No Intl.NumberFormat — currency rendered with `$` prefix (existing pattern).
- No polling or auto-refresh — Reports loads on mount plus explicit "Actualizar" button.
- No precomputed/cached daily summaries.
- No synchronization compatibility verification (deferred).

---

## Module 1 — Shared: Date Utilities

### Requirements

**SDATE-1** — A file `apps/web-store-pos/app/shared/lib/date-utils.ts` MUST export `startOfDay(date: Date): Date` that returns a new Date set to midnight (00:00:00.000) on the same calendar day as the input.

**SDATE-2** — `date-utils.ts` MUST export `addDays(date: Date, days: number): Date` that returns a new Date shifted by `days` calendar days (positive or negative).

**SDATE-3** — All new services in Phase 3 that need `startOfDay` or `addDays` MUST import from `shared/lib/date-utils.ts`. Duplicating the implementations in any new file is forbidden.

### Scenarios

**S-DATE-1: startOfDay zeros the time component**
- GIVEN a Date representing 2026-04-15T14:32:00
- WHEN `startOfDay(date)` is called
- THEN the result is a Date equal to 2026-04-15T00:00:00.000 (same timezone)

**S-DATE-2: startOfDay on already-midnight date is idempotent**
- GIVEN a Date representing 2026-04-15T00:00:00.000
- WHEN `startOfDay(date)` is called
- THEN the result equals 2026-04-15T00:00:00.000

**S-DATE-3: addDays positive shift**
- GIVEN a Date representing 2026-04-15T00:00:00.000
- WHEN `addDays(date, 3)` is called
- THEN the result equals 2026-04-18T00:00:00.000

**S-DATE-4: addDays negative shift (subtract)**
- GIVEN a Date representing 2026-04-15T00:00:00.000
- WHEN `addDays(date, -2)` is called
- THEN the result equals 2026-04-13T00:00:00.000

**S-DATE-5: addDays does not mutate the input**
- GIVEN a Date `d` representing 2026-04-15
- WHEN `addDays(d, 5)` is called
- THEN `d` is still 2026-04-15

---

## Module 2 — Expenses

### Requirements

**EXP-1** — `ExpenseOfflineService` MUST be a class wrapping `BaseRepository<Expense>('expenses', ['date', 'createdDate', 'updatedDate'])`. The localStorage key resolves to `lizoft.store-expenses-{storeId}`.

**EXP-2** — `ExpenseOfflineService` MUST expose: `getAll(): Expense[]`, `getByDateRange(from: Date, to: Date): Expense[]`, `getToday(): Expense[]`, `save(expense: Expense): void`, `delete(id: string): void`.

**EXP-3** — `save` MUST insert a new expense when the given `expense.id` does not exist in storage. It MUST update (overwrite) the existing record when the id already exists.

**EXP-4** — `delete` MUST remove the expense with the given id from storage. Calling `delete` with a non-existent id MUST be a no-op (no error thrown).

**EXP-5** — `getToday` MUST return only expenses whose `date` field falls within the current calendar day (midnight ≤ date < next midnight, local time). It MUST NOT include expenses from other days.

**EXP-6** — `getByDateRange(from, to)` MUST return expenses where `from ≤ expense.date ≤ to` (inclusive on both ends). Expenses outside this range MUST NOT appear.

**EXP-7** — When `Expense.note` is submitted as empty string, `undefined`, or `null`, the stored value MUST be `''` (empty string). The field is never `null` or `undefined` in storage.

**EXP-8** — The `/expenses/today` route MUST be registered in `routes.ts` with `loader = featureLoader([EFeatures.TodayExpenses])` (value 80). Navigating to `/expenses/today` without the feature redirects to the unauthorized route.

**EXP-9** — The Today Expenses page MUST display all expenses from `getToday()` sorted descending by `date` (most recent first). It MUST display a running total (sum of `expense.total` for all today's expenses).

**EXP-10** — The Today Expenses page MUST provide an "Add Expense" action that opens the expense form. Submitting the form with valid data calls `save` and the new expense appears in the list and the running total updates accordingly.

**EXP-11** — The Today Expenses page MUST provide an edit action per expense row. Submitting the edit form with valid data calls `save` with the updated expense; the list reflects the update.

**EXP-12** — The Today Expenses page MUST provide a delete action per expense row. Deletion MUST require a confirmation step before calling `delete`. After confirmed deletion the expense is removed from the list and the running total updates.

**EXP-13** — The Today Expenses page form MUST validate that `total > 0` and `type` is selected. Submitting with `total ≤ 0` or no `type` MUST NOT call `save`.

**EXP-14** — The `/expenses/expenses` route MUST be registered with `loader = featureLoader([EFeatures.ExpensesHistory])` (value 102). Navigating without the feature redirects to the unauthorized route.

**EXP-15** — The Expenses History page MUST NOT display an "Add Expense" button or action.

**EXP-16** — The Expenses History page MUST NOT display a delete action on any expense row.

**EXP-17** — The Expenses History page MUST provide an edit action per expense row. Editing calls `save` with the updated expense; the list reflects the update.

**EXP-18** — The Expenses History page MUST provide filter controls: a date-range picker (from / to dates) and an expense type selector. Applying filters calls `getByDateRange` and further filters by type client-side; the list updates.

**EXP-19** — The Expenses History page MUST display the total of the currently filtered expense set (sum of `expense.total` for the filtered results).

**EXP-20** — The Expenses History page MUST implement simple page/limit pagination. Navigating to the next page shows the next batch of filtered results; the filtered total never changes based on which page is shown.

**EXP-21** — Both expense pages MUST show an empty-state message when the list is empty (no expenses today / no matching results).

**EXP-22** — `menu-config.ts` MUST include an `ExpensesHistory` menu item pointing to `/expenses/expenses` inside the existing `MENU.EXPENSES` group.

### Scenarios

**S-EXP-1: save inserts a new expense**
- GIVEN localStorage is empty for the current store
- WHEN `service.save({ id: 'e1', type: ExpenseType.Salario, total: 100, date: today, paymentType: PaymentType.Efectivo, note: '' })`
- THEN `service.getAll()` returns an array of length 1 containing the saved expense

**S-EXP-2: save updates an existing expense**
- GIVEN an expense with id `'e1'` and total `100` is in storage
- WHEN `service.save({ id: 'e1', total: 200, ...otherFields })`
- THEN `service.getAll()` returns 1 record with total `200`

**S-EXP-3: delete removes the record**
- GIVEN expenses `['e1', 'e2']` are in storage
- WHEN `service.delete('e1')`
- THEN `service.getAll()` returns only `['e2']`

**S-EXP-4: delete non-existent id is no-op**
- GIVEN one expense with id `'e1'` is in storage
- WHEN `service.delete('x99')`
- THEN `service.getAll()` still returns 1 record and no error is thrown

**S-EXP-5: getToday filters by calendar day**
- GIVEN 3 expenses: one dated yesterday, one dated today at 09:00, one dated tomorrow
- WHEN `service.getToday()` is called with today's date
- THEN only the expense dated today is returned (array length 1)

**S-EXP-6: getByDateRange inclusive boundary**
- GIVEN expenses on 2026-04-01, 2026-04-15, 2026-04-30, 2026-05-01
- WHEN `service.getByDateRange(new Date('2026-04-01'), new Date('2026-04-30'))`
- THEN returns 3 expenses (Apr 01, Apr 15, Apr 30); May 01 excluded

**S-EXP-7: note defaults to empty string**
- GIVEN a form submit where the note field is left blank (value = `undefined`)
- WHEN `save` is called with `note: value ?? ''`
- THEN `service.getAll()[0].note` equals `''` (not null, not undefined)

**S-EXP-8: running total is sum of today's expenses**
- GIVEN two today expenses with totals 50 and 30
- WHEN the Today Expenses page renders
- THEN the displayed total equals `$80`

**S-EXP-9: delete requires confirmation — cancel aborts deletion**
- GIVEN an expense row is displayed on the Today Expenses page
- WHEN the user clicks delete and then cancels the confirmation
- THEN `service.delete` is NOT called and the expense remains in the list

**S-EXP-10: delete confirmed — expense removed and total updates**
- GIVEN two today expenses with totals 50 and 30 (displayed total `$80`)
- WHEN the user confirms deletion of the 50-total expense
- THEN the list shows 1 expense and the total updates to `$30`

**S-EXP-11: history page has no Add and no Delete actions**
- GIVEN the History page is rendered with 3 expenses
- WHEN the component is inspected
- THEN there is no "Add Expense" button and no delete control per row

**S-EXP-12: history type filter**
- GIVEN 5 expenses: 3 of type `Salario`, 2 of type `Alquiler`
- WHEN the type filter is set to `Alquiler`
- THEN the list shows exactly 2 expenses and the filtered total reflects only those 2

**S-EXP-13: history date-range filter**
- GIVEN expenses on 2026-04-01, 2026-04-20, 2026-05-10
- WHEN date range is set to 2026-04-01 → 2026-04-30
- THEN 2 expenses are shown (Apr 01, Apr 20); May 10 excluded

**S-EXP-14: history pagination — second page shows next batch**
- GIVEN 15 expenses, page size is 10
- WHEN the user navigates to page 2
- THEN 5 expenses are shown and the filtered total does not change

**S-EXP-15: empty state on Today page**
- GIVEN no expenses exist for today
- WHEN the Today Expenses page renders
- THEN an empty-state message is displayed and the total is `$0`

**S-EXP-16: Today page form validation — total must be > 0**
- GIVEN the add expense form is open
- WHEN the user enters `total = 0` and submits
- THEN `service.save` is NOT called and a validation error is shown

**S-EXP-17: feature gate — TodayExpenses (80)**
- GIVEN a user without feature 80
- WHEN navigating to `/expenses/today`
- THEN the user is redirected to the unauthorized route

**S-EXP-18: feature gate — ExpensesHistory (102)**
- GIVEN a user without feature 102
- WHEN navigating to `/expenses/expenses`
- THEN the user is redirected to the unauthorized route

---

## Module 3 — Reports

### Requirements

**REP-1** — The `/reports/today` route MUST be registered in `routes.ts` with `loader = featureLoader([EFeatures.TodayReports])` (value 50). Navigating without the feature redirects to the unauthorized route.

**REP-2** — `ReportAggregationService` MUST be a plain class under `reports/lib/services/`. It accepts `OrderOfflineService` and `InventoryOfflineService` instances (constructor or method parameters; no global module-scope dependency on new service instances).

**REP-3** — `ReportAggregationService.getTodayReport(date: Date)` MUST return a view model containing:
- `totalRevenue: number` — sum of `order.total` for all active orders today (`order.isActive === true`)
- `orderCount: number` — count of active orders today
- `revenueByPaymentType: Record<PaymentType, number>` — revenue grouped by payment type
- `topProducts: Array<{ productId: string; productName: string; quantitySold: number }>` — top-selling products by quantity, descending
- `inventoryStatus: Array<{ productId: string; productName: string; availableQty: number; receivedToday: number; consumedToday: number; netChange: number }>` — per-product inventory movement

**REP-4** — "Active orders" for Reports means `order.isActive === true`. Orders with `isActive === false` (cancelled/voided) MUST NOT be included in any aggregation.

**REP-5** — `availableQty` per product MUST equal the sum of `InventoryEntry.available` for that product as returned by `InventoryOfflineService`. It MUST NOT read a `product.availableQuantity` field (that field does not exist on the domain model).

**REP-6** — `receivedToday` per product MUST equal the sum of `inventoryEntry.quantity` for inventory entries on today's date for that product.

**REP-7** — `consumedToday` per product MUST equal the total quantity of that product sold across all active orders today (sum of `orderItem.quantity` for matching `productId`).

**REP-8** — `netChange` per product MUST equal `receivedToday - consumedToday`.

**REP-9** — The Reports page component MUST call `getTodayReport` on mount and display all sections.

**REP-10** — The Reports page MUST provide a manual "Actualizar" button. Clicking it calls `getTodayReport` again and updates all displayed values. There is NO automatic polling or interval-based refresh.

**REP-11** — If there are no active orders today, the Sales Summary section MUST display a zero-state message (not an error). `totalRevenue` is 0, `orderCount` is 0.

**REP-12** — If there are no inventory entries today, inventory movement columns (`receivedToday`, `consumedToday`, `netChange`) MUST display 0 for all products. No error state is shown.

**REP-13** — The Reports page is READ-ONLY. No create, edit, or delete actions are exposed.

**REP-14** — Existing inventory routes (`today-quantities`, `today-sales-profit`) MUST NOT be modified by Phase 3. The Reports route is additive.

**REP-15** — `revenueByPaymentType` MUST include all `PaymentType` values even if they have 0 revenue for today (no missing keys).

### Scenarios

**S-REP-1: totalRevenue sums only active orders**
- GIVEN 3 active orders with totals 100, 200, 150 and 1 cancelled order (isActive=false) with total 500
- WHEN `getTodayReport(today)` is called
- THEN `totalRevenue` equals 450 and `orderCount` equals 3; the cancelled order's 500 is excluded

**S-REP-2: availableQty from InventoryEntry.available**
- GIVEN product `p1` has 2 inventory entries with `available` values 30 and 20
- WHEN `getTodayReport(today)` is called
- THEN `inventoryStatus[p1].availableQty` equals 50

**S-REP-3: receivedToday sums today's inventory entries**
- GIVEN 2 inventory entries for product `p1` dated today with quantities 10 and 15
- AND 1 inventory entry for `p1` dated yesterday with quantity 100
- WHEN `getTodayReport(today)` is called
- THEN `inventoryStatus[p1].receivedToday` equals 25

**S-REP-4: consumedToday from order line items**
- GIVEN 2 active orders today each containing product `p1` with quantities 3 and 7
- WHEN `getTodayReport(today)` is called
- THEN `inventoryStatus[p1].consumedToday` equals 10

**S-REP-5: netChange = received - consumed**
- GIVEN `receivedToday` = 25 and `consumedToday` = 10 for product `p1`
- WHEN `getTodayReport(today)` is called
- THEN `inventoryStatus[p1].netChange` equals 15

**S-REP-6: revenueByPaymentType groups correctly**
- GIVEN 2 active orders with PaymentType.Efectivo (100, 200) and 1 with PaymentType.Zelle (80)
- WHEN `getTodayReport(today)` is called
- THEN `revenueByPaymentType[PaymentType.Efectivo]` equals 300, `revenueByPaymentType[PaymentType.Zelle]` equals 80, `revenueByPaymentType[PaymentType.Tarjeta]` equals 0

**S-REP-7: topProducts sorted descending by quantity**
- GIVEN product `A` sold 5 units and product `B` sold 10 units today
- WHEN `getTodayReport(today)` is called
- THEN `topProducts[0].productId` equals `B`'s id and `topProducts[1].productId` equals `A`'s id

**S-REP-8: empty state — no orders today**
- GIVEN no orders exist for today
- WHEN the Reports page renders
- THEN the Sales Summary section shows a zero-state message and `totalRevenue` displayed is 0

**S-REP-9: Actualizar button triggers re-read**
- GIVEN the Reports page is mounted and displaying data
- WHEN a new order is added to localStorage (simulated) and the user clicks "Actualizar"
- THEN `getTodayReport` is called again and the new order's total is included in the displayed revenue

**S-REP-10: cancelled orders excluded from topProducts**
- GIVEN product `p1` appears only in a cancelled order (isActive=false) with quantity 999
- AND 1 active order for product `p2` with quantity 1
- WHEN `getTodayReport(today)` is called
- THEN `topProducts` contains only `p2`; `p1` does not appear

**S-REP-11: feature gate — TodayReports (50)**
- GIVEN a user without feature 50
- WHEN navigating to `/reports/today`
- THEN the user is redirected to the unauthorized route

---

## Module 4 — Statistics

### Requirements

**STAT-1** — The `/stats/dashboard` route MUST be registered in `routes.ts` with `loader = featureLoader([EFeatures.Dashboard])` (value 60). Navigating without the feature redirects to the unauthorized route. The route path is `/stats/dashboard` (matching `menu-config.ts`), NOT `/statistics/dashboard`.

**STAT-2** — `StatisticsAggregationService` MUST be a plain class under `statistics/lib/services/`. It uses `OrderOfflineService.getByDateRange(from, to)` to read the last 30 calendar days of orders.

**STAT-3** — `StatisticsAggregationService.getDailySales(fromDate: Date, toDate: Date): DailySalesPoint[]` MUST return one entry per calendar day in the range. Each entry contains:
- `date: string` — ISO date string (e.g. `"2026-04-27"`)
- `orderCount: number` — count of active orders on that day
- `totalRevenue: number` — sum of `order.total` for active orders on that day

**STAT-4** — `StatisticsAggregationService.getDailyProfit(fromDate: Date, toDate: Date): DailyProfitPoint[]` MUST return one entry per calendar day. Each entry contains:
- `date: string` — ISO date string
- `grossProfit: number` — sum of `calculateOrderProfit(orderItem).profit` across all order items in active orders that day
- `totalRevenue: number` — sum of `calculateOrderProfit(orderItem).revenue` for the same
- `totalCost: number` — sum of `calculateOrderProfit(orderItem).cost` for the same

**STAT-5** — Profit computation MUST use `calculateOrderProfit(orderItem)` with `orderItem.productCosts` (FIFO cost embedded at order creation time). Re-reading `InventoryEntries` to look up cost is FORBIDDEN — it produces incorrect results for historical orders.

**STAT-6** — Days with zero active orders MUST still appear in the returned arrays with `orderCount: 0`, `totalRevenue: 0`, `grossProfit: 0`, `totalRevenue: 0`, `totalCost: 0`. The arrays always have exactly 30 entries (days 0 through 29 inclusive, where day 29 = today).

**STAT-7** — Only active orders (`order.isActive === true`) contribute to any aggregation. Cancelled orders MUST be excluded.

**STAT-8** — The Statistics page route file MUST use `React.lazy` to import the chart core file, so recharts is code-split into a separate chunk. The main bundle (auth, login, home) MUST NOT contain recharts.

**STAT-9** — `LastMonthSalesComponent` MUST be a presentational component accepting `data: DailySalesPoint[]`, `loading: boolean`, `error: string | null`. Primary Y-axis metric is `totalRevenue`. The tooltip MUST also display `orderCount`. An `error` prop renders an error message; `loading` renders a loading indicator.

**STAT-10** — `LastMonthSaleProfitsComponent` MUST be a presentational component accepting `data: DailyProfitPoint[]`, `loading: boolean`, `error: string | null`. Y-axis metric is `grossProfit`. The tooltip MUST display `totalRevenue`, `totalCost`, and `grossProfit`. An `error` prop renders an error message; `loading` renders a loading indicator.

**STAT-11** — Both chart components MUST use Recharts `ResponsiveContainer` so they resize with their parent.

**STAT-12** — When `data` is empty (all 30 days have zero orders), each chart MUST render an empty-state message ("No sales data for this period" / "No profit data for this period") instead of an empty chart.

**STAT-13** — Currency values displayed in tooltips MUST use the `$` prefix pattern (e.g. `$1,234.00`), consistent with the existing codebase. `Intl.NumberFormat` is NOT introduced in Phase 3.

### Scenarios

**S-STAT-1: getDailySales returns exactly 30 entries**
- GIVEN the service is called with `fromDate = today-29d` and `toDate = today`
- WHEN `getDailySales(fromDate, toDate)` is called
- THEN the returned array has exactly 30 entries, one per calendar day

**S-STAT-2: getDailySales — day with active orders**
- GIVEN 2 active orders on 2026-04-15 with totals 100 and 200
- WHEN `getDailySales(...)` is called for a range including 2026-04-15
- THEN the entry for 2026-04-15 has `orderCount: 2` and `totalRevenue: 300`

**S-STAT-3: getDailySales — day with no orders**
- GIVEN no orders exist on 2026-04-16
- WHEN `getDailySales(...)` is called for a range including 2026-04-16
- THEN the entry for 2026-04-16 has `orderCount: 0` and `totalRevenue: 0`

**S-STAT-4: getDailySales — cancelled orders excluded**
- GIVEN 1 active order (total 100) and 1 cancelled order (total 500) on 2026-04-15
- WHEN `getDailySales(...)` is called
- THEN the entry for 2026-04-15 has `orderCount: 1` and `totalRevenue: 100`

**S-STAT-5: getDailyProfit uses calculateOrderProfit**
- GIVEN an active order on 2026-04-15 with one OrderItem: `price=10, quantity=5, productCosts=[{costPrice:6, quantity:5}]`
- WHEN `getDailyProfit(...)` is called for a range including 2026-04-15
- THEN the entry for 2026-04-15 has `totalRevenue: 50`, `totalCost: 30`, `grossProfit: 20`

**S-STAT-6: getDailyProfit — zero-order day**
- GIVEN no active orders on 2026-04-16
- WHEN `getDailyProfit(...)` is called for a range including 2026-04-16
- THEN the entry for 2026-04-16 has `grossProfit: 0`, `totalRevenue: 0`, `totalCost: 0`

**S-STAT-7: getDailyProfit — multiple items in one order**
- GIVEN 1 active order with 2 OrderItems:
  - Item A: price=10, qty=2, productCosts=[{costPrice:6, qty:2}] → profit=8
  - Item B: price=20, qty=1, productCosts=[{costPrice:12, qty:1}] → profit=8
- WHEN `getDailyProfit(...)` is called
- THEN the day entry has `grossProfit: 16`, `totalRevenue: 40`, `totalCost: 24`

**S-STAT-8: getDailyProfit does NOT read InventoryEntries**
- GIVEN `InventoryOfflineService` is available but has different costs than `productCosts`
- WHEN `getDailyProfit(...)` is called
- THEN `InventoryOfflineService` is not called (profit source is exclusively `calculateOrderProfit`)

**S-STAT-9: chart renders empty state when all 30 days are zero**
- GIVEN all 30 entries have `totalRevenue: 0` and `orderCount: 0`
- WHEN `LastMonthSalesComponent` renders with `loading: false` and `error: null`
- THEN the component renders "No sales data for this period" (no chart rendered)

**S-STAT-10: chart renders loading indicator**
- GIVEN `loading: true`
- WHEN `LastMonthSalesComponent` renders
- THEN a loading indicator is present (chart data is not rendered)

**S-STAT-11: feature gate — Dashboard (60)**
- GIVEN a user without feature 60
- WHEN navigating to `/stats/dashboard`
- THEN the user is redirected to the unauthorized route

**S-STAT-12: recharts not in auth bundle**
- GIVEN the app is built with `pnpm build`
- WHEN the output chunks are inspected
- THEN no chunk serving the auth or login route contains `recharts`

---

## Cross-cutting Requirements

**CC-1** — All four new route modules MUST export a `default` page function (e.g. `export default function ExpensesTodayPage()`) required by React Router, plus a named `loader` export using `featureLoader`.

**CC-2** — All four routes MUST be registered in `apps/web-store-pos/app/routes.ts`.

**CC-3** — i18n keys for form labels, expense type labels, payment type labels, chart titles, empty-state messages, and the "Actualizar" button MUST be added to `apps/web-store-pos/app/shared/lib/i18n/es.ts`. The following keys MUST exist at minimum:
- `EXPENSES.FORM_TYPE`, `EXPENSES.FORM_TOTAL`, `EXPENSES.FORM_DATE`, `EXPENSES.FORM_PAYMENT_TYPE`, `EXPENSES.FORM_NOTE`
- `EXPENSES.ADD_BUTTON`, `EXPENSES.EDIT_TITLE`, `EXPENSES.CREATE_TITLE`, `EXPENSES.DELETE_CONFIRM`
- `EXPENSES.TOTAL_LABEL`, `EXPENSES.EMPTY_STATE`
- `REPORTS.REFRESH_BUTTON`, `REPORTS.SALES_SUMMARY`, `REPORTS.INVENTORY_STATUS`, `REPORTS.EMPTY_ORDERS`, `REPORTS.EMPTY_INVENTORY`
- `STATISTICS.SALES_CHART_TITLE`, `STATISTICS.PROFIT_CHART_TITLE`, `STATISTICS.EMPTY_SALES`, `STATISTICS.EMPTY_PROFIT`

**CC-4** — No existing test MUST fail after Phase 3 is applied. The suite starting count is 287 passing tests; the post-Phase-3 count MUST be strictly greater than 287.

**CC-5** — `tsc --noEmit` (run as `pnpm -C apps/web-store-pos exec tsc --noEmit`) MUST exit with code 0.

**CC-6** — `pnpm build` (run as `pnpm -C apps/web-store-pos build`) MUST succeed. The build output MUST include a separate chunk for the statistics route containing recharts; recharts MUST NOT appear in any other named chunk (auth, home, sales, inventory, reports, expenses).

**CC-7** — `recharts` MUST be added to `apps/web-store-pos/package.json` as a production dependency.

**CC-8** — All new components MUST follow the existing naming convention: kebab-case filenames (e.g. `expense-list.tsx`, `today-expenses.tsx`).

---

## Acceptance Gate

The following numbered items are the checklist `sdd-verify` MUST validate:

1. **Route registration — Today Expenses:** `/expenses/today` is registered in `routes.ts`; its loader calls `featureLoader([EFeatures.TodayExpenses])` with value 80.
2. **Route registration — Expenses History:** `/expenses/expenses` is registered in `routes.ts`; its loader calls `featureLoader([EFeatures.ExpensesHistory])` with value 102.
3. **Route registration — Reports:** `/reports/today` is registered in `routes.ts`; its loader calls `featureLoader([EFeatures.TodayReports])` with value 50.
4. **Route registration — Statistics:** `/stats/dashboard` is registered in `routes.ts`; its loader calls `featureLoader([EFeatures.Dashboard])` with value 60.
5. **ExpensesHistory menu item:** `menu-config.ts` contains an entry for ExpensesHistory pointing to `/expenses/expenses`.
6. **Date utils:** `shared/lib/date-utils.ts` exports `startOfDay` and `addDays`; both have passing unit tests covering S-DATE-1 through S-DATE-5.
7. **ExpenseOfflineService — all methods present:** `getAll`, `getByDateRange`, `getToday`, `save`, `delete` all exist and have passing unit tests covering S-EXP-1 through S-EXP-7.
8. **Today Expenses — add/edit/delete:** Components render correctly; S-EXP-8 through S-EXP-16 pass.
9. **History Expenses — no add/no delete:** S-EXP-11 passes (no add button, no delete control). Edit works (S-EXP-17 equivalent).
10. **History filter and pagination:** S-EXP-12, S-EXP-13, S-EXP-14 pass.
11. **ReportAggregationService — all aggregations correct:** S-REP-1 through S-REP-10 pass.
12. **Reports empty states:** S-REP-8 passes; no crashes when orders or inventory entries are absent.
13. **Reports Actualizar button:** S-REP-9 passes (re-read triggered; no polling).
14. **StatisticsAggregationService — getDailySales:** S-STAT-1 through S-STAT-4 pass; always 30 entries.
15. **StatisticsAggregationService — getDailyProfit:** S-STAT-5 through S-STAT-8 pass; InventoryOfflineService not called for cost.
16. **Chart components — empty and loading states:** S-STAT-9 and S-STAT-10 pass for both chart components.
17. **Statistics lazy loading:** S-STAT-12 passes — recharts absent from auth/login bundle.
18. **i18n keys present:** All keys listed in CC-3 exist in `es.ts`.
19. **TypeScript clean:** `pnpm -C apps/web-store-pos exec tsc --noEmit` exits 0.
20. **Build succeeds:** `pnpm build` exits 0; statistics chunk contains recharts; no other named chunk does.
21. **Test count increases:** `pnpm test` exits 0 with more than 287 passing tests.
22. **No regressions:** All 287 pre-existing tests still pass.
23. **`recharts` in package.json:** `apps/web-store-pos/package.json` lists `recharts` as a dependency.
24. **Existing inventory routes untouched:** `today-quantities.tsx` and `today-sales-profit.tsx` are byte-for-byte identical to their pre-Phase-3 state (or only updated if Phase 3 accidentally broke them — verify by diffing).

---

## Risks and Spec-Level Assumptions

1. **PRD statistics route path conflict resolved:** PRD says `/statistics/dashboard`; `menu-config.ts` has `/stats/dashboard`. The proposal chose `/stats/dashboard` to avoid changing menu-config. This spec encodes that decision as hard requirement STAT-1. If the team later changes the path, both `routes.ts` AND `menu-config.ts` must be updated together.

2. **PRD statistics cost source overridden:** PRD section "Daily Profit" says to look up cost from InventoryEntries. The proposal rejected this in favor of `calculateOrderProfit(orderItem)` which uses the FIFO cost already embedded in `orderItem.productCosts` at order creation. This spec encodes that decision as STAT-5. The PRD is wrong here — re-reading InventoryEntries for historical orders produces incorrect results when stock has been partially depleted since the order was created.

3. **PRD reports `availableQuantity` field does not exist:** PRD section 5.3 references `product.availableQuantity`. That field does not exist on the `Product` domain model. This spec requires `availableQty = sum(InventoryEntry.available)` (REP-5), consistent with the proposal and how the existing inventory services work.

4. **PRD reports "updates automatically" interpreted as mount + manual button:** The PRD says the report "updates automatically." Given the fully offline/localStorage architecture with no WebSocket or server-sent events, "automatically" means on mount. The proposal added an explicit "Actualizar" button for user-triggered refresh. No polling is introduced. This is encoded as REP-10.

5. **Expense.note non-optional in domain:** The `Expense` interface has `note: string` (not `note?: string`). The spec requires default `''` at the form submit layer (EXP-7) rather than changing the domain model.

6. **Test count baseline is 287:** This figure is taken from the Phase 2 archive. If the actual count at Phase 3 start differs, the acceptance gate (item 21) should be updated before apply begins.
