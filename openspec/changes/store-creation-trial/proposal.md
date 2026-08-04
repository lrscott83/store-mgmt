# Proposal: Every Created Store Starts Its Trial Clock

## Intent

"Toda tienda que se crea sale con el plan de pago en modo trial." Today `CreateStoreService.CreateStoreAsync` (`Application/Services/Stores/CreateStoreService.cs:36`) hardcodes `null` for `PaymentStartDate`, so the trial clock only ever starts later, via the `UpdateStore` activation-on-first-paid conditional. Both entry points (admin `POST /v1/stores` and self-registration) share that one write path, so one line decides it. After the change every new store carries `PaymentStartDate = today` unconditionally — paid modules or free-only. Legacy rows stay `null`; no migration, no backfill.

## Scope

### In Scope
- `CreateStoreService`: inject `IDateTimeProvider`, replace the hardcoded `null` with `DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime)`. Covers admin + register in one place.
- Expose `PlanType` (`"Paid"`/`"Free"`, already computed at `BillingService.cs:55`) on the wire: new field on `CurrentUserDto`, populated in `GetMeQueryHandler` alongside `PaymentDueDate`/`IsInTrial`/`PaymentStatus`. **User decision** — chosen over dropping the E2E assertion.
- `BillingService.cs:49-50`: the store-not-found early return sets `PlanType = "Free"`. Without it, `/auth/me` puts `"planType": ""` on the wire for a user with no selected store, the moment the field becomes observable. Accepted as part of exposing the field.
- New E2E file `SMCA.WebApi.E2ETests/Billing/StoreCreationTrialTests.cs` (18 tests, below).
- Repair `Application.Tests/Services/Stores/CreateStoreServiceTests.cs` (collateral, mandatory).
- `RegisterStorePaymentCommand.cs:67-69`: guard stays functionally identical; refresh only the stale "Store must have been activated" comment.

### Out of Scope
- **The `UpdateStore` activation-on-first-paid conditional (`UpdateStoreCommand.cs:96-97`) SURVIVES unchanged.** User decision. It is the only path by which a legacy store (`PaymentStartDate = null`) can ever start its clock; removing it would freeze those rows in `NoAplica` forever.
- **No test deletions.** All three tests in `Billing/StoreActivationTests.cs` are kept — see "Correction" below.
- **No `hasPaidModule` gate** on `GetStoresToCollectQuery` / `GetPaidStoresAsync`. **User decision**: free-plan stores surfacing in "to collect" with `Amount = 0` is ACCEPTED behavior and is pinned by test 15.
- Billing math (`StoreBillingUtils`) — verified correct against the stated boundaries; no change.
- EF migration / backfill of existing rows. `PaymentStartDate` is already `DateOnly?`.
- Frontend (already committed: client never seeds the trial clock on create).

## Correction: the two tests originally slated for deletion are KEPT

The original request was to delete `Paid_module_on_null_start_sets_paymentStartDate_to_today` (`StoreActivationTests.cs:37`) and `Free_modules_only_leaves_paymentStartDate_null` (`:71`) as "states that cease to exist". Reading the code shows the premise does not hold:

Both tests seed through `BillingSeed.SeedFreeStoreAsync`, which inserts the `Store` **directly into the database** with `paymentStartDate: null` (`BillingSeed.cs:50`) — the API creation path is never exercised. They then issue `PUT /api/v1/stores/{id}`. So they test the **update** path against a **legacy row**, which this change does not touch. They will keep passing, and the states they cover remain live for exactly the pre-existing data that requirement 17 mandates preserving.

Those states would only cease to exist if the `UpdateStore` conditional were also removed. The user chose to keep it. Therefore: **no deletions.**

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `billing`: `Store.PaymentStartDate` is set at CREATION for every store. Creation becomes the primary activation trigger; the `UpdateStore` conditional remains as the legacy-row activation path. `CurrentUserDto` gains `PlanType`.
- `billing-e2e-coverage`: adds the `StoreCreationTrialTests` suite. `StoreActivationTests` unchanged.

## Approach

One-line behavior change plus DI wiring; everything else is test surface. `MutableDateTimeProvider.Pin(...)` (`Infrastructure/MutableDateTimeProvider.cs`, reached via `fixture.Clock.Pin(...)`, `IDisposable` scope) drives all date math end-to-end so no test depends on wall-clock. Seeds (`BillingSeed`, `StoreSeed`) call `Store.Create` directly and bypass `CreateStoreService`, so existing billing E2E fixtures are unaffected — only tests that go through the real creation path change.

**Rejected**: setting the date in each handler (two call sites, drift risk); a migration to activate legacy stores (explicitly excluded by the user); gating "to collect" on paid modules (user accepted amount-0 rows); removing the `UpdateStore` conditional (user decision to keep).

## Consequence: `NoAplica` disappears for new stores

`GetStatus` returns `NoAplica` only when `paymentStartDate is null` (`StoreBillingUtils.cs:33`), and `FilterForBilling` treats `NoAplica` as "all modules pass" (`:55`). Once every new store carries a clock, no newly created store is ever `NoAplica` — every store enters the paid lifecycle.

For a free-only store this means: at `due + 6` days it reports `PaymentStatus: "Vencido"` through `CurrentUserDto` while owing `$0`. No module is actually lost (all of its modules are `PriceIncluded`, and `FilterForBilling` keeps exactly those), but the status string reaching the UI changes. This is a real user-visible effect of the rule and is documented here rather than discovered later.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Application/Services/Stores/CreateStoreService.cs` | Modified | `IDateTimeProvider` ctor param; line 36 `null` → today |
| `Application/Dtos/Authentication/CurrentUserDto.cs` | Modified | New `PlanType` field |
| `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Modified | Map `billing.PlanType` → DTO (alongside `:101-103`) |
| `.../RegisterStorePayment/RegisterStorePaymentCommand.cs` | Modified | Comment only (`:67-69`) |
| `E2ETests/Billing/StoreCreationTrialTests.cs` | New | 18 tests |
| `Application.Tests/Services/Stores/CreateStoreServiceTests.cs` | Modified | Rewrite `:143-160`; fix `CreateService()` factory `:49-59` |
| `E2ETests/Billing/StoreActivationTests.cs` | **Unchanged** | All three tests kept |

## Verified facts the tests depend on

Every item below was read from source, not assumed:

| Fact | Evidence |
|------|----------|
| `Store.Create`'s 5th positional arg is `paymentStartDate`; `CreateStoreService.cs:36` passes `null` | `Domain/Entities/Stores/Store.cs:62` |
| `PaymentStartDate` is `DateOnly?` — no migration needed | `Store.cs:33` |
| Admin and register share `CreateStoreAsync` | `CreateStoreCommand.cs:54`, `RegisterCommand.cs:82` |
| First due = `start.AddMonths(trialMonths + 1)` | `StoreBillingUtils.cs:28` |
| Trial is inclusive: `today <= start.AddMonths(trialMonths)` | `StoreBillingUtils.cs:45` |
| `Vencido` at `today > due + graceDays`; `EnGracia` at `today > due`; `PorVencer` at `today >= due - dueSoonDays` | `StoreBillingUtils.cs:35-38` |
| Register assigns **all** modules from `GetAvailableModulesToStore()` | `RegisterCommand.cs:73,82-83` |
| Module 6 "Estadísticas" is `IsActive=true`, `AvailableToStore=true`, `PriceIncluded=false`, `Price=2000`, `PercentDiscountPrice=75`; its feature 60 "Dashboard" is active — so it passes the `GetAvailableModulesToStore` filter | `ApplicationDbContextModelSnapshot.cs:602-610`, `:272-278`; `ModuleRepository.cs:20-22` |
| ⇒ a self-registered store **does** get a paid module ⇒ `PlanType = "Paid"` | `BillingService.cs:54-55` |
| ⇒ **six** paid modules qualify (5 Reportes, 6 Estadísticas, 8 Gastos, 9 Facturación, 10 Historiales, 11 Créditos), each `Price=2000`/`PercentDiscountPrice=75` with ≥1 active `AvailableToStore` feature ⇒ a self-registered store's billable amount is `6 × 500 = 3000` | `ApplicationDbContextModelSnapshot.cs:588-671`, features `:262-399`; `CurrentPriceServiceUtils.cs:13` |
| ⇒ any test needing a **small, known** module set must create through the admin endpoint, never through register | — |
| `TestingPeriodInMonths = "1"`, `PaymentGraceDays = "5"` are seeded by migrations; `DueSoonDays` has **no migration row** (only a pending `HasData` at `SystemConfigurationEntityTypeConfiguration.cs:34-36`) so it resolves via the `5` fallback | `20250116145520_Create-ReSeller-StorePayment-Tables.cs:217`, `20260727164714_Add-PaymentGraceDays-SystemConfig.cs:16` |
| `PlanType` exists only on `StoreBillingSummary`; no HTTP DTO carries it today | `StoreBillingSummary.cs:9`, `CurrentUserDto.cs:20-22` |
| `GetPaidStoresAsync` filters on `PaymentStartDate != null` alone | `StoreRepository.cs:129-137` |
| E2E DB is built by running the real migrations | `WebAppFixture.cs:28` |

### The clock-config trap

`GetTestingPeriodInMonthsAsync` / `GetPaymentGraceDaysAsync` / `GetDueSoonDaysAsync` return `1` / `5` / `5` **only as a fallback when the `SystemConfiguration` row is absent** (`SystemConfigurationRepository.cs:31,37,43`). If the E2E database has rows with different values, every date assertion in group C shifts silently.

**Requirement**: the new suite must pin `TestingPeriodInMonths`, `PaymentGraceDays` and `DueSoonDays` explicitly (seed or overwrite the rows in fixture setup) rather than relying on the fallbacks. Note also `BillingService.cs:62` clamps trial months with `Math.Max(1, ...)`, while `RegisterStorePaymentCommand.cs:86` does **not** — they can disagree if the row holds `0`.

## Test Inventory

### New — `E2ETests/Billing/StoreCreationTrialTests.cs`

**A. Admin `POST /v1/stores`**
1. `Create_sets_paymentStartDate_to_today` — base case (RED today).
2. `Create_with_paid_module_sets_paymentStartDate_to_today` — triangulation.
3. `Create_with_free_only_modules_also_sets_paymentStartDate` — encodes "toda tienda"; the discriminator vs. the `UpdateStore` conditional.
4. `Create_ignores_client_supplied_paymentStartDate` — body carries `2020-01-01`; server uses today.
5. `Update_by_non_superadmin_cannot_seed_paymentStartDate` — **added.** See below.

**Why test 4 needed a partner.** `CreateStoreCommand` (`:17`) has no `PaymentStartDate` member, and no `AddJsonOptions` / `UnmappedMemberHandling` is configured anywhere in the WebApi, so System.Text.Json's default applies: an unknown `paymentStartDate` property is dropped at binding. Test 4 therefore passes today for a reason unrelated to any guard — it pins the *absence of a field*, which is still worth keeping (it goes red the day someone adds one), but it exercises nothing live.

The live gate is on the other endpoint: `UpdateStoreCommand` **does** carry `DateOnly? PaymentStartDate` (`:26`) and the handler honours it only for SuperAdmin (`:100-101`). Test 5 sends a backdated `paymentStartDate` as an **OwnerAdmin** and asserts the clock does not move. That one can fail today and covers a real branch. Together they make "the client never seeds the trial clock" an enforced claim rather than a decorative one.

**B. Self-registration**
6. `Register_creates_store_with_paymentStartDate_today`
7. `Register_store_reports_trial_in_billing_summary` — `IsInTrial=true`, `PlanType=Paid`, `Status=AlDia`, `NextDueDate = today + 2 months`. (`PlanType=Paid` verified, see facts table.)

**C. Derived math (pinned clock + pinned config)**
8. `Day_one_is_in_trial_and_AlDia`
9. `Trial_ends_one_month_after_creation` — start+1mo+1d → `IsInTrial=false`, still `AlDia`
10. `First_due_is_creation_plus_two_months`
11. `PorVencer_five_days_before_due`
12. `EnGracia_from_due_plus_one_through_due_plus_five`
13. `Vencido_from_due_plus_six`
14. `Vencido_store_keeps_only_free_modules` — the real cut of `FilterForBilling`

**D. Collections**
15. `New_store_absent_from_to_collect_during_trial`
16. `Free_plan_store_shows_zero_amount_in_to_collect` — accepted consequence

**E. Payments**
17. `RegisterStorePayment_succeeds_for_a_brand_new_store` — must now accept and advance from `start + 2 months`; expected amount for a self-registered store is `3000` (six paid modules × 500).

**F. Existing data**
18. `Legacy_stores_with_null_paymentStartDate_are_not_retro_activated` — pattern per `Billing/BackfillMigrationTests.cs`

### Modified — `Application.Tests/Services/Stores/CreateStoreServiceTests.cs`
- `CreateStoreAsync_ShouldSetPaymentStartDate_NullInitially` (`:143`, asserts `BeNull()` at `:159`) — the only guaranteed RED outside E2E; rewrite to assert today under a fake clock, and rename.
- `CreateService()` (`:49-59`) — instantiates `new CreateStoreService(...)` with 7 args; the new `IDateTimeProvider` param breaks the factory and therefore EVERY test in the file. Add a mock provider and thread it through.

### Confirmed NOT broken
`StoreActivationTests` (all three — they seed legacy rows directly and exercise the update path), `PaymentDateTests`, `ToCollectTests`, `GetStoresToCollectTests`, `GetMeBillingStatesTests` (incl. the explicit `paymentStartDate: null` free-store case, still valid as a legacy scenario), `GetMeBillingTests`, `RegisterStorePaymentTests`, `BackfillMigrationTests`, `Stores/StoreCreateTests` — all seed via `Store.Create` and bypass `CreateStoreService`.

## Verification

**Nobody in this pipeline compiles or runs anything.** No `dotnet` invocation occurs in any phase of this change. Strict TDD RED→GREEN cannot be demonstrated by the agents; the tests ship unexecuted and the user runs them locally. Commands (sourced from `backend/src/SMCA.sln` and `backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`, written down, never run):

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

E2E requires Postgres at `localhost:5432`, db `smca_test`; `WebAppFixture.InitializeAsync` runs the migrations itself (`WebAppFixture.cs:28`).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tests ship unexecuted — a compile error or bad assertion reaches the user | High | Keep every test on existing infra patterns; user runs the filtered command first |
| Group C assertions silently shift because the E2E DB holds non-default `SystemConfiguration` rows | Med | Suite pins `TestingPeriodInMonths`/`PaymentGraceDays`/`DueSoonDays` in setup — mandatory, see "clock-config trap" |
| `CreateStoreServiceTests` ctor ripple silently breaks every test in the file | Med | Explicitly scoped as a task; mechanical |
| Test 4 passes for a reason unrelated to any guard | Resolved | Paired with test 5, which exercises the live SuperAdmin gate on `UpdateStore` |
| Test 7 expects `PlanType=Paid` | Resolved | Verified: module 6 passes the availability filter and is `PriceIncluded=false` |
| Free stores appear in "to collect" with `Amount = 0` | High (certain) | ACCEPTED by the user; pinned by test 16 |
| Free stores start reporting `PaymentStatus: "Vencido"` while owing $0 | High (certain) | Documented above; no module access is lost |
| `PlanType` on `CurrentUserDto` is an additive API contract change | Low | Additive only; frontend ignores unknown fields |

## Rollback Plan

Revert `CreateStoreService.cs:36` to `null` and drop the `IDateTimeProvider` param; revert `CurrentUserDto`/`GetMeQuery`; delete `StoreCreationTrialTests.cs`; restore the original `CreateStoreServiceTests`. `StoreActivationTests` is untouched, so nothing to restore there. No schema change, no data written — nothing to undo in the database beyond rows created while the code was live.

## Dependencies

None. `IDateTimeProvider` is already registered app-wide and already consumed by `UpdateStoreCommandHandler`, `BillingService`, `GetStoresToCollectQuery`.

## Success Criteria

- [ ] Admin-created and self-registered stores both persist `PaymentStartDate = today`, free-only modules included
- [ ] A non-SuperAdmin cannot seed `PaymentStartDate` through either creation or update
- [ ] `GET /auth/me` returns `PlanType` alongside the existing billing fields
- [ ] Trial/due/PorVencer/EnGracia/Vencido boundaries hold end-to-end under a pinned clock **and pinned config**
- [ ] `RegisterStorePayment` accepts a brand-new store and advances from `start + 2 months`
- [ ] Legacy null-start rows untouched; `UpdateStore` activation still works for them
- [ ] `StoreActivationTests` still has all three tests, all passing
- [ ] User confirms the local `dotnet test` runs green
