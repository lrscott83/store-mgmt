# Archive Report — `fix-refresh-token-persistence`

**Archived**: 2026-08-06
**Archived to**: `openspec/changes/archive/2026-08-06-fix-refresh-token-persistence/`
**Artifact store**: hybrid (filesystem + Engram)
**Branch**: `fix/refresh-token-persistence` (commits `a20fddbc` implementation 7 files +240/−7, `b87ee9d0` tasks check-off; e2e-touched diff EMPTY)
**Verify verdict carried into this archive**: PASS (0 CRITICAL, 0 WARNING, 2 SUGGESTIONs)

## Project rule (carried verbatim)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/`. The change was a backend production fix; zero E2E files modified (verified `git diff --name-only` over both commit ranges → EMPTY). Adding new tests is allowed; none were added for this change.

## What this change fixed (production defect — not E2E coverage)

`UnitOfWorkBehaviour.IsQuery()` has returned `true` unconditionally since `106de882`, so the MediatR pipeline never called `SaveChanges`. Login/Refresh/Revoke were the only 3 of 40 command handlers that trusted that dead pipeline — `RefreshTokens` rows never hit the database, `/auth/refresh` ALWAYS returned 401, and rotation/revocation silently dropped. The fix injects `IApplicationUnitOfWork` into the 3 handlers and calls `SaveChangesAsync` explicitly after repository staging, matching the repo-wide 37/40 explicit-save convention.

**Option-A rejection rationale (blast radius)**: fixing `UnitOfWorkBehaviour.IsQuery()` globally would double-save the 37 commands that already save explicitly and wrap all 63 API actions in `TransactionScope` (escalation risk, partial flush on early-return paths). Unacceptable blast radius for a token-persistence fix; required full-suite regression to trust. Recorded as Option B in `design.md` D1.

**Branch-local relationship**: `feat/e2e-auth-inv-01` carries `AuthRefreshTokenLifetimeTests` that flip to correct documented RED (7d vs 35d) after this fix. This change makes persistence work; it does NOT change refresh-token lifetime (7d→35d is AUTH-INV-01, a separate future change). The RED flip is a cross-branch expectation carried on `feat/e2e-auth-inv-01`, not verified by this archive.

## Review Gate Disposition

No reviews/ dir, no reviewPolicy/Ledger/Receipt/State/Bundle artifacts → gate disposition `disabled/unmanaged` (no review governs this change); native attempt ledger settled complete. Matches repo precedent (prior archives carry no review artifacts).

## Task Completion Gate

tasks.md 16/16 `[x]`, 0 unchecked implementation tasks at archive time (verified before and after move). No stale-checkbox reconciliation needed.

## Spec Merge — new capability (canonical seeded, not merged)

- Pre-archive `openspec/specs/refresh-token-persistence/spec.md`: **does not exist** (confirmed by `Glob` over `openspec/specs/**` — no `refresh-token-persistence` entry; explore phase confirmed the same).
- Per the skill's "If Main Spec Does NOT Exist" rule, the delta spec IS the full spec for this new capability. Seeded to `openspec/specs/refresh-token-persistence/spec.md` in house canonical capability-spec format (Purpose + Requirements), with all 4 requirement blocks (R1–R4) preserved verbatim from the delta.
- The archived copy of `specs/refresh-token-persistence/spec.md` keeps the original delta framing (`# Delta for refresh-token-persistence`, `## ADDED Requirements`), verbatim.

| Domain | Action | Details |
|--------|--------|---------|
| refresh-token-persistence | Created | 4 requirements (R1–R4) seeded verbatim; 0 modified/removed (none existed). |

## Archive Contents (moved, not copied)

- `proposal.md` ✅ (verbatim copy)
- `explore.md` ✅ (verbatim copy)
- `design.md` ✅ (verbatim copy)
- `tasks.md` ✅ (16/16 `[x]`)
- `verify-report.md` ✅ (verbatim copy)
- `specs/refresh-token-persistence/spec.md` ✅ (verbatim delta copy)
- `archive-report.md` ✅ (this file)

Active folder `openspec/changes/fix-refresh-token-persistence/` **no longer exists** (verified `Test-Path → False` after the shell move).

## Final-state verification carried into this archive

Per `verify-report` (observation #644, written before close), all runtime evidence was independently re-run in the verify phase: build 0 errors; handler filter 35/35; full `SMCA.sln` 653/653 (22 DOMAIN_UT, 326 APPL_TESTS, 305 WEBAPI_E2ETESTS); 0 CRITICAL, 0 WARNING; 6/6 TDD-compliance checks; full compliance vs correctness matrix 4/4. Final-state authority: no later source overrides these — they are the terminal delivery facts for this change.

## Traceability — Engram observation IDs

| Artifact | ID | Topic key |
|---|---|---|
| Proposal | #640 | sdd/fix-refresh-token-persistence/proposal |
| Design | #641 | sdd/fix-refresh-token-persistence/design |
| Tasks | #642 | sdd/fix-refresh-token-persistence/tasks |
| Apply progress | #643 | sdd/fix-refresh-token-persistence/apply-progress |
| Verify report | #644 | sdd/fix-refresh-token-persistence/verify-report |
| Archive report (this) | (saved) | sdd/fix-refresh-token-persistence/archive-report |

## SUGGESTIONs carried from the verify-report (non-blocking, out of scope)

1. **Revoke revoke-all branch** — `Revoke_withoutToken_revokesAllActive` asserts `Update` `Times.Exactly(2)` but not the UoW save on the `SaveChanges` for the single save-after-loop path. No-save side already covered (`Revoke_alreadyRevoked_isIdempotent`, `Revoke_withoutToken_noActiveTokens_returnsSuccess`). Optional gap; non-blocking.
2. **Pre-existing package advisories / nullable warnings** — NU1903 System.Text.Json 8.0.1, NU1903 AutoMapper 13.0.1, NU1902 RestSharp 110.2.0, plus CS8620/CS8602 in files untouched by this change; all unrelated, track separately.

The two SUGGESTIONs are recorded verbatim from the verify-report snapshot (observation #644) and remain open at close; neither blocks.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. This charge seeds the canonical `refresh-token-persistence` spec for the refresh-token auth cluster.