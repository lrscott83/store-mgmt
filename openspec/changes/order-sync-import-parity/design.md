# Design: Order Sync-Import Parity (narrow 4-field merge)

Change: `order-sync-import-parity` — Fase 6 (orders/cart), Slice 1 of 3.
Delivery: commits-only on `feat/frontend-parity-audit`. Artifact store: hybrid.

## 1. Context & Goal

Angular `synchronizeOrders` (`frontend/.../data-synchronizer.service.ts:167-200`) routes each
imported order through the offline SERVICE (`orderService.addImportedOrder` /
`updateImportedOrder`). The update is a **narrow 4-field merge**
(`order-offline.service.ts:438-449`): it overwrites ONLY
`date` / `isActive` / `updatedDate` / `updatedByName` on the existing local record and leaves
`total` / `orderItems` / `isCredit` / `paymentType` / `description` untouched.

React currently BYPASSES the service. `import.tsx:75` builds `orderRepo` via
`makeOrderRepoShim()` (generic full-overwrite, no narrow merge) and `sync()` step 4
(`data-synchronizer-service.ts:220-227`) routes it through the generic `mergeBreakOnly`. Real
bug: importing a stale order snapshot **clobbers** the protected fields (a locally-edited
`total`/`orderItems` is overwritten by the imported copy). Same class as the shipped SaleCredit
paid-guard and Expense/Inventory fixes.

The correct pattern already ships three times (Inventory, Expense, SaleCredit). This change
replicates it for Orders and **completes** the route-all-through-services migration.

**Scope difference vs SaleCredit**: SaleCredit's `updateImportedSaleCredit`/`getStorageSaleCredits`
were pre-ported, so its slice only rewired. React `OrderOfflineService` is MISSING
`addImportedOrder` AND `updateImportedOrder` (it HAS `getStorageOrders():71`,
`setOrdersLocalStorage:408`). This slice MUST PORT both methods (+~15 prod lines beyond the
SaleCredit template) before rewiring.

## 2. Architecture Approach

Mirror the shipped **SaleCredit/Expense sync-import wiring** exactly (Rule 12 — no new
architecture). Moving parts, each a 1:1 analog of what SaleCredit already has:

| Concern | SaleCredit (shipped template) | Order (this change) |
|---|---|---|
| Offline methods | `add/updateImportedSaleCredit` (pre-existing) | **PORT** `add/updateImportedOrder` into `OrderOfflineService` |
| Injected seam | `SaleCreditImportService` (:149-153) | new `OrderImportService` |
| Merge method | `mergeSaleCreditsViaService` (:445) | new `mergeOrdersViaService` |
| Ctor param | param 7 `saleCreditService` | swap param 5 `orderRepo` → `orderService: OrderImportService` |
| `sync()` step | step 6 → `mergeSaleCreditsViaService` | step 4 (:220-227) → `mergeOrdersViaService` |
| Route wiring | reuse `creditSvc` (import.tsx:47) | reuse `orderSvc` (import.tsx:45) |

The synchronizer keeps ORCHESTRATING (add-vs-update decision + counts + break/error); the
offline service OWNS the field-level narrow merge.

## 3. Component Design

### 3.1 PORT `addImportedOrder` / `updateImportedOrder` into `OrderOfflineService`

`app/sales/lib/services/order-offline-service.ts`. Add `Result` to the value import from
`@store-mgmt/domain` (line 2). Mirror the shipped SaleCredit methods
(`sale-credit-offline-service.ts:343,358`) + Angular `order-offline.service.ts:430-449`:

```ts
/** 1:1 port of Angular addImportedOrder (order-offline.service.ts:430-436): revive date, append. */
addImportedOrder(order: Order): Result {
  const imported: Order = { ...order, date: new Date(order.date) };
  this.getStorageOrders().push(imported);
  this.setOrdersLocalStorage(this.orders!);
  return Result.Success();
}

/**
 * 1:1 port of Angular updateImportedOrder (order-offline.service.ts:438-449): NARROW 4-field
 * merge on the existing record by id — overwrites ONLY date/isActive/updatedDate/updatedByName;
 * leaves total/orderItems/isCredit/paymentType/description untouched. No-op when id absent.
 */
updateImportedOrder(importedOrder: Order): Result {
  const existing = this.getStorageOrders().find((o) => o.id === importedOrder.id);
  if (existing) {
    existing.date = new Date(importedOrder.date);
    existing.isActive = importedOrder.isActive;
    existing.updatedDate = importedOrder.updatedDate;
    existing.updatedByName = importedOrder.updatedByName;
    this.setOrdersLocalStorage(this.orders!);
  }
  return Result.Success();
}
```

Uses the existing `getStorageOrders()`/`setOrdersLocalStorage()` (matches the React SaleCredit
convention, behaviorally identical to Angular's `this.orders = getOrdersFromLocalStorage()` reload).

### 3.2 New seam: `OrderImportService` (data-synchronizer-service.ts)

Add next to `SaleCreditImportService`, structurally identical (3 methods). Add `Order` to the
top-level `import type` (line 2 — currently inline-imported in the ctor):

```ts
export interface OrderImportService {
  getStorageOrders(): Order[];
  addImportedOrder(order: Order): Result;
  updateImportedOrder(order: Order): Result;
}
```

The real `OrderOfflineService` satisfies this once §3.1 lands.

### 3.3 New method: `mergeOrdersViaService`

1:1 structural mirror of `mergeSaleCreditsViaService` (:445-491): seed map from
`getStorageOrders()`, add-vs-update by id, early-return on `!result.succeeded`, break-only (no
revert), `catch → OrdersUnexpectedError`. The narrow merge lives inside `updateImportedOrder`
and does not affect counts (an update is counted whether or not fields change). Replaces the
generic `mergeBreakOnly('orders', ...)` call.

### 3.4 Constructor change (param 5)

`data-synchronizer-service.ts:196`:

```ts
// FROM: private readonly orderRepo: GenericUpsertRepo<import('@store-mgmt/domain').Order>,
// TO:   private readonly orderService: OrderImportService,
```

### 3.5 `sync()` step-4 wiring swap (:220-227)

```ts
// FROM: push(this.mergeBreakOnly('orders', this.orderRepo, data.orders,
//         SynchronizerErrors.OrdersUnexpectedError));
// TO:   push(this.mergeOrdersViaService(data.orders));
```

### 3.6 Route wiring: import.tsx

`orderSvc = new OrderOfflineService(storeId)` is ALREADY constructed at `import.tsx:45` for the
serializer read side. Mirror Expense/SaleCredit (same instance feeds serializer + synchronizer):
delete `const orderRepo = makeOrderRepoShim()` (:75) and its import (:10); pass `orderSvc` as
param 5 of the `DataSynchronizerService` ctor (:88). Update the routing comment block (:76-81) to
include Orders.

### 3.7 Full deletion plan (completes the migration)

- **`sync-repo-shims.ts` — DELETE ENTIRE FILE.** Grep-confirmed Orders is the LAST consumer of
  `makeOrderRepoShim` / `makeGenericUpsertRepoShim`. No other importer remains.
- **`mergeBreakOnly<T>` (:345-373) — REMOVE.** Grep-confirmed no remaining caller after step 4
  rewires (Expenses/SaleCredits already route via their own methods).
- **`GenericUpsertRepo<T>` interface (:106-109) + its doc — REMOVE.** Only `mergeBreakOnly`,
  `sync-repo-shims.ts`, and the tests reference it.
- Clean all imports (`sync-repo-shims` import in import.tsx; `GenericUpsertRepo` import in tests).

## 4. Data Flow

```
import.tsx
  orderSvc = new OrderOfflineService(storeId)   // read side (serializer) + write side (synchronizer)
        │
        └─► DataSynchronizerService(..., orderSvc, ...)   // param 5 = OrderImportService
                  │
              sync(parsedData) step 4
                  │
              mergeOrdersViaService(data.orders)
                  │  seed: orderSvc.getStorageOrders()
                  ├─ id NOT in map ─► orderSvc.addImportedOrder(order)     // append
                  └─ id IN map     ─► orderSvc.updateImportedOrder(order)  // NARROW 4-field merge
                                          └─ overwrites date/isActive/updatedDate/updatedByName ONLY
```

Storage format unchanged (plain-array under the `orders` key, id-869 — the retired shim wrote the
SAME key/format). No migration, no cross-consumer breakage.

## 5. Integration Points

- **Sole ctor call-site**: `import.tsx` — no other constructor of `DataSynchronizerService`.
- **Storage key**: `StorageKeys.entityKey('orders', storeId)` — identical for shim and
  `OrderOfflineService`, so the sales module keeps reading merges.
- **Error surface**: `OrdersUnexpectedError` already defined (:50); no new code.

## 6. Test Plan (strict TDD — RED before prod edits, GREEN after)

Files: `sync/lib/services/__tests__/data-synchronizer-service.test.ts` (~44 order refs) +
`sync/lib/storage/__tests__/import-no-write.test.ts`.

### 6.1 Test infra flip
- Add `makeOrderImportServiceMock(initial)` mirroring `makeSaleCreditImportServiceMock`, BUT its
  `updateImportedOrder` MUST replicate the narrow merge (non-vacuous) — only merge
  `date/isActive/updatedDate/updatedByName`, keep `total/orderItems/isCredit/paymentType` from the
  existing record. `getStorageOrders()` returns the seeded array; `_imported` records writes.
- `makeService` (:311-320): replace `orderRepo = makeGenericRepo<Order>(...)` with
  `orderService = makeOrderImportServiceMock(...)`; update the returned handle + ctor arg.
- Remove the now-unused `makeGenericRepo<T>` helper (:181) — grep-confirmed only used with `<Order>`
  — and the `GenericUpsertRepo` import (:6).

### 6.2 Existing tests that FLIP (shim-overwrite → service routing)
- **Ordering test (:346-416)**: inline `orderRepo.upsert` push becomes mock `addImportedOrder`
  pushing `'order:'+id`; write-order assertion unchanged.
- **Single-add test (:555-577)**: `orderRepo.getAll(...).has('order-1')` → assert via mock
  `_imported`/store; merge count `{inserted:1, updated:0}` unchanged.
- **Break-only T3 (:766-794)**: `orderRepo.upsert` throw-on-item → mock
  `addImportedOrder`/`updateImportedOrder` throws (or returns non-succeeded) on the failing id;
  prior writes persist.
- **All-entities error test (:823-842)**: `orderRepo.upsert = () => throw` → mock
  `addImportedOrder` throws; asserted entity list still includes `'orders'`.
- **Idempotent / all-6 tests (:933,970,1004,1033)**: counts unchanged once routed via mock.
- **Raw-ctor positional args (:468,513,608,1085,1132,1175,1219,1252,1277)**: swap
  `makeGenericRepo<Order>()` → `makeOrderImportServiceMock()`.
- **import-no-write.test.ts**: `makeNoopGenericRepo` (:116) + `GenericUpsertRepo` import (:20) →
  an `OrderImportService` no-op mock (`getStorageOrders`→[], add/update→`Result.Success()`).

### 6.3 New RED tests (the whole point)
1. **narrow merge preserves protected fields**: existing local order (`total`, `orderItems`,
   `isCredit`, `paymentType` set); import same id with DIFFERENT `total`/`orderItems` + new
   `isActive`/`updatedDate`/`updatedByName`. Assert final keeps original
   `total/orderItems/isCredit/paymentType`, takes imported `date/isActive/updatedDate/updatedByName`.
   Merge count `updated:1`.
2. **new order adds**: import an order whose id is absent → `addImportedOrder` called (not update),
   merge `inserted:1`.
3. **routes through service, not shim** (static): `sync-repo-shims.ts` no longer exists; `import.tsx`
   no longer imports `makeOrderRepoShim`; synchronizer has no `mergeBreakOnly`/`GenericUpsertRepo`.
4. **error propagation**: `addImportedOrder`/`updateImportedOrder` throws → `OrdersUnexpectedError`
   surfaced; break-only (no revert).

Run the full sync suite — must stay green.

## 7. ADR-style Decisions

- **ADR-1 — Route Orders through the offline service, not a guarded shim.** Replicate the shipped
  SaleCredit/Expense pattern. *Rejected*: bake the narrow merge into `makeOrderRepoShim` — duplicates
  service logic, diverges from Angular's structure (Angular calls the service), keeps a React-only
  abstraction alive (Rule 12).
- **ADR-2 — PORT `add/updateImportedOrder` into `OrderOfflineService`.** They are MISSING (unlike
  SaleCredit). Mirror Angular `:430-449` narrow 4-field merge exactly. *Rejected*: express the merge
  in the synchronizer — the field-level merge belongs to the service; `GenericUpsertRepo` can't
  express it.
- **ADR-3 — New narrow `OrderImportService` seam (3 methods).** Mirror `SaleCreditImportService`/
  `ExpenseImportService`. *Rejected*: reuse `GenericUpsertRepo<Order>` — full-overwrite, can't
  express the narrow merge; *Rejected*: a shared base import interface — no Angular correlate (Rule 12).
- **ADR-4 — Reuse the `OrderOfflineService` instance built at import.tsx:45.** Same-instance for
  serializer read + synchronizer write, exactly as Expense/SaleCredit. *Rejected*: a second instance —
  wasteful, diverges from the template.
- **ADR-5 — Delete `sync-repo-shims.ts` entirely + remove `mergeBreakOnly` + `GenericUpsertRepo<T>`.**
  Orders was the LAST consumer (grep-confirmed). *Rejected*: keep the dead helpers — dead code; this
  slice's mandate is to FINISH the route-all-through-services migration.
- **ADR-6 — Use `OrdersUnexpectedError` for the Order catch — 1:1 with Angular.** Angular's
  `synchronizeOrders` catch (`:198`) correctly emits `OrdersUnexpectedError` — there is NO copy-paste
  bug on the Order path (unlike Expenses `:230` / SaleCredits `:262`, which wrongly reuse it and React
  FIXED). So React mirrors Angular here verbatim; no bug involved, no fix needed.
- **ADR-7 — Keep the `DataSynchronizerService` `storeId` ctor param.** After `mergeBreakOnly` is
  removed, `this.storeId` becomes unused (it only fed the shim's per-call `getAll(storeId)`/`upsert`).
  *Choice*: keep param 1 as-is. *Rejected*: remove it — not in the requested deletion set, would
  ripple every positional-ctor test + `import.tsx` for zero parity benefit; TS `noUnusedLocals`/
  eslint do not flag unused constructor parameter-properties. Flagged as residual to re-confirm in apply.

## 8. Work-Unit Plan

Estimated net ~40-60 prod lines changed (−~35 deletions: whole shims file + `mergeBreakOnly` +
`GenericUpsertRepo`; +~40 additions: two offline methods + seam + `mergeOrdersViaService`) plus
~44 test refs. Well under the 400-line budget.

- **WU1 — Port methods + synchronizer service + tests (parity core, RED-first).** Port
  `add/updateImportedOrder` into `OrderOfflineService`; add `OrderImportService` interface +
  `mergeOrdersViaService`; swap ctor param 5 + step-4 wiring; remove `mergeBreakOnly` +
  `GenericUpsertRepo`; test-infra `makeOrderImportServiceMock`, flip existing order assertions, add
  the 4 new RED tests.
- **WU2 — Route wiring + shim-file deletion.** `import.tsx`: pass `orderSvc`, drop `orderRepo` +
  `makeOrderRepoShim` import; DELETE `sync-repo-shims.ts`; fix `import-no-write.test.ts`.

Likely collapses to a **single atomic commit** due to ctor coupling (same as SaleCredit) — the ctor
param swap makes WU1 and WU2 interdependent at compile time.

## 9. Rollback

Single-commit revert on `feat/frontend-parity-audit`: restore `sync-repo-shims.ts`,
`mergeBreakOnly`, `GenericUpsertRepo<T>`, ctor param 5 (`orderRepo`), the step-4 `mergeBreakOnly`
call, `import.tsx` wiring, and the test assertions.

## 10. Risks / Residual Ambiguity

- **Sync test ripple (Med, in scope):** ~44 order refs move from `GenericUpsertRepo` mocks to the
  service mock across two test files; mechanical, enumerated in §6.2.
- **Mock fidelity (Low):** `makeOrderImportServiceMock.updateImportedOrder` MUST replicate the narrow
  merge or the §6.3-#1 test is vacuous. Guarded by §6.1.
- **`storeId` becomes unused (Low, ADR-7):** kept as-is; if the project lint/build DOES flag an unused
  parameter-property during apply, prefix `_storeId` or remove param 1 (rippling positional ctor
  calls) — re-confirm in apply.
- **Port drift (Low):** copy Angular's exact 4-field list; do NOT touch `total`/`orderItems`/
  `isCredit`/`paymentType`/`description`.
- **No residual decision gates:** Rule-7/10 orchestration-parity fix; all field behavior mirrors
  Angular 1:1.
```