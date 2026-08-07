# Archive Report — `e2e-stage-1-s2-03`

**Archived**: 2026-08-06
**Archived to**: `openspec/changes/archive/2026-08-06-e2e-stage-1-s2-03/`
**Verify verdict carried into this archive**: PASS WITH WARNINGS (0 CRITICAL, 1 WARNING, 1 SUGGESTION)
**Artifact store**: hybrid (filesystem + Engram)
**Branch**: `feat/e2e-s2-03`

## Project rule (carried verbatim)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/`. It touched no test code and no production code. The change itself was ADD-ONLY (commit `ecd837b8`: 1 new file `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs`, 2 tests, +98/−12 including `tasks.md` checkbox marks; zero existing test or production code touched), consistent with the rule.

## Final State (at close time)

Per the orchestrator's final-state handoff (most recent account of the change) and the persisted `verify-report` (Engram #633), both of which outrank intermediate snapshots (`apply-progress` #631, and any earlier `verify` iterations):

- **Delivered**: new E2E test file `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs` with 2 passing tests (commit `ecd837b8` on `feat/e2e-s2-03`):
  1. `OwnerAdmin_with_stores_feature_can_create_store_directly_and_repoints_selected_store_id` — documents R2.10 (201 + persistence + `SelectedStoreId` re-point).
  2. `Store_user_with_stores_feature_gets_400_not_403` — documents R2.11 (400 not 403 + no Store row).
- **Verification PASS** (focused 2/2, Stores-area regression 57/57, build 0 errors, `evidence_revision sha256:0dfed88b...`): the D-5 optional `NotAuthorized` error-key assert was replaced by a generic envelope assert (`Succeeded == false`, `Errors` non-empty) because `ErrorHandlerMiddleware.cs:61` rewrites `ApiException.ActionCode` into `Description` — asserting the key as written would be wrong. 1 non-blocking WARNING, 0 CRITICAL.
- **Ledger**: native `sdd-attempt` settled complete (token sha256:06e028d6...).
- **Add-only proven**: only the new test file + `tasks.md` checkbox marks; zero existing test or production code touched.

## Review Gate Disposition

No `reviews/` directory exists in the change folder; no `reviewPolicy`, `reviewLedger`, `reviewReceipt`, `reviewState`, or `reviewBundle` artifacts exist in the repository for this change. No review governs this change → gate disposition **`disabled/unmanaged`**: there is no review policy or receipt to validate. The bounded runtime authority (native attempt ledger) settled `complete` per the orchestrator's final-state handoff. This matches the repo precedent (`2026-08-06-e2e-stage-1-s1-02` and `2026-08-06-e2e-playwright-register-s1-01` carry no review artifacts either).

## Task Completion Gate

The persisted `tasks.md` shows all 12 implementation tasks checked `[x]` (12/12, 0 unchecked) at archive time — verified by direct read of `openspec/changes/archive/2026-08-06-e2e-stage-1-s2-03/tasks.md` before and after the move. No stale-checkbox reconciliation was required. (Remaining `- [ ]` items in `design.md` "Open Questions" and `proposal.md` "Success Criteria" are planning-phase notes, not implementation tasks; they were carried verbatim into the archive as-is, preserving the audit trail.)

## Spec Sync (openspec)

**Contradiction recorded — launch prompt vs. repository evidence**: the launch prompt asserted "Spec has NO pre-existing canonical spec for authorization-e2e; archive should create specs/authorization-e2e/spec.md canonical". Repository evidence contradicts this: `openspec/specs/authorization-e2e/spec.md` **already existed** (tracked in git, created by the original `authorization-e2e` change, archived `2026-07-24-authorization-e2e`). Per Final-State Authority, repository evidence and the higher-ranked launch-prompt final-state facts were checked against each other; the file's existence is verifiable on disk and in git history (`openspec/specs/authorization-e2e/spec.md`, tracked). The merge proceeded against the **existing** canonical spec (per the skill: "If Main Spec Exists → apply the delta"), rather than creating a duplicate. This contradiction is recorded explicitly, not resolved silently.

Delta spec `specs/authorization-e2e/spec.md`: 2 ADDED requirements (R2.10, R2.11, 1 scenario each) under the R2 Stores enforcement window; MODIFIED/REMOVED/RENAMED: none. Merge performed into `openspec/specs/authorization-e2e/spec.md`:

- R2.10 and R2.11 appended as full requirement blocks (verbatim from the delta, including scenarios and the embedded H-10 coupling notes), preserving R1–R4 and all pre-existing requirements untouched.
- Header updated: `Origin` extended with `(extended by e2e-stage-1-s2-03, 2026-08-06)`, `Last Updated` → 2026-08-06.
- Verification Criteria: scenario total updated 17 → 19 (17 baseline + R2.10 + R2.11) and a new criterion 8 added carrying the H-10 coupling warning verbatim (when H-10 is fixed — action-level `[HasPermission(SuperAdmin)]` on the POST action or removal of the re-point branch at `CreateStoreCommand.cs:57-61` — R2.10/R2.11 and both `StoreCreateAuthorizationGapTests` tests MUST be updated in the same change).
- Implementation section: `StoreCreateAuthorizationGapTests` added to the test-class list; final evidence (focused 2/2, Stores regression 57/57, build 0 errors, evidence revision sha256:0dfed88b...) recorded with attribution to the launch-prompt final-state facts.

## Archive Contents

- `proposal.md` ✅ — verbatim copy
- `explore.md` ✅ — verbatim copy (sdd-explore artifact)
- `design.md` ✅ — verbatim copy (includes D-1..D-5 and Open Questions)
- `tasks.md` ✅ — verbatim copy (12/12 `[x]`, 0 unchecked implementation tasks)
- `verify-report.md` ✅ — verbatim copy of the final PASS WITH WARNINGS report
- `specs/authorization-e2e/spec.md` ✅ — verbatim copy of the delta spec
- `archive-report.md` ✅ — this report

## Source of Truth Updated

`openspec/specs/authorization-e2e/spec.md` now reflects the new behavior coverage (R2.10/R2.11 pinned by E2E) — merged into the pre-existing canonical spec, not created (see contradiction note above).

## Traceability — Engram observation IDs

| Artifact | Observation ID | Topic key |
|---|---|---|
| Proposal | #626 | `sdd/e2e-stage-1-s2-03/proposal` |
| Tasks | #630 | `sdd/e2e-stage-1-s2-03/tasks` |
| Apply progress | #631 | `sdd/e2e-stage-1-s2-03/apply-progress` |
| Verify report | #633 | `sdd/e2e-stage-1-s2-03/verify-report` |
| Archive report (this document) | (assigned on save) | `sdd/e2e-stage-1-s2-03/archive-report` |

Note: no Engram observation was found for the delta spec or the design artifact of this change (searched `sdd/e2e-stage-1-s2-03/spec` and `.../design`; no matches). Spec and design live in the filesystem archive only. Related passive captures: #627 (canonical spec uses compact R2.x bullets; delta numbering continues at R2.10/R2.11), #628 (H-10 coupling embedded in each requirement text), #632 (ErrorHandlerMiddleware ActionCode rewrite discovery).

## Filesystem operation note for the orchestrator

The active change folder `openspec/changes/e2e-stage-1-s2-03/` was **moved** (not copied) to `openspec/changes/archive/2026-08-06-e2e-stage-1-s2-03/` — the active changes directory no longer lists this change (verified: `Test-Path` → False). `git status` shows the deletion of the old paths and the untracked new archive folder; the orchestrator should stage the move (`git add -A openspec/`) as part of the commit that lands this archive.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. The coupling item that must never be closed silently — when H-10 is fixed, R2.10/R2.11 and both tests MUST be updated in the same change — is recorded in the delta requirements, the canonical spec (Verification Criteria 8), the design Open Questions, and this report. Ready for the next change.
