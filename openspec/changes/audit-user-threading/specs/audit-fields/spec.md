# Delta for Audit Fields (Offline Services)

## Purpose

Thread the authenticated user's `login` into `createdByName`/`updatedByName` audit fields across the 4 React offline services (Inventory, Order, SaleCredit, Expense), matching Angular (`frontend/`) behavior exactly. No existing spec exists for this domain yet — all requirements below are new (ADDED).

## ADDED Requirements

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

### Requirement: Exact Call Site Coverage

The following 14 call sites MUST implement the Create/Mutation semantics above — no other call sites are in scope.

| Service | Create sites | Mutation sites |
|---|---|---|
| InventoryOfflineService | `create` | `update`, `deactivate` |
| OrderOfflineService | `create` | `update`, `deactivate` |
| SaleCreditOfflineService | `createFromOrder` | `update`, `pay`, `voidByOrderId`, `void` |
| ExpenseOfflineService | `create` | `update`, `delete` |

#### Scenario: All 14 call sites covered

- GIVEN the 4 offline service files after this change
- WHEN each of the 14 listed methods is inspected
- THEN each sets audit fields per its Create or Mutation requirement above — no call site is skipped

## Out of Scope (explicit)

- `ProductOfflineService`, `OwnerOfflineService`, `ReSellerOfflineService` — same `AuditableBaseModel` gap, tracked as a follow-up change, not covered here.
- Any change to `updatedDate` behavior on mutations (already correct = now).
