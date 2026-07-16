# Delta for Product Service

## ADDED Requirements

### Requirement: ProductService and ProductCategoryService Extend BaseService<T>
Angular's `domain/interfaces/product.service.ts:12` (`ProductService extends BaseService<Product>`)
and `application/categories/product-category.service.ts:11`
(`ProductCategoryService extends BaseService<ProductCategory>`) both extend the generic HTTP+reactive
`BaseService<T>` (see `service-base` delta). React's abstract `ProductService` and
`ProductCategoryService` MUST likewise extend the reproduced `BaseService<T>`, inheriting
`create`/`getAllItems`/`getItemById`/`update`/`updateStatusForItems`/`delete`/`deleteItems`/
`fetch()`/`items$`/`isLoading$`/`isFirstLoading$`/`errorMessage$`/`patchState`, even though these
members have ZERO Product/ProductCategory call sites in Angular (rule 12 — mirror the class
relationship even when its inherited members are dead weight). This SUPERSEDES the prior
"BaseService-level `extends` — RETIRED for Product/ProductCategory" decision, and REVERSES the
"Inherited-but-dead `BaseService` members ... MUST NOT be required" clause of "Service Method
Signature Parity". The existing 12-method abstract surface, exact-surface rule, and all
online/offline behavioral contracts in the main spec are UNCHANGED — this ADDS the base class only,
it MUST NOT alter any existing `ProductService`/`ProductCategoryService` public method signature,
return shape, or call-site.
(Previously: both services were standalone, no `extends BaseService<T>`, ratified by
`product-service-parity`.)

#### Scenario: Product and category services declare the base class
- GIVEN a reviewer inspects the React `ProductService` and `ProductCategoryService` abstract classes
- WHEN checking their declarations
- THEN both extend `BaseService<Product>` / `BaseService<ProductCategory>` respectively

#### Scenario: Existing public contract is unaffected
- GIVEN the full existing test suite for `ProductOfflineService`/`ProductOnlineService`/
  `ProductCategoryOfflineService`/`ProductCategoryOnlineService`
- WHEN the base class is added
- THEN every existing test continues to pass unchanged — no signature, return shape, or call-site
  is altered by this requirement

### Requirement: ProductOnlineService HTTP Contract (normalized URLs)
Angular's `ProductOnlineService` builds 8 of its 12 endpoint URLs as `API_URL + '/' + suffix` on top
of the already-trailing-slash `API_URL`, producing a double slash (e.g. `/v1/Products//toEntry`) —
the same class of bug as `ProductCategoryOnlineService`'s ANGULAR-BUG-SUSPECT #5. For consistency
with `ProductCategoryOnlineService` (already normalized, DG-1), React's `ProductOnlineService` MUST
normalize these 8 URLs to a single slash. This affects `getProductById`, `hasAnyAvailableToSaleProduct`,
`getProductsToSelect`, `getAvailableProductsByCategoryId`, `getProductsToSaleByCategoryId`,
`deleteProduct`, `getMaxOrder`, `updateProduct`. The 4 already-clean methods (`getProductByBarcode`,
`createCsvProducts`, `createProducts`, `createProduct`) are unaffected. Every response envelope MUST
still be returned verbatim (no flattening). This REMOVES the "online `ProductOnlineService`
double-slash URL artifacts" bullet from the main spec's "Out of Scope" list.

#### Scenario: getProductById URL is normalized
- GIVEN the app is in online mode
- WHEN `productService.getProductById("P1")` is called
- THEN it MUST issue a GET to `/v1/Products/P1` (single slash), NOT `/v1/Products//P1`

#### Scenario: All 8 affected endpoints drop the double slash
- GIVEN a reviewer diffs `ProductOnlineService`'s built URLs against Angular's
- WHEN checking `getProductById`, `hasAnyAvailableToSaleProduct`, `getProductsToSelect`,
  `getAvailableProductsByCategoryId`, `getProductsToSaleByCategoryId`, `deleteProduct`,
  `getMaxOrder`, `updateProduct`
- THEN none produces a literal `//` in its request path

## MODIFIED Requirements

### Requirement: ProductCategoryRepository Mirrors Angular Repo Surface (no upsert/remove)
The extracted React `ProductCategoryRepository` MUST mirror Angular's
`application/categories/product-category.repository.ts` public surface EXACTLY:
`hasAnyAvailableCategory`, `getProductCategoryById`, `getProductCategoryByName`,
`getProductCategories`, `getAvailableProductCategories`, `hasAnyCategory`, `addProductCategory`,
`addProductCategoryByName`, `addProductCategoryData`, `updateProductCategory`,
`activateProductCategory`, `deactivateProductCategory`, `getCategoriesJson` (+ import/sync helpers
`addImportedProductCategory`, `updateImportedProductCategory`, `updateCategories`,
`setInitCategories`, `getStorageCategoriesMap`). Angular's repository has NO generic `upsert` and NO
`remove`; the React repository MUST NOT declare them.

`activateProductCategory(id, isActive)`/`deactivateProductCategory(id, isActive)` MUST be RESTORED
to Angular's literal 2-parameter signature (`product-category.repository.ts:150,154`), reverting the
prior 1-param dead-parameter-drop fix. The `isActive` parameter remains unread inside the method body
(Angular hardcodes `true`/`false` regardless of the passed value) — this is a DELIBERATE literal
mirror per the user's MAXIMAL-parity decision, overriding the prior angular-bugs-policy "fix, don't
replicate" default for this specific dead parameter. All call sites MUST pass a boolean second
argument (its value is inert).

`addProductCategoryByName` return-type behavior (always returns `string`, never `null`) is UNCHANGED
by this delta.
(Previously: 1-param, dead 2nd `isActive` param dropped as a fix, ratified Phase 1 WU1.9 — now
reverted to 2-param literal mirror.)

#### Scenario: Invented repository bridge rejected
- GIVEN the extracted React `ProductCategoryRepository`
- WHEN it declares `upsert(category)` or `remove(id)`
- THEN the parity check MUST fail

#### Scenario: activateProductCategory requires 2 arguments again
- GIVEN a caller invokes `ProductCategoryRepository.activateProductCategory(id)` with only one argument
- WHEN type-checked against the restored signature
- THEN it MUST fail to compile — a boolean `isActive` second argument is required

#### Scenario: Second argument is inert
- GIVEN `deactivateProductCategory("C1", false)` and `deactivateProductCategory("C1", true)`
- WHEN either call runs
- THEN both produce the identical result (`C1.isActive === false`), matching Angular's hardcoded body
