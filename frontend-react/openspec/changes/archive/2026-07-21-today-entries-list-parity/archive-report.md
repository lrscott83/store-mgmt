# Archive Report: Today Entries List Parity

**Change:** today-entries-list-parity
**Branch:** feat/today-entries-parity
**Archived:** 2026-07-21
**Mode:** Hybrid (engram + openspec files)

## Final Scope Delivered

React's "Entradas del día" (today's inventory entries) screen was wired to the wrong
component and has been fixed to full Angular parity, plus follow-on dead-code and
i18n cleanup, plus a post-verify regression fix:

1. **Component rewire**: `today-entries.tsx` now renders the already-correct
   `EntryList` component (`<EntryList entries={entries} onEdit={handleEdit}
   onDeactivate={handleDeactivate} readOnly={false} isOwnerAdmin={isOwnerAdmin} />`)
   instead of the invented `InventoryDailyEntries` (labeled cards grouped by
   product name, extra "Fecha" field, inline pill buttons — none of which exist
   in Angular).
2. **Dead-code removal**: `inventory-daily-entries.tsx` and its test file
   deleted (React invention with no Angular correlate, per project rule
   "migration invents nothing new"). Confirmed via repo-wide grep that
   `today-entries.tsx` was the only importer.
3. **Scope expansion (orchestrator-verified against Angular source, both
   today-entries and history/entries screens)**: `EntryList` itself rendered an
   unconditional "Fecha" column (`INVENTORY.ENTRY.DATE`) with no Angular
   correlate — Angular's `entry-list.component.html` has no date column at all.
   Removed the column from the shared `EntryList` component (benefits both
   `today-entries.tsx` and the history screen `entries.tsx` without touching
   the latter directly), and pruned the now-orphaned `INVENTORY.ENTRY.DATE`
   i18n key from `es.ts`.
4. **Post-verify regression fix**: an adversarial Angular↔React parity review
   pass (run after the `sdd-verify` PASS) found ONE confirmed defect — the
   today-entries empty-day state rendered the generic product-list empty
   message instead of Angular's entry-specific `INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY`
   copy. Fixed with a RED-first test (Strict TDD): added a parent-owned
   empty-state `InfoBox` in `today-entries.tsx`, gated on an empty entries
   array, rendering the correct entry-specific i18n string.

## Commits

| Commit | Content |
|---|---|
| `f536ec9` | RED — failing test asserting `EntryList`-shaped compact row (name+quantity, gear toggle, no grouping header, no Fecha) against the pre-swap `InventoryDailyEntries` |
| `56c0e80` | GREEN — swapped `today-entries.tsx` to render `EntryList` instead of `InventoryDailyEntries` |
| `3aa4971` | Removed the unconditional "Fecha" column + `toLocaleDateString('es')` cell from `entry-list.tsx` (scope expansion, Angular parity) |
| `1cbf51e` | Deleted dead `inventory-daily-entries.tsx` + its describe blocks/import in `inventory-components.test.tsx`; pruned orphaned `INVENTORY.ENTRY.DATE` i18n key from `es.ts` |
| `b4b2255` | Verification sweep — full suite green (1866/1866), `tsc --noEmit` clean, build succeeds |
| `cbc4726` | Post-verify fix — parent-owned empty-day `InfoBox` in `today-entries.tsx` rendering Angular's entry-specific `INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY` copy (RED-first test); re-verified 1867/1867 |
| *(pending)* | Archive commit — `git rm` of the active change folder + `git add` of this archive folder, to be made by the orchestrator after this report |

## Gate Results

- `pnpm test`: 1867/1867 passing (final, after the post-verify fix; 1866/1866 at the original `sdd-verify` PASS, +1 net new test from the empty-state fix).
- `pnpm -C apps/web-store-pos exec tsc --noEmit`: clean, zero errors.
- `pnpm -C apps/web-store-pos build`: client + SSR/SPA + service-worker all succeeded.

## Review Verdicts

1. **sdd-verify** (Engram `sdd/today-entries-list-parity/verify-report`, #1360): **PASS** — 0 CRITICAL, 0 WARNING, 0 SUGGESTION. All 4 phases of tasks.md (including the 3b scope-expansion sub-phase) confirmed complete by direct source reads, not trusted from apply-progress. All 3 gates (test/tsc/build) run directly and confirmed green. History screen `entries.tsx` confirmed untouched via `git diff --stat` across the commit range.
2. **Adversarial Angular↔React parity review** (separate pass, not a stored SDD artifact, run AFTER the `sdd-verify` PASS): **ONE CONFIRMED REGRESSION FOUND** — the today-entries empty-day message used the generic product empty-state string instead of Angular's entry-specific `INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY`. This was a real parity defect the `sdd-verify` pass missed (it verified structural/row-level parity but did not diff the empty-state copy against Angular's template). Fixed via commit `cbc4726` (RED-first test, per Strict TDD). Re-verification after the fix: 1867/1867 tests, clean `tsc`, successful build, no other regressions.

This is a recurring, previously-documented pattern in this project: `sdd-verify` validates against the written spec/tasks, while an adversarial parity-review pass that re-diffs against the actual Angular source can catch defects that were never captured in the plan (see prior closures: `order-offline-service-parity`, `product-modal-parity`). Both gates are required before archive; this change needed both.

## Specs Synced

No delta spec exists for this change — `sdd-spec` and `sdd-design` were
intentionally skipped (pure component rewire + dead-code removal with no
capability-level requirement change; both screens were already specified
around `EntryList` parity behavior in prior SDD closures). Nothing to merge
into `openspec/specs/`.

## Archive Contents

- `proposal.md` — done
- `tasks.md` — done (5 phases complete: 1 RED, 2 GREEN, 3 cleanup, 3b scope-expansion, 4 verification; plus a 5th phase documenting the post-verify regression fix)
- `verify-report.md` — done (PASS, plus a post-verify adversarial-review addendum documenting the empty-state regression and its fix)
- `archive-report.md` — this file
- No `design.md` / `specs/` — intentionally skipped for this change (see above)

## Source of Truth Updated

None — no main spec exists or is affected by this change (see Specs Synced above).

## Filesystem Move — IMPORTANT CAVEAT

This archive sub-agent has only `Read`/`Write`/`Edit`/`Glob` tools available — **no Bash, no
file-move, and no file-delete capability**. I therefore:

1. **Copied** (via `Write`, not moved) `proposal.md` and `tasks.md` from the active change
   folder, and **reconstructed** `verify-report.md` on disk (the prior `sdd-verify` run only
   persisted its report to Engram, not to the filesystem — same caveat as the sibling
   `collapsible-panel-chevron-parity` archive), into
   `frontend-react/openspec/changes/archive/2026-07-21-today-entries-list-parity/`.

**I could NOT remove the original active folder**
`frontend-react/openspec/changes/today-entries-list-parity/` — it still exists on disk, now
duplicated by the archive copy. Someone with shell access must run, from the repo root:

```
cd frontend-react
git rm -r openspec/changes/today-entries-list-parity
git add openspec/changes/archive/2026-07-21-today-entries-list-parity
git commit -m "chore(sdd): archive today-entries-list-parity"
```

No git commit was made by this agent — only files were read and written.

## Traceability

- Proposal: `sdd/today-entries-list-parity/proposal` (Engram #1356)
- Tasks: `sdd/today-entries-list-parity/tasks` (Engram #1357)
- Verify Report: `sdd/today-entries-list-parity/verify-report` (Engram #1360)
- Archive Report: `sdd/today-entries-list-parity/archive-report` (this document)
- No Spec/Design observations — intentionally skipped for this change.

## SDD Cycle Complete

The change has been fully planned (proposal + tasks only, by design), implemented,
verified (PASS), adversarially parity-reviewed (1 regression found and fixed), and
archived (pending the manual filesystem cleanup + commit noted above). Ready for the
next change.
