# Delta for inventory-service

Governs proposal `eliminate-inventory-repository` (3rd/final React-invention elimination after
`eliminate-base-repository` and `baseservice-parity`). `InventoryOfflineService` stops depending
on the React-invented `InventoryRepository` (no Angular correlate — playbook rule 12) and inlines
its own persistence, mirroring Angular's `frontend/src/app/application/entries/inventory-offline.service.ts`
exactly. Angular `frontend/` remains the sole source of truth; no live backend involved.

## ADDED Requirements

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

#### Scenario: update() scopes lookup by productId
- GIVEN `InventoryOfflineService.update(storeId, productId, entryId, changes)` is called with a valid `productId` and `entryId` belonging to that product
- WHEN the service resolves the target entry internally
- THEN it MUST do so via `getByProductId(productId).find(...)`, not a store-wide entryId scan

#### Scenario: deactivate() scopes lookup by productId
- GIVEN `InventoryOfflineService.deactivate(storeId, productId, entryId)` is called with a valid `productId` and `entryId` belonging to that product
- WHEN the service resolves the target entry internally
- THEN it MUST do so via `getByProductId(productId).find(...)`, not a store-wide entryId scan

#### Scenario: No dead defensive fallback remains
- GIVEN `update()` and `deactivate()` are re-scoped to `getByProductId(productId).find(...)`
- WHEN a reviewer inspects the resolved entry's productId usage in both methods
- THEN no `storedProductId ?? productId`-style defensive fallback MUST remain (the entry's existence within that product bucket is already guaranteed by the preceding `isNotSoldEntry` guard)

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
