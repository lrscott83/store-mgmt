# Archive Report — `e2e-b6-me-inactive-404`

**Archived**: 2026-08-10
**Archived to**: `openspec/changes/archive/2026-08-10-e2e-b6-me-inactive-404/`
**Verify verdict carried into this archive**: PASS (0 CRITICAL, 0 WARNING, 0 blockers; `critical_findings: 0`)
**Verify validated by**: `gentle-ai sdd-verify-validate` → `{"valid": true, "verdict": "pass"}`
**Artifact store**: hybrid (filesystem + Engram)
**Branch**: `feat/e2e-b6-me-inactive-404` (HEAD `876e5553` — merge commit bringing `e2e-b3-auth-login-roundtrip` into this branch)

## Project rule (carried verbatim)

> "In this backend test-coverage work, the agent may ONLY ADD new E2E tests. Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization (both suites: `backend/src/SMCA.WebApi.E2ETests/`, `frontend-react/e2e/` incl. support files). Adding NEW E2E tests is allowed. If the work would require modifying production source code or existing E2E tests, STOP and report instead."

This archive phase touched ONLY SDD artifacts under `openspec/` — no production code, no test files. The change itself was ADD-ONLY (ONE new E2E test file, zero modifications), consistent with the rule.

## Final State (at close time)

Per the Final-State Authority hierarchy: the orchestrator's final-state handoff (most recent account) plus the persisted `verify-report` (Engram #702), both of which outrank intermediate snapshots:

- **Delivered**: ONE new E2E file, EXACTLY TWO tests, on branch HEAD `876e5553`:
  - `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` (138 lines) — `Deactivated_same_tenant_store_user_me_returns_404_account_inactive` (real login → activate 200 + DB read-back `IsActive==false` → real-token `/me` → 404 + single `Auth.AccountInactive`) and `Cross_tenant_activate_returns_404` (minimal tenant-B victim seed → 404 envelope, no code pin).
- **Final test evidence** (authoritative — orchestrator handoff, most recent account):
  - Focused `--filter "FullyQualifiedName~AuthMeDeactivation"` → **2 passed, 0 failed**.
  - Regression `--filter "FullyQualifiedName~Auth|FullyQualifiedName~UsersActivate"` → **93 passed, 0 failed**.
  - Build → **0 errors** (16 warnings, all pre-existing nullability warnings in Domain/Application/Infrastructure/WebApi/unit tests; none in the new file, per `verify-report` #702 at verification time).
  - Per `verify-report` #702: 2/2 requirements, 2/2 scenarios compliant, 11/11 tasks complete.
- **Scope rule compliance**: zero production source changes, zero existing E2E test/support-file changes. See **Purity (corrected 4.3 wording)** below for the authoritative check.

## Spec Sync (openspec) — completed at spec time, NOT re-applied

The delta's two capability updates were already merged into the main specs at spec time, before verification ran. Consistent with the orchestrator's explicit final-state note ("Capability specs already updated — do NOT re-edit"), this archive performed NO further spec edits:

- `openspec/specs/users-e2e/spec.md` — **MODIFIED at spec time**: R5 Activate table gained the two B-6 rows — "Deactivate same-tenant StoreUser, then /me 404 chain (B-6) | OwnerAdmin+Management | 200; target real-login /me → 404, ActionCode=404, single error `Auth.AccountInactive`" and "Cross-tenant deactivate (B-6 isolation) | OwnerAdmin+Management | 404 envelope failed (tenant filter via FindAsync; `App.Unexpected`, NOT `User.NotFound`)" (spec lines 86–87), plus the reference note naming `AuthMeDeactivationTests.cs` (line 94).
- `openspec/specs/authorization-e2e/spec.md` — **MODIFIED at spec time**: R1.7 "Deactivated account (real-flow) → HTTP 404, `Succeeded=false`, `ActionCode=404`, single error `Auth.AccountInactive` (B-6, delivered by `e2e-b6-me-inactive-404` — `AuthMeDeactivationTests.cs`)" with Delivery note (2026-08-10) (spec lines 30–35).

The delta spec (`spec.md` in the archived folder) remains in the archive as the change's own record. Main spec content at archive time fully reflects it. The delta contained ADDED requirements only — 0 REMOVED, 0 RENAMED — so no destructive merge occurred and no `rules.archive` warning ("Warn before merging destructive deltas") was required. Requirements not in the delta were preserved.

## Task Completion Gate

`tasks.md` (Engram #699): all 11 task checkboxes `[x]` at archive time — 1 scaffold (Phase 1), 4 T1-chain (Phase 2), 3 T2-isolation (Phase 3), 3 verification/purity (Phase 4). No unchecked implementation tasks; no stale-checkbox reconciliation needed. Verify report independently confirms 11/11 complete.

## Review Gate Disposition

Native status (orchestrator handoff, 2026-08-10): review mode is OFF — receipt-driven delivery is `disabled/unmanaged`; no review policy, ledger, receipt, or transaction applies to this change; no `reviews/` dir exists in the change folder. Per the Native Review Receipt Gate, `disabled/unmanaged` is the only relaxation and it applies: with the kill switch off and no review governing this change, no terminal receipt is demanded. Gate disposition recorded as **`disabled/unmanaged`**.

## Action Context

`actionContext.mode: repo-local` (not workspace-planning); archive operations confined to `openspec/changes/...` inside the project root. `openspec/config.yaml` `rules.archive` contains only "Warn before merging destructive deltas" — no destructive delta existed (0 REMOVED, 0 RENAMED), so no warning was required.

## Purity (corrected 4.3 wording — verify SUGGESTION #1 resolved)

The verify report raised SUGGESTION #1: apply-progress task 4.3 cited `git diff --stat main...HEAD` as "exactly 1 new file + openspec artifacts only", but that command's real output spans the merged `e2e-b3-auth-login-roundtrip` content (HEAD is the b3 merge commit `876e5553`, so `main...HEAD` spans the merged branch: 10 files / 906 insertions). The scope claim itself is TRUE — this archive records the **corrected authoritative wording** so future readers do not misread purity:

`git status --porcelain` on `feat/e2e-b6-me-inactive-404` at archive time:
```text
 M openspec/specs/authorization-e2e/spec.md
 M openspec/specs/users-e2e/spec.md
?? backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs
?? frontend-react/openspec/changes/offline-roster-login-actions/
?? openspec/changes/e2e-b6-me-inactive-404/
```
- Exactly ONE new backend file: `AuthMeDeactivationTests.cs` (the change's deliverable).
- The two ` M` files are the pre-existing delta-spec capability artifacts (`users-e2e` R5 rows, `authorization-e2e` R1.7) — openspec docs, not code.
- The untracked `frontend-react/openspec/changes/offline-roster-login-actions/` is pre-existing and unrelated to this change (NOT ours; verified present before apply started).
- The change's own artifacts (`openspec/changes/e2e-b6-me-inactive-404/`) are untracked as a unit.

**Corrected wording for task 4.3**: purity is verified via `git status --porcelain` (the user-specified check), NOT `git diff --stat main...HEAD` (which is invalid for this comparison because HEAD is a merge commit spanning the b3 branch). Add-only scope confirmed: one new file, two tests, zero existing tests or production code touched.

## Non-Goals Honored

- ✅ No frontend suite touched (`git status --porcelain` shows no frontend E2E files; the untracked frontend dir is an unrelated pre-existing openspec change folder).
- ✅ No production source code modified (zero production files changed).
- ✅ No existing E2E test or support file touched (the only new file under `backend/src/SMCA.WebApi.E2ETests/` is `Auth/AuthMeDeactivationTests.cs`).
- ✅ No self-activation case (actor always deactivates a different user).
- ✅ No token-blacklist second-call 401 case (T1 makes exactly ONE `/me` call; T2 makes none — `/me` not involved in the cross-tenant scenario).

## Provenance (B-3 merge)

HEAD `876e5553` is the merge commit that brought `feat/e2e-b3-auth-login-roundtrip` into this branch. The merged B-3 test files `AuthLoginStoreUserTests.cs` / `AuthLoginReSellerTests.cs` are present in the tree and were used as seed/pattern reference (real-login pattern, D3) — referenced, NOT touched by this change. This is why `main...HEAD` is not a valid purity comparison for this change (see Purity above).

## Non-blocking design note carried forward

If `ActivateUserCommand` ever sets `AcctionCode`, the cross-tenant wire code changes (currently `App.Unexpected` via `ErrorHandlerMiddleware`). The T2 envelope-only assert (404 + `Succeeded==false` + `Errors.NotBeEmpty()`, no code pin) stays green by design — no action required unless the wire code is later pinned.

## Delivery Note

- **Scope**: ONE new E2E file `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` — 138 lines, EXACTLY TWO tests. No other file touched by this change.
- **PR strategy**: single PR (~150 lines + openspec artifacts); 400-line budget risk LOW (138 additions, well under budget); no chaining needed.
- **Risk**: LOW — test-only delta; only existing public routes exercised; rollback = delete the single file.

## Traceability (Engram observations)

- Engram `sdd/e2e-b6-me-inactive-404/explore` — observation **#695**
- Engram `sdd/e2e-b6-me-inactive-404/proposal` — observation **#696**
- Engram `sdd/e2e-b6-me-inactive-404/spec` — observation **#697**
- Engram `sdd/e2e-b6-me-inactive-404/design` — observation **#698**
- Engram `sdd/e2e-b6-me-inactive-404/tasks` — observation **#699**
- Engram `sdd/e2e-b6-me-inactive-404/apply-progress` — observation **#700**
- Engram discovery (OA+Management actor passes UsersAdmin permission filter — verified chain) — observation **#701**
- Engram `sdd/e2e-b6-me-inactive-404/verify-report` — observation **#702**
- Engram `sdd/e2e-b6-me-inactive-404/archive-report` — this report (saved at archive time)
- Filesystem archive: `openspec/changes/archive/2026-08-10-e2e-b6-me-inactive-404/` (proposal, spec, design, tasks, apply-progress, verify-report, archive-report)
- Main specs: `openspec/specs/users-e2e/spec.md`, `openspec/specs/authorization-e2e/spec.md`

## Lifecycle Close

SDD cycle for `e2e-b6-me-inactive-404` is **CLOSED**: explored → proposed → specified → designed → tasked → applied → verified (PASS, externally validated) → archived. Active changes directory no longer contains this change.

## Next Steps

- **Commit (recommended)**: the archived folder (including `verify-report.md` and `apply-progress.md`, which were untracked) plus the two modified main specs are uncommitted on `feat/e2e-b6-me-inactive-404`. Recommend the orchestrator commit the archive move (conventional commit, e.g. `chore(openspec): archive e2e-b6-me-inactive-404`), then push when the user approves.
- No production code or existing E2E tests were touched anywhere in the cycle.
