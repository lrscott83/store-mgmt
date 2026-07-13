# Tasks: Order Sync-Import Parity (narrow 4-field merge) — Fase 6 Slice 1

Change: `order-sync-import-parity`. Delivery: commits-only on
`feat/frontend-parity-audit`, NO chained PR, NO size:exception (settled — see Review
Workload Forecast). Test runner: `npx turbo run test`. Strict TDD: every production
edit is preceded by a failing (RED) test/compile step in the SAME or immediately
prior task. MANDATORY gates after the last task: `npx turbo run typecheck` (catches
ripple vitest misses, per ADR-7) + `npx turbo run build`.

Spec: `openspec/changes/order-sync-import-parity/specs/sync/spec.md` (engram
`sdd/order-sync-import-parity/spec`, obs #1074).
Design: `openspec/changes/order-sync-import-parity/design.md` (engram
`sdd/order-sync-import-parity/design`, obs #1075).
State: engram `sdd/fase6-orders-cart/state` (obs #1072) — this is Slice 1 of 3.

Files touched:
- `frontend-react/apps/web-store-pos/app/sales/lib/services/order-offline-service.ts` (PORT)
- `frontend-react/apps/web-store-pos/app/sales/lib/services/__tests__/order-offline-service.test.ts` (new ORD-19 block)
- `frontend-react/apps/web-store-pos/app/sync/lib/services/data-synchronizer-service.ts`
- `frontend-react/apps/web-store-pos/app/sync/lib/services/__tests__/data-synchronizer-service.test.ts` (~44 order refs)
- `frontend-react/apps/web-store-pos/app/sync/routes/import.tsx`
- `frontend-react/apps/web-store-pos/app/sync/routes/__tests__/import-no-write.test.ts` (2 `GenericUpsertRepo<Order>` call sites, T1.5 block)
- `frontend-react/apps/web-store-pos/app/sync/lib/storage/sync-repo-shims.ts` — **DELETE ENTIRE FILE**
- `frontend-react/apps/web-store-pos/app/sync/lib/storage/__tests__/sync-repo-shims.test.ts` — **DELETE ENTIRE FILE** (Orders was its last subject; once `sync-repo-shims.ts` is gone this file has nothing left to test — same class of discovered ripple as the SaleCredit slice's `import-no-write.test.ts` T1.5 surprise, but confirmed here in advance via grep rather than discovered mid-apply)

Ordering note (compile-safety, unlike the SaleCredit precedent): `GenericUpsertRepo<T>`
and `mergeBreakOnly<T>` in `data-synchronizer-service.ts` are declarations still
consumed by `sync-repo-shims.ts` even after Orders stops calling `mergeBreakOnly` in
WU2. Do NOT delete the interface/method until WU3.3, once `sync-repo-shims.ts` (and
its test) are deleted and `import-no-write.test.ts` no longer references
`GenericUpsertRepo`. Deleting them earlier breaks the shim file's compile mid-task.

---

## Work Unit 1 — Port `addImportedOrder`/`updateImportedOrder` into `OrderOfflineService` (RED-first)

Sequential. `OrderOfflineService` is MISSING both methods (unlike SaleCredit, which
had them pre-ported) — this WU exists only because of that gap (design §1, ADR-2).
Satisfies spec requirement "Order Sync-Import Routes Through Offline Service With
Narrow 4-Field Merge" (obs #1074) at the offline-service layer, standalone of the
synchronizer.

### [x] 1.1 [RED] `order-offline-service.test.ts`: new `ORD-19` describe block for the two not-yet-existing methods

- Add `describe('ORD-19: addImportedOrder/updateImportedOrder (sync-import narrow merge, order-sync-import-parity)', ...)` after the existing `ORD-18` block.
- **addImportedOrder**: import an order whose `id` is absent from storage; assert it
  is appended (`getStorageOrders()` contains it) and its `date` is revived to a
  `Date` instance (pass a serialized string date, assert `instanceof Date` after).
- **updateImportedOrder — narrow merge preserves protected fields**: seed storage
  with an order (`total: 500`, `orderItems: [...]`, `isCredit: true`,
  `paymentType: cash`); import the same `id` with different `date`/`isActive`/
  `updatedDate`/`updatedByName` AND different `total`/`orderItems`/`isCredit`/
  `paymentType`. Assert the stored record after the call: `date`/`isActive`/
  `updatedDate`/`updatedByName` take the imported values, `total`/`orderItems`/
  `isCredit`/`paymentType`/`description` are UNCHANGED from the original seed.
- **updateImportedOrder — no-op when id absent**: import an order whose `id` does
  not exist in storage; assert storage is unchanged (no throw, no insert — mirrors
  Angular's no-op-on-absent).
- Both methods are not yet defined on `OrderOfflineService` → compile RED (TS error:
  property does not exist).

**Spec link**: obs #1074, scenarios "New order is added via the service" and "Update
to an existing order narrow-merges only 4 fields" (offline-service layer).
**Parallel/Sequential**: sequential — must land before 1.2.

### [x] 1.2 [GREEN] `order-offline-service.ts`: port `addImportedOrder`/`updateImportedOrder`

- Add `Result` to the value import from `@store-mgmt/domain` (currently line 2:
  `import { OrderType, PaymentType } from '@store-mgmt/domain';` → add `Result`).
- Add the two methods per design §3.1 (1:1 port of Angular
  `order-offline.service.ts:430-449`):
  - `addImportedOrder(order: Order): Result` — spread-copy, revive `date` to `new
    Date(order.date)`, `this.getStorageOrders().push(imported)`,
    `this.setOrdersLocalStorage(this.orders!)`, return `Result.Success()`.
  - `updateImportedOrder(importedOrder: Order): Result` — find existing by id;
    if found, overwrite ONLY `date` (revived)/`isActive`/`updatedDate`/
    `updatedByName`, then `setOrdersLocalStorage`; no-op if absent; always return
    `Result.Success()`.
- Run tests: 1.1's 3 new assertions turn GREEN; full `order-offline-service.test.ts`
  suite (ORD-01 through ORD-18) stays green — no other method touched.

**Spec link**: obs #1074, same 2 scenarios — closes them at the offline-service
layer (synchronizer-layer closure is WU2).
**Parallel/Sequential**: sequential — closes WU1; depends on 1.1 being RED first.

---

## Work Unit 2 — Synchronizer seam + `mergeOrdersViaService` (RED-first)

Sequential (same file coupling as the SaleCredit precedent: 2.1 must land before
2.2, both before 2.3's production swap).

### [x] 2.1 [RED] Flip `data-synchronizer-service.test.ts` test infra to the not-yet-existing `OrderImportService`

- Import `OrderImportService` as a type from
  `~/sync/lib/services/data-synchronizer-service` (does not exist yet → compile RED).
- Add `makeOrderImportServiceMock(initial)` mirroring `makeSaleCreditImportServiceMock`
  (design §6.1), BUT its `updateImportedOrder` MUST replicate the real narrow merge
  — overwrite ONLY `date`/`isActive`/`updatedDate`/`updatedByName`, keep
  `total`/`orderItems`/`isCredit`/`paymentType` from the existing seeded record. If
  this mock does the SaleCredit-style full-overwrite instead, task 2.2's narrow-merge
  assertion (#1 below) is vacuous — do not let that happen.
- `makeService()` (currently :311-324): replace
  `orderRepo = makeGenericRepo<Order>(...)` with
  `orderService = makeOrderImportServiceMock(...)`; update the ctor call (param 5)
  and the returned handle name; update destructuring call-sites (`:767`, `:823`,
  `:1004`, `:1033`).
- Ordering test (currently :384-416): replace the inline
  `orderRepo: GenericUpsertRepo<Order>` object with an `OrderImportService` literal
  whose `addImportedOrder` pushes `'order:' + item.id` (write-order assertion
  unchanged).
- `OrdersUnexpectedError`-triggering tests (currently :767-794 break-only, :823-842
  all-entities): replace `orderRepo.upsert = () => { throw ... }` with
  `orderService.addImportedOrder`/`updateImportedOrder` throwing, obtained from the
  new mock handle.
- Single-add test (currently :555-577): replace
  `orderRepo.getAll(REAL_STORE_ID).has('order-1')` assertion with a check against the
  mock's seeded/returned array (mirrors how the SaleCredit precedent asserted via its
  service mock, not a `Map`).
- All raw-ctor positional-arg call sites still passing `makeGenericRepo<Order>()` as
  param 5 (currently :468, :513, :608, :1085, :1132, :1175, :1219, :1252, :1277): swap
  to `makeOrderImportServiceMock()`.
- Remove the now-unused `makeGenericRepo<T>` helper (currently :181-199) — grep-confirm
  no remaining `<T>` caller other than `<Order>` before deleting — and the
  `GenericUpsertRepo` type import (currently :6) from this test file ONLY (the type
  itself still lives in production until WU3.3).
- Run tests: expect compile failure / RED (type doesn't exist yet, mock shape
  mismatches ctor param 5 which is still `GenericUpsertRepo<Order>`).

**Spec link**: obs #1074, all 4 scenarios under "Order Sync-Import Routes Through
Offline Service With Narrow 4-Field Merge" (infra prerequisite).
**Parallel/Sequential**: sequential — must land before 2.2.

### [x] 2.2 [RED] Add 4 new assertions (new describe block, e.g. "T10 — order import routes through the offline service (Angular parity) + narrow 4-field merge")

New tests, still RED (production untouched):
1. **narrow merge preserves protected fields**: existing local order (`total`,
   `orderItems`, `isCredit`, `paymentType` set); import same id with DIFFERENT
   `total`/`orderItems` + new `isActive`/`updatedDate`/`updatedByName`. Assert final
   record keeps original `total`/`orderItems`/`isCredit`/`paymentType`, takes
   imported `date`/`isActive`/`updatedDate`/`updatedByName`. Merge count
   `{updated: 1}`.
2. **new order adds**: import an order whose id is absent from storage. Assert
   `addImportedOrder` was called (not update); merge count `{inserted: 1}`.
3. **routes through service, not shim (partial — full closure is WU3)**: assert the
   synchronizer's ctor param 5 type is `OrderImportService`, and that
   `mergeOrdersViaService` (not `mergeBreakOnly`) is what step 4 calls. The full
   "shim file no longer exists" assertion belongs to WU3 (the file still exists
   until 3.3).
4. **`OrdersUnexpectedError` on failure via the service** (confirm code
   `Synchronizer.OrdersUnexpectedError` asserted against the new mock's throw,
   break-only — orders already written before the throw remain persisted).

**Spec link**: obs #1074, scenarios "New order is added via the service", "Update to
an existing order narrow-merges only 4 fields", "Order merge routes through the
service, not the shim" (partial), "Unexpected failure surfaces the orders error
code, break-only".
**Parallel/Sequential**: sequential — depends on 2.1's mock; still RED until 2.3.

### [x] 2.3 [GREEN] Production: add `OrderImportService` seam + `mergeOrdersViaService` + ctor/wiring swap in `data-synchronizer-service.ts`

- Add `Order` to the top-level `import type` (line 2, alongside `Expense`,
  `InventoryEntry`, `Product`, `ProductCategory`, `SaleCredit`) — currently inline
  as `import('@store-mgmt/domain').Order` in the ctor param type.
- Add exported `OrderImportService` interface (3 methods: `getStorageOrders():
  Order[]`, `addImportedOrder(order): Result`, `updateImportedOrder(order): Result`)
  next to `SaleCreditImportService`, per design §3.2.
- Add private `mergeOrdersViaService(incoming: Order[]): MergeOutcome` — 1:1
  structural mirror of `mergeSaleCreditsViaService` (design §3.3): seed map from
  `getStorageOrders()`, add-vs-update by id, early-return on `!result.succeeded`,
  break-only (no revert), catch → `SynchronizerErrors.OrdersUnexpectedError`.
- Swap ctor param 5 (currently line 196):
  `orderRepo: GenericUpsertRepo<import('@store-mgmt/domain').Order>` →
  `orderService: OrderImportService`.
- Swap `sync()` step 4 (currently lines 220-227): replace
  `this.mergeBreakOnly('orders', this.orderRepo, data.orders,
  SynchronizerErrors.OrdersUnexpectedError)` with
  `this.mergeOrdersViaService(data.orders)`.
- **Do NOT remove `GenericUpsertRepo<T>` (currently :106-109) or `mergeBreakOnly<T>`
  (currently :345-373) yet** — `sync-repo-shims.ts` still imports/uses
  `GenericUpsertRepo`, and it is not deleted until WU3.3. Leaving them as
  now-orphaned-for-Orders-but-still-declared is intentional (see the Ordering note
  above the Work Units).
- Run tests: 2.1 + 2.2 assertions turn GREEN. Confirm existing untouched tests (T2
  category/product revert, T3 break-only for non-order entities, T4 merge-count, T5
  empty-data, T7 expense service routing, T8 inventory service routing, T9
  sale-credit service routing) stay green.

**Spec link**: obs #1074, full "Order Sync-Import..." requirement + all 4 scenarios;
also partially satisfies the MODIFIED "Sync Import Routes Through Domain
Repositories" scenario (full closure needs WU3).
**Parallel/Sequential**: sequential — closes WU2; depends on 2.1/2.2 being RED first.

---

## Work Unit 3 — Route wiring + full shim retirement + gates

Sequential. Per design §7 ADR-5, Orders is the LAST consumer of
`sync-repo-shims.ts`/`GenericUpsertRepo`/`mergeBreakOnly` (grep-confirmed) — this WU
completes the route-all-through-services migration by deleting all three.

### [x] 3.1 [RED→GREEN] `import.tsx`: reuse `orderSvc`, drop the shim

- Delete line `const orderRepo = makeOrderRepoShim();` (currently line 75).
- In the `DataSynchronizerService` ctor call (currently lines 83-91), replace the
  `orderRepo` argument (param 5) with the existing `orderSvc` instance (already
  constructed at line 45 for the serializer's read side — mirrors
  `expenseSvc`/`creditSvc`, no second instance, per design ADR-4).
- Remove `makeOrderRepoShim` from the
  `import { makeOrderRepoShim } from '~/sync/lib/storage/sync-repo-shims'` line
  (currently line 10) — this is the LAST shim import in the file, so delete the
  whole import statement, not just the named import.
- Update the routing comment block (currently lines 76-81) to include Orders
  alongside Inventory/Expenses/SaleCredits (per design §3.6).
- No dedicated unit test exists for `import.tsx`'s `handleImport` wiring;
  correctness is proven by 2.3's synchronizer tests (mock-level) plus 3.3's
  post-deletion full-suite green run. Verify via `npx turbo run typecheck` since
  this file has no direct spec covering the wiring line itself.

**Spec link**: obs #1074, "Sync-Local Storage Shim Replaces Shared Base Repository"
— scenario "Order merge routes through the service, not the shim" (transitively,
now that the shim import is gone from the sole call-site).
**Parallel/Sequential**: sequential — must land in the same commit/push as 3.2/3.3
to keep the tree compiling (matches the SaleCredit precedent's WU2 note).

### [x] 3.2 [RED→GREEN] `import-no-write.test.ts`: flip the 2 `GenericUpsertRepo<Order>` call sites

- Remove the `makeNoopGenericRepo<T>` helper (currently lines 116-118) — grep-confirm
  it is only ever called with `<Order>` in this file before deleting.
- Add a `makeNoopOrderService(): OrderImportService` helper (mirrors
  `makeNoopSaleCreditService`/`makeNoopExpenseService` already in this file,
  currently lines 108-114/120-126 pattern): `getStorageOrders: () => []`,
  `addImportedOrder: () => Result.Success()`, `updateImportedOrder: () =>
  Result.Success()`.
- Replace both `makeNoopGenericRepo<Order>()` call sites (currently lines 143, 198,
  ctor param 5) with `makeNoopOrderService()`.
- Update the type import (currently lines 18-23): drop `GenericUpsertRepo`, add
  `OrderImportService`.
- Drop `Order` from the `import type { Order, ProductCategory } from
  '@store-mgmt/domain'` (currently line 16) — grep-confirm it is unused elsewhere in
  the file once the generic calls are gone (keep `ProductCategory`, still used by
  `makeCategory`).
- Run tests: both T1.5 tests stay green (they assert product/category behavior;
  the order mock is an unrelated no-op dependency for the ctor).

**Spec link**: obs #1074, "Sync-Local Storage Shim Replaces Shared Base Repository"
(compile-cleanliness prerequisite for 3.3 — this file must stop referencing
`GenericUpsertRepo` before the type can be deleted).
**Parallel/Sequential**: sequential — must precede 3.3 (the type is still imported
here until this task lands).

### [x] 3.3 [GREEN] Delete `sync-repo-shims.ts` + `sync-repo-shims.test.ts` entirely; remove `mergeBreakOnly`/`GenericUpsertRepo` from `data-synchronizer-service.ts`

- **Delete** `frontend-react/apps/web-store-pos/app/sync/lib/storage/sync-repo-shims.ts`
  in full (74 lines: `makeGenericUpsertRepoShim`, `makeOrderRepoShim`,
  `reviveDates`, `storageKey`). Grep-confirm no remaining importer anywhere in the
  repo after 3.1 lands (`import.tsx` was the last one).
- **Delete** `frontend-react/apps/web-store-pos/app/sync/lib/storage/__tests__/sync-repo-shims.test.ts`
  in full (164 lines) — its entire subject (`makeOrderRepoShim`) no longer exists;
  nothing in this file survives the deletion (the one integration test at the
  bottom, "an order import merge leaves ... readable by OrderOfflineService", is
  now fully superseded by WU2's synchronizer-level narrow-merge coverage — no
  assertion needs to be salvaged/moved).
- In `data-synchronizer-service.ts`: remove `GenericUpsertRepo<T extends { id:
  string }>` (currently :106-109) and its doc-comment, and `mergeBreakOnly<T>`
  (currently :345-373) — grep-confirm zero remaining callers (Expenses/SaleCredits/
  Categories/Products already route through their own `mergeXViaService` methods;
  Orders was the last `mergeBreakOnly` caller, removed in 2.3).
- Run `npx turbo run test`: full suite green, including the flipped/removed order
  assertions across all 3 files.

**Spec link**: obs #1074, "Sync-Local Storage Shim Replaces Shared Base Repository"
scenario "sync-repo-shims.ts no longer exists" (closes it — `makeOrderRepoShim`,
`makeGenericUpsertRepoShim`, `mergeBreakOnly`, `GenericUpsertRepo<T>` MUST NOT exist
anywhere in the sync module); also fully closes "Order merge routes through the
service, not the shim" (WU2's partial assertion is now total — the shim file is
gone, not just unused).
**Parallel/Sequential**: sequential — depends on 3.1 AND 3.2 landing first (both
must stop referencing the shim/type before deletion is safe).

### [x] 3.4 ADR-7 residual check: confirm `storeId` ctor param doesn't trip lint/build after `mergeBreakOnly` removal

- Per design ADR-7, `this.storeId` becomes unused inside
  `DataSynchronizerService` once `mergeBreakOnly` (its only internal consumer via
  `repo.getAll(this.storeId)`/`repo.upsert(this.storeId, item)`) is deleted in 3.3.
  Design's default choice is to KEEP param 1 as-is (TS `noUnusedLocals`/eslint
  typically do not flag unused constructor parameter-properties).
- Run `npx turbo run typecheck` AND `npx turbo run build` AND the project lint
  script. If either flags an unused parameter/property error:
  - First fallback: prefix `_storeId` (keeps the positional slot, satisfies
    `noUnusedParameters`-style lint without rippling every positional-ctor call
    site's arg count).
  - Only if that still fails some other rule: drop param 1 entirely — this ripples
    every positional `new DataSynchronizerService(...)` call site in both test
    files and `import.tsx`; treat as a distinct sub-task if triggered (re-numbering
    all subsequent ctor args by one).
- If nothing is flagged (the expected outcome per ADR-7), no code change — just
  record the confirmation in the commit message / apply-progress notes.

**Spec link**: obs #1074/#1075 ADR-7 (residual ambiguity, not a spec scenario) —
housekeeping gate, not new behavior.
**Parallel/Sequential**: sequential — must run after 3.3 (the only place `storeId`
usage changes) and before the final gate run in 3.5.

### [x] 3.5 Final gates: full suite + typecheck + build

- `npx turbo run test` — full suite green (all files touched + untouched sync/order
  suites).
- `npx turbo run typecheck` — MANDATORY per this change's brief (catches ripple
  vitest misses the test runner alone would not, per the SaleCredit precedent's
  `import-no-write.test.ts` T1.5 discovery).
- `npx turbo run build` — production build succeeds with the deleted files gone and
  no dangling imports.
- Confirm working tree is otherwise clean (only the pre-existing untracked
  `openspec/changes/order-sync-import-parity/` docs remain, per convention).

**Spec link**: obs #1074, full requirement closure — this task is the final proof
gate, not a new scenario.
**Parallel/Sequential**: sequential — last task, closes the change.

---

## Task Dependency Summary

```
1.1 (RED, OrderOfflineService test) ──► 1.2 (GREEN, port both methods)
                                              │
                                              ▼
2.1 (RED, synchronizer test infra) ──► 2.2 (RED, new narrow-merge assertions) ──► 2.3 (GREEN, production seam)
                                                                                       │
                                                                                       ▼
                                            3.1 (import.tsx wiring, same-commit dependency)
                                                                                       │
                                                                                       ▼
                                            3.2 (RED→GREEN, import-no-write.test.ts flip)
                                                                                       │
                                                                                       ▼
                                  3.3 (GREEN, delete sync-repo-shims.ts + .test.ts + remove mergeBreakOnly/GenericUpsertRepo)
                                                                                       │
                                                                                       ▼
                                            3.4 (ADR-7 storeId residual check)
                                                                                       │
                                                                                       ▼
                                            3.5 (final gates: test + typecheck + build)
```

All tasks are sequential — no safe parallelization (ctor-signature coupling spans
WU2→WU3, and WU3's deletions depend on WU3.1/3.2 first removing every other
reference to the shim/type). WU1 is the only unit that could theoretically run in
parallel with nothing else (it only touches `OrderOfflineService` in isolation), but
since WU2/2.3 depends on the ported methods existing, there is no practical
parallelization benefit — keep it first, sequential, as listed.

## Commit Plan (commits-only, `feat/frontend-parity-audit`)

Per design §8 and the ctor-signature coupling (param 5 changes in 2.3, consumed in
3.1, cleaned up in 3.3), the DEFAULT recommendation is **one single commit** covering
1.1 through 3.5 — same rationale as the shipped SaleCredit slice. Splitting mid-way
(e.g., after WU2) would leave `import.tsx` failing typecheck against the new ctor
param-5 type until WU3 lands; per the `delivery-commits-only-on-feature-branch`
convention there is no PR-based checkpoint to make a split meaningful.

## Review Workload Forecast

- **Estimated changed lines**: ~19 prod lines added (`order-offline-service.ts` port)
  + ~44 prod lines net in `data-synchronizer-service.ts` (interface + merge method +
  ctor/wiring swap, offset by removing `GenericUpsertRepo`/`mergeBreakOnly` in 3.3)
  + ~44 test refs flipped/added in `data-synchronizer-service.test.ts` + new ORD-19
  block (~50-70 lines) in `order-offline-service.test.ts` + `import-no-write.test.ts`
  flip (~15 lines) + `import.tsx` wiring (~5 lines) + **full deletion of
  `sync-repo-shims.ts` (74 lines) and `sync-repo-shims.test.ts` (164 lines)**.
  Total diff (additions + deletions) is estimated at **~450-550 lines** across 8
  files — this EXCEEDS the usual 400-line soft budget once the two whole-file
  deletions are counted, unlike the SaleCredit precedent (which kept its shim file
  alive and stayed at ~150-220 lines).
- **File count**: 8 (`order-offline-service.ts`, `order-offline-service.test.ts`,
  `data-synchronizer-service.ts`, `data-synchronizer-service.test.ts`, `import.tsx`,
  `import-no-write.test.ts`, `sync-repo-shims.ts` [deleted],
  `sync-repo-shims.test.ts` [deleted]).
- **400-line budget risk**: **High** by raw line count, but this is driven almost
  entirely by deleting two files outright (net-negative, low-risk diff — a reviewer
  reads "file removed" once, not line-by-line) rather than by new logic surface. The
  net NEW/CHANGED-behavior surface (the narrow-merge port + seam + ~44 mechanical
  test-mock swaps) is comparable in kind to the SaleCredit precedent.
- **Chained PRs recommended**: No — delivery is commits-only on
  `feat/frontend-parity-audit` (settled per `delivery-commits-only-on-feature-branch`
  convention; no PRs at all, chained or otherwise).
- **size:exception needed**: No — settled per this change's brief
  ("commits-only NO chained PR / NO size:exception (settled)"); the orchestrator's
  Review Workload Forecast gate does not apply since delivery mode is fixed
  commits-only, not PR-based.
- **Decision needed before apply**: No — no decision gates, no bug-vs-replicate
  judgment (spec + design already resolved all 7 ADRs, including ADR-7's residual
  `storeId` check, which is a task (3.4), not an open decision).
