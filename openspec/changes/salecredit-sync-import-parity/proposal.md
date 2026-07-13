# Proposal: SaleCredit Sync-Import Parity (paid-guard merge)

## Intent

SaleCredit sync-import bypasses its offline service. Angular's `synchronizeSaleCredits`
(`data-synchronizer.service.ts:234-264`) routes each imported credit through
`saleCreditService.addImportedSaleCredit`/`updateImportedSaleCredit`, whose update carries a
**paid-guard** — it only overwrites `paid/isPaid/paidDate` when `!existing.paid`. React's
`import.tsx:80` instead builds `saleCreditRepo` via `makeSaleCreditRepoShim` (naive
`all.set(id, item)` full overwrite, no guard), routed through the generic `mergeBreakOnly`
(`data-synchronizer-service.ts:222-225`). Real bug: importing an older/unpaid synced credit
clobbers a locally-paid credit's payment fields. Expense and Inventory are already correctly
wired through their offline services; this closes the sole remaining Fase 5 gap. Directly
analogous to `product-sync-import-validation-parity` (Fase 3), smaller, no decision gates.

## Scope

### In Scope
- Add `mergeSaleCreditsViaService` to `DataSynchronizerService`, a 1:1 mirror of the shipped
  `mergeExpensesViaService` (`:376-420`): seed from `getStorageSaleCredits()`, route add-vs-update
  through the service, break-only on first non-`succeeded` Result, emit the existing
  `SaleCreditsUnexpectedError` on throw.
- Swap ctor param 7 from `saleCreditRepo: GenericUpsertRepo<SaleCredit>` to the offline service;
  change sync step 6 to call the new method instead of `mergeBreakOnly`.
- Wire `import.tsx` to pass the `SaleCreditOfflineService` instance instead of
  `makeSaleCreditRepoShim()`.
- Retire `makeSaleCreditRepoShim` (`sync-repo-shims.ts:73-79`); keep the generic helper and
  `makeOrderRepoShim` (Order still uses them).
- Update sync tests asserting the old shim full-overwrite to assert the paid-guard partial-merge.

### Out of Scope
- Expense and Inventory routing (already correct).
- SaleCredit/Expense core method + call-site parity (already shipped via
  `service-return-shape-parity`).
- Order sync-import shim (Fase 6) and aggregation-removal work.
- Cosmetic sibling divergences (naming, `public` vs `private` on `getActive...BetweenDates`).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `sync`: sale-credit sync-import merge routes through the offline service with the
  paid-guard partial-merge, replacing the shim full-overwrite.

## Approach

Replicate the already-shipped Expense pattern verbatim for SaleCredit (Rule 12 — no new
abstraction; offline methods, error code, and storage accessor all already exist). Mirror
Angular's `synchronizeSaleCredits` control flow: add-vs-update decision, paid-guard inside the
service, break-only with no revert. Then rewire `import.tsx` and delete the now-dead shim.

## Decision Gates

**None.** This is a rule-7/rule-10 orchestration parity fix, not a bug-vs-replicate judgment.
The offline service methods (`addImportedSaleCredit`/`updateImportedSaleCredit`),
`getStorageSaleCredits`, and `SaleCreditsUnexpectedError` all already exist and are tested — no
ambiguity found requiring ratification.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `sync/lib/services/data-synchronizer-service.ts` | Modified | New `mergeSaleCreditsViaService`; ctor param + step 6 swap |
| `sync/routes/import.tsx` | Modified | Pass offline service instead of shim |
| `sync/lib/storage/sync-repo-shims.ts` | Removed | Delete `makeSaleCreditRepoShim` |
| `sync/lib/services/__tests__/*` | Modified | Assert paid-guard instead of full-overwrite |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sync test ripple (existing shim-overwrite assertions break) | Med | Update to paid-guard assertions; part of scope |
| Paid-guard correctness (guard direction, field set) | Low | Method already ported + tested; mirror Angular exactly |
| Ctor signature change breaks other call-sites | Low | `import.tsx` is the sole constructor call-site |

## Rollback Plan

Single-commit revert on `feat/frontend-parity-audit`. Restore the `makeSaleCreditRepoShim`
factory, ctor param, step-6 `mergeBreakOnly` call, and `import.tsx` wiring; revert test changes.

## Dependencies

- None. `SaleCreditOfflineService.addImportedSaleCredit/updateImportedSaleCredit` already shipped.

## Success Criteria

- [ ] Sync-import routes salecredits through `SaleCreditOfflineService`, not the shim.
- [ ] Importing an unpaid record over a locally-paid credit preserves `paid/isPaid/paidDate`.
- [ ] `makeSaleCreditRepoShim` removed; generic helper + Order shim intact.
- [ ] Sync tests assert paid-guard behavior; suite green.
