# Archive Report — `e2e-stage-1-b1-reseller-clock`

**Archived**: 2026-08-08 (folder prefix per orchestrator instruction; archive executed 2026-08-08)
**Archived to**: `openspec/changes/archive/2026-08-08-e2e-stage-1-b1-reseller-clock/`
**Verify verdict carried into this archive**: PASS (0 CRITICAL, 0 WARNING caused-by-change, 2 SUGGESTIONs, verdict `pass`, blockers 0) — validated with `gentle-ai sdd-verify-validate --requirements 0 --scenarios 0`
**Artifact store**: hybrid (filesystem + Engram) — orchestrator-reported mode `both`
**Branch**: `feat/e2e-stage-1-s1-01-backend`

## Project rule (carried verbatim)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/` (folder move + stale-checkbox reconciliation). It touched no test code, no production code, and made no git commit (orchestrator commits after this report). The change itself was strictly test-only: +3 lines in one E2E test file (2-line comment + 1 clock pin), zero production files, zero other E2E tests touched.

## Change Summary

**Source**: `docs/testing/e2e-stage-1/plan-backend.md` § B-1
**Type**: Test-only determinism fix — the E2E test `ToCollectTests.ReSeller_sees_own_stores_only` had expired by calendar: today (2026-08-08) is past the last valid PorVencer window day (2026-08-06) for the seeded store (`PaymentStartDate = 2026-06-01`, config 1/5/5), so the handler resolved it to `Vencido` and dropped it. The test **expired, it did not break** — its intent and assertions were correct.

**Fix**: Deterministic time control, not test weakening. Single flat `using var` clock pin as the FIRST statement of `ReSeller_sees_own_stores_only`, matching sibling style (:139, :200):

```csharp
// Pin "today" to 2026-07-30 → PorVencer for store seeded 2026-06-01 (window 2026-07-27..2026-08-01, trial=1/grace=5/dueSoon=5)
using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero));
```

Window math (StoreBillingUtils.cs:24-39): next due = 2026-08-01; 2026-07-30 ≥ 2026-07-27 → `PorVencer` → kept by handler. Double-Pin trap avoided: one flat `using var`, never nested.

## Capabilities

**New Capabilities: None. Modified Capabilities: None. Removed Capabilities: None.**

This change declares no spec delta — it is a test determinism fix under the existing capability "Fix ReSeller to-collect test expiry". Formal requirement/scenario counts: **0 requirements / 0 scenarios** (`verify-report` `requirements: 0/0`, `scenarios: 0/0`). The acceptance contract is the proposal's 2 success criteria, both PASS (see Evidence).

## Status

**ARCHIVED** — SDD cycle complete.

- Proposal → ✅
- Spec delta → N/A (Capabilities None; no `specs/` directory — verified pre- and post-move)
- Implementation → ✅ (+3 lines, exactly the locked authorization wording)
- Verification → ✅ PASS (focused + full suite; sole failure proven pre-existing/unrelated)
- Archive → ✅ this report

## Evidence (at close time)

Per the orchestrator's final-state handoff (most recent account of the change) and the persisted `verify-report` (#665), which outrank intermediate snapshots:

| Evidence | Result |
|----------|--------|
| Verify validation | `gentle-ai sdd-verify-validate --requirements 0 --scenarios 0` → valid: true, verdict: pass, blockers 0 |
| Source change | Exactly +3 lines in `backend/src/SMCA.WebApi.E2ETests/Billing/ToCollectTests.cs` (2-line comment + `using var` Pin as first statement of `ReSeller_sees_own_stores_only`) |
| Focused test | `ReSeller_sees_own_stores_only` passes focused (exit 0, 1/1) AND inside both full runs |
| Full Domain.UnitTests | 22/22 ✅ |
| Full Application.Tests | 330/330 ✅ |
| Full E2E suite | 319/320 ⚠️ — sole failure `UsersListTests.List_includeInactive_true_includes_inactive_user`, **pre-existing, unrelated** |
| `git diff --stat` | 1 file, 3 insertions, 0 deletions — no assertions, seed dates, config, other tests, or production code touched |

Note on wording drift: proposal/tasks.md estimated "+2 lines" (1-line comment), but the locked authorization comment block is 2 lines → **+3 total**. Flagged and accepted in apply-progress; the locked wording supersedes the artifact estimate — not drift. The diff matches the locked authorization verbatim.

## Pre-existing UsersList Flake (follow-up item — NOT resolved here)

`UsersListTests.List_includeInactive_true_includes_inactive_user` (Users feature, `UsersListTests.cs:91`) fails in BOTH full-suite runs (319/320) but passes in isolation. Proven pre-existing by apply's stash A/B check: it fails identically on the pristine tree (change stashed) and passes when run alone → full-suite-order flake / DB pollution in the Users feature, entirely disjoint from this Billing clock-pin change. Not caused by, and not touched by, this change (E2E untouchable rule; out of scope per orchestrator authorization).

**Follow-up**: requires its own change/proposal with separate user authorization. Do not chase within this cycle.

Also documented as follow-up (out of scope, from verify-report SUGGESTIONs): B-2 moving-window dates (ToCollectTests.cs:145, PaymentMoneyTests.cs:34/66/104/141, ExportOfflineRosterTests.cs:315/384, ResellerCommissionsTests.cs:59) remain unfixed and will expire the same way — each needs explicit authorization.

## Exceptional Task Reconciliation (recorded per Task Completion Gate)

At archive time the persisted `tasks.md` showed ONE unchecked checkbox — **2.2 (full suite)** — while `verify-report` (#665) marks it complete ("Tasks complete | 1.1 ✅, 2.1 ✅, 2.2 ✅ (met: sole failure proven pre-existing/unrelated; verified independently here)") and the apply-progress (#664) records full execution evidence (Domain 22/22, Application.Tests 330/330, E2E 319/320 + stash A/B pre-existing proof). Task 2.2's DoD "full solution green" is not literally met because of one pre-existing unrelated E2E failure — the same classification the apply agent proved and the task instruction directs to record as evidence, not fix.

Per the Task Completion Gate's exceptional-repair path, the orchestrator's launch prompt granted the exception (explicit final-state facts: verdict PASS valid, blockers 0; full-suite state; sole E2E failure pre-existing, out of scope, "do not fix, do not chase") and instructed archive. Independent proof at archive time: `verify-report` #665 (2.2 ✅ met-with-known-pre-existing-failure) + `apply-progress` #664 (execution evidence, stash A/B) + orchestrator final-state facts (highest rank).

Checkbox 2.2 was checked at archive time (2026-08-08, with a dated annotation on the line in the archived `tasks.md`). The archived audit trail therefore contains no stale unchecked tasks for completed work. Archive marked **intentional-with-warnings** for this exceptional reconciliation only — identical disposition to sibling archive `2026-08-07-e2e-stage-1-s1-01-backend`.

## Review Gate Disposition

No structured status with `reviewGate` was supplied in the orchestrator launch prompt; no review artifacts exist for this change (no `reviews/` dir in the change folder, no review transaction/ledger/receipt/gate-context topics in Engram). No review governs this change → gate disposition **`disabled/unmanaged`**: there is no review policy or receipt to validate, consistent with every prior archive in this repository.

## Spec Sync (openspec) — EXPLICIT: NONE performed

The proposal declared **New Capabilities: None** and **Modified Capabilities: None** — this change is a test-only determinism fix without a spec delta. Verified at archive time: there is **no `specs/` directory** in the change folder (neither pre- nor post-move), so there are **no delta specs to merge**. Per OpenSpec convention, when a change folder contains no delta specs, archive performs no main-spec sync: **no canonical spec was created and no canonical spec was modified**. The formal counts remain 0 requirements / 0 scenarios. No spec was invented for this change; coverage state lives in `docs/testing/e2e-stage-1/` and the E2E suite.

## Out of Scope / Not Delivered (explicit, per orchestrator handoff)

- `UsersListTests.List_includeInactive_true_includes_inactive_user` pre-existing flake: **NOT fixed** — documented as separate future work per CLAUDE.md (E2E tests untouchable without explicit authorization; the failure is information, not an obstacle).
- Any other E2E test, incl. B-2 moving-window dates: out of scope, requires separate explicit authorization.
- Production source code: untouched (backend ADD-only rule).

## Traceability

- Engram `sdd/e2e-stage-1-b1-reseller-clock/explore` — observation **#661**
- Engram `sdd/e2e-stage-1-b1-reseller-clock/proposal` — observation **#662**
- Engram `sdd/e2e-stage-1-b1-reseller-clock/tasks` — observation **#663**
- Engram `sdd/e2e-stage-1-b1-reseller-clock/apply-progress` — observation **#664**
- Engram `sdd/e2e-stage-1-b1-reseller-clock/verify-report` — observation **#665**
- Engram `sdd/e2e-stage-1-b1-reseller-clock/archive-report` — this report (saved at archive time)
- Filesystem archive: `openspec/changes/archive/2026-08-08-e2e-stage-1-b1-reseller-clock/` (exploration, explore, proposal, tasks, apply-progress, verify-report, archive-report)

## Final State Summary

Change **COMPLETE** at close time: +3-line clock pin (2-line comment + single flat `using var`) as the first statement of `ReSeller_sees_own_stores_only` delivered test-only; verify **PASS** on real PostgreSQL (focused 1/1 exit 0; green inside both full runs; Domain 22/22, Application.Tests 330/330, E2E 319/320 with the sole failure proven pre-existing/unrelated); no production code touched, no other E2E test touched. Pre-existing `UsersList` flake documented as follow-up work with separate authorization. SDD cycle closed.
