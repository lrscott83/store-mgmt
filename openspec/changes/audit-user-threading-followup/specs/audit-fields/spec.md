# Delta for Audit Fields (Product Offline Service)

## Purpose

Close the Product gap deferred by the completed `audit-user-threading` change: thread the authenticated user's `login` into `createdByName`/`updatedByName` for `ProductOfflineService`, and convert `delete()` from a hard delete to an Angular-parity soft delete, matching `frontend/src/app/application/products/product.repository.ts` exactly. Builds on the `audit-fields` domain established by the sibling spec (`sdd/audit-user-threading/spec`) — all requirements below are new (ADDED), scoped to Product only.

## ADDED Requirements

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

### Requirement: Exact Call Site Coverage (Product)

The following `ProductOfflineService` methods and their `products.tsx` call sites MUST implement the semantics above — no other Product call site is in scope for this change.

| Method | Call site(s) in `products.tsx` | Semantics |
|---|---|---|
| `create` | `handleCreateProduct`, `handleCsvImport` | Create |
| `update` | `handleEditProduct` | Update |
| `updateMany` | `handleBulkSave` | Update (batch) |
| `delete` | `handleDeleteProduct` | Soft delete |

#### Scenario: All Product call sites covered

- GIVEN `product-offline-service.ts` and `products.tsx` after this change
- WHEN each of the 4 listed methods and their call sites is inspected
- THEN each sets audit fields per its Create/Update/Soft-delete requirement above, and no hardcoded `createdByName: ''` literal remains in `products.tsx`

## Out of Scope (explicit)

- **Owner, ReSeller** — NOT a gap, not deferred: Angular never client-stamps their audit fields (`owner.service.ts`/`reseller.service.ts` payloads omit them; server-populated), and no `owner-offline`/`reseller-offline` service exists in React. Parity is already satisfied by omission on both sides; adding client-side stamping would BREAK parity. Not covered by this or any future spec unless Angular behavior changes.
- **`EditProductsModal` bulk-edit vs Angular bulk-create divergence** — pre-existing, orthogonal behavioral difference (React does bulk price-edit via `updateMany`; Angular does bulk create via `createProducts`). Not fixed here; this spec only requires stamping whichever path React actually has (`updateMany`).
- **`getCurrentUserLogin()` helper itself** — already specified and implemented by the sibling `audit-fields` spec (`sdd/audit-user-threading/spec`); not re-specified here.
