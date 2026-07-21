# Archive Report: Presentation Parity Batch 1

**Change**: `presentation-parity-batch-1`
**Archived**: 2026-07-21
**Branch**: `feat/presentation-parity-batch-1`
**Delivery**: commits-only (project convention), no PR

## Summary

Code-only presentation-layer parity audit (Angular `frontend/src/app/presentation/` vs React `frontend-react/apps/web-store-pos/app/`) selected 10 fixes to bring React back to Angular parity. All 10 implemented via strict TDD across 2 apply batches, verified PASS (0 CRITICAL/WARNING), then subjected to an additional adversarial Angular↔React parity review that found 0 critical issues and 3 minor footer nits (1 fixed, 1 refuted, 1 kept). Change is closed.

No capability delta spec/design were produced for this change — it is a pure parity-fix batch (proposal + tasks only), per user instruction at kickoff.

## The 10 Fixes

| # | Area | File | Fix | Commit |
|---|------|------|-----|--------|
| 1 | Admin | `admin/stores/components/store-card-list.tsx` | Not-approved store card → `bg-warning/10 border-warning` (amber), was green/success; deactivated stays danger/red | `ccc3d54` |
| 2 | Statistics | `statistics/routes/dashboard.tsx` | Wired currency selector (CUP/USD + rate), 4 gated KPI cards (Ventas/Gastos/Créditos/Ganancias w/ trend logic), 2 top-products lists (top-profit, top-sale-quantity); existing recharts charts kept untouched | `a2f5cd8` |
| 3 | Sales | `sales/components/edit-products-modal.tsx` | Reworked from edit-existing-prices to bulk-CREATE (blank rows, "+ Nuevo", required/duplicate-name validation, `createProducts(categoryId, items)`) | `55f81ba` |
| 4 | Profile | `profile/components/edit-profile-form.tsx` | cellPhone masked (`+53 0 000-0000`) + required, reusing `toDigits`/`formatCellPhone` from `management/users/lib/cell-phone-mask` | `cc909e1` |
| 5 | Inventory | `inventory/routes/available.tsx` | `INVENTORY.NO_ENTRY_FOUND` shown only when `categories.length === 0`; per-category empty message preserved otherwise | `a9dc81f` |
| 6 | Expenses | `expenses/components/expense-form-modal.tsx` | Create-mode default expense type → `ExpenseType.Salario` (was `Otro`) | `399b0a5` (combined w/ #7) |
| 7 | Expenses | `expenses/components/expense-form-modal.tsx` | Total starts empty/`NaN`, invalid until entered (was defaulting to valid `0`) | `399b0a5` (combined w/ #6) |
| 8 | Inventory | `inventory/components/edit-inventory-entry-modal.tsx` | Product `<select>` disabled unconditionally in both create/edit mode | `15fa7e8` |
| 9 | Admin/Features | `admin/features/routes/features.tsx` | Gear icon → `EditIcon` (pencil); static `<p>` feedback → `showBlockingSuccess`/`showBlockingError` | `8f0cef0` |
| 10 | Auth | `auth/components/auth-layout.tsx`, `auth/routes/register.tsx` | Ported guest-footer (legal links + Contact + copyright) via shared `Footer` component; removed invented `REGISTRATION.SUCCESS_REDIRECT` interim screen, navigates straight to `/login` | `928f716` |

## Apply Execution (2 Batches, Strict TDD)

**Batch 1** (sales + inventory + expenses, 5 WUs): WU3, WU5, WU6, WU7, WU8.
Verification: `pnpm test` 1886/1886 passed (128 files), tsc clean, build succeeded.

**Batch 2** (admin + statistics + features + profile + auth, 5 WUs): WU1, WU2, WU9, WU4, WU10.
Verification: `pnpm test` 1913/1913 passed (129 files), tsc clean, build succeeded.

**Bookkeeping commits**: `a508e82` (Batch 1 tasks.md check-off), `9ae1f72` (Batch 2 tasks.md check-off).

## Commit Ledger (chronological, feat/presentation-parity-batch-1)

| Commit | WU | Description |
|--------|----|--------------|
| `15fa7e8` | WU8 | fix(inventory): disable product select in edit-entry modal to match Angular |
| `399b0a5` | WU6+WU7 | fix(expenses): default new expense type to Salario and require an explicit total |
| `a9dc81f` | WU5 | fix(inventory): correct empty-inventory message on Available screen |
| `55f81ba` | WU3 | fix(products): make "Nuevo Productos" modal create products to match Angular |
| `a508e82` | — | chore(tasks): mark Batch 1 tasks complete |
| `ccc3d54` | WU1 | fix(admin): store card not-approved state uses warning color matching Angular |
| `8f0cef0` | WU9 | fix(admin): features activation uses EditIcon and blocking alerts matching Angular |
| `cc909e1` | WU4 | fix(profile): mask and require cellPhone to match Angular |
| `928f716` | WU10 | fix(auth): add guest footer and drop invented register success screen |
| `a2f5cd8` | WU2 | fix(statistics): restore KPI cards, currency selector and top-products lists |
| `9ae1f72` | — | chore(tasks): mark Batch 2 tasks complete |
| `7171171` | post-verify | fix(auth): add missing email icon to guest-footer Contact trigger (F-1) |
| (this archive commit) | — | chore(archive): close presentation-parity-batch-1 |

## sdd-verify Result: PASS

0 CRITICAL, 0 WARNING, 0 SUGGESTION. All 10 fixes independently re-verified against actual Angular source (not trusted from apply narrative). Gates re-run and matched: `pnpm test` 1913/1913 (129 files), tsc clean, build succeeded. Full detail in `verify-report.md` (this folder) and Engram observation `sdd/presentation-parity-batch-1/verify-report` (id #1379).

## Adversarial Parity Review (post-verify, footer/auth focus)

A second-pass adversarial Angular↔React parity review targeted the footer/auth area specifically (the area with the least prior direct-source line citation). Verdict: 0 critical issues. 3 minor nits raised and disposed of:

- **F-1 — Missing email icon on Contact trigger**: Angular's guest-footer/client-footer Contact link renders an email icon; React's ported `Footer` component was missing it. **FIXED** in commit `7171171`.
- **F-2 — Guest-footer underline claim**: reviewer flagged the guest-footer legal links as missing an underline style present in Angular. **REFUTED** by the orchestrator on direct SCSS inspection — the guest-footer SCSS DOES underline legal links; this was not a real divergence. No code change made.
- **F-3 — Features error-title i18n key**: reviewer flagged a mismatch between React's and Angular's error-title translation key on the Features activation flow. **Left as-is** — React's current copy was judged more correct than Angular's; not a regression, no change made.

## Explicit Out-of-Scope (unchanged, for future batches)

The following were identified during the original audit and deliberately NOT touched in this batch — still open for a future parity pass:

- Category gear menu (kept as-is)
- Reports dashboard (React's invented dashboard kept as-is, not reverted to Angular's simpler version)
- Statistics charts-vs-tables (React's recharts charts kept; Angular's table-based presentation NOT restored)
- Tutorial 4→1 panel consolidation (kept as-is, not reverted to Angular's single-panel tutorial)
- The entire Bucket-C fab/password/Cerrar/modal-icon sweep (deferred wholesale)
- All Bucket-D enhancements (deferred wholesale)
- All Bucket-E cosmetics (deferred wholesale)

## Gate Summary (final state)

| Gate | Result |
|------|--------|
| `pnpm test` | 1914/1914 passed (includes the F-1 footer-icon fix's test) |
| `pnpm -C apps/web-store-pos exec tsc --noEmit` | Clean |
| `pnpm -C apps/web-store-pos build` | Succeeded |

## Traceability — Engram Observation IDs

| Artifact | Topic Key | Observation ID |
|----------|-----------|-----------------|
| Proposal | `sdd/presentation-parity-batch-1/proposal` | #1370 |
| Tasks | `sdd/presentation-parity-batch-1/tasks` | #1371 |
| Apply Progress | `sdd/presentation-parity-batch-1/apply-progress` | #1373 |
| Verify Report | `sdd/presentation-parity-batch-1/verify-report` | #1379 |
| Archive Report | `sdd/presentation-parity-batch-1/archive-report` | (this document) |

No spec/design observations exist for this change (skipped by explicit user instruction — this is a parity-fix batch, not a new-capability change).

## Filesystem Move

- Source: `frontend-react/openspec/changes/presentation-parity-batch-1/` (contained `proposal.md`, `tasks.md`)
- Destination: `frontend-react/openspec/changes/archive/2026-07-21-presentation-parity-batch-1/` (contains `proposal.md`, `tasks.md`, `verify-report.md`, `archive-report.md`)
- The orchestrator must `git rm -r frontend-react/openspec/changes/presentation-parity-batch-1/` and `git add` the new archive folder, then commit as `chore(archive): close presentation-parity-batch-1`.

## SDD Cycle Complete

The change has been fully planned (proposal + tasks, spec/design intentionally skipped), implemented (10/10 WUs, strict TDD, 2 batches), verified (PASS, 0 CRITICAL/WARNING), adversarially reviewed (0 critical, 1 fixed nit, 1 refuted, 1 kept), and archived. Ready for the next change.
