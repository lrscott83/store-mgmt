# Audit Fields (Offline Services)

## Purpose

Thread the authenticated user's `login` into `createdByName`/`updatedByName` audit fields across the 4 React offline services (Inventory, Order, SaleCredit, Expense), matching Angular (`frontend/`) behavior exactly.

## Requirements

### Requirement: Current User Login Helper

The system MUST expose `getCurrentUserLogin(): string` in `app/shared/lib/auth/current-user.ts` that reads `useAuthStore.getState().user?.login` synchronously at call time.

#### Scenario: Authenticated user

- GIVEN `useAuthStore` state has `user.login = "jdoe"`
- WHEN `getCurrentUserLogin()` is called
- THEN it returns `"jdoe"`

#### Scenario: No authenticated user (fallback)

- GIVEN `useAuthStore` state has `user: null`
- WHEN `getCurrentUserLogin()` is called
- THEN it returns `""`

### Requirement: Create Semantics

On every CREATE operation (`InventoryOfflineService.create`, `OrderOfflineService.create`, `SaleCreditOfflineService.createFromOrder`, `ExpenseOfflineService.create`), the system MUST set `createdByName` to `getCurrentUserLogin()` and MUST set both `updatedByName` and `updatedDate` to `undefined` (Angular parity — a create never touches update audit fields).

#### Scenario: Create while authenticated

- GIVEN a logged-in user with login `"jdoe"`
- WHEN any of the 4 services' create method is called
- THEN the persisted entity has `createdByName: "jdoe"`, `updatedByName: undefined`, `updatedDate: undefined`

#### Scenario: Create while unauthenticated

- GIVEN no authenticated user (`user: null`)
- WHEN any create method is called
- THEN the persisted entity has `createdByName: ""`, `updatedByName: undefined`, `updatedDate: undefined`

### Requirement: createFromOrder Follows Create Semantics

`SaleCreditOfflineService.createFromOrder` MUST be treated as a CREATE for audit purposes (matches Angular `createSaleCredit`), NOT as a mutation, despite being invoked from an order-completion flow.

#### Scenario: Sale credit created from a completed order

- GIVEN an order is completed and triggers `createFromOrder`
- WHEN the sale credit record is persisted
- THEN `createdByName` is set to the current login and `updatedByName`/`updatedDate` are `undefined`

### Requirement: Mutation Semantics

On every MUTATION operation — `update`, `deactivate` (Inventory, Order); `update`, `pay`, `voidByOrderId`, `void` (SaleCredit); `update`, `delete` (Expense) — the system MUST set `updatedByName` to `getCurrentUserLogin()` and `updatedDate` to the current timestamp. `createdByName`/`createdDate` MUST remain untouched.

#### Scenario: Mutation while authenticated

- GIVEN a logged-in user with login `"jdoe"` and an existing entity
- WHEN any mutation method listed above is called
- THEN the entity has `updatedByName: "jdoe"` and `updatedDate` set to now, with `createdByName`/`createdDate` unchanged

#### Scenario: Mutation while unauthenticated

- GIVEN no authenticated user
- WHEN any mutation method is called
- THEN `updatedByName` is set to `""` and `updatedDate` is still set to now

### Requirement: Product Create Semantics

On every CREATE operation on `ProductOfflineService` (`create`, and the CSV import create path in `products.tsx` `handleCsvImport`), the system MUST set `createdByName` to `getCurrentUserLogin()` and MUST set both `updatedByName` and `updatedDate` to `undefined` (Angular parity — `addProductData()` never touches update audit fields on create). The two hardcoded `createdByName: ''` literals in `products.tsx` (`handleCreateProduct` and `handleCsvImport`) MUST be removed — stamping happens inside the service, overriding any caller-supplied audit fields.

#### Scenario: Create while authenticated

- GIVEN a logged-in user with login `"jdoe"`
- WHEN `ProductOfflineService.create()` is called with a caller-supplied `createdByName` of `''` (or any value)
- THEN the persisted product has `createdByName: "jdoe"`, `updatedByName: undefined`, `updatedDate: undefined`

#### Scenario: CSV import create while authenticated

- GIVEN a logged-in user with login `"jdoe"` importing products via CSV
- WHEN `handleCsvImport` calls `ProductOfflineService.create()` for each imported row
- THEN each persisted product has `createdByName: "jdoe"`, not the literal `''` previously hardcoded at the call site

#### Scenario: Create while unauthenticated

- GIVEN no authenticated user (`user: null`)
- WHEN `ProductOfflineService.create()` is called
- THEN the persisted product has `createdByName: ""`, `updatedByName: undefined`, `updatedDate: undefined`

### Requirement: Product Update Semantics

On `ProductOfflineService.update()` and `updateMany()`, the system MUST set `updatedByName` to `getCurrentUserLogin()` and `updatedDate` to the current timestamp, for every product touched. `createdByName`/`createdDate` MUST remain untouched. This applies regardless of what the caller (`handleEditProduct`, `handleBulkSave`) supplies for those fields.

#### Scenario: Update while authenticated

- GIVEN a logged-in user with login `"jdoe"` and an existing product
- WHEN `ProductOfflineService.update()` is called
- THEN the product has `updatedByName: "jdoe"` and `updatedDate` set to now, with `createdByName`/`createdDate` unchanged

#### Scenario: updateMany stamps every product in the batch

- GIVEN a logged-in user with login `"jdoe"` and a batch of existing products
- WHEN `ProductOfflineService.updateMany()` is called with that batch
- THEN every product in the batch has `updatedByName: "jdoe"` and `updatedDate` set to now, with each product's `createdByName`/`createdDate` unchanged

#### Scenario: Update while unauthenticated

- GIVEN no authenticated user
- WHEN `ProductOfflineService.update()` or `updateMany()` is called
- THEN `updatedByName` is set to `""` and `updatedDate` is still set to now

### Requirement: Product Delete Is Angular-Parity Soft Delete

`ProductOfflineService.delete()` MUST perform a soft delete — matching Angular `deleteProduct()` — setting `isActive` to `false`, `updatedByName` to `getCurrentUserLogin()`, and `updatedDate` to the current timestamp, via an upsert. It MUST NOT hard-remove the record from the repository (no `repo.remove()`). This is a behavior change from the current hard-delete implementation, required for sync correctness (the import pipeline is upsert-only and cannot propagate a hard delete or carry an audit stamp).

#### Scenario: Delete while authenticated

- GIVEN a logged-in user with login `"jdoe"` and an existing, active product
- WHEN `ProductOfflineService.delete()` is called for that product
- THEN the product's `isActive` is `false`, `updatedByName` is `"jdoe"`, and `updatedDate` is set to now

#### Scenario: Deleted product still exists in storage (soft-delete, not removal)

- GIVEN a product is deleted via `ProductOfflineService.delete()`
- WHEN `ProductOfflineService.getAll()` (or the underlying repository read) is inspected afterward
- THEN the product record still exists in storage with `isActive: false` — it is NOT absent, and NOT hard-removed

#### Scenario: Delete while unauthenticated

- GIVEN no authenticated user
- WHEN `ProductOfflineService.delete()` is called
- THEN the product's `isActive` is `false`, `updatedByName` is `""`, and `updatedDate` is set to now

### Requirement: Stamping Centralized Inside ProductOfflineService

Audit-field stamping for `create`, `update`, `updateMany`, and `delete` MUST be centralized inside `ProductOfflineService` methods, not at the route/call-site layer. Any audit fields supplied by a caller (route handler, CSV import) for these methods MUST be overridden by the service's own stamping logic — the route layer MUST NOT own audit semantics.

#### Scenario: Caller-supplied audit fields are overridden

- GIVEN a route handler calls `ProductOfflineService.create()` with an explicit (stale or empty) `createdByName` in the payload
- WHEN the service processes the call
- THEN the persisted `createdByName` reflects `getCurrentUserLogin()` at call time, not the caller-supplied value

### Requirement: Exact Call Site Coverage

The following 19 call sites MUST implement the Create/Mutation semantics above — no other call sites are in scope.

| Service | Create sites | Mutation sites |
|---|---|---|
| InventoryOfflineService | `create` | `update`, `deactivate` |
| OrderOfflineService | `create` | `update`, `deactivate` |
| SaleCreditOfflineService | `createFromOrder` | `update`, `pay`, `voidByOrderId`, `void` |
| ExpenseOfflineService | `create` | `update`, `delete` |
| ProductOfflineService | `create` | `update`, `updateMany`, `delete` |

#### Scenario: All 19 call sites covered

- GIVEN the 5 offline service files after this change
- WHEN each of the 19 listed methods (14 from the base services + 5 from Product) is inspected
- THEN each sets audit fields per its Create or Mutation requirement above — no call site is skipped

## Out of Scope (explicit)

- `OwnerOfflineService`, `ReSellerOfflineService` — NOT a gap: Angular never client-stamps their audit fields (server-populated), and no offline services exist in React. Parity is already satisfied by omission on both sides; adding client-side stamping would BREAK parity. Not covered here unless Angular behavior changes.
- `EditProductsModal` bulk-edit vs Angular bulk-create divergence (Product) — pre-existing, orthogonal behavioral difference. Not fixed here; this spec only requires stamping whichever path React actually has (`updateMany`).
- Any change to `updatedDate` behavior on mutations (already correct = now).
