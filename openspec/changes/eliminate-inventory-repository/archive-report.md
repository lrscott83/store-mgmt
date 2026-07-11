# Archive Report — eliminate-inventory-repository

**Status**: COMPLETE (ARCHIVED)
**Branch**: `feat/frontend-parity-audit`
**Verify verdict**: PASS — 0 CRITICAL / 1 WARNING [pre-existing, out-of-scope] / 0 SUGGESTION (engram #914)

Eliminated `InventoryRepository` (React invention, no Angular correlate — playbook rule 12), the
3rd and final React-invented storage class after `BaseRepository` and `BaseService` elimination.
`InventoryOfflineService` now inlines its own persistence, mirroring Angular's
`frontend/src/app/application/entries/inventory-offline.service.ts` exactly. Implemented via 3
independently-revertible work-unit commits on `feat/frontend-parity-audit` (Strict TDD). Sync
export read side re-homed to use `getInventoryEntriesJson()` raw passthrough (fixing a silent
corrupt-data-loss defect), without altering synchronizer orchestration. Canonical specs
`openspec/specs/inventory-service/spec.md` (new) and `openspec/specs/sync/spec.md` (updated)
reflect the new architecture with 8 ADDED requirements from this change's delta specs.

## Commits Delivered

| WU | Commit | Scope | Status |
|-----|--------|-------|--------|
| WU1 | 6b55552 | Inline `inventory-offline-service.ts` (Map cache + auto-init) | ✅ Complete |
| WU2 | a8bd128 | Add `getInventoryEntriesJson()` + sync export re-home | ✅ Complete |
| WU3 | f194063 | Delete `inventory-repository.ts` + test (LAST, after WU1-2 committed) | ✅ Complete |

All commits conventional messages, no "Co-Authored-By"/AI attribution, per repo convention.

## Verification Evidence (engram #914)

Fresh independent gate execution (NOT trusting apply-phase claims):
- `npx turbo run typecheck --force` (5 packages) → clean, zero errors.
- `npx turbo run test --force` (cache bypassed, full suite) → **1546/1546 passed** across web-store-pos (111 test files).
- `find . -iname "*inventory-repository*"` (repo-wide) → zero matches in source (file deleted).
- `rg "InventoryRepository"` across `apps/web-store-pos/app` → zero matches outside comments/test-descriptions documenting historical removal.
- Persistence wire-format byte-verified: inventory entries at `lizoft.store-inventory-entries-{storeId}` (Map-entries format, reviveEntry date-only, cache auto-init on empty/key-change).
- Sync export/import round-trip tested: inventory serializes via raw `getInventoryEntriesJson()` passthrough, preserves corrupt data as-is (not silently emptied).

## Out of Scope — Flagged for Follow-Up

**WARNING (pre-existing, unrelated)**: Full-suite `vitest run` exits non-zero due to an unhandled
promise rejection in `auth-store.ts:57` (last touched by unrelated auth commits). Does NOT affect
this change's 1546/1546 pass count or this change's own inventory/sync tests. Recommend separate
ticket to guard `apiClient.get('/v1/auth/me')` against being undefined in test/jsdom teardown.

## Spec Merge

**Inventory Service** — 7 ADDED requirements in new `openspec/specs/inventory-service/spec.md`:
- **No Inventory Repository Class** — InventoryRepository file must not exist; persistence inlined.
- **Inline Persistence Mirrors Angular (Cache, Auto-Init, Storage Keys)** — Per-instance Map cache,
  auto-reload on empty/size0/key-change, side-effecting getStorageKey() vs pure getCurrentStorageKey(),
  key format `StorageKeys.entityKey('inventory-entries', storeId)`, dead INVENTORIES_KEY not ported.
- **reviveEntry Parity — Only `date` Field Revived** — date revived as Date, createdDate/updatedDate
  untouched (matching Angular lines 540-545).
- **Dead Repository Members Removed** — remove and clear absent (zero call-sites, no Angular correlate).
- **Product-Scoped Entry Lookup** — Internal lookups via `getByProductId(productId).find(...)`,
  no cross-product scan, no `storedProductId ?? productId` fallback.
- **Public `[]`-Forcing Preserved** — getProductInventoriesByProductId still returns `[]` for unknown
  product (Stage-7 ADR-2 ratified contract, out-of-scope change to public method).

**Sync** — 2 ADDED requirements merged into existing `openspec/specs/sync/spec.md`:
- **getInventoryEntriesJson Raw Passthrough** — New method on InventoryOfflineService returns
  raw on-disk string (localStorage.getItem || "{}"), preserves corrupt data, no silent swallowing.
- **Sync Export/Import Read Side Uses InventoryOfflineService** — export.tsx/import.tsx construct
  InventoryOfflineService (not InventoryRepository) for serializer read side; DataSerializerService
  reads via getInventoryEntriesJson() raw passthrough (not getAll() + Map rebuild + re-stringify),
  fixing rule-10/12 silent-data-loss defect.

The delta specs (with their `ADDED` section headers) are preserved in this change folder under
`specs/inventory-service/spec.md` and `specs/sync/spec.md`; the canonical specs hold the clean merged form.

## Artifact Traceability (engram)

| Artifact | ID | Status |
|----------|-----|--------|
| proposal | #906 | CLOSED |
| design | #908 | CLOSED |
| spec (delta) | #907 | CLOSED |
| tasks | #909 | CLOSED |
| apply-progress | #912 | CLOSED |
| verify-report | #914 | CLOSED |
| archive-report | *being written* | *active* |

## Next Steps

All 3 work units + gate verified green. Spec deltas merged into canonical specs. Change ready for
next SDD phase (if any). No blocking risks. Proceed to the next planned change on
`feat/frontend-parity-audit`.
