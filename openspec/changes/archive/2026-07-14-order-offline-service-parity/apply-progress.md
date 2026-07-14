# Apply Progress: Order Offline Service Parity (Fase 6, Slice 2 of 3)

Batch 1 (WU0+WU1) + Batch 2 (WU2-WU5). ALL 6 work units now DONE — slice complete.
Strict TDD followed throughout (RED confirmed for the right reason before every GREEN
step, with one pragmatic adaptation noted in Batch 2 for the mechanical rename sweep —
see below).

## WU0 — Domain prerequisite: `OrderErrors` — DONE

- [x] T0.1 [RED] `order-errors.test.ts` asserting `OrderErrors.NotExists` (byte-exact
  Angular description, NO trailing period — confirmed by reading
  `frontend/src/app/domain/entities/orders/order.errors.ts`).
- [x] T0.2 [GREEN] `order-errors.ts` mirroring `SaleCreditErrors` pattern; exported from
  `packages/domain/src/index.ts` barrel.
- [x] T0.3 `pnpm vitest run` scoped to domain package — green (95 tests). `pnpm -C
  packages/domain build` — clean (dist gotcha handled).

**Commit**: `f23740b feat(domain): add OrderErrors mirroring order.errors.ts`

## WU1 — Additive methods + internal ignore-date/revival/legacy-backfill/sort fixes — DONE

- [x] T1.1-T1.3: `getOrderById(id): Order | undefined` implemented + 3 internal `.find`
  duplicates in `update`/`activateOrder`/`deactivate` replaced with `this.getOrderById(id)`.
- [x] T1.4-T1.5: `getOrdersJson(): string` implemented (`localStorage.getItem(key) ?? '[]'`).
- [x] T1.6-T1.7: `getActiveOrdersInDay(date)` now IGNORES `date`, always uses
  `startOfDay(new Date())`/`addDays(dayStart, 1)`; param renamed `_date` (kept for call-site
  compatibility, unused, mirrors Angular). ORD-06 test expanded (not removed) to cover both
  the today-call and the ignore-effect. Regression-checked: `report-aggregation-service.test.ts`
  + `inventory-today-sale-service.test.ts` stayed green unmodified.
- [x] T1.8-T1.9: `reviveOrderDates` renamed to `reviveAndBackfillOrder`, narrowed to revive
  ONLY `date`; `createdDate`/`updatedDate` left as raw strings. Old "STILL revives 3 fields"
  test rewritten to assert date-only revival; stale Decision-Gate doc comment above the
  `describe` block deleted (gate now resolved).
- [x] T1.10-T1.11 (folded discovery #2): legacy-data backfill — `if (!order.isCredit)
  order.isCredit = false` / `if (!order.paymentType) order.paymentType =
  PaymentType.Efectivo` added in the SAME per-order mapping pass as date revival (single
  combined pass, matching Angular's one `.map()` callback). Dedicated RED test added
  (falsy-check semantics verified: a legitimately-set order is left untouched).
- [x] T1.12-T1.13 (folded discovery #3): `.sort((a, b) => a.date.getTime() -
  b.date.getTime())` ascending added in BOTH `activeOrdersBetween` (private) and
  `filterOrders`'s filter chain, mirroring Angular's two private sorting helpers
  (`getActiveOrdersBetweenDates`/`getActiveOrders`). Dedicated RED test on `filterOrders`'s
  returned array order.
- [x] T1.14-T1.15: `getActiveTodayOrdersObservable(): Promise<BaseResponseModel<Order[]>>`
  implemented — `Promise.resolve(success(this.getActiveOrdersInDay(new Date())))`. Additive,
  no live tsx caller yet.
- [x] T1.16-T1.17: `getCategoryCartItemsViewObservable(date): Promise<BaseResponseModel<CategoryCartItemsView[]>>`
  implemented — wraps the WU1-current BARE-array return of `getCategoryCartItemsView`
  (`Promise.resolve(success(this.getCategoryCartItemsView(date)))`). **WU4 must revisit this
  wrapper** once `getCategoryCartItemsView` itself gains the B-shape envelope — at that
  point this becomes `Promise.resolve(success(this.getCategoryCartItemsView(date).data))`
  (already called out in tasks.md T1.17/T4.3 — flagging again here for the next apply batch).
- [x] T1.18 Full `pnpm test` (monorepo, all 3 packages) — green: 1632 tests, 116 test files
  in web-store-pos alone, 0 failures.
- [x] T1.19 `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean, zero errors.

**Commit**: `d36e8ba feat(sales): add getOrderById/getOrdersJson/*Observable, ignore-date +
date-only revival + legacy-data backfill + date-ascending sort on OrderOfflineService`

## Post-review parity fixes (fresh Angular-source review, applied same session) — DONE

A fresh parity review against `frontend/src/app/application/orders/order-offline.service.ts`
found two real divergences in the WU0+WU1 work. Both fixed with strict TDD (RED confirmed
for the right reason, then GREEN):

- **FIX A — `getOrdersJson()` falsy-check, not nullish-check.** Angular
  (order-offline.service.ts:416-418): `localStorage.getItem(this.getStorageKey()) || "[]"`.
  React had used `?? '[]'`, which diverges when `getItem` returns `""` (falsy but not
  nullish) — `??` would return `""` verbatim, `||` (Angular) falls back to `"[]"`. Fixed to
  `||`. RED test: seed the storage key with `""`, assert `getOrdersJson()` returns `"[]"`.
- **FIX B — `getOrdersInDay()` missing ascending sort.** Angular
  (order-offline.service.ts:305-311): filters then
  `.sort((o1, o2) => o1.date.getTime() - o2.date.getTime())`. React's port had the filter
  but NO sort. Added the same ascending `.sort()` — did NOT touch the existing
  date-honoring filter behavior (that divergence from Angular's own ignore-date bug is a
  separate, already-ratified prior decision, out of scope for this fix). RED test: seed 3
  same-day orders out of date order, assert `getOrdersInDay(date)` returns them ascending.

**Commit**: `f958ce9 fix(order-offline-service): match Angular exactly — getOrdersJson ||
fallback + getOrdersInDay ascending sort (parity)` — kept SEPARATE from the WU0 (`f23740b`)
and WU1 (`d36e8ba`) commits per delivery contract (no amends).

**Evidence**: `pnpm test` (full monorepo) — 1634 tests green (was 1632, +2 new tests), 3/3
turbo tasks successful. `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean, zero errors.

## WU2 — `createOrder` rename + param reorder + internal inventory-module gate — DONE

- [x] T2.1-T2.2 [RED]: `order-offline-service.test.ts` ORD-01/02/09/18 blocks rewritten to
  call `service.createOrder(cartItems, type, isCredit, paymentType, details, client)`
  directly in Angular's param order, `await`ing and unwrapping `.data`. Module-gate tests
  added/adjusted: default test user (`storeModuleIds: []`) now means NO deduction by
  default (flips the old `hasInventoryModule=true` default); dedicated tests added for
  user-WITH-`EModules.Inventory` (deduction fires) and no-authenticated-user-at-all
  (deduction does not fire) — both confirmed RED against the pre-WU2 signature before
  GREEN.
- [x] T2.3 [GREEN]: `create`→`createOrder` in `order-offline-service.ts`. New signature
  `(cartItems, type, isCredit, paymentType, details?, client = '')` — Angular's param
  order; `details` kept optional and `client` defaulted `''` (TS-only accommodation so the
  pre-existing `details || (isCredit ? client : '')` fallback logic — unchanged by this
  rename — still compiles positionally; every value ever supplied at these positions is
  identical to what Angular's own callers always pass). The invented `hasInventoryModule`
  param is REMOVED; the gate is now `useAuthStore.getState().user` +
  `hasInventoryModuleAvailable(user)`, mirroring Angular's injected `AuthorizationService`
  check (design's ratified Decision, RISK 1). Returns `Promise<BaseResponseModel<Order>>`
  via `Promise.resolve(success(order))` (C-shape, same-tick resolution, no `async` keyword
  — matches the established plain-Promise-return convention already used by
  `sale-credit-offline-service.ts`'s C-shape methods and this file's own WU1 additions).
- [x] T2.4 [GREEN]: `cart-shell.tsx`'s `handleCreateOrder` now `await`s `createOrder(items,
  orderType, isCredit, paymentType, undefined, clientName.trim())`, checks
  `result.succeeded` before showing the success toast (routes `!succeeded` into the
  existing `setSubmitError` flow). `hasInventoryModuleAvailable` import kept (still used
  by `handleQuantityChange`).
- [x] T2.5 [GREEN]: `cart-shell.test.tsx` mock updated: `create`→`createOrder` returning a
  resolved envelope.
- [x] T2.6: `pnpm test` (order-offline-service + cart-shell) green; `tsc --noEmit` clean.

**Commit** (combined with WU3 — see rationale below): `f6ce1c4`.

## WU3 — D-shape commands: `updateTodayOrder`/`activateOrder`/`deactivateOrder` cascade-guard — DONE

- [x] T3.1-T3.2 [RED→GREEN]: `update`→`updateTodayOrder`, returns `DataResult<Order>`
  (`new DataResult(undefined, false, [OrderErrors.NotExists])` on not-found, never throws).
- [x] T3.3-T3.4 [RED→GREEN]: `activateOrder(id): Result`, factored through a new shared
  private `updateOrderActive(id, isActive)` helper (mirrors Angular's own factoring — used
  by both `activateOrder` and the first step of `deactivateOrder`).
- [x] T3.5-T3.6 [RED→GREEN]: `deactivate`→`deactivateOrder(id): Result`. Cascade-guard
  restored exactly per Angular :317-328: `updateOrderActive` failure short-circuits to
  `Result.Failure([])`; `creditService.deactivateSaleCreditByOrderId(id)` is now called
  **UNCONDITIONALLY** (Angular has NO `if (order.isCredit)` guard — confirmed by re-reading
  :322-324 per the FLAG in tasks.md; the current React port previously gated this on
  `order.isCredit`, now removed to match Angular); its failure ALSO short-circuits to
  `Result.Failure([])` **BEFORE** any inventory restock; only on cascade success does
  `increaseQuantitiesByOrderItems` run, returning THAT call's `Result` directly (not a
  blanket `Success()`). Two new dedicated RED tests cover both cascade-guard branches
  (failure-blocks-restock, success-returns-restock-result) plus one new test confirming the
  unconditional (non-credit-order) call.
- [x] T3.7-T3.8 [GREEN]: `today-orders.tsx`'s `handleUpdate`/`handleDeactivate` now check
  `.succeeded` instead of `try/catch` (D-shape never throws — the try/catch was dead code
  once the rename landed). `sales-routes.test.tsx` mock updated:
  `deactivate`/`update`→`deactivateOrder`/`updateTodayOrder` returning `{succeeded,
  data/errors}` shape.
- [x] T3.9: `pnpm test` + `tsc --noEmit` green.

**Commit**: `f6ce1c4 feat(sales): restore createOrder/updateTodayOrder/activateOrder/deactivateOrder shapes (WU2+WU3)`
— **combined with WU2 into one commit**, deviating from the planned 4-separate-commit
boundary. Rationale: `createOrder`/`updateTodayOrder`/`activateOrder`/`deactivateOrder` are
adjacent methods on the SAME class, and the test file's setup helper
(`createTestOrder`, introduced for WU2) is immediately relied on by WU3's own test blocks
(ORD-03/04/10/12) for order setup — there is no compile-clean intermediate boundary between
"WU2 landed, WU3 not yet" that doesn't require either (a) a temporary shim/alias method (the
SDD's own playbook forbids inventing anything not in Angular), or (b) leaving WU3's
describe blocks calling the OLD `deactivate`/`update`/`activateOrder` names — which was
verified achievable and IS the actual sequencing used: the intermediate state (createOrder
renamed, update/activateOrder/deactivate untouched) was built, confirmed
`tsc --noEmit` clean + full `pnpm test` green (1639 tests) BEFORE committing, then WU3's
changes were layered on top. Both are cleanly attributable in the single commit message.

## WU4 — B-shape `getCategoryCartItemsView` + C-shape `filterOrders`→`filterOrdersObservable` — DONE

- [x] T4.1-T4.2 [RED→GREEN]: `getCategoryCartItemsView(date)` now returns
  `BaseResponseModel<CategoryCartItemsView[]>` (B-shape, sync, `success(...)` wrapping the
  existing computed array — no Promise).
- [x] T4.3 [GREEN, same commit]: `getCategoryCartItemsViewObservable` fixed to unwrap
  `.data` off the now-enveloped sync call (`success(this.getCategoryCartItemsView(date).data)`)
  instead of double-wrapping the whole envelope — the WU1-flagged follow-up, resolved here
  as planned.
- [x] T4.4-T4.5 [GREEN]: `today-stats.tsx:93` appends `.data`;
  `today-stats.test.tsx`/`sales-routes.test.tsx` mocks updated to the envelope shape.
- [x] T4.6-T4.7 [RED→GREEN]: `filterOrders`→`filterOrdersObservable`, now `Promise<BaseResponseModel<Order[]>>`
  (C-shape, async, `Promise.resolve(success(filteredArray))`). Confirmed (per tasks.md's
  own note) zero live tsx callers — test-file-only rename.
- [x] T4.8: `pnpm test` + `tsc --noEmit` green.

**Commit**: `ee0c2a3 feat(sales): restore getCategoryCartItemsView B-shape + filterOrders->filterOrdersObservable C-shape (WU4)`
— cleanly separable from WU2+WU3 (different methods, different call-site files:
`today-stats.tsx`/`.test.tsx` vs `cart-shell.tsx`/`today-orders.tsx`), split via a
build-and-verify-green intermediate step (reverted WU4-only hunks, confirmed WU2+WU3-only
state green, committed, then re-applied the byte-identical WU4 diff from a saved snapshot
and re-verified green before the second commit).

## WU5 — Final verification (whole-slice gate) — DONE (no fixup commit needed)

- [x] T5.1: Full `pnpm test` (turbo: domain + web-common + web-store-pos) — **1640 tests
  green, 116 test files, 0 failures, 0 skipped**.
- [x] T5.2: `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean, zero errors.
- [x] T5.3: `pnpm -C apps/web-store-pos build` — succeeds (client + SSR-disabled SPA build).
- [x] T5.4: Parity-table self-check against proposal.md lines 46-63 — every in-scope method
  now matches Angular name/signature/return-shape 1:1 (createOrder, updateTodayOrder,
  activateOrder, deactivateOrder, getCategoryCartItemsView(Observable),
  filterOrdersObservable, getActiveTodayOrdersObservable, getOrderById, getOrdersJson,
  getActiveOrdersInDay). Gate-e rows (`getLastMonthSaleProfits/Sales`, `getByDateRange`)
  confirmed untouched, as required.
- [x] T5.5: Grepped `apps/web-store-pos/app` for any leftover `orderService.create(`/
  `.update(orderId`/`.update(order.id`/`orderService.deactivate(`/`.filterOrders(` on an
  `OrderOfflineService` instance — **zero hits**.
- [x] T5.6: Left to `sdd-verify` (this is a pre-flight self-check only, per the task's own
  scope note).

T5.1-T5.3 were already green from the WU2+WU3/WU4 commits with no fixups needed, so per
tasks.md's own instruction this is a no-op verification note — **no separate WU5 commit**.

## Notes for next phase (sdd-verify / archive)

- WU1's `reviveAndBackfillOrder` (renamed from `reviveOrderDates`) is the single per-order
  mapping step inside `getOrdersFromLocalStorage` — do not reintroduce a second separate
  `.map()` pass.
- `createOrder`'s `details?`/`client = ''` optionality is a deliberate, narrow TS-ergonomics
  accommodation (documented above) — not a behavior divergence from Angular; every runtime
  value passed at those positions already matches what Angular's own single caller
  (`NavRightComponent.createOrder`) supplies.
- `deactivateOrder`'s unconditional `deactivateSaleCreditByOrderId` call (dropping the old
  `if (order.isCredit)` guard) is a ratified BEHAVIOR CHANGE per gate (c) — a non-credit
  order's deactivation now also invokes the credit-service call, which no-ops-successfully
  when no credit exists for that order (verified via `SaleCreditOfflineService.deactivateSaleCreditByOrderId`'s
  own contract, unchanged).
- Two commits (`f6ce1c4` for WU2+WU3, `ee0c2a3` for WU4) instead of the originally-planned
  four — see each WU's rationale above. No behavior or test coverage was dropped; the
  combination was purely a commit-boundary decision driven by genuine same-file/same-helper
  compile-coupling between WU2 and WU3.
- Strict-TDD note: the ~50-callsite mechanical rename sweep in
  `order-offline-service.test.ts` (every `service.create(...)` setup call-site across
  describe blocks NOT under test for `createOrder`'s own behavior) was done as a single
  coordinated pass rather than individual RED→GREEN cycles per call-site — RED→GREEN was
  followed strictly for every NEW/CHANGED behavior assertion (module-gate flip, cascade
  guard, D-shape not-found, B/C-shape envelopes), but the pure mechanical
  rename-plus-recompile of unchanged setup calls was not separately RED-verified per
  call-site (verifying 50 individual "old name doesn't exist" RED states would not have
  added any behavioral confidence beyond the final compile+green-suite check). Flagged here
  for `sdd-verify` transparency.

## Post-verify parity fix — `OrderItem.order` stamped from cart index instead of `product.order`

A fresh parity review against the Angular source, done after this slice's `sdd-verify`
PASS, found one CRITICAL bug in `createOrder`'s `orderItems` builder:

- Angular (`order-offline.service.ts:377`): `order: product.order` — the Product's own
  catalog display-order attribute.
- React (`order-offline-service.ts:357`, pre-fix): `order: index` — the cart array
  position from the `cartItems.map((cartItem, index) => ...)` callback.

`getCategoryCartItemsView` (`order-offline-service.ts:272`) reads this field to build the
"Cuadre del día" view, so stamping the cart index corrupted persisted order data vs
Angular whenever a product's catalog order differed from its position in the cart.

**Fix**: `order: index` -> `order: product.order` (value already available in the same
map callback via `cartItem.product`); dropped the now-unused `index` param from the map
callback signature.

**Strict TDD evidence**:
- RED: added `'stamps orderItems[].order from product.order, not the cart index'` to
  `order-offline-service.test.ts` (ORD-01 block) — two cart items whose `product.order`
  (5, 2) differs from cart position (0, 1); asserted `orderItems[i].order` equals the
  product's `order`, not the index. Failed pre-fix with `expected +0 to be 5` (received
  the cart index).
- GREEN: fix applied, same test + full file (103 tests) green.
- Full suite: `pnpm test` from `frontend-react/` — 116 test files, 1641 tests passed (was
  1640 before the new test was added).
- `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean, no errors.

**Scope**: only `order-offline-service.ts`'s `createOrder` orderItems builder and its test
file touched. The pre-existing `description: details || (isCredit ? client : '')` fallback
(deferred to Slice 3) was NOT touched.

**Commit**: `699505bd5b57d552ee6f3ebc4de97de2871f2154 fix(order-offline-service): stamp OrderItem.order from product.order not cart index (parity)`
