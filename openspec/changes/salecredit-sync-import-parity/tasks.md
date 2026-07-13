# Tasks: SaleCredit Sync-Import Parity (paid-guard merge)

Change: `salecredit-sync-import-parity`. Delivery: commits-only on
`feat/frontend-parity-audit`, NO chained PR, NO size:exception (settled — see Review
Workload Forecast). Test runner: `npx turbo run test`. Strict TDD: every production
edit is preceded by a failing (RED) test/compile step in the SAME or immediately prior
task.

Spec: `openspec/changes/salecredit-sync-import-parity/specs/sync/spec.md` (engram
`sdd/salecredit-sync-import-parity/spec`, obs #1060).
Design: `openspec/changes/salecredit-sync-import-parity/design.md` (engram
`sdd/salecredit-sync-import-parity/design`, obs #1061).

Files touched:
- `frontend-react/apps/web-store-pos/app/sync/lib/services/data-synchronizer-service.ts`
- `frontend-react/apps/web-store-pos/app/sync/lib/services/__tests__/data-synchronizer-service.test.ts`
- `frontend-react/apps/web-store-pos/app/sync/lib/storage/sync-repo-shims.ts`
- `frontend-react/apps/web-store-pos/app/sync/lib/storage/__tests__/sync-repo-shims.test.ts`
- `frontend-react/apps/web-store-pos/app/sync/routes/import.tsx`
- `frontend-react/apps/web-store-pos/app/sync/routes/__tests__/import-no-write.test.ts` (UNDISCOVERED
  ripple, found only via `npx turbo run typecheck` after WU1+WU2 landed — this file's
  `T1.5` describe block also constructs `DataSynchronizerService` directly with
  `makeNoopGenericRepo<SaleCredit>()` as ctor param 7; neither design.md §6.2 nor this
  tasks.md enumerated it. Fixed the same way as the other ripple files: swapped for a
  noop `SaleCreditImportService` object, dropped the now-unused `SaleCredit` type import.)

## Apply Status — DONE (2026-07-13)

All 7 tasks (1.1-1.3, 2.1-2.3) complete, single atomic commit
`de7c9c7 feat(sync): route sale-credit import through offline service, recover
paid-guard (parity)` on `feat/frontend-parity-audit`. Full gates green: `npx turbo run
test` (117 files / 1621 tests), `npx turbo run typecheck`, `npx turbo run build`.
Working tree clean (only the pre-existing untracked `openspec/changes/
salecredit-sync-import-parity/` docs remain, per convention — archived separately).

---

## Work Unit 1 — Synchronizer service + tests (parity core, RED-first)

Sequential (each task depends on the previous). Satisfies spec requirement "Sale
Credit Sync-Import Routes Through Offline Service With Paid-Guard Partial-Merge"
(obs #1060) end-to-end at the synchronizer-service layer.

### [x] 1.1 [RED] Flip `data-synchronizer-service.test.ts` test infra + existing assertions to the not-yet-existing `SaleCreditImportService`

- Import `SaleCreditImportService` as a type from
  `~/sync/lib/services/data-synchronizer-service` (does not exist yet → compile RED).
- Add `makeSaleCreditImportServiceMock(initial)` mirroring
  `makeExpenseImportServiceMock` (design §6.1), with `updateImportedSaleCredit`
  replicating the real paid-guard (overwrite `paid`/`isPaid`/`paidDate` only when
  `!existing.paid`; always overwrite `isActive`/`client`/`note`/`updatedDate`/
  `updatedByName`).
- `makeService()` (currently :254-278): replace
  `saleCreditRepo = makeGenericRepo<SaleCredit>(...)` with
  `saleCreditService = makeSaleCreditImportServiceMock(...)`; update the ctor call and
  the returned handle name; update all destructuring call-sites (`:819`, `:946-947`,
  `:984`).
- Ordering test (currently :353-366): replace the inline
  `saleCreditRepo: GenericUpsertRepo<SaleCredit>` object with a
  `SaleCreditImportService` literal whose `addImportedSaleCredit` pushes
  `'saleCredit:' + item.id` (write-order assertion unchanged).
- `SaleCreditsUnexpectedError` test (currently :818-829): trigger becomes
  `saleCreditService.addImportedSaleCredit = () => { throw ... }` (obtained from
  `makeService()`'s new `saleCreditService` handle) instead of
  `saleCreditRepo.upsert`.
- "does NOT call any repo write methods" test (currently :945-990): replace
  `saleCreditRepo.upsert = () => { writes++; }` with both
  `saleCreditService.addImportedSaleCredit` and `saleCreditService
  .updateImportedSaleCredit` each incrementing `writes` (mirrors the expense-service
  pair already in that test).
- All raw-ctor positional-arg call sites still passing `makeGenericRepo<SaleCredit>()`
  as param 7 (currently :417, :462, :511, :557, :1022, :1069): swap to
  `makeSaleCreditImportServiceMock()`.
- Run tests: expect compile failure / RED (type doesn't exist, mock shape mismatches
  ctor param 7 which is still `GenericUpsertRepo<SaleCredit>`).

**Spec link**: obs #1060, all 4 scenarios under "Sale Credit Sync-Import Routes
Through Offline Service With Paid-Guard Partial-Merge" (infra prerequisite).
**Parallel/Sequential**: sequential — must land before 1.2.

### [x] 1.2 [RED] Add 4 new paid-guard assertions (new `describe` block, e.g. "T9 — sale-credit import routes through the offline service (Angular parity) + paid-guard")

New tests, still RED (production untouched):
1. **paid-guard preserves paid fields**: existing local credit `paid>0, isPaid:true,
   paidDate:set`; import same id with `paid:0, isPaid:false, paidDate:null` + changed
   `client`/`note`. Assert final record keeps original `paid`/`isPaid`/`paidDate` but
   takes imported `client`/`note`/`updatedDate`/`updatedByName`. Merge count
   `{updated:1}`.
2. **unpaid existing updates fully**: existing local credit `paid:0, isPaid:false`;
   import a paid version of the same id. Assert `paid`/`isPaid`/`paidDate` ARE
   overwritten (guard does not fire).
3. **new credit adds**: import a credit whose id is absent from storage. Assert
   `addImportedSaleCredit` was called (not update); merge count `{inserted:1}`.
4. **SaleCreditsUnexpectedError on failure via the service** (if not already fully
   covered by 1.1's flipped test — confirm code `Synchronizer.SaleCreditsUnexpectedError`
   asserted against the new mock trigger).

**Spec link**: obs #1060, scenarios "Update to an unpaid existing credit overwrites
all fields", "Update to a paid existing credit preserves payment fields (paid-guard)",
"New sale credit is added via the service", "Unexpected failure surfaces the
sale-credit error code".
**Parallel/Sequential**: sequential — depends on 1.1's mock; still RED until 1.3.

### [x] 1.3 [GREEN] Production: add `SaleCreditImportService` seam + `mergeSaleCreditsViaService` + ctor/wiring swap in `data-synchronizer-service.ts`

- Add `SaleCredit` to the top-level `import type` (line 2, alongside `Expense`,
  `InventoryEntry`, `Product`, `ProductCategory`).
- Add exported `SaleCreditImportService` interface (3 methods:
  `getStorageSaleCredits(): SaleCredit[]`, `addImportedSaleCredit(sc): Result`,
  `updateImportedSaleCredit(sc): Result`) next to `ExpenseImportService`, per design
  §3.1 (with the parity doc-comment).
- Add private `mergeSaleCreditsViaService(incoming: SaleCredit[]): MergeOutcome` —
  1:1 structural mirror of `mergeExpensesViaService` (design §3.2): seed map from
  `getStorageSaleCredits()`, add-vs-update by id, early-return on
  `!result.succeeded`, break-only (no revert), catch → `SaleCreditsUnexpectedError`.
- Swap ctor param 7 (currently line 182):
  `saleCreditRepo: GenericUpsertRepo<...SaleCredit>` →
  `saleCreditService: SaleCreditImportService`.
- Swap `sync()` step 6 (currently lines 218-227): replace
  `mergeBreakOnly('saleCredits', this.saleCreditRepo, data.saleCredits, ...)` with
  `mergeSaleCreditsViaService(data.saleCredits)`.
- `GenericUpsertRepo` and `mergeBreakOnly` STAY (Orders still use them, param 5).
- Run tests: 1.1 + 1.2 assertions turn GREEN. Confirm existing untouched tests (T2
  category/product revert, T3 break-only, T4 merge-count, T5 empty-data, T7 expense
  service routing, T8 inventory service routing) stay green.

**Spec link**: obs #1060, full requirement + all 4 scenarios; also satisfies the
MODIFIED "Sync Import Routes Through Domain Repositories" scenario "Sale-credit
merge routes through the service, not the shim" (partially — full closure needs 2.x).
**Parallel/Sequential**: sequential — closes out WU1; depends on 1.1/1.2 being RED
first.

---

## Work Unit 2 — Route wiring + shim retirement

Sequential (2.1 must precede 2.2/2.3 for compile ordering: production ctor type at
`import.tsx`'s call site already expects `SaleCreditImportService` after WU1, so
`import.tsx` is already broken until this WU lands — do WU1 and WU2 as adjoining
commits, do not leave WU1 alone on `main`/shared state for long).

### [x] 2.1 [RED→GREEN] `import.tsx`: reuse `creditSvc`, drop the shim

- Delete line `const saleCreditRepo = makeSaleCreditRepoShim();` (currently line 80).
- In the `DataSynchronizerService` ctor call (currently lines 82-90), replace the
  `saleCreditRepo` argument with the existing `creditSvc` instance (already
  constructed at line 47 for the serializer's read side — mirrors `expenseSvc`, no
  second instance).
- Remove `makeSaleCreditRepoShim` from the
  `import { makeOrderRepoShim, makeSaleCreditRepoShim } from '~/sync/lib/storage/sync-repo-shims'`
  import (currently line 10) — keep `makeOrderRepoShim`.
- No dedicated unit test exists for `import.tsx`'s `handleImport` wiring; correctness
  is proven by 1.3's synchronizer tests (mock-level) plus 2.3's sync-repo-shims
  integration test (shim-level). Verify via `npx turbo run test` + a manual/tsc
  compile check (`tsc --noEmit` or the project's typecheck script) since this file
  has no direct spec covering the wiring line itself.

**Spec link**: obs #1060, "Sync-Local Storage Shim Replaces Shared Base Repository"
— scenario "No BaseRepository import in the sync module" (transitively; also closes
"Sale-credit merge routes through the service, not the shim").
**Parallel/Sequential**: sequential — must land in the same commit/PR-less-push as
2.2/2.3 to keep the tree compiling.

### [x] 2.2 [RED] `sync-repo-shims.test.ts`: remove/flip the salecredit-specific shim tests

- Remove the 2 salecredit-only shim-behavior tests (currently lines 97-118: "saleCredit
  shim upsert persists a PLAIN array...", "saleCredit shim getAll exposes a Map keyed
  by id..."). These test a factory that will no longer exist.
- Update the "no BaseRepository" test (currently lines 59-63) to only iterate
  `[makeOrderRepoShim]` (drop `makeSaleCreditRepoShim` from the array).
- Update the WU2 integration test ("an order import merge leaves ...", currently
  lines 168-197): replace the ctor's param-7 argument `makeSaleCreditRepoShim()`
  (line 176) with a noop `SaleCreditImportService` object literal (mirrors the
  existing `noopExpenseService`/`noopInventoryService` pattern in that file, lines
  145-154) since the ctor signature changed in WU1.
- Remove the `makeSaleCreditRepoShim` import (currently line 4, alongside
  `makeOrderRepoShim`) and the now-unused `SaleCredit` type import if nothing else in
  the file needs it (still needed — `makeSaleCredit` factory function at line 34
  uses it; keep the type import, drop only the factory import).
- Run tests: RED until 2.3 removes the export (mismatched types / stale references
  would otherwise mask the retirement).

**Spec link**: obs #1060, "Sync-Local Storage Shim Replaces Shared Base Repository"
scenario "makeSaleCreditRepoShim no longer exists"; "Sync Shim Wire-Format Parity
Per Entity" scenario "Sale credits remain plain-array via the service, not a shim".
**Parallel/Sequential**: sequential — depends on 2.1 landing (ctor signature must
already be the new type); precedes 2.3.

### [x] 2.3 [GREEN] `sync-repo-shims.ts`: retire `makeSaleCreditRepoShim`

- Delete the `makeSaleCreditRepoShim` function (currently lines 73-81).
- Drop `SaleCredit` from the file's type imports (currently line 2:
  `import type { Order, SaleCredit } from '@store-mgmt/domain';` → `Order` only).
- Update the module doc comment (currently lines 14-19): "scoped to Orders/SaleCredits
  ONLY" → "scoped to Orders ONLY".
- **KEEP** `makeGenericUpsertRepoShim` (still backs `makeOrderRepoShim`) and
  `makeOrderRepoShim` itself (Fase 6/Order needs them) — do not touch.
- Run tests: 2.2's flipped/removed assertions turn GREEN; full sync suite green.

**Spec link**: obs #1060, "Sync-Local Storage Shim Replaces Shared Base Repository"
scenario "makeSaleCreditRepoShim no longer exists" (closes it).
**Parallel/Sequential**: sequential — final task, closes WU2.

---

## Task Dependency Summary

```
1.1 (RED, test infra) ──► 1.2 (RED, new paid-guard tests) ──► 1.3 (GREEN, production)
                                                                     │
                                                                     ▼
                                            2.1 (import.tsx wiring, same-commit dependency)
                                                                     │
                                                                     ▼
                                     2.2 (RED, sync-repo-shims.test.ts flip) ──► 2.3 (GREEN, retire shim)
```

All tasks are sequential — no safe parallelization. Each task in WU1 touches the same
file (`data-synchronizer-service.test.ts` then `data-synchronizer-service.ts`); WU2's
three tasks touch three different files but are causally chained by the ctor-signature
change (2.1 and 2.2 both assume the WU1 signature already landed; 2.3 is the only task
that can be deferred slightly, but leaving the shim's dead export around after 2.2
flips its tests is a code-smell, not a functional risk — recommend same-session
close-out per design §8 "may collapse to a single commit").

## Commit Plan (commits-only, `feat/frontend-parity-audit`)

Per design §8, WU1/WU2 may collapse into a single commit or split into two:
- **Commit A** (WU1, tasks 1.1-1.3): synchronizer service + full test flip + new
  paid-guard tests. Self-contained, fully unit-tested, buildable in isolation
  EXCEPT `import.tsx`/`sync-repo-shims.ts` will fail typecheck against the new ctor
  param-7 type until Commit B lands — acceptable only if both commits land in the
  same push before any CI gate; otherwise collapse to one commit.
- **Commit B** (WU2, tasks 2.1-2.3): route wiring + shim retirement.

Given the tight compile coupling (ctor signature change spans both WUs), the
DEFAULT recommendation is **one single commit** covering 1.1 through 2.3. Split only
if a mid-review checkpoint is explicitly wanted.

## Review Workload Forecast

- **Estimated changed lines**: ~30-40 production lines (design estimate) + test
  ripple (~6 existing assertions flipped, ~4 new assertions added, ~4 shim tests
  removed/flipped) ≈ 150-220 total diff lines across 5 files.
- **File count**: 5 (`data-synchronizer-service.ts`,
  `data-synchronizer-service.test.ts`, `sync-repo-shims.ts`,
  `sync-repo-shims.test.ts`, `import.tsx`).
- **400-line budget risk**: Low. Well under the 400-line threshold even
  un-collapsed.
- **Chained PRs recommended**: No — delivery is commits-only on
  `feat/frontend-parity-audit` (settled, no PRs at all; see
  `delivery-commits-only-on-feature-branch` convention).
- **size:exception needed**: No.
- **Decision needed before apply**: No — no decision gates, no bug-vs-replicate
  judgment (spec + design already resolved all ADRs).
