# Tasks: inventory-offline-service-parity

Strict TDD. Test runner: `npx turbo run test`. Delivery: commits-only on
`feat/frontend-parity-audit` (settled — NO chained PRs, NO `size:exception`).
Two work-unit commits: WU1 (service/repo + unit tests), WU2 (call-sites + report
ripple + route/component mocks).

Gates binding (do NOT re-decide): #1049 (3 gates, all strict Angular parity),
#1052 (stale-data — mirror Angular unguarded `.name`, no `''` guard).

## WU1 — Service signature/body fixes + `getCategoryRepository()` accessor + unit tests

- [x] **T1 (RED)** — `inventory-offline-service.test.ts`: add/rewrite `describe('createInventoryEntry ...')`
  assertions (currently under `INV-03: create`): 3-arity call
  `service.createInventoryEntry('p1', 50, 0.8)`; seed `p1` with `categoryId: 'cat-9'` in
  `ProductRepository` mock/fixture → assert `result.data` derives from an entry whose
  `categoryId === 'cat-9'` (not `''`); assert `entry.date === entry.createdDate` (single
  `new Date()` capture, both stamped from the same instant); assert missing product →
  bare `null` return (not `DataResult`) — reuse/extend the existing
  `describe('create — product-existence guard ...')` block. Expect RED (method doesn't
  exist yet / old `create` signature has `categoryId`/`date` params).
  Spec: createInventoryEntry — Angular-Exact Signature §.

- [x] **T2 (GREEN)** — `inventory-offline-service.ts`: rename `create` → `createInventoryEntry`,
  drop `categoryId`/`date` params. Derive `categoryId` from
  `productRepository.getStorageProductsMap().get(productId).categoryId`. Single
  `const date = new Date()` used for BOTH `entry.date` and `entry.createdDate` (Angular
  70,80,83 — collapse the current two separate `Date` reads into one). Missing product
  → `null` unchanged. Run T1 green.

- [x] **T3 (RED)** — `inventory-offline-service.test.ts`: rewrite `INV-05: deactivate` block
  calls to `service.deleteInventoryEntry('p1', 'e1')` (productId FIRST) — flip every
  existing `service.deactivate('e1', 'p1')` call's arg order and rename the call; add an
  assertion that the OLD arg order (`'e1','p1'` as productId/entryId) does NOT resolve
  (not-found), proving the rename enforces the new order, not just a bigger rename.
  Expect RED. Spec: deleteInventoryEntry — Angular-Exact Rename and Param Order §.

- [x] **T4 (GREEN)** — `inventory-offline-service.ts`: rename `deactivate(entryId, productId)`
  → `deleteInventoryEntry(productId, entryId)`, swap the two lookup call sites
  accordingly. Body/guard (`isNotSoldEntry`) unchanged. Run T3 green.

- [x] **T5 (RED)** — `inventory-offline-service.test.ts`: rewrite the `INV-08: getByDate
  filters by date` describe block (currently ~line 799-833) to
  `getInventoryEntriesInDay` and INVERT the assertion: seed one entry dated yesterday and
  one dated today; call `service.getInventoryEntriesInDay(yesterdayDate)` (a NON-today
  date) → assert the result contains ONLY today's entry (date param is IGNORED). Also
  keep/relabel the envelope-shape assertion (`succeeded:true, message:'', actionCode:200,
  errors:[]`) — that part of INV-08 is unchanged, only the date-honoring behavior flips.
  Expect RED (current body still honors the passed date). Spec: getInventoryEntriesInDay
  — Angular-Exact Rename and Ignore-Date Body §.

- [x] **T6 (GREEN)** — `inventory-offline-service.ts`: rename `getByDate` →
  `getInventoryEntriesInDay`; body now IGNORES the `date` param — always
  `startOfDay(new Date())` through `addDays(startOfDay(new Date()), 1)` (Angular
  252-258). Run T5 green.

- [x] **T7 (RED)** — `product-repository.ts` has no existing test file per the glob check
  (none found) — if a `product-repository.test.ts` exists elsewhere, add a case there;
  otherwise add a minimal case inline in `inventory-offline-service.test.ts`'s setup
  asserting `productRepository.getCategoryRepository()` returns the SAME
  `ProductCategoryRepository` instance passed into the `ProductRepository` constructor
  (identity check, not a new instance). Expect RED (accessor doesn't exist).

- [x] **T8 (GREEN)** — `product-repository.ts`: add accessor
  `getCategoryRepository(): ProductCategoryRepository { return this.categoryRepository; }`.
  **Keep MINIMAL** — no other changes to this file (rule-12 diff-review flag: this
  accessor must not grow into a broader invention; it only surfaces the already-injected
  dependency). Run T7 green.

- [x] **T9 (RED)** — `inventory-offline-service.test.ts`: rewrite `INV-09: getAvailableByCategory`
  block to `getInventoryCategoriesView` — ZERO-ARG calls (drop every
  `enrichedProduct(...)` / `products` array argument across all sub-cases: weighted-avg
  cost, category totals, NaN-avoidance, cross-category totals). Seed category names via a
  `ProductCategoryRepository` fixture (e.g. `cat-1: 'Bebidas'`) instead of the
  `enrichedProduct` helper's `categoryName` field. Add a new case: entry with a
  `categoryId` that has NO matching category in `ProductCategoryRepository` — assert it
  mirrors Angular's UNGUARDED `.name` read (gate #1052: no defensive `''` guard; this case
  documents the risk, does not need to pass gracefully — assert the exact throw/behavior
  Angular would produce, or explicitly skip per the retained product-existence-skip
  divergence if a product is missing — clarify against design's "Retained out-of-scope
  divergences" note before asserting a hard throw). Expect RED (method doesn't exist,
  `products` param still required).
  Spec: getInventoryCategoriesView — Angular-Exact Rename, Zero-Arg, Category Sourcing §.

- [x] **T10 (GREEN)** — `inventory-offline-service.ts`: rename `getAvailableByCategory` →
  `getInventoryCategoriesView`, remove the `products` param entirely. Group active entries
  by `entry.categoryId` (not by a caller-supplied product map). Source `categoryName` via
  `this.productRepository.getCategoryRepository().getStorageCategoriesMap().get(categoryId).name`
  — UNGUARDED (no `?.` / no `''` fallback — gate #1052, mirrors Angular's unguarded read
  literally). Keep the existing skip-zero-available / NaN-avoidance and
  product-existence-skip divergences (both previously ratified, out of GATE-B's scope —
  do not touch). Run T9 green.

- [x] **T11 (GREEN)** — `inventory-offline-service.ts`: add private
  `getStorageActiveInventoryEntries()` helper (Angular 50-52) used internally by
  `getInventoryEntriesInDay`/`getInventoryCategoriesView` in place of ad-hoc active-entry
  filtering, mirroring Angular's structure. Update the two Observable siblings:
  `getInventoryEntriesInDayObservable(date)` delegates to the renamed
  `getInventoryEntriesInDay`; `getInventoryCategoriesViewObservable()` becomes ZERO-ARG,
  delegating to the renamed `getInventoryCategoriesView()` (drop its own `products` param
  — it was only a DI-gap mirror of the old sync method's shape). No existing call-site
  depends on either Observable sibling (design confirms) — pure rename/delegation, no new
  test required beyond confirming existing Observable-sibling tests (lines ~1274-1310)
  still pass after updating their internal calls to the renamed methods.

- [x] **T12** — Run `npx turbo run test -- inventory-offline-service` (or full suite scoped
  to this file). Confirm green. Grep the test file for residual `.create(`, `.deactivate(`,
  `.getByDate(`, `.getAvailableByCategory(` calls — none should remain (all renamed).

- [x] **T13** — WU1 work-unit commit: `inventory-offline-service.ts`,
  `product-repository.ts`, `inventory-offline-service.test.ts`. Conventional commit,
  e.g. `refactor(inventory-offline-service): rename create/deactivate/getByDate/
  getAvailableByCategory to Angular-exact names + category-repo sourcing (parity)`.

## WU2 — Call-site ripple + create-form date field + Stage 7 reports + route/component mocks

- [x] **T14** — `today-entries.tsx`: `handleSave` → `svc.createInventoryEntry(data.productId,
  data.quantity, data.costPrice)` (drop the `''`/`new Date(data.date)` args, line ~105);
  `handleDeactivate` → `svc.deleteInventoryEntry(entry.productId, entry.id)` (swap arg
  order, line ~88); `loadEntries` → `svc.getInventoryEntriesInDay(new Date())` (line ~39).

- [x] **T15** — `edit-inventory-entry-modal.tsx`: REMOVE the date field entirely — delete
  the `date` state (`useState`), `todayString()` helper, the `date` field from
  `EditInventoryEntryInput`, the date `<input type="date">` block (lines ~199-210), and
  drop `date` from the `onSave(...)` payload (line ~104-107). Angular's
  `edit-inventory-entry-modal.component.html` has no date field — create always stamps
  "now" (GATE-A). Confirm `inventory-components.test.tsx`'s
  `EditInventoryEntryModal` suite (title/save-button-toggle, validation-messages) has no
  assertion depending on the date input (verified: none found) — re-run that file's tests
  after the removal to confirm no incidental breakage.

- [x] **T16** — `today-quantities.tsx`: `inventorySvc.getByDate(today).data` →
  `inventorySvc.getInventoryEntriesInDay(today).data` (line ~85); replace the
  `enriched`-array `getAvailableByCategory(enriched)` call (lines ~90-101) with zero-arg
  `getInventoryCategoriesView()` — drop the now-unneeded `enriched` array construction.

- [x] **T17** — `today-sales-profit.tsx`: `inventorySvc.getByDate(today).data` →
  `inventorySvc.getInventoryEntriesInDay(today).data` (line ~108). No
  `getAvailableByCategory`/`getInventoryCategoriesView` usage in this file — rename-only.

- [x] **T18** — `available.tsx`: `inventorySvc.getAvailableByCategory(enriched).data` →
  `inventorySvc.getInventoryCategoriesView().data` (line ~55) — zero-arg. Remove the now-dead
  `enriched` array construction (lines ~46-51). Evaluate whether `categorySvc.getProductCategories()`
  / `productSvc.getAvailableProductsByCategoryId(...)` (lines ~37-43) become fully unused
  once `enriched` is gone — if their only consumer was building `enriched`, remove those
  calls and the now-unused `productSvc`/`categorySvc` instantiations too (dead-code
  cleanup scoped strictly to this ripple, not a broader refactor).

- [x] **T19** — `reports/lib/services/inventory-today-sale-service.ts`:
  `this.inventoryService.getByDate(date).data` → `this.inventoryService.getInventoryEntriesInDay(date).data`
  (line ~78). Rename-only — no `getAvailableByCategory` usage in this file.

- [x] **T20 (RED→GREEN together — mock/assertion ripple)** — `inventory-routes.test.tsx`:
  across every `InventoryOfflineService` mock block (lines ~31-38, ~228, ~303, ~403,
  ~440-446, ~472-478, ~505-511, ~541-547, ~825-826, ~1090-1096, ~1116-1122, ~1175-1184),
  rename mock keys `create`→`createInventoryEntry`, `deactivate`→`deleteInventoryEntry`,
  `getByDate`→`getInventoryEntriesInDay`, `getAvailableByCategory`→`getInventoryCategoriesView`.
  Flip the `deactivateMock`/`deleteInventoryEntry` call-assertion arg order from
  `('e1','p1')` to `('p1','e1')` (entry.productId first). Drop the
  `getAvailableByCategory` products-mirroring override near line ~303 (zero-arg now — no
  products array to mirror). Update the `createMock` call-assertion (line ~497-511,
  ~532-547) to the new 3-arg shape (`productId, quantity, costPrice`, no
  `categoryId`/`date`). Re-run the full file; fix any remaining failures from the rename
  ripple.

- [x] **T21** — `inventory-components.test.tsx`: re-run the `EditInventoryEntryModal`
  suites after T15's date-field removal; confirm no test references the date input (label
  `INVENTORY.ENTRY.DATE`, `type="date"`, or `todayString()`). No assertion changes
  expected per the grep audit, but this is the confirmation step.

- [x] **T22** — Grep-verify (spec "Report Callers Use Renamed Methods" scenario): `rg
  "getByDate\(|getAvailableByCategory\(|\.deactivate\(" frontend-react/apps/web-store-pos/app/inventory
  frontend-react/apps/web-store-pos/app/reports` returns no matches outside historical
  comments/docs. Also confirm no method named `deactivate`, `getByDate`, or
  `getAvailableByCategory` remains on `InventoryOfflineService` itself (T12 already
  covered the service file; this is the call-site-wide sweep).

- [x] **T23** — Run full `npx turbo run test` across the affected workspace(s); fix any
  ripple failures (report tests, route tests, component tests).

- [x] **T24** — WU2 work-unit commit: `today-entries.tsx`, `edit-inventory-entry-modal.tsx`,
  `today-quantities.tsx`, `today-sales-profit.tsx`, `available.tsx`,
  `inventory-today-sale-service.ts`, `inventory-routes.test.tsx`,
  `inventory-components.test.tsx`. Conventional commit, e.g.
  `refactor(inventory-callers): update to renamed InventoryOfflineService surface +
  remove create-form date field (parity)`.

## Review Workload Forecast

- **Estimated changed lines**: >400 (design ADR — heavy mock ripple across
  `inventory-routes.test.tsx`'s ~15 `InventoryOfflineService` mock blocks plus 8
  production files).
- **File count**: 11 (2 WU1 impl + 1 WU1 test; 6 WU2 call-sites/impl + 2 WU2 test files).
- **Chained PRs recommended**: No (delivery is commits-only on
  `feat/frontend-parity-audit` — settled, ratified in `delivery-commits-only-on-feature-branch`
  memory; no PR split, no `size:exception` needed).
- **400-line budget risk**: High, but explicitly accepted per settled delivery strategy —
  no gate/stop needed before `sdd-apply`.
- **Decision needed before apply**: No — all binding decisions (GATE-A/B/C, stale-data
  gate) are resolved in gates #1049/#1052; tasks above are mechanical execution only.
