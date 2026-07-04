# Tasks: Admin Stores Parity Followup (Stage 5 Admin)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 40-80 (2 components modified, 2 test files updated, possible 1-line es.ts sweep) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single work unit |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Store card XOR + state CSS + FAB label repoint + i18n sweep | commits-only | single autonomous unit, tests included, no PR/push |

## Phase 1: Store Card — State CSS + Approve/Disapprove XOR

- [x] 1.1 RED: update `app/admin/stores/components/__tests__/store-card-list.test.tsx` — flip the onApprove test (~91-106) fixture to `approved:false`; add XOR assertions (approved store renders ONLY Disapprove; unapproved store renders ONLY Approve, via `queryByRole` pos+neg); add state-class assertions on `[data-slot="card"]`: `isActive:false`→`bg-danger`, `approved:false & isActive:true`→`bg-success`, normal (`isActive:true, approved:true`)→neither class, both false→danger wins over success.
- [x] 1.2 GREEN: `app/admin/stores/components/store-card-list.tsx` — add `getStoreCardClass(store)` (mirrors `owner-card-list.tsx getCardClass`: `!isActive` checked first → danger, else `!approved` → success, else `''`); pass result to `Card className`; replace the two unconditional Approve/Disapprove `Button`s with `store.approved ? <Disapprove/> : <Approve/>`; Edit stays unconditional; `onApprove`/`onDisapprove` handler props unchanged.
- [x] 1.3 Verify: `pnpm -C apps/web-store-pos exec vitest run app/admin/stores/components/__tests__/store-card-list.test.tsx` green. (13/13 passed)

## Phase 2: Store List — FAB Label Repoint

- [x] 2.1 RED: update `app/admin/stores/routes/__tests__/store-list.test.tsx` — flip approve-flow fixtures (~145+, confirmed and cancelled tests) to `approved:false` so the Approve button renders; leave disapprove-flow fixtures at `approved:true`; add an assertion that the header FAB reads `esMessages['GENERAL.ADD']` ("Adicionar").
- [x] 2.2 GREEN: `app/admin/stores/routes/store-list.tsx:78` — repoint FAB label `{ id: 'STORES.CREATE' }` → `{ id: 'GENERAL.ADD' }`. Did NOT change `STORES.CREATE`'s value in `es.ts` at this step (removed entirely in Phase 3).
- [x] 2.3 Verify: `pnpm -C apps/web-store-pos exec vitest run app/admin/stores/routes/__tests__/store-list.test.tsx` green. (11/11 passed)

## Phase 3: i18n Sweep — Orphaned STORES.CREATE

- [x] 3.1 Grep sweep: confirmed `STORES.CREATE` (distinct from `STORES.CREATE_TITLE`/`STORES.CREATE_SUCCESS`, both still consumed elsewhere) has zero remaining consumers after task 2.2.
- [x] 3.2 Disposition: REMOVED the dead `'STORES.CREATE': 'Crear tienda'` entry from `app/shared/lib/i18n/es.ts` — matches the `RESELLERS.ADD` reconciliation precedent. Did not touch `STORES.CREATE_TITLE`/`STORES.CREATE_SUCCESS`. Sweep found zero live consumers, so removal (not annotation) applied.

## Phase 4: Full Verification Gate

- [x] 4.1 `pnpm -C apps/web-store-pos exec vitest run app/admin/stores/components/__tests__/store-card-list.test.tsx app/admin/stores/routes/__tests__/store-list.test.tsx` — both green. (2 files, 24 tests passed)
- [x] 4.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` — zero errors.
- [x] 4.3 `pnpm -C apps/web-store-pos exec vitest run` — full suite green, no regressions from the es.ts sweep. (102 files, 1193 tests passed)
- [x] 4.4 `pnpm -C apps/web-store-pos build` — succeeds. (client + SPA + service worker build completed)

## Commit Plan (work-unit-commits)

1. `fix(web-store-pos): admin stores card approve/disapprove XOR + state CSS` (Phase 1)
2. `fix(web-store-pos): admin stores FAB label parity (GENERAL.ADD)` (Phase 2)
3. `chore(web-store-pos): sweep orphaned STORES.CREATE i18n key` (Phase 3, if removed)

Commits-only on `feat/frontend-parity-audit`, no PR/push. Each commit includes its tests. Rollback: revert the single commit without affecting the others.
