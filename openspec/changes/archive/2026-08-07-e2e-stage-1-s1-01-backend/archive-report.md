# Archive Report — `e2e-stage-1-s1-01-backend`

**Archived**: 2026-08-07 (folder prefix per orchestrator instruction; archive executed 2026-08-08)
**Archived to**: `openspec/changes/archive/2026-08-07-e2e-stage-1-s1-01-backend/`
**Verify verdict carried into this archive**: PASS (0 CRITICAL, 0 WARNING, 2 SUGGESTIONs, verdict `pass`)
**Artifact store**: hybrid (filesystem + Engram) — orchestrator-reported mode `both`
**Branch**: `feat/e2e-stage-1-s1-01-backend`

## Project rule (carried verbatim)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/` (move + checkbox reconciliation). It touched no test code, no production code, and made no git commit (orchestrator commits/pushes after this report). The change itself was strictly ADD-ONLY: one new E2E test file (+309) and a docs checkbox correction, zero production files, zero existing E2E tests modified.

## Final State (at close time)

Per the orchestrator's final-state handoff (most recent account of the change) and the persisted `verify-report` (Engram #658), both of which outrank intermediate snapshots:

- **Delivered**: new ADD-ONLY E2E test file `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDataAssertionsTests.cs` (309 lines, sealed, `[Collection("e2e")]`) closing the 6 S1-01 register data-assertion gaps: (1) `SelectedStoreId` set to new store id, (2) owner `Description` composed from store name, (3) store `Description == "Tienda de prueba"` + `Approved == false`, (4) store receives ALL available modules incl. ≥1 paid (runtime-derived, no hardcoded counts), (5) register `AuthDto` carries no refresh token, (6) matching reseller `Code` creates `ReSellerOwner` with discounts copied.
- **Docs**: `docs/testing/e2e-stage-1/S1-01.md:53-59` — exactly 6 UNCOVERED checkboxes flipped `[x]`→`[ ]` + note; lines 52 and 57 kept `[x]`.
- **Commit**: `edcf7397` — `test(e2e): assert S1-01 register data facts (ADD-ONLY)` — verified present in git with exactly the expected message and ADD-ONLY stat: `AuthRegisterDataAssertionsTests.cs +309`, `S1-01.md 14 ±`, total 317 insertions / 6 deletions. No production source, no existing E2E test in the diff.
- **Verification PASS (GREEN)**: filtered run 6/6 passed (exit 0); build exit 0; full solution per-project: Domain.UnitTests 22/22 ✅, Application.Tests 330/330 ✅, E2ETests 319/320 ⚠️.
- **The only full-suite E2E failure** — `Billing.ToCollectTests.ReSeller_sees_own_stores_only` (`Expected ownInResult not to be <null>` at `ToCollectTests.cs:123/133`) — is **pre-existing and unrelated**, fails in isolation, last touched by unrelated commit `4eb56c07`. Per CLAUDE.md it is information, not a blocker: documented as separate future work, left untouched. **Not resolved by this change; carried forward.**

## Exceptional Task Reconciliation (recorded per Task Completion Gate)

At archive time the persisted `tasks.md` showed ONE unchecked checkbox — **4.4 (commit)** — while `verify-report` (Engram #658) documents it as the verified deliverable ("Tasks complete | 9", "Tasks incomplete | 0", task 4.4 verified as commit `edcf7397`) and the apply-progress (Engram #656) explicitly records "4.4 (commit) left to orchestrator".

Per the Task Completion Gate's exceptional-repair path, the orchestrator's launch prompt granted the exception ("tasks complete (all [x] except the orchestrator-owned commit task if present)") and instructed archive-time reconciliation backed by proof. Independent proof at archive time:

- `git log` confirms commit `edcf7397` exists on `feat/e2e-stage-1-s1-01-backend` with the exact message `test(e2e): assert S1-01 register data facts (ADD-ONLY)`.
- `git show edcf7397 --stat` confirms ADD-ONLY scope: `AuthRegisterDataAssertionsTests.cs | 309 +++++`, `S1-01.md | 14 +-` — 2 files, 317 insertions, 6 deletions, zero production files, zero existing E2E tests.

Checkbox 4.4 was checked at archive time (2026-08-07, with a dated annotation on the line in the archived `tasks.md`). The archived audit trail therefore contains no stale unchecked tasks for completed work. Archive marked **intentional-with-warnings** for this exceptional reconciliation only — identical disposition to sibling archive `2026-08-06-e2e-stage-1-s1-02`.

## Review Gate Disposition

No structured status with `reviewGate` was supplied in the orchestrator launch prompt; no review artifacts exist for this change (no `reviews/` dir in the change folder, no review transaction/ledger/receipt/gate-context topics in Engram). No review governs this change → gate disposition **`disabled/unmanaged`**: there is no review policy or receipt to validate, consistent with every prior archive in this repository (cf. `2026-08-06-e2e-stage-1-s1-02` and `2026-08-06-e2e-stage-1-auth-inv-01`).

## Spec Sync (openspec) — EXPLICIT: NONE performed

The proposal declared **New Capabilities: None** and **Modified Capabilities: None** — this change is coverage closure without a spec delta. Verified at archive time: there is **no `specs/` directory** in the change folder (neither pre- nor post-move), so there are **no delta specs to merge**. Per OpenSpec convention, when a change folder contains no delta specs, archive performs no main-spec sync: **no canonical spec was created and no canonical spec was modified**. The formal counts remain 0 requirements / 0 scenarios (`verify-report` `requirements: 0/0`, `scenarios: 0/0`). No spec was invented for this change; coverage state lives in `docs/testing/e2e-stage-1/` and the E2E suite.

## Out of Scope / Not Delivered (explicit, per orchestrator handoff)

- `Billing.ToCollectTests.ReSeller_sees_own_stores_only` pre-existing flake: **NOT fixed** in this change — documented as separate future work per CLAUDE.md (E2E tests are untouchable without explicit authorization; the failure is information, not an obstacle).
- Frontend/Playwright, rate-limit 429, `PaymentStartDate`/`ExpiresIn` re-assertion: out of scope (already covered elsewhere).

## Traceability

- Engram `sdd/e2e-stage-1-s1-01-backend/explore` — observation **#652**
- Engram `sdd/e2e-stage-1-s1-01-backend/proposal` — observation **#653**
- Engram `sdd/e2e-stage-1-s1-01-backend/design` — observation **#654**
- Engram `sdd/e2e-stage-1-s1-01-backend/tasks` — observation **#655**
- Engram `sdd/e2e-stage-1-s1-01-backend/apply-progress` — observation **#656**
- Engram `sdd/e2e-stage-1-s1-01-backend/verify-report` — observation **#658**
- Engram `sdd/e2e-stage-1-s1-01-backend/archive-report` — this report (saved at archive time)
- Filesystem archive: `openspec/changes/archive/2026-08-07-e2e-stage-1-s1-01-backend/` (proposal, exploration, explore, design, tasks, verify-report, archive-report)
- Deliverable commit: `edcf7397` (verified at archive time via `git log` + `git show --stat`)

## Final State Summary

Change **COMPLETE** at close time: 6 new E2E facts delivered ADD-ONLY (commit `edcf7397`), verify **PASS (GREEN)** on real PostgreSQL, no production code touched, no existing E2E test touched, pre-existing `ReSeller_sees_own_stores_only` flake documented as separate future work. SDD cycle closed.
