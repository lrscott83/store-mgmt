# Tasks: product-service-parity — Phase 2, Step 8 (CLEANUP — retire all coexistence scaffolding)

Governs `openspec/changes/product-service-parity/design.md` "Slicing — LAYER-FIRST" §Phase 2
step 8 ("Cleanup / final regression gate: confirm no `extends BaseService` on either interface,
no dead sync methods, no residual upsert/remove on either repository") + the "`ProductService`
becomes standalone async (drops `extends BaseService<Product>` in cleanup)" Decision (also governs
`ProductCategoryService` symmetrically) + spec.md's Exact-Surface Rule + "BaseService-level
`extends` — RETIRED for Product/ProductCategory" section. Depends on Slice 5 (COMPLETE, category
surface), Slice 6 (COMPLETE, `ProductOfflineService` 12-method async surface, `dc22b50`), Slice 7
(COMPLETE, `ProductOnlineService` + factory, Flag A files-only). This is the LARGEST, most
cross-cutting slice — it absorbs every item both prior slices explicitly deferred here. Strict
TDD: every removal/re-expression = RED→GREEN; signature/removal changes RED via a SCOPED `tsc
--noEmit` (vitest/esbuild strips types — confirmed gap since Slice 5). Angular source of truth:
`frontend/src/app/domain/interfaces/product.service.ts`,
`frontend/src/app/application/categories/product-category.service.ts`,
`frontend/src/app/application/synchronization/data-serializer.service.ts`,
`frontend/src/app/application/orders/order-offline.service.ts`,
`frontend/src/app/presentation/products/{products,category-product-list,edit-products-modal}.component.ts`,
`frontend/src/app/presentation/sale/sale-category-products/sale-category-products.component.ts`,
`frontend/src/app/presentation/inventory/inventory-available/inventory-available.component.ts`.
Delivery: commits-only on `feat/frontend-parity-audit`, one commit per work unit, conventional
messages, no PR/branches/stacking, no AI attribution. **size-exception pre-approved.**

**Housekeeping — WU0**: `git status` currently shows uncommitted local edits to
`product-offline-service.ts` + its test (untracked from a prior session). Before WU1, `git diff`
these two files, confirm whether they're stray WIP or already-intended step-8 work; either commit
them as a standalone WU0 or `git checkout` to reset to the Slice-6/7 baseline described below,
so this slice starts from a known-clean tree.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1150-1700 (WU1 ~50; WU2 ~40; WU3 ~50; WU4 ~100; WU5 ~65; WU6 ~5; WU7 ~300; WU8 ~150; WU9 ~150; WU10 ~130; WU11 ~185; WU12 ~30; WU13 ~80; Final ~25) |
| 400-line budget risk | High — largest slice in the whole SDD chain |
| Chained PRs recommended | No — delivery is commits-only per standing instruction |
| Suggested split | WU0 → WU1 → WU2 → WU3 → WU7 → WU8 → WU9 → WU10 → WU11 → WU12 → WU13 → WU4 → WU5 → Final, one commit per unit |
| Delivery strategy | commits-only (explicit instruction, supersedes ask-on-risk default) |
| Chain strategy | size-exception |

Decision needed before apply: **Yes — 3 flags below need ratification (Flag #1 is REQUIRED work
with a resolved design, not a yes/no; Flag #2 is a confirmed-by-source design; Flag #3 is a
factual correction to design.md needing sign-off). None of the three are "should we do this at
all" questions — Angular source and the Exact-Surface Rule leave no bridge-method alternative —
but all three land real, visible behavior/architecture changes and deserve explicit go-ahead
before the biggest slice in this chain starts.**
Chained PRs recommended: No
400-line budget risk: High

## Sequencing rationale (green-in-isolation bundling)

Unlike Slice 6/7, this slice's breaking change is REMOVING the sync surface, not adding an async
one — so the safe order INVERTS the usual "interface first" pattern for the risky part:

1. **WU1-WU3 (interface trims + alias retirement) are safe standalone** — TS `implements` only
   requires a class to have AT LEAST the interface's members; trimming the interface does not
   break `ProductOfflineService`/`ProductCategoryOfflineService`, which still have the now-untyped
   extra sync methods as harmless surplus. Each lands green alone.
2. **WU7-WU13 (ALL call-site re-expression) must land BEFORE WU4/WU5** (concrete sync-method-body
   removal). While call sites still call `getAll()`/`create()`/etc., the concrete classes must
   keep those bodies working — removing them first would break every un-migrated call site
   simultaneously with no way to land incrementally. Re-expressing call sites first (while the old
   bodies still exist as an inert safety net) keeps every intermediate commit green.
3. **WU4/WU5 (remove the now-dead sync bodies + module-level `repo` consts) come LAST**, once a
   grep confirms zero remaining callers — at that point removal is a clean, low-risk deletion.
4. **Final** regression-gates the whole slice.

This mirrors the "Additive coexistence migration" Decision that has governed every slice in this
chain (design.md) — WU7-WU13 ADD the async call sites (already possible, the async methods have
existed since Slice 6/7) and only once nothing depends on the old surface does WU4/WU5 retire it.

## Flagged mismatches / decisions — RATIFICATION NEEDED

### Flag #1 (BLOCKING) — `products.tsx`/`sale.tsx`/`egress.tsx`/`available.tsx` lose their sync `getAll()` bridge; there is no async "flat getAll" on the interface, forcing real UI-architecture changes

Four routes currently call `productSvc.getAll()`/`categorySvc.getAll()` (or both) to eagerly load
a flat, unfiltered list once and derive everything else via client-side `.filter()`. **No such
method exists on the async `ProductService`/`ProductCategoryService` surface** — Angular itself
never had one (its offline services are `Observable`-based per-purpose queries, never a bare
`getAll()`). Inventing one would be a forbidden bridge method (spec.md's Exact-Surface Rule). This
was flagged and explicitly deferred by name in BOTH prior slices (Slice 6's Flag #5 "OUT of
scope"/Flag #7 "stay on `getAll()`"; Slice 7's "6 blocked sites"), and spec.md's own "Call-Site
Parity" requirement explicitly names `getProductsToSaleByCategoryId` (sale category products) as
REQUIRED — so this is not optional, but it IS real, visible UI work. Each site's re-expression is
grounded in the real Angular source (read this session, not guessed):

**`sale.tsx`/`egress.tsx`** (near-identical files) — Angular's real
`SaleCategoryProductsComponent` (`sale-category-products.component.ts:31-43`) fetches
`productService.getProductsToSaleByCategoryId(cat.id)` **every time the selected category
changes**, and `SaleComponent`/`EgressComponent` load categories via
`categoryService.getAvailableProductCategories()` (both routes already carry a code comment
saying exactly this — `sale.tsx:39-40`/`egress.tsx:45-46`). Required re-expression: (a) categories
`useEffect` on mount → `categoryService.getAvailableProductCategories()` (drop the
`.filter(isActive)` — the method already filters); (b) a SECOND `useEffect` keyed on
`[storeId, selectedCategoryId]` → `productService.getProductsToSaleByCategoryId(selectedCategoryId)`,
replacing the current single `productService.getAll()` + client `.filter()`; `products` state
becomes CATEGORY-SCOPED (only the selected category's sellable products), not global — `products`
already only renders/dispatches clicks for the current category in the UI, so
`handleAdded`/`checkAvailability`'s `products.find(p => p.id === productId)` stays correct against
the narrower array. `categoryProducts` derived-filter is deleted — `products` state IS the
category-scoped list now, matching Angular's `products$`.

**`products.tsx`** — Angular's real `ProductsComponent` (`products.component.ts:30-40`,
`products.component.html:33-46`) loads categories via `categoryService.getProductCategoriesView()`
(→ `ProductCategoryView[]`, ACTIVE-ONLY, WITH `productsCount`) and mounts one
`CategoryProductListComponent` PER category eagerly (Angular's `mat-expansion-panel` does not lazy
render its body here — confirmed by reading the template, no `matExpansionPanelContent`
ng-template) — each child independently calls
`productService.getAvailableProductsByCategoryId(category.id)`
(`category-product-list.component.ts:38-39`) on its own `ngOnInit`. The accordion badge shows
`category.productsCount` from `getProductCategoriesView()` (an `isActive && availableToSale`
count) — a DIFFERENT filter than the panel's own product list (`isActive`-only) — this is a
genuine, deliberate Angular quirk (matches spec.md's "three separate filters" section), not a bug
to normalize away. Required re-expression: `loadData` → `categoryService.getProductCategoriesView()`
for `categories` (replaces `categoryService.getAll()`, badge count now uses
`category.productsCount`, not a locally-derived length); THEN, mirroring Angular's eager-mount-all
behavior, fetch every category's product list up front via
`Promise.all(categories.map(c => productService.getAvailableProductsByCategoryId(c.id)))`, cached
as `Record<categoryId, Product[]>` state (replaces the single flat `products` array + its
`.filter()` derivations in the accordion AND in `EditProductsModal`'s prop, which currently reads
`products.filter(p => p.isActive && p.categoryId === modal.category.id)` — becomes a direct cache
lookup, `EditProductsModal` itself is UNCHANGED, this is its pre-existing React-only bulk-price-edit
divergence from Angular's real create-new-rows modal, frozen since Slice 6, not reopened here).
`CategoryProductList` (presentational, unchanged) keeps receiving `products` as a prop from the
cache. `loadData` becomes `async`; its callers (`handleCategorySave`, CSV import success, etc.)
already call it post-mutation — confirm each awaits or the existing fire-and-forget pattern used
elsewhere in this file is acceptable (match `handleCreateOrder`'s established precedent, per
Slice 6's WU5 note). Verify `CreateProductModal`/`EditProductModal`'s `categories` prop type still
accepts `ProductCategoryView[]` (id/name is all they need — confirm at apply time, not assumed).

**`available.tsx`** — Angular's real `InventoryAvailableComponent`
(`inventory-available.component.ts:26-36`) does NOT touch `productService`/`categoryService` at
all — it calls `InventoryOfflineService.getInventoryCategoriesViewObservable()` exclusively (a
DIFFERENT, Inventory-owned aggregation method). Fully matching that would mean restructuring
`InventoryOfflineService`, which is OUT OF SCOPE for `product-service-parity` (belongs to a
separate Inventory-parity SDD). MINIMAL in-scope fix (keeps `available.tsx`'s existing
"manually enrich then call `getAvailableByCategory`" shape, only swaps the two removed sync
calls): `categorySvc.getAll()` → `categorySvc.getProductCategories()` (offline-only, ALL
categories, same unfiltered set as before — zero behavior change); `productSvc.getAll()` → the
same per-category `Promise.all(categories.map(c => productSvc.getAvailableProductsByCategoryId(c.id)))`
pattern as `products.tsx`, flattened back into one array before building `enriched` (preserves
current behavior: all active products, enriched with category name).

**Options ratified into this plan** (present for sign-off, not re-litigation): the above is the
ONE Angular-source-grounded design per route — there is no (a)/(b) branch to choose between,
unlike Slice 6/7's flags. What needs explicit go-ahead is the SCOPE: this restructures 4 route
files' data-loading (loading states, multi-effect splits, per-category parallel fetches) — real,
visible behavior work landing inside a "cleanup" slice. If this is too much for one slice, the
alternative is carving WU7-WU10 into their own follow-up slice and leaving WU4/WU5 (sync-body
removal) blocked until they land — flag this trade-off before apply.

### Flag #2 (confirmed by source, light sign-off) — `import.tsx`/`export.tsx`/`data-serializer-service.ts` repository re-point

Angular's REAL `DataSerializerService` (`data-serializer.service.ts:17,83-84`) injects
`ProductRepository`/`ProductCategoryRepository` DIRECTLY (never the offline SERVICE) and writes
the RAW stored JSON strings straight into the zip: `categoryRepository.getCategoriesJson()` /
`productRepository.getProductsJson()`. React's current `DataSerializerService` instead accepts
generic `CategoryReader`/`ProductReader` structural interfaces (`{ getAll(): T[] }`) satisfied by
`ProductCategoryOfflineService`/`ProductOfflineService`'s sync `getAll()` (being removed in WU4/5),
then RE-DERIVES the JSON via `toMapEntriesJson()`. Required re-point: change
`DataSerializerService`'s constructor params (`categoryReader`/`productReader`) to accept
`ProductCategoryRepository`/`ProductRepository` (both already expose `getCategoriesJson(): string |
null` / `getProductsJson(): string | null`, untouched repo-layer sync members, unaffected by this
slice); `export()` writes those raw strings directly into the zip entries (replaces
`toMapEntriesJson(this.categoryReader.getAll(), ...)`); `import.tsx`/`export.tsx` construct
`ProductRepository`/`ProductCategoryRepository` instead of the offline services for these two
params only — `import.tsx`'s OTHER uses of `ProductOfflineService`/repos (the write-side
synchronizer) are untouched. This is MORE faithful than the current implementation (raw
byte-preserving pass-through vs. re-derived array), not a neutral refactor — call this out, don't
silently treat it as equivalent. `order`/`expense`/`saleCredit` readers are UNTOUCHED (owned by
other services, out of this SDD's scope).

### Flag #3 (factual correction, needs sign-off) — `ProductCategoryService` dropping `extends BaseService` — design.md's premise was incomplete

design.md's Decision claims Angular's category interface has "NO `getAll`/`delete` correlate."
**This is not quite right**: `ProductCategoryService extends BaseService<ProductCategory>` in
Angular too (`product-category.service.ts:11`), and its INHERITED `delete` member DOES have a
real call site — `products.component.ts:89` (`onDeleteCategory`) calls `this.categoryService.delete
(categoryId)`. However, `ProductCategoryOfflineService` never overrides `delete` — it inherits
`BaseService.delete`, which fires a raw `this.http.delete(...)` HTTP call
(`base.service.ts:128-140`) — i.e. in OFFLINE mode Angular's own category-delete UI feature does
NOT actually delete anything from local storage; it hits the network (broken/pointless offline,
an Angular-own gap, not something this port should replicate as "working"). React's
`ProductCategoryOfflineService.delete` currently has ITS OWN real local override
(`repo.remove(...)`, an actual hard-delete) with **zero call sites anywhere in `app/`** (this
feature — category deletion from the products page — was never ported to React in any prior
slice, confirmed by grep this session). **Recommendation: proceed with design.md's DROP exactly as
planned** — nothing currently depends on React's `delete`, and Angular's own inherited version is
non-functional offline anyway — but this correction should be recorded for the historical record
before dropping it, since the original justification ("no correlate") was factually incomplete.

### Non-flag confirmations (no ratification needed, documented for completeness)

- **`product-repository.ts`'s `categoryRepository` constructor param stays OPTIONAL** — design.md
  explicitly defers tightening it to mandatory to Phase 2 **step 9** (engram #758 precedent). NOT
  touched in this slice.
- **`order-offline-service.ts`'s `getCategoryCartItemsView`** — Angular's real
  `OrderOfflineService` constructor injects `ProductCategoryRepository` directly
  (`order-offline.service.ts:38,79`). React re-point: `new
  ProductCategoryOfflineService(this.storeId).getAll()` → `new
  ProductCategoryRepository(this.storeId).getProductCategories()` (no constructor signature change
  needed — matches the file's existing pattern of internally constructing dependencies).
- **`cart-shell.tsx`/`user-home.ts`/`edit-inventory-entry-modal.tsx`** — Slice 7's Flag A
  explicitly deferred their `createProductService(storeId)` factory rewiring to "a single coherent
  pass in step 8" alongside the other 6 sites. Folded into WU13 here.

## WU1: Domain `ProductService` interface — drop `extends BaseService<Product>` + `getByBarcode`/`update` — Req: "Service Method Signature Parity"

`packages/domain/src/services/product-service.ts` +
`packages/domain/src/services/__tests__/product-service.test.ts` (fake).

- [x] 1.1 RED/GREEN: remove `extends BaseService<Product>` and the `getByBarcode(barcode):
      Product | undefined` / `update(product): Product` sync member declarations — interface
      becomes standalone, exactly the 12 async methods (no supertype).
- [x] 1.2 GREEN: update the file's doc comment (currently says these "intentionally STAY through
      this slice") to reflect the drop is now DONE, not deferred.
- [x] 1.3 GREEN: rewrite the test fake to implement only the 12 methods (drop any sync stub
      implementations of `getByBarcode`/`update`/inherited `BaseService` members).
- [x] 1.4 Gate: `pnpm -C packages/domain exec vitest run`, `pnpm -C packages/domain exec tsc
      --noEmit`, `pnpm -C packages/domain build`; commit
      `refactor(domain): drop extends BaseService<Product> + sync getByBarcode/update from ProductService`.
      All green: domain vitest 96/96, domain `tsc --noEmit` clean, domain build clean, scoped
      app `tsc --noEmit` clean (confirms `AsyncProductService = Omit<ProductService, 'getAll' |
      'getById' | 'delete' | 'getByBarcode' | 'update'>` still typechecks — `Omit` tolerates keys
      no longer present on `ProductService`, no call site broke).

## WU2: Domain `ProductCategoryService` interface — drop `extends BaseService<ProductCategory>` — Req: "Category Service Method Surface Parity", Flag #3

`packages/domain/src/services/product-category-service.ts` +
`packages/domain/src/services/__tests__/product-category-service.test.ts` (fake). Also add
`getProductCategories(): Promise<BaseResponseModel<ProductCategory[]>>` to the interface if not
already present — confirm current interface state (Slice 5 may have left it offline-only-only,
non-abstract; matches spec.md's "offline concrete additionally exposes ... `getProductCategories()`
... NOT on the abstract interface" — do NOT add it to the interface if spec.md says offline-only;
verify against spec.md's own table before touching).

- [x] 2.1 RED/GREEN: remove `extends BaseService<ProductCategory>` — interface becomes standalone,
      exactly the 5 async methods it already declares.
      (Flag #3 — recorded the `products.component.ts:89` `delete()` correction in the interface's
      doc comment, for the historical record. Confirmed `getProductCategories()` stays
      offline-concrete-only per spec.md's method-surface table — NOT added to this interface.)
- [x] 2.2 GREEN: rewrite the test fake accordingly.
- [x] 2.3 Gate: same as WU1; commit
      `refactor(domain): drop extends BaseService<ProductCategory> from ProductCategoryService (Flag #3: correct design.md's incomplete "no delete correlate" premise)`.
      All green: domain vitest 95/95, domain `tsc --noEmit` clean, domain build clean, scoped
      app `tsc --noEmit` clean.

## WU3: Retire the Flag-C `AsyncProductService` alias — Req: Slice 7 Flag C follow-through

`apps/web-store-pos/app/sales/lib/services/product-online-service.ts`,
`apps/web-store-pos/app/sales/lib/services/product-service.factory.ts` + their tests. Depends on
WU1 (interface must already be the bare 12-method shape).

- [x] 3.1 RED/GREEN: remove the `export type AsyncProductService = Omit<ProductService, ...>`
      alias; `class ProductOnlineService implements ProductService` directly (no behavior change —
      the 5 omitted members no longer exist on `ProductService` to omit).
- [x] 3.2 RED/GREEN: `product-service.factory.ts`'s `createProductService(storeId): ProductService`
      (return type, not `AsyncProductService`); update its test's type assertions if any.
      Confirmed no test type assertions referenced `AsyncProductService` — zero test edits needed.
- [x] 3.3 Gate: `pnpm -C apps/web-store-pos test`, `tsc --noEmit`, `pnpm build`; commit
      `refactor(web-store-pos): retire AsyncProductService alias now that ProductService is standalone async (Flag C follow-through)`.
      All green: 1561/1561 full suite (0 regressions), `tsc --noEmit` clean, `pnpm build` clean.
      Grep-confirmed `AsyncProductService` no longer appears in any production code (only 2
      historical-record doc-comment mentions remain, in `product-online-service.ts` and
      `product-service.factory.ts`).

## WU7: Re-express `products.tsx` — Req: Flag #1, "Call-Site Parity" (getProductCategoriesView, getAvailableProductsByCategoryId)

`apps/web-store-pos/app/sales/routes/products.tsx` + `.../__tests__/products.test.tsx`. See Flag
#1 for the full grounded design.

- [x] 7.1 RED/GREEN: `loadData` → `categoryService.getProductCategoriesView()` for `categories`
      state (`ProductCategoryView[]`); becomes `async`.
- [x] 7.2 RED/GREEN: fetch every category's products via
      `Promise.all(categories.map(c => productService.getAvailableProductsByCategoryId(c.id)))`,
      cache as `Record<string, Product[]>` state, replacing the single flat `products` array.
- [x] 7.3 GREEN: accordion badge → `category.productsCount` (from `getProductCategoriesView`, NOT
      a locally-derived length); accordion panel body / `CategoryProductList`'s `products` prop →
      cache lookup by `category.id`; `EditProductsModal`'s `products` prop → same cache lookup
      (no `EditProductsModal` component changes — pre-existing React-only feature, frozen).
- [x] 7.4 GREEN: verify `CreateProductModal`/`EditProductModal`'s `categories` prop type accepts
      `ProductCategoryView[]` (adjust prop types if they currently require full `ProductCategory`).
      Confirmed: both accept `ProductCategory[]`, structurally satisfied by `ProductCategoryView[]`
      (superset) — zero prop-type changes needed.
- [x] 7.5 GREEN: `loadData` callers (`handleCategorySave`, CSV import success path, create/edit/
      delete/bulk handlers) — confirm `await`/fire-and-forget consistent with the file's existing
      async pattern. Kept fire-and-forget (`loadData();`, unawaited), matching every pre-existing
      caller in this file.
- [x] 7.6 Update `products.test.tsx`: mock `getProductCategoriesView`/`getAvailableProductsByCategoryId`
      instead of `getAll`/`getAll`; assert badge count from `productsCount`, not derived length.
- [x] 7.7 Gate: `pnpm -C apps/web-store-pos test`, `tsc --noEmit`, `pnpm build`; commit
      `refactor(web-store-pos): re-express products.tsx loadData against getProductCategoriesView + per-category getAvailableProductsByCategoryId, drop flat getAll (Flag #1)`.
      All green (21/21 route tests, 1560/1560 full suite, tsc clean, build clean).

## WU8: Re-express `sale.tsx` — Req: Flag #1, "Call-Site Parity" (getAvailableProductCategories, getProductsToSaleByCategoryId)

`apps/web-store-pos/app/sales/routes/sale.tsx` + its test.

- [ ] 8.1 RED/GREEN: categories `useEffect` → `categoryService.getAvailableProductCategories()`
      (drop the manual `.filter(isActive)` — already filtered), sorted by `order` (method may
      already sort; confirm against `ProductCategoryRepository.getAvailableProductCategories`).
- [ ] 8.2 RED/GREEN: SECOND `useEffect` keyed on `[storeId, selectedCategoryId]` →
      `productService.getProductsToSaleByCategoryId(selectedCategoryId)`; `products` state becomes
      category-scoped (delete the `categoryProducts` derived-filter — `products` IS the scoped
      list now).
- [ ] 8.3 GREEN: `handleAdded`/`checkAvailability` keep `products.find(p => p.id === productId)`
      unchanged (now searching the narrower, correct-for-current-category array).
- [ ] 8.4 Update the test: mock `getAvailableProductCategories`/`getProductsToSaleByCategoryId`;
      assert refetch fires on category switch.
- [ ] 8.5 Gate + commit
      `refactor(web-store-pos): re-express sale.tsx category/product loading against getAvailableProductCategories + per-category getProductsToSaleByCategoryId (Flag #1)`.

## WU9: Re-express `egress.tsx` — Req: Flag #1 (same pattern as WU8)

`apps/web-store-pos/app/inventory/routes/egress.tsx` + its test. Identical shape to WU8 (near-
duplicate file structure) — same two-effect split, same `products` state narrowing.

- [ ] 9.1-9.4 Mirror WU8.1-8.4 for `egress.tsx`.
- [ ] 9.5 Gate + commit
      `refactor(web-store-pos): re-express egress.tsx category/product loading against getAvailableProductCategories + per-category getProductsToSaleByCategoryId (Flag #1)`.

## WU10: Re-express `available.tsx` — Req: Flag #1 (minimal in-scope fix)

`apps/web-store-pos/app/inventory/routes/available.tsx` + its test.

- [x] 10.1 RED/GREEN: `categorySvc.getAll()` → `categorySvc.getProductCategories()`.
- [x] 10.2 RED/GREEN: `productSvc.getAll()` →
      `Promise.all(cats.map(c => productSvc.getAvailableProductsByCategoryId(c.id)))`, flattened
      into one array before building `enriched` (preserves current enrichment logic unchanged).
- [x] 10.3 GREEN: effect becomes `async` (IIFE or `useEffect` + async helper, matching this app's
      established pattern elsewhere).
- [x] 10.4 Update the test: mock `getProductCategories`/`getAvailableProductsByCategoryId`.
- [x] 10.5 Gate + commit
      `refactor(web-store-pos): re-express available.tsx category/product loading against async getProductCategories + getAvailableProductsByCategoryId (Flag #1)`.
      All green (40/40 route tests, 1559/1560 full suite — the 1 failure is a PRE-EXISTING
      unrelated regression in sale.tsx/sales-routes.test.tsx from WU8, confirmed present before
      this WU via `git stash`; tsc clean, build clean).

## WU11: Re-point `import.tsx`/`export.tsx`/`data-serializer-service.ts` to repositories — Req: Flag #2

`apps/web-store-pos/app/sync/lib/services/data-serializer-service.ts`,
`apps/web-store-pos/app/sync/routes/import.tsx`, `apps/web-store-pos/app/sync/routes/export.tsx` +
their tests.

- [x] 11.1 RED/GREEN: `DataSerializerService`'s constructor — replace `categoryReader:
      CategoryReader`/`productReader: ProductReader` structural params with
      `categoryRepository: ProductCategoryRepository`/`productRepository: ProductRepository`
      (drop the two structural interfaces entirely if now unused).
      Confirmed unused — both interfaces removed; `toMapEntriesJson` also became fully dead
      (its only 2 call sites were categories/products) and was removed too.
- [x] 11.2 RED/GREEN: `export()` — replace `toMapEntriesJson(this.categoryReader.getAll(), ...)` /
      `toMapEntriesJson(this.productReader.getAll(), ...)` with direct
      `this.categoryRepository.getCategoriesJson()` / `this.productRepository.getProductsJson()`
      raw-string pass-through (drop `toMapEntriesJson`'s category/product call sites if now
      unused there — `order`/`expense`/`saleCredit` keep using it).
      **Deviation from pure pass-through, flagged and resolved (angular-bugs-policy)**: Angular's
      real `getCategoriesJson()`/`getProductsJson()` are typed `(): string` but their body is a
      plain `localStorage.getItem(...)` (`string | null`) with NO null guard anywhere in Angular's
      `DataSerializerService`/`DataFile.content: string`. On a genuinely never-synced/empty store
      that `null` gets `Blob`-coerced (zip.js `TextReader` → `new Blob([text], ...)`) into the
      literal 4-char text `"null"`, which is not a valid `[id, entity][]` array — Angular's own
      `getDataFiles()` would silently write a corrupt entry, and re-importing it would crash
      (`null.map is not a function`). This is an Angular-own latent bug (confirmed by reading
      `data-serializer.service.ts:81-90`, `product.repository.ts:301-303`,
      `product-category.repository.ts:172-174`, and zip.js's `TextReader`/`Blob` source), not
      something to mirror per angular-bugs-policy. React guards it: `getCategoriesJson() ?? '[]'` /
      `getProductsJson() ?? '[]'` — a valid empty-array fallback, tested explicitly (new T5 test
      "a never-synced store ... still exports/imports valid empty arrays").
- [x] 11.3 GREEN: `import.tsx`/`export.tsx` — construct `new ProductCategoryRepository(storeId)` /
      `new ProductRepository(storeId)` instead of the offline services for the
      `DataSerializerService` constructor call; leave `import.tsx`'s OTHER offline-service/
      repository usages (synchronizer write-side) untouched. `ProductCategoryOfflineService`/
      `ProductOfflineService` imports dropped from both route files (now fully unused there).
- [x] 11.4 Update `data-serializer-service.test.ts` (if it exists) — mock
      `getCategoriesJson`/`getProductsJson` instead of `getAll`.
      Existing file found; rewritten to seed real `localStorage` (map-entries JSON, same shape
      `BaseRepository`/`toMapEntriesJson` always produced) and construct real
      `ProductCategoryRepository`/`ProductRepository` instances instead of `CategoryReader`/
      `ProductReader` fakes — `InventoryReader`/`OrderReader`/`ExpenseReader`/`SaleCreditReader`
      fakes are untouched (Flag #2: those readers are out of scope). Added a new regression test
      for the never-seeded-store null-fallback decision above. Also cleaned the now-stale
      `ProductCategoryOfflineService`/`ProductOfflineService` `vi.mock`s out of
      `sync-routes.test.tsx` (dead mocks for modules the routes no longer import).
- [x] 11.5 Gate + commit
      `refactor(web-store-pos): re-point DataSerializerService to ProductRepository/ProductCategoryRepository (getCategoriesJson/getProductsJson raw pass-through, Angular parity, Flag #2)`.
      All green: 1561/1561 full suite (1560 baseline + 1 new regression test, 0 regressions),
      `tsc --noEmit` clean, `pnpm build` clean.

## WU12: Re-point `order-offline-service.ts`'s `getCategoryCartItemsView` — Req: non-flag confirmation

`apps/web-store-pos/app/sales/lib/services/order-offline-service.ts` + its test.

- [x] 12.1 RED/GREEN: `new ProductCategoryOfflineService(this.storeId).getAll()` → `new
      ProductCategoryRepository(this.storeId).getProductCategories()`.
- [x] 12.2 Update the test's mock target.
- [x] 12.3 Gate + commit
      `refactor(web-store-pos): re-point OrderOfflineService.getCategoryCartItemsView to ProductCategoryRepository (Angular parity)`.
      All green: 1561/1561 full suite (0 regressions, same shape confirmed — both `getAll()`
      and `getProductCategories()` return `ProductCategory[]` sorted ascending by `order`, no
      destructuring change needed at the call site), `tsc --noEmit` clean, `pnpm build` clean.

## WU13: Rewire `cart-shell.tsx`/`user-home.ts`/`edit-inventory-entry-modal.tsx` to the factory — Req: Slice 7 Flag A follow-through

`apps/web-store-pos/app/shared/components/cart-shell.tsx`,
`apps/web-store-pos/app/shared/lib/auth/user-home.ts`,
`apps/web-store-pos/app/inventory/components/edit-inventory-entry-modal.tsx` + their tests.

- [x] 13.1 RED/GREEN: `cart-shell.tsx:118` — `new ProductOfflineService(storeId)` →
      `createProductService(storeId)`; drop the now-unused `ProductOfflineService` import, add the
      factory import.
- [x] 13.2 RED/GREEN: `user-home.ts:24` — same swap for `resolveUserHomePath`.
- [x] 13.3 RED/GREEN: `edit-inventory-entry-modal.tsx:55` — same swap.
- [x] 13.4 Update the 3 tests' mock targets.
      Confirmed no mock changes were needed: all 3 tests (`cart-shell.test.tsx`,
      `user-home.test.ts`, `inventory-components.test.tsx`'s `EditInventoryEntryModal` block, plus
      `inventory-routes.test.tsx`'s shared fixture) already `vi.mock('~/sales/lib/services/
      product-offline-service', ...)` — the exact module the factory's offline branch
      (`GlobalConfig.USE_ONLINE_SERVICE === false`, the untouched test default) delegates to
      internally. Since `vi.mock` intercepts by module specifier regardless of which file performs
      the import, the existing mocks transparently back `createProductService(storeId)` with zero
      edits — verified all 4 test files green before AND after the production swap.
- [x] 13.5 Gate + commit
      `refactor(web-store-pos): rewire cart-shell/user-home/edit-inventory-entry-modal to createProductService factory (Slice 7 Flag A follow-through)`.
      All green: 1561/1561 full suite (0 regressions), `tsc --noEmit` clean, `pnpm build` clean.
      Note for whoever picks up **Final** (F.4): `sale.tsx`/`available.tsx`/`egress.tsx`/
      `products.tsx` still construct `new ProductOfflineService(storeId)` directly (WU7-WU10
      scope, untouched here) — F.4's "9 production call sites route through
      `createProductService(storeId)`" will need those 4 rewired too if that count is meant to be
      literal; WU13's own scope (tasks file, this WU) named only the 3 sites above.

### WU13b: Rewire the 4 remaining route files (`available.tsx`/`sale.tsx`/`products.tsx`/`egress.tsx`) to the factory — Req: completes F.4

Emergent follow-up to WU13 (this WU's body only named 3 sites; F.4 requires ALL production
call sites, including the WU7-WU10 route files, to route through the factory).

- [x] 13b.1 RED/GREEN (verified no test edits needed):
      `available.tsx:23` — `new ProductOfflineService(storeId)` → `createProductService(storeId)`
      (import from `~/sales/lib/services/product-service.factory`).
- [x] 13b.2 RED/GREEN: `sale.tsx:59` — same swap (import from `../lib/services/product-service.factory`).
- [x] 13b.3 RED/GREEN: `products.tsx:40` — same swap (import from `../lib/services/product-service.factory`).
- [x] 13b.4 RED/GREEN: `egress.tsx:65` — same swap (import from `~/sales/lib/services/product-service.factory`).
- [x] 13b.5 Confirmed all 4 files' method calls (`getAvailableProductsByCategoryId`,
      `getProductsToSaleByCategoryId`, `createProduct`, `updateProduct`, `deleteProduct`,
      `createCsvProducts`) are on `AsyncProductService` — pure type-clean swap, no bridge needed.
      Dropped the now-unused `ProductOfflineService` import in all 4 files (`ProductCategoryOfflineService`
      import left untouched per scope — no factory exists for it).
- [x] 13b.6 Gate + commit
      `refactor(web-store-pos): route products/sale/egress/available through createProductService factory (complete F.4, Angular DI parity)`.
      All green: 1561/1561 full suite (0 regressions, zero test-mock edits needed — same
      `vi.mock('~/sales/lib/services/product-offline-service', ...)` pattern as WU13 transparently
      backs the factory's offline branch), `tsc --noEmit` clean, `pnpm build` clean.
      Grep-confirmed F.4: zero production `new ProductOfflineService(` remain outside
      `product-service.factory.ts` and test files.

## WU4: Remove `ProductOfflineService`'s sync method BODIES — Req: Exact-Surface Rule, design.md cleanup

`apps/web-store-pos/app/sales/lib/services/product-offline-service.ts` +
`.../__tests__/product-offline-service.test.ts`. **Must land AFTER WU7-WU13** (grep-confirm zero
remaining callers first).

- [x] 4.1 Grep-confirm zero remaining callers of `.getAll()`/`.getById()`/`.getByBarcode()`/
      `.create()`/`.update()`/`.delete()` on any `ProductOfflineService`/`ProductService`-typed
      variable under `apps/web-store-pos/app` (excluding this file's own now-dead bodies and the
      repository layer, which keeps its own same-named sync members by design).
      Grep-confirmed: `rg "product(Service|Svc)\.(getAll|getById|getByBarcode|create|update|delete)\("`
      across all production (non-test) files under `apps/web-store-pos/app` returned zero matches;
      the only 2 textual hits (`available.tsx`) are comments documenting the WU10 removal, not
      live calls. `cart-shell.tsx`'s `orderService.create(...)` and `products.tsx`'s
      `next.delete(categoryId)` (a `Set.delete`) are unrelated identifiers, confirmed by reading
      both call sites.
- [x] 4.2 GREEN: removed `getAll`/`getById`/`getByBarcode`/`create`/`update`/`delete` method
      bodies; removed the module-level `const repo = new BaseRepository<Product>(...)` and the
      `generateId`/`getCurrentUserLogin` imports (confirmed unused — the async methods delegate
      to `ProductRepository`, which owns its own audit-stamping).
- [x] 4.3 GREEN: removed the `PROD-01`/`PROD-02`/`PROD-04`/`PROD-05`/`PROD-06` sync-method
      describe blocks from `product-offline-service.test.ts`. Several OTHER blocks (`PROD-08`,
      `PROD-14`, `PROD-15`, `PROD-16`, `PROD-19`) had used `service.create()`/`service.getById()`
      purely as SETUP/assertion helpers (not testing the sync surface itself) — rewired those to
      construct explicit `ProductRepository`/`ProductCategoryRepository` instances and call
      `productRepository.addProduct(...)`/`getProductById(...)` directly, matching the pattern
      already used by `PROD-10`/`PROD-11`/etc. Dropped the now-fully-unused `makeProduct` helper
      and its `Product` import (only consumer was the removed `create`-based setup calls).
- [x] 4.4 GREEN: rewrote the class doc comment — the "legacy sync surface ... intentionally STAYS
      alive" paragraph now states the surface has been fully retired, with the WU4 grep-confirm
      cross-referenced.
- [x] 4.5 Gate + commit
      `refactor(web-store-pos): remove ProductOfflineService's dead sync surface (getAll/getById/getByBarcode/create/update/delete) and its backing repo const`.
      All green: full web-store-pos suite 1540/1540 (0 regressions vs the 1561 baseline — delta is
      test-count reduction from removed sync-surface describe blocks, not failures), `tsc --noEmit`
      clean, `pnpm build` clean. Commit `5edbda6`.

## WU5: Remove `ProductCategoryOfflineService`'s sync method BODIES — Req: Exact-Surface Rule, Flag #3

`apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts` +
`.../__tests__/product-category-offline-service.test.ts`. **Must land AFTER WU7/WU10/WU11/WU12**.

- [x] 5.1 Grep-confirm zero remaining callers of `.getAll()`/`.getById()`/`.delete()` on any
      `ProductCategoryOfflineService`/`ProductCategoryService`-typed variable under
      `apps/web-store-pos/app`. Grep-confirmed: `rg "category(Service|Svc)\.(getAll|getById|delete)\("`
      returned only 1 hit (`available.tsx`), a comment documenting the WU10 removal, not a live
      call. WU7-WU10 already re-expressed all 4 route files off `categorySvc.getAll()`; WU12
      re-pointed `order-offline-service.ts` to `ProductCategoryRepository` directly.
- [x] 5.2 GREEN: removed `getAll`/`getById`/`delete` method bodies; removed the module-level
      `const repo = new BaseRepository<ProductCategory>(...)` (confirmed unused).
- [x] 5.3 GREEN: removed the `CAT-03` (getAll) and `CAT-05` (delete) describe blocks. `CAT-01`,
      `CAT-02`, `CAT-10`, `CAT-11`, `CAT-12`, and the `getProductCategories` block had used
      `service.getAll()`/`service.getById()` purely as setup/assertion helpers — rewired those to
      an explicit `categoryRepository` instance (constructed in `beforeEach`, injected into the
      service) calling `getProductCategories()`/`getProductCategoryById()` directly. Added a new
      assertion to the "removed methods" block confirming `getAll`/`getById`/`delete` are now
      `undefined` on the service instance.
- [x] 5.4 GREEN: rewrote the class doc comment (same treatment as WU4.4), also recording the
      Flag #3 grep-confirm (zero call sites for the local `delete` override, never ported from
      Angular).
- [x] 5.5 Gate + commit
      `refactor(web-store-pos): remove ProductCategoryOfflineService's dead sync surface (getAll/getById/delete) and its backing repo const (Flag #3)`.
      All green: full web-store-pos suite 1540/1540 (0 regressions), `tsc --noEmit` clean,
      `pnpm build` clean. Commit `dc4ae4a` (amended in-session to fold in the tasks-file markup;
      earlier note said `2c180a1`, the pre-amend hash — `dc4ae4a` is authoritative).

## Final: Slice 8 / Phase 2 Regression Gate — PASS (all gates green, 2026-07-09)

- [x] F.1 Grep-confirm `extends BaseService` no longer appears in either
      `packages/domain/src/services/product-service.ts` or
      `packages/domain/src/services/product-category-service.ts`.
      CONFIRMED: zero `interface … extends BaseService` declarations (only historical doc-comment
      mentions remain, expected).
- [x] F.2 Grep-confirm zero remaining `.getAll()`/`.getById()`/`.getByBarcode()`/`.create()`/
      `.update()`/`.delete()` calls against `ProductOfflineService`/`ProductCategoryOfflineService`/
      `ProductService`/`ProductCategoryService`-typed values anywhere under `apps/web-store-pos/app`
      (repository-layer same-named sync members are OUT of this check — they're a different,
      intentional surface).
      CONFIRMED: zero live calls (only 2 comment lines in `available.tsx` documenting WU10's removal).
- [x] F.3 Grep-confirm `AsyncProductService` no longer exists anywhere.
      CONFIRMED: zero type/code usages (2 doc-comment mentions documenting the retirement remain).
- [x] F.4 Grep-confirm no `new ProductOfflineService(` remains outside
      `product-service.factory.ts`, `product-offline-service.ts` itself, and test files — all
      production call sites route through `createProductService(storeId)`.
      CONFIRMED: zero production sites outside the factory (7 total sites migrated: WU13's 3 +
      WU13b's 4 route files; the "9" in the original forecast was an over-count).
- [x] F.5 Grep-confirm no residual `upsert`/`remove` on `ProductRepository`/
      `ProductCategoryRepository` (regression check, should already be clean since Phase 1).
      CONFIRMED: zero (only doc-comment mentions of "no upsert/remove").
- [x] F.6 Confirm `product-repository.ts`'s `categoryRepository` param is STILL optional
      (untouched — deferred to step 9).
      CONFIRMED: `categoryRepository?: ProductCategoryRepository` with
      `?? new ProductCategoryRepository(storeId)` default — untouched.
- [x] F.7 Full gate — domain: `pnpm -C packages/domain exec vitest run`, `tsc --noEmit`, build.
      web-store-pos: `pnpm -C apps/web-store-pos exec vitest run`, `tsc --noEmit`, `pnpm build` —
      all green.
      RESULT: domain 95/95 + tsc clean + build clean; web-store-pos 1540/1540 + tsc clean + build clean.
- [x] F.8 Update this file with commit hashes; record the ratified Flag #1/#2/#3 resolutions.

### Slice 8 commit ledger (feat/frontend-parity-audit, commits-only, not pushed)

| WU | Commit | Subject |
|----|--------|---------|
| (pre) factory | `0841792` | add createProductService factory |
| WU7 products.tsx | `9032140` | re-express products.tsx loadData (getProductCategoriesView + per-category) |
| WU8 sale.tsx | `ad7fc5e` | re-express sale.tsx to category-scoped async surface |
| WU9 egress.tsx | `b0ed531` | re-express egress.tsx to category-scoped async surface |
| WU10 available.tsx | `dd9e327` | re-express available.tsx to async getProductCategories + per-category |
| WU8 test-gap fix | `ae68317` | add async methods to sales-routes smoke mocks (close WU8 red suite) |
| WU11 data-serializer | `5c3a7d9` | re-point DataSerializerService to repositories (Flag #2, raw JSON pass-through) |
| WU12 order-offline | `bb966be` | re-point OrderOfflineService.getCategoryCartItemsView to ProductCategoryRepository |
| WU13 factory rewire (3) | `7c53b28` | rewire cart-shell/user-home/edit-inventory-entry-modal to factory |
| WU13b factory rewire (4 routes) | `3f7bd4c` | route products/sale/egress/available through factory (complete F.4) |
| WU1 ProductService trim | `40fa5aa` | drop extends BaseService<Product> + sync getByBarcode/update |
| WU2 ProductCategoryService trim | `5a9d355` | drop extends BaseService<ProductCategory> (Flag #3) |
| WU3 alias retire | `12069d4` | retire AsyncProductService alias |
| WU4 remove product sync bodies | `5edbda6` | remove ProductOfflineService dead sync surface |
| WU5 remove category sync bodies | `dc4ae4a` | remove ProductCategoryOfflineService dead sync surface (Flag #3) |

### Ratified flag resolutions (historical record)

- **Flag #1 (RESOLVED)** — the 4 routes (products/sale/egress/available) had no async "flat getAll"
  to bridge to; each was re-expressed per its Angular-source-grounded design (category-scoped async
  fetches, per-category `Promise.all`). Landed WU7-WU10. No bridge method invented.
- **Flag #2 (RESOLVED)** — `DataSerializerService` re-pointed to `ProductRepository`/
  `ProductCategoryRepository` with raw `getCategoriesJson()`/`getProductsJson()` pass-through
  (Angular-faithful, more so than the prior re-derived impl). One documented deviation: a `?? '[]'`
  null-guard added per angular-bugs-policy (Angular's own `getXJson()` returns `string | null`
  unguarded → `"null"` re-import crash); covered by a new regression test. Landed WU11.
- **Flag #3 (RESOLVED)** — `ProductCategoryService` dropped `extends BaseService`; recorded the
  correction that Angular's inherited category `delete` DOES have a call site
  (`products.component.ts:89`) but is non-functional offline, so React's DROP (zero call sites,
  never ported) is still correct. Landed WU2 + WU5.

## Remaining after this slice (Phase 2 / product-service-parity fully closes)

- Phase 2 step 9: tighten `ProductRepository`'s `categoryRepository` param to mandatory (deferred
  by Phase 1, engram #758; explicitly kept OUT of this slice, see "Non-flag confirmations").
- The cross-cutting generic `BaseService<T>` seam for the OTHER offline services (Inventory,
  Order, Expense, SaleCredit) remains owned by `service-return-shape-parity`, not this change
  (spec.md's Non-goals) — untouched by this slice.
