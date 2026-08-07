# Archive Report — `e2e-stage-1-auth-inv-01`

**Archived**: 2026-08-06
**Archived to**: `openspec/changes/archive/2026-08-06-e2e-stage-1-auth-inv-01/`
**Verify verdict carried into this archive**: PASS (canonical documented-RED — intended, archive-ready; 0 CRITICAL, 0 WARNING, 1 SUGGESTION)
**Artifact store**: both (openspec filesystem archive + Engram observation for this report)
**Branch**: `feat/e2e-auth-inv-01`

## Project rule (carried verbatim)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/` (`openspec/specs/auth-refresh-token-lifetime-e2e/spec.md` created; change folder moved to the archive). It touched no test code and no production code. The change itself was ADD-ONLY (commit `7017962e`: 1 new file `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRefreshTokenLifetimeTests.cs` +143, additive `TestDtos.cs` +8, `tasks.md` marks), consistent with the rule.

## Final State (at close time)

Per the orchestrator's final-state handoff (most recent account of the change) and the persisted, normalized `verify-report.md` (strict `gentle-ai.verify-result/v1`, verdict `pass`) — both outrank intermediate snapshots:

- **Delivered**: new E2E test file `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRefreshTokenLifetimeTests.cs` with exactly 2 tests (commit `7017962e` on `feat/e2e-auth-inv-01`, `[Collection("e2e")]` + `WebAppFixture` ctor, `ExpectedLifetimeDays = 35`, 1h tolerance):
  1. `Login_returns_refresh_token_expiring_in_35_days` — R1: login returns a refresh token expiring in 35 days (response `RefreshTokenExpiresAt` + persisted `RefreshTokens.ExpiresAt` row).
  2. `Refresh_returns_new_refresh_token_expiring_in_35_days` — R2: refresh rotates the token and returns a new one expiring in 35 days (new ≠ old; response + new DB row).
  - Plus 2 additive nullable properties on `AuthData` (`TestDtos.cs`): `RefreshToken`, `RefreshTokenExpiresAt`.
- **Documented RED**: both tests FAIL today for the documented reason — production ships 7 days (`AuthenticationSettings.cs:16` / `appsettings.json:92`), env inherits 7d (`appsettings.Tests.json` overrides only Pepper + Argon2 params). Failures are `off by 28d` at `:62` (Login) and `:113` (Refresh). The red is the defect, not the test; verify recorded a documented fail and the change was NOT blocked (AUTH-INV-01 precedent: "el rojo es el defecto, no el test").
- **Production fixes that enabled the RED premise (merged separately, not part of this change)**: `fix-refresh-token-persistence` (commit `a20fddbc` — persist refresh tokens explicitly in Login, Refresh, Revoke handlers) and `fix-refresh-user-tenant-fetch` (commit `4d9b5377` — resolve refresh token owner without tenant filter). These were required for the tests to reach 200 OK through login→persist→refresh→rotation; before them the Refresh test failed with a premature 401 (row never persisted + tenant query filter hiding the user lookup). They are archived as separate changes (`openspec/changes/archive/2026-08-06-fix-refresh-token-persistence/`).
- **Verification PASS**: focused filter 2 failed / 0 passed (documented RED held — both failures are the intended 7d-vs-35d delta), Auth-area regression 45 passed / 2 failed / 47 total (only the 2 new fail), build 0 errors, `evidence_revision sha256:7bd1b45f...`, `test_exit_code: 0` (evidence confirmed), requirements 2/2, scenarios 2/2, blockers 0.
- **Coupling carried into the canonical spec (must never be closed silently)**: when the future 7→35 production change ships, both tests flip green UNTOUCHED and MUST NOT be weakened to 7.

## Review Gate Disposition

No `reviews/` directory exists in the change folder; no `reviewPolicy`, `reviewLedger`, `reviewReceipt`, `reviewState`, or `reviewBundle` artifacts exist for this change. Native status (`gentle-ai sdd-status`, 2026-08-06) reports `reviewGate.delivery: disabled/unmanaged` — "receipt-driven development is disabled, so no review governs this change; it closes under ordinary repository policy rather than under a review receipt". Per the Native Review Receipt Gate, `disabled/unmanaged` is the only permitted relaxation and applies here: there is no review policy or receipt to validate, and no explicit review artifact failed validation. This matches the repo precedent (`2026-08-06-e2e-stage-1-s3-03`, `2026-08-06-e2e-stage-1-s2-03`, `2026-08-06-e2e-stage-1-s1-02`, and `2026-08-06-e2e-playwright-register-s1-01` carry no review artifacts either).

## Task Completion Gate

The persisted `tasks.md` shows all 10 implementation tasks checked `[x]` (10/10, 0 unchecked) at archive time — verified by direct read before the move and native status `taskProgress.allComplete: true`. No stale-checkbox reconciliation was required. (The uncommitted working-tree change to `tasks.md` was the final-state reconciliation of task 3.1 — see next section — which is correct and complete at close time.)

## tasks.md 3.1 reconciliation (recorded explicitly, not resolved silently)

The committed `tasks.md` at HEAD showed task 3.1 as `- [ ]` **BLOCKED: acceptance NOT met** — the Refresh test failed with 401 because the refresh-token row was never persisted by login and the tenant query filter hid the user lookup. This was the state at apply time (commit `7017962e` message: "documented RED, premise blocked"). The working-tree `tasks.md` (uncommitted, verified at archive time) marks 3.1 `- [x]` with the documented-RED held: **both** failures are now the intended `off by 28d`, both tests reach 200 OK through login→persist→refresh→rotation, enabled by the merged production fixes (`fix-refresh-token-persistence`, `fix-refresh-user-tenant-fetch`). Per Final-State Authority, the persisted `verify-report.md` (strict envelope, verdict pass, focused exit 1 with both failures being the 7d-vs-35d delta) and the orchestrator's final-state handoff outrank the earlier blocked snapshot: the final state is **documented RED held, premise resolved, verify PASS**. No contradiction remains — the earlier 401 was a genuine blocked state at apply time, resolved by later merged fixes before verify.

## Spec Sync (openspec)

Canonical spec `openspec/specs/auth-refresh-token-lifetime-e2e/spec.md` **did NOT exist** → per the skill ("If Main Spec Does NOT Exist → The delta spec IS a full spec"), it was CREATED from the delta spec (copied directly, re-leveled to the canonical sibling format of `openspec/specs/auth-login-e2e/spec.md`):

Delta spec `specs/auth-refresh-token-lifetime-e2e/spec.md`: **2 ADDED requirements** (R1, R2 — 1 native `#### Scenario:` block each, 2 scenarios total); MODIFIED/REMOVED/RENAMED: none. Canonical spec created:

- **Header**: `Capability` (auth-refresh-token-lifetime-e2e — 35-day refresh-token lifetime assertions at login + rotation), `Origin` (SDD change `e2e-stage-1-auth-inv-01`), `Source` (`docs/testing/e2e-stage-1/AUTH-INV-01.md`), `Status` Active, `Last Updated` 2026-08-06.
- **Purpose + Capability Scope**: In/Out of Scope carried from the delta (no production fix; ADD-ONLY; no `ExpiresIn` assert; no `IOptions`/settings mutation).
- **Requirements R1 + R2**: carried verbatim with their `#### Scenario:` blocks, including the documented-RED status notes.
- **Verification Criteria**: carried from the delta + verify-report final numbers (45/47 Auth regression, focused RED held, evidence revision).

## Archive Contents

- `proposal.md` ✅ — verbatim copy
- `explore.md` ✅ — verbatim copy (sdd-explore artifact)
- `design.md` ✅ — verbatim copy (D1–D5 and Open Questions)
- `tasks.md` ✅ — verbatim copy (10/10 `[x]`, 0 unchecked implementation tasks; 3.1 reconciled to done per verify evidence)
- `verify-report.md` ✅ — verbatim copy of the PASS (documented-RED) report
- `specs/auth-refresh-token-lifetime-e2e/spec.md` ✅ — verbatim copy of the delta spec (native `#### Scenario:` format, 2 scenarios)
- `archive-report.md` ✅ — this report

## Source of Truth Updated

`openspec/specs/auth-refresh-token-lifetime-e2e/spec.md` now reflects the new coverage (R1 login 35d + R2 refresh rotation 35d, documented RED) — created, not merged.

## Traceability — Engram observation IDs

| Artifact | Observation ID | Topic key | Notes |
|---|---|---|---|
| Archive report | (this save) | `sdd/e2e-stage-1-auth-inv-01/archive-report` | First Engram observation for this change |

No Engram observation exists for the proposal, delta spec, design, tasks, apply-progress, or verify-report artifacts of this change (searched `sdd/e2e-stage-1-auth-inv-01/{proposal,spec,design,tasks,apply-progress,verify-report,review}`; no matches). Those live in the filesystem archive only, matching the `e2e-stage-1-s3-03` and `e2e-stage-1-s2-03` precedents. Apply progress was reported inline by `sdd-apply`; no `apply-progress` artifact was persisted for this change.

## Filesystem operation note for the orchestrator

The active change folder `openspec/changes/e2e-stage-1-auth-inv-01/` was **moved** (not copied) to `openspec/changes/archive/2026-08-06-e2e-stage-1-auth-inv-01/` — verified after the move: `Test-Path openspec/changes/e2e-stage-1-auth-inv-01` → **False**, and all 6 artifacts + this report exist in the dated archive folder. `git status` will show the deletion of the old paths, the untracked new archive folder, the untracked `openspec/specs/auth-refresh-token-lifetime-e2e/spec.md`, and the uncommitted `tasks.md` reconciliation (3.1); the orchestrator should stage all of it (`git add -A openspec/`) as part of the commit that lands this archive.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. The coupling item that must never be closed silently — when the future 7→35 production change ships, `AuthRefreshTokenLifetimeTests` flips green UNTOUCHED and MUST NOT be weakened to 7 — is recorded in the archived delta requirements, the canonical spec (requirement bodies + verification criteria), and this report. Ready for the next change.
