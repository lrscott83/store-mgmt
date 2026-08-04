# Delta for billing-e2e-coverage

## ADDED Requirements

### Requirement: StoreCreationTrialTests Suite (18 tests)

New file `E2ETests/Billing/StoreCreationTrialTests.cs` MUST cover, under a pinned clock (`fixture.Clock.Pin(...)`) and pinned `SystemConfiguration` rows (see next requirement), the following scenarios. Baseline for group C: `start = 2026-01-10`, `trialMonths = 1`, `dueSoonDays = 5`, `graceDays = 5` → `due = 2026-03-10`.

**A. Admin `POST /v1/stores`**

#### Scenario: Create_sets_paymentStartDate_to_today
- GIVEN admin creates a store via `POST /v1/stores`
- THEN `PaymentStartDate` SHALL equal the pinned "today"

#### Scenario: Create_with_paid_module_sets_paymentStartDate_to_today
- GIVEN admin creates a store assigning a paid module
- THEN `PaymentStartDate` SHALL equal today

#### Scenario: Create_with_free_only_modules_also_sets_paymentStartDate
- GIVEN admin creates a store assigning only `PriceIncluded` modules
- THEN `PaymentStartDate` SHALL equal today (not null)

#### Scenario: Create_ignores_client_supplied_paymentStartDate
- GIVEN the request body carries `paymentStartDate: "2020-01-01"`
- THEN the persisted `PaymentStartDate` SHALL be today, not `2020-01-01`

#### Scenario: Update_by_non_superadmin_cannot_seed_paymentStartDate
- GIVEN an OwnerAdmin issues `PUT /v1/stores/{id}` with `paymentStartDate: "2020-01-01"`
- THEN `PaymentStartDate` SHALL be unchanged from before the call

**B. Self-registration**

#### Scenario: Register_creates_store_with_paymentStartDate_today
- GIVEN a user completes self-registration
- THEN the created store's `PaymentStartDate` SHALL equal today

#### Scenario: Register_store_reports_trial_in_billing_summary
- GIVEN a freshly self-registered store, `trialMonths = 1`
- WHEN `GET /auth/me` is called
- THEN `IsInTrial = true`, `PlanType = "Paid"`, `PaymentStatus = "AlDia"`, `PaymentDueDate = start + 2 months`

**C. Derived math (pinned clock + pinned config)**

#### Scenario: Day_one_is_in_trial_and_AlDia
- GIVEN `today = 2026-01-10` (creation day)
- THEN `IsInTrial = true` AND `PaymentStatus = "AlDia"`

#### Scenario: Trial_ends_one_month_after_creation
- GIVEN `today = 2026-02-11` (`start + 1mo + 1d`)
- THEN `IsInTrial = false` AND `PaymentStatus = "AlDia"`

#### Scenario: First_due_is_creation_plus_two_months
- GIVEN the store above
- THEN `PaymentDueDate = 2026-03-10` (`start + trialMonths + 1 months`)

#### Scenario: PorVencer_five_days_before_due
- GIVEN `today = 2026-03-05` (`due - dueSoonDays`)
- THEN `PaymentStatus = "PorVencer"`

#### Scenario: EnGracia_from_due_plus_one_through_due_plus_five
- GIVEN `today` in `[2026-03-11, 2026-03-15]`
- THEN `PaymentStatus = "EnGracia"`

#### Scenario: Vencido_from_due_plus_six
- GIVEN `today = 2026-03-16` (`due + graceDays + 1`)
- THEN `PaymentStatus = "Vencido"`

#### Scenario: Vencido_store_keeps_only_free_modules
- GIVEN the same store with one free and one paid module, `today = 2026-03-16`
- WHEN `GET /auth/me` is called
- THEN `StoreModuleIds` SHALL contain only the `PriceIncluded` module

**D. Collections**

#### Scenario: New_store_absent_from_to_collect_during_trial
- GIVEN `today = 2026-01-10` (`AlDia`, in trial)
- WHEN `GET /stores/to-collect` is called
- THEN the store SHALL NOT appear

#### Scenario: Free_plan_store_shows_zero_amount_in_to_collect
- GIVEN a free-only store at `PorVencer` or `EnGracia`
- WHEN `GET /stores/to-collect` is called
- THEN the store SHALL appear with `Amount = 0`

**E. Payments**

#### Scenario: RegisterStorePayment_succeeds_for_a_brand_new_store
- GIVEN a self-registered store (`PlanType = "Paid"`, module 6 "Estadísticas") at or past its due date
- WHEN `POST /stores/{id}/payments` is called
- THEN it SHALL succeed with `Price = 3000` (six qualifying paid modules, each `2000 − 75% = 500`) AND `NextDueDate` SHALL advance by 1 month from `start + 2 months`

**F. Existing data**

#### Scenario: Legacy_stores_with_null_paymentStartDate_are_not_retro_activated
- GIVEN a store row seeded directly (bypassing `CreateStoreService`) with `PaymentStartDate = null`
- WHEN the system runs under this change (no migration executes)
- THEN `PaymentStartDate` SHALL remain `null` until the `UpdateStore` first-paid-module conditional explicitly fires

### Requirement: Suite MUST Pin SystemConfiguration Rows

The suite MUST pin `TestingPeriodInMonths`, `PaymentGraceDays`, and `DueSoonDays` explicitly (seed or overwrite the rows in fixture setup) rather than relying on `SystemConfigurationRepository` fallbacks (`:31,37,43`), which return `1`/`5`/`5` ONLY when the row is absent. An E2E database holding different values would silently shift every date assertion in group C.

Note (informational, not a fix target): `BillingService.cs:62` clamps trial months with `Math.Max(1, ...)`; `RegisterStorePaymentCommand.cs:86` does not. The two can disagree if the pinned row holds `0` — the suite SHOULD pin a value `>= 1` to avoid exercising that divergence.

#### Scenario: Pinned config produces deterministic group-C dates
- GIVEN the E2E fixture explicitly seeds `TestingPeriodInMonths=1`, `PaymentGraceDays=5`, `DueSoonDays=5`
- WHEN any group-C test runs, regardless of pre-existing rows in the shared E2E database
- THEN the computed dates SHALL match the values asserted in the group-C scenarios above

## MODIFIED Requirements

### R8: PUT /stores/{id} — Activation on first paid

(Previously: this was the only activation path. Now: creation-time activation, R above, is the primary path; this conditional remains the sole activation path for legacy rows. No scenario changes — copied verbatim to confirm it stays in force.)

#### Scenario: Paid module on null start sets PaymentStartDate = today
- GIVEN store with `PaymentStartDate = null`
- WHEN a paid (non-PriceIncluded) module is assigned
- THEN `PaymentStartDate` SHALL be set to today (via clock)

#### Scenario: Free modules only leaves null
- GIVEN store with `PaymentStartDate = null`
- WHEN only free modules assigned
- THEN `PaymentStartDate` SHALL remain null

#### Scenario: Existing PaymentStartDate unchanged
- GIVEN store with `PaymentStartDate = 2026-01-10`
- WHEN adding more modules
- THEN `PaymentStartDate` SHALL not change

### R9: POST /features/activate — Statistics module price assertion

(Unchanged — copied verbatim; the trial-clock change does not touch pricing.)

#### Scenario: Statistics module price is 1000
- GIVEN the Features/activate flow
- THEN the Statistics module `Price` field SHALL be exactly 1000

## Explicitly Out of Scope (do not drift)

- No test deletions in `StoreActivationTests.cs` (all 3 kept — see requirement below)
- No `hasPaidModule` gate on `GetStoresToCollectQuery` / `GetPaidStoresAsync`
- No change to `StoreBillingUtils` math
- No EF migration / backfill of existing rows

### Requirement: StoreActivationTests Remains Unchanged

`E2ETests/Billing/StoreActivationTests.cs` (3 tests) MUST remain unchanged. All three seed via `BillingSeed.SeedFreeStoreAsync` directly into the database (`paymentStartDate: null`) and exercise `PUT /v1/stores/{id}` — the update path against a legacy row, untouched by this change.

#### Scenario: Existing activation tests still pass
- GIVEN `StoreActivationTests.cs` is unmodified
- WHEN the full suite runs after this change
- THEN all 3 tests SHALL pass exactly as before
