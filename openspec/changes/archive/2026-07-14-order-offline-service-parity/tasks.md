# Tasks: Order Offline Service Parity (Fase 6, Slice 2 of 3)

Strict TDD active. Test runner: `pnpm test` (turbo → vitest). Type check (separate,
vitest does NOT check types): `pnpm -C apps/web-store-pos exec tsc --noEmit`. Build:
`pnpm -C apps/web-store-pos build`. Delivery: commits-only on `feat/frontend-parity-audit`,
no PRs, no chained-PR strategy, no size:exception — group into work-unit commits per the
`work-unit-commits` skill even though the slice exceeds 400 lines.

Angular source of truth (read exact line numbers before implementing each method):
`frontend/src/app/application/orders/order-offline.service.ts` (471 lines).
React target: `frontend-react/apps/web-store-pos/app/sales/lib/services/order-offline-service.ts`.

Sequencing gates from the proposal (all already ratified under #1083 per design.md):
(a) rename+signature cluster, (b) return-shape flattening reversals, (c) deactivate cascade-guard,
(d) getActiveOrdersInDay ignore-date, (f) revival date-only. Gate (e) — `getLastMonthSale*` —
stays OUT OF SCOPE (coupled to aggregation-service removal); do not touch it here.

---

## WU0 — Domain prerequisite: `OrderErrors` (additive, no call-site ripple)

Blocks WU3 (D-shape commands need `OrderErrors.NotExists`).

- [x] **T0.1 [RED]** Add `frontend-react/packages/domain/src/errors/__tests__/order-errors.test.ts`
  asserting `OrderErrors.NotExists` has `code: 'Order.NotExists'` and matches Angular's exact
  description string (read `frontend/src/app/domain/entities/orders/order.errors.ts` for the
  byte-exact description literal — do NOT paraphrase).
- [x] **T0.2 [GREEN]** Add `frontend-react/packages/domain/src/errors/order-errors.ts`, mirroring
  the `SaleCreditErrors` pattern (`as const satisfies Record<string, BaseError>`). Export from the
  domain package barrel (check `frontend-react/packages/domain/src/index.ts` or errors barrel for
  the existing `SaleCreditErrors`/`ExpenseErrors` export pattern and mirror it).
- [x] **T0.3** Run `pnpm test` scoped to domain package; confirm green. No other files touched.

**Commit**: `feat(domain): add OrderErrors mirroring order.errors.ts`

---

## WU1 — Additive methods + internal ignore-date/revival/legacy-backfill/sort fixes (NO renames, NO call-site churn)

Spec requirements covered: "getOrderById Replaces Inline Duplication", "getOrdersJson Is Exposed",
"getActiveOrdersInDay Ignores Its date Parameter", "Revival On Read Is date-Only", plus the two
missing Observable methods. Also folds in two previously-flagged discoveries (scope decision:
fold into this slice, not deferred) — legacy-data backfill on read and date-ascending sort on the
two private read-path helpers — since both are read-path/internal-helper changes on the service
itself with no public-signature or call-site impact. This WU is compile-safe in isolation — no
existing public signature changes.

- [x] **T1.1 [RED]** Add tests for `getOrderById(id): Order | undefined` in
  `order-offline-service.test.ts` (new `describe('ORD-2x: getOrderById')` block): returns the
  matching order; returns `undefined` for an unknown id.
- [x] **T1.2 [GREEN]** Implement `getOrderById` (public) in `order-offline-service.ts` — single
  `.find((o) => o.id === id)` over `getStorageOrders()`. Angular ref: `order-offline.service.ts:67-69`.
- [x] **T1.3 [REFACTOR, same commit]** Replace the 3 internal inline `.find((o) => o.id === id)`
  duplicates (`update`/`activateOrder`/`deactivate` bodies, current lines ~353, ~368, ~377) with
  calls to `this.getOrderById(id)`. Re-run tests — must stay green (pure refactor, no behavior
  change yet; these 3 methods keep their current names/throw-behavior in this WU — renames happen
  in WU2/WU3).

- [x] **T1.4 [RED]** Add test for `getOrdersJson(): string` — returns the exact stored JSON string
  for the current store; returns `"[]"` when nothing is stored for that store key.
- [x] **T1.5 [GREEN]** Implement `getOrdersJson()` — `localStorage.getItem(this.getStorageKey()) ?? '[]'`.
  Angular ref: `order-offline.service.ts:416-418`.

- [x] **T1.6 [RED]** Add test: `getActiveOrdersInDay` called with a PAST date still returns only
  TODAY's active orders (assert the passed date has zero effect — construct an order dated
  yesterday that must NOT appear, and one dated today that must appear, then call with a
  yesterday `Date`).
- [x] **T1.7 [GREEN]** Change `getActiveOrdersInDay(date: Date)` body to ignore `date` and always
  use `startOfDay(new Date())` / `addDays(dayStart, 1)` (drop the `date` param from the day-bounds
  computation; keep the parameter in the signature for call-site compatibility — Angular:299-303
  also keeps the unused param). Update/remove the existing ORD-06 test
  (`getActiveOrdersInDay returns today orders`) if it now duplicates T1.6.
  **Verify no regression**: `report-aggregation-service.ts:43` and `inventory-today-sale-service.ts:73`
  call this method but ONLY ever with the default `new Date()` (confirmed — no live caller passes
  a historical date to `getTodayReport`/`getProductRows`); their existing test suites
  (`report-aggregation-service.test.ts`, `inventory-today-sale-service.test.ts`) must stay green
  unmodified as a regression check.

- [x] **T1.8 [RED]** Add test: after JSON round-trip, `date` is a `Date` instance but
  `createdDate`/`updatedDate` remain the raw (unconverted) string values.
- [x] **T1.9 [GREEN]** Narrow `reviveOrderDates` to revive ONLY `date` (drop `createdDate`/
  `updatedDate` from the revival loop). Update the existing test at
  `describe('Persistence...')` → `'STILL revives date/createdDate/updatedDate...'` (currently
  asserts 3-field revival under the old Decision Gate comment) — rename/rewrite it to assert
  date-only revival, and delete the stale "Decision Gate — pending" doc comment above the
  `describe` block (~line 447) since the gate is now resolved.
  **Angular ref**: `order-offline.service.ts:451-470` revives ONLY `order.date = new Date(order.date)`.

- [x] **T1.10 [RED]** (folded discovery #2 — legacy-data backfill, its OWN dedicated test, not
  bundled into T1.8/T1.9). Add a NEW test in
  `describe('Persistence — plain-array wire-format, cache, auto-init...')`: seed storage with a
  legacy order JSON entry that OMITS `isCredit` and `paymentType` entirely (simulating pre-existing
  data written before those fields existed), read it via a fresh service instance, and assert the
  returned order has `isCredit === false` and `paymentType === PaymentType.Efectivo` after read —
  while an order that DOES have those fields set is left untouched (do not overwrite legitimate
  falsy-but-present values beyond Angular's own `!order.isCredit`/`!order.paymentType` truthiness
  check, which is a falsy-check, not an "is undefined" check — mirror that exact semantics, not a
  stricter one).
- [x] **T1.11 [GREEN]** In `getOrdersFromLocalStorage`, after parsing but as part of the same
  per-order mapping step as `reviveOrderDates`, backfill `if (!order.isCredit) order.isCredit =
  false;` and `if (!order.paymentType) order.paymentType = PaymentType.Efectivo;` (import
  `PaymentType` — already imported in this file). **Angular ref**:
  `order-offline.service.ts:456-463` (the `.map(order => {...})` callback that revives `date` AND
  performs this exact backfill in the same pass — mirror the single combined pass, don't split it
  across two separate `.map` calls).

- [x] **T1.12 [RED]** (folded discovery #3 — date-ascending sort). Add a NEW test under the
  `ORD-17: filterOrders` describe block (still named `filterOrders` at this point in the sequence —
  WU4 renames it to `filterOrdersObservable` later and will sweep this test's name along with the
  rest of that block, per T4.6): seed 3+ active orders with out-of-insertion-order `date` values
  (e.g. insert newest first, oldest last) and assert the returned array is sorted `date` ascending
  (oldest first) — matching Angular's `getActiveOrders()`/`getActiveOrdersBetweenDates` sort
  contract. Note: `activeOrdersBetween`'s sort (used only by the Price/Profit Between-Dates sum
  methods) has NO independently observable effect via any current public method (sums are
  commutative) — this single RED test on `filterOrders`'s array is the one place sort order is
  externally visible today; the `activeOrdersBetween` fix in T1.13 is verified by code-review
  parity with Angular, not a second dedicated assertion (documented here so it isn't mistaken for
  an oversight).
- [x] **T1.13 [GREEN]** Add `.sort((a, b) => a.date.getTime() - b.date.getTime())` ascending, in
  BOTH places mirroring Angular's two private sorting helpers: (1) `activeOrdersBetween` (private,
  order-offline-service.ts — feeds `getActiveOrdersPrice/ProfitBetweenDates` and their
  Today/Yesterday callers), mirroring Angular's private `getActiveOrdersBetweenDates` (:160-165);
  (2) the filter chain inside `filterOrders` (renamed to `filterOrdersObservable` in WU4 — apply
  the sort here now, in this WU, since it's a pure internal-array change with no signature impact),
  mirroring Angular's private `getActiveOrders()` (:246-250) which Angular's own
  `filterOrdersObservable` builds on top of.

- [x] **T1.14 [RED]** Add tests for `getActiveTodayOrdersObservable(): Promise<BaseResponseModel<Order[]>>`
  — resolves `succeeded:true` with `.data` = today's active orders (reuse `success()` from
  `@store-mgmt/domain` envelope helper).
- [x] **T1.15 [GREEN]** Implement `getActiveTodayOrdersObservable()` —
  `Promise.resolve(success(this.getActiveOrdersInDay(new Date())))`. Angular ref:
  `order-offline.service.ts:286-288`. No live tsx caller yet (additive; design RISK 3 — safe, no
  regression risk since nothing currently imports it).

- [x] **T1.16 [RED]** Add tests for `getCategoryCartItemsViewObservable(date): Promise<BaseResponseModel<CategoryCartItemsView[]>>`
  — resolves `succeeded:true`, `.data` equal to the sync `getCategoryCartItemsView(date)` result
  for the same fixture (do NOT change `getCategoryCartItemsView`'s own return shape in this WU —
  that's WU4's B-shape task).
- [x] **T1.17 [GREEN]** Implement `getCategoryCartItemsViewObservable(date)` —
  `Promise.resolve(success(this.getCategoryCartItemsView(date)))` — but note WU4 changes
  `getCategoryCartItemsView`'s own return type to the B-shape envelope, so wrap accordingly once
  WU4 lands, or write this against the WU1-current bare-array return and adjust the wrapper call
  in WU4 (`.data` access) — call out this ordering explicitly in the WU4 task so the wrapper isn't
  forgotten. Angular ref: `order-offline.service.ts:71-74`.

- [x] **T1.18** Full `pnpm test` run scoped to `order-offline-service.test.ts` +
  `report-aggregation-service.test.ts` + `inventory-today-sale-service.test.ts` — green.
- [x] **T1.19** `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean (no signature changes yet,
  should be a no-op check).

**Commit**: `feat(sales): add getOrderById/getOrdersJson/*Observable, ignore-date + date-only revival + legacy-data backfill + date-ascending sort on OrderOfflineService`

---

## WU2 — `create` → `createOrder` rename, param reorder, internal inventory-module gate (gates a, b)

Compile-coupled: the rename MUST ship with its only call-site (`cart-shell.tsx`) in the same
commit. Read design.md's "Decision: hasInventoryModule internal gate" before implementing — do
NOT re-widen the constructor; do NOT add a ctor param.

- [x] **T2.1 [RED]** Update `order-offline-service.test.ts`'s `ORD-01`/`ORD-02`/`ORD-09`/`ORD-18`
  describe blocks (all currently call `service.create(...)`) to call `service.createOrder(cartItems,
  type, isCredit, paymentType, details, client)` in Angular's param order (note: order/position of
  `client`/`details`/`type` changes relative to the current `create` signature — read the current
  signature at order-offline-service.ts:263-276 and Angular's at :42 to build the exact new call
  shape) and to `await`/unwrap `.data` from the returned `Promise<BaseResponseModel<Order>>` (it
  no longer returns `Order` directly — every existing assertion on the return value must go through
  `.data`).
- [x] **T2.2 [RED]** Add module-gate tests per design's Testing Strategy: user WITH
  `storeModuleIds: [EModules.Inventory]` → deduction happens; user WITHOUT (or no user) → no
  deduction (flips the CURRENT default — today `hasInventoryModule` defaults to `true` when
  omitted; the internalized gate makes "no inventory module" the honest default via
  `useAuthStore.getState().user`, mirroring Angular's authorizationService check with no
  caller-supplied override). Update the existing "hasInventoryModule defaults to true" test
  comments (~line 247, ~626) — they no longer apply; the gate is now derived, not defaulted.
- [x] **T2.3 [GREEN]** In `order-offline-service.ts`: rename `create`→`createOrder`, reorder params
  to `(cartItems, type, isCredit, paymentType, details, client)`, remove the `hasInventoryModule`
  param entirely. Inside the order-items builder (formerly inline in `create`, mirrors Angular's
  private `createOrderItems`), replace the `hasInventoryModule` param read with
  `useAuthStore.getState().user` + `hasInventoryModuleAvailable(user)` (import both from
  `~/shared/lib/stores/auth-store` and `~/shared/lib/auth/authorization-service`). Change the
  method to `async createOrder(...): Promise<BaseResponseModel<Order>>`, returning
  `success(order)` (import `success` from `@store-mgmt/domain`) wrapped as
  `Promise.resolve(success(order))` — same-tick resolution, mirrors the C-shape pattern already
  used by `sale-credit-offline-service.ts`.
- [x] **T2.4 [GREEN]** In `cart-shell.tsx` `handleCreateOrder` (already `async`): change
  `orderService.create(items, paymentType, isCredit, clientName.trim(), orderType, user ?
  hasInventoryModuleAvailable(user) : false)` to `await orderService.createOrder(items, orderType,
  isCredit, paymentType, undefined, clientName.trim())` — reorder args to match, drop the
  `hasInventoryModuleAvailable(user)` argument entirely, check the returned envelope's
  `.succeeded` before treating the order as created (route the `catch` error path or an
  `!result.succeeded` branch into the existing `setSubmitError` flow — mirror how other
  `try/catch` blocks in this file already surface envelope failures). Keep the
  `hasInventoryModuleAvailable` import (still used at line 130 in `handleQuantityChange` — do NOT
  remove it).
- [x] **T2.5 [GREEN]** Update `cart-shell.test.tsx` mocks: `OrderOfflineService` mock's `create`
  → `createOrder` returning a resolved envelope (`Promise.resolve({ succeeded: true, data: {...},
  ... })`); update any assertion on call args (new order/position, no `hasInventoryModule` arg).
- [x] **T2.6** `pnpm test` scoped to `order-offline-service.test.ts` + `cart-shell.test.tsx` —
  green. `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean (this WU changes a public
  signature; typecheck MUST be run, not skipped).

**Commit**: `feat(sales): rename create→createOrder, restore Angular param order, internalize inventory-module gate`

---

## WU3 — D-shape commands: `updateTodayOrder`, `activateOrder`, `deactivateOrder` cascade-guard (gates a, b, c)

Depends on WU0 (`OrderErrors`) and WU1 (`getOrderById`). Compile-coupled to `today-orders.tsx`
(the only caller of `update`/`deactivate`).

- [x] **T3.1 [RED]** Update `ORD-10` (`update stamps updatedByName`) to call
  `service.updateTodayOrder(id, paymentType)` and assert `.succeeded === true` /
  `.data.paymentType === newType` (D-shape, no longer a bare `Order`, no longer throws — add a
  new case: unknown id returns `{ succeeded: false, data: undefined, errors: [OrderErrors.NotExists] }`
  instead of throwing).
- [x] **T3.2 [GREEN]** Rename `update`→`updateTodayOrder` in `order-offline-service.ts`; change
  return type to `DataResult<Order>` (import `DataResult` from `@store-mgmt/domain`, already
  imported for `Result`). Not-found path: `new DataResult(undefined, false, [OrderErrors.NotExists])`.
  Success path: mutate via `this.getOrderById(id)`, then `new DataResult(order, true, [])`. Angular
  ref: `order-offline.service.ts:342-352`.

- [x] **T3.3 [RED]** Update `ORD-12` (`activateOrder`) block: replace the "throws for a missing id"
  test with an assertion that it returns `Result.Failure([OrderErrors.NotExists])`; success path
  asserts `Result.Success()`.
- [x] **T3.4 [GREEN]** Change `activateOrder(id): void` → `activateOrder(id): Result`. Angular
  factors this through a shared private `updateOrderActive(id, isActive)` (:330-340) — mirror that
  private helper in React (used by both `activateOrder` and the flag-only half of
  `deactivateOrder`) to avoid duplicating the not-found/stamp logic, since Angular itself doesn't
  duplicate it.

- [x] **T3.5 [RED]** Update `ORD-03`/`ORD-04` (`deactivate restores inventory` /
  `deactivate voids associated credit`) to call `deactivateOrder` and assert the `Result` returned.
  Add the cascade-guard scenarios from spec: (1) `deactivateSaleCreditByOrderId` returns
  `Result.Failure` → `deactivateOrder` returns `Result.Failure` AND
  `increaseQuantitiesByOrderItems` is NOT called (mock assertion); (2) it succeeds → order marked
  inactive, `increaseQuantitiesByOrderItems` IS called, and `deactivateOrder` returns THAT call's
  `Result` (not a blanket `Success()`).
- [x] **T3.6 [GREEN]** Rename `deactivate`→`deactivateOrder`, return `Result`. Rewrite body to
  mirror Angular :317-328 exactly: call the shared `updateOrderActive(id, false)`; if
  `!result.succeeded` return `Result.Failure([])`; call
  `this.creditService.deactivateSaleCreditByOrderId(id)` UNCONDITIONALLY (Angular does NOT gate
  this on `order.isCredit` the way current React's `deactivate` does — read Angular :322-324
  again to confirm before removing the `if (order.isCredit)` guard: Angular calls it
  unconditionally, current React only calls it `if (order.isCredit)` — reconcile in favor of
  Angular exactly, since gate (c) ratifies mirroring Angular's cascade); if that fails return
  `Result.Failure([])` BEFORE restock; otherwise call
  `this.inventoryService.increaseQuantitiesByOrderItems(order.orderItems)` (keep the existing
  `productCosts.id ?? inventoryId` normalization already in React — that's an untouched, unrelated
  fix) and return its `Result` directly.
  **FLAG FOR IMPLEMENTER**: re-read `saleCreditService.deactivateSaleCreditByOrderId`'s current
  React signature/return before wiring this — confirm it still returns a `Result`-shaped value
  post `salecredit-sync-import-parity` (Fase 5, already archived) so `!result.succeeded` compiles
  and behaves as expected.

- [x] **T3.7 [GREEN]** Update `today-orders.tsx`: `handleUpdate` → call `updateTodayOrder`, replace
  `try { ...; return true } catch { return false }` with a `.succeeded` check (drop the try/catch —
  Angular's D-shape never throws, so the try/catch is now dead code, not faithful parity — mirror
  the D-shape contract, not the try/catch wrapper). Same for `handleDeactivate` →
  `deactivateOrder(order.id).succeeded`. Update the stale comment block above `handleUpdate`
  (~lines 50-54) that currently explains WHY the try/catch exists — it no longer applies.
- [x] **T3.8 [GREEN]** Update `sales-routes.test.tsx` mocks (`update`/`deactivate` → `updateTodayOrder`/
  `deactivateOrder` returning `{ succeeded, data/errors }` shape) and any assertion depending on
  the old throw-based failure signal.

- [x] **T3.9** `pnpm test` scoped to `order-offline-service.test.ts` + `today-orders` route tests +
  `sales-routes.test.tsx` — green. `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean.

**Commit**: `feat(sales): restore updateTodayOrder/activateOrder/deactivateOrder Result/DataResult shapes + cascade-guard`

---

## WU4 — B-shape `getCategoryCartItemsView` + C-shape `filterOrders`→`filterOrdersObservable` (gates a, b)

Depends on WU1 (T1.17's deferred wrapper note; also inherits WU1's T1.12 sort-ascending test on
`filterOrders`, which this WU's T4.6 rename sweeps to `filterOrdersObservable` — do not lose that
test in the rename). Compile-coupled to `today-stats.tsx`.

- [x] **T4.1 [RED]** Update `ORD-08` (`getCategoryCartItemsView`) describe block: every existing
  assertion currently reads the return value as a bare array — change to read `.data` off a
  `BaseResponseModel<CategoryCartItemsView[]>`; add one scenario asserting `succeeded: true` on the
  envelope itself.
- [x] **T4.2 [GREEN]** Change `getCategoryCartItemsView(date): CategoryCartItemsView[]` →
  `getCategoryCartItemsView(date): BaseResponseModel<CategoryCartItemsView[]>` — wrap the existing
  computed array with `success(...)` (import from `@store-mgmt/domain`), stays SYNC (B-shape, no
  Promise). Angular ref: `order-offline.service.ts:76-109` (`return this.Success(categoryItemsView)`).
- [x] **T4.3 [GREEN, same commit]** Fix `getCategoryCartItemsViewObservable` from WU1/T1.13 to
  unwrap `.data` off the now-enveloped sync call:
  `Promise.resolve(success(this.getCategoryCartItemsView(date).data))` (or restructure to avoid
  double-wrapping — the sync call already returns an envelope, so the Observable variant should
  reuse `this.getCategoryCartItemsView(date).data` as the payload, not the whole envelope).
- [x] **T4.4 [GREEN]** Update `today-stats.tsx:93` call-site:
  `orderService.getCategoryCartItemsView(new Date())` → append `.data` (
  `setCategories(orderService.getCategoryCartItemsView(new Date()).data)`).
- [x] **T4.5** Update `today-stats.test.tsx` mocks (`getCategoryCartItemsView` mock now returns an
  envelope object, not a bare array).

- [x] **T4.6 [RED]** Update `ORD-17` (`filterOrders`) describe block: rename all calls to
  `filterOrdersObservable(...)`, `await` the call, assert on `.data` (array) and `.succeeded`.
- [x] **T4.7 [GREEN]** Rename `filterOrders`→`filterOrdersObservable` in `order-offline-service.ts`;
  make it `async`, return `Promise<BaseResponseModel<Order[]>>` via
  `Promise.resolve(success(filteredArray))`. Keep the existing filter predicate logic (isCredit
  tri-state, optional paymentType/start/end) untouched — only the wrapper/name/async-ness changes.
  Confirm no other file references bare `filterOrders` (checked at task-authoring time: no live
  tsx caller — additive-style rename, no other call-site to update besides its own test file).

- [x] **T4.8** `pnpm test` scoped to `order-offline-service.test.ts` + `today-stats.test.tsx` —
  green. `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean.

**Commit**: `feat(sales): restore getCategoryCartItemsView B-shape envelope + filterOrders→filterOrdersObservable C-shape`

---

## WU5 — Final verification (whole-slice gate)

- [x] **T5.1** `pnpm test` (full monorepo turbo run: domain + web-common + web-store-pos) — all
  green, zero skipped/todo tests introduced.
- [x] **T5.2** `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean, zero errors.
- [x] **T5.3** `pnpm -C apps/web-store-pos build` — succeeds.
- [x] **T5.4** Manual per-method sweep against the proposal's parity table (lines 46-63): confirm
  every "Yes" row now matches Angular name/signature/shape 1:1; confirm gate (e) rows
  (`getLastMonthSaleProfits/Sales`, `getByDateRange`) remain untouched.
- [x] **T5.5** Grep the whole `web-store-pos` app for any leftover reference to `.create(`,
  `.update(`, `.deactivate(` on an `OrderOfflineService` instance (old names) — must return zero
  hits outside historical comments/docs.
- [x] **T5.6** Update/close out this SDD's spec cross-references if `sdd-verify` requires it (leave
  to the verify phase — this task is a pre-flight self-check only, not a substitute for
  `sdd-verify`).

**Commit**: `test(sales): verify order-offline-service-parity slice (tests/tsc/build green)` —
if T5.1-T5.3 are already green from the prior WU commits with no fixups needed, this can be a
no-op/empty verification note rather than a commit; if any fixup is needed, commit it here as
`fix(sales): close order-offline-service-parity gaps found in final verification sweep`.

---

## Discoveries surfaced during task authoring

While reading the Angular source line-by-line for WU3/WU1, three additional deviations surfaced
that were NOT covered by the spec's enumerated requirements and were NOT part of any originally
ratified gate (a-f). Per playbook rule 2/8/11 (mark-and-ask, never silently decide on shipped
code), all three were surfaced to the user before being actioned.

1. **`deactivateSaleCreditByOrderId` call is unconditional in Angular** (`order-offline.service.ts:322`,
   no `if (order.isCredit)` guard), but current React only calls it `if (order.isCredit)`
   (order-offline-service.ts:391). **Resolved** — T3.6 above resolves this IN FAVOR of Angular
   (unconditional call) since gate (c) already ratifies "mirror Angular's cascade exactly";
   flagged so the implementer/reviewer double-checks this specific line during apply, since it's a
   second, less-obvious behavior change bundled into the same gate-(c) commit.
2. **`getOrdersFromLocalStorage` default-filling for legacy data**: Angular's version
   (`order-offline.service.ts:451-470`) also backfills `order.isCredit = false` and
   `order.paymentType = PaymentType.Efectivo` when those fields are missing/falsy on read (data
   migration for pre-isCredit/paymentType legacy orders). React's current version does neither.
   **Scope decision (user-ratified): FOLD into this slice, not deferred.** Actioned as T1.10 [RED]
   / T1.11 [GREEN] in WU1 above, with its own dedicated failing test (not bundled into the
   date-revival test).
3. **Sort-order divergence in `getActiveOrdersBetweenDates`/`getActiveOrders`**: Angular's private
   helpers sort by `date` ascending before returning (`.sort((o1,o2) => o1.date.getTime() -
   o2.date.getTime())`, lines 160-165, 246-250); React's equivalents (`activeOrdersBetween`, the
   `filterOrders`/`filterOrdersObservable` filter) did not sort. **Scope decision (user-ratified):
   FOLD into this slice, not deferred.** Actioned as T1.12 [RED] / T1.13 [GREEN] in WU1 above — one
   dedicated RED test via `filterOrders`'s returned array order (the only place sort order is
   externally observable today); the `activeOrdersBetween` half of the fix ships in the same GREEN
   step for structural 1:1 parity with Angular's two private helpers, verified by code-review
   parity since it has no independently observable effect on its current sum-only callers.

---

## Review Workload Forecast (updated — post scope-fold of discoveries #2/#3)

| File | Estimated changed lines | Notes |
|---|---|---|
| `sales/lib/services/order-offline-service.ts` | ~260 | +10 vs prior estimate: legacy-backfill (2 lines) + sort in 2 places (2-3 lines) |
| `sales/lib/services/__tests__/order-offline-service.test.ts` | ~340 | +40 vs prior estimate: T1.10 dedicated legacy-backfill test (~20 lines) + T1.12 dedicated sort-order test (~20 lines) |
| `shared/components/cart-shell.tsx` + `__tests__/cart-shell.test.tsx` | ~45 | unchanged |
| `sales/routes/today-orders.tsx` + `sales/routes/__tests__/sales-routes.test.tsx` | ~35 | unchanged |
| `sales/routes/today-stats.tsx` + `__tests__/today-stats.test.tsx` | ~12 | unchanged |
| `packages/domain/src/errors/order-errors.ts` + test | ~30 | unchanged |

**New total estimate: ~720 changed lines** (prior estimate: ~650-700; +~60 lines from folding
discoveries #2 and #3 into WU1). Still exceeds the 400-line PR budget — expected and already
accepted; delivery remains commits-only on `feat/frontend-parity-audit` (no PRs, no chained-PR
decision, no size:exception needed). WU1's commit grows from 5 method-additions to 7
(add + rename-free fixes), still a single coherent commit — no new WU or commit-boundary split
required by this fold-in, since both discoveries are internal/read-path changes with zero
call-site ripple, matching WU1's existing "no external renames" boundary.
