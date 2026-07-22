## Presentation Parity — Bucket B Specification

## Purpose

Five structural Angular→React presentation divergences (post-batch-1). Two
revert to Angular exactly, one adds a real working PDF export via an existing
faithful orphaned port, and two are ratified accepted-intentional-divergence
keeps (regression guards only — no code change).

## Requirements

### Requirement: Category actions menu stays the single action path (KEEP)

The system MUST keep `sales/components/category-actions-menu.tsx` (⚙️ header
menu) as the ONLY UI path for category actions. This is an accepted
intentional divergence from Angular's 3 inline fabs and MUST NOT be reverted.

#### Scenario: Category actions render via the gear menu only

- GIVEN the sales category list renders
- WHEN a category row displays its actions
- THEN only the `CategoryActionsMenu` (⚙️) is present
- AND no inline per-action fab buttons are rendered on the row

### Requirement: Tutorial renders as a single grouped panel

`help/routes/tutorial.tsx` MUST render exactly ONE collapsible panel titled
"Pasos para realizar una venta" (literal), containing all 4 numbered steps,
under card title `TUTORIAL.TITLE`, mirroring `tutorial.component.html`.

#### Scenario: Tutorial shows one panel with the group title

- GIVEN the tutorial route renders
- WHEN the DOM is inspected
- THEN exactly one collapsible panel exists with the title text
  "Pasos para realizar una venta"
- AND all 4 numbered steps render inside that single panel
- AND no 4 independent per-step panels are present

### Requirement: Owner "Tiendas" tab renders the store grid only

The Tiendas tab in `admin/owners/routes/owner-edit.tsx` MUST render only the
store grid (`StoreCardList`) with working approve/disapprove/edit actions. It
MUST NOT render a duplicated page title (`STORES.LIST_TITLE` / `<h1>`) or a
"+ Agregar" add-store fab inside the tab. `AdminStoreListPage` (used at
`/admin/stores`) MUST remain unchanged.

#### Scenario: Tiendas tab shows grid without title or add-button

- GIVEN an owner-edit page renders with the Tiendas tab active
- WHEN the tab content is inspected
- THEN store cards render via `StoreCardList`
- AND no `<h1>` with `STORES.LIST_TITLE` text is present
- AND no "+ Agregar" / add-store fab is present within the tab

#### Scenario: Store actions still work inside the tab

- GIVEN the Tiendas tab renders a store card
- WHEN the user triggers approve, disapprove, or edit on that card
- THEN the corresponding handler fires exactly as it does on `/admin/stores`

### Requirement: Statistics charts remain recharts (KEEP)

The system MUST keep `SalesChart`/`ProfitChart` (recharts) on
`statistics/routes/dashboard.tsx` as an accepted intentional divergence from
Angular's plain Día|Ventas/Ganancias tables. Batch-1 KPI/currency/top-products
parity MUST remain intact.

#### Scenario: Dashboard renders chart components, not plain tables

- GIVEN the statistics dashboard renders
- WHEN sales and profit sections are inspected
- THEN `SalesChart` and `ProfitChart` render
- AND KPI cards, currency selector, and top-products sections still render as
  established in batch-1

### Requirement: Reports dashboard is preserved and a working PDF export is added

`reports/routes/today-report.tsx` MUST keep its existing dashboard (KPI
summary + inventory table) UNCHANGED. The system MUST additionally render a
"Generar Reporte" `mat-fab`-extended-equivalent button ABOVE the dashboard.
Activating it MUST invoke the faithful orphaned port
`reports/lib/pdf/inventory-today-sale-pdf.ts` with rows built by a ported
`generateProductRows()` (from `inventory-today-sale.component.ts:176-226`)
computed from real offline data, matching Angular's `InventoryTodaySaleRow`
shape (13 columns; column 2 `unit` literal `'U'`).

#### Scenario: Report button renders above the existing dashboard

- GIVEN the today-report route renders
- WHEN the DOM is inspected
- THEN a "Generar Reporte" button is present above the KPI summary and
  inventory table
- AND the existing dashboard sections still render unchanged

#### Scenario: Clicking the button generates rows matching Angular's shape

- GIVEN the today-report route has offline data loaded
- WHEN the user activates "Generar Reporte"
- THEN the row-builder produces `InventoryTodaySaleRow[]` with 13 columns per
  row, `unit` equal to literal `'U'`, and values matching Angular's
  `generateProductRows()` aggregation for the same input data
- AND the PDF generator (`inventory-today-sale-pdf.ts`) is invoked with those
  rows

#### Scenario: Row aggregator behaves like Angular for edge inputs

- GIVEN a product set with zero sales or zero available stock
- WHEN `generateProductRows()` runs
- THEN the resulting row values match Angular's aggregation for the same
  edge case (no divide-by-zero, no dropped rows)
