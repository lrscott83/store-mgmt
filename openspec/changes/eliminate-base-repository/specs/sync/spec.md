# Delta for sync

Governs proposal `eliminate-base-repository`. The sync import path (`sync/routes/import.tsx` +
`DataSynchronizerService`) stops constructing raw `new BaseRepository<...>` instances (no
Angular correlate) and instead uses sync-local storage shims, re-homing storage only — the
synchronizer's existing merge/validation/revert orchestration is preserved unchanged.

## ADDED Requirements

### Requirement: Sync-Local Storage Shim Replaces Shared Base Repository
`sync/routes/import.tsx` MUST NOT construct raw `new BaseRepository<...>` instances. It MUST use
sync-local storage shims (co-located in the sync module, not a shared base) that satisfy the
`NameUniqueRepo` (categories, products) and `GenericUpsertRepo` (orders, sale credits) interfaces
consumed by `DataSynchronizerService`, without altering the synchronizer's existing orchestration.

#### Scenario: No BaseRepository import in the sync module
- GIVEN a reviewer inspects `sync/routes/import.tsx` and any sync-local shim files
- WHEN checking their imports
- THEN none MUST import or instantiate `BaseRepository`

### Requirement: Sync Shim Wire-Format Parity Per Entity
The sync-local shims MUST read/write the SAME on-disk keys and formats as their corresponding
offline services/repositories:
- Categories and products: Map-entries format, sharing the same storage key as
  `ProductRepository`/`ProductCategoryRepository`.
- Orders and sale credits: plain-array format, sharing the same storage key as
  `order-offline-service.ts`/`sale-credit-offline-service.ts`, converting array↔Map internally so
  the synchronizer's Map-based merge loop is preserved while on-disk data remains array-shaped.

#### Scenario: Import merges into the same plain-array store the offline service reads
- GIVEN an order was created via `OrderOfflineService` before any sync import
- WHEN a backup is imported and the order synchronizer merges data
- THEN the resulting on-disk `lizoft.store-orders-{storeId}` value MUST remain a plain JSON array readable by `OrderOfflineService` afterward

#### Scenario: Import merges into the same Map-entries store the repository reads
- GIVEN a category exists via `ProductCategoryRepository` before any sync import
- WHEN a backup is imported and the category synchronizer performs a whole-type revert (bulk save)
- THEN the resulting on-disk `lizoft.store-product-categories-{storeId}` value MUST remain Map-entries format readable by `ProductCategoryRepository` afterward

### Requirement: Sync Import Behavior Unchanged (Re-Home Only)
Replacing `BaseRepository` with sync-local shims MUST NOT change the synchronizer's existing
merge/validation/revert/error behavior — this is a storage re-home, not an orchestration fix.
Whatever the current `import.tsx` + `DataSynchronizerService` orchestration does for a given
input (accept, reject-and-revert, or partial merge) MUST behave identically before and after this
change.

#### Scenario: Existing revert-on-clash behavior preserved
- GIVEN an import file that previously triggered a whole-type revert under `BaseRepository`-backed storage
- WHEN the same import runs after `BaseRepository` is replaced by sync-local shims
- THEN the same revert MUST occur with the same resulting merged/reverted data
