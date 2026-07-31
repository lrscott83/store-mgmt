# Archive Report: register-endpoint-contract-frontend

**Archived**: 2026-07-31
**Branch**: `feat/register-endpoint-contract-frontend`
**HEAD**: `0e8e441` (commits: `7d6e3ee` WU1, `d7b06d8` WU2, `00b4333` WU3, `0e8e441` spec-drift fix)
**Artifact store**: hybrid (engram + openspec files)

## Engram Observation IDs (traceability)

| Artifact | Observation ID |
|---|---|
| explore | 1688 |
| proposal | (see spec/design/tasks below; proposal folded into spec content, no separate obs retrieved this pass) |
| spec | 1691 |
| design | 1692 |
| tasks | 1695 |
| apply-progress | 1700 |
| verify-report | 1702 |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| auth-http | Updated | S2 (Register Return Type Parity) and S3 (Response Envelope Handling at Call-Site) replaced in `openspec/specs/auth-http/spec.md` with the corrected `RegisterAuthModel` / no-auto-login text (superseding the stale `AuthDto`/auto-login version). Also corrected 4 secondary references (In Scope bullet, 2 Verification Criteria bullets, Related Specifications) that restated the old, now-contradicted behavior, plus bumped `Last Updated` to 2026-07-31. All other requirements (S1, S4, S5, S6) preserved unchanged. |
| auth-rate-limit-feedback | Created | New capability file `openspec/specs/auth-rate-limit-feedback/spec.md`, copied from the delta (this was a NEW capability, not a delta against an existing spec) — 3 requirements (login 429, register 429, non-429 regression guard), Implementation Status and Notes sections added. |

Confirmed: the name `RegisterAuthResponse` does not appear anywhere in the merged `openspec/specs/` tree (the delta file already used `RegisterAuthModel` throughout — the verify-report's naming-drift WARNING was resolved before this archive pass, in commit `0e8e441`).

## Archive Contents

- `explore.md` — written to archive folder
- `proposal.md` — written to archive folder
- `specs/auth-http/spec.md` (delta) — written to archive folder
- `specs/auth-rate-limit-feedback/spec.md` (delta) — written to archive folder
- `design.md` — written to archive folder
- `tasks.md` — written to archive folder (15/15 tasks complete)
- `verify-report.md` — written to archive folder

## Source of Truth Updated

The following specs now reflect the shipped behavior:
- `openspec/specs/auth-http/spec.md` (S2/S3 corrected)
- `openspec/specs/auth-rate-limit-feedback/spec.md` (new)

## Verify Summary Carried Forward

0 CRITICAL, 1 WARNING (naming drift — resolved before archive), 1 SUGGESTION (pre-existing
`BaseResponseModel<T>.data` non-nullable-on-failure-path modeling smell — explicitly OUT of this
change's scope, tracked as separate follow-up work, NOT folded into these specs). Gates at HEAD:
typecheck 5/5 packages PASS, lint `--max-warnings=0` 4/4 packages PASS, test 2164/2164 PASS.

## Known Limitation — Move Not Performed

This executor has no Bash/filesystem-move or delete tool available. The archive folder contents
above were created via `Write` (new files under
`openspec/changes/archive/2026-07-31-register-endpoint-contract-frontend/`), but the ORIGINAL
change folder `openspec/changes/register-endpoint-contract-frontend/` (explore.md, proposal.md,
design.md, tasks.md, verify-report.md, specs/auth-http/spec.md,
specs/auth-rate-limit-feedback/spec.md) still exists on disk — it was NOT deleted. The orchestrator
must delete `openspec/changes/register-endpoint-contract-frontend/` (the pre-archive source
folder) after verifying the new archive copies above, so the active-changes directory no longer
lists this change as open.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived (pending the orchestrator's
deletion of the stale active-change folder, per the limitation above). Ready for the next change.
