# Archive Report — eliminate-base-repository

**Status**: COMPLETE (ARCHIVED)
**Branch**: `feat/frontend-parity-audit`
**Verify verdict**: PASS — 0 CRITICAL / 0 WARNING / 1 SUGGESTION (engram #880)

Eliminated `BaseRepository<T>` (React invention, no Angular correlate — playbook rule 12), the
systemic root cause of homogenized storage across all 5 offline consumers. Implemented via 7
independently-revertible work-unit commits on `feat/frontend-parity-audit` (Strict TDD). Each
consumer now inlines its own persistence, mirroring THAT consumer's Angular source exactly:
products/categories use Map-entries wire-format with per-instance cache; orders/credits/expenses
use plain-array wire-format with per-instance cache. Sync import re-homed to sync-local storage
shims (not a shared base) without altering the synchronizer's existing merge/validation/revert
orchestration. Canonical specs `openspec/specs/product-service/spec.md` and `openspec/specs/sync/spec.md` updated with 6 ADDED requirements from this change's delta specs.

## Commits Delivered

| WU | Commit | Scope | Status |
|-----|--------|-------|--------|
| WU1 | b1d5d9a | Inline `product-repository.ts` (Map-entries + cache + auto-init) | ✅ Complete |
| WU2 | 638ccad | Inline `product-category-repository.ts` (same pattern) | ✅ Complete |
| WU3 | 25e99f9 | Inline `order-offline-service.ts` (plain-array + cache + auto-init) | ✅ Complete |
| WU4 | a11d4d9 | Inline `sale-credit-offline-service.ts` (plain-array pattern) | ✅ Complete |
| WU5 | 3bb8b86 | Inline `expense-offline-service.ts` (plain-array pattern) | ✅ Complete |
| WU6 | 355b31b | Sync re-home (sync-local shims, no BaseRepository, orchestration unchanged) | ✅ Complete |
| WU7 | 54c33a3 | Delete `base-repository.ts` + test (LAST, after WU1-6 committed) | ✅ Complete |

All commits conventional messages, no "Co-Authored-By"/AI attribution, per repo convention.

## Verification Evidence (engram #880)

Fresh independent gate execution (NOT trusting apply-phase claims):
- `pnpm -C apps/web-store-pos exec tsc --noEmit` → clean, zero errors.
- `npx turbo run test --force` (cache bypassed, full suite) → **1670/1670 passed** across domain (95), web-common (11), web-store-pos (1564), 124 test files.
- `pnpm -C apps/web-store-pos build` → all bundles built successfully (client + service-worker + SSR).
- `find . -iname "*base-repository*"` (repo-wide) → zero matches in source (file deleted).
- `rg "BaseRepository"` across `apps/web-store-pos/app` → zero matches outside comments/docstrings/test-describe-strings documenting historical removal.
- Per-entity wire-format byte-verified: products/categories Map-entries at `lizoft.store-products-{storeId}`/`lizoft.store-product-categories-{storeId}`; orders/credits/expenses plain-array at `lizoft.store-orders-{storeId}`/`lizoft.store-saleCredits-{storeId}`/`lizoft.store-expenses-{storeId}`.
- Sync-local shim integration tested: category import round-trips as Map-entries (readable by `ProductCategoryRepository`), order import round-trips as plain-array (readable by `OrderOfflineService`).

## Deferred (out of scope — recorded for follow-up)

The change explicitly did NOT resolve 4 decision-gate items (design.md "Open Questions"). These
remain OPEN and are intentionally untouched. They are owned by future decision-gate changes:

1. **Order/expense date-revival gap** — React currently revives `createdDate`/`updatedDate` as
   `Date`; Angular revives neither (only `date`). Decision pending whether to fix or replicate
   literally (parity). NOT changed in WU3/WU5; gap preserved exactly as before.

2. **SaleCredit revival bugs** — Angular unconditionally revives `paidDate` (null → epoch 1970)
   and a nonexistent `paymentDate` field. Replicate literally (parity) or fix (angular-bugs-policy)?
   NOT changed in WU4; bugs preserved exactly as before.

3. **Missing normalizations** — React lacks Angular's `isCredit ??= false` / `paymentType ??= Efectivo`
   default normalization on order/expense read. Mirror it or skip? NOT added in WU3/WU5; gap preserved.

4. **Sync orchestration divergence** — the synchronizer's generic `upsert`/`save` + inline name-guard
   diverges from Angular's `addImported*`/`updateImported*` routing. This is the out-of-scope
   orchestration-bypass fix (design.md Non-goals). Preserved as-is in WU6.

SUGGESTION (engram #880, not CRITICAL/WARNING): `sync-repo-shims.ts` contains two internal
(non-exported) generic factory helper functions (`makeNameUniqueRepoShim`, `makeGenericUpsertRepoShim`),
structured similar to a mini-BaseRepository but split by wire-format group (Map-entries vs
plain-array) and co-located in sync (not a shared base). This is a legitimate DRY helper, not
a rule-12 violation, but worthy of human reviewer glance before closure given this change's
entire purpose was eliminating generic abstractions. Kept because reshaping it depends on
Angular's sync/import path, which ties to the deferred "sync orchestration divergence"
decision-gate item.

## Spec Merge

**Product Service** — 3 ADDED requirements merged into `openspec/specs/product-service/spec.md`:
- **No Shared Repository Base Class** — `ProductRepository` and `ProductCategoryRepository` must not
  depend on generic storage base; each implements its own private persistence mirroring its own Angular source.
- **Product Repository Wire Format, Cache, and Auto-Init** — Map-entries at `lizoft.store-products-{storeId}`,
  per-instance cache reloaded on empty/key-change, auto-init writes `[]` on empty read, no date revival.
- **Product Category Repository Wire Format, Cache, and Auto-Init** — Map-entries at
  `lizoft.store-product-categories-{storeId}`, same cache/auto-init/no-revival pattern.

**Sync** — 3 ADDED requirements merged into `openspec/specs/sync/spec.md`:
- **Sync-Local Storage Shim Replaces Shared Base Repository** — `import.tsx` uses sync-local shims
  satisfying `NameUniqueRepo`/`GenericUpsertRepo` interfaces without altering orchestration.
- **Sync Shim Wire-Format Parity Per Entity** — Categories/products Map-entries (same keys as product
  repos), orders/credits plain-array (same keys as offline services, converted array↔Map internally).
- **Sync Import Behavior Unchanged (Re-Home Only)** — Merge/validation/revert/error behavior identical
  before/after `BaseRepository` replacement.

The delta specs (with their `ADDED` section headers) are preserved in this change folder under
`specs/product-service/spec.md` and `specs/sync/spec.md`; the canonical specs hold the clean merged form.

## Artifact Traceability (engram)

| Artifact | ID | Status |
|----------|-----|--------|
| proposal | #867 | CLOSED |
| design | #870 | CLOSED |
| spec (delta) | #871 | CLOSED |
| tasks | #873 | CLOSED |
| apply-progress | #876 | CLOSED |
| verify-report | #880 | CLOSED |
| archive-report | TBD | *being written* |

## Next Steps

All 7 work units + gate verified green. Spec deltas merged. Change ready for next SDD phase.
No blocking risks. Proceed to the next planned change on `feat/frontend-parity-audit`.
