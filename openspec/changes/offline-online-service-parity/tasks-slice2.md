# Tasks: offline-online-service-parity — Slice 2 (Product/Category Repository + Service Parity)

Governs spec-slice2 #684, design-slice2 #685, proposal #671, decision #670, tasks-slice1 #676 (closes its deferred task 1.4). Strict TDD (init #64): every method/fix = RED→GREEN. Angular repository-only methods land directly on the flat offline services (design ADR-1, no repo class — Slice-1 precedent).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~310 total (non-test ~90: domain ~18, product ~35, category ~40; tests ~220) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | WU1 → WU2 → Final regression, one commit per unit (single PR) |
| Delivery strategy | commits-only, no PR/push (hybrid persistence, work-unit commits) |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type | Dependency | Est. lines |
|------|------|-------------|------------|------------|
| 1 | ProductService interface + ProductOfflineService 5 methods + `implements` | feat | None (commit first, amortizes domain rebuild) | ~150 |
| 2 | ProductCategoryService interface + `ProductCategoryView` model + ProductCategoryOfflineService 5 methods + getAll sort fix + `implements` | feat | No hard dep on WU1 (own predicate + Product.getAll() which already exists) | ~160 |

## WU1: ProductService Extension + ProductOfflineService — Req: product-service-parity

- [x] 1.1 RED: `packages/domain/src/services/__tests__/product-service.test.ts` — extend `FakeProductService` with `getByName/getMaxOrder/getAvailableProductsByCategoryId/activate/deactivate`; compiles only once interface adds these members (conformance oracle).
- [x] 1.2 GREEN: `packages/domain/src/services/product-service.ts` — add `getByName(name): Product|undefined; getMaxOrder(categoryId): number; getAvailableProductsByCategoryId(categoryId): Product[]; activate(id): void; deactivate(id): void` to `ProductService`.
- [x] 1.3 GREEN: `pnpm -C packages/domain build` (gotcha a — stale dist otherwise gives "no exported member" in app tsc).
- [x] 1.4 RED (`product-offline-service.test.ts`): `getByName(name)` exact match over ALL products (active+inactive), first match wins, `undefined` if none.
- [x] 1.5 GREEN: implement `getByName`.
- [x] 1.6 RED: `getMaxOrder(categoryId)` — max `order` among ALL products (active+inactive) in that category; `0` if empty.
- [x] 1.7 GREEN: implement `getMaxOrder`.
- [x] 1.8 RED: `getAvailableProductsByCategoryId(categoryId)` — categoryId match AND `isActive===true` (NOT `availableToSale`), sorted ascending by `order`.
- [x] 1.9 GREEN: implement `getAvailableProductsByCategoryId`.
- [x] 1.10 RED: `activate(id)/deactivate(id)` — set ONLY `isActive`; assert `updatedDate`/`updatedByName` UNCHANGED (gotcha c, unlike `delete`); no-op (no throw) if id missing.
- [x] 1.11 GREEN: implement `activate`/`deactivate`.
- [x] 1.12 GREEN: `product-offline-service.ts` class declaration add `implements ProductService`.
- [x] 1.13 Gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`, `pnpm -C apps/web-store-pos build`; commit `feat(domain,web-store-pos): extend ProductService + port getByName/getMaxOrder/getAvailableProductsByCategoryId/activate/deactivate`. Commit: `a32acbb`.

## WU2: ProductCategoryService Extension + ProductCategoryOfflineService — Req: product-category-service-parity, product-category-listing

- [x] 2.1 RED: `packages/domain/src/services/__tests__/product-category-service.test.ts` — extend `FakeProductCategoryService` with `hasAnyCategory/hasAnyAvailableCategory/getMaxOrder/getAvailableProductCategories/getProductCategoriesView`; compiles only once interface adds these members.
- [x] 2.2 GREEN: `packages/domain/src/services/product-category-service.ts` — add the 5 method signatures to `ProductCategoryService`.
- [x] 2.3 GREEN: `packages/domain/src/models/product.ts` — add `ProductCategoryView { id; name; order; isActive; productsCount }`; export from `packages/domain/src/index.ts`.
- [x] 2.4 GREEN: `pnpm -C packages/domain build` (gotcha a).
- [x] 2.5 RED (`product-category-offline-service.test.ts`): `hasAnyCategory()` — true if ANY category exists (active or not); false if empty.
- [x] 2.6 GREEN: implement `hasAnyCategory`.
- [x] 2.7 RED: `hasAnyAvailableCategory()` — true if ≥1 `isActive` category.
- [x] 2.8 GREEN: implement `hasAnyAvailableCategory`.
- [x] 2.9 RED: `getMaxOrder()` — GLOBAL max `order` across ALL categories (store-wide, no per-category concept — ADR-4, distinct from Product's per-category `getMaxOrder`, do NOT unify); `0` if none.
- [x] 2.10 GREEN: implement `getMaxOrder`.
- [x] 2.11 RED: `getAvailableProductCategories()` — active categories sorted ascending by `order`.
- [x] 2.12 GREEN: implement `getAvailableProductCategories`.
- [x] 2.13 RED (gotcha d): new sort test — `getAll()` returns categories sorted ascending by `order` (previously Map-insertion order); confirm existing CAT-01/CAT-03 tests stay green (order-insensitive assertions).
- [x] 2.14 GREEN: `getAll()` — add `.sort((a,b)=>a.order-b.order)`.
- [x] 2.15 RED (gotcha b): `getProductCategoriesView()` — seed active+inactive categories, products mixed `isActive`/`availableToSale`; assert `productsCount` = count where `isActive && availableToSale` (STRICTER than `getAvailableProductsByCategoryId`'s isActive-only — hand-derive a product that is `isActive` but NOT `availableToSale` and assert it's EXCLUDED from `productsCount` yet INCLUDED by `getAvailableProductsByCategoryId`); inactive categories excluded entirely from result; ascending `order`.
- [x] 2.16 GREEN: implement `getProductCategoriesView` per ADR-3 — instantiate `new ProductOfflineService(this.storeId)`, call its `getAll()` once, build `Map<categoryId,count>`, project over `getAvailableProductCategories()`.
- [x] 2.17 GREEN: `product-category-offline-service.ts` class declaration add `implements ProductCategoryService`.
- [x] 2.18 Gate: `pnpm test`, `tsc --noEmit`, `build`; commit `feat(domain,web-store-pos): extend ProductCategoryService + port hasAnyCategory/hasAnyAvailableCategory/getMaxOrder/getAvailableProductCategories/getProductCategoriesView + getAll sort fix`. Commit: `eb215c7`.

## Final: Full Regression Gate

- [x] 3.1 Grep-confirm `product-offline-service.ts` and `product-category-offline-service.ts` both declare `implements ProductService`/`implements ProductCategoryService`; confirm gotchas (b) stricter-predicate and (c) no-audit-stamp are each covered by a RED test with hand-derived expected values. Confirmed via grep; gotcha (b) covered by CAT-12 tests, gotcha (c) covered by PROD-12 tests.
- [x] 3.2 Full gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`, `pnpm -C apps/web-store-pos build` clean across both work units. Final: 1381 web-store-pos tests + 71 domain tests, tsc clean, build clean.
- [x] 3.3 Update this file with commit hashes; confirm commits-only delivery (no PR/push) on branch `feat/frontend-parity-audit`. Commits: `a32acbb` (WU1), `eb215c7` (WU2). No PR/push performed.

Next: sdd-verify (Slice 2).
