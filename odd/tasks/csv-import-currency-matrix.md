# csv-import-currency-matrix

Integration coverage for the CSV product import currency flow: with the MultiMonedas module active, an import must
create/update catalog products with the correct sale price AND price currency, and add inventory entries with the
correct cost AND cost currency; without the module, price and cost must ALWAYS be CUP.

User request (2026-09-24): "En el import cuando la tienda tiene activo el modulo de MultiMonedas y la moneda del
costo es USD está insertando las entradas con la moneda en CUP... para todos estos casos y todas las posibles
combinaciones implementar metodos de integracion... Hacer esos mismos tests de integracion pero para cuando no este
activo el modulo MultiMonedas y verificar lo mismo pero la moneda de precio y de costo siempre deben ser CUP."

User decision (asked, 2026-09-24): the matrix covers ALL 7 system currencies — CUP, USD, EUR, CLA, MLC, CAD, MXN
(+ the absent column) — for both new and existing (update) products.

## Analysis (evidence, committed code)

The frontend import wiring is already CORRECT in the current code — the reported symptom does not reproduce on HEAD:

- Parser `app/sales/lib/csv-product-parser.ts` — parses `precio_moneda` -> `currency` and `precio_costo` ->
  `costCurrency`, case-insensitively by NAME; unknown/absent -> undefined.
- View `app/sales/routes/products.tsx:349-396` — `currenciesAllowed = hasMultiMonedasAvailable(user)`; with the module
  both currencies travel into `CsvProduct`; without it both are discarded (undefined -> CUP). Entry creation:
  `createInventoryEntry(product.id, product.quantity, costPrice, product.costCurrency)`.
- Service `app/sales/lib/services/product-offline-service.ts:294-361` — new product: `addProductData(..., currency)`;
  existing product: `updateImportedProduct({ ...existingProduct, currency: csvProduct.currency ?? existingProduct.currency })`.
  Created rows spread `...csvProduct`, so cost/quantity/costCurrency travel to the caller.
- Repository `app/sales/lib/repositories/product-repository.ts` — `addProductData` stores `currency ?? DEFAULT_CURRENCY`;
  `updateProduct` stores `currency` only when explicitly given (undefined leaves the stored value untouched).
- Inventory `app/inventory/lib/services/inventory-offline-service.ts:588` — `createInventoryEntry(..., currency?)`
  stores `currency ?? DEFAULT_CURRENCY`.

Existing coverage is per-layer with MOCKED services (view tests `products.test.tsx:1422-1602`) + parser unit tests.
What does NOT exist: a REAL-SERVICE integration test chaining parser -> createCsvProducts -> repositories ->
createInventoryEntry over the full combination matrix, asserting the STORED product price/currency and STORED entry
cost/currency.

Backend `ImportCsvProductsCommand` does NOT handle currencies at all (and creates no entries) but the React app
NEVER calls it — out of scope, requires explicit user approval before any backend prod-code change (repo rule).

## Constraints

- ONLY `frontend-react/` — the Angular `frontend/` is legacy and NEVER touched.
- Do NOT touch E2E suites (`frontend-react/e2e/**`, `backend/src/SMCA.WebApi.E2ETests/**`) or their support files.
- Unit tests in `__tests__/` MAY be updated if a behavior change is required; expected: adding a NEW integration
  test file only, no production change.
- `app/sales/lib/csv-product-parser.ts` behavior is out of scope except as an integration entry point (already covered
  by unit tests).
- If a matrix cell FAILS, fix the production wiring (frontend only) and record it; do not weaken a test.

## Matrix contract

Combination space (base): product mode × price currency × cost currency, where currency includes the absent column.
- product mode: `new` (create) | `existing` (update path — product pre-seeded CUP in the store)
- price currency: absent, CUP, USD, EUR, CLA, MLC, CAD, MXN (8)
- cost currency: absent, CUP, USD, EUR, CLA, MLC, CAD, MXN (8)
=> 2 × 8 × 8 = 128 cases per module mode.

Expected values:
- MultiMonedas ON: product.currency = row price currency ?? CUP; entry.currency = row cost currency ?? CUP.
- MultiMonedas OFF ("esos mismos tests"): product.currency = CUP and entry.currency = CUP for EVERY cell — the view
  strips both CSV currencies before the services see them.

## Tasks

- [x] T1 — Create `frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/csv-import-currency-integration.test.ts`
  - Real-service chain per scenario: `parseCsvProducts` (smoke only) -> view-equivalent CsvProduct mapping
    (currenciesAllowed gate ON/OFF) -> `ProductOfflineService.createCsvProducts` (real
    ProductRepository + ProductCategoryRepository) -> `InventoryOfflineService.createInventoryEntry` (real) ->
    assert STORED product (`productRepository.getProductById`: price + currency) and STORED entry
    (read-back through `getActiveInventoryEntriesStorage()`: costPrice + currency).
  - Groups:
    1. Parser -> chain smoke ON (usd/usd new; eur/mlc existing) and OFF (usd/usd -> CUP); absent columns -> CUP.
    2. Matrix ON: `it.each` over 128 cells (2 modes × 8 price × 8 cost).
    3. Matrix OFF: `it.each` over the same 128 cells -> always CUP.
    4. Edges: quantity absent -> no entry; quantity <= 0 -> no entry; cost absent -> entry cost = price (decision
       #7/#16) with the row cost currency; existing product stored USD re-imported without a currency column keeps
       USD (absent never resets — documented design).
  - Fixture per the repo convention (`product-offline-service.test.ts`): `localStorage.clear()` in beforeEach,
    `useAuthStore.setState(makeUser(...))`, `new ProductOfflineService(storeId, productRepository, categoryRepository)`,
    `new InventoryOfflineService(storeId, productRepository)`, storeId 's1'.
  - DONE (delegated writer `general`, 2026-09-24): 264 tests (128 ON + 128 OFF + 4 smoke + 4 edges), green.
    Mutation check (production line `currency: currency ?? DEFAULT_CURRENCY` in `addProductData` removed):
    207 failed / 57 passed — failing cells are exactly the ones whose stored price currency depends on it;
    file restored byte-for-byte and re-run green (264/264).
- [x] T2 — REAL BUG FOUND and fixed (frontend production code): the user-facing `InventoryEntryView` DROPPED
  `currency`. `getActiveInventoryEntriesStorage()` (inventory-offline-service.ts:154-172) mapped entries into the
  view without `currency`, so `entry-list.tsx:62`, `today-entries.tsx` and `entries.tsx:165` (per-currency totals)
  displayed EVERY entry cost as CUP even when storage held USD — matching the user's reported symptom
  "entradas con la moneda en CUP" (storage was already correct; the DISPLAY lay). Fixed: the view now maps
  `currency: entry.currency` (1-line + decision comment). Regression unit test added to
  `inventory-offline-service.test.ts` INV-07 (view carries the stored currency; absent stays undefined). The
  integration test read-back was switched from the raw inventory map to the VIEW so the matrix locks the
  display contract too (deleting the view `currency` map line fails the cells).
  KNOWN ADJACENT, NOT TOUCHED (needs user decision): `today-entries.tsx` edit-modal reconstruction
  (`handleEdit`, ~line 79) rebuilds the entry from the view WITHOUT `currency`, so editing a USD entry opens the
  modal defaulting to CUP and `update(...)` would overwrite the stored cost currency to CUP. Same family, but it
  is the EDIT path, not the import path — deferred, flagged for user approval.
- [x] T3 — Verify + close
  - Focused vitest (6 files: integration + inventory service + inventory routes + parser + product service +
    products view): 609 passed / 0 failed, 0 type errors.
  - `pnpm typecheck` (frontend-react/apps/web-store-pos) -> clean (exit 0).
  - Commit: `77b2d0a2` on `qa` — `fix(inventory): carry entry cost currency through InventoryEntryView (import entries displayed CUP for USD costs)`
    (4 files, +526; includes the matrix test file + mapper fix + INV-07 regression unit test + this doc).
  - RDD assess (`gentle-ai review assess --cwd . --agent opencode --base-ref 36ecca3e --committed-only --json`):
    `risk: high` (`unassessable` — active runtime is NOT eligible for immutable receipt review; supported:
    claude-code, codex), `review_due: true` / `high_risk`, `changed_paths: 0` on the base-diff probe. Same
    terminal state as `36ecca3e`: review is DUE but NOT executable in this runtime; if a formal RDD review is
    wanted, run it in claude-code or codex. The RDD switch was NOT touched (global `on` left as-is by the user's
    standing choice).

## Route

- T1: delegated writer (single non-trivial file). Fallback INLINE if the runtime rejects sub-agents (observed in this
  environment on 2026-09-24: `OpenCode's free tier can only be used from within OpenCode`), recorded honestly here.
- T2-T3: inline (targeted verification + commit; no new source design).

## TDD mode

- Resolved: off (no project/session TDD config found; established repo behavior is test-alongside + focused runs).
- Runner: `pnpm exec vitest run <file>` from `frontend-react/apps/web-store-pos`; typecheck via `pnpm typecheck`.

## Delivery forecast

- ~1 new test file, approx 300-500 authored lines (table-driven). Under the 400-line per-task advisory; single PR
  candidate. Push/PR remain the user's decision under ordinary repository policy.