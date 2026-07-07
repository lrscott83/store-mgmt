# Proposal: Stage 7 — Reports Module Parity (13-Column Inventory-at-Sale-Price Ledger + Real PDF Export)

## Intent

Close Stage 7 of the Angular → React frontend parity audit for `frontend-react/apps/web-store-pos` (Angular `frontend/` is the sole source of truth for INTENDED behavior). The exploration (engram #658) found a MAJOR structural divergence, not a simple L5/L6 tune: React shipped a from-scratch "Approach B" KPI dashboard (order count / revenue / cost / profit + a 2-column available-stock list) referencing invented spec IDs `REP-1..REP-15`, while Angular's intended report — recoverable from its live-but-unused `generateProductRows()` — is a **13-column per-product inventory-at-sale-price ledger** exported as a landscape PDF. Per the audit convention (Angular = source of truth for intended behavior), the dormant Angular intent binds over the React-native dashboard invention. Binding user decision (engram #659): **REBUILD the Angular ledger + build REAL PDF export**, superseding the Approach B dashboard — do not keep both.

## Scope

### In Scope

- **Slice A — Ledger domain service (port `generateProductRows`, TDD)** [TDD]
  - Build a new `app/reports/lib/services/inventory-today-sale-service.ts` that ports Angular `InventoryTodaySaleComponent.generateProductRows()` 1:1 into a read-only view-model producer. Emits one row per available product with the 13 fields, computed from today's orders + today's inventory entries + current available stock + active-entry weighted cost. Formulas (from the LIVE Angular source, not the commented-out demo):
    - `available` = current available quantity for the product (from category/product view)
    - `entryQuantity` = sum of today's inventory-entry quantities for the product
    - `vendido` = sum of today's active order-item quantities for the product
    - `disponible = available + vendido`
    - `inicio = available + vendido − entryQuantity`
    - `precioVenta = avg(order-item price)` over today's items (0 when none)
    - `importeVenta = vendido × precioVenta`
    - `costoUnitario` = weighted-avg cost across active entries with `available > 0` (`Σ costPrice·qty / Σ qty`)
    - `costoTotal = vendido × costoUnitario`
    - `cpVenta = costoTotal / importeVenta` (cost-to-sale ratio; 0 when `importeVenta = 0`) — NOTE: use the LIVE formula, NOT the commented demo's `precio − costo`
    - `final = disponible − vendido`
    - `importeFinal = final × costoUnitario`
    - Unit label column = hardcoded `'U'` (Angular hardcodes this — port as-is).
  - Reuse EXISTING React offline-service methods as data sources — do NOT duplicate FIFO/cost logic: `OrderOfflineService.getActiveOrdersInDay(date)` (exact match), `InventoryOfflineService.getByDate(date)` (≈ Angular `getInventoryEntriesInDay`), `getAvailableQuantity`/`getAvailableByCategory` (≈ `getInventoryCategoriesView` product view), `getAvailableInventoryCosts`/active entries (≈ `getProductInventoriesByProductId` for weighted cost), `ProductOfflineService.getAll()` filtered to available (≈ `getAvailableProducts`). Fresh TDD: Angular has only a `should create` smoke test — there is NO prior test oracle, so all 13 formulas are covered by new tests read from the Angular source.

- **Slice B — Real PDF export infra (lazy jsPDF, code-split)** [TDD/smoke]
  - Add `app/reports/lib/pdf/inventory-today-sale-pdf.ts` that dynamically `import()`s `jspdf` + `jspdf-autotable` (lazy, code-split — matching the established `@zxing` dynamic-import precedent from init #64), builds a landscape `letter` document titled `INVENTARIO A PRECIO DE VENTA`, renders the blank administrative `encabezado` header lines, and lays out the 13-column `autoTable` from the ledger rows, then opens the blob. This FIXES Angular's disabled export (commented-out jsPDF, `console.log` no-op stub) — per bug policy #511 the inert button is fixed-not-replicated.

- **Slice C — Ledger UI rewrite + L5 shared kit** [VISUAL + behavior]
  - Rewrite `app/reports/routes/today-report.tsx` to render the 13-column on-screen ledger table (replacing the Approach B 4-KPI + 2-column dashboard) plus an export action wired to Slice B. Use the shared UI kit: `Card` shell (title `REPORT.INVENTORY_TODAY_SALE`), `Button variant="fab"` for the export action (Angular `mat-fab extended`), `InfoBox` for the empty/no-data state — replacing the raw Tailwind `rounded border bg-white p-4 shadow-sm` divs and ad-hoc `bg-blue-600` button.

- **Slice D — Supersession cleanup (delete Approach B)** [cleanup]
  - DELETE `app/reports/lib/services/report-aggregation-service.ts` and its `report-aggregation-service.test.ts` (11 unit tests). The Approach B dashboard is superseded, not kept parallel (per decision #659 assumption 1). Rewrite `app/reports/routes/__tests__/reports-routes.test.tsx` (8 smoke tests) to assert the ledger structure instead of the dashboard.

- **Slice E — L6 i18n reconciliation** [L6]
  - Replace the invented `REPORTS.*` namespace (8 keys: `REPORTS.TODAY.TITLE`, `REPORTS.SALES_SUMMARY.*`, `REPORTS.INVENTORY.*`, `REPORTS.REFRESH`) with Angular's `REPORT.*` namespace: `REPORT.TITLE` = "Reportes", `REPORT.INVENTORY_TODAY_SALE` = "Inventario a precio de venta". Angular hardcodes the 13 column headers as Spanish literals in code; per React convention (translate, don't hardcode) add `REPORT.COLUMNS.*` keys carrying those exact literals (Producto, Inicio, Entrada, Disponible, Vendido, Precio Venta, Importe Venta, Costo Unitario, Costo Total, C.P Venta, Final, Importe Final + the 'U.M' unit header). Align `menu-config.ts` to Angular's `MENU.REPORTS.TITLE`/`MENU.REPORTS.TODAY_REPORTS` values.

### Out of Scope (document exclusion, no code)

- **Both Angular help dialogs** (`reports-help-dialog`, `today-reports-help-dialog`): placeholder stubs literally rendering `<p>...works!</p>`, zero real content. Not ported (ratified-dead-content, consistent with other Help-module handling in this audit).
- **PRD `docs/prd/reports.md` unbuilt sections** (payment-type breakdown, top-selling products, received/consumed/net-change per product): exist in NEITHER codebase. Aspirational/stale — treated as out of scope; PRD noted as not-implemented, not a build target.
- **`generateReportWithBorder()` demo variant**: the commented-out bordered version uses HARDCODED sample products (`Producto A/B/C`) and the incorrect `cpVenta = precio − costo` formula — it is throwaway demo code, not the real data path. Not ported; only the live `generateProductRows()` data path is authoritative.
- **New report types / date-range pickers / historical reports**: Stage 7 closes only the "today" ledger parity gap. No expansion.
- **Toast/notification infra**: none exists in React; not introduced (same stance as `admin-features-parity`).

## Capabilities

### Modified Capabilities
- `reports-today`: the today-report feature contract changes from an on-screen KPI dashboard (Approach B) to Angular's intended 13-column inventory-at-sale-price ledger with a real PDF export. Route (`reports/today`), feature gate (`EFeatures.TodayReports=50`), and module id (`EModules.Reports=5`) are unchanged — numeric parity already confirmed (no L1 drift).

### New Capabilities
- `reports-pdf-export`: lazy, code-split PDF generation for the today ledger (jsPDF + jspdf-autotable), replacing Angular's inert stub.

## Approach

Five work-unit slices on `feat/frontend-parity-audit`, commits-only (no PR/push) per the current stage pattern and the ~400+ line size. Slice A (ledger formulas) and Slice B (PDF infra) are independent and can be built in either order; Slice C consumes both; Slice D removes the superseded code once C is green; Slice E is a mechanical i18n/menu reconcile. Angular is the reference for every formula and label; on-screen and PDF texts end IDENTICAL and in Spanish. Strict TDD Mode is active for the behavior slices (A, and the ledger assertions in C). Because Angular's only test is a smoke test, the formula oracle is the Angular source code read directly — captured as explicit TDD cases before implementation.

## Affected Areas

| Area | Impact | Slice |
|------|--------|-------|
| `app/reports/lib/services/inventory-today-sale-service.ts` (new) | Added — ported 13-formula ledger view-model | A |
| `app/reports/lib/pdf/inventory-today-sale-pdf.ts` (new) | Added — lazy jsPDF/autoTable export | B |
| `app/reports/routes/today-report.tsx` | Rewritten — 13-col ledger + export FAB (Card/Button/InfoBox) | C |
| `app/reports/lib/services/report-aggregation-service.ts` (+`.test.ts`) | DELETED — Approach B superseded | D |
| `app/reports/routes/__tests__/reports-routes.test.tsx` | Rewritten — assert ledger, not dashboard | D |
| `app/shared/lib/i18n/es.ts` | Modified — `REPORTS.*` → `REPORT.*` + `REPORT.COLUMNS.*` | E |
| `app/shared/lib/config/menu-config.ts` | Modified — align to Angular `MENU.REPORTS.*` values | E |
| `package.json` (web-store-pos) | Add `jspdf`, `jspdf-autotable` | B |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Total change well over 400 lines | High | Commits-only, work-unit slices (A–E); no PR/push this session |
| No Angular test oracle for the 13 formulas (only `should create` smoke) | High | Derive TDD cases directly from the LIVE `generateProductRows()` source; assert each formula (inicio/costoUnitario/cpVenta/importeFinal) with worked examples before implementing |
| Deleting 19 green tests (11 unit + 8 route) risks losing regression coverage | Med | New ledger service ships with equal-or-greater TDD coverage; route tests rewritten (not just removed) to cover the ledger view |
| `jspdf`/`jspdf-autotable` new dependencies inflate bundle | Med | Lazy dynamic `import()`, code-split — nothing loads until export is clicked (matches `@zxing` precedent from init #64) |
| React inventory-service method names ≠ Angular's (`getByDate` vs `getInventoryEntriesInDay`, etc.) | Med | Design phase pins the exact React method → Angular semantic mapping and confirms `getAvailableInventoryCosts` reproduces the weighted-cost average |
| `getAvailableProducts` filtering semantics (which products count as "available") differ | Low-Med | Design confirms the React product filter matching Angular's `ProductRepository.getAvailableProducts()` |
| jsPDF autoTable render is hard to unit-test in jsdom | Med | Unit-test the row/header data builder pure function; keep the jsPDF call a thin, smoke-tested/mocked shell |

## Open Questions for Design

1. Exact React offline-service method mapping for each Angular data source (entries-in-day, category product view for `available`, per-product active entries for weighted cost) — confirm `getByDate` + `getAvailableQuantity`/`getAvailableByCategory` + `getAvailableInventoryCosts` fully reproduce Angular's inputs, or whether thin new accessor methods are needed.
2. `getAvailableProducts` parity: does React's `ProductOfflineService.getAll()` need an "available/active" filter to match Angular, and does the ledger include zero-movement products (Angular maps over ALL available products, emitting zero rows)?
3. PDF fidelity target: port the blank administrative `encabezado` header lines verbatim, or trim to title + table? (Angular's intended `generateReport()` includes them.)
4. `REPORT.COLUMNS.*` key shape and whether the menu group label change touches any snapshot/route tests beyond reports.

## Rollback Plan

Each slice is an isolated conventional commit on `feat/frontend-parity-audit`; commits-only (no push/PR). Rollback is local `git revert`/reset per commit. Slice D (deletion of Approach B) is kept as its own commit so the superseded dashboard can be restored independently if a parity regression surfaces.

## Dependencies

- `jspdf`, `jspdf-autotable` (new, lazy-loaded) — Slice B.
- Shared `Card`/`Button` (fab)/`InfoBox` (already present from Stages 1–6) — Slice C.
- Existing offline services (`OrderOfflineService`, `InventoryOfflineService`, `ProductOfflineService`) and `@store-mgmt/domain` — Slices A/C.

## Success Criteria

- [ ] `reports/today` renders the 13-column inventory-at-sale-price ledger (one row per available product) with values matching Angular's `generateProductRows()` formulas, TDD-covered.
- [ ] A working PDF export produces the landscape `INVENTARIO A PRECIO DE VENTA` document via lazy jsPDF/autoTable (Angular's inert button fixed, not replicated).
- [ ] Ledger UI uses shared `Card`/`Button variant="fab"`/`InfoBox` — no raw ad-hoc Tailwind chrome.
- [ ] Approach B `report-aggregation-service` + its 11 tests deleted; route tests rewritten to assert the ledger.
- [ ] i18n uses Angular's `REPORT.*` namespace (+ `REPORT.COLUMNS.*`); menu aligned to `MENU.REPORTS.*`; no orphan `REPORTS.*` keys remain.
- [ ] Help-dialog stubs and PRD unbuilt sections documented as out-of-scope, not built.
- [ ] `pnpm test` and `tsc --noEmit` pass; jsPDF/autoTable load only on export (code-split verified).
