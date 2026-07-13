# Design: Product Sync/Import Validation Parity

## Technical Approach

Route sync PRODUCT and CATEGORY import merges through the real
`ProductRepository` / `ProductCategoryRepository` (which already carry the full
Angular validation), replacing the generic `NameUniqueRepo<T>` shim seam. This
mirrors Angular `synchronizeProducts` / `synchronizeCategories` 1:1: the
synchronizer ORCHESTRATES (getStorageMap → sort by order → add-vs-update →
break-on-failure → revert-with-mutated-ref); the repo OWNS validation
(category-exists + barcode + per-category name + order-shift for products; name
+ order-shift for categories). We reuse the EXISTING import-service pattern
(`InventoryImportService` / `ExpenseImportService` narrow injected interfaces) —
NO new abstraction (rule 12). Correctness is largely automatic: driving the same
repo code Angular drives reproduces every subtle behavior (order-shift, empty-map
cache reload, mutated-ref revert) for free. Supersedes the ratified sync
"Re-Home Only" requirement (gates #1036).

## Architecture Decisions

### Decision: Narrow import-repo interfaces satisfied by the real repos

**Choice**: Add two injected interfaces mirroring the Angular method surface the
synchronizer calls:
```ts
interface ProductImportRepo {
  getStorageProductsMap(): Map<string, Product>;
  addImportedProduct(p: Product): Result;
  updateImportedProduct(p: Product): Result;
  updateProducts(m: Map<string, Product>): void;   // revert
}
interface CategoryImportRepo {
  getStorageCategoriesMap(): Map<string, ProductCategory>;
  addImportedProductCategory(c: ProductCategory): Result;
  updateImportedProductCategory(c: ProductCategory): Result;
  updateCategories(m: Map<string, ProductCategory>): void; // revert
}
```
Both are satisfied structurally by the real repos (all methods already exist,
unit-tested). No `storeId` per-call param (unlike `NameUniqueRepo`) — the real
repos bind `storeId` at construction, mirroring Angular's root-DI singletons.

**Alternatives considered**: (a) keep `NameUniqueRepo` and thicken the shim with
barcode/category checks — rejected: re-implements repo logic (rule 10/12
violation, the original bug). (b) inject the concrete classes directly — rejected:
loses test seam; the Inventory/Expense pattern already establishes interface
injection.

**Rationale**: Matches the established sync seam pattern exactly; zero new base
class; the repo remains the single source of validation truth.

### Decision: Two dedicated merge methods; delete `mergeWithRevert` + `NameUniqueRepo`

**Choice**: Replace the two `mergeWithRevert` call-sites with
`mergeCategoriesViaRepository` and `mergeProductsViaRepository`, each a 1:1 port of
its Angular counterpart. `mergeWithRevert` and `NameUniqueRepo` become dead → deleted.

**Alternatives considered**: One generic parametrized method — rejected: Angular
has two separate methods; products need barcode/category-exists the generic can't
express, and forcing a shared shape re-introduces an invented abstraction.

**Rationale**: Structural parity with Angular's two `synchronize*` methods.

### Decision: Mirror Angular revert with the mutated reference (Gate B)

**Choice**: `const products = repo.getStorageProductsMap()` captured pre-loop; the
repo's own `add/updateImported*` mutate THAT SAME cached reference in place
(order-shift, `set`). On first failure, call `repo.updateProducts(products)` — which
persists the partially-mutated map, NOT a clean snapshot. Do NOT clone.

**Rationale**: Because we drive the real repo (identical to Angular's), the
mutated-ref quirk and the `getStorageProductsMap` size===0 reload quirk are
reproduced automatically. Snapshotting would DIVERGE from Angular (migrate≠improve).

### Decision: Surface the repo's real Result.Failure error codes (Gate D)

**Choice**: On `!result.succeeded`, map `result.errors[0]` → `{ entity, code:
err.code, message: err.description }`. Exposes the real codes: `Product.NameExists`,
`Product.BarcodeExists`, `ProductCategory.NameExists`, `ProductCategory.NotExists`.
A thrown exception still yields `Products/CategoriesUnexpectedError` (catch block).

**Rationale**: `import.tsx`/`ImportForm` consume `SyncResult.errors`; the existing
name-collision tests already assert `Product.NameExists` / `ProductCategory.NameExists`
(the synthetic `SynchronizerErrors` codes were deliberately equal), so only NEW
codes (barcode, missing-category) add assertions. `BaseError.description` → `message`.

## Data Flow

```
import.tsx handleImport
  categoryRepo = new ProductCategoryRepository(storeId)          ← ONE shared instance
  productRepo  = new ProductRepository(storeId, categoryRepo)    ← same categoryRepo injected
  synchronizer.sync(parsedData)
     1. mergeCategoriesViaRepository(categoryRepo)  ── writes categories FIRST
     2. mergeProductsViaRepository(productRepo)     ── category-exists reads SAME categoryRepo
     3. inventory/orders/expenses/saleCredits       ── UNCHANGED (service/shim)
```
Shared `categoryRepo` instance is critical: product category-exists validation must
observe the categories written in step 1. One instance = one cache = guaranteed
read-after-write consistency, mirroring Angular's singleton DI.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `sync/lib/services/data-synchronizer-service.ts` | Modify | Add `ProductImportRepo`/`CategoryImportRepo`; add `mergeProductsViaRepository`/`mergeCategoriesViaRepository`; delete `mergeWithRevert` + `NameUniqueRepo`; constructor param types change |
| `sync/routes/import.tsx` | Modify | Construct shared `ProductCategoryRepository` + `ProductRepository`; drop `makeCategoryRepoShim`/`makeProductRepoShim` calls |
| `sync/lib/storage/sync-repo-shims.ts` | Modify | Delete `makeProductRepoShim` + `makeCategoryRepoShim` + `makeNameUniqueRepoShim`; keep Order/SaleCredit generic-upsert shims |
| `sync/lib/services/__tests__/data-synchronizer-service.test.ts` | Modify | Replace cat/prod mocks with import-repo mocks; add RED parity tests |
| `sync/lib/storage/__tests__/sync-repo-shims.test.ts` | Modify | Remove category/product shim cases + integration case; keep order/saleCredit |
| `sync/routes/__tests__/import-no-write.test.ts` | Verify | Re-home wiring; must stay green |
| `openspec/specs/sync/spec.md` | Modify (sdd-tasks) | Supersede "Sync Import Behavior Unchanged (Re-Home Only)"; add product/category validation requirement |

Which entities keep the shim: **Orders, SaleCredits** (plain-array `GenericUpsertRepo`
shim — no validation in Angular, break-only). **Inventory, Expenses** already route
through their offline SERVICES (unchanged). **Products, Categories** now route through
real repos → their shims are DELETED.

## Angular → React step mapping (`synchronizeProducts`)

| Angular | React `mergeProductsViaRepository` |
|---|---|
| `getStorageProductsMap()` | `const products = this.productRepo.getStorageProductsMap()` |
| `Array.from(imported).sort(order)` | `[...incoming].sort((a,b)=>a.order-b.order)` |
| `products.has(id)` ? `updateImportedProduct` : `addImportedProduct` | same; count updated/inserted only on success |
| `if(!result.succeeded) break` | break loop |
| `if(!succeeded) updateProducts(products)` | `this.productRepo.updateProducts(products)` (mutated ref) → return `{inserted:0,updated:0}` + mapped error |
| `catch → ProductsUnexpectedError` | catch → `ProductsUnexpectedError` |

Categories map identically to `synchronizeCategories` via the category repo.

## Testing Strategy (strict TDD)

| Layer | What to test | Approach |
|-------|-------------|----------|
| Unit (RED first) | per-category name collision REJECTED (`Product.NameExists`); barcode dup REJECTED (`Product.BarcodeExists`); missing category REJECTED (`ProductCategory.NotExists`); category order-shift on import; product order-shift; whole-product-type revert passes the MUTATED ref | New tests against `mergeProductsViaRepository`/`mergeCategoriesViaRepository` using real repos backed by `localStorage` (jsdom) OR import-repo mocks that assert `updateProducts` receives the mutated map |
| Unit (update) | T1 write-order, T2 revert, T4 upsert counts, T5 empty-noop — rewrite cat/prod mocks to the new interface; PRESERVE orthogonal assertions | Swap mock factories `makeNameUniqueRepo`→`makeProductImportRepo`/`makeCategoryImportRepo` |
| Integration | import.tsx builds shared repo graph; categories-before-products; serializer-throw → no write | `import-no-write.test.ts` unchanged intent |
| Regression | full sync suite (105 files / 1232 tests) | run incrementally: file → module (`sync/`) → full app |

Tests to CHANGE: `data-synchronizer-service.test.ts` (mocks + new codes),
`sync-repo-shims.test.ts` (drop product/category cases). Tests PRESERVED
(orthogonal): order/expense/saleCredit/inventory routing, break-only semantics,
per-type error codes, categories-first ordering.

## Regression-Containment Plan

Run in widening rings, stop on first red: (1) the edited test file; (2)
`app/sync/**`; (3) `app/sales/**` (repo consumers); (4) full app suite + `tsc` +
build. Commit per work unit only when its ring is green.

## Work-Unit Breakdown (commits-only, no chained PRs)

- **WU1 — seam rewrite (core, atomic)**: interfaces + both merge methods + delete
  `mergeWithRevert`/`NameUniqueRepo` + `import.tsx` shared-instance wiring +
  rewrite/extend `data-synchronizer-service.test.ts` (RED parity tests first). The
  constructor signature change forces product+category together — cannot split.
- **WU2 — shim retirement**: delete product/category shim factories, prune
  `sync-repo-shims.test.ts`, confirm `import-no-write` green.
- **WU3 — spec update** (in sdd-tasks scope): supersede re-home-only requirement.

**Review Workload Forecast** — estimated changed lines ~400–600 (net synchronizer
+120, test rewrite +200, shim -90). `400-line budget risk: Medium-High`.
`Chained PRs recommended: No` (delivery = commits-only on
`feat/frontend-parity-audit`, ratified). `Decision needed before apply: No` — split
into the three work-unit COMMITS above; WU1 is the largest and should be its own
commit.

## Migration / Rollout

No data migration — storage key + Map-entries wire format unchanged; a merge
performed via the real repo stays byte-compatible with prior shim output. Rollback =
revert the WU commits to restore `makeProductRepoShim`/`makeCategoryRepoShim` wiring.

## Open Questions

- [ ] None blocking. Residual risk flagged: the shared-instance requirement in
  `import.tsx` (product category-exists must read categories written in step 1) — the
  design mandates ONE `ProductCategoryRepository` instance shared into
  `ProductRepository`; verify no stale-cache read in apply.
