# Proposal: Order Sync-Import Parity (narrow 4-field merge)

## Intent

Angular's `synchronizeOrders` (data-synchronizer.service.ts:167-200) routes each imported order through `orderService.addImportedOrder`/`updateImportedOrder`. `updateImportedOrder` (order-offline.service.ts:438-449) is a NARROW 4-field merge — copies only `date`/`isActive`/`updatedDate`/`updatedByName` onto the existing order, leaving `total`/`orderItems`/`isCredit`/`paymentType`/`description` untouched. React instead routes Orders through the generic `makeOrderRepoShim.upsert` (sync-repo-shims.ts:61-65) = FULL overwrite → a sync-import of a stale/partial snapshot silently clobbers those protected fields. Same class of gap as the shipped SaleCredit paid-guard fix. This is Slice 1 of Fase 6 (smallest, no gates).

## Scope

### In Scope
- **PORT** `addImportedOrder`/`updateImportedOrder` into React `OrderOfflineService` (mirror Angular's narrow 4-field merge exactly). See "Key finding" below — these do NOT yet exist in React.
- New `OrderImportService` seam `{getStorageOrders(); addImportedOrder(o):Result; updateImportedOrder(o):Result}` in DataSynchronizerService — mirror `SaleCreditImportService`/`ExpenseImportService` (Rule 12, no new abstraction).
- New `mergeOrdersViaService(incoming)` — structural mirror of `mergeSaleCreditsViaService`; break-only, `OrdersUnexpectedError` (already defined).
- Ctor swap: `orderRepo: GenericUpsertRepo<Order>` → `orderService: OrderImportService`; `sync()` step 4 calls `mergeOrdersViaService(data.orders)`.
- `import.tsx`: reuse the `orderSvc` instance already built at :45 (mirror expenseSvc/creditSvc); delete `makeOrderRepoShim()` (:75) + its import (:10).
- Retire `makeOrderRepoShim`. Since it is the last export and `makeGenericUpsertRepoShim`/`mergeBreakOnly`/`GenericUpsertRepo<T>` become dead (Orders was their last consumer), DELETE `sync-repo-shims.ts` entirely and remove `mergeBreakOnly` + `GenericUpsertRepo<T>` from the synchronizer.
- Update sync tests asserting old full-overwrite → assert the narrow merge (data-synchronizer-service.test.ts ~44 refs; import-no-write.test.ts noop repo → service mock).

### Out of Scope (Slices 2 & 3)
- `deactivate()` cascade-Result guard; rule-3 signature/rename gaps (create/update, `hasInventoryModule` param); return-shape B/C/D restoration; missing methods (getOrderById/getOrdersJson/getLastMonthSale*); "edit order details" feature; shopping-cart/Zustand ratification.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `sync`: Order import sub-flow changes from generic full-overwrite upsert to service-routed narrow 4-field merge on update.

## Key Finding — imported-order methods do NOT exist in React

CRITICAL scope difference vs the SaleCredit precedent: SaleCredit already had `updateImportedSaleCredit` (with guard) + `getStorageSaleCredits` ported, so its slice only rewired. React `OrderOfflineService` has `getStorageOrders()` (line 71) but is MISSING both `addImportedOrder` and `updateImportedOrder`. This slice must PORT them (mirroring Angular's narrow merge exactly). Still in-scope, but adds ~15 prod lines beyond the SaleCredit template.

## Approach

Replicate the shipped `mergeSaleCreditsViaService`/`SaleCreditImportService` seam verbatim for Orders (Rule 12), plus port the two Angular imported-order methods first. This slice also FINISHES the "route all sync-import through services" migration — Orders is the last shim consumer, so the entire shim file and generic upsert path retire.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `sales/lib/services/order-offline-service.ts` | Modified | Port addImportedOrder/updateImportedOrder (narrow merge) |
| `sync/lib/services/data-synchronizer-service.ts` | Modified | OrderImportService seam + mergeOrdersViaService; delete mergeBreakOnly + GenericUpsertRepo |
| `sync/routes/import.tsx` | Modified | Reuse orderSvc; drop shim + import |
| `sync/lib/storage/sync-repo-shims.ts` | Removed | Whole file dead → delete |
| `sync/**/__tests__/*.test.ts` | Modified | Assert narrow merge; swap repo→service mock |

## Decision Gates

None. This is a Rule-7/10 orchestration-parity fix, not bug-vs-replicate. Porting addImportedOrder/updateImportedOrder mirrors Angular 1:1 — no ambiguity. (Note: the imported-order date-revival mirrors Angular's `date`-only reload; the broader 3-field revival Decision Gate stays deferred to Slice 2.)

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sync test ripple (~44 refs) breaks compile | Med | Mirror the SaleCredit test FLIP done last slice; RED-first |
| `makeGenericUpsertRepoShim`/`mergeBreakOnly`/`GenericUpsertRepo` left dead | Confirmed dead | Grep-verified: Orders is the ONLY remaining consumer → delete all three |
| Porting methods drifts from Angular narrow merge | Low | Copy Angular :430-449 field list exactly (date/isActive/updatedDate/updatedByName) |

## Rollback Plan

Single revert of the WU commits on `feat/frontend-parity-audit`. Independently shippable/revertable like its SaleCredit precedent.

## Dependencies

- None. Precedent `salecredit-sync-import-parity` already shipped.

## Success Criteria

- [ ] Order sync-import update preserves total/orderItems/isCredit/paymentType/description (narrow merge)
- [ ] Orders route through OrderImportService, not a generic shim (static: no shim import/export)
- [ ] `sync-repo-shims.ts`, `mergeBreakOnly`, `GenericUpsertRepo<T>` removed; no dead code
- [ ] All sync tests pass asserting the narrow merge
