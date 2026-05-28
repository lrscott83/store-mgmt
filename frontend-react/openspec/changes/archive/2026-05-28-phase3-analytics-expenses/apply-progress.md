# Apply Progress: phase3-analytics-expenses — ALL 3 SLICES COMPLETE

**Status:** DONE (all 3 slices complete — Phase 3 implementation COMPLETE)
**Date:** 2026-05-28
**Baseline test count:** 287 (re-confirmed at apply start)
**Slice 1 final count:** 313 (+26 new tests)
**Slice 2 final count:** 332 (+19 over Slice 1 baseline of 313)
**Slice 3 final count:** 353 (+21 over Slice 2 baseline of 332)

---

## TDD Evidence Table

### Slice 1 (DONE ✓)

| Task | Status | RED Evidence | GREEN Result |
|------|--------|-------------|--------------|
| 1.A.1 date-utils test | [x] | Import error: `./date-utils` not found | — |
| 1.A.2 date-utils.ts | [x] | — | 7 tests green (294 total) |
| 1.A.3 order-offline-service refactor | [x] | Behavior-preserving import swap | 294 still passing |
| 1.A.4 inventory-offline-service refactor | [x] | Behavior-preserving import swap | 294 still passing |
| 1.A.5 verify existing tests | [x] | All order+inventory tests green | HARD GATE passed |
| 1.B.1 expense-offline-service test | [x] | Import error: service not found | — |
| 1.B.2 expense-offline-service.ts | [x] | — | 9 tests green (303 total) |
| 1.C.1 expense-form-modal.tsx | [x] | Component created | Smoke render passes |
| 1.C.2 expense-list.tsx | [x] | Component created | Smoke render passes |
| 1.C.3 expense-filters.tsx | [x] | Component created | Smoke render passes |
| 1.C.4 expense-pagination.tsx | [x] | Component created | Smoke render passes |
| 1.D.1 today-expenses.tsx route | [x] | Route created | 10 route smoke tests green |
| 1.D.2 expenses-history.tsx route | [x] | Route created | History has NO add/delete |
| 1.E.1 i18n keys (EXPENSES.*) | [x] | Added to es.ts | All keys present |
| 1.E.2 ExpensesHistory menu item | [x] | Added to menu-config.ts | EFeatures.ExpensesHistory |
| 1.E.3 Route registration | [x] | Added to routes.ts | Both expense routes registered |
| 1.E.4 Build gate | [x] | tsc --noEmit exits 0, build succeeds | 313 tests pass |

### Slice 2 (DONE ✓)

| Task | Status | RED Evidence | GREEN Result |
|------|--------|-------------|--------------|
| 2.A.1 report-aggregation-service.test.ts | [x] | Import error: service not found (313 pass, 1 file fails) | — |
| 2.A.2 report-aggregation-service.ts | [x] | — | 11 service tests green (324 total) |
| 2.B.1 reports-routes.test.tsx (RED) | [x] | Import error: today-report not found | — |
| 2.B.1 today-report.tsx route | [x] | — | 8 route smoke tests green (332 total) |
| 2.C.1 i18n keys (REPORTS.*) | [x] | Added to es.ts | All keys present |
| 2.C.2 Route registration | [x] | Added to routes.ts | /reports/today registered |
| 2.C.3 BUILD GATE | [x] | tsc --noEmit exits 0, build succeeds | 332 tests pass |

### Slice 3 (DONE ✓)

| Task | Status | RED Evidence | GREEN Result |
|------|--------|-------------|--------------|
| 3.A.1 recharts dep | [x] | Added to package.json, pnpm install | recharts@2.15.4 installed |
| 3.B.1 statistics-aggregation-service.test.ts | [x] | Import error: service not found | RED confirmed |
| 3.B.2 statistics-aggregation-service.ts | [x] | — | 15 service tests green (347 total) |
| 3.C.1 chart-core.tsx | [x] | Created — sole recharts importer | SalesChartCore + ProfitChartCore exported |
| 3.C.2 sales-chart.tsx (lazy) | [x] | Created — React.lazy → chart-core | No static recharts import |
| 3.C.3 profit-chart.tsx (lazy) | [x] | Created — React.lazy → chart-core | No static recharts import |
| 3.D.1 statistics-routes.test.tsx (RED) | [x] | Import error: dashboard not found | RED confirmed |
| 3.D.1 dashboard.tsx route | [x] | — | 6 smoke tests green (353 total) |
| 3.E.1 i18n keys (STATISTICS.*) | [x] | Added to es.ts | 5 STATISTICS.* keys present |
| 3.E.2 Route registration stats/dashboard | [x] | Added to routes.ts | featureLoader([EFeatures.Dashboard]) = 60 |
| 3.E.3 Bundle split verification | [x] | recharts in chart-core-Cx30H828.js ONLY (386KB). entry.client/index/auth-layout: 0 refs | GATE PASSED |
| 3.E.4 SLICE 3 FINAL GATE | [x] | tsc 0, build OK, 353 tests (32 files, all pass) | COMPLETE |

---

## recharts Code-Split Evidence (Acceptance Gate items 17, 20)

- **Chunk name:** `chart-core-Cx30H828.js` (386 KB / 108 KB gzip)
- **recharts grep in chart-core-Cx30H828.js:** 15 matches
- **recharts grep in entry.client-B6_GaJgF.js:** 0
- **recharts grep in index-D9sdGJlZ.js (main vendor):** 0
- **recharts grep in auth-layout-CE5BnZAI.js:** 0
- **Conclusion:** recharts lives exclusively in the lazy chart-core chunk. ✓

---

## Acceptance Gate Coverage

### Slice 1 items verified
- [x] 1 — /expenses/today registered with featureLoader value 80
- [x] 2 — /expenses/expenses registered with featureLoader value 102
- [x] 5 — ExpensesHistory menu item → /expenses/expenses
- [x] 6 — date-utils.ts exports startOfDay + addDays with 7 passing tests
- [x] 7 — ExpenseOfflineService all methods + 9 passing tests
- [x] 8 — Today Expenses: add/edit/delete + running total (smoke tested)
- [x] 9 — History: no add button, no delete control (verified in tests)
- [x] 10 — History: date-range filter + pagination controls
- [x] 18 — i18n EXPENSES.* keys present in es.ts
- [x] 22 — All pre-existing 287 tests still pass
- [x] 24 — today-quantities.tsx + today-sales-profit.tsx unchanged
- [x] 19 — tsc --noEmit exits 0

### Slice 2 items verified
- [x] 3 — /reports/today registered with featureLoader([EFeatures.TodayReports]) = 50
- [x] 11 — ReportAggregationService aggregations (11 service unit tests pass)
- [x] 12 — Reports empty states (no crash, zero values shown)
- [x] 13 — Reports Actualizar button present (smoke tested)
- [x] 18 — i18n REPORTS.* keys present in es.ts
- [x] 19 — tsc --noEmit exits 0
- [x] 21 — pnpm test exits 0 with 332 passing tests (> 287 baseline)
- [x] 22 — All 287 pre-existing tests still pass
- [x] 24 — today-quantities.tsx + today-sales-profit.tsx unchanged (not touched)

### Slice 3 items verified
- [x] 4 — /stats/dashboard registered with featureLoader([EFeatures.Dashboard]) = 60
- [x] 14 — getDailySales returns 30 entries, correct aggregation (15 service tests pass)
- [x] 15 — getDailyProfit uses calculateOrderProfit; InventoryOfflineService NEVER called (spy in test)
- [x] 16 — Chart empty/loading states present (Suspense fallback + allZero check)
- [x] 17 — recharts absent from auth/login bundle (0 hits in auth-layout/entry chunks)
- [x] 18 — STATISTICS.* i18n keys present in es.ts
- [x] 19 — tsc --noEmit exits 0
- [x] 20 — pnpm build succeeds; recharts in chart-core-Cx30H828.js only
- [x] 21 — pnpm test exits 0 with 353 passing tests (> 287 baseline)
- [x] 22 — All 287 pre-existing tests still pass
- [x] 23 — recharts in package.json (recharts@2.15.4)

---

## Files Changed

### New files (Slice 1)
- `app/shared/lib/date-utils.ts` — startOfDay, addDays (canonical implementations)
- `app/shared/lib/date-utils.test.ts` — 7 unit tests
- `app/expenses/lib/services/expense-offline-service.ts` — full CRUD service
- `app/expenses/lib/services/expense-offline-service.test.ts` — 9 unit tests
- `app/expenses/components/expense-form-modal.tsx` — form modal component
- `app/expenses/components/expense-list.tsx` — list with conditional delete
- `app/expenses/components/expense-filters.tsx` — date-range + type filter
- `app/expenses/components/expense-pagination.tsx` — page/limit pagination
- `app/expenses/routes/today-expenses.tsx` — add/edit/delete + running total
- `app/expenses/routes/expenses-history.tsx` — browse+edit only, no add/delete
- `app/expenses/routes/__tests__/expenses-routes.test.tsx` — 10 smoke render tests

### New files (Slice 2)
- `app/reports/lib/services/report-aggregation-service.ts` — ReportAggregationService (Approach B)
- `app/reports/lib/services/report-aggregation-service.test.ts` — 11 unit tests
- `app/reports/routes/today-report.tsx` — combined daily dashboard (sales + inventory)
- `app/reports/routes/__tests__/reports-routes.test.tsx` — 8 smoke render tests

### New files (Slice 3)
- `app/statistics/lib/services/statistics-aggregation-service.ts` — StatisticsAggregationService
- `app/statistics/lib/services/statistics-aggregation-service.test.ts` — 15 unit tests
- `app/statistics/components/chart-core.tsx` — sole recharts importer (SalesChartCore + ProfitChartCore)
- `app/statistics/components/sales-chart.tsx` — React.lazy wrapper (no direct recharts import)
- `app/statistics/components/profit-chart.tsx` — React.lazy wrapper (no direct recharts import)
- `app/statistics/routes/dashboard.tsx` — DashboardPage + featureLoader(Dashboard=60)
- `app/statistics/routes/__tests__/statistics-routes.test.tsx` — 6 smoke render tests

### Modified files
- `app/sales/lib/services/order-offline-service.ts` — imports date-utils [Slice 1]
- `app/inventory/lib/services/inventory-offline-service.ts` — imports date-utils [Slice 1]
- `app/shared/lib/i18n/es.ts` — EXPENSES.* [Slice 1], REPORTS.* [Slice 2], STATISTICS.* [Slice 3]
- `app/shared/lib/config/menu-config.ts` — ExpensesHistory menu item [Slice 1]
- `app/routes.ts` — expenses/today, expenses/expenses [Slice 1], reports/today [Slice 2], stats/dashboard [Slice 3]
- `apps/web-store-pos/package.json` — recharts@2.15.4 added [Slice 3]

---

## Deviations from Design

1. **isActive field** [Slice 1]: `Expense` extends `AuditableBaseModel` which requires `isActive: boolean`. Added `isActive: true` at create time.
2. **Combined smoke test file** [Slice 1]: mirroring `inventory-routes.test.tsx` pattern; both route containers in one file.
3. **InventoryEntryView cast** [Slice 2]: `InventoryOfflineService.getAll()` returns `InventoryEntryView[]` which has `productName` but NOT `available`. Service casts to `EntryWithAvailable` locally to access the runtime `available` field. Type-safe via cast; tsc passes.
4. **recharts@2.15.4 deprecation warning** [Slice 3]: npm shows deprecated warning but latest stable v2 branch; pnpm install succeeded. Alternative: upgrade to recharts v3 when stable.
5. **DailyProfitPoint simplified** [Slice 3]: spec says `profit: number` only. Design mentioned grossProfit/totalRevenue/totalCost in the interface, but spec STAT-4 only requires {date, profit}. Kept minimal per spec; tsc clean.

---

## What Remains

NOTHING. All 3 slices complete. Phase 3 implementation COMPLETE.
**Next recommended:** sdd-verify
