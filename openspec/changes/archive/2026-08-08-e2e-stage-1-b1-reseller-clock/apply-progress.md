# Apply Progress: e2e-stage-1-b1-reseller-clock

- **Change**: `e2e-stage-1-b1-reseller-clock`
- **Branch**: `feat/e2e-stage-1-s1-01-backend`
- **Date**: 2026-08-08
- **Mode**: auto, strict TDD (test-only change; RED existed on wall clock)

## Tasks Completed

- [x] **1.1** Added clock Pin as FIRST statement of `ReSeller_sees_own_stores_only`
  (`backend/src/SMCA.WebApi.E2ETests/Billing/ToCollectTests.cs`, after method opening `{` at
  :105, before `// Arrange:` at :106). Single flat `using var` — no nested Pin (Double-Pin trap
  avoided). Comment + pin inserted verbatim from the locked authorization scope.

- [x] **2.1** Focused run GREEN:
  `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ReSeller_sees_own_stores_only"`
  → **Passed: 1, Failed: 0** (ran with build; dev server did not lock bin/Debug). The test now
  passes on any calendar date (proposal success criterion 1 met).

- [ ] **2.2** Full suite: **partial** — see evidence below. Not marked done: full solution is
  not green due to one PRE-EXISTING unrelated E2E failure, out of scope and untouchable
  (backend ADD-only rule + E2E untouchable rule).

## Evidence

### Focused run (task 2.1)

```
Passed!  - Failed: 0, Passed: 1, Skipped: 0, Total: 1 - SMCA.WebApi.E2ETests.dll (net8.0)
```

### Full solution run (task 2.2) — `dotnet test backend/src/SMCA.sln`

```
Passed!  - Failed: 0, Passed:   22, Skipped: 0, Total:   22 - Domain.UnitTests.dll (net8.0)
Passed!  - Failed: 0, Passed:  330, Skipped: 0, Total:  330 - Application.Tests.dll (net8.0)
Failed!  - Failed: 1, Passed:  319, Skipped: 0, Total:  320 - SMCA.WebApi.E2ETests.dll (net8.0)
```

- `ReSeller_sees_own_stores_only` → **PASS** in the full suite.
- Sole failure: `SMCA.WebApi.E2ETests.Users.UsersListTests.List_includeInactive_true_includes_inactive_user`
  (assertion at UsersListTests.cs:91).

### Pre-existing failure proof (A/B stash check)

| State | `ReSeller_sees_own_stores_only` | `UsersList...includes_inactive_user` |
|---|---|---|
| Pristine tree (change stashed) | FAIL (known RED) | FAIL |
| With change, full suite | PASS | FAIL |
| With change, isolated run | PASS | PASS |

The Users test fails on the pristine tree too, and passes in isolation → full-suite-order
flake / DB pollution in the Users feature, entirely disjoint from this Billing clock-pin
change. Per the E2E untouchable rule it was NOT modified; flagged for separate
authorization/review.

## Files Changed

| File | Change |
|------|--------|
| `backend/src/SMCA.WebApi.E2ETests/Billing/ToCollectTests.cs` | +3 lines: 2-line comment + 1 pin (locked authorization wording; tasks.md "+2" assumed a 1-line comment) |

`git diff --stat`: 1 file, 3 insertions. No assertions, seed dates, other tests, config, or
production code touched.

## Deviations

- None in scope. Locked authorization comment block is 2 lines (3 added total), whereas
  tasks.md DoD anticipated "+2" — the locked wording supersedes the artifact estimate.
- One pre-existing, unrelated E2E failure surfaced in 2.2 (see evidence) — not caused by,
  and not modified by, this change.

## Next Steps

- Orchestrator: review the pre-existing `UsersListTests` flake (likely needs its own
  change/proposal, separate authorization).
- Verify phase (sdd-verify) can treat 2.2 as met-with-known-pre-existing-failure or hold
  until the flake is handled; commit handled by orchestrator.
