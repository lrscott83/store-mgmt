# Archive Report — sidebar-menu-parity (2026-07-20)

**Change**: sidebar-menu-parity
**Mode**: Hybrid (Engram + openspec)
**Implementation commit**: fcbbe98
**Verify verdict**: PASS (0 CRITICAL, 0 WARNING, 3 SUGGESTION — non-blocking)
**Adversarial parity review**: PASS (code-only, vs Angular source)

## Engram Source Observations (traceability)

| Artifact | Observation ID | Topic key |
|---|---|---|
| Proposal | #1287 | `sdd/sidebar-menu-parity/proposal` |
| Spec (delta) | #1288 | `sdd/sidebar-menu-parity/spec` |
| Tasks | #1289 | `sdd/sidebar-menu-parity/tasks` |
| Verify report | #1291 | `sdd/sidebar-menu-parity/verify-report` |

No `design.md`/design topic exists for this change (small parity fix; spec + tasks only, consistent with verify-report's noted deviation-free design coherence).

## Spec Sync

`openspec/specs/sidebar-navigation/spec.md` did not exist prior to this change. The delta
spec graduates to the canonical spec for the new `sidebar-navigation` capability:

- Title normalized: "Sidebar Navigation Specification (Delta)" → "Sidebar Navigation Specification"
- `## ADDED Requirements` → `## Requirements` (canonical convention; matches other graduated
  specs such as `openspec/specs/order-service/spec.md`)
- `## Out of Scope` → `## Non-Requirements (Explicit Exclusions)` (matches convention used in
  `openspec/specs/admin-features/spec.md`)
- All 4 requirements / 8 scenarios carried over verbatim (Sales Group Item Set and Order,
  Inventory Group Item Set and Order, Item Visibility Follows Existing Authorization Logic,
  No Sidebar Profile Group).

## Delivered

Single production file `menu-config.ts` (4 rows added: TODAY_CREDITS, CREDITS_HISTORY,
ORDERS_HISTORY, ENTRIES_HISTORY; MENU.PROFILE group removed) plus `sidebar.test.tsx`
coverage. Implementation commit `fcbbe98`. 17/17 tasks complete (7 RED, 6 GREEN, 4
verification). Full suite 1832/1832 green, `tsc --noEmit` clean, production build succeeds.

## Archive Contents

- proposal.md ✅
- specs/sidebar-navigation/spec.md ✅ (delta, as authored)
- tasks.md ✅ (17/17 complete)
- verify-report.md ✅ (PASS)
- archive-report.md ✅ (this file)

No `design.md` — none was produced for this change (small, single-file parity fix).

## Known Non-Blocking Follow-ups (carried from verify-report, not re-opened)

1. Dead i18n key `MENU.PROFILE` in `es.ts:119` — unreferenced, harmless, deferred cleanup.
2. Two stale doc references to `MENU.PROFILE` in the unrelated legacy `frontend-react/openspec/`
   tree — documentation only, no action needed.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. This closes the
last known sidebar-parity gap in the Angular→React migration.

## Filesystem Note (tool-constraint disclosure)

This archive sub-agent's toolset in this session did not include a file-delete/move
primitive (no Bash tool available) — only Read/Write/Edit/Glob. Consequently:

- All 4 source artifacts (proposal.md, specs/sidebar-navigation/spec.md, tasks.md,
  verify-report.md) were **copied** (via Write) into
  `openspec/changes/archive/2026-07-20-sidebar-menu-parity/`, and this archive-report.md
  was added alongside them.
- The **original** `openspec/changes/sidebar-menu-parity/` directory was **NOT deleted** —
  it still exists on disk alongside the new archive copy.
- The orchestrator MUST delete `openspec/changes/sidebar-menu-parity/` (e.g. `git rm -r
  openspec/changes/sidebar-menu-parity/`) as part of staging the archive commit, so the
  change folder is truly moved (not duplicated) in the final commit.
