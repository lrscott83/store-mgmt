# Delta for Sync

## REMOVED Requirements

### Requirement: Sync Import Behavior Unchanged (Re-Home Only)

(Reason: SUPERSEDED by "Sync Import Routes Through Domain Repositories (Full Validation Parity)" —
product/category import now enforces full Angular validation instead of preserving the prior
weaker global-only behavior.)

## ADDED Requirements

### Requirement: Sync Import Routes Through Domain Repositories (Full Validation Parity)

Product and category sync merges MUST route through the real `ProductRepository`/
`ProductCategoryRepository` (Angular-parity DI, e.g. `ProductRepository(storeId, new
ProductCategoryRepository(storeId))`), replacing the generic name-uniqueness-only shim. This
intentionally CHANGES prior merge/revert behavior to recover Angular parity. Orders, inventory
entries, expenses, and sale credits are unaffected — they keep break-only shim/service routing.

#### Scenario: Product import uses the real repository
- GIVEN a `products.json` import file
- WHEN products merge
- THEN each item calls `addImportedProduct`/`updateImportedProduct` on `ProductRepository`, never a generic shim

#### Scenario: Category import uses the real repository
- GIVEN a `categories.json` import file
- WHEN categories merge
- THEN each item calls `addImportedProductCategory`/`updateImportedProductCategory` on `ProductCategoryRepository`, never a generic shim

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

## MODIFIED Requirements

### Requirement: Domain-Validated Import With Abort-and-Revert

Import MUST route merge writes through domain repositories that enforce existing business rules —
for categories: name-uniqueness + order-shift; for products: category-exists,
barcode-uniqueness, per-category name-uniqueness, and order-shift — replacing any raw-storage
bypass that never fails. On first validation failure for products or categories, the system MUST
abort that entity type's merge and revert it to its pre-import state (per "Revert Passes the Live
Mutated Reference On Failure"); no writes beyond that mutated state may persist.
(Previously: cited only generic "e.g., category/product name uniqueness", without the
product-specific barcode/category-exists/order-shift rules.)

#### Scenario: Duplicate category name rejected and reverted
- GIVEN an import file containing a category name that already exists in the target store
- WHEN the import runs
- THEN the category merge fails, categories revert to their pre-import state, and a typed merge error is surfaced

#### Scenario: No-write-on-failure preserved for decrypt/parse errors
- GIVEN a corrupt file or wrong password
- WHEN import is attempted
- THEN decrypt/parse fails before any repository write occurs (existing guarantee unchanged)

### Requirement: Sync-Local Storage Shim Replaces Shared Base Repository

`sync/routes/import.tsx` MUST NOT construct raw `new BaseRepository<...>` instances. Orders and
sale credits MUST use sync-local storage shims satisfying `GenericUpsertRepo`. Categories and
products MUST NOT use a `NameUniqueRepo` shim — `import.tsx` MUST construct the real
`ProductCategoryRepository`/`ProductRepository` directly, and `DataSynchronizerService` MUST
consume them through a dedicated repository-backed seam.
(Previously: categories and products also went through `NameUniqueRepo` shims, same as
orders/sale-credits' `GenericUpsertRepo` shims.)

#### Scenario: No BaseRepository import in the sync module
- GIVEN a reviewer inspects `sync/routes/import.tsx` and any sync-local shim files
- WHEN checking their imports
- THEN none MUST import or instantiate `BaseRepository`

#### Scenario: Products and categories bypass the generic shim
- GIVEN a reviewer inspects the production sync wiring for products/categories
- WHEN checking which class performs the merge writes
- THEN it MUST be the real `ProductRepository`/`ProductCategoryRepository`, never `makeProductRepoShim`/the category shim or any `NameUniqueRepo` shim

### Requirement: Sync Shim Wire-Format Parity Per Entity

Sync-local shims (orders, sale credits ONLY) MUST read/write the same on-disk keys/formats as
their offline services — plain-array, converting array↔Map internally. Categories and products no
longer go through a shim; they read/write Map-entries directly via `ProductRepository`/
`ProductCategoryRepository`, inherently sharing storage keys/format with those repositories.
(Previously: categories/products were also described as shim-backed Map-entries, parallel to
orders/sale-credits.)

#### Scenario: Orders remain plain-array via the shim
- GIVEN an order was created via `OrderOfflineService` before any sync import
- WHEN a backup is imported and orders merge
- THEN `lizoft.store-orders-{storeId}` MUST remain a plain JSON array readable by `OrderOfflineService` afterward

#### Scenario: Category import writes through the real repository directly
- GIVEN a category exists via `ProductCategoryRepository` before any sync import
- WHEN a backup is imported and categories revert on a name clash
- THEN `lizoft.store-product-categories-{storeId}` MUST remain Map-entries format, written by `ProductCategoryRepository` itself, not a shim copy
