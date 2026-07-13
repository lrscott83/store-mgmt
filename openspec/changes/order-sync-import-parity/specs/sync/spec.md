# Delta for Sync

## ADDED Requirements

### Requirement: Order Sync-Import Routes Through Offline Service With Narrow 4-Field Merge

Order sync-import merges MUST route through `OrderOfflineService.addImportedOrder` (new id) /
`updateImportedOrder` (existing id), replacing the generic `GenericUpsertRepo` shim full-overwrite.
`addImportedOrder` MUST revive the imported order's `date` to a `Date` instance and append the
order to storage. `updateImportedOrder` MUST overwrite ONLY `date`/`isActive`/`updatedDate`/
`updatedByName` on the stored order — `total`/`orderItems`/`isCredit`/`paymentType`/`description`
and every other field MUST be preserved from storage, never overwritten by the imported values.
Merge stays break-only (no revert) across the incoming batch; an unexpected throw MUST surface
`SynchronizerErrors.OrdersUnexpectedError` (existing code, unchanged).

#### Scenario: New order is added via the service
- GIVEN an imported order whose `id` does not exist in storage
- WHEN the order merge runs
- THEN `OrderOfflineService.addImportedOrder` is called and the order is appended to storage with `date` revived to a `Date` instance

#### Scenario: Update to an existing order narrow-merges only 4 fields
- GIVEN a stored order with `total: 500`, `orderItems: [...]`, `isCredit: true`, `paymentType: 'cash'`
- WHEN an imported order with the same `id` carries different `date`/`isActive`/`updatedDate`/`updatedByName` AND different `total`/`orderItems`/`isCredit`/`paymentType`
- THEN `updateImportedOrder` overwrites only `date`/`isActive`/`updatedDate`/`updatedByName`, while the stored `total`/`orderItems`/`isCredit`/`paymentType` remain unchanged

#### Scenario: Order merge routes through the service, not the shim
- GIVEN a reviewer inspects the production sync wiring for orders
- WHEN checking which class performs the merge writes
- THEN it MUST be `OrderOfflineService`, never `makeOrderRepoShim` or any `GenericUpsertRepo` shim

#### Scenario: Unexpected failure surfaces the orders error code, break-only
- GIVEN the order merge throws while processing an imported batch
- WHEN the failure is caught
- THEN the merge result carries `Synchronizer.OrdersUnexpectedError`, and any orders already written before the throw remain persisted (break-only, no revert)

## MODIFIED Requirements

### Requirement: Sync Import Routes Through Domain Repositories (Full Validation Parity)

Product and category sync merges MUST route through the real `ProductRepository`/
`ProductCategoryRepository` (Angular-parity DI, e.g. `ProductRepository(storeId, new
ProductCategoryRepository(storeId))`), replacing the generic name-uniqueness-only shim. This
intentionally CHANGES prior merge/revert behavior to recover Angular parity. Inventory entries are
unaffected — they keep break-only service routing. Expenses, sale credits, and orders are also
unaffected in kind (all three already route through their offline services, break-only, no
revert) — sale credits additionally carry a paid-guard partial-merge, and orders additionally
carry a narrow 4-field merge on update (see "Order Sync-Import Routes Through Offline Service With
Narrow 4-Field Merge").
(Previously: orders were grouped with the generic shim path; orders now route through
`OrderOfflineService`, not a shim.)

#### Scenario: Product import uses the real repository
- GIVEN a `products.json` import file
- WHEN products merge
- THEN each item calls `addImportedProduct`/`updateImportedProduct` on `ProductRepository`, never a generic shim

#### Scenario: Category import uses the real repository
- GIVEN a `categories.json` import file
- WHEN categories merge
- THEN each item calls `addImportedProductCategory`/`updateImportedProductCategory` on `ProductCategoryRepository`, never a generic shim

### Requirement: Sync-Local Storage Shim Replaces Shared Base Repository

`sync/routes/import.tsx` MUST NOT construct raw `new BaseRepository<...>` instances, and MUST NOT
construct any sync-local `GenericUpsertRepo` shim — no entity remains shim-routed. Sale credits
MUST NOT use a shim — `import.tsx` MUST construct `SaleCreditOfflineService` directly, and
`DataSynchronizerService` MUST consume it through the `SaleCreditImportService` seam. Orders MUST
NOT use a shim either — `import.tsx` MUST construct `OrderOfflineService` directly, and
`DataSynchronizerService` MUST consume it through a new `OrderImportService` seam (mirroring
`SaleCreditImportService`/`ExpenseImportService`). Categories and products MUST NOT use a
`NameUniqueRepo` shim — `import.tsx` MUST construct the real `ProductCategoryRepository`/
`ProductRepository` directly, and `DataSynchronizerService` MUST consume them through a dedicated
repository-backed seam.
(Previously: orders used a `GenericUpsertRepo` shim; `makeOrderRepoShim` and the whole
`sync-repo-shims.ts` file are now retired — orders route through `OrderImportService` like sale
credits and expenses.)

#### Scenario: No BaseRepository import in the sync module
- GIVEN a reviewer inspects `sync/routes/import.tsx`
- WHEN checking its imports
- THEN it MUST NOT import or instantiate `BaseRepository`

#### Scenario: Products and categories bypass the generic shim
- GIVEN a reviewer inspects the production sync wiring for products/categories
- WHEN checking which class performs the merge writes
- THEN it MUST be the real `ProductRepository`/`ProductCategoryRepository`, never `makeProductRepoShim`/the category shim or any `NameUniqueRepo` shim

#### Scenario: sync-repo-shims.ts no longer exists
- GIVEN a reviewer inspects the `sync/lib/storage/` directory
- WHEN checking for a `sync-repo-shims.ts` file
- THEN it MUST NOT be present; `makeOrderRepoShim`, `makeGenericUpsertRepoShim`, `mergeBreakOnly`, and `GenericUpsertRepo<T>` MUST NOT exist anywhere in the sync module

## REMOVED Requirements

### Requirement: Sync Shim Wire-Format Parity Per Entity

(Reason: this requirement existed only to guarantee that sync-local shims read/wrote the same
on-disk wire format as their offline service. Orders were the last entity routed through a shim;
with `sync-repo-shims.ts` deleted entirely, no entity is shim-routed anymore — every entity now
reads/writes directly via its own repository or offline service, so cross-shim wire-format parity
no longer applies. Wire-format correctness is now covered implicitly by each entity's own
service/repository contract, not a shim-specific requirement.)
