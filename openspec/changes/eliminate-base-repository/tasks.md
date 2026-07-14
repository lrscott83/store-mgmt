# Tasks: eliminate-base-repository

Governs proposal `openspec/changes/eliminate-base-repository/proposal.md`, spec deltas
`specs/product-service/spec.md` + `specs/sync/spec.md`, design.md. Strict TDD active: every
behavior change = RED (failing test) → GREEN (code) → full suite green. Test runner: `pnpm test`
(from `frontend-react/`, vitest via turbo). Type-check SEPARATE, also required green:
`pnpm -C apps/web-store-pos exec tsc --noEmit` (from `frontend-react/`). Delivery: commits-only
directly on `feat/frontend-parity-audit` — no PRs, no chained/size:exception ceremony (locked
convention). One commit per work unit; each earlier slice independently `git revert`-able
(delete-base-repository is last).

Angular sources of truth: `frontend/src/app/application/products/product.repository.ts`,
`categories/product-category.repository.ts`, `orders/order-offline.service.ts`,
`credits/sale-credit-offline.service.ts`, `expenses/expense-offline.service.ts`,
`synchronization/data-synchronizer.service.ts`.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~500-650 total across 7 commits (WU1 ~60, WU2 ~55, WU3 ~110, WU4 ~90, WU5 ~80, WU6 ~130, WU7 ~90 incl. deletions); each individual commit stays well under 150 lines |
| 400-line budget risk | Medium-High in aggregate, Low per individual commit |
| Chained PRs recommended | No — delivery is commits-only on `feat/frontend-parity-audit` (no PR boundary exists to chain) |
| Suggested split | N/A — single feature branch, 7 sequential work-unit commits, each independently revertible |
| Delivery strategy | commits-only (locked, not ask-on-risk/auto-chain/single-pr/exception-ok) |
| Chain strategy | N/A — no PR chain in this delivery model |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A
400-line budget risk: Medium-High (aggregate) / Low (per-commit)

### Suggested Work Units

| Unit | Goal | Notes |
|---|---|---|
| WU1 | Inline `product-repository.ts` | Map-entries, cache, auto-init, drop date revival |
| WU2 | Inline `product-category-repository.ts` | Same pattern |
| WU3 | Inline `order-offline-service.ts` | Map-entries → plain array, cache, auto-init; revival fields UNCHANGED (open question) |
| WU4 | Inline `sale-credit-offline-service.ts` | Same; revival bugs UNCHANGED (open question) |
| WU5 | Inline `expense-offline-service.ts` | Same; normalization NOT added (open question) |
| WU6 | Sync re-home (`import.tsx` + shim) | New sync-local shim, zero orchestration change |
| WU7 | Delete `base-repository.ts` + test | LAST, only after WU1-6 land and no import remains |

## BLOCKED — Decision Gate (does NOT block WU1-WU7 below)

The following fix-vs-replicate calls (design.md "Open Questions") are **PENDING USER INPUT** and
are **OUT OF SCOPE** for this change. WU3-WU5 below MUST NOT resolve them — they preserve
CURRENT React observable behavior for these fields, changing ONLY wire-format (id-869), cache,
and auto-init:
- [ ] Order/expense: React revives `createdDate`/`updatedDate` as `Date`; Angular revives neither
      (only `date`). NOT changed in WU3/WU5.
- [ ] SaleCredit: Angular unconditionally revives `paidDate` (null → epoch) and a nonexistent
      `paymentDate` field. NOT replicated or fixed in WU4 — untouched.
- [ ] Order/expense: Angular normalizes `isCredit ??= false` / `paymentType ??= Efectivo` on read;
      React lacks this. NOT added in WU3/WU5.
- [x] Sync orchestration divergence (generic `upsert`/`save` + inline name-guard vs Angular's
      `addImported*`/`updateImported*`): preserved as-is in WU6 — separate change, not this one.
      RESOLVED (2026-07-14) in the dedicated sync-import-parity changes, not here: `sync/routes/import.tsx`
      now constructs the real domain repos/services (`ProductRepository`/`ProductCategoryRepository`/
      `OrderOfflineService`/`ExpenseOfflineService`/`SaleCreditOfflineService`) and
      `data-synchronizer-service.ts` routes every import through `addImported*`/`updateImported*`
      (category repo L273-274, product repo L317-318; order/credit carry their narrow merge + paid-guard),
      never a generic upsert/save shim. Closed via `product-sync-import-validation-parity`,
      `order-sync-import-parity`, `salecredit-sync-import-parity`.

Do not silently resolve any of the above while implementing WU1-WU7. If a task below appears to
require touching one of these, STOP and re-open with the user instead of assuming.

## WU1: Inline `product-repository.ts` — Req: Product Repository Wire Format, Cache, Auto-Init

Target: `frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-repository.ts`.
Angular: `product.repository.ts:36-40` (`getStorageProductsMap`/cache), no date revival.

- [x] 1.1 RED: in `__tests__/product-repository.test.ts`, add: (a) on-disk value at
      `lizoft.store-products-{storeId}` is Map-entries (`[[id, product], ...]`), (b) empty read
      auto-writes `[]` without throwing, (c) two reads without an intervening write hit
      `localStorage.getItem` only once (spy), (d) after a fresh instance re-reads storage,
      `createdDate`/`updatedDate` are strings, not `Date`. Run scoped `pnpm test` — confirm FAIL.
- [x] 1.2 GREEN: remove `BaseRepository` import/field; add private `products: Map<string,Product>
      | null`, `lastProductsKey`, `getStorageProductsMap()` (cache reload on empty/key-change, via
      `StorageKeys.entityKey('products', storeId)`), private `setProductsLocalStorage` (Map-entries
      write), auto-init on empty read, NO date revival. Update `getById`/`save` call-sites to the
      new privates. Run scoped `pnpm test` — confirm GREEN.
- [x] 1.3 Full regression: `pnpm test` + `pnpm -C apps/web-store-pos exec tsc --noEmit` green.
- [x] 1.4 Commit: `refactor(web-store-pos): inline BaseRepository into ProductRepository (Map-entries + cache + auto-init, product.repository.ts:36-40)`.

## WU2: Inline `product-category-repository.ts` — Req: Product Category Repository Wire Format, Cache, Auto-Init

Target: `.../repositories/product-category-repository.ts`. Angular:
`product-category.repository.ts:40-45`. Same shape as WU1, key
`lizoft.store-product-categories-{storeId}`.

- [x] 2.1 RED: mirror 1.1's four assertions in `__tests__/product-category-repository.test.ts`
      (Map-entries, auto-init, cache-hit-once, no date fields to check — categories have none).
      Confirm FAIL.
- [x] 2.2 GREEN: mirror 1.2 (`categories` cache field, `lastCategoriesKey`,
      `getStorageCategoriesMap`, `setCategoriesLocalStorage`, auto-init). Confirm GREEN.
- [x] 2.3 Full regression: `pnpm test` + `tsc --noEmit` green.
- [x] 2.4 Commit: `refactor(web-store-pos): inline BaseRepository into ProductCategoryRepository (Map-entries + cache + auto-init, product-category.repository.ts:40-45)`.

## WU3: Inline `order-offline-service.ts` — code-level (no owning root spec)

Target: `.../sales/lib/services/order-offline-service.ts`. Angular:
`order-offline.service.ts:400-451` (cache/auto-init shape only — see Decision Gate for excluded
revival/normalization changes). Key `lizoft.store-orders-{storeId}`.

- [x] 3.1 RED: in `__tests__/order-offline-service.test.ts`, add: (a) on-disk value is a PLAIN
      array of order objects (not `[id, order]` pairs), (b) empty read auto-writes `[]`, (c)
      cache-hit-once across two reads, (d) `createdDate`/`updatedDate` are STILL revived to `Date`
      on a fresh instance (Decision Gate — unchanged). Confirm FAIL against current Map-entries
      output.
- [x] 3.2 GREEN: remove module-level `repo`/`BaseRepository` import; move cache into
      `OrderOfflineService` as private `orders: Order[] | null`, `lastOrdersKey`,
      `getStorageOrders()` (reload-on-empty/key-change), private `getOrdersFromLocalStorage`
      (plain-array parse, revive `date`+`createdDate`+`updatedDate` — SAME fields as today, no
      more/less), `setOrdersLocalStorage` (plain-array write), auto-init `[]`. Replace
      `repo.upsert`/`repo.getById` call-sites (`create`, `update`, `activateOrder`, `deactivate`)
      with array push (create) / find-and-mutate + `setOrdersLocalStorage` (update paths). Confirm
      GREEN.
- [x] 3.3 Full regression: `pnpm test` + `tsc --noEmit` green.
- [x] 3.4 Commit: `refactor(web-store-pos): inline BaseRepository into OrderOfflineService (plain-array wire-format per id-869 + cache + auto-init; revival/normalization unchanged, decision pending)`.

## WU4: Inline `sale-credit-offline-service.ts` — code-level (no owning root spec)

Target: `.../sales/lib/services/sale-credit-offline-service.ts`. Angular:
`sale-credit-offline.service.ts:285-302` (cache/auto-init shape only — SaleCredit revival bugs
excluded, see Decision Gate). Key `lizoft.store-saleCredits-{storeId}`.

- [x] 4.1 RED: mirror 3.1: plain-array on-disk, auto-init `[]`, cache-hit-once, AND
      `date`/`paidDate`/`createdDate`/`updatedDate` still revived to `Date` on a fresh instance
      exactly as today (no `paymentDate` field added — Decision Gate). Confirm FAIL.
- [x] 4.2 GREEN: mirror 3.2 (`saleCredits` cache field, `lastSaleCreditsKey`,
      `getSaleCreditsFromLocalStorage`/`setSaleCreditsLocalStorage`, plain-array, auto-init, SAME
      revival field set as today). Replace `repo.upsert`/`repo.getById` call-sites
      (`createSaleCredit`, `updateSaleCredit`, `paidSaleCredit`, `deleteSaleCredit`,
      `addImportedSaleCredit`, `updateImportedSaleCredit`). Confirm GREEN.
- [x] 4.3 Full regression: `pnpm test` + `tsc --noEmit` green.
- [x] 4.4 Commit: `refactor(web-store-pos): inline BaseRepository into SaleCreditOfflineService (plain-array wire-format per id-869 + cache + auto-init; revival bugs unchanged, decision pending)`.

## WU5: Inline `expense-offline-service.ts` — code-level (no owning root spec)

Target: `frontend-react/apps/web-store-pos/app/expenses/lib/services/expense-offline-service.ts`.
Angular: `expense-offline.service.ts:173-224` (cache/auto-init shape only). Key
`lizoft.store-expenses-{storeId}`.

- [x] 5.1 RED: mirror 3.1: plain-array on-disk, auto-init `[]`, cache-hit-once, `date`/
      `createdDate`/`updatedDate` still revived exactly as today (no `paymentType` normalization
      added — Decision Gate). Confirm FAIL.
- [x] 5.2 GREEN: mirror 3.2 (`expenses` cache field, `lastExpensesKey`,
      `getExpensesFromLocalStorage`/`setExpensesLocalStorage`, plain-array, auto-init, SAME
      revival fields). Replace `repo.upsert`/`repo.getById` call-sites (`create`, `update`,
      `deleteExpense`, `addImportedExpense`, `updateImportedExpense`). Confirm GREEN.
- [x] 5.3 Full regression: `pnpm test` + `tsc --noEmit` green.
- [x] 5.4 Commit: `refactor(web-store-pos): inline BaseRepository into ExpenseOfflineService (plain-array wire-format per id-869 + cache + auto-init; normalization unchanged, decision pending)`.

## WU6: Sync re-home — Req: Sync-Local Storage Shim Replaces Shared Base Repository

Targets: new `frontend-react/apps/web-store-pos/app/sync/lib/storage/sync-repo-shims.ts` +
`sync/routes/import.tsx`. Preserves `DataSynchronizerService`'s existing
`NameUniqueRepo`/`GenericUpsertRepo` orchestration UNCHANGED (re-home only).

- [x] 6.1 RED: new `sync/lib/storage/__tests__/sync-repo-shims.test.ts` asserting: (a) category/
      product shim's `getAll`/`upsert`/`save` read/write Map-entries at the SAME keys as WU1/WU2
      (`lizoft.store-products-`, `lizoft.store-product-categories-`), (b) order/saleCredit shim's
      `getAll`/`upsert` read/write PLAIN-array at the SAME keys as WU3/WU4
      (`lizoft.store-orders-`, `lizoft.store-saleCredits-`) while still exposing a `Map` to the
      synchronizer (internal array↔Map conversion), (c) no shim imports `BaseRepository`. Confirm
      FAIL (file doesn't exist yet).
- [x] 6.2 GREEN: implement `sync-repo-shims.ts` — `makeCategoryRepoShim`/`makeProductRepoShim`
      (`NameUniqueRepo`, Map-entries passthrough) and `makeOrderRepoShim`/`makeSaleCreditRepoShim`
      (`GenericUpsertRepo`, plain-array↔Map conversion). Update `import.tsx`: remove
      `BaseRepository` import + the 4 `new BaseRepository<...>()` calls, construct the 4 shims
      instead, pass unchanged to `DataSynchronizerService`. Confirm GREEN.
- [x] 6.3 Integration: existing `data-synchronizer-service.test.ts` unchanged/green (orchestration
      untouched); add one round-trip test confirming a category import merge leaves
      `lizoft.store-product-categories-{storeId}` in Map-entries form readable by
      `ProductCategoryRepository`, and an order import merge leaves
      `lizoft.store-orders-{storeId}` in plain-array form readable by `OrderOfflineService`.
- [x] 6.4 Full regression: `pnpm test` + `tsc --noEmit` green.
- [x] 6.5 Commit: `refactor(web-store-pos): re-home sync import storage via sync-local shims (no BaseRepository, orchestration unchanged)`. Commit `355b31b`.

## WU7: Delete `base-repository.ts` — Req: No Shared Repository Base Class

Only after WU1-WU6 are committed and green.

- [x] 7.1 Verify: `rg "BaseRepository" frontend-react/apps/web-store-pos/app` returns ZERO
      matches outside `shared/lib/storage/base-repository.ts` and its test. If any remain, STOP —
      do not delete.
- [x] 7.2 Delete `shared/lib/storage/base-repository.ts` and
      `shared/lib/storage/__tests__/base-repository.test.ts`.
- [x] 7.3 Full regression: `pnpm test` + `tsc --noEmit` green;
      `pnpm -C packages/domain build` only if a `@store-mgmt/domain` export changed (not expected).
- [x] 7.4 Commit: `refactor(web-store-pos): delete BaseRepository (React invention, no Angular correlate — rule 12)`. Commit `54c33a3`.

## Final Gate

- [x] F.1 `pnpm test` full suite green. (1564/1564)
- [x] F.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` green.
- [x] F.3 `rg "BaseRepository"` in `frontend-react/` returns zero matches (file deleted) — the
      class definition file is gone; remaining hits are comments/docstrings/test-describe
      strings only (no live import/instantiation), same posture the tasks phase anticipated.
- [x] F.4 Each of WU1-WU7 is its own commit on `feat/frontend-parity-audit`, independently
      revertible in reverse order. (`b1d5d9a`, `638ccad`, `25e99f9`, `a11d4d9`, `3bb8b86`,
      `355b31b`, `54c33a3`)
- [x] F.5 Decision-Gate items confirmed UNTOUCHED (no silent fix-vs-replicate resolution slipped
      into WU3-WU6). WU6 shim revival fields intentionally mirror the OLD `BaseRepository`
      dateFields config exactly (products: createdDate/updatedDate; orders:
      date/createdDate/updatedDate; saleCredits: date/paidDate/createdDate/updatedDate) —
      zero behavior change to the sync path.
- [x] F.6 Spec deltas (`specs/product-service/spec.md`, `specs/sync/spec.md`) match shipped code.
- [x] F.7 Ready for `sdd-verify` against both spec deltas.
