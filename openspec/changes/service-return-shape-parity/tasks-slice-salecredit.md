# Tasks: service-return-shape-parity — Slice 2b (SaleCredit)

Governs spec #713, design #714 (SaleCredit row). Strict TDD: every method/behavior = RED→GREEN.
Angular source of truth: `frontend/src/app/application/credits/sale-credit-offline.service.ts`
(+ `domain/entities/sale-credits/sale-credit.errors.ts`). React target:
`frontend-react/apps/web-store-pos/app/sales/lib/services/sale-credit-offline-service.ts`.
Delivery: commits-only directly on `feat/frontend-parity-audit`, no PRs, no branches, no stacking
(matches Slice 1/2's resolved delivery mode).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-650 (WU1 ~35; WU2 ~230; WU3 ~90; WU4 ~270; test rework folded into WU2-4) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is commits-only per instruction, not PR-chained |
| Suggested split | WU1 → WU2 → WU3 → WU4 → Final regression, one commit per unit |
| Delivery strategy | commits-only (explicit instruction, supersedes ask-on-risk default) |
| Chain strategy | size-exception (single branch, sequential commits, no PR chain requested) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type | Dependency |
|------|------|-------------|------------|
| 1 | `SaleCreditErrors` domain port (packages/domain) | feat | None |
| 2 | Category D — command-method shapes (create/update/paid/delete/deactivateByOrderId/imports) + call-sites (order-offline-service, today-credits) | feat | After WU1 |
| 3 | Category B — sync envelope `getSaleCreditsInDay`, remove no-correlate `getByDateRange`/`getActiveToday` | feat | After WU1 |
| 4 | Category C — async envelope (5 methods) + call-site closeout (today-credits/credits/today-stats) | feat | After WU2-3 |

## ⚠️ Flagged mismatches / decisions (verify at apply time)

1. **`SaleCreditErrors.NotExists` text is a copy-paste bug from Expense** (`sale-credit.errors.ts:6`:
   `"El gasto no existe."` — says "expense", not "credit"). This is a TEXT-content artifact, not a
   logic/behavior bug, and React's `es.ts:257` (`SALE_CREDIT_ERRORS.NOT_EXISTS`) already documents
   preserving this literal intentionally for text parity. Port byte-identical; do NOT translate to
   "El crédito no existe" — confirm no scope creep.
2. **`getByDateRange`/`getActiveToday` (current React) have no Angular correlate** — same
   invented-generalization pattern as Expense's flagged mismatch #2. REMOVE both. Angular's real
   call pattern (`today-sale-credits.component.ts:27`) is
   `getSaleCreditsInDayObservable(new Date())`; `today-credits.tsx`'s `loadSaleCredits` rewires to
   `await service.getSaleCreditsInDayObservable(new Date())`.
3. **`getUnpaidCreatedToday`/`getPaidToday` (current React) have no Angular correlate** — invented
   sync renames of the real Observable-suffixed methods. Convert IN PLACE to
   `getUnPaidSaleCreditsInDayObservable`/`getPaidSaleCreditsInDayObservable` (async, EXACT Angular
   names, verified `today-stats.component.ts:92,102`). `today-stats.tsx`'s credits-loading branch
   becomes `await`.
4. **`credits.tsx`'s `loadSaleCredits` bypasses the service filter** — calls
   `getAll().filter(isActive)` instead of any real filter method. Angular's
   `SaleCreditsComponent.loadSaleCredits()` always calls `filterSaleCredits(null, null, null,
   null)` (`sale-credits.component.ts:51-52`). Rewire to `await
   service.filterSaleCredits(undefined, undefined, undefined, undefined)`.
5. **`createFromOrder`/`update`/`pay` (current React names) have no Angular correlate** —
   Angular's real names are `createSaleCredit(orderId, client, total, note)`,
   `updateSaleCredit(id, client, note)`, `paidSaleCredit(id, paidType, note)`, all returning
   `DataResult<SaleCredit>`, never throwing. Rename in place + wrap in `DataResult`.
   `order-offline-service.ts:327`'s call becomes `this.creditService.createSaleCredit(orderId,
   clientName, total, '')` (Angular always passes `''` for note, `order-offline.service.ts:63`),
   ignoring the returned `DataResult` (Angular's own caller ignores it too). `today-credits.tsx`'s
   `handleSave`/`handlePay` swap their try/catch for a `.succeeded` check (mirrors Slice 2's
   `today-expenses.tsx` WU2.3 precedent).
6. **`voidByOrderId` (current React) has no Angular correlate; its ALL-matches-loop semantics also
   diverge** — Angular's real method is `deactivateSaleCreditByOrderId(orderId): Result`, which
   finds only the FIRST active credit for that order (`.find()`, not a loop) and soft-deletes just
   that one via `deleteSaleCredit`, always resolving `Result.Success()` (even when no credit is
   found — no-op success). Rename + behavior-correct to single-match.
   `order-offline-service.ts:377`'s call becomes
   `this.creditService.deactivateSaleCreditByOrderId(id)`, ignoring the returned `Result` — Order's
   OWN `deactivate()` doesn't check the credit-cascade result yet (Angular's real
   `deactivateOrder` DOES: `order-offline.service.ts:317-324`), but wiring that check belongs to
   Order's OWN slice per design ADR-4 dependency order. This slice only renames/fixes the
   SaleCredit-side method and keeps Order's current fire-and-forget call pattern — flag for the
   Order slice to pick up.
7. **`void`/`delete` seam split** — mirrors Expense WU2.4/2.5 and Inventory's deactivate/delete
   precedent: add `deleteSaleCredit(id): Result` (real Angular command, never throws,
   `Result.Failure([SaleCreditErrors.NotExists])` on missing id). The internal `void(id)` helper is
   removed/absorbed — Angular has no `void` method; `deactivateSaleCreditByOrderId` now calls
   `deleteSaleCredit` directly (mirrors Angular's own reuse at
   `sale-credit-offline.service.ts:117`). `BaseService` seam `delete(id): void` adapts to call
   `deleteSaleCredit(id)` and throws `result.errors[0]?.description` on failure — same
   behavior-change precedent as Expense (`delete()` becomes throw-on-missing instead of silent
   no-op). Existing "no-op for missing id" test needs rework to assert the new throw.
8. **Downstream note (NOT part of this slice)**: `sync/routes/import.tsx` currently routes
   SaleCredit sync writes through a raw `saleCreditRepo` (`BaseRepository<SaleCredit>`), not
   through `SaleCreditOfflineService.addImportedSaleCredit`/`updateImportedSaleCredit` (unlike
   Expense/Inventory, already fixed in commits `607dee6`/`7daa98d`). This slice PORTS the two
   imported-D methods but does NOT rewire `DataSynchronizerService`/`import.tsx` to use them — that
   rewire is a FOLLOW-UP, flagged here for tracking only, not executed in this slice.

## WU1: `SaleCreditErrors` Domain Port — Req: Category D distinctness

- [ ] 1.1 RED: `packages/domain/src/errors/__tests__/sale-credit-errors.test.ts` asserts
      `SaleCreditErrors.NotExists` = `{code:'SaleCredit.NotExists', description:'El gasto no
      existe.'}` (byte-identical port, flagged mismatch #1).
- [ ] 1.2 GREEN: create `packages/domain/src/errors/sale-credit-errors.ts` (same `as const
      satisfies Record<string, BaseError>` pattern as `expense-errors.ts`).
- [ ] 1.3 GREEN: export from `packages/domain/src/index.ts`; `pnpm -C packages/domain build`.
- [ ] 1.4 Gate: `pnpm test`, `tsc --noEmit`; commit `feat(domain): port SaleCreditErrors.NotExists
      (byte-identical Angular parity)`.

## WU2: Category D — SaleCredit Command-Method Shapes — Req: Category D SYNC, distinct from BaseResponseModel

- [ ] 2.1 RED/GREEN: rename `createFromOrder(orderId, client, total)` →
      `createSaleCredit(orderId, client, total, note): DataResult<SaleCredit>` — always `new
      DataResult(credit, true, [])`; update `order-offline-service.ts:327` call to
      `createSaleCredit(orderId, clientName, total, '')`, ignoring the result (flagged #5).
- [ ] 2.2 RED/GREEN: rename `update(id, client, note)` → `updateSaleCredit(id, client, note):
      DataResult<SaleCredit>` — success `new DataResult(updated, true, [])`; missing-id `new
      DataResult(undefined, false, [SaleCreditErrors.NotExists])` — never throws (removes current
      `throw new Error`).
- [ ] 2.3 RED/GREEN: rename `pay(id, paidType, note)` → `paidSaleCredit(id, paidType, note):
      DataResult<SaleCredit>` — same success/failure shape as 2.2, never throws.
- [ ] 2.4 Call-site: `today-credits.tsx` `handleSave`/`handlePay` — replace try/catch with `const
      result = svc.updateSaleCredit(...)` / `svc.paidSaleCredit(...)`; `return result.succeeded`
      (flagged #5).
- [ ] 2.5 RED/GREEN: add `deleteSaleCredit(id): Result` — missing id →
      `Result.Failure([SaleCreditErrors.NotExists])`; else soft-delete (`isActive=false`,
      `updatedDate`, `updatedByName`) → `Result.Success()`. Never throws (flagged #7).
- [ ] 2.6 RED/GREEN: rename `voidByOrderId(orderId)` → `deactivateSaleCreditByOrderId(orderId):
      Result` — `.find()` the first active credit for `orderId`, call `deleteSaleCredit(id)` if
      found, else `Result.Success()` (no-op) — single-match semantics, NOT a loop (flagged #6).
      Update `order-offline-service.ts:377` call to `deactivateSaleCreditByOrderId(id)`, ignoring
      the result (flagged #6).
- [ ] 2.7 RED/GREEN: adapt `delete(id): void` (BaseService seam) to call `deleteSaleCredit(id)` and
      throw `result.errors[0]?.description` on failure — behavior change (silent no-op → throw);
      remove the now-redundant internal `void(id)` helper (flagged #7).
- [ ] 2.8 RED/GREEN: add `addImportedSaleCredit(saleCredit): Result` and
      `updateImportedSaleCredit(importedSaleCredit): Result` — 1:1 port of Angular (partial-merge
      semantics for update: only overwrite `paid/isPaid/paidDate` when `!saleCredit.paid`), both
      always `Result.Success()`. No call-site migration in this slice (flagged #8).
- [ ] 2.9 Gate: `pnpm test`, `tsc --noEmit`, build; commit `feat(domain,web-store-pos): restore
      SaleCredit category-D Result/DataResult shapes`.

## WU3: Category B — Sync `BaseResponseModel<T>` Envelope — Req: Category B SYNC

- [ ] 3.1 RED/GREEN: add `getSaleCreditsInDay(date): BaseResponseModel<SaleCredit[]>` via
      `success()`/`failure()` from `@store-mgmt/domain` — filters `isActive` + day window from the
      given `date`, sorted ASC by date (Angular `e1.date - e2.date`).
- [ ] 3.2 GREEN: remove `getByDateRange`/`getActiveToday` (no Angular correlate, flagged #2).
- [ ] 3.3 Gate: `pnpm test`, `tsc --noEmit`, build; commit `feat(domain,web-store-pos): restore
      SaleCredit category-B sync envelope`.

## WU4: Category C — `Promise<BaseResponseModel<T>>` Envelope + Call-Site Closeout — Req: Category C async, resolves never rejects

- [ ] 4.1 RED/GREEN: add `getSaleCreditsInDayObservable(date):
      Promise<BaseResponseModel<SaleCredit[]>>` — `Promise.resolve(this.getSaleCreditsInDay(date))`,
      EXACT Angular name.
- [ ] 4.2 RED/GREEN: convert `getUnpaidCreatedToday()` → `getUnPaidSaleCreditsInDayObservable(date):
      Promise<BaseResponseModel<SaleCredit[]>>` — reuses `getSaleCreditsInDay(date)` then filters
      `!isPaid`, envelope + same-tick resolve, EXACT Angular name (flagged #3).
- [ ] 4.3 RED/GREEN: convert `getPaidToday()` → `getPaidSaleCreditsInDayObservable(date):
      Promise<BaseResponseModel<SaleCredit[]>>` — active + paid + `paidDate` within day window,
      sorted ASC by `date`, envelope + same-tick resolve, EXACT Angular name (flagged #3).
- [ ] 4.4 RED/GREEN: add `getSaleCreditsObservable(): Promise<BaseResponseModel<SaleCredit[]>>` —
      `Promise.resolve(success(activeCredits))`; no current Angular consumer (dead method in
      Angular too) — port for surface parity only, no call-site to migrate.
- [ ] 4.5 RED/GREEN: convert `filterSaleCredits(isPaid, client?, start?, end?)` (currently sync) →
      `Promise<BaseResponseModel<SaleCredit[]>>` — same filter logic (Angular quirks preserved:
      `isPaid=false` = no filter, case-sensitive client substring), envelope + same-tick resolve;
      asserted via `await expect(...).resolves`.
- [ ] 4.6 Call-site: `today-credits.tsx` `loadSaleCredits` — `async`, `await
      svc.getSaleCreditsInDayObservable(new Date())`, `.data` unwrap on `.succeeded` (flagged #2).
- [ ] 4.7 Call-site: `credits.tsx` `loadSaleCredits` — `async`, replace `getAll().filter(isActive)`
      with `await svc.filterSaleCredits(undefined, undefined, undefined, undefined)`, `.data`
      unwrap (flagged #4).
- [ ] 4.8 Call-site: `today-stats.tsx` credits branch inside the `useEffect` — inner async IIFE,
      `await svc.getUnPaidSaleCreditsInDayObservable(new Date())` and `await
      svc.getPaidSaleCreditsInDayObservable(new Date())`, `.data` unwrap, guarded by
      `hasCreditsModule` (flagged #3).
- [ ] 4.9 Gate: `pnpm test`, `tsc --noEmit`, build; commit `feat(web-store-pos): restore SaleCredit
      category-C async envelope + call-sites`.

## Test Rework Closeout (folded into WU2-4 commits)

- [ ] 5.1 `sale-credit-offline-service.test.ts`: rework `createFromOrder`/`update`/`pay`/`delete`
      assertions to `DataResult`/`Result` shapes (no more `toThrow()` for update/pay/delete); add
      blocks for `deleteSaleCredit`, `deactivateSaleCreditByOrderId` (single-match, not loop),
      `addImportedSaleCredit`, `updateImportedSaleCredit`, `getSaleCreditsInDay` (envelope + ASC
      sort), `getSaleCreditsInDayObservable`, `getUnPaidSaleCreditsInDayObservable`,
      `getPaidSaleCreditsInDayObservable`, `getSaleCreditsObservable`, `filterSaleCredits`
      (`await`/`.resolves`); remove `getByDateRange`/`getActiveToday`/`getUnpaidCreatedToday`/
      `getPaidToday` blocks.
- [ ] 5.2 `order-offline-service.test.ts`: rework the `SaleCreditOfflineService` mock (rename
      `createFromOrder`→`createSaleCredit` returning `DataResult`, `voidByOrderId`→
      `deactivateSaleCreditByOrderId` returning `Result`) and all 5 assertions referencing those
      mock methods (ORD-02, ORD-04, ORD-11, ORD-12).
- [ ] 5.3 `sales-routes.test.tsx`: rework the `SaleCreditOfflineService` mock block (remove
      `getActiveToday`/`pay`/`update`; add `getSaleCreditsInDayObservable`,
      `paidSaleCredit`/`updateSaleCredit` (`DataResult`-returning), `filterSaleCredits`
      (Promise-returning)) — confirms `TodaySaleCreditsPage`/`SaleCreditsPage` still render.
- [ ] 5.4 `today-stats.test.tsx`: replace `getUnpaidCreatedToday`/`getPaidToday` mocks with
      `getUnPaidSaleCreditsInDayObservable`/`getPaidSaleCreditsInDayObservable`
      (`mockResolvedValue(success([...]))`), confirm `TodayStatsPage`'s async effect still renders
      expected totals.
- [ ] 5.5 Verify `sale-credit-list.tsx`/component tests need no rework (presentational, receives
      already-resolved arrays via props — confirmed).

## Final: Full Regression Gate

- [ ] 6.1 Grep-confirm no remaining bare-array/`throw`-sentinel returns on any converted method
      except `delete()`'s intentional seam-throw (flagged #7).
- [ ] 6.2 Full gate — domain: `pnpm test`, `tsc --noEmit`, build clean. web-store-pos: `pnpm test`,
      `tsc --noEmit`, `pnpm build` clean.
- [ ] 6.3 Update this file with commit hashes; confirm flagged mismatches #1/#6/#8 resolutions
      taken (text preserved, single-match deactivate, sync-rewire deferred).

## Status: NOT STARTED (Slice 2b — SaleCredit).
