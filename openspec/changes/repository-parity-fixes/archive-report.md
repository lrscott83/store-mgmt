# Archive Report — repository-parity-fixes

**Status**: COMPLETE (ARCHIVED)
**Branch**: `feat/frontend-parity-audit`
**Verify verdict**: PASS — 0 CRITICAL / 0 WARNING (engram #850)

Closed a 3-finding repository parity audit (Angular → React) against the 2 migrated
repositories (`ProductRepository`, `ProductCategoryRepository`), governed by
`docs/migration/playbook-migracion-servicios-angular-react.md`. Delivered 2 code changes + 1
verified no-op. Canonical spec `openspec/specs/product-service/spec.md` updated with the 2
MODIFIED requirements from this change's delta.

## Findings Delivered

1. **Finding #1 — `addProductCategoryByName` always returns id** (Option A, LOCKED engram #842)
   - Replicate Angular's literal behavior (`product-category.repository.ts:94-98`): return type
     `string | null` → `string`, unconditional `return id`, `as string` cast removed, test reworked.
   - Ratified exception to angular-bugs-policy — no call-site in either codebase branches on the
     `null` path, so literal 1:1 parity was chosen over silently keeping React's unratified fix.
   - Commit `42fcc7d`.

2. **Finding #2 — activate/deactivateProductCategory dead 2nd param** — NO ACTION.
   - Already ratified in Phase 1 WU1.9 (engram #761/#771). Recorded for audit-trail completeness.

3. **Finding #3 — `getAvailableProductById` null vs undefined** (Option A)
   - Return type `Product | undefined` → `Product | null`, mirroring Angular
     (`product.repository.ts:50-53`) and restoring internal consistency with sibling methods.
   - Commit `25011d9`.

## Follow-up cleanup (SUGGESTION from verify #850)
- Removed 17 now-redundant `as string` casts on `addProductCategoryByName` in
  `product-offline-service.test.ts`. Commit `2274ca8`.

## Verification Evidence (engram #850)
- Full suite: **1541/1541 passed**; `tsc --noEmit` clean.
- Git: 3 commits, disjoint scope, conventional messages, no AI attribution.
- Both findings byte-verified against Angular source; all production call-sites confirmed
  truthiness checks (zero behavior-change risk).

## Artifact Traceability (engram)
| Artifact | ID |
|----------|----|
| explore | #840 |
| proposal | #843 |
| spec (delta) | #844 |
| tasks | #845 |
| apply-progress | #848 |
| verify-report | #850 |
| decisions | #842 |
| archive-report | #853 |

## Deferred (out of scope)
- `inventory-repository.ts` — React repository with NO Angular correlate (playbook rule 10).
  Noted for a future review (engram #837). NOT touched by this change.

## Spec Merge
Two MODIFIED requirements merged into `openspec/specs/product-service/spec.md`:
- **ProductCategoryRepository Mirrors Angular Repo Surface** — `addProductCategoryByName(name): string`
  (always returns id) + 2 scenarios.
- **Repository-vs-Service Ownership Boundary** — `getAvailableProductById(id): Product | null` + 2 scenarios.

The delta spec (with its `(Previously: ...)` historical annotations) is preserved in this change
folder under `specs/product-service/spec.md`; the canonical spec holds the clean merged form.
