# Spec: offline-service-return-shapes (NEW capability)

## Purpose

Per-method return-shape contract (A/B/C/D) for the 7 React offline services (Inventory,
Product, ProductCategory, Order, Expense, SaleCredit, `BaseService<T>`), mirroring Angular
`frontend/` source literally. Angular is the SOLE source of truth. Envelopes `BaseResponseModel<T>`
(B/C) and `Result`/`DataResult` (D) MUST stay distinct types — never unified.

## Requirements

### Requirement: Category A — plain sync, unchanged
The system MUST leave category-A methods (plain sync value, no envelope in Angular) as-is.

#### Scenario: Plain sync value
- GIVEN `Order.getActiveOrdersPriceToday` (category A)
- WHEN called
- THEN it returns a sync `number`, no envelope, no Promise

### Requirement: Category B — BaseResponseModel<T> SYNC
The system MUST restore `BaseResponseModel<T>` for category-B methods (Angular: `Success()`,
no Observable) SYNCHRONOUSLY — never flattened to a bare value.

#### Scenario: Sync envelope restored
- GIVEN `Inventory.getInventoryCategoriesView` (category B)
- WHEN called
- THEN it returns SYNC a `BaseResponseModel<InventoryCategoryView[]>` (not a bare array)

### Requirement: Category C — Promise<BaseResponseModel<T>>, the ONLY async category
The system MUST convert category-C methods (Angular `Observable<BaseResponseModel<T>>`) to
`Promise<BaseResponseModel<T>>`. No other category becomes async.

#### Scenario: Async envelope
- GIVEN `Order.createOrder` (category C)
- WHEN called
- THEN it resolves a `Promise<BaseResponseModel<Order>>`; `.data` holds the created order and
  `.errors` is empty on success, or populated `BaseError[]` on failure

### Requirement: Category D — Result/DataResult SYNC, distinct from BaseResponseModel
The system MUST restore `Result`/`DataResult` (`{succeeded, errors}` / `{data, succeeded, errors}`)
SYNCHRONOUSLY for category-D methods, as a type distinct from `BaseResponseModel<T>`.

#### Scenario: Sync Result on failure
- GIVEN `Expense.deleteExpense` (category D)
- WHEN it fails validation
- THEN it returns SYNC a `Result` with `succeeded:false` and populated `errors` — not a thrown
  sentinel, not a `BaseResponseModel`

#### Scenario: Envelope-distinctness conformance
- GIVEN any category-D method's return value
- WHEN its shape is inspected
- THEN it MUST NOT satisfy the `BaseResponseModel<T>` shape (no `message`/`actionCode` fields)

### Requirement: Per-service categorization (Angular-verified)

| Service | A | B | C | D |
|---|---|---|---|---|
| Inventory | cost/query helpers | `getInventoryCategoriesView`, `getInventoryEntriesInDay` | `getInventoryEntriesView`, `filterInventoryEntries`, `getInventoryEntriesInDayObservable`, **`getInventoryCategoriesViewObservable`** (proposal omitted) | `create/update/amortizeSold/deleteInventoryEntry`, `isNotSoldEntry`, `hasAvailableProductToSale`, `increaseQuantitiesByOrderItems`, **`addImportedEntries`, `updateImportedEntries`** (proposal omitted) |
| Product | — | — | ALL interface methods (verified: 100% Observable) | — |
| ProductCategory | — | — | ALL interface methods (verified: 100% Observable) | — |
| Expense | `getExpensesTotal`+ | `getExpensesInDay` | **`getExpensesInDayObservable`, `filterExpensesObservable`** — proposal wrongly said "none"; both ARE Observable in Angular | `create/update/deleteExpense`, **`addImportedExpense`, `updateImportedExpense`** (proposal omitted) |
| SaleCredit | `getSaleCreditsTotalBefore`+ | `getSaleCreditsInDay` | **`getSaleCreditsInDayObservable`, `getUnPaidSaleCreditsInDayObservable`, `getPaidSaleCreditsInDayObservable`, `getSaleCreditsObservable`, `filterSaleCredits`** (last one non-suffixed, verified `Observable<BaseResponseModel<SaleCredit[]>>` at sale-credit-offline:149) — proposal wrongly said "none" | `create/update/paid/deleteSaleCredit`, **`deactivateSaleCreditByOrderId`, `addImportedSaleCredit`, `updateImportedSaleCredit`** (proposal omitted) |
| Order | `getActiveOrdersPriceToday`, `getOrderById`, `getLastMonthSale*`+ | `getCategoryCartItemsView` | `createOrder`, `getActiveTodayOrdersObservable`, `filterOrdersObservable`, `getCategoryCartItemsViewObservable` | `activate/deactivateOrder`, `updateTodayOrder`, `add/updateImportedOrder` |

Bold entries are corrections found by reading Angular source directly, not the proposal's prose.
Order's table is fully verified with no corrections. `+` marks non-exhaustive A groupings.

**Delivery note — Product & ProductCategory (folded into product-service-parity).** The Product and
ProductCategory rows above (both 100% category C) are DELIVERED via the `product-service-parity`
change as a single combined pass (return-shape conversion + exact-surface repo extraction +
validations), NOT built as a standalone slice in THIS change. After Inventory, Expense, and
SaleCredit (already shipped), this change's remaining own scope is: Order (step-4) and the
aggregation-layer removal (step-5). Product/ProductCategory are owned by product-service-parity and
are not re-touched here.

#### Scenario: Corrected category-C scope for Expense/SaleCredit
- GIVEN `Expense.getExpensesInDayObservable` or any of the 4 SaleCredit `*Observable` methods
- WHEN their Angular return type is inspected
- THEN each returns `Observable<BaseResponseModel<T>>` and MUST become category C (async), not
  be left synchronous as the proposal's "no async methods" claim implied

### Requirement: Error-shape parity across the sync/async boundary
The system MUST preserve Angular's exact error structure when crossing shapes: Observable
`Success$`/`Failure$` both use `of(...)` and therefore ALWAYS RESOLVE — a category-C failure
resolves a `Promise<BaseResponseModel<T>>` with `succeeded:false` and populated `BaseError[]`,
never a `Promise.reject`/thrown value. Sync `Success(...)`/`Result` → sync envelope, same rule
(never a thrown sentinel). No flattening of `BaseError[]`.

#### Scenario: Error structure preserved
- GIVEN a category-C method whose Angular Observable emits `Failure$([...errors])`
- WHEN the React Promise settles
- THEN the resolved `BaseResponseModel.errors` array has the same `BaseError{code,description}`
  shape as Angular — never a thrown string or flattened message

### Requirement: Aggregation-layer removal, inlined
The system MUST remove `StatisticsAggregationService`, `report-aggregation-service`, and
`inventory-today-sale-service` (no Angular correlate) and re-express their logic inline, sync,
no envelope, mirroring `OrderOfflineService.getLastMonthSaleProfits/getLastMonthSales`.

#### Scenario: Inlined aggregation output matches Angular
- GIVEN a consumer previously calling the removed aggregation service
- WHEN it now computes the equivalent value inline
- THEN the output matches `OrderOfflineService.getLastMonthSaleProfits`/`getLastMonthSales`'s
  Angular logic bit-for-bit (same grouping/date-window rules)

### Requirement: BaseService<T> shape — RESOLVED (sync seam, outside the conversion)
`BaseService<T>`'s `getAll/getById/delete` MUST stay a SYNC React-only seam and are OUTSIDE the
A/B/C/D category conversion (resolved per design ADR-1, ambiguity #1 — no longer blocking).
Angular's own `BaseService` HTTP CRUD (`getAllItems/getItemById/create/update/delete`) is entirely
`Observable`-based (category C by signature), but none of the 7 offline services that `extends
BaseService` ever call those methods — each only uses the envelope factories `this.Success()`/
`this.Success$()` to build its own domain responses. Converting `getAll/getById/delete` to async
would invent a contract Angular's offline layer never had (rule 2); Angular's Observable base CRUD
is the ONLINE surface, already faithfully mirrored by the `*-http-service.ts` layer.

#### Scenario: BaseService seam stays sync
- GIVEN any of the 7 React offline services (e.g. `InventoryOfflineService`) that `extends BaseService<T>`
- WHEN its inherited `getAll`/`getById`/`delete` methods are called
- THEN they return SYNC values (no `Promise`, no category conversion) — the offline services never
  route through Angular's Observable base CRUD, so no Angular offline correlate exists to mirror

## Out of Scope
Real async I/O (`BaseRepository` stays sync localStorage — category-C Promises are same-tick).
Product and ProductCategory return-shape delivery (both 100% category C) is FOLDED INTO and OWNED
by `product-service-parity`'s single combined pass (return-shape + exact-surface repo extraction +
validations) — this change does NOT build or re-touch them. `product-service-parity`'s broader
exact-surface work likewise stays out of scope here.
