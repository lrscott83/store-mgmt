# Delta for Order Service

## ADDED Requirements

### Requirement: OrderItem.productCosts Uses inventoryId Field
Angular's `InventoryEntryCost` (order item cost line, `order.model.ts`) names its reference field
`inventoryId`, not `id`. React's `OrderItem.productCosts[]` entries MUST use `inventoryId` as the
field name, reverting the current `id` rename. All producers (`createOrder`'s inventory-deduction
path, `getAvailableInventoryCosts`) and consumers (order detail views, reports reading
`productCosts`) MUST use `inventoryId`.

#### Scenario: Field is named inventoryId
- GIVEN an order created with inventory-cost deduction
- WHEN its `productCosts[]` entries are inspected
- THEN each entry has an `inventoryId` field (not `id`) referencing the deducted inventory entry

### Requirement: updateOrders Is Exposed
`OrderOfflineService` MUST expose `updateOrders(orders: Order[]): void`, mirroring Angular's bulk
replace-and-persist operation: it MUST overwrite the current store's in-memory + storage order list
wholesale with the given array, matching Angular's write-through semantics (no partial merge, no
per-item validation).

#### Scenario: Bulk replace persists verbatim
- GIVEN a caller has an authoritative `Order[]` (e.g. from a sync/import path)
- WHEN `updateOrders(orders)` is called
- THEN the stored orders for the current store equal exactly the given array, and a subsequent
  `getOrdersJson()` reflects it

### Requirement: getSaleCreditsJson Is Exposed
`SaleCreditOfflineService` MUST expose `getSaleCreditsJson(): string`, returning the raw current-store
sale-credits JSON from storage, or `"[]"` when nothing is stored — mirroring the existing
`getOrdersJson`/`getExpensesJson` pattern.

#### Scenario: Raw JSON export
- GIVEN sale credits exist in storage for the current store
- WHEN `getSaleCreditsJson()` is called
- THEN it returns the exact JSON string from storage, or `"[]"` when nothing is stored

### Requirement: Internal Date-Range Helpers Are Private
Angular declares `getActiveOrdersPriceBetweenDates` (`order-offline.service.ts:167`) and
`getActiveSaleCreditsPriceBetweenDates` (`sale-credit-offline.service.ts:201`) as `private` — each is
an internal helper consumed only by its own class's today/yesterday total methods. React's
`OrderOfflineService.getActiveOrdersPriceBetweenDates` and
`SaleCreditOfflineService.getActiveSaleCreditsPriceBetweenDates` are currently `public` and MUST be
restored to `private`, PROVIDED a fresh grep at apply time confirms no production module imports them
directly (if a live cross-module caller is found, this item is downgraded to a fork and MUST NOT be
silently applied).

#### Scenario: Compiler rejects external access
- GIVEN a hypothetical caller outside `OrderOfflineService` (or `SaleCreditOfflineService`)
- WHEN it attempts `orderService.getActiveOrdersPriceBetweenDates(a, b)` (or the sale-credit
  equivalent)
- THEN `tsc` MUST reject the access — the member is private

#### Scenario: Internal today/yesterday callers are unaffected
- GIVEN `getActiveOrdersPriceToday`/`getActiveOrdersPriceYesterday` (and the sale-credit equivalents)
- WHEN the visibility change lands
- THEN their behavior and return values are unchanged — they call the now-private helper internally
