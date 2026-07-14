# Order Service Specification (New Capability)

## Purpose

`OrderOfflineService` (React) reaches full parity with Angular's `order-offline.service.ts`
(471 lines): correct method names/signatures, the ratified A/B/C/D return-shape framework
(service-return-shape-parity #715 Order categorization), internalized inventory-module gating,
and the `deactivateOrder` cascade-guard. New capability — no prior `order-service` spec exists;
Fase 6 slice 2 of 3.

## Requirements

### Requirement: Public Method Names And Signatures Mirror Angular
The service MUST rename methods and restore Angular's parameter order.

| Angular | React (before) | React (after) |
|---|---|---|
| `createOrder(cartItems,type,isCredit,paymentType,details,client)` | `create(cartItems,paymentType,isCredit,clientName,orderType,hasInventoryModule,details?)` | `createOrder(cartItems,type,isCredit,paymentType,details,client)` — `hasInventoryModule` param REMOVED |
| `updateTodayOrder(id,paymentType)` | `update(id,paymentType)` | `updateTodayOrder(id,paymentType)` |
| `deactivateOrder(id)` | `deactivate(id)` | `deactivateOrder(id)` |

#### Scenario: createOrder signature matches Angular
- GIVEN a caller building an order
- WHEN it invokes the service
- THEN the method is named `createOrder`, accepts `(cartItems, type, isCredit, paymentType, details, client)` in that order, and has NO `hasInventoryModule` parameter

#### Scenario: updateTodayOrder and deactivateOrder renamed
- GIVEN existing call-sites reference `update`/`deactivate`
- WHEN this parity change lands
- THEN they are renamed to `updateTodayOrder`/`deactivateOrder` and all call-sites/tests updated

### Requirement: Return Shapes Follow The Ratified A/B/C/D Categorization
Per the Order row of the service-return-shape-parity categorization (#715):

| Category | Methods | Shape |
|---|---|---|
| A (sync, plain) | `getOrderById`, `getOrdersJson`, `getActiveOrdersPrice*/Profit*`, `getActiveOrdersInDay` | plain value/array, no envelope |
| B (sync, envelope) | `getCategoryCartItemsView` | `BaseResponseModel<CategoryCartItemsView[]>` |
| C (async, envelope) | `createOrder`, `getActiveTodayOrdersObservable`, `filterOrdersObservable`, `getCategoryCartItemsViewObservable` | `Promise<BaseResponseModel<T>>`, NEVER rejects — resolves `succeeded:false` on failure |
| D (sync, Result/DataResult) | `activateOrder`→`Result`, `deactivateOrder`→`Result`, `updateTodayOrder`→`DataResult<Order>` | never throws |

#### Scenario: createOrder resolves an envelope
- GIVEN valid cart items
- WHEN `createOrder(...)` is called
- THEN it returns `Promise<BaseResponseModel<Order>>` resolving `succeeded:true` with `.data` holding the created order

#### Scenario: getCategoryCartItemsView stays sync with envelope
- GIVEN active orders exist for a given date
- WHEN `getCategoryCartItemsView(date)` is called
- THEN it returns `BaseResponseModel<CategoryCartItemsView[]>` synchronously (no Promise)

#### Scenario: D-shape commands never throw on not-found
- GIVEN an order id that does not exist
- WHEN `updateTodayOrder`/`activateOrder`/`deactivateOrder` is called with that id
- THEN it returns `DataResult`/`Result` with `succeeded:false` and an `OrderErrors.NotExists` entry — it MUST NOT throw

#### Scenario: getActiveTodayOrdersObservable and filterOrdersObservable resolve async
- GIVEN active orders exist
- WHEN either method is called
- THEN it returns `Promise<BaseResponseModel<Order[]>>` resolving `succeeded:true`

### Requirement: Inventory Deduction Gate Is Internal, Not A Parameter
`createOrder` MUST NOT accept a `hasInventoryModule` parameter. When building order items, inventory
cost deduction MUST occur only when BOTH `product.discountFromInvantory` is true AND the current
user's store has the inventory module available (mirrors Angular's internal
`authorizationService.hasInventoryModuleAvailable()` check, `order-offline.service.ts:360`; React
port `hasInventoryModuleAvailable(user)`). The service MUST source the current user internally
(mirrors Angular's injected `AuthService`/`AuthorizationService`), not via a caller-supplied flag.

#### Scenario: Deduct when discount-eligible and module available
- GIVEN a product with `discountFromInvantory=true` and the current store has the inventory module available
- WHEN `createOrder` builds order items for that product
- THEN inventory costs are deducted via `getAvailableInventoryCosts`

#### Scenario: No deduction when module unavailable
- GIVEN a product with `discountFromInvantory=true` but the current store's inventory module is NOT available
- WHEN `createOrder` builds order items for that product
- THEN `productCosts` is empty — no deduction occurs

#### Scenario: No deduction when product is not discount-eligible
- GIVEN a product with `discountFromInvantory=false`
- WHEN `createOrder` builds order items for that product
- THEN `productCosts` is empty regardless of module availability

### Requirement: deactivateOrder Cascade-Guard Blocks On SaleCredit Failure
`deactivateOrder` MUST check the result of `saleCreditService.deactivateSaleCreditByOrderId` BEFORE
restocking inventory. If that call fails, `deactivateOrder` MUST return `Result.Failure` and MUST NOT
call `increaseQuantitiesByOrderItems`.

#### Scenario: SaleCredit deactivation fails — order stays unrestocked
- GIVEN a credit order whose `deactivateSaleCreditByOrderId` call fails
- WHEN `deactivateOrder(id)` is called
- THEN it returns `Result.Failure` and inventory quantities are NOT increased

#### Scenario: SaleCredit deactivation succeeds — cascade proceeds
- GIVEN a credit order whose `deactivateSaleCreditByOrderId` call succeeds
- WHEN `deactivateOrder(id)` is called
- THEN the order is marked inactive, inventory is restocked via `increaseQuantitiesByOrderItems`, and the method returns that call's `Result`

### Requirement: getActiveOrdersInDay Ignores Its date Parameter
Mirroring Angular's behavior, `getActiveOrdersInDay(date)` MUST always use today's day boundaries and
MUST ignore the passed `date` argument.

#### Scenario: Passed date is ignored
- GIVEN `getActiveOrdersInDay` is called with a date in the past
- WHEN evaluating the result
- THEN only today's active orders are returned, never orders from the passed date

### Requirement: Revival On Read Is date-Only
`getOrdersFromLocalStorage` MUST revive only the `date` field to a `Date` instance on read.
`createdDate`/`updatedDate` MUST remain un-revived (mirrors Angular).

#### Scenario: Only date is revived
- GIVEN stored order JSON with `date`, `createdDate`, `updatedDate` as strings
- WHEN orders are loaded from storage
- THEN `date` is a `Date` instance and `createdDate`/`updatedDate` remain unconverted (strings)

### Requirement: getOrderById Replaces Inline Duplication
A public `getOrderById(id): Order | undefined` MUST exist and MUST be the single lookup used
internally, replacing the 3 inline `.find` duplicates (`activateOrder`/`deactivateOrder`/`updateTodayOrder` paths).

#### Scenario: Lookup by id
- GIVEN an order exists in storage
- WHEN `getOrderById(id)` is called with its id
- THEN the matching order is returned; an unknown id returns `undefined`

### Requirement: getOrdersJson Is Exposed
A public `getOrdersJson(): string` MUST exist, returning the raw current-store orders JSON
(or `"[]"` if absent), mirroring Angular.

#### Scenario: Raw JSON export
- GIVEN orders exist in storage for the current store
- WHEN `getOrdersJson()` is called
- THEN it returns the exact JSON string from storage, or `"[]"` when nothing is stored

### Requirement: Cart Store Order Details State
The cart store (`cart-store.ts`) MUST expose an `orderDescription: string | undefined` field
(1:1 port of Angular's `ShoppingCartService.orderDescription`, `shopping-cart.service.ts:24` —
declared with NO initializer, `undefined` until first write) and an
`updateOrderDetails(orderType, orderDescription)` setter that writes BOTH `orderType` and
`orderDescription` in one call (mirrors `shopping-cart.service.ts:38-41`). A
`getOrderDescription(): string | undefined` getter MUST also exist (mirrors
`shopping-cart.service.ts:55-56`). `orderType` remains the SAME field already written by
`addItem`'s new-item branch — no per-field ownership conflict is introduced; whichever call
executes last wins, exactly as in Angular (no confirmation dialog, per source's own
unimplemented TODO).

#### Scenario: updateOrderDetails writes both fields
- GIVEN a cart store in any state
- WHEN `updateOrderDetails(orderType, orderDescription)` is called
- THEN `store.orderType` equals the given orderType AND `store.orderDescription` equals the given orderDescription

#### Scenario: addItem still owns orderType on new items
- GIVEN the cart is empty
- WHEN `addItem(product, qty, orderType)` is called
- THEN `store.orderType` updates exactly as before (unchanged existing behavior)

### Requirement: Clear Resets Order Description
`clear()` MUST reset `orderDescription` to `''` in addition to its existing resets (mirrors
Angular's `clearCart`, `shopping-cart.service.ts:163`).

#### Scenario: clear resets description
- GIVEN `orderDescription` is set to a non-empty value (or is `undefined`)
- WHEN `clear()` is invoked (manual clear or post-order-success clear)
- THEN `orderDescription` equals `''`

### Requirement: Edit Order Details Modal (Ported, Unwired By Design)
A React component `EditOrderDetailsModal` (`sales/components/edit-order-details-modal.tsx`)
MUST exist as a 1:1 port of Angular's `EditOrderDetailsModalComponent`: an `orderType` select
(REQUIRED, options from `getOrderTypes()`) and a free-text `description` textarea (OPTIONAL),
both prefilled from the current cart store values on mount. Submitting a valid form MUST call
`updateOrderDetails(orderType, description)` and then `onClose()`, WITHOUT calling any
callback/emitter — Angular's `orderDetailsUpdatedEmitter` has no live consumer (its one
subscriber targets a non-existent `productCategoryUpdatedEmitter` property, i.e. dead/broken
code) and React's Zustand reactivity already re-renders subscribers, so no emitter is invented
(ADR-2). The header label is hardcoded `"Tipo de venta"` (not an i18n key, mirrors Angular's
own untranslated markup); the modal title uses i18n key `SHOPPING_CART.EDIT_DETAILS`; the
description label uses `GENERAL.DESCRIPTION`; the footer buttons use `GENERAL.CLOSE` /
`GENERAL.SAVE`.

This component is intentionally UNWIRED: no trigger button or menu item mounts it anywhere in
the app. This is a ratified literal-parity decision, not an omission — Angular's own
`NavRightComponent.editOrderDetails()` (the only method that opens this modal) has NO
`(click)` binding anywhere in the Angular template tree (exhaustive grep confirmed), making
Angular's modal unreachable dead code. React mirrors the component's existence (rule 12 — if
Angular has the class, React has it) without inventing a trigger Angular itself never shipped.
Do not add a trigger button to "complete" this feature without an explicit new decision to do
so — it was already decided against during `edit-order-details-parity` (Fase 6 slice 3/3).

#### Scenario: modal prefills from store
- GIVEN store has `orderType = Mayorista` and `orderDescription = "nota"`
- WHEN the modal opens
- THEN the orderType select shows `Mayorista` AND the description field shows `"nota"`

#### Scenario: valid submit updates store and closes
- GIVEN the modal is open with a valid orderType selected
- WHEN the user submits the form
- THEN `updateOrderDetails` is called with the form's orderType and description AND the modal closes

#### Scenario: missing required orderType blocks submit
- GIVEN the modal is open with no orderType selected
- WHEN the user submits the form
- THEN validation errors are shown, `updateOrderDetails` is NOT called, and the modal stays open

#### Scenario: empty description is valid
- GIVEN the modal is open with a valid orderType and an empty description
- WHEN the user submits the form
- THEN `updateOrderDetails` is called with an empty-string description and the modal closes

### Requirement: Order Description Threaded Into createOrder
The order-creation call site (`cart-shell.tsx`) MUST pass the cart store's `orderDescription`
as the `details` positional argument to `orderService.createOrder(...)` (mirrors Angular's live
`nav-right.component.ts:203-210` `getOrderDescription()` threading), replacing the previous
hardcoded `undefined` literal. Because `createOrder`'s internal `details || fallback` logic
already treats `undefined` and `''` identically (both falsy), this wiring is a structural parity
fix with NO observable behavior change while the modal stays unwired — `orderDescription` is
only ever non-empty if a future decision wires a trigger to the modal.

#### Scenario: order created with description
- GIVEN `orderDescription = "entrega tarde"` in the store
- WHEN the user submits a valid order
- THEN `orderService.createOrder` is called with `details === "entrega tarde"`

#### Scenario: order created with no description set
- GIVEN `orderDescription` is `undefined` (fresh/never-written state) or `''` (post-clear state)
- WHEN the user submits a valid order
- THEN `orderService.createOrder` is called with `details` equal to that raw store value (`undefined` before any clear, `''` after), and `createOrder`'s internal `details || fallback` makes both cases store an identical result — matching Angular's uninitialized-then-cleared field behavior

## Out Of Scope (deferred, ratified — gates #1083)
- `getLastMonthSaleProfits`/`getLastMonthSales` (gate e — coupled to pending React-invented aggregation-service removal).
- `addImportedOrder`/`updateImportedOrder` (already DONE, slice 1).

## Closed Capabilities (Fase 6 — Angular→React parity migration COMPLETE)
Slice 3 (`edit-order-details`) closes Fase 6 (order/cart) and the ENTIRE Angular→React parity
migration. All 3 order-service slices (sync-import, offline-service, edit-order-details) are
now archived. No further order-service or shopping-cart/Zustand parity work is pending.
