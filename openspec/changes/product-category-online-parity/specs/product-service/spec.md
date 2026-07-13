# Delta for product-service

Governs proposal `sdd/product-category-online-parity/proposal`, decision engram #1021
(gates DG-1/DG-2, ratified). Closes the sole remaining "Fase 2 — categories" parity gap: Angular
ships BOTH `ProductCategoryOfflineService` AND `ProductCategoryOnlineService`; React previously
shipped only the offline concrete. `openspec/specs/product-service/spec.md`'s "Category Service
Method Surface Parity" requirement already named the online concrete's 5-method surface (no
implementation existed yet) — this delta ADDS the implementation contract (HTTP shapes, DI
factory, call-site wiring) and MODIFIES the surface requirement to point at it. Angular
`frontend/src/app/application/categories/product-category-online.service.ts` remains the sole
source of truth; this is reference-only (parity rule 1) — never validated against a live backend.

## MODIFIED Requirements

### Requirement: Category Service Method Surface Parity
The React `ProductCategoryService` (interface + offline/online concretes) MUST expose EXACTLY
Angular's public category-service surface and nothing more (Exact-Surface Rule). Abstract interface:
`getProductCategoriesView`, `getAvailableProductCategories`, `createProductCategory(name, order,
isActive)`, `updateProductCategory(id, name, order, isActive)`, `getMaxOrder()`. The offline
concrete additionally exposes the offline-only public `getProductCategories()`
(product-category-offline.service.ts:40, NOT on the abstract interface). ALL of these methods —
the 5 abstract methods plus the offline-only `getProductCategories()` — are category C per
`service-return-shape-parity`'s taxonomy: each MUST return `Promise<BaseResponseModel<T>>`,
resolve-never-reject, never a bare synchronous value. The React-only members
`save`, `addByName`, `getByName`, `hasAnyCategory`, `hasAnyAvailableCategory` MUST be REMOVED — they
have no Angular category-SERVICE correlate (Angular exposes `getProductCategoryByName`,
`addProductCategoryByName`, `hasAnyCategory`, `hasAnyAvailableCategory` on the REPOSITORY, and has no
generic `save`). Their call sites are re-expressed per "Surface Reconciliation".

`ProductCategoryOnlineService` (`product-category-online-service.ts`) IS IMPLEMENTED — the 5-method
surface named above, HTTP-backed via the shared `apiClient`, no extras, matching Angular's own
online concrete which also declares no extras beyond the 5 (Angular's `getProductCategories`,
`updateProductCategories`, `getProductCategoryById` are commented out — not on ANY surface, rule
12). Its exact request/response shapes are governed by "ProductCategoryOnlineService HTTP
Contract" below, not by this requirement.
(Previously: the online concrete's 5-method surface was named in this requirement but had no
React implementation — `ProductCategoryOnlineService` did not exist.)

#### Scenario: Non-Angular category-service method rejected
- GIVEN a reviewer diffing the React `ProductCategoryService` surface against Angular
- WHEN the service (or interface) declares `save`, `addByName`, `getByName`, `hasAnyCategory`, or `hasAnyAvailableCategory`
- THEN the parity check MUST fail — those members belong to `ProductCategoryRepository`, not the service

#### Scenario: Category create/update expressed as Angular methods
- GIVEN the product-management UI saves a category (create or edit)
- WHEN it invokes the category service
- THEN it MUST call `createProductCategory(name, order, isActive)` or `updateProductCategory(id, name, order, isActive)` — NOT a generic `save(category)` (which MUST NOT exist)

#### Scenario: Online concrete declares no extras
- GIVEN the React `ProductCategoryOnlineService`
- WHEN its method surface is inspected
- THEN it MUST declare exactly the 5 abstract methods and MUST NOT declare `getProductCategories()`, `getProductCategoryById()`, or `updateProductCategories()` (Angular has these commented out, not on any surface)

### Requirement: Call-Site Parity
React call sites consuming `ProductService` MUST use the same logical operations as their Angular
counterparts: `getMaxOrder` (edit-product modal), `getAvailableProductsByCategoryId` +
`deleteProduct` (category product list), `getProductsToSelect` (inventory entry modal),
`hasAnyAvailableToSaleProduct` (login gate), `getProductsToSaleByCategoryId` (sale/egress
category products), `getProductById` (shopping cart), `createProducts`/`createCsvProducts`
(bulk/CSV import). Call sites MUST depend on the `ProductService` interface (via the
`createProductService(storeId)` factory), not a concrete `ProductOfflineService` type.

The 3 React call sites that consume ONLY the abstract `ProductCategoryService` surface —
`sales/routes/products.tsx`, `sales/routes/sale.tsx`, `inventory/routes/egress.tsx` — MUST
depend on the `ProductCategoryService` interface via the `createProductCategoryService(storeId)`
factory ("Category Offline/Online DI Selection" below), NOT direct `new
ProductCategoryOfflineService(storeId)` instantiation. This mirrors how the product sibling's call
sites were rewired to `createProductService` (product-service-parity, verify PASS 2026-07-09).

`inventory/routes/available.tsx` is EXCLUDED from this rewire and MUST keep its direct `new
ProductCategoryOfflineService(storeId)` instantiation. It calls the offline-concrete-only
`getProductCategories()` (all categories), which Angular deliberately keeps OFF both the abstract
`ProductCategoryService` interface and the online service (commented out in
`application/categories/product-category.service.ts` and `product-category-online.service.ts`).
Routing it through the abstract-typed factory would either break `tsc --noEmit` (method absent from
the interface) or silently switch to active-only categories — both parity violations (rule 12).

#### Scenario: CSV import route delegates to the service
- GIVEN the CSV import UI receives parsed rows
- WHEN it invokes the import operation
- THEN it MUST call `productService.createCsvProducts(rows)` rather than re-implementing category/order logic inline in the route component

#### Scenario: Category call sites resolve through the factory
- GIVEN a reviewer inspects `products.tsx`, `sale.tsx`, and `egress.tsx`
- WHEN checking how each obtains its category service instance
- THEN each MUST call `createProductCategoryService(storeId)` and MUST NOT instantiate `new ProductCategoryOfflineService(storeId)` directly

#### Scenario: available.tsx is excluded from the factory rewire
- GIVEN a reviewer inspects `inventory/routes/available.tsx`
- WHEN checking how it obtains its category service instance
- THEN it MUST keep `new ProductCategoryOfflineService(storeId)` because it consumes the offline-concrete-only `getProductCategories()` (all categories), which is absent from the abstract `ProductCategoryService` interface

#### Scenario: Rewired call sites are behavior-identical while offline
- GIVEN `GlobalConfig.USE_ONLINE_SERVICE` is `false` (current default)
- WHEN any of the 3 rewired routes resolves its category service via `createProductCategoryService(storeId)`
- THEN it MUST receive a `ProductCategoryOfflineService` instance behaviorally identical to the previous direct `new ProductCategoryOfflineService(storeId)` call — no observable UI/data change

## ADDED Requirements

### Requirement: ProductCategoryOnlineService HTTP Contract (normalized URLs)
`ProductCategoryOnlineService` implements `ProductCategoryService` against the shared `apiClient`
with base `API_URL = '/v1/ProductCategories/'`, mirroring Angular's method-by-method request shape.
Angular's `updateProductCategory` and `getMaxOrder` build their URL as `API_URL + '/' + suffix` on
top of the already-trailing-slash `API_URL`, producing a literal double slash
(`/v1/ProductCategories//{id}`, `/v1/ProductCategories//maxOrder` — ANGULAR-BUG-SUSPECT #5).
**Ratified (DG-1, decision engram #1021): the React port NORMALIZES these two URLs to a single
slash — it does NOT mirror the double slash.** This is the angular-bugs-policy DEFAULT (fix with
TDD), chosen over the literal-mirror exception. It intentionally DIVERGES from the sibling
`ProductOnlineService`, which mirrored the equivalent #5 double-slash bug verbatim — this
cross-sibling inconsistency is a known, logged follow-up (not part of this change). Every response
envelope MUST be returned verbatim (`BaseResponseModel<T>`, no client-side flattening or mapping),
matching the async contract (`Observable<T>` → `Promise<T>` is the only allowed transform).

| Method | HTTP verb | URL (normalized) | Body |
|--------|-----------|-------------------|------|
| `getAvailableProductCategories()` | GET | `/v1/ProductCategories/all/false` | — |
| `getProductCategoriesView()` | GET | `/v1/ProductCategories/catalog` | — |
| `createProductCategory(name, order, isActive)` | POST | `/v1/ProductCategories/` | `{ name, order, isActive }` |
| `updateProductCategory(id, name, order, isActive)` | PUT | `/v1/ProductCategories/{id}` (single slash) | `{ id, name, order, isActive }` |
| `getMaxOrder()` | GET | `/v1/ProductCategories/maxOrder` (single slash) | — |

#### Scenario: getAvailableProductCategories request shape
- GIVEN the app is in online mode
- WHEN `productCategoryService.getAvailableProductCategories()` is called
- THEN it MUST issue a GET to `/v1/ProductCategories/all/false` and return the `BaseResponseModel<ProductCategory[]>` envelope verbatim

#### Scenario: getProductCategoriesView request shape
- GIVEN the app is in online mode
- WHEN `productCategoryService.getProductCategoriesView()` is called
- THEN it MUST issue a GET to `/v1/ProductCategories/catalog` and return the `BaseResponseModel<ProductCategoryView[]>` envelope verbatim

#### Scenario: createProductCategory request shape
- GIVEN the app is in online mode
- WHEN `productCategoryService.createProductCategory("Bebidas", 1, true)` is called
- THEN it MUST issue a POST to `/v1/ProductCategories/` with body `{ name: "Bebidas", order: 1, isActive: true }`

#### Scenario: updateProductCategory URL is normalized (no double slash)
- GIVEN the app is in online mode
- WHEN `productCategoryService.updateProductCategory("C1", "Bebidas", 2, true)` is called
- THEN it MUST issue a PUT to `/v1/ProductCategories/C1` (single slash), NOT `/v1/ProductCategories//C1`, with body `{ id: "C1", name: "Bebidas", order: 2, isActive: true }`

#### Scenario: getMaxOrder URL is normalized (no double slash)
- GIVEN the app is in online mode
- WHEN `productCategoryService.getMaxOrder()` is called
- THEN it MUST issue a GET to `/v1/ProductCategories/maxOrder` (single slash), NOT `/v1/ProductCategories//maxOrder`

#### Scenario: Failure envelope preserved, not flattened
- GIVEN the backend responds with a failure envelope `{ data: null, succeeded: false, message: "", actionCode: 400, errors: [...] }` for any of the 5 methods
- WHEN `ProductCategoryOnlineService` returns the result
- THEN the envelope MUST be returned exactly as received — no flattening to a bare boolean/throw

### Requirement: Category Offline/Online DI Selection
`ProductCategoryService` MUST support selecting between `ProductCategoryOfflineService` and
`ProductCategoryOnlineService` implementations via a dependency-injection switch, mirroring
Angular's category `InjectionToken` + factory pattern and matching the already-shipped
`createProductService`/`ProductOnlineService` sibling. React exposes this via
`createProductCategoryService(storeId): ProductCategoryService`
(`product-category-service.factory.ts`), gated on `GlobalConfig.USE_ONLINE_SERVICE`: the online
branch ignores `storeId` (Angular's online category constructor takes only `HttpClient`, no store
concept); the offline branch forwards `storeId` to `ProductCategoryOfflineService`. Every
production call site MUST route through this factory rather than directly instantiating `new
ProductCategoryOfflineService(storeId)` (see "Call-Site Parity").

#### Scenario: Offline mode selects the offline implementation (default)
- GIVEN `GlobalConfig.USE_ONLINE_SERVICE` is `false`
- WHEN `createProductCategoryService(storeId)` is called
- THEN it MUST return a `ProductCategoryOfflineService` instance constructed with that `storeId`

#### Scenario: Online mode selects the online implementation
- GIVEN `GlobalConfig.USE_ONLINE_SERVICE` is `true`
- WHEN `createProductCategoryService(storeId)` is called
- THEN it MUST return a `ProductCategoryOnlineService` instance, with the same method surface as offline, and `storeId` MUST NOT be forwarded to it (it has no store concept)

#### Scenario: Factory typed as the interface, not a concrete class
- GIVEN a caller imports `createProductCategoryService`
- WHEN it inspects the return type
- THEN it MUST be `ProductCategoryService` (the interface), not `ProductCategoryOfflineService` or `ProductCategoryOnlineService` directly
