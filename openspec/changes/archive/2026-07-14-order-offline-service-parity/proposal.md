# Proposal: Order Offline Service Parity (Fase 6, Slice 2 of 3)

## Intent

Bring React `OrderOfflineService` to full Angular parity. It is the heaviest offline
service (Angular 471 lines) and never had a dedicated parity pass — its current React
shape is incidental byproduct of other clusters' SDDs. Deviations violate playbook rules
3 (signature parity), 4/9 (return-shape), 8 (bugs), 10 (call-site parity), 12. Applies the
already-ratified A/B/C/D return-shape framework (`service-return-shape-parity`) to the Order
slice that was categorized but NEVER executed. Success = every public method's name,
signature, return shape, and behavior mirrors `order-offline.service.ts` 1:1.

## Scope

### In Scope
- Return-shape restoration per A/B/C/D (see table): B envelope, C→async, D `Result`/`DataResult`.
- Rule-3 signature/rename gaps: `create`→`createOrder`, `update`→`updateTodayOrder`,
  `deactivate`→`deactivateOrder`, `activateOrder` return; param reorder; the un-Angular
  `hasInventoryModule` param.
- `deactivate()` cascade-guard restoration (Angular :317-328 returns `Failure` when
  `saleCreditService.deactivateSaleCreditByOrderId` fails, BEFORE inventory restock).
- Missing methods: `getOrderById` (inlined 3x), `getOrdersJson`,
  `getActiveTodayOrdersObservable`, `getCategoryCartItemsViewObservable`.
- `getActiveOrdersInDay` silent date-fix reconciliation.
- Call-site ripple + test-mock updates for all signature changes.

### Out of Scope
- **Slice 1 (DONE)**: sync-import routing (`add/updateImportedOrder` — already ported).
- **Slice 3**: edit-order-details feature (`getOrderDescription`, `EditOrderDetailsModalComponent`).
- **shopping-cart / Zustand `useCartStore`** ratification (retroactive verify later).
- **`getLastMonthSaleProfits`/`getLastMonthSales`** implementation — COUPLED to the pending
  removal of React-invented aggregation services (`StatisticsAggregationService`,
  `report-aggregation-service`, `inventory-today-sale-service`). Surfaced as sequencing gate (e); NOT resolved here.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `offline-service-return-shapes`: adds the Order-slice per-method conformance (A/B/C/D) that
  `service-return-shape-parity` categorized but never applied. Delta spec, not a rewrite.

## Per-method parity table

| Angular method | Shape | React current | Gap | In scope? |
|---|---|---|---|---|
| `createOrder(cartItems,type,isCredit,paymentType,details,client)` → `Observable<BaseResponseModel<Order>>` | C | `create(cartItems,paymentType,isCredit,clientName,orderType,hasInventoryModule,details?)` → `Order` sync | rename + param reorder + invented `hasInventoryModule` + flattened sync | Yes (gate a,b) |
| `updateTodayOrder(id,paymentType)` → `DataResult<Order>` | D | `update` → `Order` (throws) | rename + envelope dropped | Yes (gate a,b) |
| `activateOrder(id)` → `Result` | D | `activateOrder` → `void` (throws) | envelope dropped | Yes (gate b) |
| `deactivateOrder(id)` → `Result` (cascade guard) | D | `deactivate` → `void` fire-and-forget | rename + envelope + guard dropped | Yes (gate a,b,c) |
| `getCategoryCartItemsView(date)` → `BaseResponseModel<...[]>` | B | bare `[]` | envelope dropped | Yes (gate b) |
| `getCategoryCartItemsViewObservable(date)` | C | MISSING | not ported | Yes |
| `filterOrdersObservable(...)` → `Observable<BaseResponseModel<Order[]>>` | C | `filterOrders(...)` → `Order[]` sync | rename + flattened | Yes (gate a,b) |
| `getActiveTodayOrdersObservable()` | C | MISSING | not ported | Yes |
| `getOrderById(id)` → `Order` | A | MISSING (inlined 3x) | no named method | Yes |
| `getOrdersJson()` → `string` | A | MISSING | not ported | Yes |
| `getActiveOrdersInDay(date)` (IGNORES date) | A | HONORS date, undisclosed | silent deviation | Yes (gate d) |
| `getLastMonthSaleProfits()/getLastMonthSales()` → `ChartData[]` | A | MISSING (in aggregation svc) | coupled to aggregation removal | No (gate e) |
| `getActiveOrdersPrice/Profit*`, `getOrdersInDay`, `getTopProducts*` | A | present | parity OK (top-param disclosed) | No |
| `addImportedOrder/updateImportedOrder` | D | DONE (Slice 1) | — | No |
| `getStorageOrders/getStorageKey/setOrders...` | A | present 1:1 | — | No |
| `getByDateRange` | — | React-invented | tied to aggregation removal (e) | No |

## DECISION GATES — require user ratification (do NOT decide)

Each touches SHIPPED, TESTED code. Rules 2/8/11.

- **(a) Rename + signature cluster.** `create→createOrder`, `update→updateTodayOrder`,
  `deactivate→deactivateOrder`; restore Angular param order; **keep or DROP the un-Angular
  `hasInventoryModule` param** (Angular derives it internally via injected
  `AuthorizationService`, not a param). Blast radius: `cart-shell.tsx:182` (create),
  `today-orders.tsx:58` (update), `today-orders.tsx:69` (deactivate) + tests
  `order-offline-service.test.ts`, `cart-shell.test.tsx`, `sales-routes.test.tsx`.
- **(b) Return-shape flattening reversals.** Which methods flip: `createOrder`/`filterOrdersObservable`
  → `Promise<BaseResponseModel<T>>` (C, async — makes `cart-shell.handleCreateOrder` async);
  `getCategoryCartItemsView` → sync `BaseResponseModel` (B); `updateTodayOrder`→`DataResult`,
  `activateOrder`/`deactivateOrder`→`Result` (D). Framework ratified, but per-method application
  to Order's shipped code needs sign-off. Blast: today-stats.tsx:93, today-orders.tsx:58/69,
  cart-shell.tsx:182 + tests (envelope-unwrap / await).
- **(c) `deactivate()` cascade-guard restoration.** BEHAVIOR CHANGE: orders whose
  `deactivateSaleCreditByOrderId` fails would now BLOCK (no inventory restock, `Failure`
  returned) instead of proceeding fire-and-forget. Self-documented "flagged mismatch #6"
  (order-offline-service.ts:386-390). Blast: `today-orders.tsx:69`.
- **(d) `getActiveOrdersInDay` silent date-fix.** Angular IGNORES `date` (always `new Date()`);
  React HONORS it with NO disclosure. Mirror Angular's ignore-date, or keep React's honor +
  disclose (like sibling `getOrdersInDay`)? Blast: today-stats.tsx:95, today-orders.tsx:38,
  today-quantities.tsx:80, today-sales-profit.tsx:103.
- **(e) `getLastMonthSaleProfits/Sales` aggregation-coupling SEQUENCING.** These belong on
  `OrderOfflineService` (Angular) but React's logic lives in invented aggregation services
  flagged for removal by `service-return-shape-parity` (not yet executed). Do NOT duplicate
  or resolve that separate work here — ratify the sequencing.
- **(f) Revival-fields.** React `reviveOrderDates` revives `date`/`createdDate`/`updatedDate`
  (3 fields); Angular revives ONLY `date`. Same pattern as Inventory's prior Decision Gate.
  Fix to date-only or keep 3-field?

## Approach

Strict TDD, RED→GREEN per method, dependency-order (Order calls SaleCredit+ProductCategory+
Inventory, all already at target shape). Apply A/B/C/D restoration + renames after gates ratified.
C→async re-sequences `cart-shell.handleCreateOrder` to `await`. Missing methods ported 1:1;
`getOrderById` replaces the 3 inline `.find` duplicates.

## Affected Areas

| Area | Impact |
|---|---|
| `sales/lib/services/order-offline-service.ts` | Modified (renames, envelopes, guard, methods) |
| `shared/components/cart-shell.tsx` | Modified (async create, envelope) |
| `sales/routes/today-orders.tsx`, `today-stats.tsx` | Modified (rename, envelope, guard) |
| `sales/routes/orders.tsx`, `edit-order-modal.tsx`, `order-item-list.tsx` | Modified (getOrderById) |
| `inventory/routes/today-quantities.tsx`, `today-sales-profit.tsx` | Modified (getActiveOrdersInDay) |
| `**/__tests__/*` (order/cart-shell/today-stats/sales-routes) | Modified (mocks, envelope, await) |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| C→async ripple breaks sync callers | High | Strict dep-order; convert callers same slice; green tests |
| Cascade-guard changes shipped behavior | Med | Gate (c) ratified before apply |
| High fan-out exceeds 400-line budget | High | Work-unit commits per method group (delivery = commits-only) |
| Dropping/keeping `hasInventoryModule` wrong | Med | Gate (a) ratified before apply |

## Rollback Plan

Commits-only on `feat/frontend-parity-audit`. Each method-group is an independent work-unit
commit; revert the offending commit — earlier commits leave a consistent boundary.

## Dependencies

- Exploration `sdd/fase6-orders-cart/explore`; framework `service-return-shape-parity` (proposal/spec).
- Slice 1 `order-sync-import-parity` (DONE). Coordinates with pending aggregation-service removal (gate e).
- Playbook rules 2,3,8,10,11,12. Strict TDD active.

## Delivery Note (for sdd-tasks)

Commits-only, NO chained PRs (settled). High fan-out likely >400 lines — plan work-unit
commits per method group; forecast the budget but do NOT propose PR splits.

## Success Criteria

- [ ] All 6 gates surfaced to user and ratified/rejected BEFORE spec/design.
- [ ] Every in-scope method matches Angular name/signature/return-shape/behavior 1:1.
- [ ] `deactivateOrder` cascade-guard restored per ratified decision.
- [ ] `getOrderById` replaces all 3 inline duplicates; `getOrdersJson` + 2 `*Observable` ported.
- [ ] All call-sites + tests updated; typecheck + build + tests green (RED→GREEN per method).
