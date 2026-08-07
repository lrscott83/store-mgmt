# Archive Report — `e2e-stage-1-s3-03`

**Archived**: 2026-08-06
**Archived to**: `openspec/changes/archive/2026-08-06-e2e-stage-1-s3-03/`
**Verify verdict carried into this archive**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 2 SUGGESTION)
**Artifact store**: openspec (filesystem; Engram observations exist for traceability — see table below)
**Branch**: `feat/e2e-s3-03`

## Project rule (carried verbatim)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/` (`openspec/specs/users-e2e/spec.md` merged; change folder moved to the archive). It touched no test code and no production code. The change itself was ADD-ONLY (commit `2ea72d2d`: 1 new file `backend/src/SMCA.WebApi.E2ETests/Users/UsersIsolationTests.cs`, 90 insertions; commit `3a978239`: `tasks.md` checkbox marks only; diff `0f552e57..HEAD` = exactly 2 files), consistent with the rule.

## Final State (at close time)

Per the orchestrator's final-state handoff (most recent account of the change) and the persisted, normalized `verify-report.md` — both of which outrank intermediate snapshots:

- **Delivered**: new E2E test file `backend/src/SMCA.WebApi.E2ETests/Users/UsersIsolationTests.cs` with exactly 2 tests (commit `2ea72d2d` on `feat/e2e-s3-03`, `[Collection("e2e")]` + `WebAppFixture` ctor, private `SeedCustomTenantVictimAsync` CPW7-pattern copy):
  1. `Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404` — E2E-I1 cross-tenant invariant: HTTP 200 + `Succeeded=false` + `ActionCode=404` + `User.NotFound` + NO DB write.
  2. `Update_owner_admin_updates_user_in_other_store_returns_200` — E2E-I2 same-tenant cross-store: HTTP 200 + `Succeeded=true` + DB write persists.
- **Verification PASS** (focused 2/2, Users-area regression 81/81, build 0 errors, `evidence_revision sha256:9aa73d2d...`): the documented-RED premise was invalidated by evidence — on EF Core 8.0.1 `FindAsync` DOES apply the tenant query filter on the PUT user path, so E2E-I1 passes on the invariant and now guards the regression. No fail invented. 2 documentation-level WARNINGs (premise reconciliation, below), 0 CRITICAL.
- **Normalization**: delta spec + verify report were normalized to native `#### Scenario:` format (commit `e46606f4`); the native dispatcher counts 2 scenarios; `sdd-verify-validate` admitted the persisted report with `valid: true`, verdict `pass`.
- **Ledger**: native `sdd-attempt` settled complete (token sha256:a10a39b2...).
- **Add-only proven**: only the new test file + `tasks.md` checkbox marks; zero existing test, helper, or production code touched.

### Engram snapshot supersession (recorded explicitly, not resolved silently)

Engram observation #637 (`sdd/e2e-stage-1-s3-03/verify-report`, saved 2026-08-06 20:37:57) is a **pre-normalization snapshot**: it asserts `scenarios: 3/3` with a 3-row compliance matrix (E2E-I1 split into premise + invariant rows). The persisted filesystem `verify-report.md` (post-normalization, commit `e46606f4`) asserts `scenarios: 2/2` and was admitted by `sdd-verify-validate` with `valid: true`; the orchestrator's final-state handoff confirms the dispatcher counts 2 scenarios. Per Final-State Authority, the persisted artifact and the launch-prompt facts outrank the intermediate snapshot: the final state is **2/2 scenarios**, and #637's `3/3` content is stale pre-normalization history (attributed above), not current fact. The archive preserves the normalized filesystem report verbatim.

## Review Gate Disposition

No `reviews/` directory exists in the change folder; no `reviewPolicy`, `reviewLedger`, `reviewReceipt`, `reviewState`, or `reviewBundle` artifacts exist for this change. Native status (`gentle-ai sdd-status`, 2026-08-06) reports `reviewGate.delivery: disabled/unmanaged` — "receipt-driven development is disabled, so no review governs this change; it closes under ordinary repository policy rather than under a review receipt". Per the Native Review Receipt Gate, `disabled/unmanaged` is the only permitted relaxation and applies here: there is no review policy or receipt to validate, and no explicit review artifact failed validation. The bounded runtime authority (native attempt ledger) settled `complete` per the orchestrator's final-state handoff. This matches the repo precedent (`2026-08-06-e2e-stage-1-s1-02`, `2026-08-06-e2e-stage-1-s2-03`, and `2026-08-06-e2e-playwright-register-s1-01` carry no review artifacts either).

## Task Completion Gate

The persisted `tasks.md` shows all 12 implementation tasks checked `[x]` (12/12, 0 unchecked) at archive time — verified by direct read before the move and native status `taskProgress.allComplete: true`. No stale-checkbox reconciliation was required. (Remaining `- [ ]` items in `proposal.md` "Success Criteria" are planning-phase notes, not implementation tasks; carried verbatim into the archive as-is, preserving the audit trail.)

## Spec Sync (openspec)

Canonical spec `openspec/specs/users-e2e/spec.md` **already exists** (tracked, includes the archived CPW7 change). Per the skill ("If Main Spec Exists → apply the delta"), the delta was MERGED into the existing canonical spec — no duplicate domain created.

Delta spec `specs/users-e2e/spec.md`: **2 ADDED requirements** (E2E-I1, E2E-I2 — 1 native `#### Scenario:` block each, 2 scenarios total); MODIFIED/REMOVED/RENAMED: none. Merge performed into `openspec/specs/users-e2e/spec.md`:

- **Header**: `Origin` extended with `(extended by e2e-stage-1-s3-03, 2026-08-06)`; `Last Updated` → 2026-08-06.
- **R3 table**: 2 rows ADDED — "Cross-tenant update (E2E-I1) → 200, envelope ActionCode 404 + no DB write (tenant-isolation invariant guard)" and "Cross-store same-tenant update (E2E-I2) → 200, DB write persists (isolation is tenant-only, NOT store-level)". All pre-existing R1–R11 rows preserved untouched.
- **Delta section**: full delta appended as `## Delta for users-e2e: E2E Isolation on PUT /v1/users/{id} — Cross-Tenant Invariant + Cross-Store Coverage` with both requirement blocks verbatim (including the documented-RED note and the two coupling warnings), the two scenarios (re-leveled to canonical hierarchy), Assert Style, and Verification Criteria — matching the precedent format of the archived users-e2e deltas (E2E-CPW, E2E-R7, E2E-A5, ...).
- **Coupling carried into the canonical spec** (must never be closed silently):
  1. **E2E-I1** is currently GREEN as a regression guard: `FindAsync` applies the tenant query filter on this path on EF Core 8.0.1. If the user lookup is ever switched to `IgnoreQueryFilters`, E2E-I1 flips RED and MUST be fixed in the same change as the defect.
  2. **E2E-I2** pins that isolation on `PUT /v1/users/{id}` is tenant-only, NOT store-level. A future tenant-scope guard MUST mirror `UpdateUserPasswordCommand.cs:62-64` (TenantId-only) and MUST NOT block this legit same-tenant path.

## explore.md premise reconciliation (WARNING 2 — resolved in this report)

`explore.md:36,42,50` asserted that `GetByIdAsync` = `FindAsync` ("the only read path") **skips** the global tenant query filter, predicting cross-tenant PUT would succeed today (IDOR). DB-level evidence in apply's run and the verify run on EF Core 8.0.1 invalidated that premise for this path: `FindAsync` DOES apply the tenant query filter on the PUT user path, cross-tenant PUT returns envelope 404 and does not write. Per verify-report WARNING 2, `explore.md` should not be re-used as-is for the future fix without reconciliation. Reconciliation: this archive report records the corrected fact (the `FindAsync`-filter behavior on EF Core 8.0.1 on this path); the delta spec's E2E-I1 documented-RED note (archived verbatim) carries the same correction. `explore.md` itself is archived VERBATIM as an audit trail — the archive is never modified — and the correction lives in the requirement text and this report. The future tenant-guard fix change MUST be planned from the corrected premise, not from `explore.md:36,42,50`.

## Archive Contents

- `proposal.md` ✅ — verbatim copy
- `explore.md` ✅ — verbatim copy (sdd-explore artifact; premise reconciled in this report, see above)
- `design.md` ✅ — verbatim copy (D1–D5 and Open Questions)
- `tasks.md` ✅ — verbatim copy (12/12 `[x]`, 0 unchecked implementation tasks)
- `verify-report.md` ✅ — verbatim copy of the normalized PASS WITH WARNINGS report
- `specs/users-e2e/spec.md` ✅ — verbatim copy of the normalized delta spec (native `#### Scenario:` format, 2 scenarios)
- `archive-report.md` ✅ — this report

## Source of Truth Updated

`openspec/specs/users-e2e/spec.md` now reflects the new coverage (E2E-I1 cross-tenant invariant + E2E-I2 cross-store same-tenant) — merged into the pre-existing canonical spec, not created.

## Traceability — Engram observation IDs

| Artifact | Observation ID | Topic key | Notes |
|---|---|---|---|
| Apply progress | #636 | `sdd/e2e-stage-1-s3-03/apply-progress` | Intermediate snapshot; 12/12 tasks complete at apply time |
| Verify report | #637 | `sdd/e2e-stage-1-s3-03/verify-report` | **Pre-normalization snapshot** (`scenarios: 3/3`); superseded by the normalized filesystem `verify-report.md` (`2/2`, valid:true) — see supersession note above |

Note: no Engram observation exists for the proposal, delta spec, or design artifact of this change (searched `sdd/e2e-stage-1-s3-03/{proposal,spec,design}`; no matches). Those live in the filesystem archive only, matching the `e2e-stage-1-s2-03` precedent.

## Filesystem operation note for the orchestrator

The active change folder `openspec/changes/e2e-stage-1-s3-03/` was **moved** (not copied) to `openspec/changes/archive/2026-08-06-e2e-stage-1-s3-03/` — verified after the move: `Test-Path openspec/changes/e2e-stage-1-s3-03` → **False**, and all 6 artifacts + this report exist in the dated archive folder. `git status` will show the deletion of the old paths, the untracked new archive folder, and the modified `openspec/specs/users-e2e/spec.md`; the orchestrator should stage all of it (`git add -A openspec/`) as part of the commit that lands this archive.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. The coupling items that must never be closed silently — (1) if the PUT user lookup ever switches to `IgnoreQueryFilters`, E2E-I1 flips RED and must be fixed in the same change; (2) a future tenant-scope guard must be TenantId-only and must not block the legit same-tenant cross-store path (E2E-I2) — are recorded in the archived delta requirements, the canonical spec (requirement bodies + R3 rows), and this report. Ready for the next change.
