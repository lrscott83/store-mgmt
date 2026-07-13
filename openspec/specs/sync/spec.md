# Sync — Cross-Platform Backup/Restore Specification

## Purpose

Cross-platform (Angular ↔ React) backup export/import (synchronization) with full interoperability, domain-validated imports, and periodic service-worker updates.

## Requirements — Backup Format + Import Validation

### Requirement: Angular-Compatible Backup Format

Export MUST produce a ZIP containing 6 separate password-protected AES JSON files (`products.json`, `categories.json`, `inventory-entries.json`, `orders.json`, `expenses.json`, `sale-credits.json`), matching Angular's `data-serializer.service.ts` byte-for-byte format (zip.js native AES password encryption, WinZip AE spec). This REPLACES any prior single-envelope schemes.

#### Scenario: Angular-exported backup imports into React
- GIVEN a `.zip` backup exported by the Angular app with a known password
- WHEN a React user imports it with the same password and matching store context
- THEN the import succeeds and all 6 entity files are decrypted and merged

#### Scenario: React-exported backup imports into Angular
- GIVEN a `.zip` backup exported by React with a known password
- WHEN it is imported into the Angular app with the same password and store context
- THEN the import succeeds, confirming round-trip interoperability

### Requirement: Store-Scoped Backup Decryption

The decryption password MUST be derived by combining the user-supplied password with the exporting session's `selectedStoreId`, so a backup only decrypts within the store context it was exported from.

#### Scenario: Same store, correct password succeeds
- GIVEN a backup exported while `selectedStoreId=A`
- WHEN importing with the correct password while `selectedStoreId=A`
- THEN decryption succeeds

#### Scenario: Different store, correct password fails
- GIVEN a backup exported while `selectedStoreId=A`
- WHEN importing with the same password while `selectedStoreId=B`
- THEN decryption fails with a wrong-password/corrupt-file error

### Requirement: Domain-Validated Import With Abort-and-Revert

Import MUST route merge writes through domain repositories that enforce existing business rules —
for categories: name-uniqueness + order-shift; for products: category-exists,
barcode-uniqueness, per-category name-uniqueness, and order-shift — replacing any raw-storage
bypass that never fails. On first validation failure for products or categories, the system MUST
abort that entity type's merge and revert it to its pre-import state (per "Revert Passes the Live
Mutated Reference On Failure"); no writes beyond that mutated state may persist.

#### Scenario: Duplicate category name rejected and reverted
- GIVEN an import file containing a category name that already exists in the target store
- WHEN the import runs
- THEN the category merge fails, categories revert to their pre-import state, and a typed merge error is surfaced

#### Scenario: No-write-on-failure preserved for decrypt/parse errors
- GIVEN a corrupt file or wrong password
- WHEN import is attempted
- THEN decrypt/parse fails before any repository write occurs (existing guarantee unchanged)

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

### Requirement: Product Import Enforces Full Angular Validation

Imported products, sorted by `order` ascending, MUST enforce: category-exists
(`ProductCategory.NotExists`), barcode-uniqueness (`Product.BarcodeExists`), and per-category
name-uniqueness (`Product.NameExists`, scoped by `categoryId`, excluding self on update). On
success, every other product in the same category with `order >= item.order` MUST shift `+1`.

#### Scenario: Duplicate barcode rejected
- GIVEN a stored product has barcode `"7501234"`
- WHEN an imported product shares that barcode
- THEN the merge fails with `Product.BarcodeExists` and the whole product-type merge reverts

#### Scenario: Missing category rejected
- GIVEN an imported product's `categoryId` matches no stored category
- WHEN it merges
- THEN the merge fails with `ProductCategory.NotExists` and reverts

#### Scenario: Per-category name collision rejected, cross-category allowed
- GIVEN category `C1` already has a product named `"Cola"`
- WHEN an imported product named `"Cola"` merges into `C1`
- THEN it fails with `Product.NameExists`; an identically-named import into category `C2` instead succeeds (scoping is per-`categoryId`, not global)

#### Scenario: Order-shift applies to imported products
- GIVEN category `C1` has products at orders `[1, 2, 3]`
- WHEN an imported product merges into `C1` at `order: 2`
- THEN the existing products previously at `2` and `3` shift to `3` and `4`

### Requirement: Category Import Enforces Name-Uniqueness and Order-Shift

Imported categories, sorted by `order` ascending, MUST enforce name-uniqueness
(`ProductCategory.NameExists`, excluding self on update); on success, every other category with
`order >= item.order` MUST shift `+1`.

#### Scenario: Duplicate category name rejected
- GIVEN a stored category named `"Bebidas"`
- WHEN an imported category shares that name
- THEN the merge fails with `ProductCategory.NameExists` and reverts

#### Scenario: Order-shift applies to imported categories
- GIVEN categories exist at orders `[1, 2, 3]`
- WHEN an imported category merges at `order: 2`
- THEN the existing categories at `2` and `3` shift to `3` and `4`

### Requirement: Revert Passes the Live Mutated Reference On Failure

On the first product or category failure during import, the revert call
(`updateProducts`/`updateCategories`) MUST receive the SAME in-memory map reference obtained from
`getStorageProductsMap`/`getStorageCategoriesMap` at the start of the loop — NOT a
defensively-cloned snapshot. That reference was already mutated in-place by prior successful
adds/updates, so the persisted "revert" reflects the partially-mutated state — mirroring Angular's
literal behavior exactly (migrate ≠ improve; do NOT snapshot).

#### Scenario: Revert persists partially-mutated state, not a clean snapshot
- GIVEN an import merges 2 products successfully then fails on the 3rd
- WHEN the revert runs
- THEN the persisted map still contains the 2 prior successful in-place mutations, not the original pre-import content

## Requirements — Sync Forms

### Requirement: Shared UI Kit Forms

Export and import forms MUST be built on the shared `Card` (title = `SYNC.EXPORT_TITLE`/`IMPORT_TITLE`), `Button` (variant `fab`), and `InfoBox` (result/error banners) components, replacing raw markup and hand-rolled Tailwind classes.

#### Scenario: Export form uses shared kit
- GIVEN a user opens the export page
- WHEN the page renders
- THEN the title, submit action, and result banner render via `Card`, `Button` (fab), and `InfoBox`

### Requirement: Password Visibility Toggle

Both export and import forms MUST provide a show/hide toggle for the password field.

#### Scenario: Toggle reveals password
- GIVEN a password field with hidden text
- WHEN the user activates the toggle
- THEN the password becomes visible as plain text, and toggling again re-hides it

### Requirement: Translated Error Fallback

Unexpected (non-typed) errors MUST surface a translated catch-all message; a raw untranslated `err.message` MUST NOT reach the UI.

#### Scenario: Unexpected error shows translated text
- GIVEN an unexpected error occurs during export or import
- WHEN the error banner renders
- THEN it displays a translated Spanish message, never a raw English exception string

## Requirements — Usage-Tracker Write-Side

### Requirement: Daily Store Activity Recording

The system MUST record "store active today" on route navigation, buffering the flag per authenticated user in `localStorage` (`lizoft.store-daily-usage-{userId}`), scoped by `userId` + `selectedStoreId`.

#### Scenario: Navigation marks today active
- GIVEN an authenticated user with a selected store navigates to any route
- WHEN the navigation completes
- THEN today's date is recorded as active in that user's local buffer

### Requirement: Buffered POST With Mutex

Unsaved active days MUST be POSTed to `/usages/store-daily-usage`, guarded by an authenticated + non-empty-store check and a `sending` mutex preventing concurrent POSTs.

#### Scenario: Buffered days flush on activity
- GIVEN unsaved active days exist in the local buffer
- WHEN the tracker runs with a valid auth/store context and no POST in flight
- THEN the unsaved days are POSTed and marked as saved on success

#### Scenario: Concurrent navigation does not duplicate POST
- GIVEN a POST to `/usages/store-daily-usage` is already in flight
- WHEN another navigation event fires
- THEN no second concurrent POST is issued until the first completes

## Requirements — Service-Worker Update Polling

### Requirement: Periodic Update Check

While the app remains open, the registered service worker MUST poll `registration.update()` on an interval of approximately 15 minutes, in addition to the existing update-available confirm/apply flow.

#### Scenario: Long-lived open tab discovers a new version
- GIVEN a POS tab has been open for over 15 minutes with no manual reload
- WHEN the periodic poll runs and a new service-worker version exists on the server
- THEN the existing update-available prompt is triggered without requiring a manual refresh

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

### Requirement: getInventoryEntriesJson Raw Passthrough on InventoryOfflineService
`InventoryOfflineService` MUST expose `getInventoryEntriesJson(storeId)`, a 1:1 port of Angular's
`inventory-offline.service.ts` lines 494-496: `localStorage.getItem(this.getStorageKey()) || "{}"`.
It MUST return the raw on-disk string as-is (no parse, no Map rebuild, no re-serialization), with
a literal `"{}"` fallback (not `"[]"`) when the key is missing — matching Angular's exact quirk.

#### Scenario: Returns raw stored string unmodified
- GIVEN inventory data exists in `localStorage` for a store
- WHEN `getInventoryEntriesJson(storeId)` is called
- THEN it MUST return the exact raw string stored at the inventory key, without parsing or re-serializing it

#### Scenario: Missing key falls back to literal "{}"
- GIVEN no inventory data exists yet for a store
- WHEN `getInventoryEntriesJson(storeId)` is called
- THEN it MUST return the literal string `"{}"`, not `"[]"` or `undefined`

#### Scenario: Corrupt stored data passes through unchanged (no silent data loss)
- GIVEN the on-disk inventory value is malformed/corrupt JSON
- WHEN `getInventoryEntriesJson(storeId)` is called
- THEN it MUST return the corrupt string as-is (matching Angular's export behavior), and MUST NOT silently swallow it into an empty result

### Requirement: Sync Export/Import Read Side Uses InventoryOfflineService, Not a Repository
`sync/routes/export.tsx` and `sync/routes/import.tsx` MUST NOT construct
`new InventoryRepository(...)` for the serializer's inventory read side. They MUST construct
`InventoryOfflineService` and pass it to `DataSerializerService`, which MUST read inventory via
`getInventoryEntriesJson()` rather than via a repository `getAll()` + Map-rebuild +
re-`JSON.stringify()` sequence.

#### Scenario: No InventoryRepository import in sync routes
- GIVEN a reviewer inspects `sync/routes/export.tsx` and `sync/routes/import.tsx`
- WHEN checking their imports and constructor calls for the inventory read side
- THEN neither MUST import or instantiate `InventoryRepository`

#### Scenario: DataSerializerService reads inventory via the offline service
- GIVEN `DataSerializerService` is constructed for an export
- WHEN it serializes the inventory section of the export payload
- THEN it MUST do so by calling `getInventoryEntriesJson()` on an `InventoryOfflineService` instance, not by rebuilding a Map from a repository read

#### Scenario: Export no longer silently loses corrupt inventory data
- GIVEN the on-disk inventory value is malformed/corrupt JSON
- WHEN an export is performed
- THEN the exported inventory section MUST contain the raw corrupt string (parity with Angular), not a silently-emptied result (fixing the pre-change repository-based behavior that swallowed parse errors)

### Requirement: Sync Structural Readers Re-Point To Faithful Accessors

`data-synchronizer-service.ts:335` and the structural `OrderReader`/`ExpenseReader`/`SaleCreditReader` interfaces declared in `data-serializer-service.ts` (lines 87/91/95, invoked at 150-152) MUST call the injected offline service's Angular-faithful accessor instead of `getAll()`, with sync orchestration, wire format, and import behavior unchanged. The offline service `ExpenseImportService.getAll()` method (line 123 in data-synchronizer-service.ts) MUST ALSO be renamed to `getStorageExpenses()` to maintain consistency. This mirrors the sync re-home pattern established in the BaseRepository elimination (commit 355b31b) — re-point without altering orchestration.

#### Scenario: Data synchronizer re-points its expense call
- GIVEN `data-synchronizer-service.ts:335` currently calling `expenseService.getAll()`
- WHEN re-pointed to `expenseService.getStorageExpenses()`
- THEN sync orchestration output is unchanged

#### Scenario: Structural readers satisfy their interface via the faithful method
- GIVEN `OrderReader`/`ExpenseReader`/`SaleCreditReader` interfaces currently requiring a `getAll()`-shaped method
- WHEN the interfaces are updated to require the Angular-faithful method name, satisfied by the already-injected offline services
- THEN `data-serializer-service.ts:150-152` compiles and serializes with no behavior change

## Out of Scope

The following Angular features are DEAD (no live call sites or never-rendered UI) and MUST NOT be ported:
- Connection interceptor/service (`connection-interceptor.service.ts`, `connection.service.ts`) — fully commented out; React's `useOnlineStatus()` already exceeds it.
- Download-manager service + download-progress UI — fake `Math.random()` progress simulation, component never rendered in any template.
- `SendDataComponent.shareData()` — defined but never bound to any element.
- `MENU.SYNCHRONIZATION.{DOWNLOAD,SEND,RECEIVE}` i18n keys — back a commented-out menu item.

Cart UI and inventory-availability parity are NOT re-scoped here (already closed in earlier stages).
