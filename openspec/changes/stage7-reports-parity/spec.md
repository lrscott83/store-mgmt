# Stage 7 — Reports Module Parity Specification

## Purpose

Close Stage 7 of the Angular → React parity audit: rebuild Angular's dormant 13-column per-product inventory-at-sale-price ledger (`generateProductRows()`, source of truth) as React's live Reports page, replacing the invented "Approach B" KPI dashboard, and add a real lazy-loaded PDF export (Angular's export button is disabled — a bug fixed, not replicated, per policy #511). Binding decisions: engram #659.

## Requirements — Slice A: Ledger Data Composition

### Requirement: Daily Ledger Row Composition

The system MUST produce one ledger row per product returned by the available-products source, scoped to the current calendar day, using: today's active orders (for sold quantity/price), today's inventory entries (for received quantity), and each product's currently-active inventory entries (`available > 0`, for weighted cost).

#### Scenario: One row per available product
- GIVEN N available products exist
- WHEN the ledger is generated for today
- THEN exactly N rows render, one per product, with no products from a different day's activity excluded

### Requirement: Identity & Stock-Movement Columns

For each row, `Producto` MUST be the product name; `U` MUST be the literal constant `"U"` (not the product's actual unit-of-measure field — Angular hardcodes this); `Entrada` MUST equal the sum of today's inventory-entry quantities for the product; `Disponible` MUST equal `available + vendido`; `Inicio` MUST equal `available + vendido − Entrada`; `Vendido` MUST equal the sum of today's order-item quantities for the product.

#### Scenario: Product with today's entries and sales
- GIVEN a product with `available=10`, one today's entry of `quantity=5`, and today's orders selling `quantity=3`
- WHEN its row is computed
- THEN `Entrada=5`, `Vendido=3`, `Disponible=13`, `Inicio=8`

### Requirement: Sale-Valuation Columns

`Precio Venta` MUST equal the average unit price across today's order items for the product (`0` if no sales); `Importe Venta` MUST equal `Vendido × Precio Venta`.

#### Scenario: No sales today
- GIVEN a product with zero today's order items
- WHEN its row is computed
- THEN `Precio Venta=0.00` and `Importe Venta=0.00`

### Requirement: Cost-Valuation Columns

`Costo Unitario` MUST equal the quantity-weighted average `costPrice` across the product's currently-active inventory entries (`0` if none); `Costo Total` MUST equal `Vendido × Costo Unitario`; `C.P Venta` MUST equal `Costo Total / Importe Venta` when `Importe Venta > 0`, else `0`.

#### Scenario: Weighted cost from multiple active entries
- GIVEN active entries `{qty:2, cost:10}` and `{qty:3, cost:20}` for a product
- WHEN `Costo Unitario` is computed
- THEN it equals `(2×10 + 3×20) / (2+3) = 16.00`

### Requirement: Closing-Balance Columns

`Final` MUST equal `Disponible − Vendido`; `Importe Final` MUST equal `Final × Costo Unitario`.

#### Scenario: Closing balance after sales
- GIVEN `Disponible=13`, `Vendido=3`, `Costo Unitario=16.00`
- WHEN the row is computed
- THEN `Final=10` and `Importe Final=160.00`

## Requirements — Slice B: PDF Export

### Requirement: Lazy Code-Split Export

The system MUST NOT load `jspdf`/`jspdf-autotable` on initial page render. These MUST be dynamically imported only when the user activates the export action.

#### Scenario: Nothing loads until export is clicked
- GIVEN a user opens the Reports page
- WHEN the page finishes rendering without clicking export
- THEN no PDF-related chunk has been fetched by the browser

### Requirement: Verbatim Administrative Header

The exported PDF MUST include, above the ledger table, the 4-line administrative header verbatim from Angular: Empresa/Procedencia, Unidad/UBA/OEE/date, Departamento/Balance/BAT, and Firma del Administrador — followed by the title `INVENTARIO A PRECIO DE VENTA` and the 13-column table (landscape letter).

#### Scenario: Header renders on every page
- GIVEN a PDF export with content spanning multiple pages
- WHEN each page is drawn
- THEN the 4-line administrative header and title repeat at the top of that page

### Requirement: Working Export Action (Angular Bug Fixed, Not Replicated)

Clicking the export action MUST produce and open a real PDF document. Angular's equivalent button is disabled (stubbed to a console log); this MUST NOT be replicated — React's export MUST be functional.

#### Scenario: Export button produces a document
- GIVEN a user on the Reports page
- WHEN they activate the export FAB
- THEN a PDF opens containing the header and the current ledger rows

## Requirements — Slice C: Visual Parity (L5)

### Requirement: Shared UI Kit Adoption

The Reports page MUST be built on the shared `Card`, `Button` (variant `fab` for the export trigger), and `InfoBox` components, replacing raw Tailwind utility markup and the ad-hoc `bg-blue-600` button.

#### Scenario: Page renders via shared primitives
- GIVEN the Reports page renders
- WHEN its DOM is inspected
- THEN the ledger container, export trigger, and any status banner use `Card`, `Button`, and `InfoBox` respectively

## Requirements — Slice D: Approach B Supersession

### Requirement: Dashboard Removal Without Coverage Loss

The KPI-dashboard aggregation service and its unit tests MUST be removed as superseded. The route-level test suite MUST be rewritten to assert ledger rendering (columns, values, export trigger) so that total Reports-module test coverage does not decrease.

#### Scenario: Route tests assert the ledger, not the old dashboard
- GIVEN the rewritten route test suite
- WHEN it runs
- THEN it asserts the 13-column ledger table and export control, and no reference to the removed aggregation service remains

## Requirements — Slice E: i18n Reconciliation (L6)

### Requirement: Angular-Aligned i18n Namespace

i18n keys MUST use Angular's `REPORT.*` namespace (`REPORT.TITLE`, `REPORT.INVENTORY_TODAY_SALE`) plus new `REPORT.COLUMNS.*` keys for the 13 column headers, and menu keys MUST use `MENU.REPORTS.*`. The invented `REPORTS.*` namespace (8 keys: `TODAY.TITLE`, `REFRESH`, `SALES_SUMMARY.*`, `INVENTORY.*`) MUST be removed.

#### Scenario: No invented namespace remains
- GIVEN the i18n dictionary after this change
- WHEN it is searched for the `REPORTS.` prefix
- THEN no matching key exists, and all Reports-module strings resolve under `REPORT.*` or `MENU.REPORTS.*`

## Out of Scope

- Both Angular help-dialog stubs (`reports-help-dialog`, `today-reports-help-dialog`) — placeholder content only, no port needed.
- PRD sections never built in either codebase: payment-type breakdown, top-selling products, received/consumed/net-change per product.
- Angular's `generateReportWithBorder()` demo (hardcoded sample products, page-frame border, incorrect `cpVenta = precio − costo` formula) — not the live formula source.
- New report types or date-range selection.
