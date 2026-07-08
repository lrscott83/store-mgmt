# Tasks: product-service-parity — Phase 1 (Repository + DI foundation, SYNC)

Supersedes `tasks-slice1-category.md` and `tasks-slice2-product.md` (per-service slicing —
STALE, see stub headers in those files). Governs the re-sliced
`openspec/changes/product-service-parity/design.md` "Slicing — LAYER-FIRST" (user-ratified
2026-07-08, commit 3e84626) + `spec.md`. Strict TDD: every method/behavior = RED→GREEN. Angular
source of truth: `frontend/src/app/application/{products/product.repository.ts,
categories/product-category.repository.ts}`, `domain/entities/product-categories/
product-category.errors.ts`, `presentation/inventory/{inventory-today-quantities,
inventory-today-sales-profit,inventory-daily-entries}/*.component.ts`,
`presentation/reports/inventory-today-sale/inventory-today-sale.component.ts`. React target:
`frontend-react/apps/web-store-pos/app/sales/lib/repositories/{product-category-repository.ts
(new), product-repository.ts (extend existing)}`. Delivery: commits-only on
`feat/frontend-parity-audit`, no PRs/branches/stacking. Phase 1 does NOT touch any service
return-shape — repositories stay SYNC throughout.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600-720 (WU1 repo+test ~260; WU2 errors+test ~40; WU3 repo-extend+test ~280; WU4 call-sites+tests ~100) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is commits-only per standing instruction |
| Suggested split | WU1 → WU2 → WU3 → WU4, one commit per unit |
| Delivery strategy | commits-only (explicit instruction, supersedes ask-on-risk default) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Dependency |
|------|------|------------|
| 1 | Extract `ProductCategoryRepository` (Angular surface exact, no upsert/remove) + tests | None |
| 2 | Port `ProductCategoryErrors` (byte-identical); confirm `ProductErrors` reuse | None |
| 3 | Extend EXISTING `ProductRepository` — validations, order-shift, soft-delete, repo-only activate/deactivate, `setDiscountFromInvantory`, remaining queries + tests | After 1, 2 |
| 4 | Re-point report/inventory call sites from `ProductOfflineService`/category service `.getAll()` to the SYNC repositories directly | After 1, 3 |

## Flagged mismatches / decisions (confirm at apply time)

1. **Dead param on `activateProductCategory`/`deactivateProductCategory`.** Angular's repo
   declares `activateProductCategory(id, isActive)`/`deactivateProductCategory(id, isActive)`
   (product-category.repository.ts:150-156) but the body ALWAYS hardcodes `true`/`false` —
   `isActive` is never read. `Product.activateProduct`/`deactivateProduct` (product.repository.ts:
   279-285) is correctly 1-param. No external/serialized contract touches the dead param. Per
   `angular-bugs-policy`: FIX, don't mirror — React declares 1-param
   `activateProductCategory(id)`/`deactivateProductCategory(id)`.
2. **WU4 scope is intentionally narrow — repo-only reads, not the full call-site list.**
   `available.tsx`/`egress.tsx` also call `ProductOfflineService.getAll()`/
   `ProductCategoryOfflineService.getAll()` today, but no confirmed Angular correlate injects a
   repository there (unlike the four WU4 targets below, which all have a verified Angular
   component doing direct repository DI). Those two files stay on the current service calls and
   are re-expressed in Phase 2 (service return-shape slices), not here — touching them now would
   pre-empt Phase 2's async migration for no parity gain.
3. **`inventory-today-sale-service.ts` is Angular's exact `productRepository.getAvailableProducts()`
   correlate** (inventory-today-sale.component.ts:39,178 — constructor field misleadingly named
   `productService` but typed `ProductRepository`, calls the repo-only `getAvailableProducts()`).
   `ProductRepository.getAvailableProducts()` does not exist in current React and is added by WU3
   (`product.repository.ts:46-48`) before WU4 can re-point this call site.
4. **Category-by-id report reads** (`today-quantities.tsx:64`, `today-sales-profit.tsx:87` —
   current line numbers, drifted from the earlier per-service task file's `:63`/`:86`) use
   `categorySvc.getById(categoryId)?.order ?? 999`, which has no correlate at all on
   `ProductCategoryOfflineService` today (it's Angular's `categoryRepository.
   getProductCategoryById(id)?.order ?? 999`, inventory-today-quantities.component.ts:139-141).
   WU4 re-points both to `new ProductCategoryRepository(storeId).getProductCategoryById(categoryId)`.
5. **`ProductRepository` constructor's `categoryRepository` param is optional-with-default in
   Phase 1** (`categoryRepository?: ProductCategoryRepository`, defaults to
   `new ProductCategoryRepository(storeId)` when omitted), diverging from Angular's mandatory DI
   (Angular's DI container always injects `ProductCategoryRepository`; React has no DI container
   convention anywhere in this codebase). Ratified by user 2026-07-08. Verified not a
   data-integrity risk: `BaseRepository.getAll()` reads fresh from localStorage on every call (no
   in-memory cache), so a default-constructed instance sees identical persisted state to a shared
   one — category-existence guards (`getProductCategoryById`, `hasAnyAvailableCategory`) are not
   weakened. ~12 single-arg call sites (`available.tsx`, `egress.tsx`, `sale.tsx`,
   `cart-shell.tsx`, `import.tsx`, `order-offline-service.ts`, `report-aggregation-service.ts`,
   `inventory-today-sale-service.ts`, etc.) are out of Phase 1 scope. Phase 2 tightens this
   constructor param to mandatory when those call sites migrate (see Phase 2 outline below).

## WU1: Extract `ProductCategoryRepository` — Req: "ProductCategoryRepository Mirrors Angular Repo Surface"

New file `apps/web-store-pos/app/sales/lib/repositories/product-category-repository.ts` wrapping
`new BaseRepository<ProductCategory>('product-categories')` (→ storage key
`lizoft.store-product-categories-{storeId}`, confirmed via `StorageKeys.entityKey`, matches
Angular exactly). Test: `.../repositories/__tests__/product-category-repository.test.ts`.

- [x] 1.1 RED/GREEN: `getProductCategoryById(id)` (repo.ts:51-53) → match or `undefined`.
- [x] 1.2 RED/GREEN: `getProductCategoryByName(name)` (55-57).
- [x] 1.3 RED/GREEN: `getProductCategories()` — ALL, sorted ascending by `order` (59-61).
- [x] 1.4 RED/GREEN: `getAvailableProductCategories()` — `isActive`-only, sorted (63-65).
- [x] 1.5 RED/GREEN: `hasAnyCategory()` / `hasAnyAvailableCategory()` (67-69, 25-27).
- [x] 1.6 RED/GREEN: `addProductCategory(name, order, isActive)` — name-collision fails, no
      persistence (71-74); else creates + shifts siblings `order >= order` by `+1`, then
      reassigns own order (redundant double-assign, mirror do-not-simplify, 76-88) + private
      `updateCategoriesOrder` (109-115). Returns `Result`.
- [x] 1.7 RED/GREEN: `addProductCategoryByName(name)` — generated id, next order via private
      `getNextOrder()` (94-103), always `isActive: true`, returns new id or `null`.
- [x] 1.8 RED/GREEN: `updateProductCategory(id, name, order, isActive)` — not-found fails
      (122-124); name-collision excluding self fails (126-128); success updates + same
      order-shift-then-reassign (130-136).
- [x] 1.9 RED/GREEN: `activateProductCategory(id)` / `deactivateProductCategory(id)` — **1-param**
      (flagged #1, dead-param fix), toggle ONLY `isActive` via private
      `updateProductCategoryActive` (139-148).
- [x] 1.10 RED/GREEN: `getCategoriesJson()` (172-174); `addImportedProductCategory`/
      `updateImportedProductCategory`/`updateCategories`/`setInitCategories`/
      `getStorageCategoriesMap` (29-44, 105-119) — sync/import parity.
- [x] 1.11 Confirm NO `upsert`/`remove` exist on the class (Exact-Surface Rule).
- [x] 1.12 Gate: `pnpm test`, `tsc --noEmit`; commit
      `feat(web-store-pos): extract ProductCategoryRepository (mirror Angular repo surface, no upsert/remove)`.

## WU2: Port `ProductCategoryErrors` — Req: category-exists validation dependency

`ProductErrors` already exists (`packages/domain/src/errors/product-errors.ts`, confirmed
byte-identical superset incl. `NameExists`/`BarcodeExists`/`NotExists`) — reuse, no action.

- [x] 2.1 RED: `packages/domain/src/errors/__tests__/product-category-errors.test.ts` asserts
      `NameExists`/`NotExists` codes+descriptions verbatim (product-category.errors.ts:7-14).
- [x] 2.2 GREEN: create `packages/domain/src/errors/product-category-errors.ts` (`as const
      satisfies Record<string, BaseError>`, same pattern as `product-errors.ts`).
- [x] 2.3 GREEN: export from `packages/domain/src/index.ts`.
- [x] 2.4 Gate; commit `feat(domain): port ProductCategoryErrors (byte-identical Angular parity)`.

## WU3: Extend `ProductRepository` — Req: "Repository-vs-Service Ownership Boundary", validations, order-shift, soft-delete, repo-only activate/deactivate

Modify the EXISTING `apps/web-store-pos/app/sales/lib/repositories/product-repository.ts` (do NOT
recreate — already has `getStorageProductsMap`/`getProductById`/`getAvailableProductById`).
Constructor gains a `ProductCategoryRepository` param. Test file extends
`__tests__/product-repository.test.ts`.

- [x] 3.1 RED/GREEN: `getAvailableProducts()` (product.repository.ts:46-48) — `isActive`-only,
      unsorted, needed by WU4.3's `inventory-today-sale-service.ts` re-point.
- [x] 3.2 RED/GREEN: `getProductByName(name)` (59-61); `getProductByBarcode(barcode)` (63-66,
      empty-barcode → `undefined`); `hasAnyProduct()` (68-70).
- [x] 3.3 RED/GREEN: `getProductsByCategoryId(categoryId)` sorted by `order` (72-76);
      `getAvailableToSaleProductsByCategoryId(categoryId)` — `isActive && availableToSale`,
      sorted (78-82).
- [x] 3.4 RED/GREEN: `hasAnyAvailableToSaleProduct()` —
      `categoryRepository.hasAnyAvailableCategory() && some(isActive && availableToSale)` (84-86).
- [x] 3.5 RED/GREEN: `deleteProduct(id)` — soft-delete: `isActive=false` + `updatedDate`/
      `updatedByName` stamp, returns `true`; missing id → `false`, no throw (88-98).
- [x] 3.6 RED/GREEN: `addProductData(id, categoryId, name, price, businessId, order, isActive,
      availableToSale, discountFromInvantory, barcode?)` — category-exists via
      `categoryRepository.getProductCategoryById` fails `ProductCategoryErrors.NotExists`
      (112-113); barcode-uniqueness fails `ProductErrors.BarcodeExists` (115-118);
      name-uniqueness-per-category fails `ProductErrors.NameExists` (120-121); else creates +
      order-shift (`updateProductsOrderByCategory`, 141) + reassign own order (142, redundant
      double-assign, mirror do-not-simplify) (100-146).
- [x] 3.7 RED/GREEN: `addProduct(...9 args)` — delegates to `addProductData` with generated id
      (148-171); `addImportedProduct(product)` (173-185).
- [x] 3.8 RED/GREEN: `updateProduct(id, categoryId, name, price, businessId, order, isActive,
      availableToSale, discountFromInvantory, barcode?, updatedDate?, updatedByName?)` —
      category-exists fails; not-found fails `ProductErrors.NotExists`; barcode-uniqueness
      excluding self; name-uniqueness excluding self; success updates all fields + same
      order-shift-then-reassign (193-242); `updateImportedProduct(product)` (244-259).
- [x] 3.9 RED/GREEN: `setDiscountFromInvantory(id, discountFromInvantory)` — only that flag, no
      audit stamps; missing id fails `ProductErrors.NotExists` (261-268).
- [x] 3.10 RED/GREEN: `activateProduct(id)` / `deactivateProduct(id)` — toggle ONLY `isActive`, no
      audit stamps, via private `updateProductActive` (270-285).
- [x] 3.11 RED/GREEN: `updateProducts(map)` / `setInitProducts(map)` / `getProductsJson()`
      (26-34, 301-303) — sync/import parity.
- [x] 3.12 Confirm the class still has NO `upsert`/`remove`.
- [x] 3.13 Gate; commit `feat(web-store-pos): extend ProductRepository with validations, order-shift, soft-delete, activate/deactivate`.

## WU4: Re-point report/inventory call sites to SYNC repositories — Req: Call-Site Parity (repository layer)

No service return-shape change. These consumers leave `ProductOfflineService`/
`ProductCategoryOfflineService` entirely, mirroring Angular's direct repository injection.

- [x] 4.1 `today-quantities.tsx:64` `categorySvc.getById(categoryId)?.order ?? 999` →
      `new ProductCategoryRepository(storeId).getProductCategoryById(categoryId)?.order ?? 999`;
      `:68-70` `productSvc.getAll().filter(isActive && availableToSale)` →
      `[...new ProductRepository(storeId).getStorageProductsMap().values()].filter(...)` (matches
      inventory-today-quantities.component.ts:62-63 exactly). Drop the now-unused
      `ProductOfflineService`/`ProductCategoryOfflineService` imports if no other call in the file
      needs them.
- [x] 4.2 `today-sales-profit.tsx:87` / `:91-93` — same two swaps (mirrors
      inventory-today-sales-profit.component.ts, same pattern as WU4.1).
- [x] 4.3 `entries.tsx:93-95` and `today-entries.tsx:33-35` — `productSvc.getAll()` →
      `[...new ProductRepository(storeId).getStorageProductsMap().values()]` (matches
      inventory-daily-entries.component.ts:82 `[...productRepository.getStorageProductsMap()
      .values()]`); `ProductRepository` is already imported in both files (used for
      `InventoryOfflineService`'s constructor) — reuse the same instance, do not construct twice.
- [x] 4.4 `inventory-today-sale-service.ts:58,63,69` — replace the injected
      `ProductOfflineService` field with `ProductRepository`; `getProductRows` line 69
      `this.productService.getAll().filter(isActive)` → `this.productRepository
      .getAvailableProducts()` (WU3.1, matches inventory-today-sale.component.ts:39,178 exactly —
      the flagged "misleadingly named `productService`" field is actually the repository).
- [x] 4.5 Update `inventory-routes.test.tsx` / `inventory-today-sale-service.test.ts` mocks:
      replace `ProductOfflineService`/`ProductCategoryOfflineService` `getAll`/`getById` mocks
      used by these four call sites with `ProductRepository`/`ProductCategoryRepository`
      `getStorageProductsMap`/`getAvailableProducts`/`getProductCategoryById` mocks. Other mocks in
      the same files (unrelated routes) stay unchanged.
- [x] 4.6 Gate: `pnpm test`, `tsc --noEmit`, `pnpm build`; commit
      `refactor(web-store-pos): re-point report/inventory reads to SYNC ProductRepository/ProductCategoryRepository (Angular DI parity)`.

## Final: Phase 1 Regression Gate

- [x] 5.1 Confirm `ProductCategoryRepository` and `ProductRepository` both declare NO
      `upsert`/`remove`.
- [x] 5.2 Confirm `ProductRepository`'s constructor now depends on `ProductCategoryRepository`
      (matches product.repository.ts:21-24).
- [x] 5.3 Grep-confirm the four WU4 files no longer import `ProductOfflineService`/
      `ProductCategoryOfflineService` for the migrated reads (residual imports for other
      unmigrated calls in the same file are fine — flag any if found).
- [x] 5.4 Full gate — domain: `pnpm test`, `tsc --noEmit`, build. web-store-pos: `pnpm test`,
      `tsc --noEmit`, `pnpm build` — all green.
- [x] 5.5 Update this file with commit hashes.

**Phase 1 — COMPLETE (2026-07-08). All 4 WUs + Final gate landed on `feat/frontend-parity-audit`:**

| WU | Commit | Note |
|----|--------|------|
| WU2 (ported first — WU1's own validations require `ProductCategoryErrors`, which WU2 creates; both units are marked "Dependency: None" in the Suggested Work Units table, so this is a sequencing choice, not a scope change) | `b00ea1b` feat(domain): port ProductCategoryErrors (byte-identical Angular parity) | |
| WU1 | `8416a75` feat(web-store-pos): extract ProductCategoryRepository (mirror Angular repo surface, no upsert/remove) | `addProductCategoryData` was initially implemented as a PRIVATE helper, contradicting spec.md's authoritative surface table (spec.md:77), which lists it as public. Fixed as a fast-follow to Phase 1 verify (2 WARNINGs) — made PUBLIC to match Angular (repo.ts:71, public by default) + spec.md:77; spec.md:487-497 and design.md:155 corrected to include it |
| WU3 | `971819a` feat(web-store-pos): extend ProductRepository with validations, order-shift, soft-delete, activate/deactivate | Constructor gained an OPTIONAL `categoryRepository?: ProductCategoryRepository` param (defaults to `new ProductCategoryRepository(storeId)` when omitted) instead of a mandatory one — Angular's DI container makes it mandatory there, but React has no DI container and ~13 other call sites construct `new ProductRepository(storeId)` with a single arg; making it optional keeps every one of them compiling unchanged while WU3's own tests and WU4's call sites pass an explicit instance |
| WU4 | `100b904` refactor(web-store-pos): re-point report/inventory reads to SYNC ProductRepository/ProductCategoryRepository (Angular DI parity) | |

Full regression gate (5.4) — domain: `pnpm test` (95 passed), `tsc --noEmit` (clean), `pnpm build` (clean). web-store-pos: `pnpm test` (110 files / 1525 tests passed), `tsc --noEmit` (clean), `pnpm build` (clean, pre-existing unrelated dynamic-import warning in `auth-store.ts`/`api-client.ts` only).

## Phase 2 (deferred — outline only, do NOT detail into tasks yet)

Per-service async return-shape migration (category C), one service at a time, each depending on
the Phase 1 repositories being closed:

5. Reconcile `ProductCategoryOfflineService` (+ interface, drops `extends BaseService`) to
   Angular's exact ASYNC surface (`createProductCategory`/`updateProductCategory`/
   `getProductCategories` + the existing KEEP bucket, all `Promise<BaseResponseModel<T>>`);
   remove `save`/`addByName`/`getByName`/`hasAny*`; re-express its call sites.
6. Reconcile `ProductOfflineService` (+ interface, drops `extends BaseService`) to the 12+2 async
   category-C surface, delegating to the Phase-1 `ProductRepository`; remove React-only
   `search`/`updateMany`/`getByName`/`activate`/`deactivate`/old sync `create`/`update`/`delete`/
   `getAll`/`getById`.
7. `ProductOnlineService` (createProduct omits barcode, `ANGULAR-BUG-SUSPECT #4`; no
   `setDiscountFromInvantory`/`getProductsByCategoryId`) + `product-service.factory.ts`
   (`GlobalConfig.USE_ONLINE_SERVICE` gate); migrate remaining async call sites to the factory.
8. Cleanup / final regression gate: confirm no `extends BaseService` on either interface, no dead
   sync methods, no residual `upsert`/`remove` on either repository.
9. Tighten `ProductRepository`'s constructor `categoryRepository` param from optional-with-default
   to mandatory (Angular DI parity — flagged decision #5 above), and update all ~12 single-arg
   call sites (`available.tsx`, `egress.tsx`, `sale.tsx`, `cart-shell.tsx`, `import.tsx`,
   `order-offline-service.ts`, `report-aggregation-service.ts`, `inventory-today-sale-service.ts`,
   etc.) to pass an explicit `ProductCategoryRepository` instance.
