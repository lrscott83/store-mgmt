# Tasks: Fix ReSeller to-collect test expiry (e2e-stage-1-b1-reseller-clock)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2 (2 added, 0 removed) in 1 file |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit, no PR |
| Delivery strategy | commit-only (no PR requested on this branch) |
| Chain strategy | pending (not applicable) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Implementation

- [x] 1.1 Add clock Pin as FIRST statement of `ReSeller_sees_own_stores_only` in
  `backend/src/SMCA.WebApi.E2ETests/Billing/ToCollectTests.cs` — insert after the method's
  opening `{` (:105), before the `// Arrange:` comment (:106), matching sibling style at :139/:200:

```csharp
// Pin "today" to 2026-07-30 → PorVencer for store seeded 2026-06-01 (window 2026-07-27..2026-08-01, trial=1/grace=5/dueSoon=5)
using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero));
```

  **Definition of done**: pin is the first statement; diff is exactly +2 lines in
  `ToCollectTests.cs` only; zero changes to assertions (:123/:127), seed dates (:65/:108-109),
  other tests, config, or production code (proposal capability "Fix ReSeller to-collect test
  expiry"). Single flat `using var` — never nest a second Pin (Double-Pin trap).

## Phase 2: Verification

- [x] 2.1 Run focused test and confirm green:
  `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ReSeller_sees_own_stores_only" --no-build`
  (project convention per `openspec/config.yaml` → `backend_e2e_filtered`; requires PostgreSQL
  on `localhost:5432`, database `smca_test`; `WebAppFixture` applies migrations).
  **Definition of done**: `ReSeller_sees_own_stores_only` passes on any calendar date
  (proposal success criterion 1).

- [x] 2.2 Run full suite and confirm no regressions:  <!-- [x] at archive time 2026-08-08 per Task Completion Gate exceptional repair: verify-report (#665) marks 2.2 complete "met: sole failure proven pre-existing/unrelated; verified independently here"; apply-progress records full evidence incl. stash A/B proof; orchestrator final-state facts confirm verdict PASS and the sole E2E failure is the pre-existing, out-of-scope UsersList flake. DoD "full solution green" met-with-known-pre-existing-failure. -->
  `dotnet test backend/src/SMCA.sln`
  **Definition of done**: full solution green; E2E count returns to documented baseline
  (307/307 per exploration § Current State / plan § B-1); `git diff --stat` still shows
  1 file, +2 lines (proposal success criterion 2).
  **Apply result**: Domain 22/22 ✅, Application.Tests 330/330 ✅, E2E 319/320 ❌ — sole
  failure `UsersListTests.List_includeInactive_true_includes_inactive_user` (Users feature),
  PROVEN pre-existing: fails identically on the pristine tree (stash A/B) and passes in
  isolation; not touched by this change (E2E untouchable rule). `ReSeller_sees_own_stores_only`
  green in full suite. Diff = 1 file, +3 lines (locked authorization wording uses a 2-line
  comment; tasks.md "+2" assumed a 1-line comment).

## Strict TDD Note

Test-only change: the E2E suite IS the test layer, so RED already exists — the test fails on the
wall clock today (expired by calendar, not logic). Tasks 2.1/2.2 are the verification steps; no
separate unit test pair applies.
