# Archive Report — `e2e-stage-1-s1-02`

**Archived**: 2026-08-06
**Archived to**: `openspec/changes/archive/2026-08-06-e2e-stage-1-s1-02/`
**Verify verdict carried into this archive**: PASS (0 CRITICAL, 0 WARNING, 2 SUGGESTIONs)
**Artifact store**: hybrid (filesystem + Engram)
**Branch**: `feat/e2e-s1-02`

## Project rule (carried verbatim)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/`. It touched no test code and no production code. The change itself was ADD-ONLY (+21/-0 on `AuthLoginFailureTests.cs`, zero production files), consistent with the rule.

## Final State (at close time)

Per the orchestrator's final-state handoff (most recent account of the change) and the persisted `verify-report` (Engram #623), both of which outrank intermediate snapshots:

- **Delivered**: new E2E test `Login_with_inactive_store_returns_403` in `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs` (commit `c7cb8cee`). ADD-ONLY: +21/-0, zero production code.
- **Verification PASS**:
  - `--filter FullyQualifiedName~AuthLoginFailureTests` → 3/3 passed
  - `--filter FullyQualifiedName~Auth` → 69/69 passed (no regression)
  - Ran against real PostgreSQL `smca_test`; server log confirmed the `Store.Inactive` branch was exercised ("no active store")
- **Native attempt ledger**: settled `passed`, complete (33 changed lines, within budget).
- **Verify-report findings**: CRITICAL 0, WARNING 0, blockers 0.
- **Spec compliance**: 1/1 baseline requirements, 3/3 baseline scenarios compliant; grep `Store.Inactive` in the E2E suite: exactly 1 match (`AuthLoginFailureTests.cs:76`).

## Exceptional Task Reconciliation (recorded per Task Completion Gate)

At archive time the persisted `tasks.md` showed three unchecked **Phase-2 (Verification)** checkboxes — 2.1, 2.2, 2.3 — while the verify phase's own report (Engram #623, file `verify-report.md`) documents all 9 tasks complete ("Tasks complete | 9", "Tasks incomplete | 0") with runtime evidence. This is a stale-checkbox case for completed work: the verify phase completed 2.1–2.3 but did not update `tasks.md`. No Phase-1 implementation task was unchecked (1.1–1.6 already checked by reconcile commit `7b1e25df`).

Per the Task Completion Gate's exceptional-repair path, the orchestrator's final-state handoff ("The change is COMPLETE at close time", "Record the final state faithfully") is the instruction to reconcile; the proof for each reconciled task:

- **2.1** Filtered E2E `FullyQualifiedName~Auth` — verify-report: 69/69 passed, exit 0, real DB.
- **2.2** Full suite `SMCA.sln` — NOT run literally: the declared `dotnet test` build step hit the MSB3027 lock (dev server `SMCA.WebApi (37244)` holds `bin\Debug\net8.0\*.dll`); per orchestrator instruction the verify phase built the E2E project with `--no-dependencies` (exit 0) and produced the equivalent evidence: Auth regression filter 69/69 + ADD-ONLY diff proof (+21, only the test file). Verify declared it complete.
- **2.3** `git diff --stat` + grep — verify-report: only `AuthLoginFailureTests.cs` (+21) plus openspec artifacts, zero production files; `Store.Inactive` exactly 1 match.

The three boxes were checked at archive time (2026-08-06, with a dated annotation on each). The archived audit trail therefore contains no stale unchecked tasks for completed work. Archive marked **intentional-with-warnings** for this exceptional reconciliation only.

## Review Gate Disposition

Native status (`gentle-ai sdd-status`, 2026-08-06) reports `artifactStore: openspec`, `actionContext.mode: repo-local` (not workspace-planning), and NO review artifacts: `reviewPolicy`, `reviewLedger`, `reviewReceipt`, `reviewState`, `reviewBundle` all missing; no `reviews/` dir in the change folder; `reviewGate` omitted from status until final archive gating runs. No review governs this change → gate disposition **`disabled/unmanaged`**: there is no review policy or receipt to validate, and no prior archive in this repository carries review artifacts (cf. `2026-08-06-e2e-playwright-register-s1-01`). The bounded runtime authority (native attempt ledger) settled `passed`, complete.

## Spec Sync (openspec)

Delta spec `specs/auth-login-e2e/spec.md`: 1 ADDED required requirement (Req 1, 3 scenarios) + 1 ADDED optional requirement (Req 2, 1 scenario, marked OPTIONAL / NOT baseline); MODIFIED/REMOVED/RENAMED: none. Main spec `openspec/specs/auth-login-e2e/` did not exist → created `openspec/specs/auth-login-e2e/spec.md` as the canonical capability spec, preserving ALL requirements and scenarios verbatim from the delta, following the repo's established convention (main spec format as in archive `2026-08-06-e2e-playwright-register-s1-01`). Req 2 is carried into the main spec with an explicit archive status note (OPTIONAL, not delivered).

## Out of Scope / Not Delivered (explicit, per orchestrator handoff)

- `docs/testing/e2e-stage-1/S1-02.md:72,80` 🆕 → covered flip and README status update: **NOT included** in this archive — owned by a later orchestrator change (`e2e-stage-1-frontend-plans`).
- StoreUser sibling `[Fact]` (spec Req 2, `AuthenticationService.cs:127-128`): **NOT part of the baseline** — user did not opt in. Carried into the main spec as an explicitly marked OPTIONAL requirement.
- Rate-limit 429 assertion: out of scope (unreachable under `Testing` env, README H-12).

## Traceability

- Engram `sdd/e2e-stage-1-s1-02/apply-progress` — observation **#622**
- Engram `sdd/e2e-stage-1-s1-02/verify-report` — observation **#623**
- Engram `sdd/e2e-stage-1-s1-02/archive-report` — this report (saved at archive time)
- Filesystem archive: `openspec/changes/archive/2026-08-06-e2e-stage-1-s1-02/` (proposal, exploration, design, tasks, verify-report, specs/, archive-report)
- Main spec: `openspec/specs/auth-login-e2e/spec.md`
