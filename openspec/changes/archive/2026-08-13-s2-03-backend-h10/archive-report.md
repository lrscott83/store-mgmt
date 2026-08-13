# Archive Report: s2-03-backend-h10 — H-10: POST /v1/stores SuperAdmin-only

**Change**: `s2-03-backend-h10`
**Archived**: 2026-08-13
**Branch**: `fix/s2-03-backend-h10`
**Artifact store**: hybrid (openspec filesystem + Engram)
**Archived to**: `openspec/changes/archive/2026-08-13-s2-03-backend-h10/`
**Archive mode**: normal (no partial archive, no stale-checkbox reconciliation)

## Summary

Closed defect H-10: `POST /v1/stores` admitted OwnerAdmin (201 + Store/StoreModule persistence + SelectedStoreId re-point) and rejected StoreUser with 400 instead of 403. The action is now SuperAdmin-only — all non-SuperAdmins receive 403 Forbidden with no persistence and no re-point, consistent with the 4 sibling SuperAdmin-only Stores actions.

## Requirements Delivered (final state, all COMPLIANT)

| Req | Delta action | Final rule | Evidence |
|-----|--------------|------------|----------|
| R2.10 | MODIFIED | OwnerAdmin with feature 73 → 403, no persistence, no re-point | `StoreCreateAuthorizationGapTests > OwnerAdmin_with_stores_feature_gets_403_and_no_side_effects` |
| R2.11 | MODIFIED | StoreUser with feature 73 → 403, not 400 | `StoreCreateAuthorizationGapTests > Store_user_with_stores_feature_gets_403_not_400` |
| R2.12 | ADDED | SuperAdmin → 201 + persistence (regression guard) | `StoreCreateTests > Create_with_valid_payload_persists_store_and_modules` (+ `Create_without_token_returns_401`) |
| R2.13 | ADDED | Auto-registration one-step intact (S1-01 regression guard) | `StoreCreationTrialTests` 18/18 + `AuthRegisterDataAssertionsTests` 6/6 |
| R2.14 | ADDED | Handler defense in depth → 403 for direct callers | `CreateStoreCommand.cs` guard `IsSuperAdmin` + `HttpStatusCode.Forbidden` |

## Final State (close-of-cycle, per Final-State Authority)

- **Apply**: 3 commits on `fix/s2-03-backend-h10` — `93c829c2` test(e2e), `96fa69d3` feat(store) controller, `115515ab` feat(store) handler. Runtime attempt settled `passed` (62 changed lines). Scope exactly 3 files per `git diff f0a2f56b..115515ab --name-only`: `StoresController.cs`, `CreateStoreCommand.cs`, `StoreCreateAuthorizationGapTests.cs`.
- **Verify**: PASS — `gentle-ai sdd-verify-validate --input .../verify-report.md --requirements 5 --scenarios 5` → `valid: true, verdict: pass`; evidence revision `sha256:d089177b127036d2b57a14bab24f312651d4ae23c3849ed0ba45350c995f5aa0`. Runtime attempt settled `complete`.
- **Test evidence**: gap 2/2 · Stores 61/61 · StoreCreationTrial 18/18 · AuthRegisterDataAssertions 6/6 · `dotnet build backend/src/SMCA.sln` 0 errors (16 pre-existing warnings).
- **CRITICAL findings**: 0. **WARNING findings**: 0.
- **Tasks**: 9/9 complete; archived `tasks.md` has zero unchecked implementation tasks.
- **Design decisions**: D1 action-level `[HasPermission(StoreRoleFeatures.SuperAdmin)]`; D2 handler `IsSuperAdmin` + `Forbidden`, re-point branch removed; D3 both gap E2E tests rewritten to 403 + no persistence + no re-point. All followed.
- **Out of scope (documented, pre-existing)**: `StoresController.cs:92-94` 200-wrapped `Failure(NotCreated, 400)`; migration/audit of existing OwnerAdmin-created stores; i18n message; frontend; other Stores actions.
- **Info notes**: FK 23503 cleanup noise transient in RED phase only (GREEN cleanup correct: nothing persists); orphaned `_userRepository` DI field removed in handler commit (prevents CS0414).

## Spec Sync (delta → main spec)

Delta `specs/authorization-e2e/spec.md` applied to `openspec/specs/authorization-e2e/spec.md`:

- **R2.10 replaced** (403 semantics) and **R2.11 replaced** (403 not 400) — from delta MODIFIED, verbatim including "(Previously: ...)" provenance notes.
- **R2.12, R2.13 added** — from delta ADDED, verbatim. **R2.14 added** — declared MODIFIED in the delta but no base counterpart existed (design/verify classify it as ADDED); merged as a new requirement, block verbatim.
- **Verification criterion #8 replaced** with the SuperAdmin-only rule (delta "Verification Criteria" section).
- **Criterion #1 scenario count updated** 19 → 22 (17 baseline + R2.10..R2.14) — mechanical consequence of the merge, recorded here for transparency.
- **Header provenance updated**: `Last Updated` → 2026-08-13, origin extended, delivery note added following the R1.7 delivery-note precedent.
- All other requirements (R1.x, R2.1–R2.9, R3, R4) preserved untouched.

**No deltas for `billing`, `billing-e2e-coverage`, `store-service`**: their `POST /v1/stores` actors are SuperAdmins (exploration + verify confirmed; grep of base specs found no H-10/coupling references). Delta "Related Specifications" section states they remain valid.

## Archive Move

Change folder moved to `openspec/changes/archive/2026-08-13-s2-03-backend-h10/` via shell `mv` (folder untracked — `git ls-files` empty, `git mv` not applicable). Mandatory `diff -r` readback (pre-move recursive snapshot vs archived tree): **empty output, exit 0 — byte-identical**. All 6 artifacts archived: `proposal.md`, `exploration.md`, `design.md`, `tasks.md`, `verify-report.md`, `specs/authorization-e2e/spec.md`. Active `openspec/changes/` no longer lists the change.

## Engram Lineage (observation IDs)

Prior change observations read/verified this archive run (via Engram search): explore #753, proposal #754, spec #755, design #756, tasks #757, apply-progress #758, verify-report #760. This archive report persisted as topic `sdd/s2-03-backend-h10/archive-report`.

## Delivery

Commit-only on `fix/s2-03-backend-h10` per user constraint — NO PR, NO push. Orchestrator handles the commit.
