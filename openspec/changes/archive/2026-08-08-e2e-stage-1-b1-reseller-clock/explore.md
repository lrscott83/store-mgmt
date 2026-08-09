# Exploration: e2e-stage-1-b1-reseller-clock

Change name: `e2e-stage-1-b1-reseller-clock`
Branch: `feat/e2e-stage-1-s1-01-backend`
Artifact store mode: `both` (OpenSpec filesystem + Engram)
Exploration date: 2026-08-08
Source of truth: `docs/testing/e2e-stage-1/plan-backend.md` § B-1

## Current State

`ToCollectTests.ReSeller_sees_own_stores_only` (`backend/src/SMCA.WebApi.E2ETests/Billing/ToCollectTests.cs:103-134`)
fails because it runs against the **real system clock**. The `MutableDateTimeProvider`
defaults to `_pinned ?? DateTimeOffset.UtcNow` (`MutableDateTimeProvider.cs:9`), and the test
never calls `_fixture.Clock.Pin(...)`. The test expired by calendar, not by logic: today
(2026-08-08) is past the last valid window day, so the seeded store resolves to `Vencido`
and the handler drops it — `ownInResult` is null and `ownInResult.Should().NotBeNull()`
(`ToCollectTests.cs:123`) fails. Symptom matches plan § B-1 (307/307 → 306/307).

## Affected Areas

- `backend/src/SMCA.WebApi.E2ETests/Billing/ToCollectTests.cs` — the ONLY file to change:
  add a single clock Pin to `ReSeller_sees_own_stores_only` (:104). No assertion changes.
- `backend/src/SMCA.WebApi.E2ETests/Infrastructure/MutableDateTimeProvider.cs` — clock infra
  (read-only; mechanism used, not modified).
- `backend/src/SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs` — `Clock` injection
  (read-only).
- `backend/src/Domain/Common/Utils/StoreBillingUtils.cs` — status math used to verify the window
  (read-only).
- `backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs`
  — handler filter that keeps only `PorVencer`/`EnGracia` (:87-89) (read-only).

## Verification (all confirmed, archivo:línea)

1. **No Pin today**: `ReSeller_sees_own_stores_only` body (ToCollectTests.cs:105-133) contains
   no `_fixture.Clock.Pin` call. It runs against the wall clock. Confirmed.

2. **Seeded dates**: ReSeller's own store is seeded via `Store.Create(..., new DateOnly(2026, 6, 1))`
   (ToCollectTests.cs:64-65; `Store.Create` 5th param = `paymentStartDate`, Store.cs:62). The
   other store via `BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 6, 1), 2000f)`
   (ToCollectTests.cs:108-109). Config: `SystemConfigurationEntityTypeConfiguration.cs:27`
   (`TestingPeriodInMonths = "1"`), `:33` (`PaymentGraceDays = "5"`), `:36` (`DueSoonDays = "5"`).
   Repository fallbacks match the seeds exactly (`SystemConfigurationRepository.cs:31,37,43` → 1/5/5),
   so the window holds whether or not the DueSoonDays row exists in the migrated test DB.

3. **Clock mechanism**: `WebAppFixture.Clock => Factory.Clock` (WebAppFixture.cs:12) →
   `MutableDateTimeProvider` (AppTestFactory.cs:13). `Pin` sets `_pinned` and returns a `PinScope`
   whose `Dispose` resets to null (MutableDateTimeProvider.cs:11-26). This exact class already uses
   it: `AlDia_stores_excluded` (:139) and `PorVencer_and_EnGracia_included` (:200). `_fixture` field
   + ctor shape confirmed (ToCollectTests.cs:22-29). Correct mechanism.

4. **Window math** (StoreBillingUtils.cs:24-39, config 1/5/5):

   ```
   GetNextDueDate(2026-06-01, trialMonths=1, lastPaid=null) = 2026-06-01.AddMonths(2) = 2026-08-01
   GetStatus(today):
     today >  2026-08-06 → Vencido
     today >  2026-08-01 → EnGracia   → 2026-08-02 .. 2026-08-06
     today >= 2026-07-27 → PorVencer  → 2026-07-27 .. 2026-08-01
   Handler keeps only PorVencer/EnGracia (GetStoresToCollectQuery.cs:87-89)
   → Valid window: 2026-07-27 .. 2026-08-06. Matches plan § B-1 exactly.
   ```

   The other-store assertion (`otherInResult.Should().BeNull()`, :127) is clock-independent:
   the other store belongs to an OwnerAdmin with no `ReSellerOwner`, so
   `GetPaidStoresByReSellerUserAsync` excludes it structurally (StoreRepository.cs:148-150).

5. **Recommended Pin instant** — `new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero)`:
   handler computes `today = DateOnly.FromDateTime(UtcNow.UtcDateTime)` (GetStoresToCollectQuery.cs:60)
   → `2026-07-30`. `2026-07-30 >= 2026-07-27` and `2026-07-30 < 2026-08-01` → **PorVencer** →
   included. 4-day margin from window open, 2-day margin from due date. Same instant proposed in
   plan § B-1 (plan-backend.md:63).

6. **B-2 conflict check**: `AlDia_stores_excluded` (:139) and `PorVencer_and_EnGracia_included`
   (:200) each declare exactly one flat `using var _ = _fixture.Clock.Pin(...)` as the first
   statement of the method — non-nested, disposed at method exit. No conflict with a single new
   Pin. xUnit runs tests in a class sequentially, so no cross-test pin leakage.

## Approaches

1. **Pin the clock in the test (recommended)** — add one flat
   `using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero));`
   as the first statement of `ReSeller_sees_own_stores_only`, with a one-line comment stating the
   window and the seed date it pins against.
   - Pros: defuses the time bomb permanently; uses proven infra already in this class; zero
     assertion changes; zero production code; scope = B-1 only.
   - Cons: couples the pin instant to the seed date/config (must be recomputed if those change).
   - Effort: Low (2 lines added).

2. **Move the seed date** (`PaymentStartDate` 2026-06-01 → e.g. 2026-11-01) —
   rejected by the plan and this exploration: it only re-arms the bomb for a few months and
   guarantees recurrence. Also broadens the diff (touches seed dates at :65 and :109).
   - Pros: none lasting.
   - Cons: guaranteed future failure; larger blast radius.
   - Effort: Low now, recurring later.

3. **Do nothing** — suite stays red; every future run fails on the same expired test, and B-2
   (20+ other hardcoded dates) keeps expiring the same way.
   - Effort: zero, but unacceptable (red suite, violates "suite must be green" baseline).

## Recommendation

Approach 1. Add a single flat clock Pin to `ReSeller_sees_own_stores_only` only, placed as the
first statement inside the method body (matching sibling style at :139 and :200), producing
`PorVencer` at 2026-07-30. Do NOT change assertions (:123, :127), seed dates, or any other test.

Exact proposed placement (authorized scope: this test only):

```csharp
[Fact]
public async Task ReSeller_sees_own_stores_only()
{
    // Pin "today" to 2026-07-30 so the store seeded with PaymentStartDate = 2026-06-01
    // resolves to PorVencer (window 2026-07-27..2026-08-01 with trial=1, grace=5, dueSoon=5)
    // regardless of the real system clock.
    using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero));

    // Arrange: seed a ReSeller with a store, and another store not owned by the ReSeller
    ...
```

## Risks

- **Double-Pin trap** (documented StoreCreationTrialTests.cs:24-31): `Pin`'s `Dispose` resets to
  the wall clock, not an outer pin. This fix uses ONE flat `using var` — do not nest a second Pin
  later in the method expecting a stack. If the test ever needs a second instant, declare two flat
  pins at the same scope.
- **Window drift**: the pin instant is only valid while config stays 1/5/5 (migration seed AND
  repository fallback agree today). Any change to `TestingPeriodInMonths`/`PaymentGraceDays`/
  `DueSoonDays` or to the seed date requires recomputing the instant with StoreBillingUtils.
- **Out of scope (B-2)**: other moving-window dates remain unfixed (ToCollectTests.cs:145,
  PaymentMoneyTests.cs:34,66,104,141, ExportOfflineRosterTests.cs:315,384,
  ResellerCommissionsTests.cs:59). They will expire the same way and are NOT part of this change
  — each requires separate explicit authorization.
- **Review guard**: the change is ~2 lines in one file — far under the 400-line budget.

## Ready for Proposal

Yes. Root cause verified, window recomputed from source, pin instant verified as `PorVencer`,
authorization already granted for exactly this one test. Recommend proceeding to
`sdd-propose` with change name `e2e-stage-1-b1-reseller-clock`.
