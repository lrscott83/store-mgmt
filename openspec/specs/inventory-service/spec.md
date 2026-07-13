# Inventory Service — Offline Persistence Specification

## Purpose

Offline-first inventory entry management with in-app localStorage persistence and Angular-faithful
caching, mirroring Angular's `inventory-offline.service.ts` without a separate repository layer.

## Requirements

### Requirement: No Inventory Repository Class (rule 6/12)
React MUST NOT have a separate `InventoryRepository` class or file. Angular has no inventory
`repository` layer — inventory persistence lives inline in the offline service. Any file
implementing repository-shaped inventory persistence (`getAll`/`saveAll`/`getByProductId`/`save`
as a standalone class) MUST NOT exist; persistence lives inline inside `InventoryOfflineService`.

#### Scenario: Repository file does not exist
- GIVEN a reviewer inspects `frontend-react/apps/web-store-pos/app/inventory/lib/`
- WHEN searching for `inventory-repository.ts` or an equivalent standalone inventory persistence class
- THEN no such file or class MUST exist

#### Scenario: Offline service owns persistence directly
- GIVEN a reviewer inspects `InventoryOfflineService`
- WHEN checking its class declaration and private members
- THEN it MUST implement its own private persistence methods directly (no delegation to a repository instance)

### Requirement: Inline Persistence Mirrors Angular (Cache, Auto-Init, Storage Keys)
`InventoryOfflineService` persistence MUST mirror Angular's `inventory-offline.service.ts` exactly:
- MUST hold a private per-instance in-memory `Map` cache (`this.inventories`), initialized on
  construct and auto-reloaded on read only when the cache is empty/missing or the resolved store
  key differs from the last-loaded key (mirrors `ProductRepository`'s inline template: per-instance
  cache + `lastKey` field).
- MUST implement a side-effecting `getStorageKey()` (resolves the current key AND sets
  `lastUserInventoryEntriesKey`) and a separate pure `getCurrentStorageKey()` (resolves the key
  without mutating state), matching Angular's split exactly.
- Storage key format MUST be `StorageKeys.entityKey('inventory-entries', storeId)`, byte-identical
  to Angular's `USER_INVENTORIES_KEY + storeId`.
- MUST NOT port Angular's dead unused `INVENTORIES_KEY` field (never referenced by any call site
  in Angular).

#### Scenario: Cache reused across calls
- GIVEN `InventoryOfflineService` has already loaded its inventory cache for the current store
- WHEN a second read method is called without any intervening write or store-key change
- THEN it MUST reuse the in-memory cache rather than re-parsing storage

#### Scenario: Cache reload on store-key change
- GIVEN `InventoryOfflineService` has a cache loaded for store A
- WHEN a subsequent call resolves a different store key (store B)
- THEN it MUST reload the cache from storage for the new key rather than reusing the stale cache

#### Scenario: Storage key format matches Angular byte-for-byte
- GIVEN a store with id `storeId`
- WHEN the inventory storage key is resolved
- THEN it MUST equal `StorageKeys.entityKey('inventory-entries', storeId)`, matching Angular's `lizoft.store-inventory-entries-{storeId}`

### Requirement: reviveEntry Parity — Only `date` Field Revived
On read from `localStorage`, `InventoryOfflineService` MUST revive ONLY the `date` field to a
`Date` object. It MUST NOT revive `createdDate` or `updatedDate` — Angular's
`getInventoriesFromLocalStorage` (lines 540-545) revives only `date`; no downstream consumer in
the inventory module reads `createdDate`/`updatedDate` as `Date` objects.

#### Scenario: date field is revived
- GIVEN a serialized inventory entry with a string `date` value in `localStorage`
- WHEN `InventoryOfflineService` reads and deserializes the entry
- THEN the entry's `date` field MUST be a `Date` instance

#### Scenario: createdDate and updatedDate are NOT revived
- GIVEN a serialized inventory entry with string `createdDate`/`updatedDate` values in `localStorage`
- WHEN `InventoryOfflineService` reads and deserializes the entry
- THEN `createdDate` and `updatedDate` MUST remain as their original (non-`Date`) type, unmodified

### Requirement: Dead Repository Members Removed
`remove` and `clear` MUST NOT exist anywhere in `InventoryOfflineService` or any inventory
persistence code. Both had zero production call-sites and no Angular correlate in the eliminated
`InventoryRepository`.

#### Scenario: remove and clear are absent
- GIVEN a reviewer inspects `InventoryOfflineService`'s public and private members
- WHEN searching for `remove` or `clear` methods related to inventory persistence
- THEN neither MUST exist

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

### Requirement: Public `[]`-Forcing on getProductInventoriesByProductId Preserved (Out of Scope)
The ratified public contract of `getProductInventoriesByProductId` — which forces an empty array
(`[]`) rather than `undefined` for an unknown product — MUST remain unchanged. This diverges from
Angular's raw `Map.get()` (which returns `undefined` and relies on per-call-site guards), but is a
previously-ratified public-surface decision (Stage 7 ADR-2) with a real production dependent
(`reports/lib/services/inventory-today-sale-service.ts`) and is explicitly OUTSIDE this change's
scope. Internal (private/raw) reads MAY return `InventoryEntry[] | undefined` and rely on
per-call-site guards mirroring Angular, but the public method's `[]`-forcing is unchanged.

#### Scenario: Public method still returns [] for unknown product
- GIVEN a `productId` with no inventory entries
- WHEN `getProductInventoriesByProductId(storeId, productId)` is called
- THEN it MUST return `[]`, not `undefined` — unchanged from current ratified behavior

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
