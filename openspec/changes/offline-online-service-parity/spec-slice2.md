# Delta Spec — Slice 2: Product/Category Repository + Service Parity

Governs proposal #671, decision #670, spec-slice1 #673. File: `openspec/changes/offline-online-service-parity/spec-slice2.md`. Angular `frontend/` is source of truth (pinned from real source, not prose). Slices 3-6 (online layer, auth, admin CRUD, infra) remain OUT of scope.

## Capability: product-service-parity (ADDED)

Extends `packages/domain/src/services/product-service.ts` `ProductService` interface per its own Slice-2 forward comment. `ProductOfflineService` (`frontend-react/apps/web-store-pos/app/sales/lib/services/product-offline-service.ts`) MUST `implements ProductService` (tsc-enforced) — closes Slice-1 deferred task 1.4.

### Requirement: getByName
MUST expose `getByName(name: string): Product | undefined` — exact-match over ALL products (active + inactive), no sort. Matches Angular `ProductRepository.getProductByName` (`.find(p => p.name === name)`).
Scenario: two products share a name across different categories → first-created match wins (`.find` semantics); no match → `undefined`.

### Requirement: getMaxOrder(categoryId)
MUST expose `getMaxOrder(categoryId: string): number` = max `order` among ALL products (active+inactive) with matching `categoryId`; `0` when the category has no products. Matches Angular `ProductOfflineService.getMaxOrder` (unfiltered by `isActive`).
Scenario: category products with orders `[1,3,2]` → returns `3`. Empty category → returns `0`.

### Requirement: getAvailableProductsByCategoryId
MUST expose `getAvailableProductsByCategoryId(categoryId: string): Product[]` = products where `categoryId` matches AND `isActive === true` (NOT `availableToSale`), sorted ascending by `order`. Matches Angular (`getProductsByCategoryId(...).filter(p => p.isActive)`).
Scenario: category with 3 products (2 active, 1 inactive) → returns the 2 active ones sorted by `order`, irrespective of `availableToSale`.

### Requirement: activate / deactivate
MUST expose `activate(id: string): void` / `deactivate(id: string): void`, mirroring Angular `ProductRepository.activateProduct/deactivateProduct` — set ONLY `isActive` (true/false); do NOT touch `updatedDate`/`updatedByName` (unlike `delete`, which does stamp them). No-op (no throw) when `id` does not exist.
Scenario: `deactivate(existingId)` → `isActive=false`, `updatedDate`/`updatedByName` unchanged. `activate(missingId)` → no throw, no state change.

Scenario (conformance): `ProductOfflineService` compiles only when all `ProductService` members (existing + these 4) are present with matching signatures.

## Capability: product-category-service-parity (ADDED)

Extends `packages/domain/src/services/product-category-service.ts` `ProductCategoryService` interface. `ProductCategoryOfflineService` MUST `implements ProductCategoryService` (tsc-enforced) — closes Slice-1 deferred task 1.4.

### Requirement: hasAnyCategory / hasAnyAvailableCategory
MUST expose `hasAnyCategory(): boolean` (any category exists, active or not) and `hasAnyAvailableCategory(): boolean` (≥1 category with `isActive===true`). Matches Angular `ProductCategoryRepository.hasAnyCategory/hasAnyAvailableCategory`.
Scenario: store with only inactive categories → `hasAnyCategory=true`, `hasAnyAvailableCategory=false`. Empty store → both `false`.

### Requirement: getMaxOrder (global)
MUST expose `getMaxOrder(): number` = max `order` across ALL categories (active+inactive; store-global, no per-category scoping — category ordering, unlike Product ordering, is not scoped). `0` when store has no categories. Matches Angular `ProductCategoryOfflineService.getMaxOrder`.
Scenario: category orders `[2,5,1]` → returns `5`. No categories → returns `0`.

### Requirement: getAvailableProductCategories
MUST expose `getAvailableProductCategories(): ProductCategory[]` = active categories sorted ascending by `order`. Genuine Angular abstract method (`product-category.service.ts:17`), not itemized verbatim in the task brief — included for 100% parity per decision #670 (no scope triage); pre-anticipated by the Slice-1 interface's own forward comment.
Scenario: 3 categories, 1 inactive → returns the 2 active ones, ascending by `order`.

### Requirement: getProductCategoriesView
MUST expose `getProductCategoriesView(): ProductCategoryView[]` — for each ACTIVE category (from `getAvailableProductCategories()`, ascending order), project `{id, name, order, isActive, productsCount}` where `productsCount` = count of that category's products with **`isActive AND availableToSale`** (a DIFFERENT, stricter predicate than `getAvailableProductsByCategoryId`'s `isActive`-only filter). Matches Angular `getProductCategoriesView` (`getAvailableToSaleProductsByCategoryId(...).length`). Inactive categories are excluded from the result entirely, not flagged `isActive:false`.
Scenario: category A has 2 products (1 active+sellable, 1 active-not-sellable) → `productsCount=1`. Inactive category B is absent from the output array.

Scenario (conformance): `ProductCategoryOfflineService` compiles only when all `ProductCategoryService` members (existing + these 4) are present with matching signatures.

## Capability: product-category-listing (MODIFIED — parity fix)

### Requirement: getAll() ordering
`ProductCategoryOfflineService.getAll()` MUST return categories sorted ascending by `order`, matching Angular `ProductCategoryRepository.getProductCategories()`.
(Previously: returned Map-insertion order, unsorted — a pre-existing React-side gap, not an Angular bug, surfaced while pinning `getProductCategoriesView`'s ordering dependency.)
Scenario: categories created as C(order=3), A(order=1), B(order=2) → `getAll()` returns `[A, B, C]`.

## Requirement count
8 ADDED requirements (Product: getByName, getMaxOrder, getAvailableProductsByCategoryId, activate/deactivate = 4; Category: hasAnyCategory/hasAnyAvailableCategory, getMaxOrder, getAvailableProductCategories, getProductCategoriesView = 4) + 1 MODIFIED (getAll ordering) = **9 requirements total**, 11 method-level scenarios + 2 interface-conformance scenarios = **13 scenarios**.

## Ambiguities resolved from source
1. `activate`/`deactivate` exist ONLY at Angular's repository layer — never declared on the abstract `ProductService`, and their only two UI call-sites (`category-product-list.component.ts` `activateProduct`/`deactivateProduct`) are empty no-op stubs. Since decision #670 explicitly includes "repositories" in the 100% parity mandate, they are ported anyway as public methods directly on the flat `ProductOfflineService` (React has no separate repository class per Slice-1 ADR).
2. `getProductByName` is likewise Angular-repository-only (never an abstract `ProductService` method, only referenced from a Jasmine spec) — same resolution as #1, ported as `getByName`.
3. `ProductCategoryRepository.activateProductCategory(id, isActive)`/`deactivateProductCategory(id, isActive)` both silently IGNORE their second `isActive` argument (hardcoded true/false regardless) — a redundant/dead parameter, not a functional bug (output is identical for any arg value). React's `activate(id)`/`deactivate(id)` intentionally drop the unused parameter rather than replicate a misleading signature.
4. `getAvailableProductCategories()` is a real abstract Angular method never itemized in the task brief's bullet list — added anyway per the binding "100% parity, no scope triage" decision (#670) and the Slice-1 interface's own forward comment.
5. `hasAnyAvailableToSaleProduct()` (Product abstract method backing Angular's login gating) is functionally ALREADY replicated inline in React's `user-home.ts::resolveUserHomePath` but not exposed as a named service method — explicitly OUT of this slice per the task brief's method list; flagged as a residual structural gap only, not a functional one.
6. Result-based validation semantics for `createProduct`/`updateProduct`/`createProductCategory`/`updateProductCategory` (NameExists/BarcodeExists/CategoryNotExists) are NOT covered by this slice — out of scope; only the explicitly enumerated method set above is addressed.

Next: sdd-design for Slice 2 (or sdd-tasks if design already covers this).
