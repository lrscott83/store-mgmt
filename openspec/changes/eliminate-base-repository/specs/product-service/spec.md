# Delta for product-service

Governs proposal `eliminate-base-repository`. `ProductRepository`/`ProductCategoryRepository`
stop depending on the React-invented `BaseRepository<T>` (no Angular correlate — playbook rule
12) and inline their own persistence, restoring behavior `BaseRepository` had homogenized away.
Angular `frontend/` remains the sole source of truth; no live backend involved.

## ADDED Requirements

### Requirement: No Shared Repository Base Class
`ProductRepository` and `ProductCategoryRepository` MUST NOT depend on any shared generic
storage base class (e.g. `BaseRepository<T>`). Each MUST implement its own private persistence
methods, mirroring only its own matching Angular source file — never a generic shared by
multiple consumers.

#### Scenario: Shared base class rejected
- GIVEN a reviewer inspects `ProductRepository` and `ProductCategoryRepository`
- WHEN checking their class declarations and imports
- THEN neither MUST extend or import a shared `BaseRepository<T>` or equivalent generic storage class

### Requirement: Product Repository Wire Format, Cache, and Auto-Init
`ProductRepository` persistence MUST mirror Angular's `products/product.repository.ts` exactly:
- On-disk value at key `lizoft.store-products-{storeId}` MUST be
  `JSON.stringify(Array.from(map.entries()))` (Map-entries), never a plain array of product objects.
- MUST hold a per-instance in-memory cache, reloaded only when storage is empty/missing or the
  store key changes (not re-parsed on every call).
- On an empty or missing read, MUST auto-initialize by writing an empty Map (`[]`) to storage
  before returning, rather than throwing or returning `undefined`.
- MUST NOT revive any field to a `Date` on read (Angular's product repository revives no dates).

#### Scenario: Products persist as Map-entries
- GIVEN a product is added via `ProductRepository`
- WHEN the on-disk value for `lizoft.store-products-{storeId}` is inspected
- THEN it MUST be a JSON array of `[key, value]` pairs, not a plain array of product objects

#### Scenario: Auto-init on empty read
- GIVEN no value yet exists for the products storage key
- WHEN `ProductRepository` performs its first read
- THEN it MUST write an empty Map-entries array to storage and return an empty result, without throwing

#### Scenario: Cache reused across calls
- GIVEN `ProductRepository` has already loaded its products cache for the current store
- WHEN a second read method is called without any intervening write or store-key change
- THEN it MUST reuse the in-memory cache rather than re-parsing storage

### Requirement: Product Category Repository Wire Format, Cache, and Auto-Init
`ProductCategoryRepository` persistence MUST mirror Angular's
`categories/product-category.repository.ts` exactly, following the same rules as the Product
Repository above: Map-entries wire format at key `lizoft.store-product-categories-{storeId}`,
per-instance cache reloaded only on empty/missing storage or store-key change, auto-init on empty
read, and no date revival.

#### Scenario: Categories persist as Map-entries
- GIVEN a category is added via `ProductCategoryRepository`
- WHEN the on-disk value for `lizoft.store-product-categories-{storeId}` is inspected
- THEN it MUST be a JSON array of Map-entries, not a plain array of category objects

#### Scenario: Auto-init on empty read
- GIVEN no value yet exists for the categories storage key
- WHEN `ProductCategoryRepository` performs its first read
- THEN it MUST write an empty Map-entries array to storage and return an empty result, without throwing
