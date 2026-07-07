# Delta Spec — Slice 1: Formal Interfaces + Offline Query/Financial APIs

Governs proposal `sdd/offline-online-service-parity/proposal` (#671), decision #670. Angular `frontend/` is source of truth (pinned from real source files, not prose). Slices 2-6 (Product/Category repo, online layer, auth, admin CRUD, infra) are OUT of scope here.

## Capability: service-interfaces (NEW)

### Requirement: BaseService<T> Contract

The system MUST export a `BaseService<T>` TS interface from `packages/domain` capturing Angular's generic CRUD surface (`create`, `getAllItems`, `getItemById`, `update`, `updateStatusForItems`, `delete`, `deleteItems`) as SYNCHRONOUS operations (no RxJS `Observable` — plain return values). `OrderOfflineService`, `ExpenseOfflineService`, `SaleCreditOfflineService`, and `InventoryOfflineService` MUST implement it (tsc-enforced).

#### Scenario: Offline service satisfies BaseService<T>
- GIVEN `OrderOfflineService` declares `implements BaseService<Order>`
- WHEN `packages/domain` and the app are type-checked (`tsc --noEmit`)
- THEN compilation succeeds only if all `BaseService<T>` members are present with matching signatures

### Requirement: ProductService / ProductCategoryService Contracts

The system MUST export `ProductService` and `ProductCategoryService` interfaces derived from Angular's abstract classes (`domain/interfaces/product.service.ts`, `application/categories/product-category.service.ts`), as sync equivalents of every abstract method (`hasAnyAvailableToSaleProduct`, `getProductById`, `getProductByBarcode`, `getProductsToSelect`, `getAvailableProductsByCategoryId`, `deleteProduct`, `createCsvProducts`, `getProductsToSaleByCategoryId`, `createProduct(...)`, `updateProduct(...)`, `getMaxOrder`, `createProducts`; and for categories: `getProductCategoriesView`, `getAvailableProductCategories`, `createProductCategory`, `updateProductCategory`, `getMaxOrder`). Angular's own `ProductCategoryService` never declares `getProductCategories()` abstract (commented out), causing its two impls to diverge — this interface MUST declare it explicitly so both impls conform (bug fix #3). Interfaces are exported in this slice; `implements` enforcement on `ProductOfflineService`/`ProductCategoryOfflineService` is DEFERRED to Slice 2 (methods `getMaxOrder`, `getAvailableProductsByCategoryId`, `getProductCategoriesView` etc. do not exist yet — see Risks).

#### Scenario: getProductCategories() is part of the contract
- GIVEN both a future offline and online `ProductCategoryService` impl
- WHEN each implements `ProductCategoryService`
- THEN both MUST provide `getProductCategories()` (no longer optional/commented)

## Capability: offline-financial-apis (NEW)

All methods below are pinned from real Angular source (`order-offline.service.ts`, `expense-offline.service.ts`, `sale-credit-offline.service.ts`, `inventory-offline.service.ts`). Date-window helpers: "Today" = `[startOfDay(now), startOfDay(now)+1d)`; "Yesterday" = `[startOfDay(now-1d), startOfDay(now))`; "Total"/"Before" = cumulative sum where `entity.date < threshold`. Observable-returning `filter*Observable` methods MUST be ported as plain synchronous functions returning the filtered array (React has no RxJS) — same input/output contract.

### Requirement: Order Query & Financial APIs

| Method | Given | When | Then |
|---|---|---|---|
| `getOrdersInDay(date)` | orders exist across multiple days | called with an explicit `date` | returns ALL orders (active+inactive) whose `date` falls in `[startOfDay(date), +1d)` — **bug fix**: Angular ignores the passed `date` param and always uses `new Date()`; this has no external contract surface, so React MUST honor the parameter (angular-bugs-policy) |
| `activateOrder(id)` | a deactivated order exists | called with its id | sets `isActive=true`, stamps `updatedDate/updatedByName`; no cascading side effects (unlike `deactivateOrder`) |
| `getActiveOrdersPriceToday()`/`Yesterday()` | active orders exist today/yesterday | called | returns sum of `order.total` for active orders in that day window |
| `getActiveOrdersProfitToday()`/`Yesterday()`/`BetweenDates(s,e)` | active orders with order items and product costs exist | called | returns `sum(orderItem.price*qty - sum(productCosts.costPrice*qty))` over active orders in window |
| `getTopProductsProfitInLastMonth()` / `getTopProductsSaleQuantityInLastMonth()` | active orders exist in `[today-29d, today)` | called | returns top 5 products ranked by summed profit or summed quantity respectively |
| `filterOrdersObservable(isCredit, paymentType, start, end)` → sync `filterOrders(...)` | active orders exist | called with any combination of filters (falsy = unbounded; `isCredit`: -1=any/1=credit/0=non-credit) | returns active orders matching all supplied filters, date range `[start, end)` |

### Requirement: Expense Query & Financial APIs

| Method | Given/When | Then |
|---|---|---|
| `getExpensesTotalBefore(date)` | active expenses with `date < threshold` | sum of `total` |
| `getExpensesTotal()` | — | `getExpensesTotalBefore(startOfDay(now)+1d)` (through end of today) |
| `getExpensesTotalYesterday()` | — | `getExpensesTotalBefore(startOfDay(now))` (through end of yesterday) |
| `getActiveExpensesPriceBetweenDates(s,e)`/`Today()`/`Yesterday()` | active expenses in window | sum of `total` in `[s,e)` |
| `filterExpensesObservable(type,paymentType,start,end)` → sync `filterExpenses(...)` | active expenses exist | returns active expenses matching optional type/paymentType/date-range filters |

### Requirement: SaleCredit Query & Financial APIs

| Method | Given/When | Then |
|---|---|---|
| `getSaleCreditsTotalBefore(date)`/`Total()`/`Yesterday()` | active sale credits | same Before/Total/Yesterday pattern as Expense, sum of `total` |
| `getActiveUnpaidSaleCreditsPriceToday()`/`Yesterday()` | active AND unpaid credits in window | sum of `total` |
| `getActiveSaleCreditsPriceToday()`/`Yesterday()` | active credits (any paid status) in window | sum of `total` |
| `filterSaleCredits(isPaid,client,start,end)` | active credits exist | filters by client substring match, `isPaid` (only constrains when truthy — falsy matches both), and date range |

### Requirement: Inventory Query & Financial APIs

| Method | Given/When | Then |
|---|---|---|
| `getInventoryCostTotalBefore(date)`/`Total()`/`Yesterday()` | active entries with `date < threshold` | sum of `available * costPrice` (same Before/Total/Yesterday pattern) |
| `filterInventoryEntries(productId,start,end)` | active entries exist | returns entries matching optional productId/date-range filters |
| `getInventoryEntriesView()` | entries with `available>0 && isActive` per product | returns per-product FIFO cost breakdown sorted by `order` ascending, plus total `productAvailable` |
| `updateAvailableInventories(productId,quantity)` | available entries exist for product, ordered by `order` | decrements `available` FIFO across entries WITHOUT creating cost-consumption records; returns `false` if no available inventory exists |
| `amortizeSoldEntry(productId,entryId)` | entry has `quantity !== available` (something was sold) | zeroes `available` and reduces `quantity` by the previous `available`; fails with `EntryNotExists` or `SaleNotExistsWithThisEntry` (when `quantity===available`) otherwise |
| `updateInventoryEntry(oldProductId,entryId,newProductId,quantity,costPrice)` | entry not yet sold (`quantity===available`) and `newProductId` product is available | validates via `isNotSoldEntry` + target-product-available check, then moves the entry between product buckets when `oldProductId !== newProductId`, updating quantity/available/costPrice |

## Capability: statistics-aggregation (MODIFIED — behavioral bug fix)

### Requirement: Daily Profit Nets Out Expenses

`StatisticsAggregationService.getDailyProfit()` MUST subtract that day's active expenses from that day's order profit, matching Angular's `OrderOfflineService.getLastMonthSaleProfits()` formula: `value = getActiveOrdersProfitBetweenDates(dayStart,dayEnd) - expenseService.getActiveExpensesPriceBetweenDates(dayStart,dayEnd)`.
(Previously: React computed `profit = sum(calculateOrderProfit(item).profit)` per day with no expense subtraction — order-profit only.)

#### Scenario: Daily profit chart matches Angular after expenses are recorded
- GIVEN a day with order profit of 1000 and active expenses totaling 300
- WHEN `getDailyProfit()` computes that day's point
- THEN the returned `profit` is `700` (1000 − 300), not `1000`

#### Scenario: Day with no expenses is unaffected
- GIVEN a day with order profit of 500 and zero active expenses
- WHEN `getDailyProfit()` computes that day's point
- THEN the returned `profit` is `500`

## Risks / Resolved Ambiguities

- **Interface-conformance ordering**: forcing `ProductOfflineService implements ProductService` now would fail `tsc` (methods like `getMaxOrder`, `getAvailableProductsByCategoryId` don't exist until Slice 2). Resolved by scoping this slice to interface EXPORT only for Product/Category; `implements` enforcement moves to Slice 2, matching the proposal's own phased breakdown.
- **`getOrdersInDay`/`getActiveOrdersInDay` date-param bug**: Angular ignores the passed `date` and always uses `new Date()`. No external contract surface (pure internal computation) → per binding angular-bugs-policy (#648), React MUST fix (honor the parameter), not replicate.
