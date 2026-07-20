# Archive Report: product-modal-parity

## Change
product-modal-parity — Realigns React's product create/edit modals to the ONE real Angular source (`EditProductModalComponent`, used for both create and edit). Removes invented fields (barcode input, category dropdown, in-modal delete) and adds the real Angular fields (Orden, Activo, `$` price prefix).

## Status: ARCHIVED (SDD cycle complete)

## Gates
- **sdd-verify**: PASS (0 CRITICAL, 0 WARNING, 0 SUGGESTION) — engram `sdd/product-modal-parity/verify-report` (id 1277). Verified against the pre-Phase-6 scope: 12/12 tasks, 15/15 spec requirements/scenarios, 125 files / 1815 tests, typecheck clean.
- **Parity review vs Angular (code-only, post-verify)**: initial pass found 3 real divergences the original spec/verify-report did not cover — price `Validators.min(0)`, order `Validators.pattern(/^[0-9]\d*$/)`, and `updateProduct`'s barcode arg not forced to `undefined` on edit. All 3 were FIXED (Phase 6, commits d645d32, 2eb4735, b331634) and a focused re-review returned **PARITY (1:1)** with Angular's `edit-product-modal.component.ts`/`.html`.
- Reconciliation note: `verify-report.md` (id 1277) predates Phase 6 and is preserved as-written for audit-trail fidelity; an addendum was appended to the archived copy of that file recording the post-Phase-6 final state. The canonical spec (`specs/product-modal-form/spec.md`) already includes all Phase-6 requirements (price-min, order-pattern, barcode-always-undefined) so it reflects final behavior.

## Engram Artifact IDs (traceability)
| Artifact | Topic Key | Observation ID |
|---|---|---|
| Proposal | `sdd/product-modal-parity/proposal` | 1271 |
| Spec | `sdd/product-modal-parity/spec` | 1272 |
| Design | — | none (skipped per proposal — "Design phase: LIGHT / SKIPPABLE", all forks pre-resolved by user) |
| Tasks (incl. Phase 6 follow-up) | `sdd/product-modal-parity/tasks` | 1273 |
| Apply-progress | `sdd/product-modal-parity/apply-progress` | 1275 |
| Verify report | `sdd/product-modal-parity/verify-report` | 1277 |
| Archive report | `sdd/product-modal-parity/archive-report` | (this record) |

## Final Implementation State
- Angular's real product modal = `EditProductModalComponent` (used for both create and edit); Angular's `create-product-modal` is a dead stub — not a parity source.
- React `create-product-modal.tsx` + `edit-product-modal.tsx` reworked to mirror Angular exactly:
  - REMOVED: barcode input, category dropdown, in-modal delete block (+ `onDelete` prop from EditProductModal).
  - ADDED: Orden (required numeric, precomputed via `getMaxOrder` on create), Activo (checkbox, default true), `$` price prefix.
  - Prop reshape: `CreateProductModal` now takes `category: ProductCategory` + `defaultOrder: number` (not `categories[]`); `EditProductModal` drops `categories` + `onDelete`.
  - Titles: `PRODUCT.NEW_PRODUCT` / `PRODUCT.EDIT_PRODUCT`. i18n fix: "Descuenta del Inventario" (was "Descontar del inventario").
  - products.tsx: `handleAddProduct` awaits `productService.getMaxOrder(category.id)` → `defaultOrder = (data ?? 0) + 1`; `handleCreateProduct`/`handleEditProduct` thread real `order`/`isActive` instead of hardcoded `1`/`true`.
- Phase 6 follow-up fixes (found by parity re-review, not original spec):
  - Price: `min="0"` attribute + `validate()` negative-price branch → `GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO` message.
  - Order: `/^[0-9]\d*$/` pattern validation, blocks submit silently (no visible error), mirroring Angular's missing mat-error for the pattern case.
  - Both `<form>` elements needed `noValidate` (native `min="0"` constraint validation was swallowing submit before custom validators ran) — parity-neutral fix, not a new divergence.
  - `handleEditProduct` barcode positional arg forced to `undefined` always, mirroring Angular's permanently-commented-out barcode `FormControl` (`edit-product-modal.component.ts:125`). USER DECISION: replicate Angular's literal behavior here, not "fix" it — no call site depends on a real barcode value flowing through update.
- **Known intentional divergence (not a defect, noted for future readers)**: React forms use `noValidate` (suppresses native browser validation tooltip UI), whereas Angular's `edit-product-modal` HTML form accidentally omits `novalidate`. Validation outcomes and error messages are byte-identical between the two; only native browser chrome (the tooltip bubble) differs. This was deliberately NOT replicated because it stems from an Angular oversight, not a contract Angular explicitly relies on.

## Commits (main, commits-only delivery — no PR)
- `a696ded` — create-product-modal rework + i18n
- `71a24d5` — edit-product-modal rework
- `738996f` — products.tsx wiring
- `d645d32`, `2eb4735`, `b331634` — Phase 6 follow-up parity fixes (price min, order pattern, barcode-undefined-on-update)

## Test/Build Evidence (final state)
- Suite: 125 test files / **1824 tests** passing (grew from 1815 pre-Phase-6 + 9 new specs).
- `npm run typecheck`: clean, zero errors.

## Specs Synced
| Domain | Action | Details |
|--------|--------|---------|
| `product-modal-form` | Created | New capability — no prior spec existed. Copied the full delta spec (12 requirements, including 3 Phase-6 additions: price-min, order-pattern, barcode-always-undefined) as the canonical spec. |

### Source of Truth Updated
- `frontend-react/openspec/specs/product-modal-form/spec.md` (new — created, not merged, since no prior spec existed for this capability)

## Archive Contents
- proposal.md ✅
- specs/product-modal-form/spec.md ✅
- tasks.md ✅ (12/12 original + 5/5 Phase-6 tasks complete = 17/17)
- verify-report.md ✅ (+ addendum reconciling Phase-6 state)
- archive-report.md ✅ (this file)
- design.md — not applicable (skipped; proposal explicitly recommended skipping design for this change)
- apply-progress.md — not written to filesystem (hybrid mode); full content lives in Engram id 1275

## Filesystem Note (tooling constraint)
This archive pass had file Read/Write/Edit tools only (no Bash/delete capability). New files were created at the canonical spec path and the archive path, but the original `frontend-react/openspec/changes/product-modal-parity/` folder (proposal.md, tasks.md, verify-report.md, specs/product-modal-form/spec.md) still exists on disk and needs a `git mv`/`git rm` step by whoever commits this archive, so the active `changes/` directory no longer lists this change as in-flight.

## SDD Cycle Complete
The change has been fully planned, implemented, verified (including a follow-up parity re-review that closed 3 real divergences), and archived. Ready for the next change.
