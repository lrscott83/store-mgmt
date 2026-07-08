# Tasks: product-service-parity — Phase 2, Slice 5 (ProductCategoryOfflineService, async category C)

Governs `openspec/changes/product-service-parity/design.md` "Slicing — LAYER-FIRST" §Phase 2
step 5 + `spec.md` "Category Service Method Surface Parity" / "ProductCategoryRepository Mirrors
Angular Repo Surface". Depends on Phase 1 (COMPLETE, commit `100b904` + prior — see
`tasks-phase1-repo-di.md`): `ProductCategoryRepository` and the extended `ProductRepository`
already exist and are SYNC. This slice reconciles `ProductCategoryOfflineService` (+ its
`ProductCategoryService` interface) to Angular's exact ASYNC surface. Strict TDD: every
method/behavior = RED→GREEN; TS-type/visibility/signature changes RED via
`tsc --noEmit` (esbuild strips types, vitest alone will NOT catch a wrong return type or a
removed member — always pair a behavior test with a `tsc --noEmit` check for signature-shape
tasks below). Angular source of truth:
`frontend/src/app/application/categories/{product-category.service.ts,
product-category-offline.service.ts}`, `frontend/src/app/presentation/{products/products.component.ts,
products/edit-product-category-modal/edit-product-category-modal.component.ts,
sale/sale.component.ts, inventory/egress/egress.component.ts}`,
`frontend/src/app/presentation/auth/login/login.component.ts`. React target:
`frontend-react/packages/domain/src/services/product-category-service.ts`,
`frontend-react/apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts`.
Delivery: commits-only on `feat/frontend-parity-audit`, one commit per work unit, conventional
messages, no PR/branches/stacking, no AI attribution. size-exception pre-approved.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~430-520 (WU1 interface ~40; WU2 service+test ~300; WU3 products.tsx+test ~150; Final gate ~10) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is commits-only per standing instruction |
| Suggested split | WU1 → WU2 → WU3 → Final, one commit per unit |
| Delivery strategy | commits-only (explicit instruction, supersedes ask-on-risk default) |
| Chain strategy | size-exception |

Decision needed before apply: **Yes — see Flagged Mismatch #1 below (blocks WU2 scope).**
Chained PRs recommended: No
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Dependency |
|------|------|------------|
| 1 | `ProductCategoryService` interface — ADD async 5-method surface; KEEP `extends BaseService` + old sync signatures for now (additive coexistence, see Flag #1) | None (Phase 1 complete) |
| 2 | `ProductCategoryOfflineService` — ADD `createProductCategory`/`updateProductCategory`/`getProductCategories` (new); Promise-wrap KEEP bucket (`getAvailableProductCategories`/`getProductCategoriesView`/`getMaxOrder`) delegating to `ProductCategoryRepository`+`ProductRepository`; REMOVE `save`/`addByName`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory` (zero Angular correlate at any layer, no grace period per spec.md); KEEP `getAll`/`getById`/`delete` unchanged (BaseService-inherited, deferred to Phase 2 step 8 per Flag #1) | After 1 |
| 3 | Re-express `products.tsx` `handleCategorySave` (→ `createProductCategory`/`updateProductCategory`, awaited) + `handleCsvImport` (→ interim `ProductCategoryRepository.getProductCategoryByName`/`addProductCategoryByName`, sync, per spec.md's explicit interim note) — the ONLY call site using a removed method | After 2 |
| Final | Regression gate: confirm removed methods gone, no new `getAll`-based call site broke, full test/build gate | After 3 |

## Apply Status (2026-07-08) — COMPLETE

All 3 work units + Final regression gate landed on `feat/frontend-parity-audit`, commits-only,
all gates green (tests/tsc/build):

- `23f3f38` feat(domain): add async ProductCategoryService surface
  (createProductCategory/updateProductCategory/getMaxOrder/getAvailableProductCategories/
  getProductCategoriesView), remove save/addByName-adjacent methods — WU1
- `45b3571` feat(web-store-pos): reconcile ProductCategoryOfflineService to Angular's async
  category-C surface (createProductCategory/updateProductCategory/getProductCategories,
  Promise-wrap KEEP bucket), remove save/addByName/getByName/hasAny* — WU2
- `9c57b35` refactor(web-store-pos): re-express products.tsx category save/CSV-import against
  the async ProductCategoryOfflineService surface — WU3
- `2ef9276` docs(product-service-parity): reconcile design.md Phase 2 step 5 drop-timing with
  Decision section — doc fix (design.md self-contradiction, ratified by user before WU1)

**Flag #1 resolution (user-confirmed 2026-07-08, before WU2)**: `extends BaseService<Product>`
and `getAll`/`getById`/`delete` on `ProductCategoryOfflineService` (+ interface) STAY through
this slice — the drop is deferred to Phase 2 step 8, matching design.md's Decision section
(not the earlier self-contradicting Phase 2 outline, which was corrected by the doc-fix commit
above). None of the ~9 pre-existing `getAll()`-based call sites needed to change in this slice,
confirmed by the Final regression gate greps below.

**Final regression gate (4.1-4.4) — all confirmed**:
- 4.1: `save`/`addByName`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory` grep-confirmed
  absent from `product-category-offline-service.ts` and `product-category-service.ts` (domain).
- 4.2: zero remaining call sites reference the five removed methods anywhere under
  `apps/web-store-pos/app` (grep-confirmed; the only real matches were `ProductCategoryRepository`/
  `ProductRepository`/`BaseRepository` internal `.save(...)` calls and the repository's own
  `hasAnyAvailableCategory()` — both correctly still exist at the repository layer, not the
  service).
- 4.3: constructor accepts optional `categoryRepository`/`productRepository`; every existing
  single-arg `new ProductCategoryOfflineService(storeId)` call site (9 non-test consumers)
  still compiles clean (`tsc --noEmit`, 0 errors, both packages).
- 4.4: domain — `pnpm test` (96/96 passed), `tsc --noEmit` (clean), `pnpm build` (clean).
  web-store-pos — `pnpm test` (110 files / 1528 tests passed), `tsc --noEmit` (clean),
  `pnpm build` (clean, same pre-existing unrelated dynamic-import warning as Phase 1, not
  introduced by this slice).

## Flagged mismatches / decisions (confirm at apply time)

1. **[BLOCKING] `extends BaseService` drop timing — design.md self-contradicts.** The Phase 2
   outline (`tasks-phase1-repo-di.md` step 5, "Phase 2 (deferred — outline only)") says
   step 5 itself "(+ interface, drops `extends BaseService`)". But `design.md`'s own Decision
   section ("`ProductService` becomes standalone async... `ProductCategoryService` ALSO drops
   `extends BaseService`... dropped in the cleanup slice **alongside Product**") places the
   drop at Phase 2 **step 8** (the cross-cutting Product+Category final regression gate), and
   the "Additive coexistence migration" Decision explicitly says the async surface is "added
   ALONGSIDE the existing sync methods... the dead sync surface is removed in the FINAL slice."
   **This tasks file resolves it as: KEEP `extends BaseService` + `getAll`/`getById`/`delete`
   ALIVE through this slice, defer the drop to step 8** — because (a) it matches the explicit
   Decision-section language naming step 8, (b) it matches the general Additive-coexistence
   rationale used everywhere else in this change, (c) it means ZERO of the ~9 read-only
   `getAll()` call sites (`sale.tsx`, `egress.tsx`, `available.tsx`,
   `edit-inventory-entry-modal.tsx`, `order-offline-service.ts`, `import.tsx`, `export.tsx`,
   `user-home.ts`) need to change in this slice — confirmed by direct read: none of them call
   `save`/`addByName`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory` (the methods
   spec.md unconditionally lists for removal now), only `getAll`/`getById` (BaseService
   members, grace-period eligible). **CONFIRM this reading before WU2**, or direct a full
   drop-now scope (which would require re-pointing all ~9 files in this same slice —
   substantially larger, and duplicates Phase 1 WU4's report-call-site work for non-report
   screens).
2. **`getById`/`delete` fate is informational-only here, not resolved.** Per Flag #1's chosen
   reading, `ProductCategoryOfflineService.delete(id)` stays untouched (still does
   `repo.remove(...)` via its own private `BaseRepository`, NOT via the injected
   `ProductCategoryRepository`, which deliberately has no `remove()`). Angular's abstract
   `ProductCategoryService` does not declare `delete` at all — it is inherited from Angular's
   OWN `BaseService<T>.delete()` (`base.service.ts:128-132`, a generic **HTTP** call), which
   `ProductCategoryOfflineService` never overrides. So Angular's "offline" category delete, if
   ever invoked (`products.component.ts:89 categoryService.delete(categoryId)`), actually fires
   a live HTTP DELETE even in offline mode — a real Angular inconsistency, not a pattern to
   port. React currently has **no category-delete UI at all** (grepped zero call sites) so this
   is dormant. Track for step 8: does React (a) drop `delete` entirely (Angular's abstract
   surface has no correlate; the repository has no `remove()` to delegate to — matches
   Exact-Surface Rule), or (b) keep a React-only local-delete as a documented, intentional
   non-Angular convenience (offline mode needs SOME way to remove a category since Angular's
   own offline path is broken here)? Not a Slice 5 decision — flagged for step 8 only.
3. **`getMaxOrder()` has zero React call sites (feature gap, not a Slice 5 blocker).** Angular's
   `EditProductCategoryModalComponent.ngOnInit()` calls `categoryService.getMaxOrder()` to
   default the `order` field to `maxOrder + 1` on CREATE. React's
   `EditProductCategoryModal.tsx` currently hardcodes `order: '1'` and never calls
   `getMaxOrder` anywhere (grep-confirmed). This slice makes `getMaxOrder()` exist with the
   correct async signature (delegates to `categoryRepository.getProductCategories()` +
   `Math.max`), satisfying service-surface parity, but does **not** wire it into the modal —
   doing so would require the modal to fetch async on open (a UI-layer change beyond "service
   reconciliation"). Flagged as a known, separately-trackable UI gap; not blocking this slice.
4. **`products.tsx`'s category accordion list is NOT Angular's `getProductCategoriesView`
   output today (untouched by this slice, flagged for awareness).** Angular's real
   `ProductsComponent.loadCategories()` calls `categoryService.getProductCategoriesView()`
   exclusively — which returns ONLY ACTIVE categories with a real `productsCount` computed via
   `productRepository.getAvailableToSaleProductsByCategoryId(...).length` (stricter than
   `isActive`-only). React's `products.tsx` instead reads via `.getAll()` (ALL categories,
   active+inactive) and computes its own local `productsCount` via
   `products.filter(p => p.categoryId === category.id && p.isActive)` (looser: `isActive`
   only, no `availableToSale`). Since Flag #1 keeps `getAll()` alive and this slice does not
   force a `products.tsx` category-list rewrite, this divergence is **not fixed here** — it
   pre-exists this slice and is out of scope (would be a `products.tsx`/route-level UI-parity
   task, not a service-reconciliation task). Noted so it is not mistaken for something this
   slice was supposed to close.
5. **`handleCsvImport`'s interim shape is spec-mandated, not improvised.** spec.md's Surface
   Reconciliation table (rows for `addByName`/`getByName`) explicitly states the CSV call site
   "folds into `ProductService.createCsvProducts`" (Phase 2 step 6, not yet built) and, until
   then, "interim uses `ProductCategoryRepository.addProductCategoryByName`" /
   "`getProductCategoryByName`". WU3 implements exactly that interim (sync, direct repository
   calls bypassing the service) — this is a KNOWN, TEMPORARY shape the spec itself schedules
   for replacement once step 6 lands, not a new decision.
6. **`ProductCategoryOfflineService`'s constructor gains a SECOND dependency
   (`ProductRepository`), mirroring Angular's real 3-arg constructor exactly** (`http,
   categoryRepository, productRepository` — `product-category-offline.service.ts:21`).
   `getProductCategoriesView`'s `productsCount` needs
   `productRepository.getAvailableToSaleProductsByCategoryId(category.id).length` (confirmed
   directly from Angular source, not inferred). Per Phase 1's ratified pattern (flagged
   decision #5 in `tasks-phase1-repo-di.md`), both new constructor params are
   **optional-with-default** (`categoryRepository?: ProductCategoryRepository`,
   `productRepository?: ProductRepository`, each defaulting to `new X(storeId)` when omitted)
   so the ~12 existing single-arg `new ProductCategoryOfflineService(storeId)` call sites keep
   compiling unchanged. Confirmed not a data-integrity risk for the same reason as Phase 1
   (localStorage-backed, no in-memory cache, every instance reads identical persisted state).
7. **Discovered but explicitly OUT of Slice 5 scope: sync-layer (`import.tsx`/`export.tsx`/
   `data-serializer-service.ts`) and `order-offline-service.ts`'s `getCategoryCartItemsView`
   already have the Angular-faithful fix available and it is NOT this slice's job.** Angular's
   `DataSynchronizerService` (`data-synchronizer.service.ts:3,24`) and `OrderOfflineService`
   (`order-offline.service.ts` — confirmed `categoryRepository.getProductCategories()` at
   L79) both inject `ProductCategoryRepository` directly, never the service — meaning React's
   current `import.tsx`/`export.tsx` (passing `ProductCategoryOfflineService` into
   `DataSerializerService`'s `CategoryReader` structural interface) and
   `order-offline-service.ts:213-214` (`new ProductCategoryOfflineService(this.storeId).getAll()`)
   are themselves stale — same class of gap as Phase 1 WU4's report call sites, just not
   caught there because they aren't report/inventory screens. Since Flag #1 keeps `getAll()`
   alive, NONE of these break in this slice (no forced fix), so this is **not addressed by
   WU1-3 below**. Recorded here so it is not lost; candidate for a small follow-up WU (either
   appended to this slice or picked up in step 8) — re-point to
   `new ProductCategoryRepository(storeId)` + rename `CategoryReader.getAll()` →
   `getProductCategories()` to match the repository's real method name.

## WU1: `ProductCategoryService` interface — ADD async 5-method surface — Req: "Category Service Method Surface Parity"

`packages/domain/src/services/product-category-service.ts`. Per Flag #1, `extends
BaseService<ProductCategory>` and `getByName`/`save`/`hasAnyCategory`/`hasAnyAvailableCategory`
member DECLARATIONS being removed happens at step 8 — **but** `getByName`/`save`/
`hasAnyCategory`/`hasAnyAvailableCategory` themselves are unconditionally removed per spec.md
(no grace period), so this WU removes ONLY those four from the interface now, while
`extends BaseService<ProductCategory>` (hence `getAll`/`getById`/`delete`) stays.

Test file: `packages/domain/src/services/__tests__/product-category-service.test.ts` (rewrite the
fake to match).

- [x] 1.1 RED/GREEN: interface declares `createProductCategory(name, order, isActive):
      Promise<BaseResponseModel<boolean>>` (product-category.service.ts, matches
      `ProductCategoryRepository.addProductCategory`'s Result→boolean envelope mapping).
- [x] 1.2 RED/GREEN: `updateProductCategory(id, name, order, isActive):
      Promise<BaseResponseModel<boolean>>`.
- [x] 1.3 RED/GREEN: `getMaxOrder(): Promise<BaseResponseModel<number>>` (signature change from
      sync `number` to async envelope — confirm `tsc --noEmit` catches any un-migrated caller;
      grep-confirmed zero callers exist today, see Flag #3).
- [x] 1.4 RED/GREEN: `getAvailableProductCategories(): Promise<BaseResponseModel<ProductCategory[]>>`
      (signature change from sync `ProductCategory[]`).
- [x] 1.5 RED/GREEN: `getProductCategoriesView(): Promise<BaseResponseModel<ProductCategoryView[]>>`
      (signature change from sync `ProductCategoryView[]`).
- [x] 1.6 GREEN: remove `getByName`/`save`/`hasAnyCategory`/`hasAnyAvailableCategory` member
      declarations from the interface (spec.md unconditional removal list).
- [x] 1.7 GREEN: `extends BaseService<ProductCategory>` stays (Flag #1) — `getAll`/`getById`/
      `delete` remain part of the interface contract, unchanged, sync.
- [x] 1.8 Gate: `pnpm -C packages/domain test`, `pnpm -C packages/domain exec tsc --noEmit`,
      `pnpm -C packages/domain build`; commit
      `feat(domain): add async ProductCategoryService surface (createProductCategory/updateProductCategory/getMaxOrder/getAvailableProductCategories/getProductCategoriesView), remove save/addByName-adjacent methods`.

## WU2: `ProductCategoryOfflineService` reconciliation — Req: "Category Service Method Surface Parity", "ProductCategoryRepository Mirrors Angular Repo Surface"

`apps/web-store-pos/app/sales/lib/services/product-category-offline-service.ts`. Constructor
gains two OPTIONAL params per Flag #6: `constructor(private readonly storeId: string,
categoryRepository?: ProductCategoryRepository, productRepository?: ProductRepository)`,
defaulting to fresh instances. Test file:
`.../services/__tests__/product-category-offline-service.test.ts` — this is a LARGE rewrite:
remove `CAT-01/02/04/07/08` (test the removed methods), keep/convert `CAT-03/05/06/09/10/11/12`
(async where the underlying method is now async), add new cases for
`createProductCategory`/`updateProductCategory`/`getProductCategories`.

- [x] 2.1 RED/GREEN: `createProductCategory(name, order, isActive)` — delegates to
      `categoryRepository.addProductCategory(name, order, isActive)`; `result.succeeded ?
      Promise.resolve(success(true)) : Promise.resolve(failure(result.errors))` (1:1 port of
      Angular offline service body).
- [x] 2.2 RED/GREEN: `updateProductCategory(id, name, order, isActive)` — delegates to
      `categoryRepository.updateProductCategory(...)`, same success/failure mapping.
- [x] 2.3 RED/GREEN: `getProductCategories()` (offline-only, NOT on the interface) — delegates to
      `categoryRepository.getProductCategories()`, always `Promise.resolve(success(categories))`
      (Angular's offline method never fails).
- [x] 2.4 RED/GREEN: `getAvailableProductCategories()` — delegates to
      `categoryRepository.getAvailableProductCategories()`, always Success (Angular never fails
      this call either).
- [x] 2.5 RED/GREEN: `getProductCategoriesView()` — delegates to
      `categoryRepository.getAvailableProductCategories()` for the category list, then maps each
      to `{ id, name, order, isActive, productsCount:
      productRepository.getAvailableToSaleProductsByCategoryId(category.id).length }` (Angular
      source-confirmed, not inferred — `product-category-offline.service.ts:50-65`). Keep the
      existing test's STRICTER-predicate assertion (CAT-12) — it must still hold with the new
      repository-backed implementation.
- [x] 2.6 RED/GREEN: `getMaxOrder()` — delegates to `categoryRepository.getProductCategories()`
      then `Math.max(...categories.map(c => c.order), 0)`, `Promise.resolve(success(...))`.
- [x] 2.7 GREEN: remove `save`/`addByName`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory`
      method bodies (unconditional removal, spec.md).
- [x] 2.8 GREEN: `getAll`/`getById`/`delete` bodies stay EXACTLY as-is (Flag #1/#2) — no changes,
      no re-point to the injected `categoryRepository`.
- [x] 2.9 Confirm class still `implements ProductCategoryService` cleanly against WU1's updated
      interface (`tsc --noEmit` is the real gate here — a missing/mis-typed async method is
      invisible to vitest).
- [x] 2.10 Gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`,
      `pnpm -C apps/web-store-pos build`; commit
      `feat(web-store-pos): reconcile ProductCategoryOfflineService to Angular's async category-C surface (createProductCategory/updateProductCategory/getProductCategories, Promise-wrap KEEP bucket), remove save/addByName/getByName/hasAny*`.

## WU3: Re-express `products.tsx` — Req: "Category Service Method Surface Parity" (call-site parity)

`apps/web-store-pos/app/sales/routes/products.tsx` + its test
(`apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx`). The ONLY call site using a
removed method (confirmed by grep across all 9 non-test `ProductCategoryOfflineService`
consumers — see Flag #1).

- [x] 3.1 RED/GREEN: `handleCategorySave` becomes `async`. Update path (`data.id` present): await
      `categoryService.updateProductCategory(data.id, data.name, data.order, data.isActive)`
      directly (drops the current `getById` + `save` two-step — `updateProductCategory` already
      takes `id`, no need to fetch first). Create path: await
      `categoryService.createProductCategory(data.name, data.order, data.isActive)` directly
      (drops the current `addByName` + `getById` + `save` three-step — `createProductCategory`
      already takes `name`/`order`/`isActive` in one call, matching Angular's
      `EditProductCategoryModalComponent.onSubmit()` exactly). On `!result.succeeded`, surface
      the failure (at minimum do not silently swallow it — match the existing file's error-handling
      conventions elsewhere in this route, e.g. how `handleDeleteProduct`/other handlers report
      failure, or introduce a minimal inline error state if none exists yet).
- [x] 3.2 RED/GREEN: `handleCsvImport` — replace `categoryService.getByName(row.category)` with
      `new ProductCategoryRepository(storeId).getProductCategoryByName(row.category)` and
      `categoryService.addByName(row.category)` with
      `new ProductCategoryRepository(storeId).addProductCategoryByName(row.category)` (interim,
      spec.md-mandated shape — Flag #5). `categoryService.getById(categoryId)` for the
      `cat?.name` lookup MAY stay as-is (Flag #1: `getById` is not removed this slice) OR be
      folded into the same `ProductCategoryRepository` instance for consistency — prefer the
      latter (`new ProductCategoryRepository(storeId).getProductCategoryById(categoryId)`) to
      avoid mixing service-getById and repository-direct calls in the same handler; not required
      by any Requirement, a readability choice.
- [x] 3.3 GREEN: `loadData`'s `categoryService.getAll()` (line 43) stays UNCHANGED (Flag #1/#4).
- [x] 3.4 Update `products.test.tsx` mocks: any test asserting `save`/`addByName`/`getByName`
      call patterns must be rewritten against `createProductCategory`/`updateProductCategory`/
      `ProductCategoryRepository`; tests exercising `handleCategorySave`/`handleCsvImport` need
      `await`/`waitFor` around the now-async save path.
- [x] 3.5 Gate: `pnpm test`, `tsc --noEmit`, `pnpm build`; commit
      `refactor(web-store-pos): re-express products.tsx category save/CSV-import against the async ProductCategoryOfflineService surface`.

## Final: Slice 5 Regression Gate

- [x] 4.1 Grep-confirm `save`/`addByName`/`getByName`/`hasAnyCategory`/`hasAnyAvailableCategory`
      no longer exist anywhere under `apps/web-store-pos/app/sales/lib/services/
      product-category-offline-service.ts` or `packages/domain/src/services/
      product-category-service.ts`.
- [x] 4.2 Grep-confirm zero remaining call sites reference the five removed methods anywhere in
      `apps/web-store-pos/app`.
- [x] 4.3 Confirm `ProductCategoryOfflineService`'s constructor now accepts optional
      `categoryRepository`/`productRepository` params (Flag #6) and every existing single-arg
      `new ProductCategoryOfflineService(storeId)` call site still compiles.
- [x] 4.4 Full gate — domain: `pnpm test`, `tsc --noEmit`, build. web-store-pos: `pnpm test`,
      `tsc --noEmit`, `pnpm build` — all green.
- [x] 4.5 Update this file with commit hashes; record resolution of Flag #1 (as confirmed by the
      user before WU2) at the top of the Flagged section for the historical record.

## Deferred to Phase 2 step 6 / step 8 (do NOT pull into this slice)

- `ProductOfflineService` reconciliation (12+2 async surface) — step 6, unblocks
  `handleCsvImport`'s permanent `createCsvProducts` shape and `user-home.ts`'s
  `hasAnyAvailableToSaleProduct` shape (currently untouched, still using `getAll()` on both
  services per Flag #1).
- `extends BaseService` drop + `getAll`/`getById`/`delete` removal on BOTH `ProductService` and
  `ProductCategoryService`, plus the Flag #7 sync-layer (`import.tsx`/`export.tsx`/
  `data-serializer-service.ts`/`order-offline-service.ts`) repository re-point — step 8 cleanup,
  per Flag #1's resolution.
- Tightening `ProductRepository`'s `categoryRepository` param to mandatory — Phase 2 step 9
  (already deferred by Phase 1).
