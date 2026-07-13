# Tasks: Product Category Online Parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~230 (WU1 ~215 new, WU2 ~15 changed) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single delivery, 2 work-unit commits |
| Delivery strategy | commits-only on `feat/frontend-parity-audit` (settled) |
| Chain strategy | n/a — no PRs, commits-only |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| WU1 | `ProductCategoryOnlineService` + `createProductCategoryService` factory + tests | 1 commit | Self-contained, dormant (flag false), zero runtime impact |
| WU2 | Rewire 3 call-sites to the factory | 1 commit | Behavior-identical while `USE_ONLINE_SERVICE:false`; `available.tsx` excluded (offline-only `getProductCategories()`, not on abstract surface) |

## Phase 1: ProductCategoryOnlineService (WU1)

- [x] 1.1 RED — `apps/web-store-pos/app/sales/lib/services/__tests__/product-category-online-service.test.ts`: mock `apiClient` (get/post/put/delete); assert each of the 5 methods issues the exact verb+URL+body and returns `response.data` verbatim: `getAvailableProductCategories` GET `/v1/ProductCategories/all/false`; `getProductCategoriesView` GET `/v1/ProductCategories/catalog`; `createProductCategory(name,order,isActive)` POST `/v1/ProductCategories/` body `{name,order,isActive}`; `updateProductCategory(id,name,order,isActive)` PUT `/v1/ProductCategories/{id}` (single slash, NOT `//`) body `{id,name,order,isActive}`; `getMaxOrder()` GET `/v1/ProductCategories/maxOrder` (single slash, NOT `//`). Add one failure-envelope passthrough test (no flattening). Done: file exists, all assertions RED (import fails / methods missing). DONE — RED confirmed (module resolution failure), then GREEN (9/9 tests pass).
- [x] 1.2 GREEN — Create `apps/web-store-pos/app/sales/lib/services/product-category-online-service.ts`: `export class ProductCategoryOnlineService implements ProductCategoryService`, no-args ctor, module-level `apiClient` import, `API_URL = '/v1/ProductCategories/'`, 5 methods per 1.1, URLs 4/5 NORMALIZED (single slash — DG-1). Class-level JSDoc documents the deliberate cross-sibling deviation from `ProductOnlineService` (which mirrors the `//` bug). Done: 1.1 GREEN.

## Phase 2: DI Factory (WU1)

- [x] 2.1 RED — `apps/web-store-pos/app/sales/lib/services/__tests__/product-category-service.factory.test.ts`: mock `~/shared/lib/http/api-client`; assert `createProductCategoryService('s1')` returns `ProductCategoryOfflineService` instance when `GlobalConfig.USE_ONLINE_SERVICE:false` (mock config via `vi.doMock`), returns `ProductCategoryOnlineService` instance when `true`, and the returned surface exposes `getMaxOrder`. Done: RED (module doesn't exist). DONE — RED confirmed, then GREEN (3/3 tests pass).
- [x] 2.2 GREEN — Create `apps/web-store-pos/app/sales/lib/services/product-category-service.factory.ts`: `createProductCategoryService(storeId): ProductCategoryService` = `GlobalConfig.USE_ONLINE_SERVICE ? new ProductCategoryOnlineService() : new ProductCategoryOfflineService(storeId)` (byte-for-byte `createProductService` shape). Done: 2.1 GREEN.

## Phase 3: Call-site rewiring (WU2)

- [x] 3.1 `apps/web-store-pos/app/sales/routes/products.tsx`: swap import (line 13) `ProductCategoryOfflineService` → `createProductCategoryService` from `../lib/services/product-category-service.factory`; swap line 41 `new ProductCategoryOfflineService(storeId)` → `createProductCategoryService(storeId)`.
- [x] 3.2 `apps/web-store-pos/app/sales/routes/sale.tsx`: same swap (import line 15, instantiation line 40), relative import path.
- [x] 3.3 `apps/web-store-pos/app/inventory/routes/egress.tsx`: same swap (import line 15, instantiation line 46), `~/sales/...` alias import path.
- [x] 3.4 Verify `products.test.tsx`, `sale.test.tsx`, `inventory-routes.test.tsx` (egress) pass GREEN unchanged (transparent-mock precedent — they mock `product-category-offline-service` module, factory resolves to the mock while flag is false). Add `vi.mock('~/shared/lib/http/api-client', ...)` ONLY if a suite fails on transitive import (not expected). DONE — 72 tests across the 3 files pass, zero mock edits needed.
- [x] 3.5 Confirm `apps/web-store-pos/app/inventory/routes/available.tsx` is left UNCHANGED (stays on `new ProductCategoryOfflineService(storeId)` — depends on offline-only `getProductCategories()`, not on the abstract surface; rewiring would break the TS build or silently swap all-categories for active-only). No test change. DONE — confirmed via `git diff` (empty).

## Phase 4: Verification

- [x] 4.1 Run `npx turbo run test` (web-store-pos + domain packages) — full suite GREEN, no regressions outside the 4 new/changed files. DONE — 117 test files, 1608 tests, all pass (FULL TURBO cache hit on re-run confirms no lingering issues).
- [x] 4.2 Commit WU1 (`feat(product-category-online-parity): add ProductCategoryOnlineService + createProductCategoryService factory`), commit WU2 (`refactor(product-category-online-parity): rewire products/sale/egress to createProductCategoryService`) — both on `feat/frontend-parity-audit`, no PR. DONE — commits `ab9a0aa` (WU1), `18c92d0` (WU2).
