# Archive Report: Collapsible Panel Chevron Parity

**Change:** collapsible-panel-chevron-parity
**Branch:** feat/collapsible-panel-chevron-parity
**Archived:** 2026-07-21
**Mode:** Hybrid (engram + openspec files)

## Final Scope Delivered

8 screens gained (or, for `products.tsx`, refactored onto) a shared Material-style rotating
chevron affordance, matching Angular Material's `mat-expansion-panel` indicator:

1. `shared/components/ui/icons.tsx` — new shared `ChevronDownIcon({ className, isExpanded })`.
2. `sales/routes/products.tsx` — refactored from a one-off inline `<svg>` to the shared icon.
3. `expenses/routes/expenses-history.tsx` — day-panel chevron (additive).
4. `inventory/routes/entries.tsx` — day-panel chevron (additive).
5. `inventory/components/inventory-product-list.tsx` — category-panel chevron (additive; covers `available.tsx` transitively).
6. `sales/components/order-list.tsx` — order-panel chevron (additive; covers `orders.tsx`/today-orders transitively).
7. `sales/routes/orders.tsx` — date-group panel chevron (additive).
8. `sales/routes/credits.tsx` — date-group panel chevron (additive).
9. `sales/routes/today-stats.tsx` — restructured local `ExpansionPanel` from `<details>/<summary>` to controlled `div+button+useState` + chevron (original user-reported bug: "Cuadre del día" had no chevron at all).
10. `help/routes/tutorial.tsx` — restructured `STEPS.map` `<details>` block into a new `TutorialStep` component (`div+button+useState` + chevron). Locked in-scope during the tasks phase, overriding the proposal/design's original DEFER recommendation (ADR-4).

Plus a post-verify color-parity polish: `className="text-text-muted"` passed to `ChevronDownIcon`
at all 8 non-products call sites, closing WARNING 1 from the verify report (chevron previously
rendered in ambient/default text color instead of the muted gray `products.tsx` uses).

## Commits

| Commit | Content |
|---|---|
| `55773af` | WU1 — shared `ChevronDownIcon` + `products.tsx` refactor |
| `f67c126` | WU2 — 6 uniform list screens gain the chevron |
| `b2abd2b` | WU3 — `today-stats.tsx` `<details>` → controlled restructure + chevron |
| `47b1496` | WU4 — `tutorial.tsx` `<details>` → controlled restructure + chevron |
| `fad2139` | WU5 — full verification sweep (tests/typecheck/build) |
| `db8d2ae` | Post-verify color-parity polish — `className="text-text-muted"` on all 8 non-products call sites |

## Gate Results

- `pnpm test`: 1871/1871 passing (128 test files).
- `pnpm -C apps/web-store-pos exec tsc --noEmit`: clean, zero errors.
- `pnpm -C apps/web-store-pos build`: client + SSR + service-worker all succeeded.

## Review Verdicts

1. **sdd-verify** (Engram `sdd/collapsible-panel-chevron-parity/verify-report`, #1353): **PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNING, 0 SUGGESTION.
   - WARNING 1 (chevron color-parity gap, cosmetic/untested) — **RESOLVED** by commit `db8d2ae` (verified: `className="text-text-muted"` now passed at all 8 non-products call sites).
   - WARNING 2 (tasks.md review-workload forecast underestimated actual diff size by >2x — 575 changed lines vs. ~180-260 forecast) — process/calibration note only, not a code defect; no action required.
2. **Adversarial Angular↔React parity review** (separate pass, not a stored SDD artifact): **NO CONFIRMED DEFECTS.** One pre-existing, out-of-scope observation was raised and is recorded in the merged main spec's Non-Goals section: `tutorial.tsx` renders multiple independent React panels (one per tutorial step) where Angular's tutorial component renders a single panel. This divergence **predates this branch** and was **not introduced** by this change — the change only restructured the existing per-step `<details>` markup to div+button and added the chevron, preserving the pre-existing step count/structure. Left as a known, accepted condition for a future change if ever prioritized.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `collapsible-panel-chevron` | Created | New capability — no prior main spec existed. Delta spec copied as the full spec (4 requirements, 13 scenarios) into `openspec/specs/collapsible-panel-chevron/spec.md`, plus a color-parity clarification note and a Non-Goals section documenting the pre-existing tutorial.tsx panel-count divergence. |

## Archive Contents

- `proposal.md` — done
- `design.md` — done (ADR-4 tutorial deferral noted as superseded)
- `specs/collapsible-panel-chevron/spec.md` — done (delta, 4 ADDED requirements)
- `tasks.md` — done (24/24 tasks complete, incl. Phase 6 post-verify polish task added retroactively)
- `verify-report.md` — done (PASS WITH WARNINGS, both warnings addressed/noted)
- `archive-report.md` — this file

## Source of Truth Updated

`frontend-react/openspec/specs/collapsible-panel-chevron/spec.md` now reflects the shipped
behavior, including the color-parity fix and the pre-existing tutorial.tsx panel-count note.

## Filesystem Move — IMPORTANT CAVEAT

This archive sub-agent has only `Read`/`Write`/`Edit`/`Glob` tools available — **no Bash, no
file-move, and no file-delete capability**. I therefore:

1. Created the main spec at `frontend-react/openspec/specs/collapsible-panel-chevron/spec.md` (new).
2. **Copied** (via `Write`, not moved) `proposal.md`, `design.md`, `tasks.md`,
   `specs/collapsible-panel-chevron/spec.md`, and a reconstructed `verify-report.md` (this phase
   also had to author `verify-report.md` and `archive-report.md` on disk since the prior
   `sdd-verify` run only persisted its report to Engram, not to the filesystem) into
   `frontend-react/openspec/changes/archive/2026-07-21-collapsible-panel-chevron-parity/`.

**I could NOT remove the original active folder**
`frontend-react/openspec/changes/collapsible-panel-chevron-parity/` — it still exists on disk,
now duplicated by the archive copy. Someone with shell access must run, from the repo root:

```
git rm -r frontend-react/openspec/changes/collapsible-panel-chevron-parity
git add frontend-react/openspec/changes/archive/2026-07-21-collapsible-panel-chevron-parity
git add frontend-react/openspec/specs/collapsible-panel-chevron/spec.md
git commit -m "chore(sdd): archive collapsible-panel-chevron-parity"
```

No git commit was made by this agent — only files were read and written.

## Traceability

- Proposal: `sdd/collapsible-panel-chevron-parity/proposal` (Engram #1346)
- Spec: `sdd/collapsible-panel-chevron-parity/spec` (Engram #1348)
- Design: `sdd/collapsible-panel-chevron-parity/design` (Engram #1349)
- Tasks: `sdd/collapsible-panel-chevron-parity/tasks` (Engram #1350)
- Verify Report: `sdd/collapsible-panel-chevron-parity/verify-report` (Engram #1353)
- Archive Report: `sdd/collapsible-panel-chevron-parity/archive-report` (this document)

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived (pending the manual
filesystem cleanup noted above). Ready for the next change.
