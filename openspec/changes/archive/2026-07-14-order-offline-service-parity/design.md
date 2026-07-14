# Design: Order Offline Service Parity (Fase 6, Slice 2 of 3)

## Technical Approach

Restore full Angular parity on `OrderOfflineService` (heaviest offline service) by applying the ratified A/B/C/D return-shape framework plus the rule-3 renames/param-order and the 4 ratified behavior gates (#1083). TDD RED→GREEN per method. Renames are TypeScript compile-coupled to their call-sites, so each work unit renames a method group AND its call-sites in the same commit to keep the build green. Commits-only on `feat/frontend-parity-audit`, no PRs.

## Architecture Decisions

### Decision: hasInventoryModule internal gate — source user from module store, NO ctor re-widening
**Choice**: Drop the invented `hasInventoryModule` param. Inside `createOrderItems`, read the current user via `useAuthStore.getState().user` and call the existing pure function `hasInventoryModuleAvailable(user)` (auth/authorization-service.ts:64), mirroring Angular:360. The ctor stays `constructor(storeId: string)` — unchanged.
**Alternatives considered**: (B) Add a ctor param (`user`/authorization context) and re-widen all 13 `new OrderOfflineService(storeId)` call-sites — the literal reading of gate #1083.
**Rationale**: React's auth is a MODULE-LEVEL Zustand singleton, not constructor DI; the React authorization-service is PURE FUNCTIONS, not an injectable instance — there is nothing to "inject". The ratified `getCurrentUserLogin` (current-user.ts) ALREADY sources the current user this way and its doc explicitly states it "mirrors Angular's synchronous `currentUserValue` getter". Option A is the faithful structural mirror "as closely as React's auth setup allows" (task directive) and follows the established precedent; Option B would INVENT a ctor-DI-for-auth pattern that exists nowhere in web-store-pos and contradicts `getCurrentUserLogin`. See RISK 1 — this diverges from the gate's literal "ctor re-widening" wording; recommend confirmation before apply.

### Decision: deactivateOrder cascade-guard (gate c)
**Choice**: `deactivateOrder(id): Result` — `updateOrderActive(id,false)`; if `!succeeded` return `Result.Failure([])`; then `creditService.deactivateSaleCreditByOrderId(id)`; if `!succeeded` return `Result.Failure([])` BEFORE any restock; then return `inventoryService.increaseQuantitiesByOrderItems(order.orderItems)`. Mirror Angular:317-328 exactly (Failure short-circuits before restock).
**Rationale**: Behavior change accepted in #1083 — failed credit-deactivate now blocks restock.

### Decision: A-shape/behavior gates
**Choice**: `getActiveOrdersInDay(date)` IGNORES `date`, always `new Date()` (Angular:299-303, gate 3). Revival = `date`-only (drop createdDate/updatedDate from `reviveOrderDates`, gate 4). `getOrderById(id)` de-inlines the 3 internal `.find` duplicates. `getOrdersJson(): string` added (Angular:416-418).

## Per-method surface (new)

| Method | New signature | Shape |
|---|---|---|
| createOrder | (cartItems, type, isCredit, paymentType, details, client) → `Promise<BaseResponseModel<Order>>` | C |
| updateTodayOrder | (id, paymentType) → `DataResult<Order>` | D |
| activateOrder | (id) → `Result` | D |
| deactivateOrder | (id) → `Result` (cascade) | D |
| getCategoryCartItemsView | (date) → `BaseResponseModel<CategoryCartItemsView[]>` | B |
| getCategoryCartItemsViewObservable | (date) → `Promise<BaseResponseModel<…>>` | C |
| filterOrdersObservable | (isCredit, paymentType?, start?, end?) → `Promise<BaseResponseModel<Order[]>>` | C |
| getActiveTodayOrdersObservable | () → `Promise<BaseResponseModel<Order[]>>` | C |
| getOrderById | (id) → `Order` | A |
| getOrdersJson | () → `string` | A |
| getActiveOrdersInDay | (date) → `Order[]` (ignores date) | A |

createOrder: build via internal module gate (above); on `isCredit` call `creditService.createSaleCredit(id, client, total, '')`. C methods are `async` returning the envelope (`Promise.resolve(Success(x))`). Envelope helper: inline `Success`/`Success$`-equivalent for `BaseResponseModel` (Angular's `BaseService.Success` was eliminated — reuse the pattern other B/D ports already use).

## Data Flow — async blast radius (C-shape)

```
cart-shell.handleCreateOrder (already async)
   └─ await orderService.createOrder(...) → check res.succeeded  [DROP the module arg]
today-stats.load → getCategoryCartItemsView(...).data            [B: unwrap .data]
today-orders.handleUpdate → updateTodayOrder(...).succeeded      [D: replace try/catch]
today-orders.handleDeactivate → deactivateOrder(...).succeeded   [D]
```
`filterOrdersObservable`/`getActiveTodayOrdersObservable`/`getCategoryCartItemsViewObservable` have NO current live tsx caller (additive). See RISK 3.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `sales/lib/services/order-offline-service.ts` | Modify | All method renames/shapes/gates; internal module gate; getOrderById/getOrdersJson; drop 3 inline finds |
| `shared/components/cart-shell.tsx` | Modify | `create`→`await createOrder`, envelope check, drop `hasInventoryModuleAvailable(user)` arg + its import if unused |
| `sales/routes/today-orders.tsx` | Modify | `update`→`updateTodayOrder`/`deactivate`→`deactivateOrder`, `.succeeded` checks |
| `sales/routes/today-stats.tsx` | Modify | `getCategoryCartItemsView(...).data` |
| `sales/lib/services/__tests__/order-offline-service.test.ts` | Modify | Shapes; set `storeModuleIds:[EModules.Inventory]` where deduction expected (RISK 2) |
| `shared/components/__tests__/cart-shell.test.tsx`, `sales/routes/__tests__/*` | Modify | Async/envelope mocks |

Untouched (gate e defer): `getByDateRange`, `getLastMonthSale*`, statistics/report/inventory aggregation services.

## Work-Unit Commit Plan (compile-green boundaries)

- **WU1 — additive + internal (no external renames)**: getOrderById (de-inline), getOrdersJson, getActiveTodayOrdersObservable, getCategoryCartItemsViewObservable, getActiveOrdersInDay ignore-date, revival date-only + tests. Build green (no call-site churn).
- **WU2 — DI internalization + createOrder (C)**: drop `hasInventoryModule` param, internal `useAuthStore`+`hasInventoryModuleAvailable` gate; `create`→`createOrder` (6-param order, `Promise<BaseResponseModel>`); cart-shell await/envelope/drop-arg + service & cart-shell tests. Atomic (rename couples caller).
- **WU3 — D commands**: updateTodayOrder, activateOrder, deactivateOrder cascade-guard; today-orders `.succeeded` + tests.
- **WU4 — B + remaining C rename**: getCategoryCartItemsView (B) + today-stats `.data`; filterOrders→filterOrdersObservable (C) + tests.

Compile-coupling constraint: every rename ships with its call-site edit in the SAME commit. Forecast >400 lines total — commits-only (no chained PR, settled).

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | createOrder module gate (user WITH vs WITHOUT `EModules.Inventory`) | set `useAuthStore` user `storeModuleIds`; assert productCosts deduction on/off |
| Unit | deactivateOrder cascade | mock credit-deactivate Failure → assert Failure + NO restock; success → assert Result from restock |
| Unit | shapes | assert Promise/BaseResponseModel/Result/DataResult per method |
| Unit | ignore-date, revival date-only, getOrderById, getOrdersJson | RED first |

## Open Questions / Risks

- **RISK 1 (top)**: No ctor DI re-widening (Decision above) — diverges from gate #1083's literal "re-widens DI / every call-site supplies auth context". Confirm Option A before apply.
- **RISK 2**: makeUser defaults `storeModuleIds:[]` → internal gate returns false by default, FLIPPING the old `hasInventoryModule=true` default; deduction tests must add `EModules.Inventory`.
- **RISK 3 (semantic)**: gate-3 ignore-date — deferred report-aggregation-service:43 and inventory-today-sale-service:73 call `getActiveOrdersInDay(date)` with a possibly-historical `date`; ignore-date would silently return TODAY. Verify those callers only ever pass today; if not, escalate.
