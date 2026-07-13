# Design: SaleCredit Sync-Import Parity (paid-guard merge)

Change: `salecredit-sync-import-parity` — Fase 5 (credits/expenses), final gap.
Delivery: commits-only on `feat/frontend-parity-audit`. Artifact store: hybrid.

## 1. Context & Goal

Angular `synchronizeSaleCredits` (`frontend/.../data-synchronizer.service.ts:234-264`)
routes each imported credit through the offline SERVICE
(`saleCreditService.addImportedSaleCredit` / `updateImportedSaleCredit`). The update
carries a **paid-guard**: it overwrites `paid` / `isPaid` / `paidDate` ONLY when the
existing local record is unpaid (`!saleCredit.paid`,
`sale-credit-offline.service.ts:266-270`).

React currently bypasses that service. `import.tsx:80` builds `saleCreditRepo` via
`makeSaleCreditRepoShim()` (naive full-overwrite, no guard) and step 6 of
`DataSynchronizerService.sync` routes it through the generic `mergeBreakOnly`
(`data-synchronizer-service.ts:220-227`). Real bug: importing an older/unpaid synced
credit clobbers a locally-paid credit's payment fields.

The correct pattern already ships for Expense (`mergeExpensesViaService:376-420`) and
Inventory (`mergeInventoryBreakOnly:426-482`). This change replicates the Expense
pattern verbatim for SaleCredit. NO new architecture (Rule 12): the offline methods,
the `SaleCreditsUnexpectedError` code, and the `getStorageSaleCredits()` accessor all
already exist and are tested.

## 2. Architecture Approach

Mirror the shipped **Expense sync-import wiring** exactly. There are five moving parts,
each a 1:1 analog of what Expense already has:

| Concern | Expense (shipped, the template) | SaleCredit (this change) |
|---|---|---|
| Injected seam | `ExpenseImportService` (:133-137) | new `SaleCreditImportService` |
| Merge method | `mergeExpensesViaService` (:376-420) | new `mergeSaleCreditsViaService` |
| Ctor param | `expenseService: ExpenseImportService` (:181) | swap param 7 to `saleCreditService: SaleCreditImportService` |
| `sync()` step | step 5 → `mergeExpensesViaService` (:216) | step 6 → `mergeSaleCreditsViaService` (replaces `mergeBreakOnly`) |
| Route wiring | passes `expenseSvc` instance (import.tsx:88) | pass `creditSvc` instance (already built at import.tsx:47) |

No layering change, no new abstraction. The synchronizer keeps ORCHESTRATING
(add-vs-update decision + counts + break/error); the offline service OWNS the
field-level merge and the paid-guard.

## 3. Component Design

### 3.1 New seam: `SaleCreditImportService` (data-synchronizer-service.ts)

Add next to `ExpenseImportService`, structurally identical (3 methods). `SaleCredit`
must be added to the top-level `import type` on line 2 (currently inline-imported in
the ctor).

```ts
/**
 * SaleCredit import routes through the offline SERVICE, not the raw repo — Angular parity:
 * `data-synchronizer.service.ts` `synchronizeSaleCredits` (:234-264) calls
 * `saleCreditService.addImportedSaleCredit` / `updateImportedSaleCredit` (the domain-command
 * layer), never the repository directly. The service's `updateImportedSaleCredit` owns the
 * PAID-GUARD (overwrites paid/isPaid/paidDate only when the existing record is unpaid),
 * which the retired shim's full-overwrite dropped.
 */
export interface SaleCreditImportService {
  getStorageSaleCredits(): SaleCredit[];
  addImportedSaleCredit(saleCredit: SaleCredit): Result;
  updateImportedSaleCredit(saleCredit: SaleCredit): Result;
}
```

The real `SaleCreditOfflineService`
(`app/sales/lib/services/sale-credit-offline-service.ts:39,343,358`) already satisfies
this structurally — `getStorageSaleCredits(): SaleCredit[]`, `addImportedSaleCredit`,
`updateImportedSaleCredit` (with paid-guard at :366-370) are all present.

### 3.2 New method: `mergeSaleCreditsViaService`

1:1 structural mirror of `mergeExpensesViaService`, substituting entity `'saleCredits'`,
the `saleCreditService` field, and `SaleCreditsUnexpectedError`. Same seed-map,
add-vs-update, early-return-on-failure, break-only (no revert), catch → unexpected error.

```ts
/**
 * Mirrors Angular `data-synchronizer.service.ts` `synchronizeSaleCredits` (:234-264): builds a
 * map of stored credits, then routes each imported credit through the SERVICE —
 * `addImportedSaleCredit` when new, `updateImportedSaleCredit` (paid-guard) when it already
 * exists — breaking on the first non-succeeded Result. Break-only (no revert); an unexpected
 * throw yields `SaleCreditsUnexpectedError` (Angular's copy-paste OrdersUnexpectedError bug
 * stays fixed here).
 */
private mergeSaleCreditsViaService(incoming: SaleCredit[]): MergeOutcome {
  if (incoming.length === 0) {
    return { merge: { entity: 'saleCredits', inserted: 0, updated: 0 } };
  }

  let inserted = 0;
  let updated = 0;

  try {
    const existing = new Map(
      this.saleCreditService.getStorageSaleCredits().map((c) => [c.id, c]),
    );
    for (const credit of incoming) {
      const isNew = !existing.has(credit.id);
      if (isNew) {
        existing.set(credit.id, credit);
        inserted++;
      } else {
        updated++;
      }
      const result = isNew
        ? this.saleCreditService.addImportedSaleCredit(credit)
        : this.saleCreditService.updateImportedSaleCredit(credit);
      if (!result.succeeded) {
        return {
          merge: { entity: 'saleCredits', inserted, updated },
          error: {
            entity: 'saleCredits',
            code: SynchronizerErrors.SaleCreditsUnexpectedError.code,
            message: SynchronizerErrors.SaleCreditsUnexpectedError.message,
          },
        };
      }
    }
    return { merge: { entity: 'saleCredits', inserted, updated } };
  } catch {
    // Break-only: no revert — writes already applied before the failure persist.
    return {
      merge: { entity: 'saleCredits', inserted, updated },
      error: {
        entity: 'saleCredits',
        code: SynchronizerErrors.SaleCreditsUnexpectedError.code,
        message: SynchronizerErrors.SaleCreditsUnexpectedError.message,
      },
    };
  }
}
```

Note on counts: `inserted`/`updated` reflect the add-vs-update DECISION (identical to
Expense). The paid-guard is inside `updateImportedSaleCredit` and does not affect
counts — an update is counted as an update whether or not the guard fires.

### 3.3 Constructor change

Swap ctor param 7 (`data-synchronizer-service.ts:182`):

```ts
// FROM:
private readonly saleCreditRepo: GenericUpsertRepo<import('@store-mgmt/domain').SaleCredit>,
// TO:
private readonly saleCreditService: SaleCreditImportService,
```

`GenericUpsertRepo` STAYS defined (Orders still use it). `SaleCredit`'s inline import
in this signature is removed once the top-level import is added.

### 3.4 `sync()` step-6 wiring swap (data-synchronizer-service.ts:218-227)

```ts
// FROM: push(this.mergeBreakOnly('saleCredits', this.saleCreditRepo, data.saleCredits,
//         SynchronizerErrors.SaleCreditsUnexpectedError));
// TO:
push(this.mergeSaleCreditsViaService(data.saleCredits));
```

`mergeBreakOnly` STAYS (Orders step 4 still uses it).

### 3.5 Route wiring: import.tsx:80-89

`creditSvc = new SaleCreditOfflineService(storeId)` is ALREADY constructed at
`import.tsx:47` for the serializer's read side. Mirror Expense (same instance feeds
both serializer and synchronizer):

```ts
// DELETE import.tsx:80:  const saleCreditRepo = makeSaleCreditRepoShim();
// In the DataSynchronizerService ctor call (:82-90), replace `saleCreditRepo` with `creditSvc`.
```

Remove the now-unused `makeSaleCreditRepoShim` import.

### 3.6 Retire `makeSaleCreditRepoShim` (sync-repo-shims.ts:73-81)

Delete `makeSaleCreditRepoShim` and drop `SaleCredit` from the file's type imports.
**KEEP** `makeGenericUpsertRepoShim` (still backs Order) and `makeOrderRepoShim`
(Fase 6). Update the file's module doc comment: it currently says "scoped to
Orders/SaleCredits ONLY" — narrow to "Orders ONLY".

## 4. Data Flow

```
import.tsx
  creditSvc = new SaleCreditOfflineService(storeId)   // read side (serializer) + write side (synchronizer)
        │
        └─► DataSynchronizerService(..., creditSvc)     // param 7 = SaleCreditImportService
                  │
              sync(parsedData) step 6
                  │
              mergeSaleCreditsViaService(data.saleCredits)
                  │  seed: creditSvc.getStorageSaleCredits()
                  ├─ id NOT in map ─► creditSvc.addImportedSaleCredit(credit)     // append
                  └─ id IN map     ─► creditSvc.updateImportedSaleCredit(credit)  // PAID-GUARD merge
                                          └─ overwrites paid/isPaid/paidDate ONLY if !existing.paid
```

Storage format is unchanged (plain-array under the `saleCredits` key, id-869). The
retired shim wrote the SAME key/format, so no migration and no cross-consumer breakage.

## 5. Integration Points

- **Sole ctor call-site**: `import.tsx` — no other constructor of `DataSynchronizerService`.
- **Storage key**: `StorageKeys.entityKey('saleCredits', storeId)` — identical for shim
  and `SaleCreditOfflineService`, so a merge stays readable by the sales module.
- **Error surface**: `SaleCreditsUnexpectedError` already exists (:62-65); no new code.

## 6. Test Plan

Test file: `sync/lib/services/__tests__/data-synchronizer-service.test.ts`. Strict TDD:
new assertions go RED before the production edits, GREEN after.

### 6.1 Test infra flip (mirror `makeExpenseImportServiceMock`)

- Add `makeSaleCreditImportServiceMock(initial)` mirroring
  `makeExpenseImportServiceMock:200-219`, BUT its `updateImportedSaleCredit` must
  replicate the real paid-guard so assertions are meaningful:
  ```ts
  updateImportedSaleCredit: (credit) => {
    const existing = store.get(credit.id);
    if (existing) {
      const merged = { ...existing, isActive: credit.isActive, client: credit.client,
        note: credit.note, updatedDate: credit.updatedDate, updatedByName: credit.updatedByName };
      if (!existing.paid) {
        merged.paid = credit.paid; merged.isPaid = credit.isPaid; merged.paidDate = credit.paidDate;
      }
      store.set(credit.id, merged); _imported.push(merged);
    }
    return Result.Success();
  }
  ```
- `makeService` (:267,276): replace `saleCreditRepo = makeGenericRepo<SaleCredit>(...)`
  with `saleCreditService = makeSaleCreditImportServiceMock(...)`; update the returned
  handle name and the ctor arg.

### 6.2 Existing tests that FLIP (shim-overwrite → service routing)

- **Ordering test (:353-385)** — the custom inline `saleCreditRepo` with
  `upsert: (_s, item) => writeOrder.push('saleCredit:' + item.id)` becomes a
  `SaleCreditImportService` mock whose `addImportedSaleCredit` pushes
  `'saleCredit:' + item.id`. The write-order assertion is unchanged.
- **SaleCreditsUnexpectedError test (:818-828)** — the failure trigger
  `saleCreditRepo.upsert = () => { throw }` becomes
  `saleCreditService.addImportedSaleCredit = () => { throw ... }`
  (or returns a non-succeeded Result). Same asserted code
  `Synchronizer.SaleCreditsUnexpectedError`.
- **Break-only T3 (:782-792)** and **all-6-entities / idempotent tests
  (:874-926)** — merge-count expectations (`{inserted, updated}`) are unchanged;
  they pass once the mock routes through the service. Confirm they stay green.
- Any `makeGenericRepo<SaleCredit>()` positional args in the raw-ctor tests
  (:417,462,511,557,1022,1069) swap to `makeSaleCreditImportServiceMock()`.

### 6.3 New RED tests (paid-guard behavior — the whole point)

1. **paid-guard preserves paid fields**: existing local credit `paid>0, isPaid:true,
   paidDate:set`; import an unpaid version of the same id (`paid:0, isPaid:false,
   paidDate:null`, different note/client). Assert final record keeps original
   `paid/isPaid/paidDate` but takes imported `client/note/updatedDate/updatedByName`.
   Merge count = `updated:1`.
2. **unpaid existing updates fully**: existing local credit `paid:0, isPaid:false`;
   import a paid version. Assert `paid/isPaid/paidDate` ARE overwritten (guard does
   not fire).
3. **new credit adds**: import a credit whose id is absent. Assert
   `addImportedSaleCredit` was called (not update), merge count `inserted:1`.
4. **routes through service, not shim**: assert the import path uses
   `SaleCreditImportService` methods — cover by verifying the mock's `_imported`
   records the write and that no `makeSaleCreditRepoShim` remains referenced. (Static:
   `sync-repo-shims.ts` no longer exports it; `import.tsx` no longer imports it.)

Run: strict-TDD runner (project test command). Full sync suite must stay green.

## 7. ADR-style Decisions

- **ADR-1 — Route through the offline service, not a guarded shim.**
  Replicate the shipped Expense pattern. *Rejected*: add the paid-guard inside
  `makeSaleCreditRepoShim`. That would duplicate the guard logic already living in
  `SaleCreditOfflineService.updateImportedSaleCredit`, diverge from Angular's structure
  (Angular calls the service), and keep a React-only abstraction alive (Rule 12).

- **ADR-2 — New narrow `SaleCreditImportService` seam (3 methods).**
  Mirror `ExpenseImportService`. *Rejected*: reuse `GenericUpsertRepo<SaleCredit>` —
  it cannot express the service's import methods or the paid-guard. *Rejected*: a
  shared base import interface — no Angular correlate (Rule 12).

- **ADR-3 — Reuse the `SaleCreditOfflineService` instance already built in import.tsx.**
  Same-instance for serializer read side + synchronizer write side, exactly as Expense
  does with `expenseSvc`. *Rejected*: construct a second instance — harmless but
  wasteful and diverges from the Expense template.

- **ADR-4 — Retire only `makeSaleCreditRepoShim`; keep the generic helper + Order shim.**
  Order (Fase 6) still routes through `GenericUpsertRepo` / `makeOrderRepoShim`.
  *Rejected*: delete the whole `sync-repo-shims.ts` — would break Order sync.

- **ADR-5 — Keep the fixed `SaleCreditsUnexpectedError` code.**
  Angular's copy-paste bug emits `OrdersUnexpectedError` for sale credits; React already
  fixed this (angular-bugs-policy, engram #648) and Expense follows the same fix. Stay
  consistent — do not re-introduce the bug.

## 8. Work-Unit Plan

Estimated ~30-40 prod lines + test ripple. Well under 400. Commits-only, no PR split.

- **WU1 — Synchronizer service + tests (parity core, RED-first).**
  New `SaleCreditImportService` interface, `mergeSaleCreditsViaService`, ctor param 7
  swap, step-6 wiring swap; test-infra `makeSaleCreditImportServiceMock`, flip existing
  salecredit assertions, add the 4 new paid-guard RED tests. Self-contained and fully
  unit-tested.
- **WU2 — Route wiring + shim retirement.**
  `import.tsx`: pass `creditSvc`, drop `saleCreditRepo`/`makeSaleCreditRepoShim` import.
  `sync-repo-shims.ts`: delete `makeSaleCreditRepoShim`, drop `SaleCredit` type import,
  update module doc to "Orders ONLY".

WU1 and WU2 may collapse into a single commit if preferred; kept separate for a clean
boundary between the tested logic change and the mechanical wiring/dead-code removal.

## 9. Rollback

Single-commit revert on `feat/frontend-parity-audit`: restore
`makeSaleCreditRepoShim`, ctor param 7 (`saleCreditRepo`), the step-6 `mergeBreakOnly`
call, `import.tsx` wiring, and the test assertions.

## 10. Risks / Residual Ambiguity

- **Sync test ripple (Med, in scope):** several existing salecredit assertions move from
  `GenericUpsertRepo` mocks to the service mock. Mechanical; enumerated in §6.2.
- **Mock fidelity (Low):** the new `makeSaleCreditImportServiceMock` must replicate the
  real paid-guard or the paid-guard tests would be vacuous. Guarded by §6.1 spec.
- **Paid-guard correctness (Low):** `updateImportedSaleCredit` is already ported +
  tested in the sales module; this change only routes to it.
- **No residual decision gates:** all dependencies exist; no bug-vs-replicate judgment.
