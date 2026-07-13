# Product Service — Product & Category Domain Service Specification

## Purpose

Define the verifiable contract that React's `ProductService` (offline + online),
`ProductRepository`, and `ProductCategoryRepository` MUST satisfy to be a
faithful parity port of Angular's `domain/interfaces/product.service.ts`,
`application/products/product-offline.service.ts`, `application/products/product-online.service.ts`,
`application/products/product.repository.ts`, and `application/categories/product-category.repository.ts`.
Source of truth = Angular source, not a live backend.

**THE NON-NEGOTIABLE EXACT-SURFACE RULE.** The React PUBLIC method surface MUST equal Angular's
public methods EXACTLY, per layer (interface / offline service / online service / repository).
- A method that exists in React but NOT in the corresponding Angular layer is DELETED from React.
  It is NEVER kept as "behavior-preserving" or "a documented extra", and we NEVER invent bridge
  methods (raw `upsert`/`remove`/etc.) to sustain it. Its call sites are re-expressed with
  Angular-faithful methods (see "Surface Reconciliation").
- Every Angular public method is migrated with 100% parity (same name, same params, same wrapped
  return shape). The ONLY allowed transform is `Observable<T>` → `Promise<T>` (playbook rule 3/4).
- "Public method" = declared on the abstract interface OR a public method on a concrete
  service/repository class. Private methods are not surface.

Three decisions are RESOLVED and baked into this spec (do not re-open):
1. Online `createProduct` mirrors Angular by OMITTING `barcode` from its payload while still
   implementing the 9-param interface for type conformance (see "Online createProduct Omits
   Barcode"). Mirrored, not fixed (rule 8).
2. A real `ProductCategoryRepository` is EXTRACTED in React mirroring Angular's
   `product-category.repository.ts` public surface EXACTLY (rule 6). It has NO `upsert`/`remove`
   (Angular's repository has none). `ProductCategoryOfflineService` is RECONCILED to
   expose ONLY Angular's public category-service surface and delegate to that repository (see
   "Category Service Method Surface Parity" + "ProductCategoryRepository Mirrors Angular Repo
   Surface").
3. React-only methods with no Angular correlate are REMOVED, not preserved: product-service
   `search`, `updateMany`, `getByName`, `activate`, `deactivate`; category-service `save`,
   `addByName`, `getByName`, `hasAnyCategory`, `hasAnyAvailableCategory` (see "Surface
   Reconciliation" for the authoritative list + call-site re-expressions).

**Return-shape classification (fold-in).** The async contract required throughout this spec —
`Promise<BaseResponseModel<T>>`, resolve-never-reject, never a bare value or thrown sentinel —
corresponds 1:1 to **category C** in `service-return-shape-parity`'s A/B/C/D return-shape
taxonomy. Product and ProductCategory are the two services that are 100% category C, across every
interface method on both.

Non-goals (explicitly out of scope, not specified here): the cross-cutting generic
`BaseService<T>` seam (`getAll`/`getById`/`delete` name reconciliation) used by the OTHER offline
services (Inventory, Order, Expense, SaleCredit) — owned by `service-return-shape-parity` as a
sync, React-only seam (see "BaseService-level `extends` — RETIRED for Product/ProductCategory"
below; Product/ProductCategory retire that seam entirely rather than reconcile it); fixing
suspected Angular bugs (see Suspected Bugs below — spec matches Angular's CURRENT behavior only).

## Surface Reconciliation (authoritative)

The single source of truth for "which methods exist". Cites Angular source. Everything below is
enforced by the Exact-Surface Rule.

### Authoritative Angular public surface — PRODUCT

| Layer | Public methods |
|-------|----------------|
| interface `ProductService` (domain/interfaces/product.service.ts:12-50) | `hasAnyAvailableToSaleProduct`, `getProductById`, `getProductByBarcode`, `getProductsToSelect`, `getAvailableProductsByCategoryId`, `deleteProduct`, `createCsvProducts`, `getProductsToSaleByCategoryId`, `createProduct(…9)`, `updateProduct(…10)`, `getMaxOrder(categoryId)`, `createProducts(categoryId, items)` (12) |
| offline concrete (product-offline.service.ts) | the 12 above + offline-only `setDiscountFromInvantory(id, discountFromInvantory)` (L113), `getProductsByCategoryId(categoryId)` (L118) |
| online concrete (product-online.service.ts) | the 12 (createProduct is 8-param, omits barcode from payload); no extras |
| repository `ProductRepository` (product.repository.ts) | `getProductById`, `getProductByName`, `getProductByBarcode`, `getAvailableProducts`, `getAvailableProductById`, `hasAnyProduct`, `getProductsByCategoryId`, `getAvailableToSaleProductsByCategoryId`, `hasAnyAvailableToSaleProduct`, `addProduct`, `addProductData`, `addImportedProduct`, `updateProduct`, `updateImportedProduct`, `deleteProduct`, `setDiscountFromInvantory`, `activateProduct`, `deactivateProduct`, `updateProducts`, `setInitProducts`, `getStorageProductsMap`, `getProductsJson` |

### Authoritative Angular public surface — PRODUCT CATEGORY

| Layer | Public methods |
|-------|----------------|
| interface `ProductCategoryService` (product-category.service.ts:11-28) | `getProductCategoriesView`, `getAvailableProductCategories`, `createProductCategory(name, order, isActive)`, `updateProductCategory(id, name, order, isActive)`, `getMaxOrder()` (5) |
| offline concrete (product-category-offline.service.ts) | the 5 above + offline-only public `getProductCategories()` (L40) |
| online concrete (product-category-online.service.ts) | `getAvailableProductCategories`, `getProductCategoriesView`, `createProductCategory`, `updateProductCategory`, `getMaxOrder`; no extras |
| repository `ProductCategoryRepository` (product-category.repository.ts) | `hasAnyAvailableCategory`, `getProductCategoryById`, `getProductCategoryByName`, `getProductCategories`, `getAvailableProductCategories`, `hasAnyCategory`, `addProductCategory`, `addProductCategoryByName`, `addProductCategoryData`, `updateProductCategory`, `activateProductCategory`, `deactivateProductCategory`, `addImportedProductCategory`, `updateImportedProductCategory`, `updateCategories`, `setInitCategories`, `getStorageCategoriesMap`, `getCategoriesJson` — **NO `upsert`, NO `remove`** |

### React methods REMOVED (no Angular correlate on that layer) + call-site re-expression

| React member | Layer | Verdict | Angular-faithful re-expression |
|--------------|-------|---------|-------------------------------|
| `search(query)` | product offline | REMOVED — dead, zero call sites | none (method + its unit test deleted) |
| `updateMany(products)` | product offline | REMOVED — no correlate | `products.tsx handleBulkSave` loops `updateProduct` per item |
| `getByName(name)` | product interface/offline | REMOVED — Angular exposes `getProductByName` on the REPOSITORY only | moved to `ProductRepository.getProductByName`; zero service call sites |
| `activate(id)` / `deactivate(id)` | product interface/offline | REMOVED — Angular exposes `activateProduct`/`deactivateProduct` on the REPOSITORY only | moved to `ProductRepository`; zero service call sites |
| `save(category)` | category interface/offline | REMOVED — Angular has no generic category save | `products.tsx handleCategorySave` → `createProductCategory` (create) / `updateProductCategory` (update) |
| `addByName(name)` | category offline | REMOVED — Angular exposes `addProductCategoryByName` on the REPOSITORY only | folded into `ProductService.createCsvProducts` |
| `getByName(name)` | category interface/offline | REMOVED — Angular exposes `getProductCategoryByName` on the REPOSITORY only | absorbed by `createCsvProducts` |
| `hasAnyCategory()` | category interface/offline | REMOVED — Angular REPOSITORY-only | no service call sites |
| `hasAnyAvailableCategory()` | category interface/offline | REMOVED — Angular REPOSITORY-only | `user-home.ts` gate → `ProductService.hasAnyAvailableToSaleProduct()` |

### React methods ADDED (Angular public method previously missing in React) — 100% parity

`hasAnyAvailableToSaleProduct`, `getProductsToSelect`, `getProductsToSaleByCategoryId`,
`createCsvProducts`, `createProducts`, offline-only `setDiscountFromInvantory`, offline-only
`getProductsByCategoryId` (product layer); `createProductCategory(name, order, isActive)`,
`updateProductCategory(id, name, order, isActive)`, offline-only `getProductCategories()`
(category layer, replacing `getAll()` call sites).

### BaseService-level `extends` — RETIRED for Product/ProductCategory

`getAll`/`getById`/`delete` on the reduced React `BaseService<T>` do NOT match Angular's
`getAllItems`/`getItemById`/`delete`, and Angular's category service exposes no `getById`/`getAll`/
`delete` correlate at all (`product-category.service.ts:21` even comments out
`getProductCategoryById`). Reconciling the GENERIC `BaseService<T>` surface used by the OTHER
offline services (Inventory, Order, Expense, SaleCredit) remains cross-cutting and is owned by
`service-return-shape-parity`, which resolves it there as a sync, React-only seam OUTSIDE its
A/B/C/D conversion. For Product AND ProductCategory SPECIFICALLY the seam is dead weight, not a
name left to reconcile: both interfaces are 100% category C (`Promise<BaseResponseModel<T>>`),
neither ever calls the inherited sync `getAll`/`getById`/`delete`/`create`/`update` members, and
the abstract `ProductCategoryService` has no method for them to map onto. Both `ProductService`
and `ProductCategoryService` are standalone (no `extends BaseService<T>`); product/category reads
use their Angular names, and `getAll()` category call sites use `getProductCategories()`.

## Requirements

### Requirement: Service Method Signature Parity
The abstract `ProductService` surface is EXACTLY these 12 methods (Angular
`domain/interfaces/product.service.ts:13-49`), matching Angular's name, parameter list, and return
shape. The only allowed transform is `Observable<BaseResponseModel<T>>` →
`Promise<BaseResponseModel<T>>`. Both `ProductOfflineService` and `ProductOnlineService` MUST
implement all 12.

| # | Angular (source) | Required name/params | Return |
|---|---|---|---|
| 1 | `hasAnyAvailableToSaleProduct()` (product.service.ts:13) | same | `Promise<BaseResponseModel<boolean>>` |
| 2 | `getProductById(id)` (L14) | same (not `getById`) | `Promise<BaseResponseModel<Product>>` |
| 3 | `getProductByBarcode(barcode)` (L15) | same (not `getByBarcode`) | `Promise<BaseResponseModel<Product>>` |
| 4 | `getProductsToSelect()` (L16) | same | `Promise<BaseResponseModel<ProductSelectView[]>>` |
| 5 | `getAvailableProductsByCategoryId(categoryId)` (L17) | same | `Promise<BaseResponseModel<Product[]>>` |
| 6 | `deleteProduct(id)` (L18) | same (not `delete`) | `Promise<BaseResponseModel<boolean>>` |
| 7 | `createCsvProducts(csvProducts)` (L19) | same | `Promise<BaseResponseModel<boolean>>` |
| 8 | `getProductsToSaleByCategoryId(categoryId)` (L21) | same | `Promise<BaseResponseModel<Product[]>>` |
| 9 | `createProduct(categoryId, name, price, businessId, order, isActive, availableToSale, discountFromInvantory, barcode?)` (L23-33) | same 9 positional args (not `create(object)`). Online payload asymmetry — see "Online createProduct Omits Barcode" | `Promise<BaseResponseModel<boolean>>` |
| 10 | `updateProduct(id, categoryId, name, price, businessId, order, isActive, availableToSale, discountFromInvantory, barcode?)` (L35-46) | same 10 positional args (not `update(entity)`) | `Promise<BaseResponseModel<boolean>>` |
| 11 | `getMaxOrder(categoryId)` (L48) | same | `Promise<BaseResponseModel<number>>` |
| 12 | `createProducts(categoryId, items: {name, price}[])` (L49) | same | `Promise<BaseResponseModel<boolean>>` |

`setDiscountFromInvantory` and `getProductsByCategoryId` are NOT part of this abstract surface —
they are offline-only public methods (see "Offline-Only Public Methods (Offline/Online
Asymmetry)"). `activateProduct`/`deactivateProduct` are NOT service methods at all — they are
`ProductRepository` members exposed by NO service (see "Repository-Only Activate/Deactivate"), so
the React `ProductService` interface/services MUST NOT declare them.

Inherited-but-dead `BaseService` members (`create`, `getAllItems`, `getItemById`, `update`,
`delete`, `deleteItems`, `fetch`, `items$`, `isLoading$`, etc.) have zero Product call sites in
Angular and MUST NOT be required in the React port.

#### Scenario: Renamed method rejected
- GIVEN a code reviewer diffing the React `ProductService` interface against this table
- WHEN any required method is missing, renamed, or has a different parameter shape (e.g. `create(obj)` instead of `createProduct(...9 args)`)
- THEN the parity check MUST fail

#### Scenario: Repository-only member declared on the service rejected
- GIVEN the React `ProductService` interface (or either implementation)
- WHEN it declares `activateProduct`/`deactivateProduct` (which no Angular service exposes)
- THEN the parity check MUST fail — those members belong to `ProductRepository` only

### Requirement: Offline-Only Public Methods (Offline/Online Asymmetry)
Angular's `ProductOfflineService` exposes TWO public methods beyond the 12 abstract ones:
`setDiscountFromInvantory(id, discountFromInvantory)` (product-offline.service.ts:113) and
`getProductsByCategoryId(categoryId)` (product-offline.service.ts:118). Neither exists on the
abstract `ProductService` NOR on `ProductOnlineService`. The React port MUST mirror this asymmetry
faithfully (rule 7): both methods MUST exist on `ProductOfflineService` only, and the port MUST NOT
invent online HTTP endpoints for them (that would be an improvement, not parity — rule 2).

#### Scenario: Offline-only method absent from online service
- GIVEN the React `ProductOnlineService`
- WHEN its method surface is compared to `ProductOfflineService`
- THEN it MUST NOT declare `setDiscountFromInvantory` or `getProductsByCategoryId`, and no `Products/` endpoint MUST be invented for them

### Requirement: Online createProduct Omits Barcode (mirrored Angular asymmetry)
Angular's `ProductOnlineService.createProduct` (product-online.service.ts:71-93) declares only 8
parameters — it OMITS the `barcode?` parameter that the abstract interface and
`ProductOfflineService` both declare, and its POST body carries no `barcode` field. (Angular's
online `updateProduct` DOES send `barcode`; only `createProduct` drops it.) This is a suspected
Angular asymmetry that is MIRRORED, NOT fixed (rule 8, resolved decision: mirror). To satisfy
type conformance with the shared `ProductService` interface, React's `ProductOnlineService`
`createProduct` MUST implement the full 9-parameter signature (accepting `barcode?`), but MUST NOT
include `barcode` in the HTTP payload — replicating Angular online's exact wire behavior.

#### Scenario: Online create request excludes barcode
- GIVEN the app is in online mode
- WHEN `productService.createProduct(categoryId, name, price, businessId, order, true, true, false, "7501234")` is called
- THEN the POST body sent to `Products/` MUST NOT contain a `barcode` field (mirroring Angular), even though the method accepted a `barcode` argument

### Requirement: Async Contract (Offline and Online)
Every method MUST return a `Promise` on BOTH `ProductOfflineService` and `ProductOnlineService`.
Angular's offline implementation is itself `Observable`-based (one-shot, via `of(...)`) for all 12
abstract methods — never a raw synchronous value and never a multi-emission stream. The React
port MUST NOT make offline synchronous.

#### Scenario: Offline read resolves asynchronously
- GIVEN `ProductOfflineService.getProductById(id)` is called with an existing product id
- WHEN the call resolves
- THEN it MUST resolve a `Promise<BaseResponseModel<Product>>` with `succeeded: true` and `data` set to the product (never a synchronous return)

### Requirement: Error-Envelope Contract
On failure, every method MUST reject/resolve with the Angular `BaseResponseModel<T>` shape:
`{ data: null, succeeded: false, message: string, actionCode: 400, errors: BaseError[] }`
(base.model.ts:17-28, base.service.ts:218-236 `Failure`/`Failure$`). On success:
`{ data, succeeded: true, message: "", actionCode: 200, errors: [] }` (base.service.ts:204-216).
`BaseError` = `{ code: string, description: string }`. Errors originate from
`ProductErrors`/`ProductCategoryErrors` static instances (product.errors.ts) — the exact `code`
and `description` MUST be preserved, not re-flattened into a generic string/undefined.

#### Scenario: Barcode not unique on create
- GIVEN a product already exists with barcode `"7501234"`
- WHEN `createProduct(categoryId, name, price, businessId, order, true, true, false, "7501234")` is called
- THEN the result MUST be `{ data: null, succeeded: false, message: "", actionCode: 400, errors: [{ code: "Product.BarcodeExists", description: "El código de barras ya está asociado a otro producto." }] }`

#### Scenario: Product not found on getProductById
- GIVEN no product exists with id `"missing-id"`
- WHEN `getProductById("missing-id")` is called
- THEN the result MUST be a `BaseResponseModel` failure with `errors: [ProductErrors.NotExists]` (code `"Product.NotExists"`), never `undefined` or a thrown exception

### Requirement: Category-Exists Validation
`createProduct` and `updateProduct` MUST validate that `categoryId` resolves to an existing
`ProductCategory` before persisting (product.repository.ts:112,207). If not found, MUST fail with
`ProductCategoryErrors.NotExists` and MUST NOT create/update the product.

#### Scenario: Create with non-existent category
- GIVEN `categoryId` does not match any stored category
- WHEN `createProduct(categoryId, ...)` is called
- THEN it MUST fail with `errors: [ProductCategoryErrors.NotExists]` and no product MUST be persisted

### Requirement: Barcode-Uniqueness Validation
On create, if `barcode` is provided and matches an existing product's barcode, MUST fail with
`ProductErrors.BarcodeExists` (repository.ts:115-118). On update, the same check MUST apply but
MUST exclude the product being updated itself via id (self-exclusion, repository.ts:213-218) —
i.e. re-saving a product with its own unchanged barcode MUST succeed.

#### Scenario: Update product keeping its own barcode
- GIVEN product `P1` has barcode `"111"`
- WHEN `updateProduct(P1.id, ..., barcode="111")` is called
- THEN it MUST succeed (barcode collision check MUST exclude `P1.id`)

### Requirement: Name-Uniqueness-Per-Category Validation
On create, a product with the same `name` in the same `categoryId` MUST fail with
`ProductErrors.NameExists` (repository.ts:120-121). On update, the same rule applies excluding the
product's own id (repository.ts:220-221).

#### Scenario: Duplicate name in same category
- GIVEN a product named `"Cola"` already exists in category `C1`
- WHEN `createProduct(C1, "Cola", ...)` is called
- THEN it MUST fail with `errors: [ProductErrors.NameExists]`

### Requirement: Order-Shift on Create/Update
When creating or updating a product at a given `order` within its category, every OTHER product
in the same category with `order >= order` MUST have its `order` incremented by 1
(`updateProductsOrderByCategory`, repository.ts:187-191, invoked at L141 create / L237 update).
The saved product's own `order` MUST end up exactly equal to the requested `order` (Angular
reassigns it after the shift at L142/L238 — suspected bug: redundant but currently
correct; mirrored, not simplified).

#### Scenario: Insert at existing order shifts siblings
- GIVEN category `C1` has products at orders `[1, 2, 3]`
- WHEN a new product is created in `C1` at `order: 2`
- THEN the two products previously at orders `2` and `3` MUST now be at `3` and `4`, and the new product MUST be at `order: 2`

### Requirement: Soft-Delete Semantics
`deleteProduct(id)` MUST NOT remove the record. It MUST set `isActive: false` plus stamp
`updatedDate` (now) and `updatedByName` (current user), and return `true` (repository.ts:88-98).
If the id does not exist, MUST return `false` without throwing.

#### Scenario: Delete existing product
- GIVEN product `P1` exists and is active
- WHEN `deleteProduct(P1.id)` is called
- THEN `P1.isActive` MUST become `false`, `updatedDate`/`updatedByName` MUST be stamped, and the result MUST resolve `{ succeeded: true, data: true }`

### Requirement: Repository-Only Activate/Deactivate (NOT service-exposed)
`activateProduct(id)`/`deactivateProduct(id)` are `ProductRepository` members ONLY
(repository.ts:279-285), delegating to the private `updateProductActive` (repository.ts:270-277).
In Angular NO service (offline, online, or the abstract interface) exposes them — they have zero
service call sites. The React `ProductRepository` MUST provide them (layer parity, rule 6) but the
React `ProductService` interface and BOTH implementations MUST NOT declare them. On the repository
they MUST toggle only `isActive` and MUST NOT stamp `updatedDate`/`updatedByName` — deliberately
different from soft-delete. Missing id MUST fail with `ProductErrors.NotExists`.

`ProductCategoryRepository.activateProductCategory(id)`/`deactivateProductCategory(id)` are
1-PARAM (not 2-param like Angular's `(id, isActive)`) — Angular's `isActive` parameter is dead
code (never read; the body always hardcodes `true`/`false`), so the React repository FIXES this
dead parameter rather than mirroring it (angular-bugs-policy: fix genuine defects, don't replicate
them).

#### Scenario: Activate does not touch audit fields
- GIVEN an inactive product `P1` with `updatedDate: undefined`
- WHEN `ProductRepository.activateProduct(P1.id)` is called
- THEN `P1.isActive` MUST become `true` and `updatedDate`/`updatedByName` MUST remain unchanged

#### Scenario: No service surface for activate/deactivate
- GIVEN the React `ProductService` interface and its offline/online implementations
- WHEN their public method surface is inspected
- THEN none MUST expose `activateProduct`/`deactivateProduct` — these are reachable only via `ProductRepository`

### Requirement: setDiscountFromInvantory (OFFLINE-ONLY)
`setDiscountFromInvantory(id, discountFromInvantory)` exists ONLY on `ProductOfflineService`
(product-offline.service.ts:113-116) — it is NOT on the abstract `ProductService` and NOT on
`ProductOnlineService`. The offline service method delegates to
`ProductRepository.setDiscountFromInvantory` (repository.ts:261-268), which MUST update ONLY the
`discountFromInvantory` flag on the product (no audit stamps, no order changes). Missing id MUST
fail with `ProductErrors.NotExists`. The React port MUST NOT add an online implementation nor a
`Products/` endpoint for this method (asymmetry mirrored, rule 7).

#### Scenario: Toggle discount flag (offline)
- GIVEN product `P1` has `discountFromInvantory: false`
- WHEN `ProductOfflineService.setDiscountFromInvantory(P1.id, true)` is called
- THEN `P1.discountFromInvantory` MUST become `true` and the result MUST succeed

#### Scenario: Not present on the online service
- GIVEN the React `ProductOnlineService`
- WHEN its method surface is inspected
- THEN it MUST NOT declare `setDiscountFromInvantory`

### Requirement: hasAnyAvailableToSaleProduct
MUST return `true` only if there is at least one available category (delegated to
`ProductCategoryRepository.hasAnyAvailableCategory()`) AND at least one product with
`isActive && availableToSale` (repository.ts:84-86).

#### Scenario: No available category
- GIVEN no product category is available
- WHEN `hasAnyAvailableToSaleProduct()` is called
- THEN it MUST resolve `{ succeeded: true, data: false }` regardless of product state

### Requirement: getProductsToSelect
MUST return a flat `ProductSelectView[]` (`{ id, fullName }` where `fullName =
"{categoryName} - {name}"`), built only from ACTIVE products (`getAvailableProducts`), grouped by
category in category iteration order, and within each category sorted by product `order`
(product-offline.service.ts:133-157).

#### Scenario: Grouped and ordered by category then product order
- GIVEN two categories each with two active products at orders `[2, 1]`
- WHEN `getProductsToSelect()` is called
- THEN results MUST be grouped per category (in category order) with each category's products sorted ascending by `order`

### Requirement: getProductsByCategoryId (OFFLINE-ONLY, unfiltered by state)
`getProductsByCategoryId(categoryId)` is an offline-only public method
(product-offline.service.ts:118-121) that returns ALL products in `categoryId` regardless of
`isActive`/`availableToSale`, sorted by `order` (delegates to
`ProductRepository.getProductsByCategoryId`, repository.ts:72-76; the offline service wraps the
result — or `[]` — in a Success envelope). It is NOT on the abstract interface and NOT on
`ProductOnlineService`; the port MUST NOT invent an online endpoint for it (rule 7). This is the
LEAST-filtered of the three category-query methods:
- `getProductsByCategoryId` → all products (no state filter)
- `getAvailableProductsByCategoryId` → `isActive` only
- `getProductsToSaleByCategoryId` → `isActive && availableToSale`

All three MUST exist as separate methods with separate filters, not collapsed into one.

#### Scenario: Returns inactive products too
- GIVEN category `C1` has one active and one inactive product
- WHEN `ProductOfflineService.getProductsByCategoryId(C1)` is called
- THEN BOTH products MUST be returned (sorted by `order`), unlike `getAvailableProductsByCategoryId(C1)` which excludes the inactive one

### Requirement: getProductsToSaleByCategoryId
MUST return only products in `categoryId` with `isActive && availableToSale` (delegates to
`getAvailableToSaleProductsByCategoryId`, repository.ts:78-82), sorted by `order`. This is
DISTINCT from `getAvailableProductsByCategoryId` (isActive-only, no `availableToSale` filter) —
both MUST exist as separate methods with separate filters, not collapsed into one.

**Suspected Angular bug (mirrored, not fixed):** the offline service applies a REDUNDANT second
`.filter(p => p.availableToSale)` (product-offline.service.ts:130) on top of the repository query
that already filters `isActive && availableToSale` (repository.ts:80). The double filter is
currently harmless but redundant; mirrored, not simplified.

#### Scenario: availableToSale filter excludes inactive-for-sale products
- GIVEN category `C1` has an active product with `availableToSale: false`
- WHEN `getProductsToSaleByCategoryId(C1)` is called
- THEN that product MUST NOT be in the result, but MUST appear in `getAvailableProductsByCategoryId(C1)`

### Requirement: createProducts (bulk create with auto-order)
For each `{name, price}` item, MUST compute the next order via `getMaxOrder(categoryId) + 1`
(getNextOrder, product-offline.service.ts:164-167) BEFORE adding the next item (so multiple items
in the same call get sequential increasing orders), and call the same create-with-validation path
as `createProduct` (isActive/availableToSale/discountFromInvantory hardcoded `true`, businessId
`''`). Per-item failures MUST NOT abort remaining items (matches Angular's current best-effort
loop, product-offline.service.ts:64-72).

**Suspected Angular bug (mirrored, not fixed):** on any per-item failure the overall result is
`Failure$([])` — an EMPTY errors array, discarding which item(s) failed and why. This exact
(uninformative) shape is required to match Angular's current behavior.

#### Scenario: Multiple items get sequential orders
- GIVEN category `C1` currently has max order `3`
- WHEN `createProducts(C1, [{name:"A",price:1},{name:"B",price:2}])` is called
- THEN `"A"` MUST be created at `order: 4` and `"B"` at `order: 5`

#### Scenario: Partial failure returns empty errors array (matches Angular)
- GIVEN one of two items has a name collision
- WHEN `createProducts(...)` is called
- THEN the result MUST be `{ succeeded: false, data: null, errors: [] }` (not the specific validation error) — this mirrors Angular's current (suspected-buggy) behavior

### Requirement: createCsvProducts (service-owned orchestration)
MUST be implemented as a `ProductService` method (not UI/route-layer logic). For each CSV row,
MUST resolve the category by name via `ProductCategoryRepository`, creating it if absent
(`addProductCategoryByName`), then create the product using the same next-order + validation path
as `createProducts` (product-offline.service.ts:74-84). Same suspected-bug note as
`createProducts`: overall failure returns `errors: []`. The `CsvProduct` model is byte-identical
to Angular's `{category, name, price}` — no `barcode` field.

#### Scenario: CSV row creates missing category
- GIVEN no category named `"Snacks"` exists
- WHEN `createCsvProducts([{category:"Snacks", name:"Chips", price:10}])` is called
- THEN a new category `"Snacks"` MUST be created and the product MUST be added to it at the next order

### Requirement: Repository-vs-Service Ownership Boundary
The React port MUST split responsibilities exactly as Angular does, with a dedicated
`ProductRepository` owning persistence + business rules and `ProductOfflineService` owning
orchestration only. Members MUST live on the correct layer:

**`ProductRepository`-owned (persistence + rules):**
- `addProduct`/`addProductData` create path with the 3 validations (category-exists,
  barcode-uniqueness, name-uniqueness-per-category) and order-shift
- `updateProduct` update path (same 3 validations with self-exclusion + order-shift +
  redundant double order-assign)
- `deleteProduct` soft-delete (isActive=false + audit stamps)
- `setDiscountFromInvantory` persistence
- `activateProduct`/`deactivateProduct` (+ private `updateProductActive`) — repository-only
- read/query helpers: `getProductById`, `getProductByName`, `getProductByBarcode`,
  `getProductsByCategoryId`, `getAvailableToSaleProductsByCategoryId`, `getAvailableProducts`,
  `getAvailableProductById`, `hasAnyProduct`, `hasAnyAvailableToSaleProduct`
- `updateProductsOrderByCategory` (private order-shift)

**`ProductOfflineService`-owned (orchestration, delegates to repository):**
- `createProducts` / `createCsvProducts` loops (per-item `getNextOrder` + delegate to
  `addProduct`; CSV also resolves/creates category via `ProductCategoryRepository`)
- `getProductsToSelect` grouping (categories from `ProductCategoryRepository`, active products
  from `ProductRepository`)
- `getMaxOrder` (Math.max over `getProductsByCategoryId`) and private `getNextOrder`
- envelope-composing wrappers over repository queries (e.g. `getAvailableProductsByCategoryId`
  applies the `isActive` filter over `ProductRepository.getProductsByCategoryId`)

The offline service MUST NOT re-implement persistence or validation inline; the repository MUST NOT
own loop/grouping orchestration.

`getAvailableProductById(id: string)` MUST return type `Product | null` — NOT `Product | undefined`
— returning `null` (not `undefined`) whenever the product does not exist or is inactive, mirroring
Angular's `product.repository.ts:50-53` literally and matching its own React siblings
`getProductByName`/`getProductByBarcode` (both already `Product | null`). This closes a React-only
internal inconsistency (2 of 3 "not found" repository methods already returned `null`; this was the
outlier).

#### Scenario: Validation lives in the repository, not the service
- GIVEN a reviewer traces where `ProductErrors.NameExists` is produced on create
- WHEN they inspect the layers
- THEN the name-uniqueness check MUST be in `ProductRepository`, and `ProductOfflineService.createProduct` MUST only map the repository `Result` to a Success/Failure envelope

#### Scenario: getAvailableProductById returns null for an inactive product
- GIVEN a product `P1` exists with `isActive: false`
- WHEN `getAvailableProductById("P1")` is called
- THEN it MUST return `null` (not `undefined`)

#### Scenario: getAvailableProductById returns null for a non-existent product
- GIVEN no product with id `"missing"` exists
- WHEN `getAvailableProductById("missing")` is called
- THEN it MUST return `null` (not `undefined`)

### Requirement: ProductRepository Depends on ProductCategoryRepository
Mirroring Angular (repository.ts:22 injects `ProductCategoryRepository`;
product-offline.service.ts:20 also injects it), the React product layer MUST depend on a dedicated
`ProductCategoryRepository`, NOT on `ProductCategoryOfflineService`. `ProductRepository`'s
constructor takes a MANDATORY `ProductCategoryRepository` argument (Angular DI parity — no
optional-with-default; all call sites pass an explicit instance). The category-repository surface
consumed by the product layer MUST include at least: `getProductCategoryById` (category-exists
validation, repository.ts:112/207), `hasAnyAvailableCategory`
(`hasAnyAvailableToSaleProduct`, repository.ts:85), `getProductCategories`
(`getProductsToSelect`, product-offline.service.ts:134), `getProductCategoryByName` and
`addProductCategoryByName` (`createCsvProducts`, product-offline.service.ts:77-78).

#### Scenario: Category resolution goes through the category repository
- GIVEN `createProduct(categoryId, ...)` is called with a non-existent `categoryId`
- WHEN the create path runs its category-exists validation
- THEN it MUST call `ProductCategoryRepository.getProductCategoryById(categoryId)` and fail with `ProductCategoryErrors.NotExists` when it returns nothing

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

### Requirement: Call-Site Parity
React call sites consuming `ProductCategoryService` MUST use the same logical operations as their Angular
counterparts. The 3 React call sites that consume ONLY the abstract `ProductCategoryService` surface —
`sales/routes/products.tsx`, `sales/routes/sale.tsx`, `inventory/routes/egress.tsx` — MUST
depend on the `ProductCategoryService` interface via the `createProductCategoryService(storeId)`
factory ("Category Offline/Online DI Selection" above), NOT direct `new
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

### Requirement: ProductCategoryRepository Mirrors Angular Repo Surface (no upsert/remove)
The extracted React `ProductCategoryRepository` MUST mirror Angular's
`application/categories/product-category.repository.ts` public surface EXACTLY:
`hasAnyAvailableCategory`, `getProductCategoryById`, `getProductCategoryByName`,
`getProductCategories`, `getAvailableProductCategories`, `hasAnyCategory`, `addProductCategory`,
`addProductCategoryByName`, `addProductCategoryData`, `updateProductCategory`, `activateProductCategory`,
`deactivateProductCategory`, `getCategoriesJson` (+ import/sync helpers `addImportedProductCategory`,
`updateImportedProductCategory`, `updateCategories`, `setInitCategories`, `getStorageCategoriesMap`).
Angular's repository has NO generic `upsert` and NO `remove`; the React repository MUST NOT declare
them. Write operations go exclusively through `addProductCategory`/`updateProductCategory`/
`activateProductCategory`/`deactivateProductCategory`.

`addProductCategoryByName(name: string)` MUST return type `string` — NOT `string | null` — and
MUST always return the generated id, even when the internal `addProductCategoryData` call fails
(e.g. on a name collision), mirroring Angular's `product-category.repository.ts:94-98` literally
including its always-truthy-Result dead-branch behavior. This is a DELIBERATE, user-ratified
exception to the project's default angular-bugs-policy (bugs are normally fixed, not replicated) —
see decision engram #842: no call-site in either Angular or React branches on a `null` result, so
literal 1:1 parity was chosen over silently keeping React's (unratified) fix. `activateProductCategory`/
`deactivateProductCategory` remain 1-param (dead 2nd `isActive` param dropped) — unchanged,
previously ratified (Phase 1 WU1.9).

#### Scenario: Invented repository bridge rejected
- GIVEN the extracted React `ProductCategoryRepository`
- WHEN it declares `upsert(category)` or `remove(id)` (to keep the old service `save`/`delete` alive)
- THEN the parity check MUST fail — Angular's repository has neither; those bridges are forbidden

#### Scenario: addProductCategoryByName always returns the id, even on collision
- GIVEN a category named `"Bebidas"` already exists
- WHEN `addProductCategoryByName("Bebidas")` is called
- THEN it MUST return a `string` id (never `null`), matching Angular's literal behavior — the
  internal collision failure is silent to the caller, exactly as in Angular

#### Scenario: addProductCategoryByName return type has no null branch
- GIVEN the React `ProductCategoryRepository.addProductCategoryByName` signature
- WHEN its return type is inspected
- THEN it MUST be `string`, not `string | null` — no caller may rely on a `null` return

### Requirement: Offline/Online DI Selection
`ProductService` MUST support selecting between `ProductOfflineService` and `ProductOnlineService`
implementations via a dependency-injection switch, mirroring Angular's `PRODUCT_SERVICE`
`InjectionToken` + `productServiceFactory()` gated on `GlobalConfig.USE_ONLINE_SERVICE`
(tokens.ts:6, factories/product-service.factory.ts). React exposes this via
`createProductService(storeId)` (`product-service.factory.ts`) — every production call site MUST
route through the factory rather than directly instantiating `new ProductOfflineService(...)`.

#### Scenario: Online mode selects online implementation
- GIVEN the app's online/offline flag is set to "online"
- WHEN the DI resolver provides a `ProductService` instance
- THEN it MUST be the `ProductOnlineService` implementation, with the same method surface as offline

### Requirement: Call-Site Parity
React call sites consuming `ProductService` MUST use the same logical operations as their Angular
counterparts: `getMaxOrder` (edit-product modal), `getAvailableProductsByCategoryId` +
`deleteProduct` (category product list), `getProductsToSelect` (inventory entry modal),
`hasAnyAvailableToSaleProduct` (login gate), `getProductsToSaleByCategoryId` (sale/egress
category products), `getProductById` (shopping cart), `createProducts`/`createCsvProducts`
(bulk/CSV import). Call sites MUST depend on the `ProductService` interface (via the
`createProductService(storeId)` factory), not a concrete `ProductOfflineService` type.

#### Scenario: CSV import route delegates to the service
- GIVEN the CSV import UI receives parsed rows
- WHEN it invokes the import operation
- THEN it MUST call `productService.createCsvProducts(rows)` rather than re-implementing category/order logic inline in the route component

### Requirement: No Shared Repository Base Class

`ProductRepository` and `ProductCategoryRepository` MUST NOT depend on any shared generic
storage base class (e.g. `BaseRepository<T>`). Each MUST implement its own private persistence
methods, mirroring only its own matching Angular source file — never a generic shared by
multiple consumers.

#### Scenario: Shared base class rejected
- GIVEN a reviewer inspects `ProductRepository` and `ProductCategoryRepository`
- WHEN checking their class declarations and imports
- THEN neither MUST extend or import a shared `BaseRepository<T>` or equivalent generic storage class

### Requirement: Product Repository Wire Format, Cache, and Auto-Init

`ProductRepository` persistence MUST mirror Angular's `products/product.repository.ts` exactly:
- On-disk value at key `lizoft.store-products-{storeId}` MUST be
  `JSON.stringify(Array.from(map.entries()))` (Map-entries), never a plain array of product objects.
- MUST hold a per-instance in-memory cache, reloaded only when storage is empty/missing or the
  store key changes (not re-parsed on every call).
- On an empty or missing read, MUST auto-initialize by writing an empty Map (`[]`) to storage
  before returning, rather than throwing or returning `undefined`.
- MUST NOT revive any field to a `Date` on read (Angular's product repository revives no dates).

#### Scenario: Products persist as Map-entries
- GIVEN a product is added via `ProductRepository`
- WHEN the on-disk value for `lizoft.store-products-{storeId}` is inspected
- THEN it MUST be a JSON array of `[key, value]` pairs, not a plain array of product objects

#### Scenario: Auto-init on empty read
- GIVEN no value yet exists for the products storage key
- WHEN `ProductRepository` performs its first read
- THEN it MUST write an empty Map-entries array to storage and return an empty result, without throwing

#### Scenario: Cache reused across calls
- GIVEN `ProductRepository` has already loaded its products cache for the current store
- WHEN a second read method is called without any intervening write or store-key change
- THEN it MUST reuse the in-memory cache rather than re-parsing storage

### Requirement: Product Category Repository Wire Format, Cache, and Auto-Init

`ProductCategoryRepository` persistence MUST mirror Angular's
`categories/product-category.repository.ts` exactly, following the same rules as the Product
Repository above: Map-entries wire format at key `lizoft.store-product-categories-{storeId}`,
per-instance cache reloaded only on empty/missing storage or store-key change, auto-init on empty
read, and no date revival.

#### Scenario: Categories persist as Map-entries
- GIVEN a category is added via `ProductCategoryRepository`
- WHEN the on-disk value for `lizoft.store-product-categories-{storeId}` is inspected
- THEN it MUST be a JSON array of Map-entries, not a plain array of category objects

#### Scenario: Auto-init on empty read
- GIVEN no value yet exists for the categories storage key
- WHEN `ProductCategoryRepository` performs its first read
- THEN it MUST write an empty Map-entries array to storage and return an empty result, without throwing

## Out of Scope

The following are explicitly NOT covered by this spec, owned elsewhere:
- The cross-cutting generic `BaseService<T>` seam (`getAll`/`getById`/`delete` name
  reconciliation) for the OTHER offline services (Inventory, Order, Expense, SaleCredit) — owned
  by `service-return-shape-parity`.
- Fixing suspected Angular bugs mirrored above (redundant order double-assign,
  `getProductsToSaleByCategoryId` double-filter, `createProducts`/`createCsvProducts` empty
  `errors: []` on partial failure, online `ProductOnlineService` double-slash URL artifacts on
  8/12 endpoints) — these are deliberately mirrored, not fixed, pending explicit user
  confirmation of a future fix.
