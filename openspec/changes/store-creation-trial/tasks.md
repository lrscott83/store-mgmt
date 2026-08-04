# Tasks: Every Created Store Starts Its Trial Clock (Backend)

## Execution constraint (binding on every task below)

No agent executes `dotnet build`, `dotnet test`, `dotnet restore`, or any other `dotnet` invocation
while working through this checklist. Every acceptance condition below is phrased as something a
human verifies by **reading the diff** or by **running the commands in the final section locally**.
Tests ship unexecuted; RED→GREEN is the user's to observe.

## Delivery

Commits-only on the current branch (no PRs, no chained slices, no `size:exception`). One work unit =
one commit. Work units are ordered; later ones depend on earlier ones landing first (production
before tests, infra before the tests that use it). Within group A→F the order also matches the
proposal/design numbering so the file reads top-to-bottom the same way the spec does.

---

## WU1 — Production: creation always starts the trial clock (+ mandatory unit-test collateral)

Spec link: `specs/billing/spec.md` — Domain Model `Store.PaymentStartDate`, "Activation (creation)" row
and its four scenarios. Design ref: D1, D5, D11.

- [x] **`backend/src/Application/Services/Stores/CreateStoreService.cs`**
  Add `IDateTimeProvider dateTimeProvider` as the **8th and last** constructor parameter (after
  `featureRepository`); store it in a new `private readonly IDateTimeProvider _dateTimeProvider;`
  field assigned last in the ctor body. Change line 36 from
  `Store.Create(name, ownerId, approved, tenantId, null, address, description)` to
  `Store.Create(name, ownerId, approved, tenantId, DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime), address, description)`.
  No DI registration changes needed — `IDateTimeProvider` is already `AddSingleton` at
  `SMCA.WebApi/Program.cs:49` and `WebApiTest/Program.cs:26`; singleton-into-scoped is legal.
  **Acceptance**: reading the file shows an 8-parameter constructor whose 8th parameter is
  `IDateTimeProvider`, and line 36 (now shifted) contains `DateOnly.FromDateTime` with no literal
  `null` anywhere in the 5th positional argument to `Store.Create`.

- [x] **`backend/src/Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs:67`**
  Replace the comment `// Store must have been activated (PaymentStartDate != null)` with wording that
  reflects the new reality, e.g. `// Legacy rows can still carry a null start date (no migration/backfill); new stores always carry one.`
  The guard on the next two lines (`if (store.PaymentStartDate is null) throw ...`) is **untouched** —
  comment only.
  **Acceptance**: diff for this file touches exactly one comment line; the `if` block below it is
  byte-identical to before.

- [x] **`backend/src/Application.Tests/Services/Stores/CreateStoreServiceTests.cs`** — mandatory
  collateral, ships in the same commit as WU1's production change (it is the only guaranteed RED
  outside E2E, per design D11):
  - Add `private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;` next to the other mock
    fields (`:24-30`), constructed in the ctor (`:36-44`) alongside the others.
  - Add `private static readonly DateTimeOffset FixedNow = new(2026, 3, 10, 0, 0, 0, TimeSpan.Zero);`
    and, inside `SetupDefaultSuccessfulScenarios()` (`:61-94`), add
    `_mockDateTimeProvider.Setup(x => x.UtcNow).Returns(FixedNow);` — mandatory, not optional: an
    unconfigured `Mock<IDateTimeProvider>.UtcNow` returns `default(DateTimeOffset)` (0001-01-01) and
    would silently poison every other test in the file that does not care about the clock.
  - In `CreateService()` (`:49-59`), append `_mockDateTimeProvider.Object` as the 8th constructor
    argument. This is the one-line fix that keeps every other test in the file (the ~25 tests that
    call `CreateService()`) compiling against the new ctor shape.
  - Rename `CreateStoreAsync_ShouldSetPaymentStartDate_NullInitially` (`:143`) to
    `CreateStoreAsync_ShouldSetPaymentStartDate_ToProviderToday`. Change the final assertion (`:159`,
    currently `result.PaymentStartDate.Should().BeNull();`) to
    `result.PaymentStartDate.Should().Be(DateOnly.FromDateTime(FixedNow.UtcDateTime));`. Nothing else
    in the test body changes.
  - Optional (design D11, not required): add
    `CreateStoreAsync_ShouldUseProviderClock_NotWallClock` — re-`Setup` the mock to a distinct instant
    inside the test and assert the created store's `PaymentStartDate` follows that instant, not
    `FixedNow` and not the wall clock.
  **Acceptance**: `rg "new CreateStoreService\(" backend/src/Application.Tests` shows a single call
  site (`CreateService()`) with exactly 8 arguments; `rg BeNull\(\) backend/src/Application.Tests/Services/Stores/CreateStoreServiceTests.cs`
  no longer matches the renamed test; the file still declares every test method it declared before
  this task, none removed.

**Commit message shape**: `feat(stores): start the trial clock at creation, not at first paid update`

---

## WU2 — Production: expose `PlanType` on `/auth/me`

Spec link: `specs/billing/spec.md` — R4 (`CurrentUserDto` MUST expose `PlanType`) and its two new
scenarios. Design ref: D4.

- [x] **`backend/src/Application/Dtos/Authentication/CurrentUserDto.cs`**
  Add `public string PlanType { get; set; } = "Free";` after the existing `PaymentStatus` property
  (`:22`).
  **Acceptance**: the DTO has a `PlanType` string property with a non-null default, positioned after
  `PaymentStatus`.

- [x] **`backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs`**
  In the `CurrentUserDto` object initializer (`:86-104`), add `PlanType = billing.PlanType,` next to
  the existing `PaymentStatus = billing.Status.ToString(),` line (`:103`).
  **Acceptance**: the initializer sets exactly one new property, `PlanType`, sourced from `billing.PlanType`
  (the same `billing` local already used for `NextDueDate`/`IsInTrial`/`Status`). No `IMapper`/profile
  touched — confirmed none exists for this DTO.

- [x] **`backend/src/Application/Services/Billing/BillingService.cs:49-50`**
  In the store-not-found early return —
  `return new StoreBillingSummary { StoreId = storeId, Status = StoreBillingStatusType.NoAplica };` —
  add `PlanType = "Free"` to that same object initializer.
  **Acceptance**: the early-return initializer now sets `StoreId`, `Status`, and `PlanType`; a user
  with no selected store gets `"planType": "Free"` on the wire instead of `"planType": ""`.

**Commit message shape**: `feat(billing): expose PlanType on CurrentUserDto`

---

## WU3 — E2E infrastructure: `SystemConfiguration` pinning + cache eviction helper

Spec link: `specs/billing-e2e-coverage/spec.md` — "Suite MUST Pin SystemConfiguration Rows". Design
ref: D2, D3.

- [x] **`backend/src/SMCA.WebApi.E2ETests/Infrastructure/BillingConfigSeed.cs`** (new file)
  Static class mirroring `MutableDateTimeProvider.Pin`'s shape:
  - Constants `TrialMonths = 1`, `GraceDays = 5`, `DueSoonDays = 5` (documented against
    `SystemConfigurationType` Ids 1/3/4).
  - `public static Task<IAsyncDisposable> PinAsync(AppTestFactory factory, int trialMonths = TrialMonths, int graceDays = GraceDays, int dueSoonDays = DueSoonDays)`.
  - **Enter**: open a DB scope, read the three `SystemConfiguration` rows by Id (1, 3, 4), snapshot
    each as `(int Id, string? Value)` where `null` means the row is absent (this is the case for Id 4
    today — no migration inserts it); upsert all three to the requested values; evict the three cache
    keys (below).
  - **Dispose** (`IAsyncDisposable.DisposeAsync`): restore each snapshot exactly — `UPDATE` if the
    snapshot had a value, **`DELETE`** if the snapshot was absent (this is the case that prevents a
    permanent Id-4 row); evict the cache keys again.
  - Cache eviction, both on enter and on dispose:
    `var cache = factory.Services.GetRequiredService<IMemoryCache>(); cache.Remove("TestingPeriodInMonths"); cache.Remove("PaymentGraceDays"); cache.Remove("DueSoonDays");`
    — these three string literals must match `BillingService.cs:60-62` exactly (duplication is a
    known, accepted risk per design D3, not fixed here).
  **Acceptance**: reading the file shows `PinAsync` returns an `IAsyncDisposable` whose dispose path
  contains a conditional `DELETE`-vs-`UPDATE` branch keyed on whether the original row existed, and
  `IMemoryCache.Remove` is called with the three literal keys in both the enter and the dispose path.
  No other file changes — this task touches zero production code.

**Commit message shape**: `test(e2e): add BillingConfigSeed helper to pin trial/grace/due-soon config`

---

## WU4 — E2E group A: admin `POST /v1/stores` (tests 1-5) + file scaffolding

Spec link: `specs/billing-e2e-coverage/spec.md` §A. Design ref: D6, D7, D8, D9 (partial), D10.

- [x] **`backend/src/SMCA.WebApi.E2ETests/Billing/StoreCreationTrialTests.cs`** (new file — created in
  this work unit, extended by WU5-WU9)
  - Scaffolding: `[Collection("e2e")]` class per `StoreActivationTests.cs`'s shape; ctor takes
    `WebAppFixture fixture`, stores `_fixture` and `_f = fixture.Factory`.
  - Shared anchor constants (design D7): `AnchorInstant = new DateTimeOffset(2026, 3, 10, 0, 0, 0, TimeSpan.Zero)` and `Start = new DateOnly(2026, 3, 10)`. A header comment spelling out the
    two-pin trap: `MutableDateTimeProvider.Pin`'s dispose resets to the **wall clock**, not to an
    outer pin — nested `using (...) { }` blocks silently unpin. Use flat `using var` statements only.
  - Private helpers local to this file (no new shared seed class beyond `BillingConfigSeed`):
    `CreateStoreViaApiAsync(IEnumerable<int> moduleIds)` (SuperAdmin + owner seed, `POST /api/v1/stores`,
    asserts `201 Created`), `RegisterStoreAsync()` (`POST /api/v1/auth/register`, asserts `201`),
    `ReadPaymentStartDateAsync(Guid storeId)` (DB read via `IgnoreQueryFilters().AsNoTracking()` —
    `AsNoTracking` is required, per `BackfillMigrationTests.cs:58`'s documented stale-tracked-entity
    bite), `MeAsync(HttpClient c)` (`GET /api/v1/auth/me` → `ApiResponse<CurrentUserDto>`).
  - Every test wraps its seeded rows in `try/finally`, reusing `BillingSeed.CleanupAsync`,
    `StoreSeed.CleanupStoreAsync`/`CleanupOwnerAsync`, `DbTestHelpers.CleanupUserAsync`,
    `AuthzSeed.CleanupStoreGraphAsync`, and `DbTestHelpers.CleanupTenantCascadeAsync` for
    self-registered stores (each one creates its own tenant).
  - Unique names via `$"...-{Guid.NewGuid():N}"` everywhere (duplicate store names are rejected).

  Tests (all pin `AnchorInstant` via `_fixture.Clock.Pin(...)` except test 5):
  1. `Create_sets_paymentStartDate_to_today` — admin create with `moduleIds=[7]`; assert
     `ReadPaymentStartDateAsync(storeId) == Start`.
  2. `Create_with_paid_module_sets_paymentStartDate_to_today` — admin create with `moduleIds=[7,6]`;
     same assertion.
  3. `Create_with_free_only_modules_also_sets_paymentStartDate` — admin create with `moduleIds=[7]`
     (free-only); same assertion — this is the test that discriminates the new behavior from the old
     `UpdateStore`-only conditional.
  4. `Create_ignores_client_supplied_paymentStartDate` — POST body carries a stray
     `"paymentStartDate": "2020-01-01"` property; assert the persisted value is `Start`, never
     `2020-01-01`. Per design D6 this passes today because `CreateStoreCommand` has no such member and
     System.Text.Json's default `Skip` drops unknown properties — the test still pins that fact.
  5. `Update_by_non_superadmin_cannot_seed_paymentStartDate` — pins a **separate**,
     near-wall-clock anchor (`AnchorCloseInstant = DateTimeOffset.UtcNow.Date`, per D6/D7 —
     **not** `AnchorInstant**), not the far-future one, because the OwnerAdmin actor's own store is
     seeded by `AuthzSeed.SeedOwnerAdminAsync` with the real wall clock and a far-future pin would push
     it toward `Vencido`. Create the target store via `CreateStoreViaApiAsync`, then as an OwnerAdmin
     (`AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true)`) issue
     `PUT /api/v1/stores/{targetStoreId}` with a backdated `paymentStartDate: "2020-01-01"` in the body
     and the same module list used at creation (so `UpdateStoreCommandHandler`'s
     `PaymentStartDate is null && hasPaidModuleRequested` branch is skipped — it's not null already).
     Assert `200 OK` **first** (so an auth regression is distinguishable from a guard regression), then
     assert the persisted `PaymentStartDate` is unchanged from `Start`, never `2020-01-01`.

  **Acceptance**: the file compiles conceptually against existing helper signatures (`BillingSeed`,
  `StoreSeed`, `AuthzSeed`, `DbTestHelpers` — all confirmed present in
  `backend/src/SMCA.WebApi.E2ETests/Infrastructure/`); tests 1-4 pin `AnchorInstant`, test 5 pins a
  distinct near-now anchor; test 5 asserts `200 OK` before asserting the date; no test in this group
  calls `BillingConfigSeed.PinAsync` (not required — these five assert a persisted `DateOnly` only,
  never `SystemConfiguration`-derived math).

**Commit message shape**: `test(e2e): pin admin store creation always seeds the trial clock (group A)`

---

## WU5 — E2E group B: self-registration (tests 6-7)

Spec link: `specs/billing-e2e-coverage/spec.md` §B. Design ref: D8 (register row), D9's precursor.

- [x] **`StoreCreationTrialTests.cs`** — append:
  6. `Register_creates_store_with_paymentStartDate_today` — `RegisterStoreAsync()`; assert
     `ReadPaymentStartDateAsync(storeId) == Start`.
  7. `Register_store_reports_trial_in_billing_summary` — `RegisterStoreAsync()` under
     `await using var cfg = await BillingConfigSeed.PinAsync(_f);` (config pin required — this test
     reads `SystemConfiguration`-derived fields); call `MeAsync` with the register token; assert
     `IsInTrial == true`, `PlanType == "Paid"` (module 6 "Estadísticas" qualifies per the verified
     six-module fact), `PaymentStatus == "AlDia"`, `PaymentDueDate == Start.AddMonths(2)`.
  **Acceptance**: test 6 uses no config pin (persisted-date-only assertion); test 7 wraps its call in
  `BillingConfigSeed.PinAsync` and asserts all four billing-summary fields listed above, with
  `PlanType` asserted as the literal string `"Paid"`.

**Commit message shape**: `test(e2e): pin self-registered stores report trial + Paid plan (group B)`

---

## WU6 — E2E group C: derived math + module filter under Vencido (tests 8-14)

Spec link: `specs/billing-e2e-coverage/spec.md` §C. Design ref: D7 (landmark table), D8 (test 14 path).

Baseline landmarks (all under `BillingConfigSeed.PinAsync()` with the defaults `trialMonths=1`,
`graceDays=5`, `dueSoonDays=5`, and `Start = 2026-03-10`):

| Test | Pinned "today" | Expected |
|---|---|---|
| 8 | `Start` (2026-03-10) | `IsInTrial=true`, `AlDia` |
| 9 | `Start.AddMonths(1).AddDays(1)` (2026-04-11) | `IsInTrial=false`, `AlDia` |
| 10 | any post-creation instant | `PaymentDueDate == Start.AddMonths(2)` (2026-05-10) |
| 11 | `due.AddDays(-5)` (2026-05-05) | `PorVencer` |
| 12 | `due.AddDays(1)` and `due.AddDays(5)` (2026-05-11 and 2026-05-15, both ends) | `EnGracia` |
| 13 | `due.AddDays(6)` (2026-05-16) | `Vencido` |
| 14 | `due.AddDays(6)` (2026-05-16) | `StoreModuleIds` contains only the free module |

- [x] **`StoreCreationTrialTests.cs`** — append:
  8. `Day_one_is_in_trial_and_AlDia` — `RegisterStoreAsync()` pinned at `Start`; `MeAsync` asserts
     `IsInTrial=true`, `PaymentStatus="AlDia"`.
  9. `Trial_ends_one_month_after_creation` — create pinned at `Start` (two-pin idiom: re-pin before the
     assertion call, per the file header trap comment); assert at `Start.AddMonths(1).AddDays(1)`:
     `IsInTrial=false`, `PaymentStatus="AlDia"`.
  10. `First_due_is_creation_plus_two_months` — assert `PaymentDueDate == Start.AddMonths(2)`.
  11. `PorVencer_five_days_before_due` — assert at `due.AddDays(-5)`: `PaymentStatus="PorVencer"`.
  12. `EnGracia_from_due_plus_one_through_due_plus_five` — assert **both** boundary instants
      (`due.AddDays(1)` and `due.AddDays(5)`) report `PaymentStatus="EnGracia"` (two assertions, one
      test, per the spec's inclusive-range scenario).
  13. `Vencido_from_due_plus_six` — assert at `due.AddDays(6)`: `PaymentStatus="Vencido"`.
  14. `Vencido_store_keeps_only_free_modules` — **not** via register (design D8 corollary: register
      assigns all six paid modules, too many to make a crisp assertion). Create via
      `CreateStoreViaApiAsync(moduleIds: [7, 6])` (one free, `PriceIncluded` module 7 + one paid module
      6), then set that owner user's `SelectedStoreId` in the DB directly (pattern per
      `GetMeBillingStatesTests.cs:153` — creation is still via the real API; only the "which store"
      pointer is seeded). Pin `due.AddDays(6)`; call `MeAsync`; assert `StoreModuleIds` contains `7`
      and does **not** contain `6`.
  **Acceptance**: every test in this group opens `BillingConfigSeed.PinAsync` before any clock pin;
  test 9 and test 14 each use two separate `using var Pin(...)` statements (creation instant, then
  assertion instant) rather than a nested `using (...) { }` block; test 12 makes two assertions
  against the two boundary dates in the same test method; test 14's assertion is a `Contains`/
  `DoesNotContain` pair against `StoreModuleIds`, not a full-list equality.

**Commit message shape**: `test(e2e): pin trial/due/PorVencer/EnGracia/Vencido boundaries (group C)`

---

## WU7 — E2E group D: collections (tests 15-16)

Spec link: `specs/billing-e2e-coverage/spec.md` §D. Design ref: D8.

- [x] **`StoreCreationTrialTests.cs`** — append:
  15. `New_store_absent_from_to_collect_during_trial` — `RegisterStoreAsync()` pinned at `Start`
      (`AlDia`, in trial), under `BillingConfigSeed.PinAsync` (the "to collect" query reads
      `ISystemConfigurationRepository` uncached, so the pin still matters for determinism even though
      the cache-eviction half is a no-op on this path); call `GET /api/v1/stores/to-collect` as
      SuperAdmin; assert the created store's id is **not** present in the response.
  16. `Free_plan_store_shows_zero_amount_in_to_collect` — `CreateStoreViaApiAsync(moduleIds: [7])`
      (free-only — a registered store has paid modules and cannot demonstrate this), pinned so the
      store sits at `PorVencer` or `EnGracia` (e.g. `due.AddDays(-3)`); call the same endpoint; assert
      the store **is** present with `Amount == 0`.
  **Acceptance**: test 15 asserts non-membership by id; test 16 asserts membership plus
  `Amount == 0` on the matched entry; test 16 creates via the admin endpoint, never via register.

**Commit message shape**: `test(e2e): pin to-collect visibility during trial and free-plan zero-amount (group D)`

---

## WU8 — E2E group E: payments (test 17)

Spec link: `specs/billing-e2e-coverage/spec.md` §E. Design ref: D9 — **the corrected amount, 3000, not 500**.

- [x] **`StoreCreationTrialTests.cs`** — append:
  17. `RegisterStorePayment_succeeds_for_a_brand_new_store` — `RegisterStoreAsync()` pinned at
      `Start` (or any instant at/after `Start.AddMonths(2)`, matching D9's derivation); as a SuperAdmin
      client, `POST /api/v1/stores/{storeId}/payments`. Assert:
      - HTTP `200 OK`, `Succeeded=true`, `Data=true`.
      - Persisted `StorePayment.Price == 3000f` — **six** qualifying paid modules (5 Reportes, 6
        Estadísticas, 8 Gastos, 9 Facturación, 10 Historiales, 11 Créditos), each
        `GetCurrentPrice(2000, 75, 0) = 500`. Add an inline comment deriving `6 * 500 = 3000` so the
        next reader re-derives instead of guessing if the module seed ever changes. **This is the
        corrected value — the proposal's original facts table said `500`, which was wrong; do not
        revert to `500`.**
      - `PaymentBeforeDate == Start.AddMonths(3)` (current due `Start.AddMonths(2)` + 1 month).
      - `Year`/`Month` match `Start.AddMonths(3)`'s year/month.
      - `StorePaymentStatusId == (int)StorePaymentStatusType.Paid`.
      - `ByReSeller == false` (SuperAdmin caller).
      - Deliberately **not** asserted: `StoreBillingSummary.CurrentMonthAmount` (known, pre-existing,
        out-of-scope divergence between raw `Price` sum and `GetCurrentPrice` sum — design D9).
  **Acceptance**: the `Price` assertion is `3000f` with a comment deriving it from six modules; no
  assertion in this test touches `CurrentMonthAmount`.

**Commit message shape**: `test(e2e): pin brand-new self-registered store payment at 3000 (group E)`

---

## WU9 — E2E group F: legacy data (test 18)

Spec link: `specs/billing-e2e-coverage/spec.md` §F + "StoreActivationTests Remains Unchanged". Design
ref: D8, D12.

- [ ] **`StoreCreationTrialTests.cs`** — append:
  18. `Legacy_stores_with_null_paymentStartDate_are_not_retro_activated` — seed directly via
      `BillingSeed.SeedFreeStoreAsync(_f)` (bypasses `CreateStoreService` entirely, `paymentStartDate: null`
      at seed time), pattern per `Billing/BackfillMigrationTests.cs`. Assert
      `ReadPaymentStartDateAsync(storeId)` is still `null` after the change is live (no migration ran).
  **Acceptance**: this test never calls `CreateStoreViaApiAsync` or `RegisterStoreAsync` — it seeds
  directly through `BillingSeed`, matching the fact that legacy rows never went through
  `CreateStoreService`.

- [ ] **No-op confirmation task — `backend/src/SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs`**
  Confirm the file is **untouched**: `git diff --stat` for this path shows no changes. All three tests
  (`Paid_module_on_null_start_sets_paymentStartDate_to_today`, `Free_modules_only_leaves_paymentStartDate_null`,
  `Existing_paymentStartDate_unchanged_when_adding_modules`) remain exactly as they are today.
  **Acceptance**: `git diff --stat -- backend/src/SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs`
  on the final branch state is empty.

**Commit message shape**: `test(e2e): pin legacy null-start rows are never retro-activated (group F)`

---

## Review Workload Forecast

| Signal | Value |
|---|---|
| Files touched | 4 production (`CreateStoreService.cs`, `CurrentUserDto.cs`, `GetMeQuery.cs`, `BillingService.cs`, `RegisterStorePaymentCommand.cs` = 5) + 1 modified test file (`CreateStoreServiceTests.cs`) + 1 new infra file (`BillingConfigSeed.cs`) + 1 new test file (`StoreCreationTrialTests.cs`, 18 tests) |
| Estimated changed lines | Well over 400 (18 E2E tests alone, following the house pattern, typically run 15-40 lines each) |
| Chained PRs recommended | No — **user-decided delivery is commits-only on the branch**; exceeds 400 lines but ships whole, no `size:exception` needed |
| Decision needed before apply | No — delivery strategy is pre-resolved by the user; nothing to ask |
| Commit count | 9 (WU1-WU9), ordered: production (2) → test infra (1) → test groups A-F (6, in spec order) |

## Dependency graph

```
WU1 (creation behavior + unit collateral)  ─┐
WU2 (PlanType on the wire)                  ├─► WU3 (config-pin infra) ─► WU4 (group A) ─► WU5 (group B) ─► WU6 (group C) ─► WU7 (group D) ─► WU8 (group E) ─► WU9 (group F)
                                            ─┘
```

WU1 and WU2 are independent of each other and could be committed in either order; both must land
before WU3+ (the E2E tests exercise the production behavior). WU4-WU9 append to the same file in
sequence and must land in that order (each later group's helpers/anchor constants are introduced in
WU4).

## User-run verification (copy from `proposal.md` §Verification — not agent-run)

```bash
# full solution
dotnet test backend/src/SMCA.sln

# E2E project only
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj

# just the new suite
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj \
  --filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Billing.StoreCreationTrialTests"

# the unit-test collateral
dotnet test backend/src/Application.Tests/Application.Tests.csproj \
  --filter "FullyQualifiedName~CreateStoreServiceTests"
```

E2E requires Postgres at `localhost:5432`, db `smca_test`; `WebAppFixture.InitializeAsync` runs the
migrations itself.

## Success Criteria (copied from proposal, unchanged)

- [ ] Admin-created and self-registered stores both persist `PaymentStartDate = today`, free-only
      modules included
- [ ] A non-SuperAdmin cannot seed `PaymentStartDate` through either creation or update
- [ ] `GET /auth/me` returns `PlanType` alongside the existing billing fields
- [ ] Trial/due/PorVencer/EnGracia/Vencido boundaries hold end-to-end under a pinned clock **and
      pinned config**
- [ ] `RegisterStorePayment` accepts a brand-new store and advances from `start + 2 months`, price
      `3000`
- [ ] Legacy null-start rows untouched; `UpdateStore` activation still works for them
- [ ] `StoreActivationTests` still has all three tests, all passing
- [ ] User confirms the local `dotnet test` runs green
