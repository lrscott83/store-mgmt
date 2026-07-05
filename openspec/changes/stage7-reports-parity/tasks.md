# Tasks: Stage 7 — Reports Module Parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~420-520 total (Unit A service+tests ~220; Unit B PDF+smoke test ~110; Unit C route rewrite ~90; Unit D deletions+rewrite ~-180/+120 net; Unit E i18n/menu ~30) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (by size); delivery pattern is commits-only, no PR/push per session |
| Suggested split | Unit A (ledger service, TDD) → Unit B (PDF export, TDD/smoke) → Unit C (route+L5 UI) → Unit D (supersession cleanup) → Unit E (i18n/menu) |
| Delivery strategy | commits-only, no PR/push (hybrid persistence, chained work-unit commits) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

**Divergence flag (must hold through GREEN):** Angular's col-9 `Costo Unitario` weights active entries by `entry.quantity`; the existing `InventoryOfflineService.getAvailableByCategory().avgCostPrice` weights by `entry.available` — semantically different for partially-sold entries. Unit A MUST NOT reuse `getAvailableByCategory` for col 9 and MUST NOT call `getAvailableInventoryCosts` (it mutates/deducts stock as a side effect). Unit A adds a new read-only method `getProductInventoriesByProductId` and weights by quantity — assert this explicitly in tests.

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type | Dependency |
|------|------|-------------|------------|
| A | `InventoryTodaySaleService` ledger composition (TDD) + new `InventoryOfflineService.getProductInventoriesByProductId` | feat | None (first) |
| B | PDF export infra (lazy jsPDF, TDD/smoke) | feat | After A (consumes `getProductRows()` output shape) |
| C | `today-report.tsx` rewrite to 13-col ledger + export FAB + L5 kit | feat | After A + B |
| D | Supersession cleanup (delete `report-aggregation-service` + rewrite route tests) | refactor | After C (route no longer references old service) |
| E | i18n/menu reconciliation (`REPORTS.*` → `REPORT.*`, menu-config) | fix | After C (route reads keys); couples menu-config.ts:67,70 + menu tests |

## Phase 1: Unit A — Ledger Service (TDD) — Req: Daily Ledger Row Composition, Identity & Stock-Movement Columns, Sale-Valuation Columns, Cost-Valuation Columns, Closing-Balance Columns

- [x] 1.1 RED: new `app/inventory/lib/services/__tests__/inventory-offline-service.test.ts` additions — `getProductInventoriesByProductId(productId)` returns raw `InventoryEntry[]` (not `InventoryEntryView`, i.e. includes `available`) for a product, unfiltered by `isActive`/`available`, sourced from `InventoryRepository.getByProductId`
- [x] 1.2 GREEN: add `getProductInventoriesByProductId(productId: string): InventoryEntry[]` to `InventoryOfflineService` (thin wrapper over `this.repo.getByProductId(this.storeId, productId)`); run inventory-offline-service tests green
- [x] 1.3 RED: new `app/reports/lib/services/inventory-today-sale-service.test.ts` (flat, matching the existing `report-aggregation-service.test.ts` sibling convention in this directory rather than a `__tests__/` subfolder) — N available products (`available>0` via `getAvailableQuantity`) -> exactly N rows for today (Requirement: Daily Ledger Row Composition)
- [x] 1.4 RED: same file — `Producto`=product name; `U`=literal `'U'` constant regardless of product's real unit-of-measure field (Requirement: Identity & Stock-Movement Columns, part 1)
- [x] 1.5 RED: same file — `Entrada`=sum of today's entry quantities (`getByDate(today)` filtered by productId, Σ `quantity`)
- [x] 1.6 RED: same file — `Disponible`=`available`+`vendido`
- [x] 1.7 RED: same file — `Inicio`=`available`+`vendido`-`Entrada`
- [x] 1.8 RED: same file — `Vendido`=sum of today's order-item quantities for the product (`getActiveOrdersInDay(today)`, Σ `orderItem.quantity`)
- [x] 1.9 RED: same file — worked scenario from spec: `available=10, entryQty=5, soldQty=3` -> `Entrada=5, Vendido=3, Disponible=13, Inicio=8`
- [x] 1.10 RED: same file — `Precio Venta`=avg(today's order-item prices) for the product; `0.00` when zero sales today (Requirement: Sale-Valuation Columns)
- [x] 1.11 RED: same file — `Importe Venta`=`Vendido`×`Precio Venta`
- [x] 1.12 RED: same file — `Costo Unitario`=quantity-weighted avg `costPrice` across the product's `available>0` entries from `getProductInventoriesByProductId` (NOT `getAvailableByCategory`'s available-weighted `avgCostPrice`); `0` when no active entries; worked scenario `{qty2,cost10},{qty3,cost20}` -> `16.00` (Requirement: Cost-Valuation Columns)
- [x] 1.13 RED: same file — explicit divergence-guard test: construct an entry with `quantity !== available` (partially sold) and assert the computed `Costo Unitario` matches quantity-weighting, NOT the `available`-weighted result `getAvailableByCategory` would produce for the same fixture
- [x] 1.14 RED: same file — `Costo Total`=`Vendido`×`Costo Unitario`; `C.P Venta`=`Costo Total`/`Importe Venta` when `Importe Venta>0` else `0`
- [x] 1.15 RED: same file — `Final`=`Disponible`-`Vendido`; `Importe Final`=`Final`×`Costo Unitario`; worked scenario `Disponible=13,Vendido=3,CostoUnitario=16.00` -> `Final=10, ImporteFinal=160.00`
- [x] 1.16 GREEN: create `app/reports/lib/services/inventory-today-sale-service.ts` — `InventoryTodaySaleService.getProductRows(date?: Date): InventoryTodaySaleRow[]`, pure composition of `ProductOfflineService.getAll()` (inline `isActive` filter, no `getAvailableProducts` in React), `OrderOfflineService.getActiveOrdersInDay`, `InventoryOfflineService.getAvailableQuantity`/`getByDate`/`getProductInventoriesByProductId`; typed numeric fields (no `toFixed` string formatting in the service — format at the UI/PDF edge); all ÷0 guards ported verbatim
- [x] 1.17 REFACTOR: run `inventory-today-sale-service.test.ts` + `inventory-offline-service.test.ts` green; `pnpm test`; `pnpm -C apps/web-store-pos exec tsc --noEmit`; `pnpm -C apps/web-store-pos build`; commit `feat(web-store-pos): add InventoryTodaySaleService ledger composition`

## Phase 2: Unit B — PDF Export Infra (TDD/smoke) — Req: Lazy Code-Split Export, Verbatim Administrative Header, Working Export Action

- [ ] 2.1 RED: new `app/reports/lib/pdf/__tests__/inventory-today-sale-pdf.test.ts` — module import alone does not trigger `jspdf`/`jspdf-autotable` module resolution (assert no eager top-level import; smoke-test the exported function signature) (Requirement: Lazy Code-Split Export)
- [ ] 2.2 RED: same file, `jspdf`+`jspdf-autotable` mocked — calling `exportInventoryTodaySalePdf(rows, meta)` performs `await import('jspdf')` and `await import('jspdf-autotable')` INSIDE the function body (not at module top-level)
- [ ] 2.3 RED: same file — generated document includes the verbatim 4-line administrative header (Empresa/Procedencia; Unidad/UBA/OEE/date; Departamento/Balance/BAT; Firma del Administrador) positioned above the title, followed by title `INVENTARIO A PRECIO DE VENTA` and a 13-column `autoTable` call (assert mocked `autoTable` invoked with 13 header columns matching spec column order) (Requirement: Verbatim Administrative Header)
- [ ] 2.4 RED: same file — mocked `doc.output`/`URL.createObjectURL`/`window.open` are all invoked (real PDF produced and opened, not a stub) (Requirement: Working Export Action)
- [ ] 2.5 GREEN: create `app/reports/lib/pdf/inventory-today-sale-pdf.ts` — `exportInventoryTodaySalePdf(rows: InventoryTodaySaleRow[], meta): Promise<void>`; lazy `await import('jspdf')` + `await import('jspdf-autotable')` inside the function; landscape letter; encabezado @ (40, 30+i*14) 10pt bold ×4 lines; title @ (300,100); `autoTable` 13 cols, fontSize 8, fillColor [220,220,220], margin.top 120, `didDrawPage` header/title redraw for page 2+; blob → `createObjectURL` → `window.open`
- [ ] 2.6 REFACTOR: run `inventory-today-sale-pdf.test.ts` green; `pnpm test`; `pnpm -C apps/web-store-pos exec tsc --noEmit`; `pnpm -C apps/web-store-pos build` (verify jspdf chunk is code-split, not in the main bundle); commit `feat(web-store-pos): add lazy-loaded inventory-today-sale PDF export`

## Phase 3: Unit C — Route Rewrite + L5 UI Kit — Req: Shared UI Kit Adoption

- [ ] 3.1 RED: extend `app/reports/routes/__tests__/reports-routes.test.tsx` (or add scoped assertions ahead of Unit D's full rewrite) — page renders the 13-col ledger table (headers Producto/U/Inicio/Entrada/Disponible/Vendido/Precio Venta/Importe Venta/Costo Unitario/Costo Total/C.P Venta/Final/Importe Final) sourced from `InventoryTodaySaleService.getProductRows()`
- [ ] 3.2 RED: same — export trigger is a `Button` with `variant="fab"` that, on click, calls `exportInventoryTodaySalePdf` (mocked) with the current rows
- [ ] 3.3 RED: same — ledger container renders inside shared `Card`; any status/error banner renders via `InfoBox` (Requirement: Shared UI Kit Adoption)
- [ ] 3.4 GREEN: rewrite `app/reports/routes/today-report.tsx` — drop `ReportAggregationService` usage, drop raw Tailwind container/`bg-blue-600` button; compose `Card` + 13-col table + `Button variant="fab"` (export) + `InfoBox` (empty/error state); load rows via `InventoryTodaySaleService.getProductRows()` on mount/refresh
- [ ] 3.5 REFACTOR: run reports route tests green; `pnpm test`; `pnpm -C apps/web-store-pos exec tsc --noEmit`; `pnpm -C apps/web-store-pos build`; commit `feat(web-store-pos): rewrite today-report to 13-col ledger with L5 kit + PDF export FAB`

## Phase 4: Unit D — Approach B Supersession Cleanup — Req: Dashboard Removal Without Coverage Loss

- [ ] 4.1 Confirm no remaining references to `ReportAggregationService`/`ReportSummary` outside `report-aggregation-service.ts` + its test (grep repo-wide) — safe to delete
- [ ] 4.2 DELETE `app/reports/lib/services/report-aggregation-service.ts` and `app/reports/lib/services/report-aggregation-service.test.ts` (11 unit tests removed)
- [ ] 4.3 REWRITE `app/reports/routes/__tests__/reports-routes.test.tsx` (8 tests) to fully assert ledger rendering (13 columns, computed values for a fixture, export FAB present and wired, no reference to the removed service) — net Reports test count MUST NOT decrease vs pre-change baseline (19 old tests -> confirm Unit A (13+) + Unit B (4+) + this rewrite (8) collectively meet/exceed 19)
- [ ] 4.4 Run full test suite; `pnpm test`; `pnpm -C apps/web-store-pos exec tsc --noEmit`; `pnpm -C apps/web-store-pos build`; grep-confirm zero remaining imports of `report-aggregation-service`; commit `refactor(web-store-pos): remove Approach B dashboard, supersede with ledger tests`

## Phase 5: Unit E — i18n/Menu Reconciliation (L6) — Req: Angular-Aligned i18n Namespace

- [ ] 5.1 In `app/shared/lib/i18n/es.ts`: DELETE the 8 `REPORTS.*` keys (lines ~457-467: `REPORTS.TODAY.TITLE`, `REPORTS.REFRESH`, `REPORTS.SALES_SUMMARY.*` ×4, `REPORTS.INVENTORY.*` ×3, adjusted per current line numbers post-Unit-C edits)
- [ ] 5.2 Same file: ADD `REPORT.TITLE`, `REPORT.INVENTORY_TODAY_SALE`, and 13 `REPORT.COLUMNS.*` keys (one per ledger column, matching Unit C's header labels)
- [ ] 5.3 Update `app/shared/lib/config/menu-config.ts` lines 67 & 70 — rename `MENU.REPORTS` group label key to `MENU.REPORTS.TITLE` and `MENU.TODAY_REPORTS` item key to `MENU.REPORTS.TODAY_REPORTS`; update `es.ts` entries at lines ~79 and ~121 accordingly
- [ ] 5.4 Update `today-report.tsx` (Unit C output) and any menu tests referencing the old keys to use the new `REPORT.*`/`MENU.REPORTS.*` keys — keep this atomic with 5.1-5.3 (coupling flagged in design)
- [ ] 5.5 Grep-confirm: search dictionary for `"REPORTS."` prefix -> no match; all Reports strings resolve under `REPORT.*`/`MENU.REPORTS.*`
- [ ] 5.6 Run full test suite (incl. menu-config tests); `pnpm test`; `pnpm -C apps/web-store-pos exec tsc --noEmit`; `pnpm -C apps/web-store-pos build`; commit `fix(web-store-pos): align Reports i18n/menu keys to Angular REPORT.*/MENU.REPORTS.* namespace`

## Phase 6: Full-Suite Regression Gate

- [ ] 6.1 Grep-confirm no remaining `ReportAggregationService`/`ReportSummary`/`REPORTS.` references anywhere in `apps/web-store-pos`; confirm `getProductInventoriesByProductId` is quantity-weighted at its one call site (col 9) and `getAvailableInventoryCosts` is never called from `InventoryTodaySaleService` (mutation-safety)
- [ ] 6.2 Run full `pnpm test` + `pnpm -C apps/web-store-pos exec tsc --noEmit` + `pnpm -C apps/web-store-pos build` clean; confirm net Reports-module test count >= pre-change baseline (no coverage loss per Requirement: Dashboard Removal Without Coverage Loss)
