# Design: phase3-analytics-expenses

## Technical Approach

Three feature modules wired into the authenticated `app-layout`. Expenses uses Approach A
(route containers call a thin `ExpenseOfflineService` directly, mirroring the inventory route
pattern). Reports + Statistics use Approach B (dedicated module-scoped aggregation services that
consume `OrderOfflineService` + `InventoryOfflineService` and return serializable view models, so
the aggregation logic is unit-testable without rendering). `recharts` is code-split behind a single
core file via `React.lazy`, mirroring the `@zxing/browser` scanner pattern. Shared `startOfDay`/
`addDays` are extracted to `shared/lib/date-utils.ts` and imported by the order/inventory services
with identical behavior.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Expenses layer | Direct service calls in route containers | Aggregation service | Trivial CRUD + flat filtering; matches today-quantities pattern |
| Reports/Stats layer | Dedicated aggregation services returning view models | Inline `useEffect` aggregation | Strict TDD needs isolated unit tests; thin containers; shared day-grouping |
| Profit cost source | `calculateOrderProfit(orderItem)` (embedded `productCosts`) | Re-read InventoryEntries | FIFO cost baked at order time; re-reading mis-costs depleted historical stock |
| recharts loading | `React.lazy(() => import('./chart-core'))` + Suspense | Static top-level import | Keeps recharts out of auth/main bundle; proven scanner pattern |
| date helpers | Extract to `shared/lib/date-utils.ts` | Leave duplicated | Two copies already exist; prevent a third |
| Expenses delete | `BaseRepository.remove` (hard delete) today-only | Soft-delete via isActive | Matches proposal; history is edit-only so no delete surface there |
| Statistics path | Register route at `stats/dashboard` | `statistics/dashboard` | Existing menu-config path is `/stats/dashboard`; do not change menu |

## Data Flow

    Route container (useEffect, storeId from useAuthStore)
        │
        ├─ Expenses:  new ExpenseOfflineService(storeId).getActiveToday() ─→ setState ─→ <ExpenseList/>
        │             form submit ─→ service.create/update/delete ─→ reload ─→ running total
        │
        ├─ Reports:   new ReportAggregationService(storeId).getTodayReport() ─→ ReportSummary ─→ presentational sections
        │             "Actualizar" button re-invokes (mount + manual, no polling)
        │
        └─ Statistics: new StatisticsAggregationService(storeId).getLast30DaysSales()/Profit()
                       ─→ DailySalesPoint[] / DailyProfitPoint[] ─→ <SalesChart/> ─lazy→ recharts

Aggregation services internally call existing `OrderOfflineService` / `InventoryOfflineService`;
they hold no state and are constructed per call (same as today-sales-profit).

## File Changes

| File | Action | Description |
|---|---|---|
| `app/shared/lib/date-utils.ts` | Create | Export `startOfDay`, `addDays` |
| `app/sales/lib/services/order-offline-service.ts` | Modify | Import date helpers from date-utils; delete local copies |
| `app/inventory/lib/services/inventory-offline-service.ts` | Modify | Same import swap; delete local copies |
| `app/expenses/lib/services/expense-offline-service.ts` | Create | Thin `BaseRepository<Expense>` wrapper |
| `app/expenses/routes/today-expenses.tsx` | Create | Container: add/edit/delete + running total |
| `app/expenses/routes/expenses-history.tsx` | Create | Container: filters + pagination + filtered total, edit-only |
| `app/expenses/components/expense-form-modal.tsx` | Create | Presentational form (type, total, paymentType, date, note) |
| `app/expenses/components/expense-list.tsx` | Create | Presentational list/table |
| `app/expenses/components/expense-filters.tsx` | Create | Date-range + type filter controls |
| `app/expenses/components/expense-pagination.tsx` | Create | page/limit control |
| `app/reports/lib/services/report-aggregation-service.ts` | Create | `getTodayReport()` → `ReportSummary` |
| `app/reports/routes/today-report.tsx` | Create | Container + presentational sections + refresh |
| `app/statistics/lib/services/statistics-aggregation-service.ts` | Create | 30-day rollups |
| `app/statistics/components/chart-core.tsx` | Create | ONLY file importing `recharts` |
| `app/statistics/components/sales-chart.tsx` | Create | `React.lazy` + Suspense wrapper |
| `app/statistics/components/profit-chart.tsx` | Create | `React.lazy` + Suspense wrapper |
| `app/statistics/routes/dashboard.tsx` | Create | Container: both charts |
| `app/routes.ts` | Modify | Register 4 routes under app-layout |
| `app/shared/lib/config/menu-config.ts` | Modify | Add `ExpensesHistory` item to EXPENSES group |
| `app/shared/lib/i18n/es.ts` | Modify | Add feature/label/chart/expense-type keys |
| `apps/web-store-pos/package.json` | Modify | Add `recharts` |

## Interfaces / Contracts

```ts
// shared/lib/date-utils.ts
export function startOfDay(date: Date): Date;
export function addDays(date: Date, days: number): Date;

// expenses/lib/services/expense-offline-service.ts
// const repo = new BaseRepository<Expense>('expenses', ['date','createdDate','updatedDate']);
export class ExpenseOfflineService {
  constructor(storeId: string);
  getAll(): Expense[];
  getById(id: string): Expense | undefined;
  getByDateRange(from: Date, to: Date): Expense[];   // type filter applied by caller
  getActiveToday(): Expense[];                         // start..start+1, isActive
  create(input: { type: ExpenseType; total: number; date: Date; paymentType: PaymentType; note: string }): Expense;
  update(id: string, patch: Partial<Pick<Expense,'type'|'total'|'date'|'paymentType'|'note'>>): Expense;
  delete(id: string): void;                            // repo.remove; today route only
}

// reports/lib/services/report-aggregation-service.ts
export interface ReportProductAvailable { productId: string; productName: string; available: number; }
export interface ReportSummary {
  date: Date;
  orderCount: number;          // active orders today
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  available: ReportProductAvailable[];   // sum InventoryEntry.available per product
}
export class ReportAggregationService {
  constructor(storeId: string);
  getTodayReport(): ReportSummary;
}

// statistics/lib/services/statistics-aggregation-service.ts
export interface DailySalesPoint { date: string; totalRevenue: number; orderCount: number; }
export interface DailyProfitPoint { date: string; profit: number; }
export class StatisticsAggregationService {
  constructor(storeId: string);
  getLast30DaysSales(today?: Date): DailySalesPoint[];   // revenue primary, count tooltip
  getLast30DaysProfit(today?: Date): DailyProfitPoint[]; // calculateOrderProfit per item
}
```

`date` keys in chart points are `YYYY-MM-DD` strings (serializable, stable X-axis). Profit/revenue
loops reuse `OrderOfflineService.getByDateRange` + per-day grouping via `startOfDay`.

## recharts Code-Split

`chart-core.tsx` is the SOLE importer of `recharts` (LineChart/BarChart/XAxis/YAxis/Tooltip/
ResponsiveContainer). `sales-chart.tsx` and `profit-chart.tsx` each do
`const Core = lazy(() => import('./chart-core').then(m => ({ default: m.ChartCore })))` and wrap it
in `<Suspense fallback={GENERAL.LOADING}>`. The dashboard route imports only the wrappers, never
`chart-core` or `recharts` directly. Verify the split via `pnpm -C apps/web-store-pos build`: recharts
must appear in its own lazy chunk, not in the entry/auth chunk (grep the build manifest / chunk list).

## date-utils Refactor

Move the two identical `startOfDay`/`addDays` functions (currently duplicated in
order-offline-service and inventory-offline-service) into `shared/lib/date-utils.ts`. Replace the
local definitions with `import { startOfDay, addDays } from '~/shared/lib/date-utils'`. Implementations
are byte-identical, so existing order/inventory service tests stay green — this is a pure
extract-and-import refactor with no behavior change.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (RED→GREEN) | `date-utils` startOfDay/addDays | Pure-function assertions incl. month/DST boundary |
| Unit (RED→GREEN) | `ExpenseOfflineService` CRUD + getActiveToday + getByDateRange | localStorage clear in beforeEach; assert storage key + revival |
| Unit (RED→GREEN) | `ReportAggregationService.getTodayReport` | Mock Order/Inventory services; assert totals + available |
| Unit (RED→GREEN) | `StatisticsAggregationService` 30-day rollups | Seed orders across days; assert point arrays + profit via calculateOrderProfit |
| Smoke render | expense form/list/filters, report sections, chart wrappers | RTL inside `<IntlProvider locale="es">`; chart wrappers assert Suspense fallback then render |

Strict TDD: aggregation + service logic gets failing-first unit tests; presentational components get
smoke render tests (mock services / pass props). `recharts` is not exercised in unit tests (lazy chunk).

## Migration / Rollout

No data migration. All routes feature-gated via `featureLoader`. After domain is untouched (no
exports added) no `packages/domain` rebuild needed. Run `pnpm -C apps/web-store-pos exec tsc --noEmit`
and `build` to validate routes + bundle split.

## Open Questions

None blocking. Bundle-split verification is a build-time check confirmed during apply.
