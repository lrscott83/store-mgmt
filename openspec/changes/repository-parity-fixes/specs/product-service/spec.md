# Delta for product-service

Governs proposal `sdd/repository-parity-fixes/proposal`, decision engram #842. Closes 2 residual
return-contract gaps found by the `repository-parity-fixes` audit against
`ProductRepository`/`ProductCategoryRepository`, both owned by this capability
(`openspec/specs/product-service/spec.md`). Angular `frontend/` remains the sole source of truth.

## MODIFIED Requirements

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
(Previously: `addProductCategoryByName` returned `string | null`, returning `null` on a name
collision — a silent, unratified divergence from Angular's always-returns-`id` behavior.)

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
(Previously: `getAvailableProductById` returned `Product | undefined`, diverging from Angular and
from its own sibling methods on the same repository.)

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
