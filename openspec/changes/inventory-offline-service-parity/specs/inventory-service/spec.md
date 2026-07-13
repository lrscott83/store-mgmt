# Delta for Inventory Service

## ADDED Requirements

### Requirement: createInventoryEntry — Angular-Exact Signature, Internal categoryId/date Derivation
`InventoryOfflineService` MUST expose `createInventoryEntry(productId, quantity, costPrice)` —
no `categoryId` or `date` parameters. `categoryId` MUST be derived internally from
`productRepository.getStorageProductsMap().get(productId).categoryId`. `date` (and
`createdDate`) MUST be stamped from a single internal `new Date()` call made at invocation time;
no caller-supplied backdating is accepted. The create-form's date field becomes inert for
creation (Angular parity: entries are always created "now").

#### Scenario: categoryId and date derived internally
- GIVEN a product with `categoryId: 'cat-1'` exists in `productRepository`
- WHEN `createInventoryEntry(productId, quantity, costPrice)` is called
- THEN the created entry's `categoryId` MUST equal `'cat-1'` and its `date`/`createdDate` MUST be the current time
- AND the caller cannot influence `categoryId` or `date` via any parameter

#### Scenario: missing product returns null
- GIVEN `productId` does not resolve via `productRepository`
- WHEN `createInventoryEntry(productId, quantity, costPrice)` is called
- THEN it MUST return `null` (not a `DataResult` envelope), matching Angular

#### Scenario: today-entries.tsx creates without categoryId/date args
- GIVEN the inventory entry creation form submits a new entry
- WHEN the route calls the service
- THEN it MUST call `createInventoryEntry(productId, quantity, costPrice)` only

### Requirement: deleteInventoryEntry — Angular-Exact Rename and Param Order
`InventoryOfflineService` MUST expose `deleteInventoryEntry(productId, entryId)` (renamed from
`deactivate`, param order restored to Angular's `productId` before `entryId`). Soft-delete
behavior (guarded by `isNotSoldEntry`, sets `isActive = false`) is unchanged.

#### Scenario: rename and param order enforced
- GIVEN an active, unsold entry `entryId` under `productId`
- WHEN `deleteInventoryEntry(productId, entryId)` is called
- THEN the entry MUST be soft-deleted (`isActive = false`) and `Result.Success()` returned
- AND no method named `deactivate` MUST exist on the service

### Requirement: getInventoryEntriesInDay — Angular-Exact Rename and Ignore-Date Body
`InventoryOfflineService` MUST expose `getInventoryEntriesInDay(date)` (renamed from `getByDate`).
The `date` parameter MUST be accepted but IGNORED — the method always returns active entries for
"today" (`startOfDay(new Date())` through the next day), mirroring Angular's ignored-param body
exactly. React's prior date-honoring behavior is removed.

#### Scenario: passed date is ignored — always returns today
- GIVEN active inventory entries exist dated today and dated yesterday
- WHEN `getInventoryEntriesInDay(yesterdayDate)` is called with a past date
- THEN the result MUST contain only today's entries, not yesterday's
- AND no method named `getByDate` MUST exist on the service

### Requirement: getInventoryCategoriesView — Angular-Exact Rename, Zero-Arg, Category Sourcing
`InventoryOfflineService` MUST expose zero-arg `getInventoryCategoriesView()` (renamed from
`getAvailableByCategory`, `products` parameter removed). Category names MUST be sourced via
`ProductCategoryRepository` (the same repository `ProductRepository` wraps internally),
mirroring Angular's `categoryRepository.getStorageCategoriesMap()` — not the denormalized
`Product.categoryName` shortcut.

#### Scenario: category names sourced via ProductCategoryRepository
- GIVEN active inventory entries exist across two categories
- WHEN `getInventoryCategoriesView()` is called with no arguments
- THEN each returned category's `categoryName` MUST match `ProductCategoryRepository`'s stored name for that `categoryId`
- AND no method named `getAvailableByCategory` MUST exist on the service

### Requirement: Report Callers Use Renamed Methods
All production callers (`today-entries.tsx`, `today-quantities.tsx`, `today-sales-profit.tsx`,
`available.tsx`, `reports/lib/services/inventory-today-sale-service.ts`, and both Observable
siblings) MUST call the renamed methods exclusively — no reference to `getByDate`,
`getAvailableByCategory`, `create` (inventory entry), or `deactivate` MUST remain.

#### Scenario: no legacy method names remain in call sites
- GIVEN the inventory and reports call sites are updated
- WHEN a reviewer greps for `getByDate(`, `getAvailableByCategory(`, `.deactivate(`
- THEN no matches MUST be found outside historical comments/docs

## MODIFIED Requirements

### Requirement: Product-Scoped Entry Lookup (No Cross-Product Scan)
Internal lookups that need an entry by `id` within a known `productId` MUST use
`getByProductId(productId).find(entry => entry.id === entryId)`. React MUST NOT retain a
cross-product `findEntryById(storeId, entryId)`-style scan — Angular never performs an
entryId-only scan across all products; every Angular caller already has `productId` and scopes
the lookup to that product's bucket.
(Previously: the `deactivate()` scenario referenced `deactivate(storeId, productId, entryId)`;
renamed to `deleteInventoryEntry(productId, entryId)` per Angular parity — instance holds
`storeId`, not a per-call param.)

#### Scenario: update() scopes lookup by productId
- GIVEN `InventoryOfflineService.update(entryId, productId, quantity, costPrice)` is called with a valid `productId` and `entryId` belonging to that product
- WHEN the service resolves the target entry internally
- THEN it MUST do so via `getByProductId(productId).find(...)`, not a store-wide entryId scan

#### Scenario: deleteInventoryEntry() scopes lookup by productId
- GIVEN `InventoryOfflineService.deleteInventoryEntry(productId, entryId)` is called with a valid `productId` and `entryId` belonging to that product
- WHEN the service resolves the target entry internally
- THEN it MUST do so via `getByProductId(productId).find(...)`, not a store-wide entryId scan

#### Scenario: No dead defensive fallback remains
- GIVEN `update()` and `deleteInventoryEntry()` are scoped to `getByProductId(productId).find(...)`
- WHEN a reviewer inspects the resolved entry's productId usage in both methods
- THEN no `storedProductId ?? productId`-style defensive fallback MUST remain
