# Archive Report — presentation-parity-bucket-c (2026-07-22)

**Change**: presentation-parity-bucket-c
**Mode**: Hybrid (Engram + openspec)
**Branch**: `feat/presentation-parity-bucket-c` (stacked on `feat/presentation-parity-batch-1`), 25 commits, not yet merged/pushed
**Verify verdict**: PASS WITH WARNINGS (0 blocking CRITICAL — the one CRITICAL flag was a Strict-TDD documentation-format gap, not a functional defect)
**Adversarial code-only parity review vs Angular source**: CLEAN (after fixing 6 confirmed divergences in Round 2 + 1 adjacent gap in Round 3)

## Engram Source Observations (traceability)

| Artifact | Observation ID | Topic key |
|---|---|---|
| Proposal | #1389 | `sdd/presentation-parity-bucket-c/proposal` |
| Spec (delta) | #1390 | `sdd/presentation-parity-bucket-c/spec` |
| Tasks | #1391 | `sdd/presentation-parity-bucket-c/tasks` |
| Verify report | #1394 | `sdd/presentation-parity-bucket-c/verify-report` |
| Round-3 adjacent-gap bugfix | #1392 | "Fixed expense modal Save label hardcoded (INSERT/UPDATE parity)" |
| State / final summary | #1401 | `sdd/presentation-parity-bucket-c/state` |

No `design` artifact was produced for this change (pure mechanical presentation-parity — no architecture decisions required, consistent with the proposal's "no new abstraction" scope).

## Spec Sync

`openspec/specs/presentation-parity-bucket-c/spec.md` did not exist prior to this change — this is a standalone presentation-parity domain (precedent: `view-text-parity`). The delta spec graduates to the canonical spec, **updated to reflect the final, parity-review-verified behavior**:

- All 4 original requirements (password toggle parity, Cancel→Cerrar, modal Close/Save icon parity, confirmed submit/action→fab) carried over, with the icon-parity requirement corrected: the confirm-control icon is NOT uniformly `SaveIcon` — it now documents the per-screen glyph mapping discovered in Round 2 (`EditIcon` for edit-order-modal, `PayIcon` for the two credit modals, `SaveIcon` for inventory/expense).
- Added **Requirement: Password eye icon direction matches Angular** (Round 2 CRITICAL fix — `EyeIcon` = revealed, `EyeOffIcon` = hidden, was inverted).
- Added **Requirement: Owner/reseller edit toolbar add-button parity** (formalizes WU5, which was implemented, not skipped).
- Added **Requirement: Expense modal save label toggles INSERT/UPDATE** (Round 3 adjacent-gap fix, pre-existing from batch-1, closed here since it touches the same file/modal already in scope).
- Added a `sale-product-row.tsx` clarification: MUST use a local 40px `mat-mini-fab`-equivalent button, not the 56px `FloatingButton` (Round 2 regression caught and reverted).
- `Non-Goals` section extended with the `import-form.tsx`/`export-form.tsx` inverted-eye-icon bug — explicitly out of scope, flagged as a candidate for a future batch.

The original delta spec (pre-review) is preserved verbatim in the archived change folder's `specs/presentation-parity-bucket-c/spec.md` for audit-trail purposes; the canonical spec at `openspec/specs/presentation-parity-bucket-c/spec.md` is the updated, post-review source of truth.

## Delivered

Mechanical Angular→React presentation parity, ~31 files under
`frontend-react/apps/web-store-pos/app/{auth,management/users,profile,admin/owners,admin/resellers,sales,inventory,expenses}/`
plus `shared/components/ui/icons.tsx` (+`LoginIcon`, `LockOpenIcon`) and
`shared/lib/i18n/es.ts` (+`OWNER.ADD_OWNER`, `RESELLER.ADD_RESELLER`):

1. Password visibility toggle on 6 screens (login, register, UserCreateForm, change-password, owner-create, reseller-create) — `EyeIcon`/`EyeOffIcon`, shared `showPassword` state per screen.
2. "Cancelar" → "Cerrar" in 2 modals (edit-inventory-entry, expense-form).
3. `CloseIcon`/action-icon parity in 5 modals (edit-order, edit-sale-credit, sale-credit-payment, edit-inventory-entry, expense-form).
4. Raw `<button>` → fab across 10 confirmed controls (login, register, UserCreateForm, UserDetailsForm, change-password, owner create/edit, reseller create/edit, expense-form-modal close button), each with the Angular-matching glyph.
5. WU5 conditional: owner-edit/reseller-edit toolbar "+" fab — confirmed via direct Angular source read and implemented (no-op handlers mirrored literally).
6. Round 2 (post-verify parity-review, 6 fixes): inverted eye-icon direction (CRITICAL), missing fab glyphs, wrong action icons (edit vs pay vs save), expense modal button order, sale-product-row fab-size regression.
7. Round 3 (adjacent gap): expense modal Save label hardcoded — now toggles `GENERAL.INSERT`/`GENERAL.UPDATE`.

30 total confirmed parity fixes across 25 commits. Full `web-store-pos` suite: **1970/1970 tests passing**, typecheck clean, final parity-review pass CLEAN.

## Archive Contents

- proposal.md ✅
- specs/presentation-parity-bucket-c/spec.md ✅ (delta, as originally authored — audit trail)
- tasks.md ✅ (23/23 Round-1 tasks + 6 Round-2 fixes + 1 Round-3 fix, all complete)
- verify-report.md ✅ (PASS WITH WARNINGS, reconstructed verbatim from Engram observation #1394, with a post-verify addendum documenting Round 2/3)
- archive-report.md ✅ (this file)

No `design.md` or `apply-progress.md` — neither was produced for this change (no architecture decisions; `tasks.md`'s inline DONE/commit annotations serve as the apply-progress record, consistent with this project's convention for mechanical presentation-parity changes).

## Known Non-Blocking Follow-ups

- `sync/components/import-form.tsx` / `export-form.tsx` share the same inverted eye-icon bug found and fixed in this bucket (R2.1) — explicitly out of scope here, left untouched. Candidate for a future presentation-parity batch.
- Verify report's one CRITICAL flag (missing formal "TDD Cycle Evidence" table in apply-progress) is a documentation-format gap, not a functional defect; functional evidence (paired tests, full suite green throughout, real regressions caught and fixed mid-apply) substitutes for it. Not re-litigated here since the code itself was independently re-verified via parity-review.
- ~11 test files assert fab-variant rendering via CSS class checks rather than a semantic attribute (`Button`/`FloatingButton` have no `data-variant` hook) — pre-existing component-design limitation, not introduced by this change.

## SDD Cycle Complete

The change has been fully planned, implemented, verified (`sdd-verify` PASS WITH WARNINGS), independently parity-reviewed against Angular source (CLEAN after 2 follow-up rounds), and archived.

## Filesystem Note (orchestrator action required)

Per instruction, this archive sub-agent has no filesystem delete/move capability (no Bash tool in this execution context) and did NOT run `git commit`. All 3 source artifacts (`proposal.md`, `specs/presentation-parity-bucket-c/spec.md`, `tasks.md`) plus a reconstructed `verify-report.md` were **copied** (via Write) into
`openspec/changes/archive/2026-07-22-presentation-parity-bucket-c/`, alongside this `archive-report.md`. The canonical spec was also written to `openspec/specs/presentation-parity-bucket-c/spec.md`.

The orchestrator MUST:
1. `git rm -r openspec/changes/presentation-parity-bucket-c/` (delete the original, now-duplicated source folder — it still exists on disk untouched by this sub-agent).
2. `git add openspec/changes/archive/2026-07-22-presentation-parity-bucket-c/ openspec/specs/presentation-parity-bucket-c/spec.md`.
3. Commit the archive as its own commit (e.g. `docs(sdd): archive presentation-parity-bucket-c`).
