# Tasks: product-service-parity — Phase 2, Step 6 (ProductOfflineService, 12+2 async category C)

Governs `openspec/changes/product-service-parity/design.md` "Slicing — LAYER-FIRST" §Phase 2
step 6 + `spec.md` "Service Method Signature Parity" / "Offline-Only Public Methods" /
"Repository-vs-Service Ownership Boundary". Depends on Phase 1 (COMPLETE, `100b904`) and Slice 5
(COMPLETE, `2ef9276`): `ProductRepository`/`ProductCategoryRepository` already hold ALL business
rules (validations, order-shift, soft-delete, activate/deactivate) — this slice's service layer is
a THIN envelope-mapping wrapper, not new business logic. Strict TDD: every method/behavior =
RED→GREEN; signature/visibility/return-type changes RED via a SCOPED `tsc --noEmit` on the
affected test file (vitest/esbuild strips types — confirmed gap from Slice 5), run iteratively
(TS2420 "missing member" is masked by TS2416 type-mismatch on the same class — re-run `tsc` after
each partial fix to see the next error, don't trust a single pass). Angular source of truth:
`frontend/src/app/{domain/interfaces/product.service.ts, application/products/
product-offline.service.ts, presentation/products/{products,category-product-list,
edit-product-modal,edit-products-modal,csv-product-importer-modal}.component.ts,
presentation/auth/login/login.component.ts, presentation/inventory/edit-inventory-entry-modal/
edit-inventory-entry-modal.component.ts}`. React target: `packages/domain/src/services/
product-service.ts`, `apps/web-store-pos/app/sales/lib/services/product-offline-service.ts`.
Delivery: commits-only on `feat/frontend-parity-audit`, one commit per work unit, conventional
messages, no PR/branches/stacking, no AI attribution. size-exception pre-approved.

## Commits (landed on feat/frontend-parity-audit, pushed)

WU boundaries were NOT green-in-isolation (WU1 `2898d62` flipped the interface signatures only,
leaving the app tsc red until the concrete bodies flipped in WU3; WU3's `updateMany` removal broke
`products.tsx` until WU4.4). First green snapshot = WU3+WU4 together. Final grouping:

- `2898d62` — WU1: `ProductService` interface + `ProductSelectView`/`CsvProduct` models (earlier session).
- `704b125` — WU3 + WU4: async service surface + removals + `products.tsx` re-expression + CSV barcode rip.
- `9ece02f` — WU5: `cart-shell` quantity-change → `getProductById`.
- `001677a` — WU6: `resolveUserHomePath` → `hasAnyAvailableToSaleProduct` (+ login/loaders callers).
- `dc22b50` — WU7: `edit-inventory-entry-modal` → `getProductsToSelect`, drop Category field.

Verify (sdd-verify, fresh context): PASS WITH WARNINGS — both WARNINGs closed post-verify
(WU4.2/4.3/4.4 route-level RED/GREEN tests backfilled in `products.test.tsx`; this checklist ticked
+ hashes recorded). Engram: `sdd/product-service-parity/verify-report-slice6`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1050-1300 (WU1 ~110; WU2 ~370; WU3 ~430; WU4 ~180; WU5 ~60; WU6 ~70; WU7 ~90; Final ~15) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is commits-only per standing instruction |
| Suggested split | WU1 → WU2 → WU3 → WU4 → WU5 → WU6 → WU7 → Final, one commit per unit |
| Delivery strategy | commits-only (explicit instruction, supersedes ask-on-risk default) |
| Chain strategy | size-exception |

Decision needed before apply: **No — all 5 flags RATIFIED 2026-07-08 (engram #771). Flag #1: KEEP
`extends BaseService` + sync surface this slice, drop only the 5 zero-correlate methods. Flag #2:
DROP CSV barcode (byte-identical `CsvProduct`). Flag #3: hardcode `discountFromInvantory: true`.
Flag #4: DROP the Category display field, swap to `getProductsToSelect()`. Flag #5: `sale.tsx`/
`egress.tsx` stay OUT of scope.**
Chained PRs recommended: No
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Dependency |
|------|------|------------|
| 1 | `ProductService` interface + `ProductSelectView`/`CsvProduct` domain models — ADD 12 async abstract-surface declarations; FLIP `getMaxOrder`/`getAvailableProductsByCategoryId` in place (name collision, can't coexist); REMOVE `getByName`/`activate`/`deactivate` declarations. `extends BaseService<Product>` + `getByBarcode`/`update` STAY (Flag #1) | None (Phase 1 + Slice 5 complete) |
| 2 | `ProductOfflineService` — ADD 8 simple read/orchestration async methods (`hasAnyAvailableToSaleProduct`, `getProductById`, `getProductByBarcode`, `getProductsToSelect`, `deleteProduct`, `getProductsToSaleByCategoryId`, offline-only `getProductsByCategoryId`/`setDiscountFromInvantory`), delegating to Phase-1 `ProductRepository`/`ProductCategoryRepository` | After 1 |
| 3 | `ProductOfflineService` — ADD 4 write/bulk async methods (`createProduct`, `updateProduct`, `createProducts`, `createCsvProducts`) + FLIP `getMaxOrder`/`getAvailableProductsByCategoryId` bodies to async; REMOVE `search`/`updateMany`/`getByName`/`activate`/`deactivate` method bodies (unconditional, spec.md) | After 2 |
| 4 | Re-express `products.tsx` (`handleCreateProduct`→`createProduct`, `handleEditProduct`→`updateProduct`, `handleDeleteProduct`→`deleteProduct`, `handleBulkSave`→loop `updateProduct`, `handleCsvImport`→single `createCsvProducts` call with `{category,name,price}` rows, dropping the React-only CSV barcode column per Flag #2, replacing Slice 5's interim `ProductCategoryRepository` shape) | After 3 |
| 5 | Re-express `cart-shell.tsx`'s `handleQuantityChange` (`getById`→`getProductById`, async) | After 3 |
| 6 | Re-express `user-home.ts`'s `resolveUserHomePath` (`getAll`→`hasAnyAvailableToSaleProduct`, async) + its 2 callers (`login.tsx`, `auth/routes/loaders.ts`) | After 3 |
| 7 | `edit-inventory-entry-modal.tsx` (`getAll`→`getProductsToSelect`) — swap list source to `ProductSelectView` AND drop the React-only Category display field (Flag #4 RATIFIED, option (a)) | After 3 |
| Final | Regression gate: confirm removed methods gone, `getAll()`-based deferred call sites unbroken, full test/build gate | After 4, 5, 6, (7) |

## Flagged mismatches / decisions — ALL RATIFIED 2026-07-08 (engram #771)

1. **[RATIFIED — KEEP this slice] `extends BaseService` drop + old-sync-surface removal timing — design.md
   self-contradicts, SAME class of issue as Slice 5's Flag #1.** `tasks-phase1-repo-di.md`'s
   Phase-2 outline (step 6) literally says `ProductOfflineService "(+ interface, drops `extends
   BaseService`)"` and "remove React-only search/updateMany/getByName/activate/deactivate/old
   sync create/update/delete/getAll/getById" — ALL at step 6. But `design.md`'s own Decision
   section ("`ProductService` becomes standalone async... the `extends` and old members are
   removed in the cleanup slice (Phase 2, step 8)") and the "Additive coexistence migration"
   Decision ("the new async Angular-named surface is added ALONGSIDE the existing sync methods...
   the dead sync surface is removed in the FINAL slice") both name **step 8**, not step 6. Slice 5
   already resolved the identical contradiction for Category by KEEPING `extends BaseService` +
   `getAll`/`getById`/`delete` alive through its slice (user-ratified, engram #761).
   **This tasks file proposes the SAME resolution for symmetry: KEEP `extends
   BaseService<Product>` + `getAll`/`getById`/`delete`/`create`/`update`/`getByBarcode` ALIVE
   through this slice (WU1-WU3 add/flip/remove only the methods spec.md unconditionally lists —
   `search`/`updateMany`/`getByName`/`activate`/`deactivate`, all 5 with zero Angular correlate at
   ANY layer), defer the `extends` drop + full old-sync-surface removal to step 8** — because (a)
   it matches the Decision-section language naming step 8, (b) it matches Slice 5's precedent
   exactly, (c) `create`/`update`/`getByBarcode`/`getAll`/`getById` have real remaining call sites
   in this codebase (`products.tsx` `loadData`, `sale.tsx`, `egress.tsx`, `available.tsx`,
   `edit-inventory-entry-modal.tsx`, `import.tsx`/`export.tsx`) that would otherwise need
   re-pointing in THIS slice, ballooning scope well past WU4-WU7 below. **RATIFIED (engram #771):
   KEEP `extends BaseService<Product>` + `create`/`update`/`delete`/`getAll`/`getById`/
   `getByBarcode` alive through this slice; remove ONLY the 5 zero-correlate methods
   (`search`/`updateMany`/`getByName`/`activate`/`deactivate`); defer the `extends` drop + full
   old-sync-surface removal to step 8.** design.md's step-6 text is to be reconciled to name step 8
   (same as Slice 5's precedent).
2. **[RATIFIED — DROP CSV barcode] Angular's `CsvProduct` model has NO `barcode`, React's parser
   did.** Angular's `CsvProduct` (csv-product.model.ts) is `{category, name, price}` — no
   barcode — and `createCsvProducts`'s repo call never passes one. React's existing
   `ParsedProductRow`/CSV parser (`csv-product-parser.ts`) captured an OPTIONAL `barcode?` column
   and `products.tsx`'s Slice-5-interim `handleCsvImport` passed it through to
   `productService.create(...)`. **RATIFIED (engram #771): DROP the React-only `barcode` column
   from CSV import entirely — the ported `packages/domain` `CsvProduct` is byte-identical to
   Angular's `{category, name, price}` (already shipped correctly in WU1 commit `2898d62`,
   `csv-product.ts` has no barcode field). Strict parity over feature preservation — accepts the
   loss of the shipped React-only CSV-barcode capability.** Consequences for this slice: WU3.7
   `createCsvProducts` passes NO barcode to `addProduct`; WU4.5's `handleCsvImport` maps rows to
   `{category, name, price}` only; the `barcode?` column in `csv-product-parser.ts` is dropped
   from the CSV-import path (see WU4.5).
3. **`createCsvProducts`/`createProducts` MUST hardcode `discountFromInvantory: true`** (Angular
   product-offline.service.ts:68,80 — `addProduct(..., true, true, true)`, the LAST arg), which
   is a genuine PARITY FIX vs. the current React `handleCsvImport`'s `discountFromInvantory:
   false`. This is a required correction (mirror Angular exactly), not a flag — noted here only
   so WU3/WU4 don't "preserve" the current `false` value as if it were intentional.
4. **[RATIFIED — DROP Category field, option (a)] `edit-inventory-entry-modal.tsx`'s "Category"
   field has NO Angular correlate at all.** Angular's real `EditInventoryEntryModalComponent` has no category
   display/field whatsoever — it only shows `productId`/`quantity`/`costPrice` and loads its
   product dropdown via `productService.getProductsToSelect()` (confirmed source read), which
   returns `ProductSelectView[]` = `{id, fullName}` ONLY (no `categoryId`). React's version adds
   a read-only "Category" text field auto-filled from `products.find(p => p.id ===
   productId)?.categoryId` — a React-only UI addition. Swapping the product list source to
   `getProductsToSelect()` (spec.md's named Call-Site Parity item: "getProductsToSelect
   (inventory entry modal)") would remove access to `categoryId`, breaking that auto-fill.
   Separately, `EditInventoryEntryInput.categoryId` flows into `InventoryOfflineService.create`'s
   OPTIONAL `categoryId` param (default `''`) which Angular's own `createInventoryEntry` doesn't
   even accept (3-arg call site) — so functionally the categoryId isn't load-bearing beyond the
   UI display. **RATIFIED (engram #771): option (a) — full parity. Swap the product list source to
   `getProductsToSelect()`/`ProductSelectView` (`{id, fullName}`, no categoryId) AND DROP the
   read-only Category display field entirely (Angular never had it; not a regression from
   Angular's perspective). NO secondary `getProductById` lookup.** WU7 below is now fully detailed
   to remove the field (path (a)).
5. **[RATIFIED — OUT of scope] `sale.tsx`/`egress.tsx` (sales routes) full re-expression to
   `getProductsToSaleByCategoryId` stays OUT of this slice's WU list (engram #771).** Both currently
   `productService.getAll()` once on mount and derive `categoryProducts` via a client-side filter
   (`isActive && availableToSale`, sorted by order) that is already commented as "Angular:
   getProductsToSaleByCategoryId" — i.e. the divergence (bulk load + client filter vs. a
   per-category service call) pre-exists this slice, same class as Slice 5's Flag #4
   (`products.tsx` category-accordion divergence, explicitly left unfixed there). Forcing a true
   per-selected-category async fetch would restructure both routes' data-loading model (loading
   states, refetch-on-category-change) — a UI-architecture change beyond "service
   reconciliation". **Left OUT of WU1-WU7**; `sale.tsx`/`egress.tsx` keep calling `getAll()`
   (deferred, consistent with Flag #1). Flagged for a future dedicated call-site-parity task if
   the user wants it pulled forward.
6. **`ProductOfflineService`'s constructor gains an OPTIONAL `productRepository`/
   `categoryRepository` pair**, matching the ratified Phase 1 pattern (engram #758) and Slice 5's
   WU2 (engram-adjacent, Flag #6 there): `constructor(private readonly storeId: string,
   productRepository?: ProductRepository, categoryRepository?: ProductCategoryRepository)`, each
   defaulting to `new X(storeId)` when omitted — keeps the ~9 existing single-arg `new
   ProductOfflineService(storeId)` call sites compiling unchanged. The OLD sync methods
   (`create`/`update`/`delete`/`getAll`/`getById`/`getByBarcode`/`search` if it stays per Flag
   #1) keep using their own private module-level `repo` (unchanged, untouched) — the NEW async
   methods use the injected repositories. Both point at the same `'products'` storage key, so
   this is not a data-integrity risk (same reasoning as Phase 1/Slice 5).
7. **`available.tsx` and `import.tsx`/`export.tsx`'s `productSvc` reader stay on `getAll()`** for
   this slice, consistent with Flag #1's minimal-churn resolution — neither is in spec.md's named
   Call-Site Parity list, and neither calls a method this slice removes.
   (`edit-inventory-entry-modal.tsx` DOES swap off `getAll()` → `getProductsToSelect()` in WU7 per
   Flag #4 RATIFIED — it IS a named Call-Site Parity item.)

## WU1: `ProductService` interface + domain models — Req: "Service Method Signature Parity", "Offline-Only Public Methods"

**[COMMITTED — `2898d62`]** `packages/domain/src/services/product-service.ts`,
`packages/domain/src/models/product.ts` (add `ProductSelectView { id: string; fullName: string }`),
new `packages/domain/src/models/csv-product.ts` (`CsvProduct { category: string; name: string;
price: number }` — byte-identical to Angular, NO `barcode` per Flag #2 RATIFIED). Export both from
`packages/domain/src/index.ts`. Per Flag #1, `extends BaseService<Product>` and
`getByBarcode`/`update` member declarations STAY.

Test file: `packages/domain/src/services/__tests__/product-service.test.ts` (rewrite fake to
match; scoped `tsc --noEmit` on this file is the real gate for signature-shape assertions).

- [x] 1.1 RED/GREEN: add `ProductSelectView` to `models/product.ts`; add `CsvProduct` to new
      `models/csv-product.ts`; export both from `index.ts`.
- [x] 1.2 RED/GREEN: interface declares `hasAnyAvailableToSaleProduct():
      Promise<BaseResponseModel<boolean>>`, `getProductById(id): Promise<BaseResponseModel<Product>>`,
      `getProductByBarcode(barcode): Promise<BaseResponseModel<Product>>`.
- [x] 1.3 RED/GREEN: `getProductsToSelect(): Promise<BaseResponseModel<ProductSelectView[]>>`,
      `deleteProduct(id): Promise<BaseResponseModel<boolean>>`,
      `createCsvProducts(csvProducts: CsvProduct[]): Promise<BaseResponseModel<boolean>>`.
- [x] 1.4 RED/GREEN: `getProductsToSaleByCategoryId(categoryId):
      Promise<BaseResponseModel<Product[]>>`, `createProduct(...9 args):
      Promise<BaseResponseModel<boolean>>`, `updateProduct(...10 args):
      Promise<BaseResponseModel<boolean>>`, `createProducts(categoryId, items: {name,price}[]):
      Promise<BaseResponseModel<boolean>>`.
- [x] 1.5 RED/GREEN: FLIP `getMaxOrder(categoryId): number` →
      `getMaxOrder(categoryId): Promise<BaseResponseModel<number>>` (signature change in place,
      same name — confirm `tsc --noEmit` catches every un-migrated caller).
- [x] 1.6 RED/GREEN: FLIP `getAvailableProductsByCategoryId(categoryId): Product[]` →
      `Promise<BaseResponseModel<Product[]>>` (same-name signature change).
- [x] 1.7 GREEN: remove `getByName`/`activate`/`deactivate` member declarations (spec.md
      unconditional removal list — zero Angular service correlate).
- [x] 1.8 GREEN: `extends BaseService<Product>`, `getByBarcode`, `update` member declarations
      STAY unchanged (Flag #1).
- [x] 1.9 Gate: `pnpm -C packages/domain test`, `pnpm -C packages/domain exec tsc --noEmit`,
      `pnpm -C packages/domain build`; commit
      `feat(domain): add async ProductService 12-method surface (getMaxOrder/getAvailableProductsByCategoryId flipped in place), ProductSelectView/CsvProduct models, remove getByName/activate/deactivate`.

## WU2: `ProductOfflineService` — 8 simple read/orchestration methods — Req: "Async Contract", "Offline-Only Public Methods", "hasAnyAvailableToSaleProduct", "getProductsToSelect", "getProductsByCategoryId", "setDiscountFromInvantory"

`apps/web-store-pos/app/sales/lib/services/product-offline-service.ts`. Constructor gains
`productRepository?: ProductRepository, categoryRepository?: ProductCategoryRepository` (Flag
#6). Test file: `.../services/__tests__/product-offline-service.test.ts` — ADD new describe
blocks only (no removals yet, that's WU3).

- [x] 2.1 RED/GREEN: `hasAnyAvailableToSaleProduct()` — delegates
      `productRepository.hasAnyAvailableToSaleProduct()`, always
      `Promise.resolve(success(...))`.
- [x] 2.2 RED/GREEN: `getProductById(id)` — `productRepository.getProductById(id)`; found →
      Success; missing → `Failure([ProductErrors.NotExists])`.
- [x] 2.3 RED/GREEN: `getProductByBarcode(barcode)` — same shape via
      `productRepository.getProductByBarcode`.
- [x] 2.4 RED/GREEN: `deleteProduct(id)` — `Success(productRepository.deleteProduct(id))` (always
      resolves true/false, never fails per repo contract).
- [x] 2.5 RED/GREEN: `getProductsToSaleByCategoryId(categoryId)` — delegates
      `productRepository.getAvailableToSaleProductsByCategoryId(categoryId)`, mirror Angular's
      REDUNDANT second `.filter(p => p.availableToSale)` (ANGULAR-BUG-SUSPECT #3, do not
      simplify), `Success$` always.
- [x] 2.6 RED/GREEN: offline-only `getProductsByCategoryId(categoryId)` (NOT on the interface) —
      delegates `productRepository.getProductsByCategoryId(categoryId)`, unfiltered by state,
      `Success([])` when empty (never fails).
- [x] 2.7 RED/GREEN: offline-only `setDiscountFromInvantory(id, flag)` (NOT on the interface) —
      delegates `productRepository.setDiscountFromInvantory`, Result→Success/Failure mapping.
- [x] 2.8 RED/GREEN: `getProductsToSelect()` — groups `productRepository.getAvailableProducts()`
      by category in `categoryRepository.getProductCategories()` iteration order, sorted by
      product `order` within each category, maps to `{id, fullName: categoryName + ' - ' +
      name}` (1:1 port of product-offline.service.ts:133-157).
- [x] 2.9 Gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`,
      `pnpm -C apps/web-store-pos build`; commit
      `feat(web-store-pos): add ProductOfflineService async read/orchestration methods (hasAnyAvailableToSaleProduct/getProductById/getProductByBarcode/deleteProduct/getProductsToSaleByCategoryId/getProductsByCategoryId/setDiscountFromInvantory/getProductsToSelect)`.

## WU3: `ProductOfflineService` — write/bulk methods + 2 signature flips + 5 removals — Req: "Category-Exists Validation", "Order-Shift on Create/Update", "createProducts", "createCsvProducts", "Repository-vs-Service Ownership Boundary"

Same files as WU2, continued.

- [x] 3.1 RED/GREEN: `createProduct(...9 args)` — delegates `productRepository.addProduct(...)`,
      Result→Success(true)/Failure(result.errors) mapping (1:1 port of
      product-offline.service.ts:39-62).
- [x] 3.2 RED/GREEN: `updateProduct(...10 args)` — delegates `productRepository.updateProduct(...)`,
      same mapping.
- [x] 3.3 RED/GREEN: private `getNextOrder(categoryId)` helper —
      `Math.max(...productRepository.getProductsByCategoryId(categoryId).map(p => p.order), 0) + 1`
      (1:1 port, product-offline.service.ts:164-167).
- [x] 3.4 RED/GREEN: FLIP `getMaxOrder(categoryId)` body to async — delegates
      `productRepository.getProductsByCategoryId(categoryId)` + `Math.max(...,0)`,
      `Success(...)`. Update PROD-10's existing sync test to await the new signature.
- [x] 3.5 RED/GREEN: FLIP `getAvailableProductsByCategoryId(categoryId)` body to async —
      delegates `productRepository.getProductsByCategoryId(categoryId)` filtered `.isActive`,
      `Success(...)`. Update PROD-11's existing sync test to await the new signature.
- [x] 3.6 RED/GREEN: `createProducts(categoryId, items)` — per-item `getNextOrder` BEFORE each
      `addProduct` call (sequential increasing orders within one call), hardcoded
      `isActive:true, availableToSale:true, discountFromInvantory:true, businessId:''`
      (Flag #3); per-item failure sets `hasError`, overall `Failure([])` on any failure
      (ANGULAR-BUG-SUSPECT #1, empty errors array, mirror do-not-fix).
- [x] 3.7 RED/GREEN: `createCsvProducts(csvProducts)` — per row, resolve category via
      `categoryRepository.getProductCategoryByName`, create via
      `categoryRepository.addProductCategoryByName` if absent; `getNextOrder` + `addProduct`
      with the SAME hardcoded flags as 3.6 (Flag #3); NO barcode passed (Flag #2 RATIFIED — DROP);
      same `Failure([])`-on-any-failure shape (ANGULAR-BUG-SUSPECT #1).
- [x] 3.8 GREEN: remove `search`/`updateMany`/`getByName`/`activate`/`deactivate` method bodies
      from the concrete class (unconditional, spec.md — zero Angular correlate at any layer).
- [x] 3.9 GREEN: `create`/`update`/`delete`/`getAll`/`getById`/`getByBarcode` bodies stay EXACTLY
      as-is (Flag #1) — no changes, still backed by the private module-level `repo`.
- [x] 3.10 Confirm class still `implements ProductService` cleanly against WU1's updated
      interface (`tsc --noEmit` is the real gate — vitest alone won't catch a missing/mistyped
      async member).
- [x] 3.11 Update `product-offline-service.test.ts`: remove PROD-07 (search)/PROD-09
      (getByName)/PROD-12 (activate/deactivate) describe blocks entirely; PROD-03 (updateMany)
      describe block removed (re-expressed as a call-site loop in WU4, not a service method);
      PROD-01/02/04/05/06/08 (create/getByBarcode/getAll/update/delete/storage-key) untouched.
- [x] 3.12 Gate: `pnpm test`, `tsc --noEmit`, `pnpm build`; commit
      `feat(web-store-pos): add ProductOfflineService createProduct/updateProduct/createProducts/createCsvProducts, flip getMaxOrder/getAvailableProductsByCategoryId to async, remove search/updateMany/getByName/activate/deactivate`.

## WU4: Re-express `products.tsx` — Req: "Call-Site Parity" (createCsvProducts), spec.md resolved decision #3 (updateMany)

`apps/web-store-pos/app/sales/routes/products.tsx` + `.../__tests__/products.test.tsx`.
`loadData`'s `productService.getAll()`/`categoryService.getAll()` STAY unchanged (Flag #1/#7).

- [x] 4.1 RED/GREEN: `handleCreateProduct` becomes `async`; replace `productService.create({...})`
      with `await productService.createProduct(data.categoryId, data.name, data.price,
      /*businessId*/ '', /*order*/ 1, /*isActive*/ true, data.availableToSale,
      data.discountFromInvantory, data.barcode)`; on `!result.succeeded`, surface the failure
      (match `handleCategorySave`'s `showBlockingError` pattern already in this file — do not
      silently swallow).
- [x] 4.2 RED/GREEN: `handleEditProduct` becomes `async`; replace `productService.update(product)`
      with `await productService.updateProduct(product.id, product.categoryId, product.name,
      product.price, product.businessId, product.order, product.isActive,
      product.availableToSale, product.discountFromInvantory, product.barcode)`; same failure
      surfacing.
- [x] 4.3 RED/GREEN: `handleDeleteProduct` becomes `async`; replace `productService.delete(id)`
      with `await productService.deleteProduct(id)`; same failure surfacing (or silent — match
      existing UX for delete-confirm flows if a stricter pattern exists elsewhere in the app).
- [x] 4.4 RED/GREEN: `handleBulkSave` becomes `async`; replace `productService.updateMany(...)`
      with a loop: `for (const p of updatedProducts) await productService.updateProduct(p.id,
      p.categoryId, p.name, p.price, p.businessId, p.order, p.isActive, p.availableToSale,
      p.discountFromInvantory, p.barcode)` (spec.md resolved decision #3 — bulk price-edit UI
      feature unchanged, only the service call re-expressed).
- [x] 4.5 RED/GREEN — **Flag #2 RATIFIED (DROP barcode)**: `handleCsvImport` collapses to a single
      `await productService.createCsvProducts(rows)` call, where each row is mapped to
      `{category, name, price}` ONLY (drop the `barcode?` field from the parsed rows — remove the
      barcode column from the CSV-import path in `csv-product-parser.ts`/its consumer). REMOVE the
      Slice-5-interim manual loop + direct `ProductCategoryRepository` calls entirely (category
      resolution/creation now happens INSIDE `createCsvProducts`). Rewrite the "handleCsvImport —
      interim ProductCategoryRepository call site" describe block in `products.test.tsx` to assert
      `productService.createCsvProducts` was called with the parsed `{category,name,price}` rows,
      and drop any assertion on a barcode column.
- [x] 4.6 Gate: `pnpm test`, `tsc --noEmit`, `pnpm build`; commit
      `refactor(web-store-pos): re-express products.tsx create/edit/delete/bulk/CSV against the async ProductOfflineService surface`.

## WU5: Re-express `cart-shell.tsx` — Req: "Call-Site Parity" (getProductById, shopping cart)

`apps/web-store-pos/app/shared/components/cart-shell.tsx` + `.../__tests__/cart-shell.test.tsx`.

- [x] 5.1 RED/GREEN: `handleQuantityChange` becomes `async`; replace
      `productService.getById(productId)` with `const result =
      await productService.getProductById(productId); const product = result.succeeded ?
      result.data : undefined;`. Its two `onClick` callers (`() =>
      handleQuantityChange(...)`) need no wrapper change — a fire-and-forget async handler is
      already an established pattern in this file (`handleCreateOrder`).
- [x] 5.2 Gate: `pnpm test`, `tsc --noEmit`, `pnpm build`; commit
      `refactor(web-store-pos): re-express cart-shell.tsx quantity-change product lookup against ProductOfflineService.getProductById`.

## WU6: Re-express `user-home.ts` + callers — Req: "Call-Site Parity" (hasAnyAvailableToSaleProduct, login gate)

`apps/web-store-pos/app/shared/lib/auth/user-home.ts`,
`apps/web-store-pos/app/auth/routes/login.tsx`, `apps/web-store-pos/app/auth/routes/loaders.ts` +
their tests.

- [x] 6.1 RED/GREEN: `resolveUserHomePath` becomes `async function ...: Promise<string>`; replace
      the two-step `ProductCategoryOfflineService(storeId).getAll().some(isActive)` +
      `ProductOfflineService(storeId).getAll().some(...)` with a SINGLE
      `await new ProductOfflineService(storeId).hasAnyAvailableToSaleProduct()` call (mirrors
      Angular's `login.component.ts:184`, which calls only `productService
      .hasAnyAvailableToSaleProduct()` — the category-availability check is already INSIDE
      `ProductRepository.hasAnyAvailableToSaleProduct` per Phase 1 WU3.4, so the standalone
      `ProductCategoryOfflineService` call becomes redundant and is dropped); drop the now-unused
      `ProductCategoryOfflineService` import.
- [x] 6.2 GREEN: `login.tsx:61` → `navigate(await resolveUserHomePath(user))` (already inside an
      `async handleSubmit`, no wrapper change needed).
- [x] 6.3 GREEN: `auth/routes/loaders.ts:32` → `return redirect(await resolveUserHomePath(user))`
      (already inside `async guestOnlyLoader`, no wrapper change needed).
- [x] 6.4 Update `user-home.test.ts` (mock `hasAnyAvailableToSaleProduct` instead of `getAll`
      twice) and any `login.test.tsx`/loader test asserting the sync call shape.
- [x] 6.5 Gate: `pnpm test`, `tsc --noEmit`, `pnpm build`; commit
      `refactor(web-store-pos): re-express resolveUserHomePath against ProductOfflineService.hasAnyAvailableToSaleProduct`.

## WU7 — Re-express `edit-inventory-entry-modal.tsx` (Flag #4 RATIFIED, option (a)) — Req: "Call-Site Parity" (getProductsToSelect, inventory entry modal)

`apps/web-store-pos/app/inventory/.../edit-inventory-entry-modal.tsx` (+ its test) and any route
caller/`EditInventoryEntryInput` consumer affected by dropping `categoryId`. Full-parity path (a):
swap the product list source to `getProductsToSelect()`/`ProductSelectView` AND DROP the read-only
Category display field entirely. NO secondary `getProductById` lookup.

- [x] 7.1 RED/GREEN: replace the product-list load (`productService.getAll()` → derive options)
      with `const result = await productService.getProductsToSelect();` inside the existing async
      load effect; render the `<select>` options from `ProductSelectView[]` (`value={id}`,
      label=`fullName`) instead of the current `Product[]`-derived options.
- [x] 7.2 GREEN: remove the read-only "Category" input block and its
      `categoryId`/`selectedCategory` derivation (`products.find(p => p.id === productId)?.categoryId`)
      entirely — `ProductSelectView` has no `categoryId`.
- [x] 7.3 GREEN: drop `categoryId` from `EditInventoryEntryInput` if it becomes unused, and update
      `handleSave` + the route caller / `InventoryOfflineService.create` call site accordingly
      (Angular's `createInventoryEntry` is a 3-arg call with no categoryId — this converges to it).
- [x] 7.4 Update the modal's test: mock `getProductsToSelect` (returns `{id, fullName}[]`) instead
      of `getAll`; drop any assertion on the Category display field.
- [x] 7.5 Gate: `pnpm test`, `tsc --noEmit`, `pnpm build`; commit
      `refactor(web-store-pos): re-express edit-inventory-entry-modal product list against ProductOfflineService.getProductsToSelect, drop React-only Category field`.

## Final: Slice 6 Regression Gate

- [x] 8.1 Grep-confirm `search`/`updateMany`/`getByName`/`activate`/`deactivate` no longer exist
      on `apps/web-store-pos/app/sales/lib/services/product-offline-service.ts` or
      `packages/domain/src/services/product-service.ts`.
- [x] 8.2 Grep-confirm zero remaining call sites reference the five removed methods anywhere
      under `apps/web-store-pos/app`.
- [x] 8.3 Confirm `ProductOfflineService`'s constructor accepts optional
      `productRepository`/`categoryRepository` (Flag #6) and every existing single-arg
      `new ProductOfflineService(storeId)` call site still compiles.
- [x] 8.4 Confirm the Flag-#1-deferred surface (`extends BaseService`,
      `create`/`update`/`delete`/`getAll`/`getById`/`getByBarcode`) is UNCHANGED and its
      remaining call sites (`sale.tsx`, `egress.tsx`, `available.tsx`, `import.tsx`/`export.tsx`,
      `products.tsx` `loadData`) still compile and pass. (`edit-inventory-entry-modal.tsx` is NO
      LONGER on this list — WU7 swapped it to `getProductsToSelect()` per Flag #4 RATIFIED.)
- [x] 8.5 Full gate — domain: `pnpm test`, `tsc --noEmit`, build. web-store-pos: `pnpm test`,
      `tsc --noEmit`, `pnpm build` — all green.
- [x] 8.6 Update this file with commit hashes; record the confirmed resolution of Flags #1, #2,
      #4 at the top of the Flagged section for the historical record.

## Deferred to Phase 2 step 7 / step 8 (do NOT pull into this slice)

- `ProductOnlineService` (createProduct omits barcode, `ANGULAR-BUG-SUSPECT #4`; no
  `setDiscountFromInvantory`/`getProductsByCategoryId`) + `product-service.factory.ts` — step 7.
- `extends BaseService` drop + `getAll`/`getById`/`delete`/`create`/`update`/`getByBarcode`
  removal on BOTH `ProductService` and `ProductCategoryService`, plus Slice 5's Flag #7
  sync-layer (`import.tsx`/`export.tsx`/`data-serializer-service.ts`/`order-offline-service.ts`)
  repository re-point, plus this slice's Flag #5 (`sale.tsx`/`egress.tsx` full
  `getProductsToSaleByCategoryId` re-expression) if not pulled forward — step 8 cleanup.
- Tightening `ProductRepository`'s `categoryRepository` param to mandatory — Phase 2 step 9
  (already deferred by Phase 1, engram #758).
