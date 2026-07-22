# Proposal: Presentation Parity — Bucket B

## Intent

Bucket B of the Angular→React presentation-parity audit: five STRUCTURAL divergences (not the mechanical fab/icon sweep of Bucket C). Each was verified against both sources post-batch-1. Two are reverted to mirror Angular exactly; two are ratified as accepted intentional React improvements (documented, no code). The remaining item adds a real working PDF export, wiring an existing orphaned React port that already faithfully mirrors Angular's commented-out generator.

## Scope

### In Scope

1. **Tutorial — revert to Angular.** `help/routes/tutorial.tsx` currently splits Angular's ONE panel into 4 independent collapsibles and dropped the group title. Angular `help/tutorial/tutorial.component.html` = a single `mat-expansion-panel` titled **"Pasos para realizar una venta"** (literal) holding all 4 numbered steps, under card title `TUTORIAL.TITLE`. Restore the single grouped panel + title.
2. **Owner "Tiendas" tab — revert to Angular.** `admin/owners/routes/owner-edit.tsx:358-362` mounts the full `AdminStoreListPage` (own `<h1>STORES.LIST_TITLE` + "+ Agregar" fab → `/management/stores/create`), duplicating owner-edit's own header/toolbar. Angular `app-store-list` (`stores/store-list.component.html`) is grid-only. Fix: render `StoreCardList` (`~/admin/stores/components/store-card-list`) directly with `stores`/`onEdit`/`onApprove`/`onDisapprove` (logic copied from `admin/stores/routes/store-list.tsx:26-70`), WITHOUT title/add-button. Keep `AdminStoreListPage` intact (still used by `/admin/stores`).
3. **Reports — keep dashboard + add working PDF button.** Keep `reports/routes/today-report.tsx` (KPI summary + inventory table). ADD a "Generar Reporte" button ABOVE the dashboard mirroring Angular's `mat-fab extended` (`file_download` icon, label `REPORT.INVENTORY_TODAY_SALE`). Wire it to the existing orphaned port `reports/lib/pdf/inventory-today-sale-pdf.ts`. Wiring requires porting Angular `generateProductRows()` (`inventory-today-sale.component.ts:176-226`) to build `InventoryTodaySaleRow[]` (today-report's `computeTodayReport` builds a different shape). See PDF-Fidelity subsection.

### Accepted Intentional Divergences (KEEP — no code change)

4. **Category actions menu** (`sales/components/category-actions-menu.tsx`): the React ⚙️ header menu is the single action path (Angular's 3 inline fabs not duplicated). Cleaner UX, kept by user decision.
5. **Statistics charts** (`statistics/routes/dashboard.tsx`, SalesChart/ProfitChart): recharts charts kept over Angular's plain Día|Ventas/Ganancias tables. KPI cards/currency-selector/top-products already at parity (batch-1).

### Out of Scope

- Batch-1 already-done: auth legal footer, register success-screen removal — untouched.
- Buckets C (fab/icon sweep — in flight), D, E (cosmetic) — separate changes.
- Angular's `generateReportWithBorder()` variant (bordered/hardcoded demo rows) — not the ported generator.
- **Auth decorative shell — CUT from scope mid-change by user decision.** Not implemented; confirmed via empty `*/auth/*` diff in the final verification.

## PDF Fidelity — Angular vs Orphaned React Port

Verified column-by-column: the orphaned port is a **FAITHFUL 1:1** of Angular's commented `generateReport()` (`inventory-today-sale.component.ts:44-99`). No corrections needed — wire as-is.

| Aspect | Match |
|--------|-------|
| 13 headers (Producto…Importe Final) | Verbatim ✓ |
| ENCABEZADO 4 lines + TITLE @(300,100) | Verbatim ✓ |
| Row shape / col-2 `unit` = literal `'U'` | Matches Angular line 212 ✓ |
| `toFixed(2)` on cols 7-11,13 | ✓ |
| autoTable styles/headStyles/margin/didDrawPage | fontSize8, cellPadding3, fillColor [220,220,220], top120/left40/right40, redraw page>1 ✓ |
| jsPDF landscape/pt/letter, blob + `window.open` (NO filename/save) | ✓ |

**Only gap = the row source**, not the PDF: today-report has no 13-column aggregator, so `generateProductRows()` (lines 176-226) must be ported to feed the port.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None. Pure presentation parity — no spec-level requirement changes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `help/routes/tutorial.tsx` | Modified | single grouped panel + title |
| `admin/owners/routes/owner-edit.tsx` | Modified | Tiendas tab → grid-only StoreCardList |
| `reports/routes/today-report.tsx` | Modified | add PDF button + row aggregator |
| `reports/lib/pdf/inventory-today-sale-pdf.ts` | Reused | wired (no change — verified faithful) |
| `sales/components/category-actions-menu.tsx`, `statistics/routes/dashboard.tsx` | None | documented keeps |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `generateProductRows` port drifts from Angular aggregation | Med | Strict-TDD the aggregator vs `inventory-today-sale.component.ts:176-226` |
| PDF opens blank/errors (dynamic jspdf import) | Low | Deps present; port verified faithful; behavior test on wiring |
| Owner store handlers diverge from AdminStoreListPage | Low | Copy exact fetch/approve/disapprove; reuse `confirmDialog` |

## Rollback Plan

Commits-only on the current parity branch (stacked). Each item is an independent commit — revert offending commit(s). No shared-component signature changes (StoreCardList reused as-is), no data/migrations. Charts/menu keeps are no-ops.

## Dependencies

- `jspdf` ^4.2.1 + `jspdf-autotable` ^5.0.8 — confirmed in `web-store-pos/package.json`.
- `StoreCardList`, `confirmDialog`, i18n keys — all exist.

## Testing

Strict TDD applies to testable changes: tutorial single-panel structure, owner Tiendas grid-only render (no title/add-button), the `generateProductRows` aggregator, and PDF-button wiring behavior.

## Success Criteria

- [x] Tutorial renders ONE "Pasos para realizar una venta" panel with 4 steps + `TUTORIAL.TITLE`.
- [x] Owner Tiendas tab shows only the store grid — no duplicated title/add-button; `AdminStoreListPage` untouched.
- [x] "Generar Reporte" button above the dashboard opens a real PDF matching Angular's 13-column layout.
- [x] Category menu + statistics charts unchanged; documented as accepted divergences.
- [x] Delivered as commits on the current branch.
