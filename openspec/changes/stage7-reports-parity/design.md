# Design — Stage 7: Reports Module Parity (frontend-parity-audit)

Change: `stage7-reports-parity` · Branch: `feat/frontend-parity-audit` · Artifact store: hybrid
Reads: proposal #661 (binding scope), decision #659, exploration #658, init #64, audit methodology #460.

This design is the HOW at the architectural level. It pins the exact service/method
mapping, file layout, PDF infra, supersession surface, and i18n/kit wiring so `sdd-tasks`
and `sdd-apply` have zero ambiguity. All mappings below were verified against the REAL
source (Angular `generateProductRows()` and the React offline services), not prose.

---

## Architecture Approach

Screaming/hexagonal, consistent with the rest of `web-store-pos`:

- **Domain/formula logic** lives in a new pure service under `app/reports/lib/services/`
  that COMPOSES existing offline services. No FIFO, no cost re-derivation — it reads.
- **PDF rendering** (I/O + heavy dep) is isolated behind a lazy dynamic `import()` in its own
  lib module, code-split exactly like `statistics/components/chart-core.tsx` isolates recharts.
- **UI** (`today-report.tsx`) is a thin presentational route that calls the ledger service,
  renders the 13-column table with the shared L5 kit, and wires an export FAB to the PDF lib.
- The superseded "Approach B" aggregation service + its 19 tests are DELETED, not left parallel.

Layering (inbound arrows = "depends on"):

```
today-report.tsx (route/presentation)
   ├─→ inventory-today-sale-service.ts  (NEW — pure ledger formulas)
   │        ├─→ ProductOfflineService.getAll()            [existing]
   │        ├─→ OrderOfflineService.getActiveOrdersInDay  [existing, EXACT]
   │        └─→ InventoryOfflineService                    [existing +1 new read method]
   │                ├─ getByDate(today)                    [existing, EXACT]
   │                ├─ getAvailableQuantity(productId)     [existing, EXACT]
   │                └─ getProductInventoriesByProductId    [NEW read method — see ADR-2]
   └─→ inventory-today-sale-pdf.ts       (NEW — lazy jsPDF, code-split)
            └─→ await import('jspdf') + import('jspdf-autotable')  [lazy, not static]
```

---

## 1. Formula → React data-source mapping (the 13 columns)

Source of truth: `frontend/src/app/presentation/reports/inventory-today-sale/inventory-today-sale.component.ts` → `generateProductRows()` (lines 176-226, the LIVE-but-unused code).

Per-product inputs (computed once per product in the `products.map`):

| Angular symbol | Angular source | React method (PINNED) | Notes |
|---|---|---|---|
| `products` | `productService.getAvailableProducts()` → `filter(isActive)` | `ProductOfflineService.getAll().filter(p => p.isActive)` | React has NO `getAvailableProducts`; inline filter (ADR-4). |
| `orderItems` | `getActiveOrdersInDay(today).flatMap(o=>o.orderItems).filter(productId)` | `OrderOfflineService.getActiveOrdersInDay(today)` → same flatMap/filter | **EXACT** signature match. |
| `available` | `getInventoryCategoriesView()` → flatMap products → `.quantity` | `InventoryOfflineService.getAvailableQuantity(prod.id).available` | Both = Σ active `entry.available` per product. Simpler than the category view; same semantic. |
| `productTodayEntries` | `getInventoryEntriesInDay(today).data.filter(productId)` | `InventoryOfflineService.getByDate(today).filter(productId)` | **EXACT** (both return `InventoryEntryView[]` with `quantity`). |
| `productAvailableEntries` | `getProductInventoriesByProductId(id).filter(e=>e.available>0)` | `InventoryOfflineService.getProductInventoriesByProductId(id).filter(e=>e.available>0)` | **NEW METHOD** (ADR-2). Needs raw `InventoryEntry` (has both `quantity` AND `available`); `InventoryEntryView` omits `available`. |

The 13 output columns (order = Angular return array, verbatim):

| # | Column (Angular literal) | Formula | Depends on |
|---|---|---|---|
| 1 | Producto | `prod.name` | product |
| 2 | U | literal `'U'` (hardcoded unit) | — |
| 3 | Inicio | `available + vendido - entryQuantity` | available, vendido, entryQuantity |
| 4 | Entrada | `entryQuantity = Σ productTodayEntries.quantity` | getByDate |
| 5 | Disponible | `available + vendido` | available, vendido |
| 6 | Vendido | `Σ orderItems.quantity` | orders |
| 7 | Precio Venta | `orderItems.length>0 ? Σ oi.price / orderItems.length : 0` → `toFixed(2)` | orders |
| 8 | Importe Venta | `vendido * precioVenta` → `toFixed(2)` | 6,7 |
| 9 | Costo Unitario | `entries>0 ? Σ(e.costPrice*e.quantity) / Σ(e.quantity) : 0` → `toFixed(2)` | productAvailableEntries |
| 10 | Costo Total | `vendido * costoUnitario` → `toFixed(2)` | 6,9 |
| 11 | C.P Venta | `importeVenta>0 ? costoTotal / importeVenta : 0` → `toFixed(2)` | 8,10 |
| 12 | Final | `disponible - vendido` (= `available`) | 5,6 |
| 13 | Importe Final | `final * costoUnitario` → `toFixed(2)` | 12,9 |

Guard clauses to port verbatim: `precioVenta` and `cpVenta` both guard against divide-by-zero
(return 0); `costoUnitario` guards on `productAvailableEntries.length > 0`. These are NOT bugs —
port as-is.

### Semantic mismatch FLAGGED (column 9 — Costo Unitario)

Angular weights the weighted-average cost by **`entry.quantity`** (original entry size) over
entries filtered to `available > 0`:
`Σ(costPrice·quantity) / Σ(quantity)`.

React's existing `InventoryOfflineService.getAvailableByCategory().avgCostPrice` weights by
**`entry.available`** (remaining stock): `Σ(available·costPrice) / Σ(available)`. These diverge
for partially-sold entries. Therefore we do NOT reuse `getAvailableByCategory` for column 9 —
that would silently change the number. Instead we add `getProductInventoriesByProductId` (ADR-2)
and compute column 9 EXACTLY as Angular does (weight by `quantity`). This preserves 1:1 parity
with the "port verbatim" binding decision. `sdd-verify` should assert the quantity-weighting,
not available-weighting.

> Note: Angular's `available && available > 0` truthy-guard is equivalent to `available > 0` for
> numbers; port as `e.available > 0`.

---

## 2. New ledger service

**File**: `app/reports/lib/services/inventory-today-sale-service.ts`

```ts
export interface InventoryTodaySaleRow {
  producto: string;
  unidad: string;          // 'U'
  inicio: number;
  entrada: number;
  disponible: number;
  vendido: number;
  precioVenta: number;     // numeric; format at the edge (UI/PDF toFixed(2))
  importeVenta: number;
  costoUnitario: number;
  costoTotal: number;
  cpVenta: number;
  final: number;
  importeFinal: number;
}

export class InventoryTodaySaleService {
  constructor(storeId: string);           // instantiates Product/Order/Inventory offline services
  getProductRows(date?: Date): InventoryTodaySaleRow[];   // date defaults to new Date()
}
```

Design rules:
- **Return typed numbers, not `toFixed` strings.** Angular returns a mixed `any[]` with strings
  (`toFixed(2)`). React returns a typed row object with numeric fields; the `.toFixed(2)`
  formatting happens at the presentation edge (UI cells and PDF `body` mapping). This keeps the
  service unit-testable on raw numbers and avoids locale/format coupling in the domain.
- **Read-only.** Zero mutations. `getByDate`/`getAvailableQuantity`/`getProductInventoriesByProductId`
  are all pure reads. (Note: `getAvailableInventoryCosts` MUTATES via FIFO — it is explicitly NOT
  used here; the proposal's shorthand naming should not be read as "call getAvailableInventoryCosts".)
- Composes existing services; NO FIFO/cost duplication.

---

## 3. PDF export infra (lazy, code-split)

**File**: `app/reports/lib/pdf/inventory-today-sale-pdf.ts`

```ts
export async function exportInventoryTodaySalePdf(rows: InventoryTodaySaleRow[], headers: string[]): Promise<void> {
  const { jsPDF } = await import('jspdf');       // lazy — heavy dep, NOT static import
  const autoTable = (await import('jspdf-autotable')).default;
  // landscape / unit:'pt' / format:'letter'  (verbatim Angular options)
  // encabezado (4 lines) + title 'INVENTARIO A PRECIO DE VENTA' + autoTable(13 cols)
}
```

- **Where the lazy import lives**: INSIDE this lib function body (`await import('jspdf')`), never a
  top-level/static import. This mirrors the verified precedent
  `statistics/components/chart-core.tsx` (recharts isolated behind `React.lazy(() => import('./chart-core'))`)
  and the `@zxing` code-split noted in init #64. The route (`today-report.tsx`) calls this function
  from an `onClick`, so the jsPDF bundle is fetched only when the user exports.
- **Vitest gotcha**: the known virtual-module choke is specific to dynamically importing a *virtual*
  module. A dynamic `import()` of a REAL npm package (`jspdf`, `jspdf-autotable`) resolves fine under
  vitest. Isolating it in this dedicated lib module lets the smoke test either (a) `vi.mock('jspdf')`
  and assert the doc/autoTable calls, or (b) assert the exported function is defined + invokable
  without exercising the real renderer. The ledger service tests never touch this module, so the
  RED→GREEN formula tests stay fast and dep-free.
- **PDF layout (PORT VERBATIM — binding user decision)**: include Angular's admin `encabezado` —
  4 blank/underscore lines above the title, drawn at `(40, 30 + i*14)`, helvetica bold 10pt:
  1. `Empresa: ___   Procedencia: ___`
  2. `Unidad: ___   UBA: __ OEE: __ D__/__/__`
  3. `Departamento: ___   Balance: __ BAT: __`
  4. `Firma del Administrador: ___`
  Then title `INVENTARIO A PRECIO DE VENTA` at `(300, 100)` (12pt bold), then `autoTable`
  (head = 13 headers, `styles.fontSize:8`, `headStyles.fillColor:[220,220,220]`, `margin.top:120`),
  re-drawing the encabezado + title in `didDrawPage` for page 2+. Output via `doc.output('blob')` →
  `URL.createObjectURL` → `window.open` (Angular's exact delivery). This fixes Angular's inert
  `console.log` stub — bug-fixed-not-replicated (policy #511).
- Use the plain `generateReport()` layout (no border frame). The `generateReportWithBorder()` demo
  is OUT of scope (hardcoded sample products + wrong `cpVenta = precio - costo` formula, per proposal).

---

## 4. Supersession plan (delete vs rewrite — coverage must not drop)

**DELETE** (Approach B, superseded by the ledger):
- `app/reports/lib/services/report-aggregation-service.ts`
- `app/reports/lib/services/report-aggregation-service.test.ts` (11 unit tests)

**REWRITE**:
- `app/reports/routes/today-report.tsx` → 13-column on-screen ledger + export FAB + L5 kit.
- `app/reports/routes/__tests__/reports-routes.test.tsx` (8 tests) — currently mocks
  `report-aggregation-service` and asserts REPORTS.* dashboard strings ("Resumen de ventas",
  "Estado de inventario", "Actualizar", "Pedidos", "Sin stock disponible"). Rewrite to mock
  `inventory-today-sale-service` and assert the ledger: title `REPORT.INVENTORY_TODAY_SALE`,
  the 13 column headers, a rendered row, and the export button presence.

**NEW test files** (coverage replacement — must equal/exceed the 19 deleted):
- `app/reports/lib/services/__tests__/inventory-today-sale-service.test.ts` — RED→GREEN unit tests,
  one per formula column (13) plus divide-by-zero guards and empty-state. This is the new oracle.
- `app/reports/lib/pdf/__tests__/inventory-today-sale-pdf.test.ts` — smoke test (jspdf mocked):
  asserts the export function loads jspdf lazily, draws the 4 encabezado lines + title, and calls
  `autoTable` with 13 headers.

Coverage ledger: delete 11 (service) + rewrite 8 (route). Add ~13+ (formula units) + ~8 (rewritten
route) + ~3 (pdf smoke). Net coverage strictly increases and shifts onto the real ported formulas.

---

## 5. L5 kit wiring + L6 i18n migration

### L5 (visual) — swap ad-hoc Tailwind → shared kit
Confirmed available in `app/shared/components/ui/`: `card.tsx`, `button.tsx` (has
`variant='fab'` — pill, `bg-primary`, elevated, matches Angular `mat-fab extended`), `info-box.tsx`.
- Page container/table wrapper → `<Card>` (replaces `rounded border bg-white p-4 shadow-sm`).
- Export action → `<Button variant="fab">` (replaces raw `bg-blue-600` button).
- Empty state ("no products / no rows") → `<InfoBox>`.

### L6 (i18n) — migrate REPORTS.* → Angular REPORT.* namespace
Catalog file: `app/shared/lib/i18n/es.ts` (flat dot-keys). Current state verified:
- Lines 457-467: 8 `REPORTS.*` dashboard keys → **DELETE**.
- Line 79 `'MENU.REPORTS': 'REPORTES'`; line 121 `'MENU.TODAY_REPORTS': 'Reportes del día'`.

Migration:
- **Add** `'REPORT.TITLE': 'Reportes'`, `'REPORT.INVENTORY_TODAY_SALE': 'Inventario a precio de venta'`
  (Angular's exact strings).
- **Add** `REPORT.COLUMNS.*` — 13 keys for the headers (React translates; Angular hardcodes them in
  the array). Spanish literals: Producto, U, Inicio, Entrada, Disponible, Vendido, Precio Venta,
  Importe Venta, Costo Unitario, Costo Total, C.P Venta, Final, Importe Final. (Suggested keys:
  `REPORT.COLUMNS.PRODUCT/UNIT/START/ENTRY/AVAILABLE/SOLD/SALE_PRICE/SALE_AMOUNT/UNIT_COST/`
  `TOTAL_COST/COST_SALE_RATIO/FINAL/FINAL_AMOUNT`.)
- **Menu keys → `MENU.REPORTS.*`**: rename `'MENU.REPORTS'`→`'MENU.REPORTS.TITLE'` and
  `'MENU.TODAY_REPORTS'`→`'MENU.REPORTS.TODAY_REPORTS'` to match Angular. **Coupling flag**: this
  requires editing `app/shared/lib/config/menu-config.ts` lines 67 & 70 (the `groupLabel` and
  `label` references) AND any menu/navbar test that asserts those literals. Keep the rename atomic
  with the menu-config edit in the same commit (slice E) to avoid a broken intermediate.

---

## 6. Strict-TDD note (mandatory)

Angular has NO formula test oracle — `inventory-today-sale.component.spec.ts` is a `should create`
smoke test only, and `generateProductRows()` is dead code never asserted. Therefore each of the 13
ledger formulas MUST get a fresh RED→GREEN unit test in
`inventory-today-sale-service.test.ts`, with expected values hand-derived from the Angular source
formula (not copied from any existing green test). Order per slice A: write the failing formula test,
read Angular's expression, implement to green, next column. The PDF slice (B) is smoke-tested (jspdf
mocked) since pixel output is not unit-assertable. Test runner: `pnpm test` (vitest); type-check
separately via `pnpm -C apps/web-store-pos exec tsc --noEmit`. If `getProductInventoriesByProductId`
export is added to the domain-adjacent service (it lives in the app, not `packages/domain`, so no
`pnpm -C packages/domain build` needed here — confirmed the method is on the app-level
`InventoryOfflineService`).

---

## ADRs

**ADR-1 — Ledger replaces dashboard (not parallel).** Per decision #659, Angular's dormant
`generateProductRows()` is the intended report. Keeping both doubles surface and contradicts the
binding scope. Rejected: "dashboard primary + ledger export" (adds a second data model to maintain).

**ADR-2 — Add `getProductInventoriesByProductId(productId): InventoryEntry[]` to
`InventoryOfflineService`.** Column 9 (Costo Unitario) needs raw entries carrying BOTH `quantity`
and `available`; `InventoryEntryView` (what `getAll`/`getByDate` return) omits `available`, and
`getAvailableByCategory().avgCostPrice` weights by the WRONG field (available vs quantity — see the
flagged mismatch). A new pure read method (mirrors Angular's method name exactly, wraps
`repo.getByProductId`, returns active entries) is the minimal, parity-faithful path. Rejected:
reusing `getAvailableByCategory` (changes the number) and casting `getAll()` (no `available` field).

**ADR-3 — jsPDF via lazy `import()` in a dedicated lib module.** Keeps the heavy PDF dep out of the
main route bundle, following the verified `chart-core.tsx`/recharts and `@zxing` precedents. Rejected:
static top-level import (bundle bloat on a rarely-used export), and a virtual-module scheme (the
actual vitest choke). Real-npm dynamic import is vitest-safe.

**ADR-4 — Inline `getAll().filter(isActive)` for available products.** `ProductOfflineService` has no
`getAvailableProducts`; Angular's is just `filter(isActive)`. Inlining in the ledger service avoids
widening the product service API for a one-line filter and keeps the supersession surface minimal.
(If a later stage needs it broadly, promote to a method then.)

---

## Risks / open items for tasks & apply

- **>400 lines** → commits-only work-unit workflow (A ledger → B PDF → C UI+L5 → D cleanup → E i18n/menu).
- **No test oracle** → formula correctness rests entirely on hand-derived TDD from Angular source; a
  transcription error would propagate silently. Mitigation: one test per column, values derived by hand.
- **Costo Unitario weighting** (flagged) — verify asserts quantity-weighting, not available-weighting.
- **Menu key rename coupling** — `MENU.REPORTS.*` rename touches `menu-config.ts` + menu tests; keep atomic.
- **Coverage** — deleting 19 green tests; new tests must land in the SAME change to avoid a coverage dip.
