# Proposal: e2e-stage-1-b1-reseller-clock

## ID & Summary

**Change**: `e2e-stage-1-b1-reseller-clock`
**Branch**: `feat/e2e-stage-1-s1-01-backend`
**Source**: `docs/testing/e2e-stage-1/plan-backend.md` § B-1

Fix the expired-by-calendar E2E test `ToCollectTests.ReSeller_sees_own_stores_only` by pinning
the test clock to 2026-07-30 12:00Z — a date inside the PorVencer window
(2026-07-27..2026-08-01) for the seeded store (`PaymentStartDate = 2026-06-01`, config 1/5/5).
One test, two lines added, zero assertion or seed changes, zero production code.

## Why

The test is RED against the wall clock: today (2026-08-08) is past the last valid window day
(2026-08-06), so the seeded store resolves to `Vencido` and the handler drops it. The test
**expired, it did not break** — this is information, not an obstacle. Its intent ("a ReSeller
sees only its own stores") and assertions (:123, :127) are correct. The fix is deterministic
time control (`_fixture.Clock.Pin`, infra already proven at :139, :200), not test weakening;
moving the seed date would only re-arm the bomb.

## What Changes

### Capability: Fix ReSeller to-collect test expiry
- **Added**: deterministic clock pin so the seeded store resolves to `PorVencer` regardless of
  the real system clock.
- **Changed / Removed**: none — no assertions, seed dates, other tests, or production code.

## User Impact

None. Internal test determinism only; no user-visible behavior change.

## Out of Scope / Non-Goals

- Any other E2E test — including B-2 moving-window dates (ToCollectTests.cs:145,
  PaymentMoneyTests.cs:34,66,104,141, ExportOfflineRosterTests.cs:315,384,
  ResellerCommissionsTests.cs:59) — requires separate explicit authorization.
- Production source code: untouched.
- Assertions (`ownInResult.Should().NotBeNull()` :123, `otherInResult.Should().BeNull()` :127)
  and seed dates (:65, :108-109): unchanged.
- Config / migration seeds (`TestingPeriodInMonths`, `PaymentGraceDays`, `DueSoonDays`):
  unchanged.

## Open Questions

None. Authorization already granted; root cause and pin instant verified in exploration.

## Approach

Single flat `using var` pin as the first statement of `ReSeller_sees_own_stores_only` (:104),
matching sibling style (:139, :200):

```csharp
// Pin "today" to 2026-07-30 → PorVencer for store seeded 2026-06-01 (window 2026-07-27..2026-08-01, trial=1/grace=5/dueSoon=5)
using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero));
```

Window math (StoreBillingUtils.cs:24-39): next due = 2026-06-01.AddMonths(2) = 2026-08-01;
2026-07-30 ≥ 2026-07-27 → `PorVencer` → kept by handler (GetStoresToCollectQuery.cs:87-89).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Billing/ToCollectTests.cs` | Modified (1 test) | +2 lines: pin + comment |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Double-Pin trap (`Dispose` resets to wall clock, not outer pin) | Low | One flat `using var`; never nest a second Pin |
| Window drift if config/seed changes | Low | Instant documented with window math; recompute via StoreBillingUtils |
| Review guard | Low | ~2-line diff, far under 400-line budget |

## Rollout

No rollout — commit-only on current branch; no PR requested. Rollback: revert the single commit
(2 lines).

## Dependencies

- None new; uses existing `_fixture.Clock.Pin` infra (`MutableDateTimeProvider`).

## Success Criteria

- [ ] `ReSeller_sees_own_stores_only` passes on any calendar date.
- [ ] Diff = exactly 2 lines in 1 file; no other test/production/assertion/seed change.
