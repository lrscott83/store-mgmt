# Proposal: phase3-analytics-expenses

## Intent

**Problem.** Phase 2 shipped the primary transactional features (products, POS/orders/credits, inventory entries/egress/availability). What remains is the *insight* layer: the store owner can record sales but cannot record operating expenses, cannot see a consolidated daily report, and has no historical/visual view of business performance. The `Expense` domain model, the `Expenses`/`Reports`/`Statistics` modules, and their feature flags (`TodayExpenses=80`, `ExpensesHistory=102`, `TodayReports=50`, `Dashboard=60`) all already exist in the codebase but have **no routes wired**.

**Why now.** Phase 3 closes the analytics/expenses gap left after Phase 2. The aggregation backbone (`OrderOfflineService.getByDateRange`, `calculateOrderProfit`, `InventoryOfflineService`) is already in place, so the cost of building these three modules now is low and they unblock the owner's day-to-day financial visibility.

**Success looks like.** A store owner can: add/edit/delete today's expenses with a running total; browse and edit (no add, no delete) historical expenses with date+type filters and a filtered total; open a single Reports page summarizing today's sales, profit, inventory status, and available quantities; and view a Statistics dashboard with last-30-days sales-revenue and profit charts. All routes are feature-gated, offline-first, and covered by tests per Strict TDD.

## Scope

### In scope

- **Expenses module** — two routes (`/expenses/today`, `/expenses/expenses`), `ExpenseOfflineService`, today + history route components, expense form/list/total components.
- **Reports module** — one route (`/reports/today`), `ReportAggregationService`, a single combined dashboard route component. ADDITIVE only.
- **Statistics module** — one route (`/stats/dashboard`), `StatisticsAggregationService`, two lazy-loaded chart components (last-30-days sales revenue, last-30-days profit).
- **Recharts dependency** — added to `apps/web-store-pos/package.json`, lazy-loaded at the Statistics route level (mirroring the `@zxing/browser` code-split pattern: a core chart file behind `React.lazy`).
- **Shared `date-utils.ts`** — extract `startOfDay` / `addDays` (currently duplicated in `OrderOfflineService` + `InventoryOfflineService`) into `shared/lib/date-utils.ts`.
- **Wiring** — register the 4 routes in `routes.ts`; add an `ExpensesHistory` menu item to `menu-config.ts`; add module-specific i18n keys (form labels, expense types, chart titles) to `es.ts`.
- **Tests** — unit tests for the two aggregation services and `ExpenseOfflineService`; component tests for routes per Strict TDD.

### Out of scope (explicit)

- Synchronization / sync compatibility with the legacy Angular storage keys (deferred; verify only at a later sync phase).
- Admin, management, profile, landing modules.
- Refactoring the existing inventory routes (`today-quantities.tsx`, `today-sales-profit.tsx`) — they stay as-is; Reports re-aggregates in its own unified layout.
- `Intl.NumberFormat` currency formatting — keep the existing `$`-prefix pattern; defer to a later phase.
- New domain models or enum changes — `Expense` and all `EFeatures`/`EModules` values already exist.
- Precomputed/cached daily summaries in localStorage (premature optimization; 30-day O(n) scan is <5ms at typical volumes).
- Polling / live auto-refresh — Reports uses mount + manual refresh only.

## Routes to add

| Route path | Feature flag | Module | Description |
|---|---|---|---|
| `/expenses/today` | `EFeatures.TodayExpenses` (80) | Expenses=8 | Add/edit/delete today's expenses + running total |
| `/expenses/expenses` | `EFeatures.ExpensesHistory` (102) | Expenses=8 | Edit-only history with date+type filters + filtered total (no add, no delete) |
| `/reports/today` | `EFeatures.TodayReports` (50) | Reports=5 | Combined today dashboard: sales, profit, inventory status, available qty |
| `/stats/dashboard` | `EFeatures.Dashboard` (60) | Statistics=6 | Last-30-days sales-revenue + profit charts (recharts, lazy) |

Each route module follows the established pattern: `export default function XxxPage()` + `export const loader = featureLoader([EFeatures.X])`.

`menu-config.ts` already defines the `EXPENSES`, `REPORTS`, and `STATISTICS` groups and the `TodayExpenses` item. It is **missing an `ExpensesHistory` menu item** — that must be added. The Statistics menu path is already `/stats/dashboard`; do NOT change it — register the route at `stats/dashboard` to match.

## Approach per module

### Expenses — Approach A (direct service calls in route components)

`ExpenseOfflineService` is a thin wrapper around `new BaseRepository<Expense>('expenses', ['date', 'createdDate', 'updatedDate'])`, identical to the orders/credits pattern. Route components call it directly via `useEffect` — no aggregation layer needed for trivial CRUD + filtering.

- **Today view**: full add / edit / delete (with confirm) + running total.
- **History view**: edit allowed; NO add, NO delete. Date-range + expense-type filters; total of the filtered set only. Simple page/limit pagination (not virtual scroll).
- **`Expense.note`** is non-optional in the domain → default to `''` on form submit (`note: value ?? ''`).

### Reports — Approach B (dedicated aggregation service)

`ReportAggregationService` (under `reports/lib/services/`) consumes `OrderOfflineService` + `InventoryOfflineService` and returns shaped view models, keeping the route component thin.

- **Refresh**: load on mount + a manual "Actualizar" button. No polling.
- **Available quantity**: sum of `InventoryEntry.available` per product via `InventoryOfflineService` (there is no `availableQuantity` field on `Product`).
- **Completed/active proxy**: `Order.isActive === true`, consistent with existing code.
- ADDITIVE: re-implements aggregation in a unified Reports-module layout; does NOT touch the inventory routes.

### Statistics — Approach B (dedicated aggregation service + lazy charts)

`StatisticsAggregationService` (under `statistics/lib/services/`) computes last-30-days daily rollups and returns `DailySalesPoint[]` / `DailyProfitPoint[]`.

- **Profit cost source**: use `calculateOrderProfit(orderItem)` with embedded `productCosts` (FIFO cost baked in at order time). Do NOT re-read `InventoryEntries` — that would mis-cost historical data after stock depletion.
- **Sales chart primary metric**: total revenue (sum of order totals) per day. Order count may appear as a secondary/tooltip detail.
- **Recharts**: lazy-loaded behind a core chart file via `React.lazy` at the route level, so the library never enters the auth or other module bundles.
- **Currency**: keep `$`-prefix formatting.

### Cross-cutting

Extract `startOfDay` / `addDays` into `shared/lib/date-utils.ts` and have both new aggregation services (and ideally the existing services, opportunistically) import from it instead of redeclaring.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Recharts bundle leak into auth/other bundles | Lazy-load via a single core chart file behind `React.lazy` at the Statistics route; validate with a build/bundle check (mirror `@zxing/browser` split). |
| Reports vs inventory route overlap → duplicated aggregation | Scope Reports as a combined dashboard only; do NOT refactor `today-quantities`/`today-sales-profit`. Aggregation lives in `ReportAggregationService`. |
| 30-day localStorage scan performance | Acceptable (<5ms) at typical small-store volumes; O(n) synchronous read. Document it; revisit only on reported slowness. Reject the cached-summaries approach as premature. |
| `startOfDay`/`addDays` duplication growing | Extract to `shared/lib/date-utils.ts` in this phase before writing a third copy. |
| `Expense.note` non-optional crashes on empty | Enforce `note: value ?? ''` at the form-submit layer. |
| `menu-config` missing `ExpensesHistory` item | Add the item alongside the history route registration. |
| Recharts not yet installed | Add to `package.json`; verify Vite tree-shaking and lazy chunk emission. |

## Review Workload Forecast (rough size signal)

Estimated surface: **4 routes + 1 CRUD service (`ExpenseOfflineService`) + 2 aggregation services + chart components + form/list components + the `date-utils` extraction + i18n/menu/routes wiring + tests for all of the above.**

This is a **large** change that likely exceeds a ~400-line single-PR budget. **Chained/stacked PRs are recommended**, with a natural split along module boundaries:

1. PR 1 — shared `date-utils` extraction + `ExpenseOfflineService` + Expenses today/history routes.
2. PR 2 — `ReportAggregationService` + Reports route.
3. PR 3 — recharts dependency + `StatisticsAggregationService` + lazy chart components + Statistics route.

Each slice is independently testable and shippable. The tasks phase should confirm the exact line budget and PR boundaries.
