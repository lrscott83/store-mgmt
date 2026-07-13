# Proposal: Product Sync/Import Validation Parity

## Intent

Close the sole remaining Fase 3 (products) gap. Angular's `synchronizeProducts`
(`data-synchronizer.service.ts:68-98`) routes every imported product through
`ProductRepository.addImportedProduct`/`updateImportedProduct`/`updateProducts`, enforcing
category-exists, barcode-uniqueness, **per-category** name-uniqueness, and order-shift. React's
`DataSynchronizerService.mergeWithRevert` (`data-synchronizer-service.ts:238-279`) uses the
generic `makeProductRepoShim` (`sync-repo-shims.ts:103`), whose only guard is **global** name
uniqueness — no `categoryId` scoping, no barcode, no category-exists, no order-shift. This is a
genuine rule-10/rule-12 parity violation (Angular's real behavior is the fuller validation), not a
mirrored Angular bug. The favorable part: `ProductRepository.updateImportedProduct`/
`addImportedProduct`/`updateProducts` ALREADY exist in React (unit-tested, zero call-site) — the
fix is largely WIRING them into the sync flow.

## Scope

### In Scope
- Route the sync PRODUCT merge through the real `ProductRepository`, mirroring Angular
  `synchronizeProducts` (snapshot → sort by `order` → add/update per-item → break on failure →
  `updateProducts(snapshot)` revert), recovering category-exists + barcode + per-category name +
  order-shift validation.
- Retire the product path of `makeProductRepoShim`; construct a real `ProductRepository(storeId,
  new ProductCategoryRepository(storeId))` in `sync/routes/import.tsx`.
- Update sync tests that assert the weaker global-only behavior (behavior-change, not new suite).

### Out of Scope
- CATEGORIES routing (see gate A — pending ratification; default: unchanged).
- Inventory/orders/expenses/sale-credits paths (already at parity).
- Any new abstraction or base repository (rule 12).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `sync`: SUPERSEDES "Sync Import Behavior Unchanged (Re-Home Only)" (user ratified the reversal,
  state #1034) — product import now routes through `ProductRepository` for full validation parity,
  not re-home-only. Amends "Domain-Validated Import With Abort-and-Revert" with product-specific
  rules (category-exists, barcode, per-category name, order-shift).

## Approach

Follow the EXISTING React seam pattern (`InventoryImportService`/`ExpenseImportService` already
route through real service interfaces, NOT the generic `NameUniqueRepo`). Add a
`ProductImportRepo` interface (`getStorageProductsMap`/`addImportedProduct`/`updateImportedProduct`/
`updateProducts`) satisfied by the real `ProductRepository`, and a dedicated
`mergeProductsViaRepository` method that mirrors Angular `synchronizeProducts` 1:1. This is parity
with Angular's structure (synchronizer orchestrates add-vs-update+revert; repo owns validation),
not an invention.

## Decision Gates (mark-and-ask — orchestrator MUST ratify before spec/design)

- **A — Categories order-shift gap (NEW finding).** Angular ALSO routes categories through
  `ProductCategoryRepository` (`synchronizeCategories:115-119`), whose `addImportedProductCategory`/
  `updateImportedProductCategory` run `updateCategoriesOrder` (order-shift). The React category
  shim skips order-shift. The exploration validated only name-uniqueness scoping (correct: no
  sub-scoping field) — it did NOT examine order-shift. So "categories unchanged" is NOT clean:
  there is a smaller order-shift parity gap. React `ProductCategoryRepository` already has these
  methods. **Route categories too, or accept the order-shift divergence AS-IS?**
- **B — Revert snapshot semantics.** Angular passes the live, in-loop-mutated `products` reference
  to `updateProducts` on failure (snapshot captured at loop start but mutated during iteration).
  Mirror this exact quirk, or capture a true pre-import snapshot?
- **C — Existing sync tests.** Tests asserting global-only behavior (`data-synchronizer-service.
  test.ts`, `sync-repo-shims.test.ts`) — update to the corrected behavior, or are any genuinely
  right and must be preserved?
- **D — Mid-import error contract.** Product validation now rejects (barcode dup, missing category)
  mid-import with typed failures + whole-type revert. Confirm the surfaced error codes/shape match
  Angular's `Result.Failure` path expected by `import.tsx`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `sync/lib/services/data-synchronizer-service.ts` | Modified | Product path → real repo; new `ProductImportRepo` seam + `mergeProductsViaRepository` |
| `sync/lib/storage/sync-repo-shims.ts` | Modified/Removed | Retire `makeProductRepoShim` product path |
| `sync/routes/import.tsx` | Modified | Construct real `ProductRepository` |
| `openspec/specs/sync/spec.md` | Modified | Supersede re-home-only; add product-validation requirement |
| sync test suite (105 files / 1232 tests) | Modified | Update behavior-change assertions |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regression across verified sync suite (105 files/1232 tests) | High | Behavior-change tests updated deliberately under strict TDD; re-run full suite |
| Revising an already-verified/ratified sync spec | Med | Explicit supersession framing; user ratified (state #1034) |
| Category gap (A) left inconsistent with products | Med | Surface as gate before spec/design |
| Real `ProductRepository` needs `ProductCategoryRepository` DI in sync route | Low | Both already exist; mirror existing call-site construction |

## Rollback Plan

Commits-only on `feat/frontend-parity-audit`. Revert the wiring commits to restore the
`makeProductRepoShim` product path and the prior `spec.md` requirement; no data migration involved
(storage key/wire-format unchanged — Map-entries under the same product key).

## Dependencies

- Gates A–D ratified by the user before sdd-spec / sdd-design.
- Strict TDD mode active for apply/verify.

## Success Criteria

- [ ] Sync product import routes through the real `ProductRepository` (no `makeProductRepoShim` for products).
- [ ] Imported products enforce category-exists, barcode-uniqueness, per-category name-uniqueness, order-shift — matching Angular `synchronizeProducts`.
- [ ] On first product failure, the whole product type reverts (Angular parity).
- [ ] `openspec/specs/sync/spec.md` supersedes "re-home only"; new product-validation requirement documented.
- [ ] Full sync suite green after behavior-change test updates.
