# Apply Progress: b3-login-roundtrip

**Status**: APPLIED — implementation complete, tests green, committed (no PR, no push per preflight).

## What was implemented

| Deliverable | File | Change |
|---|---|---|
| D1a — Branch 1 fact (role-only StoreUser) | `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` | +`StoreUser_with_only_role_and_no_store_row_is_rejected_with_403` (appended after existing 3 facts) |
| D1b — Branch 2 fact (inactive StoreUser row) | `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` | +`StoreUser_with_inactive_row_is_rejected_with_403` (appended; NoTracking-safe `ExecuteUpdateAsync` mirroring `DeactivateOwnerByUserIdAsync`) |
| D2 — B-3 doc correction | `docs/testing/e2e-stage-1/plan-backend.md` | B-3 table → StoreUser/ReSeller DELIVERED (`e2e-b3-auth-login-roundtrip`, 2026-08-09); residual note (branches 1–2 pinned by `b3-login-roundtrip`); autorización note kept verbatim; fixed stale "Estado actual" and "ninguna probada por HTTP" |

Existing 3 facts in `AuthLoginStoreUserTests.cs` untouched. Zero production code, zero existing-E2E-test edits, zero helper modifications.

## Commits (branch `feat/e2e-b3-login-roundtrip`, created from `feat/login-wrapped-dek` HEAD)

1. `553ccc0e` — `test(e2e): pin StoreUser login branches 1-2 (b3-login-roundtrip)` (test file only, +75)
2. `a3ee3748` — `docs(testing): mark B-3 delivered in plan-backend (b3-login-roundtrip)` (doc only, +5/-7)

NO PR, NO push (per preflight).

## Test Evidence (real PostgreSQL `smca_test`, localhost:5432)

| Command | Before | After | Result |
|---|---|---|---|
| `--filter FullyQualifiedName~AuthLoginStoreUserTests` | 3/3 | **5/5** | ✅ Passed, 0 failed |
| `--filter FullyQualifiedName~AuthLoginReSellerTests` | 3/3 | 3/3 | ✅ Passed, 0 failed (regression, untouched) |
| Full E2E suite | 348 | **350/350** | ✅ Passed, 0 failed |
| `Application.Tests` | 337 | 337/337 | ✅ Passed, 0 failed (unit regression) |

Log confirmation of branch firing: `role3-…@test.com: no active store` (branch 1, role-only) and `suser-…` (branch 2, inactive row).

## Scope Gate

`git diff --stat` (working tree, my units): ONLY `AuthLoginStoreUserTests.cs` (+75) and `plan-backend.md` (+5/-7). Zero production code, zero existing-fact changes.

## Deviations / Notes

- **Pre-existing uncommitted files left untouched**: the working tree at branch creation already contained uncommitted edits to `docs/testing/e2e-stage-1/README.md`, `S3-03-backend.md`, `S3-03.md` (H-11 userslist work, unrelated change) and `openspec/specs/auth-login-e2e/spec.md` (b3 spec-phase delta) plus the untracked `openspec/changes/b3-login-roundtrip/` folder. None were committed by this apply — they remain uncommitted on the branch and should be handled/committed by their owning change or the orchestrator.
- TDD mode: Standard (backend E2E-only additions); no RED-GREEN cycle needed — new facts written to pass directly, and they do.

## Next

`verify` phase: run sdd-verify against spec/design/tasks.