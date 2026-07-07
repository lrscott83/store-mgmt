# Tasks: offline-online-service-parity — Slice 3 (Online Service Layer + Factories)

Governs spec-slice3 #690, design-slice3 #691 (ADR-1..7), proposal #671, decision #670. Strict TDD (init #64):
every method/behavior = RED→GREEN. Angular `frontend/` is sole source of truth; no live API consulted.
Slices 4-6 (auth, admin CRUD, infra) remain OUT of scope.

**Reorder note vs. design's suggested WU grouping:** design bundles "two factory files" into WU1, but a factory
cannot compile/test its online branch before `ProductOnlineService`/`ProductCategoryOnlineService` exist. To keep
each work unit's gate (`pnpm test` + `tsc --noEmit` + `build`) green standalone (tasks-writing rule: Phase N must not
depend on Phase N+1), the factories are moved to their own WU4, after both online services land. Types/helper/dead-code
retirement (no online-class dependency) stay in WU1.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-560 total (non-test ~180: domain types ~15, promisify-service ~15, product-online ~90, category-online ~80, 2 factories ~24, minus retired service-factory.ts ~-16; tests ~340) |
| 400-line budget risk | High |
| Chained PRs recommended | No (delivery is commits-only, program already `size:exception` per proposal #671) |
| Suggested split | WU1 → WU2 → WU3 → WU4 → Final regression, one commit per unit (single PR) |
| Delivery strategy | commits-only, no PR/push (hybrid persistence, work-unit commits) |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

**Decision needed before apply:** ADR-5 (`ProductOnlineService.activate`/`deactivate` — no Angular online endpoint).
Recommended: read-modify-PUT via the update route. Alternative: throw `NotImplemented` (strict Angular-online mirror).
WU2 task 2.1 is a hard STOP until this is confirmed.

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type | Dependency | Est. lines |
|------|------|-------------|------------|------------|
| 1 | `Promisify<S>` domain type + `promisify-service.ts` Proxy helper + retire dead `service-factory.ts`/test | feat | None (unblocks async types + mock seam) | ~90 |
| 2 | `ProductOnlineService` (`AsyncProductService`) + tests | feat | WU1 types | ~230 |
| 3 | `ProductCategoryOnlineService` (`AsyncProductCategoryService`) + tests | feat | WU1 types (independent of WU2) | ~200 |
| 4 | `createProductService`/`createProductCategoryService` factories + tests | feat | WU1 + WU2 + WU3 | ~64 |

## WU1: Promisify Type + promisify-service Helper + Retire Dead Factory — Req: online-service-layer, service-factories

- [ ] 1.1 RED: `packages/domain/src/services/__tests__/promisify.test.ts` — declare a fake class `implements AsyncProductService` (every member returns a `Promise`); compiles only once `Promisify<S>`/`AsyncProductService` exist (conformance oracle, mirrors Slice-1/2 pattern).
- [ ] 1.2 GREEN: `packages/domain/src/services/promisify.ts` — `Promisify<S>` mapped type + `AsyncProductService` + `AsyncProductCategoryService` aliases (ADR-1).
- [ ] 1.3 GREEN: `packages/domain/src/index.ts` — export the 3 new type symbols; `pnpm -C packages/domain build` (gotcha a — stale dist → "no exported member").
- [ ] 1.4 RED: `shared/lib/services/__tests__/promisify-service.test.ts` — `promisifyService(fakeSyncObj)` returns a Proxy; each method call resolves a `Promise` of the sync return value; args pass through unchanged.
- [ ] 1.5 GREEN: `shared/lib/services/promisify-service.ts` — `promisifyService<T>(sync: T): Promisify<T>` via `Proxy` (ADR-1).
- [ ] 1.6 RED/verify: grep-confirm zero production imports of `shared/lib/services/service-factory.ts` (only its own test) — re-verify spec ambiguity #4 at apply time.
- [ ] 1.7 GREEN: delete `shared/lib/services/service-factory.ts` + `shared/lib/services/__tests__/service-factory.test.ts` (ADR-7).
- [ ] 1.8 Gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`, `pnpm -C apps/web-store-pos build`; commit `feat(domain,web-store-pos): add Promisify type + promisify-service helper, retire dead service-factory.ts`.

## WU2: ProductOnlineService — Req: online-service-layer (ProductOnlineService endpoint surface, error handling)

- [ ] 2.1 **STOP — confirm ADR-5 before proceeding**: `activate`/`deactivate` have no Angular online endpoint. Confirm read-modify-PUT (recommended) vs. `throw NotImplemented`. Do not write 2.16-2.17 until resolved.
- [ ] 2.2 RED (`product-online-service.test.ts`, fake `{get,put,post,delete}` client): `getAll()` → `GET /v1/Products/all/false`, unwraps `res.data.items`.
- [ ] 2.3 GREEN: implement `getAll`.
- [ ] 2.4 RED: `getById(id)` found → `GET /v1/Products//{id}` (source-literal double slash), unwraps `res.data.data`.
- [ ] 2.5 GREEN: implement `getById` (no catch — errors propagate per spec/ADR-6).
- [ ] 2.6 RED: `getByBarcode(barcode)` → `GET /v1/Products/byBarcode/{barcode}`, unwraps `res.data.data`.
- [ ] 2.7 GREEN: implement `getByBarcode`.
- [ ] 2.8 RED: `getMaxOrder(categoryId)` → `GET /v1/Products/maxOrderByCategoryId/{categoryId}`, unwraps `res.data.data` (number).
- [ ] 2.9 GREEN: implement `getMaxOrder`.
- [ ] 2.10 RED: `getAvailableProductsByCategoryId(categoryId)` → `GET /v1/Products/availableByCategoryId/{categoryId}`, unwraps `res.data.items`.
- [ ] 2.11 GREEN: implement `getAvailableProductsByCategoryId`.
- [ ] 2.12 RED: `update(product)` → `PUT /v1/Products//{id}` body=product, resolves product (ADR-2, no field-specific variant).
- [ ] 2.13 GREEN: implement `update`.
- [ ] 2.14 RED: `delete(id)` → `DELETE /v1/Products//{id}`, resolves `void`.
- [ ] 2.15 GREEN: implement `delete`.
- [ ] 2.16 RED: `getByName(name)` derived over `getAll()` (ADR-4) — stub `client.get(all/false)` once, assert first-name-match resolves, assert exactly ONE fetch.
- [ ] 2.17 GREEN: implement `getByName`.
- [ ] 2.18 RED (post 2.1 sign-off): `activate(id)`/`deactivate(id)` per confirmed ADR-5 resolution — either `getById` then follow-up `PUT` with `isActive` toggled (missing id → no-op, no PUT), or asserts rejection if `NotImplemented` chosen.
- [ ] 2.19 GREEN: implement `activate`/`deactivate` per confirmed resolution.
- [ ] 2.20 RED: error propagation (ADR-6) — `mockRejectedValue(err)` on `getAll` and `update` → `rejects.toBe(err)`, no swallow/default.
- [ ] 2.21 GREEN: confirm no try/catch added anywhere in the class (should already pass).
- [ ] 2.22 GREEN: `class ProductOnlineService implements AsyncProductService { constructor(private client = apiClient) {} }` (DI-free mock seam, ADR-7).
- [ ] 2.23 Gate: `pnpm test`, `tsc --noEmit`, `build`; commit `feat(sales): add ProductOnlineService (AsyncProductService)`.

## WU3: ProductCategoryOnlineService — Req: online-service-layer (ProductCategoryOnlineService endpoint surface, error handling)

- [ ] 3.1 RED (`product-category-online-service.test.ts`): `getAll()` → `GET /v1/ProductCategories/all/false`, unwraps `res.data.items`.
- [ ] 3.2 GREEN: implement `getAll`.
- [ ] 3.3 RED: `getById(id)` → `GET /v1/ProductCategories//{id}`, unwraps `res.data.data`; errors propagate (no catch).
- [ ] 3.4 GREEN: implement `getById`.
- [ ] 3.5 RED: `getMaxOrder()` → `GET /v1/ProductCategories/maxOrder`, unwraps `res.data.data` (GLOBAL, not per-category — do NOT unify with Product's `getMaxOrder`).
- [ ] 3.6 GREEN: implement `getMaxOrder`.
- [ ] 3.7 RED: `getAvailableProductCategories()` → `GET /v1/ProductCategories/all/false` (SAME URL as `getAll`, spec amb #3), unwraps `res.data.items`.
- [ ] 3.8 GREEN: implement `getAvailableProductCategories`.
- [ ] 3.9 RED: `getProductCategoriesView()` → `GET /v1/ProductCategories/catalog`, unwraps `res.data.items`.
- [ ] 3.10 GREEN: implement `getProductCategoriesView`.
- [ ] 3.11 RED: `save(category)` branch (ADR-3) — `category.id` present → `PUT /v1/ProductCategories//{id}`; absent → `POST /v1/ProductCategories/`; resolves the passed category either way.
- [ ] 3.12 GREEN: implement `save`.
- [ ] 3.13 RED: `delete(id)` → `DELETE /v1/ProductCategories//{id}`, resolves `void`.
- [ ] 3.14 GREEN: implement `delete`.
- [ ] 3.15 RED: `getByName(name)` derived over `getAll()` (ADR-4) — one fetch, first-name-match.
- [ ] 3.16 GREEN: implement `getByName`.
- [ ] 3.17 RED: `hasAnyCategory()` derived: `getAll().length>0` (ADR-4).
- [ ] 3.18 GREEN: implement `hasAnyCategory`.
- [ ] 3.19 RED: `hasAnyAvailableCategory()` derived: `getAll().some(c => c.isActive)` (ADR-4).
- [ ] 3.20 GREEN: implement `hasAnyAvailableCategory`.
- [ ] 3.21 RED: error propagation (ADR-6) — `mockRejectedValue(err)` on `getAll` and `save` → `rejects.toBe(err)`.
- [ ] 3.22 GREEN: confirm no try/catch added anywhere in the class.
- [ ] 3.23 GREEN: `class ProductCategoryOnlineService implements AsyncProductCategoryService { constructor(private client = apiClient) {} }`.
- [ ] 3.24 Gate: `pnpm test`, `tsc --noEmit`, `build`; commit `feat(sales): add ProductCategoryOnlineService (AsyncProductCategoryService)`.

## WU4: Factories — Req: service-factories

- [ ] 4.1 RED: `shared/lib/services/__tests__/product-service.factory.test.ts` — `USE_ONLINE_SERVICE=false` → `createProductService(storeId)` returns a promisified offline instance whose `getAll()` resolves to what `ProductOfflineService(storeId).getAll()` returns; flip flag (module re-import, mirrors retired factory's own test pattern) → returns a `ProductOnlineService` instance.
- [ ] 4.2 GREEN: `shared/lib/services/product-service.factory.ts` — `createProductService(storeId): AsyncProductService` switching on `GlobalConfig.USE_ONLINE_SERVICE` (ADR-1/7).
- [ ] 4.3 RED: `shared/lib/services/__tests__/product-category-service.factory.test.ts` — same pattern for `createProductCategoryService`.
- [ ] 4.4 GREEN: `shared/lib/services/product-category-service.factory.ts` — `createProductCategoryService(storeId): AsyncProductCategoryService`.
- [ ] 4.5 Gate: `pnpm test`, `tsc --noEmit`, `build`; commit `feat(shared): add createProductService/createProductCategoryService factories`.

## Final: Full Regression Gate

- [ ] 5.1 Grep-confirm both online classes declare `implements AsyncProductService`/`implements AsyncProductCategoryService`; confirm task 2.1's ADR-5 sign-off decision matches the implemented `activate`/`deactivate` behavior.
- [ ] 5.2 Grep-confirm zero remaining repo references to `shared/lib/services/service-factory.ts` (spec ambiguity #4 final re-verify).
- [ ] 5.3 Full gate: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`, `pnpm -C apps/web-store-pos build` clean across all four work units.
- [ ] 5.4 Update this file with commit hashes; confirm commits-only delivery (no PR/push) on branch `feat/frontend-parity-audit`.

Next: sdd-verify (Slice 3).
