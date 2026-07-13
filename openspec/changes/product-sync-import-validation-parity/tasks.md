# Tasks: Product Sync/Import Validation Parity

Strict TDD. Delivery: commits-only on `feat/frontend-parity-audit`, 3 work-unit
commits, NO chained PRs, NO size:exception (ratified — do not re-decide).
Test runner: `npx turbo run test`.

Binding gates (do not re-litigate): route BOTH product and category import
through the real repos (Gate A); mirror Angular revert with the LIVE mutated
reference, no snapshot (Gate B); surface real `Result.Failure` codes —
`Product.BarcodeExists`, `ProductCategory.NotExists`, `Product.NameExists`,
`ProductCategory.NameExists` (Gate D); reuse the existing narrow-interface
import-service injection pattern (rule 12) — do NOT invent a new abstraction.

---

## WU1 — Product + category import routing seam (atomic, own commit)

Constructor signature of `DataSynchronizerService` changes
(`NameUniqueRepo<ProductCategory>`/`NameUniqueRepo<Product>` params →
`CategoryImportRepo`/`ProductImportRepo`) — product and category MUST land
together, cannot be split across commits.

- [x] **T1.1 — RED: add `ProductImportRepo`/`CategoryImportRepo` interfaces + mock factories**
      File: `sync/lib/services/data-synchronizer-service.ts` (interfaces, additive) and
      `sync/lib/services/__tests__/data-synchronizer-service.test.ts` (new
      `makeProductImportRepo`/`makeCategoryImportRepo` mock factories replacing
      `makeNameUniqueRepo` for cat/prod call-sites — mirror
      `getStorageProductsMap`/`addImportedProduct`/`updateImportedProduct`/`updateProducts`
      and the category equivalents). No behavior change yet; this only stages the new
      seam shape so the next test can fail for the right reason.
      Requirement: "Sync Import Routes Through Domain Repositories".

- [x] **T1.2 — RED: write new parity test cases (must fail against current `mergeWithRevert`)**
      File: `sync/lib/services/__tests__/data-synchronizer-service.test.ts`.
      Add test cases, run, confirm RED:
      - per-category name collision rejected (`Product.NameExists`) but identical name in a
        DIFFERENT `categoryId` succeeds (current shim wrongly scopes name-uniqueness
        globally, not per-category — this is a NEW scenario, not in the current suite)
      - duplicate barcode rejected → `Product.BarcodeExists`, whole product-type reverts
        (NEW — current shim never checks barcodes)
      - missing category rejected → `ProductCategory.NotExists`, reverts (NEW)
      - product order-shift on import: existing products at `order >= item.order` shift `+1`
        (NEW — current shim has no order concept)
      - category order-shift on import: existing categories at `order >= item.order` shift
        `+1` (NEW)
      - revert on failure passes the repo the SAME mutated map reference obtained from
        `getStorageProductsMap`/`getStorageCategoriesMap` at loop start — not a clone
        (rewrite of existing T2 revert assertions to check reference identity/mutation,
        not just post-state)
      Requirements: "Product Import Enforces Full Angular Validation", "Category Import
      Enforces Name-Uniqueness and Order-Shift", "Revert Passes the Live Mutated Reference
      On Failure".

- [x] **T1.3 — GREEN: implement `mergeCategoriesViaRepository` + `mergeProductsViaRepository`**
      File: `sync/lib/services/data-synchronizer-service.ts`. Port 1:1 from Angular
      `synchronizeCategories`/`synchronizeProducts` per the design's step-mapping table:
      `getStorageProductsMap()` captured once pre-loop → sort incoming by `order` →
      has(id) ? `updateImportedProduct` : `addImportedProduct` (count only on success) →
      `!result.succeeded` → break → `repo.updateProducts(products)` with the SAME mutated
      reference (Gate B — do NOT clone) → map `result.errors[0]` to `{entity, code,
      message: description}` (Gate D) → catch → `ProductsUnexpectedError`/
      `CategoriesUnexpectedError`. Categories identical via `CategoryImportRepo`. Delete
      `mergeWithRevert` and the `NameUniqueRepo<T>` interface (dead code — nothing else
      references them after this). Update constructor param types to
      `CategoryImportRepo`/`ProductImportRepo`. Run T1.1+T1.2 → GREEN.

- [x] **T1.4 — GREEN: update T1/T2/T4/T5 mocks + assertions in the existing test file**
      File: `sync/lib/services/__tests__/data-synchronizer-service.test.ts`. Swap every
      remaining `makeNameUniqueRepo<ProductCategory|Product>()` call-site to
      `makeCategoryImportRepo`/`makeProductImportRepo` (T1 write-order, T2 duplicate-name
      revert, T4 upsert counts, T5 empty-noop). PRESERVE unchanged: T3/T3b break-only
      semantics for orders/expenses/saleCredits/inventory, categories-first ordering,
      per-type error codes, "does not revert other entity types" (T2 last case),
      `synchronizeFiles`/`sync` cross-type aggregation (not abort-on-first). Do not delete
      or weaken these — only the cat/prod mock plumbing changes.
      Run: `npx turbo run test -- data-synchronizer-service.test.ts` → full GREEN.

- [x] **T1.5 — shared-instance wiring in `import.tsx` (with its own test)**
      File: `sync/routes/import.tsx`. Replace `makeCategoryRepoShim()`/
      `makeProductRepoShim()` with ONE shared `new ProductCategoryRepository(storeId)`
      injected into `new ProductRepository(storeId, categoryRepo)`, so product
      category-exists validation reads categories written by the SAME run's category
      merge (read-after-write consistency via one instance/cache — Angular singleton-DI
      parity). Reuse or share the existing `categoryRepoForSerializer` instance if that
      does not violate read/write separation; if a genuinely separate write-side instance
      is required, it must still be the SAME instance passed to both the category merge
      and `new ProductRepository(...)`.
      Test: extend `sync/routes/__tests__/import-no-write.test.ts` (or add a focused case)
      asserting that a product referencing a `categoryId` imported in the SAME
      `categories.json` (not previously in storage) is accepted — i.e., no
      `ProductCategory.NotExists` false-negative from a stale/second `ProductCategoryRepository`
      instance. This is the regression this task exists to prevent — write it as its own
      RED-then-GREEN case, do not fold it silently into T1.3's assertions.
      Requirement: "Sync Import Routes Through Domain Repositories" (shared-instance
      scenario is implied by Gate A/data-flow — call this out explicitly in the PR/commit
      note per the instruction's Rule-12 flag).

- [x] **T1.6 — Regression ring 1: edited test file**
      `npx turbo run test -- data-synchronizer-service.test.ts` — GREEN before proceeding.

- [x] **T1.7 — Regression ring 2: `app/sync/**`**
      `npx turbo run test -- --dir app/sync` (or equivalent scoped invocation) — GREEN,
      including `import-no-write.test.ts` (must stay green per design's file-changes table).

- [x] **T1.8 — Commit WU1**
      One commit: interfaces, both merge methods, deleted `mergeWithRevert`/
      `NameUniqueRepo`, `import.tsx` shared-instance wiring, rewritten/extended
      synchronizer test file. Conventional commit, e.g.
      `refactor(sync): route product+category import through real repositories (parity)`.

---

## WU2 — Shim retirement (own commit)

- [x] **T2.1 — RED/prune: remove product/category cases from `sync-repo-shims.test.ts`**
      File: `sync/lib/storage/__tests__/sync-repo-shims.test.ts`. Delete the
      `makeCategoryRepoShim`/`makeProductRepoShim` describe blocks (Map-entries wire-format
      cases) and the "a category import merge leaves ... readable by
      ProductCategoryRepository" integration case (lines ~97-145, ~227-256 in current
      file) — these test factories about to be deleted. PRESERVE: the "no BaseRepository
      reference" check (drop `makeCategoryRepoShim`/`makeProductRepoShim` from its factory
      list, keep it for Order/SaleCredit), all Order/SaleCredit plain-array cases, and the
      Order integration case (lines ~257-286). Run — should still be GREEN (this step only
      deletes now-obsolete assertions, doesn't change production code yet).

- [x] **T2.2 — GREEN: delete `makeProductRepoShim`/`makeCategoryRepoShim`/`makeNameUniqueRepoShim`**
      File: `sync/lib/storage/sync-repo-shims.ts`. Delete the three factories and the
      `makeNameUniqueRepoShim<T>` generic helper (dead after WU1 — nothing constructs
      `NameUniqueRepo` anymore). Keep `makeOrderRepoShim`/`makeSaleCreditRepoShim` and
      `makeGenericUpsertRepoShim` unchanged. Update the file's module-doc comment (it
      currently describes category/product Map-entries shimming — trim to
      orders/sale-credits only). Confirm no remaining import of `makeCategoryRepoShim`/
      `makeProductRepoShim` anywhere (`import.tsx` already updated in WU1).
      Requirement: "Sync-Local Storage Shim Replaces Shared Base Repository", "Sync Shim
      Wire-Format Parity Per Entity".

- [x] **T2.3 — Regression ring 1: edited test files**
      `npx turbo run test -- sync-repo-shims.test.ts data-synchronizer-service.test.ts` —
      GREEN.

- [x] **T2.4 — Regression ring 2: `app/sync/**` full**
      Run the full sync module suite, confirm `import-no-write.test.ts` still GREEN with
      no shim imports left dangling.

- [x] **T2.5 — Commit WU2**
      One commit, e.g. `refactor(sync): retire product/category import shims (real repos own storage)`.

---

## WU3 — Spec supersession + regression close-out (own commit)

- [x] **T3.1 — Merge spec delta into `openspec/specs/sync/spec.md`**
      Apply the ADDED/MODIFIED/REMOVED requirements from
      `openspec/changes/product-sync-import-validation-parity/specs/sync/spec.md` into the
      canonical `openspec/specs/sync/spec.md`: remove "Sync Import Behavior Unchanged
      (Re-Home Only)", add the four new requirements (routes-through-domain-repos,
      product-validation, category-validation, mutated-reference-revert), and apply the
      three MODIFIED requirements (domain-validated-abort-and-revert,
      sync-local-storage-shim, wire-format-parity). This is spec-merge bookkeeping, not
      new test-writing — no RED/GREEN cycle for this task itself (covered by WU1/WU2 GREEN
      tests already).

- [x] **T3.2 — Regression ring 3: `app/sales/**` (repo consumers)**
      `npx turbo run test -- --dir app/sales` — confirm `ProductRepository`/
      `ProductCategoryRepository` unit tests are unaffected (no repo contract changes —
      design explicitly states no repository changes, only new call-sites).

- [x] **T3.3 — Regression ring 4: full suite + typecheck + build**
      `npx turbo run test` (full), `npx turbo run typecheck` (or `tsc --noEmit` per repo
      convention), `npx turbo run build` — all GREEN before closing the change.

- [x] **T3.4 — Commit WU3**
      One commit, e.g. `docs(sync): supersede re-home-only spec with full validation parity requirement`.

---

## Review Workload Forecast

- Estimated changed lines: **~400-600** (design estimate: synchronizer net +120,
  test rewrite +200, shim file -90; WU1 carries the bulk).
- File count touched: 6 production/test files + 1 spec file
  (`data-synchronizer-service.ts`, `import.tsx`, `sync-repo-shims.ts`,
  `data-synchronizer-service.test.ts`, `sync-repo-shims.test.ts`,
  `import-no-write.test.ts` [read/verify only], `openspec/specs/sync/spec.md`).
- 400-line budget risk: **Medium-High** (WU1 alone likely 300-400 lines).
- Work-unit commit plan: **3 commits** (WU1 seam rewrite — largest, atomic;
  WU2 shim retirement; WU3 spec supersession + full regression close-out).
- Delivery: **commits-only** on `feat/frontend-parity-audit`, **NO chained
  PRs**, **NO size:exception** — settled, not re-decided here.
- Decision needed before apply: **No.**
- Regression-containment approach (widening rings, stop on first red):
  1. edited test file → 2. `app/sync/**` → 3. `app/sales/**` (repo consumers,
  WU3) → 4. full `npx turbo run test` + typecheck + build (WU3). Commit only
  when that work unit's ring is green.
- Rule-12 flag for apply/diff review: the injected `ProductImportRepo`/
  `CategoryImportRepo` interfaces are satisfied structurally by the real repos
  (no new class), mirroring the existing `InventoryImportService`/
  `ExpenseImportService` pattern — reviewer should confirm apply did not widen
  these interfaces beyond the four methods each design specifies, and did not
  reintroduce a shared base/abstraction across product+category+order+sale-credit.
- Shared-instance risk (T1.5): flagged as the one place a subtle regression
  could hide (stale `ProductCategoryRepository` cache read) — has its own
  explicit RED/GREEN task, not folded into a broader assertion.
