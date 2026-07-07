# Tasks: service-return-shape-parity — Slice 1 (Inventory)

Governs spec #713, design #714. Strict TDD: every method/behavior = RED→GREEN. Angular source of
truth: `frontend/src/app/application/entries/inventory-offline.service.ts`. Angular-verified
categories per spec's per-service table (id 713).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1050 (WU1 ~40; WU2 ~300; WU3 ~90; WU4 ~110; WU5 ~110; test rework ~400-500 folded into WU2-5) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | WU1 → WU2 → WU3 → WU4 → WU5 → Final regression, one commit per unit |
| Delivery strategy | not specified by orchestrator this run — defaulting to ask-on-risk |
| Chain strategy | pending user choice |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type | Dependency |
|------|------|-------------|------------|
| 1 | `Result`/`DataResult` domain type (packages/domain) | feat | None |
| 2 | Category D — command-method shapes + `delete()` seam adapter + `hasAvailableProductToSale` (flagged) | feat | After WU1 |
| 3 | Category B — sync envelope + call-sites | feat | After WU1 |
| 4 | Category C — async envelope + new Observable-sibling methods | feat | After WU1 |
| 5 | Cross-file call-site closeout + route/component test rework | feat | After WU2-4 |

## ⚠️ Flagged mismatches (verified against Angular source — resolve before/at apply)

1. **`hasAvailableProductToSale`** (spec table lists it as Inventory category-D): Angular's method
   (`inventory-offline.service.ts:397-423`) was ALREADY ported in React — as a pure function
   `checkProductAvailabilityToSale` (`sales/lib/product-availability.ts`), not as an
   `InventoryOfflineService` method, and returning a bespoke `ProductAvailabilityResult`
   (`{succeeded, errorCode}`), not `Result`. Adding a literal duplicate on
   `InventoryOfflineService` risks two divergent copies of the same rule. WU2 adds a THIN
   `Result`-returning adapter method that delegates to the existing `checkProductAvailabilityToSale`
   (reusing the file's own `InventoryCostEligibility` shape for the product/module context it
   needs) rather than re-implementing the branches. Confirm this approach at apply time.
2. **DI gap for B methods**: Angular's `getInventoryCategoriesView`/`getInventoryEntriesInDay` read
   `productRepository`/`categoryRepository` via constructor injection. React's
   `InventoryOfflineService(storeId)` has no such injection — `getAvailableByCategory` already
   works around this with an explicit `products` param (pre-existing precedent in this file). Keep
   that precedent; do not add repository DI in this slice (return-shape only, no architecture
   change).
3. **New Category-C siblings have zero current consumers**: Angular has both a sync B method
   (`getInventoryEntriesInDay`/`getInventoryCategoriesView`) AND a separate async C method
   wrapping it (`...Observable`). React collapsed these into one method each. WU4 restores the C
   siblings as NEW methods (`getByDateAsync`, `getAvailableByCategoryAsync`) for interface-shape
   completeness per spec; no existing call-site needs migration for them (verified: no consumer
   references the Observable-equivalent behavior).

## WU1: `Result`/`DataResult` Prerequisite Type — Req: Category D distinctness — DONE (commit `71e99d3`)

- [x] 1.1 RED: `packages/domain/src/commons/__tests__/result.test.ts` asserts `Result.Success()` →
      `{succeeded:true, errors:[]}`, `Result.Failure(errs)` → `{succeeded:false, errors:errs}`;
      `DataResult` shape has `data/succeeded/errors`, does NOT satisfy `BaseResponseModel` (no
      `message`/`actionCode`).
- [x] 1.2 GREEN: create `packages/domain/src/commons/result.ts` — port Angular's
      `Result`/`DataResult` verbatim (`src/app/domain/commons/result.ts`), kept distinct from
      `BaseResponseModel<T>`.
- [x] 1.3 GREEN: export from `packages/domain/src/index.ts`; `pnpm -C packages/domain build`.
- [x] 1.4 Gate: `pnpm test`, `tsc --noEmit`; commit `feat(domain): port Result/DataResult type`.

## WU2: Category D — Inventory Command-Method Shapes — Req: Category D SYNC, distinct from BaseResponseModel — DONE (commit `d4a54e0`)

- [x] 2.1 RED/GREEN `isNotSoldEntry(productId, entryId): Result` — NEW method (currently inlined);
      `Result.Failure([InventoryErrors.EntryNotExists])` / `[InventoryErrors.SaleExistsWithThisEntry])`,
      else `Result.Success()`. **DEVIATION**: the `ProductErrors.NotExists` branch (Angular checks
      `!productRepository.getProductById(productId)` first) is NOT reachable — React's
      `InventoryOfflineService` has no product repository (same pre-existing DI gap as the
      B methods, design ambiguity #2). Documented in code + test comments; flagged for verify.
- [x] 2.2 RED/GREEN: `create()` → returns `DataResult<InventoryEntryView>` (was plain
      `InventoryEntry`); payload `{id, productId, productName:'', quantity, costPrice, date,
      isActive}`.
- [x] 2.3 RED/GREEN: `update()` (same-product) → returns `DataResult<InventoryEntryView>`,
      guarded by `isNotSoldEntry`; never throws.
- [x] 2.4 RED/GREEN: `updateInventoryEntry()` (cross-product) → returns
      `DataResult<InventoryEntryView>`; same `isNotSoldEntry` guard; never throws. Cross-product
      old/new-bucket bug fix preserved (not reintroduced).
- [x] 2.5 RED/GREEN: `amortizeSoldEntry()` → returns `Result`, never throws.
- [x] 2.6 RED/GREEN: `deactivate()` → returns `Result`, using `isNotSoldEntry` as the guard, never
      throws.
- [x] 2.7 RED/GREEN: `delete()` (BaseService seam, stays sync per ADR-1) — adapted to consume
      `deactivate`'s new `Result`, throwing `result.errors[0]?.description` on failure; preserves
      the seam's own always-throwing contract.
- [x] 2.8 RED/GREEN: `increaseQuantitiesByOrderItems()` → returns `Result` (was `void`); always
      `Result.Success()`.
- [x] 2.9 RED/GREEN: added `addImportedEntries(productId, entries): Result` and
      `updateImportedEntries(productId, entries): Result` — NEW methods, 1:1 port of Angular,
      both always `Result.Success()`.
- [x] 2.10 **SUPERSEDED per orchestrator override** (not the flagged thin-adapter plan): instead
      of adding a NEW `InventoryOfflineService.hasAvailableProductToSale` adapter that kept BOTH
      methods, the existing `sales/lib/product-availability.ts` pure function
      `checkProductAvailabilityToSale` (bespoke `{succeeded, errorCode}` shape) was RENAMED to
      `hasAvailableProductToSale` and its return type changed to `Result` (mapping each branch to
      the matching `ProductErrors.*` entry) — single surface, no duplicate/adapter. All call-sites
      repointed: `sale.tsx`, `egress.tsx`, `cart-shell.tsx`, `sale-product-row.tsx` (prop type +
      `.errors[0]?.description` consumption), `inventory-offline-service.ts`'s
      `getAvailableInventoryCosts` eligibility gate. `ProductAvailabilityResult`/
      `ProductAvailabilityErrorCode`/`PRODUCT_AVAILABILITY_ERROR_MESSAGE_KEYS` removed (superseded
      by `Result`'s own `BaseError.description`).
- [x] 2.11 Call-site: `order-offline-service.ts:388` — confirmed the new `Result` return type
      doesn't break the existing (ignored) statement.
- [x] 2.12 Call-site: `inventory/routes/today-entries.tsx` — `handleSave`/`handleDeactivate`
      rewritten to check `.succeeded` instead of try/catch.
- [x] 2.13 Gate: `pnpm test`, `tsc --noEmit`, build — all clean; commit
      `feat(domain,web-store-pos): restore Inventory category-D Result/DataResult shapes`
      (`d4a54e0`, includes the hasAvailableProductToSale reconciliation + ProductErrors/
      InventoryErrors domain ports).

## WU3: Category B — Sync `BaseResponseModel<T>` Envelope — Req: Category B SYNC — DONE (commit `9121c13`)

- [x] 3.1 RED/GREEN: `getByDate(date)` → returns `BaseResponseModel<InventoryEntryView[]>` (was
      bare array), via new `success()`/`failure()` factories in
      `packages/domain/src/commons/envelope.ts`.
- [x] 3.2 RED/GREEN: `getAvailableByCategory(products?)` → returns
      `BaseResponseModel<InventoryCategoryView[]>` (was bare array).
- [x] 3.3 Call-site: `today-quantities.tsx` — `.data` unwrap for both `getByDate` and
      `getAvailableByCategory` calls.
- [x] 3.4 Call-site: `today-sales-profit.tsx` — `.data` unwrap.
- [x] 3.5 Call-site: `today-entries.tsx` — `.data` unwrap (`loadEntries`).
- [x] 3.6 Call-site: `inventory/routes/available.tsx` — `.data` unwrap.
- [x] 3.7 Call-site: `reports/lib/services/inventory-today-sale-service.ts` — `.data` unwrap
      (kept working ahead of its slice-5 removal).
- [x] 3.8 Gate: `pnpm test`, `tsc --noEmit`, build — all clean; commit
      `feat(domain,web-store-pos): restore Inventory category-B sync envelope + call-sites`
      (`9121c13`).

## WU4: Category C — `Promise<BaseResponseModel<T>>` Envelope — Req: Category C async, resolves never rejects — DONE (commit `4955999`)

- [x] 4.1 RED/GREEN: `filterInventoryEntries(productId?, start?, end?)` → converted to
      `Promise<BaseResponseModel<InventoryEntryView[]>>`, same-tick `Promise.resolve(success(...))`;
      asserted via `await expect(...).resolves`.
- [x] 4.2 RED/GREEN: `getInventoryEntriesView()` → converted to
      `Promise<BaseResponseModel<InventoryEntriesView[]>>`, same-tick `Promise.resolve(success(...))`.
- [x] 4.3 RED/GREEN: added `getByDateAsync(date): Promise<BaseResponseModel<InventoryEntryView[]>>` —
      mirrors Angular's `getInventoryEntriesInDayObservable`, implemented as
      `Promise.resolve(this.getByDate(date))`.
- [x] 4.4 RED/GREEN: added
      `getAvailableByCategoryAsync(products?): Promise<BaseResponseModel<InventoryCategoryView[]>>` —
      mirrors Angular's `getInventoryCategoriesViewObservable`, implemented as
      `Promise.resolve(this.getAvailableByCategory(products))`.
- [x] 4.5 Confirmed: no call-site migration required (no current consumer calls the
      Observable-equivalent behavior — mismatch #3).
- [x] 4.6 Gate: `pnpm test`, `tsc --noEmit`, build — all clean; commit
      `feat(web-store-pos): restore Inventory category-C async envelope + Observable siblings`
      (`4955999`).

## WU5: Cross-File Test Rework Closeout — Req: Regression parity across ~103 test blocks — DONE (folded into WU2-4 commits, no separate commit needed)

- [x] 5.1 Reworked `inventory-offline-service.test.ts` across WU2-4 commits (98 blocks by the end
      of WU4): assertions per method's new category (A unchanged; B → `.data`/envelope shape;
      C → `await` + `.resolves`; D → `.succeeded`/`.errors`/`.data`, no more `toThrow()` for
      `create/update/updateInventoryEntry/amortizeSoldEntry/deactivate`); new blocks added for
      `isNotSoldEntry`, `addImportedEntries`, `updateImportedEntries`, `getByDateAsync`,
      `getAvailableByCategoryAsync`. (`hasAvailableProductToSale`'s tests live in
      `product-availability.test.ts` per the WU2.10 supersede — not on `InventoryOfflineService`.)
- [x] 5.2 Verified `order-offline-service.test.ts` — `increaseQuantitiesByOrderItems` mock is
      `vi.fn()` (no return-value assertion), no rework needed.
- [x] 5.3 Reworked `reports/lib/services/inventory-today-sale-service.test.ts` — `getByDate` mocks
      now return `BaseResponseModel<InventoryEntryView[]>` via a local `bm()` helper.
      `report-aggregation-service.test.ts` doesn't consume Inventory's `getByDate`/
      `getAvailableByCategory` — verified no rework needed.
- [x] 5.4 Reworked `inventory/routes/__tests__/inventory-routes.test.tsx` — added a shared `bm()`
      helper, wrapped all `getByDate`/`getAvailableByCategory` mocks, added a new WU2 describe
      block for `handleSave`/`handleDeactivate` `.succeeded`-check behavior.
      `inventory/components/__tests__/inventory-components.test.tsx` doesn't mock
      `InventoryOfflineService` methods directly — verified no rework needed. Also updated
      `sale-product-row.test.tsx` for the WU2.10 `hasAvailableProductToSale` reconciliation.
- [x] 5.5 Gate: all folded into the WU2/WU3/WU4 commit gates (each commit's `pnpm test`/
      `tsc --noEmit`/build was already clean with its test rework included) — no separate
      "rework closeout" commit was needed since every WU kept its own tests green.

## Final: Full Regression Gate — DONE

- [x] 6.1 Grep-confirmed no remaining bare-array/`void`/`throw`-sentinel returns on any converted
      method (`grep "throw new Error"` on `inventory-offline-service.ts` → only the two throws
      inside `delete()`, the BaseService seam, which stays outside the A/B/C/D conversion per
      ADR-1). `hasAvailableProductToSale` reconciliation confirmed as a rename+shape-change (no
      adapter, no duplicated branch logic) per the orchestrator override — supersedes 2.10's
      original thin-adapter plan. The two new C siblings + `addImportedEntries`/
      `updateImportedEntries` each have RED tests with hand-derived expected values.
- [x] 6.2 Full gate — domain: 91/91 tests, `tsc --noEmit` clean, `pnpm build` clean. web-store-pos:
      1400/1400 tests, `tsc --noEmit` clean, `pnpm build` clean (verified after WU4, re-verified at
      Final).
- [x] 6.3 Tasks file updated with commit hashes (this edit). Delivery mode: commits-only directly
      on `feat/frontend-parity-audit`, per explicit orchestrator instruction for this apply batch
      (no PRs, no branches, no stacking) — supersedes the "pending chain-strategy decision"
      recorded above; that decision is now resolved for this batch.

## Commits (this apply batch, in order)

1. `71e99d3` — `feat(domain): port Result/DataResult type`
2. `d4a54e0` — `feat(domain,web-store-pos): restore Inventory category-D Result/DataResult shapes`
3. `9121c13` — `feat(domain,web-store-pos): restore Inventory category-B sync envelope + call-sites`
4. `4955999` — `feat(web-store-pos): restore Inventory category-C async envelope + Observable siblings`

## Status: Slice 1 (Inventory) COMPLETE — ready for sdd-verify.
