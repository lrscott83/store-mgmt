# Delta for Sync

## ADDED Requirements

### Requirement: Sale Credit Sync-Import Routes Through Offline Service With Paid-Guard Partial-Merge

Sale-credit sync-import merges MUST route through `SaleCreditOfflineService.addImportedSaleCredit`
(new id) / `updateImportedSaleCredit` (existing id), replacing the generic `GenericUpsertRepo` shim
full-overwrite. `updateImportedSaleCredit` MUST overwrite `isActive`/`client`/`note`/
`updatedDate`/`updatedByName` unconditionally, but MUST overwrite `paid`/`isPaid`/`paidDate` ONLY
when the existing stored credit is unpaid (`!existing.paid`); when the existing credit is already
paid, those three fields MUST be preserved from storage, not the imported values. Merge stays
break-only (no revert) across the incoming batch; an unexpected throw MUST surface
`SynchronizerErrors.SaleCreditsUnexpectedError`.

#### Scenario: New sale credit is added via the service
- GIVEN an imported sale credit whose `id` does not exist in storage
- WHEN the sale-credit merge runs
- THEN `SaleCreditOfflineService.addImportedSaleCredit` is called and the credit is appended to storage

#### Scenario: Update to an unpaid existing credit overwrites all fields
- GIVEN a stored sale credit with `paid: 0` and an imported credit with the same `id` carrying `paid`, `isPaid: true`, and a `paidDate`
- WHEN the sale-credit merge runs
- THEN `updateImportedSaleCredit` overwrites `client`/`note`/`isActive`/`updatedDate`/`updatedByName` AND `paid`/`isPaid`/`paidDate` with the imported values

#### Scenario: Update to a paid existing credit preserves payment fields (paid-guard)
- GIVEN a stored sale credit with `paid > 0`, `isPaid: true`, and a `paidDate`
- WHEN an imported credit with the same `id` carries different `paid`/`isPaid`/`paidDate` values plus updated `client`/`note`
- THEN the stored `paid`/`isPaid`/`paidDate` remain unchanged after merge, while `client`/`note`/`isActive`/`updatedDate`/`updatedByName` are overwritten with the imported values

#### Scenario: Sale-credit merge routes through the service, not the shim
- GIVEN a reviewer inspects the production sync wiring for sale credits
- WHEN checking which class performs the merge writes
- THEN it MUST be `SaleCreditOfflineService`, never `makeSaleCreditRepoShim` or any `GenericUpsertRepo` shim

#### Scenario: Unexpected failure surfaces the sale-credit error code
- GIVEN the sale-credit merge throws while processing an imported batch
- WHEN the failure is caught
- THEN the merge result carries `Synchronizer.SaleCreditsUnexpectedError`, and any credits already written before the throw remain persisted (break-only, no revert)

## MODIFIED Requirements

### Requirement: Sync Import Routes Through Domain Repositories (Full Validation Parity)

Product and category sync merges MUST route through the real `ProductRepository`/
`ProductCategoryRepository` (Angular-parity DI, e.g. `ProductRepository(storeId, new
ProductCategoryRepository(storeId))`), replacing the generic name-uniqueness-only shim. This
intentionally CHANGES prior merge/revert behavior to recover Angular parity. Orders and inventory
entries are unaffected — they keep break-only shim/service routing. Expenses and sale credits are
also unaffected in kind (both already route through their offline services, break-only, no
revert) — sale credits additionally carry a paid-guard partial-merge (see "Sale Credit Sync-Import
Routes Through Offline Service With Paid-Guard Partial-Merge").
(Previously: sale credits were grouped with orders as shim-routed; sale credits now route through
`SaleCreditOfflineService`, not a shim.)

#### Scenario: Product import uses the real repository
- GIVEN a `products.json` import file
- WHEN products merge
- THEN each item calls `addImportedProduct`/`updateImportedProduct` on `ProductRepository`, never a generic shim

#### Scenario: Category import uses the real repository
- GIVEN a `categories.json` import file
- WHEN categories merge
- THEN each item calls `addImportedProductCategory`/`updateImportedProductCategory` on `ProductCategoryRepository`, never a generic shim

### Requirement: Sync-Local Storage Shim Replaces Shared Base Repository

`sync/routes/import.tsx` MUST NOT construct raw `new BaseRepository<...>` instances. Orders MUST
use a sync-local storage shim satisfying `GenericUpsertRepo`. Sale credits MUST NOT use a shim —
`import.tsx` MUST construct `SaleCreditOfflineService` directly, and `DataSynchronizerService` MUST
consume it through the `SaleCreditImportService` seam (mirroring `ExpenseImportService`). Categories
and products MUST NOT use a `NameUniqueRepo` shim — `import.tsx` MUST construct the real
`ProductCategoryRepository`/`ProductRepository` directly, and `DataSynchronizerService` MUST
consume them through a dedicated repository-backed seam.
(Previously: sale credits used a `GenericUpsertRepo` shim like orders; `makeSaleCreditRepoShim` is
now retired.)

#### Scenario: No BaseRepository import in the sync module
- GIVEN a reviewer inspects `sync/routes/import.tsx` and any sync-local shim files
- WHEN checking their imports
- THEN none MUST import or instantiate `BaseRepository`

#### Scenario: Products and categories bypass the generic shim
- GIVEN a reviewer inspects the production sync wiring for products/categories
- WHEN checking which class performs the merge writes
- THEN it MUST be the real `ProductRepository`/`ProductCategoryRepository`, never `makeProductRepoShim`/the category shim or any `NameUniqueRepo` shim

#### Scenario: makeSaleCreditRepoShim no longer exists
- GIVEN a reviewer inspects `sync/lib/storage/sync-repo-shims.ts`
- WHEN checking exported factories
- THEN `makeSaleCreditRepoShim` MUST NOT be present; `makeGenericUpsertRepoShim` and `makeOrderRepoShim` MUST remain

### Requirement: Sync Shim Wire-Format Parity Per Entity

Sync-local shims (orders ONLY) MUST read/write the same on-disk keys/formats as their offline
service — plain-array, converting array↔Map internally. Categories and products no longer go
through a shim; they read/write Map-entries directly via `ProductRepository`/
`ProductCategoryRepository`. Sale credits no longer go through a shim either; they read/write
plain-array format directly via `SaleCreditOfflineService`, sharing the same on-disk key/format
the shim previously mirrored.
(Previously: shims covered "orders, sale credits ONLY"; sale credits are now service-routed, not
shim-routed.)

#### Scenario: Orders remain plain-array via the shim
- GIVEN an order was created via `OrderOfflineService` before any sync import
- WHEN a backup is imported and orders merge
- THEN `lizoft.store-orders-{storeId}` MUST remain a plain JSON array readable by `OrderOfflineService` afterward

#### Scenario: Category import writes through the real repository directly
- GIVEN a category exists via `ProductCategoryRepository` before any sync import
- WHEN a backup is imported and categories revert on a name clash
- THEN `lizoft.store-product-categories-{storeId}` MUST remain Map-entries format, written by `ProductCategoryRepository` itself, not a shim copy

#### Scenario: Sale credits remain plain-array via the service, not a shim
- GIVEN a sale credit was created via `SaleCreditOfflineService` before any sync import
- WHEN a backup is imported and sale credits merge
- THEN `lizoft.store-saleCredits-{storeId}` MUST remain a plain JSON array, written by `SaleCreditOfflineService` itself, not a shim copy
