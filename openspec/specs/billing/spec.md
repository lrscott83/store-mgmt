# Billing Specification

## Purpose

Per-store paid-plan lifecycle: plan activation (owner, once), manual payment recording (super admin / ReSeller), compute-on-read overdue downgrade, collections & commission queries. No background jobs, no payment gateway.

## Domain Model

### `Store.PaymentStartDate` (modified)

| Aspect | Rule |
|--------|------|
| Type | `DateOnly?` (nullable) — `null` = never activated paid plan (legacy rows only) |
| Activation (creation) | Set unconditionally to `DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime)` at store creation (`CreateStoreService.CreateStoreAsync`), for BOTH admin `POST /v1/stores` and self-registration, regardless of paid/free-only modules |
| Activation (legacy update path) | REMOVED by `owner-plan-change` (archived 2026-09-11): update-store no longer auto-activates on first paid-module add — `PaymentStartDate` stays `null` on legacy rows; the clock starts only at store creation or via explicit SuperAdmin payment-date set (see Requirement: Sacred Payment Anchor) |
| Client input | The client cannot seed `PaymentStartDate` on creation (no such field on `CreateStoreCommand`). On update, a value supplied by a non-SuperAdmin caller MUST be ignored; only SuperAdmin MAY set it explicitly (`UpdateStoreCommand.cs:100-101`) |
| Lock | OwnerAdmin MUST NOT change the module set of ANY store (paid or free): a non-SuperAdmin `update-store` with `ModuleIds != null` whose set differs from the current active set (distinct-sorted; duplicates/order never reject) SHALL be rejected (`ValidationException`, 400, code `PlanLocked`). Same-set updates SHALL stay allowed; `ModuleIds == null` (data-only) never fires the lock; there is no free-store activation exception anymore; SuperAdmin SHALL retain freeform edit. Non-SuperAdmin plan changes go exclusively through `change-plan` (see Requirement: Owner Plan Change Endpoint) |
| Migration | Existing rows keep their current value. NO migration, NO backfill — legacy `null` rows are never retro-activated |

(Previously: the Lock row read "Once non-null..." — the `PaymentStartDate` proxy; and before `owner-plan-change` it kept a free-store activation exception via update-store.)

#### Scenario: Admin creates store with paid module
- GIVEN admin calls `POST /v1/stores` assigning a paid module
- WHEN the store is created
- THEN `PaymentStartDate` SHALL be today (server clock)

#### Scenario: Admin creates store with free-only modules
- GIVEN admin calls `POST /v1/stores` assigning only `PriceIncluded` modules
- WHEN the store is created
- THEN `PaymentStartDate` SHALL still be today — creation is unconditional

#### Scenario: Client-supplied paymentStartDate on creation is ignored
- GIVEN a `POST /v1/stores` body carries `paymentStartDate: "2020-01-01"`
- WHEN the store is created
- THEN `PaymentStartDate` SHALL be today, never the client value

#### Scenario: Self-registration starts the clock
- GIVEN a user completes self-registration (`RegisterCommand`)
- WHEN the store is created via the shared `CreateStoreAsync` path
- THEN `PaymentStartDate` SHALL be today

#### Scenario: Non-SuperAdmin cannot seed PaymentStartDate via update
- GIVEN an OwnerAdmin calls `PUT /v1/stores/{id}` with a backdated `paymentStartDate`
- WHEN the update is processed
- THEN `PaymentStartDate` SHALL NOT change to the supplied value

#### Scenario: Legacy null row is never retro-activated
- GIVEN a store row created before this change with `PaymentStartDate = null`
- WHEN the system is upgraded (no migration runs)
- THEN `PaymentStartDate` SHALL remain `null` until the existing `UpdateStore` first-paid-module conditional fires

#### Scenario: OwnerAdmin module change on paid store rejected
- GIVEN OwnerAdmin PUTs different `moduleIds` on a paid store
- WHEN update processed
- THEN 400 + `PlanLocked`

#### Scenario: OwnerAdmin same-set update on paid store allowed
- GIVEN OwnerAdmin PUTs the same active module set on a paid store (any order, duplicates)
- WHEN update processed
- THEN 200 (distinct-sorted equality)

#### Scenario: OwnerAdmin activates a free store
- GIVEN OwnerAdmin PUTs paid modules on a free store
- WHEN update processed
- THEN 200 (activation allowed)

#### Scenario: SuperAdmin module change on paid store
- GIVEN SuperAdmin PUTs different `moduleIds` on paid store
- WHEN update processed
- THEN 200 (carve-out)

#### Scenario: Legacy paid store, null clock, stays locked
- GIVEN legacy store, paid modules, `PaymentStartDate = null`
- WHEN OwnerAdmin changes modules
- THEN 400 (modules, not clock)

### `StorePayment` (extended)

| Field | Type | Notes |
|-------|------|-------|
| `ReSellerId` | `Guid?` | Gestor at payment time; `null` = no commission |
| `ReSellerPercentDiscountPrice` | `float` | Snapshot of Gestor percent |
| `ReSellerDiscountPrice` | `float` | Snapshot of Gestor flat discount |
| `ReSellerAmount` | `float` | Computed commission |
| `ByReSeller` | `bool` | `true` if ReSeller recorded the payment |

### `SystemConfigurationType.PaymentGraceDays`

| Property | Value |
|----------|-------|
| Enum id | `3` |
| Seed value | `"5"` |
| Accessor | `GetPaymentGraceDaysAsync()` returning `int` (fallback `5`) |

### `SystemConfigurationType.DueSoonDays`

| Property | Value |
|----------|-------|
| Enum id | `4` |
| Default value | `"5"` (fallback when no row exists) |
| Accessor | `GetDueSoonDaysAsync()` returning `Task<int>` (fallback `5`) |

## Requirements

### R1: Billing Status State Machine

The system MUST compute `StoreBillingStatusType` from `(paymentStartDate, nextDueDate, today, dueSoonDays, graceDays)`. The `dueSoonDays` value SHALL be obtained from `ISystemConfigurationRepository.GetDueSoonDaysAsync()` (default `5`), replacing the previously hardcoded literal `5`.

| Status | Condition |
|--------|-----------|
| `NoAplica` | `paymentStartDate is null` |
| `AlDia` | `today < nextDueDate - dueSoonDays` |
| `PorVencer` | `nextDueDate - dueSoonDays <= today <= nextDueDate` |
| `EnGracia` | `nextDueDate < today <= nextDueDate + graceDays` |
| `Vencido` | `today > nextDueDate + graceDays` |

#### Scenario: Full status progression

- GIVEN `paymentStartDate = 2026-01-10`, `nextDueDate = 2026-03-10`, `dueSoonDays = 5`, `graceDays = 5`
- WHEN `today = 2026-03-04` THEN status is `AlDia`
- WHEN `today = 2026-03-05` THEN status is `PorVencer`
- WHEN `today = 2026-03-10` THEN status is `PorVencer`
- WHEN `today = 2026-03-11` THEN status is `EnGracia`
- WHEN `today = 2026-03-16` THEN status is `Vencido`

#### Scenario: No plan

- GIVEN `paymentStartDate = null`, any `nextDueDate`
- WHEN computing status THEN result is `NoAplica`

### R2: Billing Math — Pure Utils

The system MUST provide pure static methods in `StoreBillingUtils`.

#### R2.1: Commission

`GetReSellerCommission(amount, percent, flat)` = `amount - GetCurrentPrice(amount, percent, flat)`.

#### Scenario: With percent discount

- GIVEN `amount = 2000`, `percent = 25`, `flat = 0`
- WHEN computing commission THEN result SHALL be `500`

#### Scenario: No reseller

- GIVEN `amount = 1000`, `percent = 0`, `flat = 0`
- WHEN computing commission THEN result SHALL be `0`

#### R2.2: Next due date (nullable)

`GetNextDueDate(paymentStartDate, trialMonths, lastPaidBeforeDate)` accepts `DateOnly? paymentStartDate` and returns `DateOnly?`.

| Condition | Result |
|-----------|--------|
| `paymentStartDate is null` | `null` |
| `lastPaidBeforeDate` is set | `lastPaidBeforeDate` |
| Has start, no lastPaid | `paymentStartDate.AddMonths(trialMonths + 1)` |

#### Scenario: No payments

- GIVEN `paymentStartDate = 2026-01-10`, `trialMonths = 1`, `lastPaidBeforeDate = null`
- WHEN computing next due THEN result SHALL be `2026-03-10`

#### Scenario: Null start returns null

- GIVEN `paymentStartDate = null`, `trialMonths = 1`, `lastPaidBeforeDate = null`
- THEN result SHALL be `null`

#### Scenario: Month-end clamping

- GIVEN `paymentStartDate = 2026-01-31`, `trialMonths = 0`, `lastPaidBeforeDate = null`
- THEN result SHALL be `2026-02-28` (clamped to shorter month)

#### R2.3: Paid plan active check

`IsPaidPlanActive(startDate, nextDue, today, graceDays)` = `startDate != null && today <= nextDue + graceDays`.

#### Scenario: Within grace

- GIVEN `nextDue = 2026-03-10`, `today = 2026-03-15`, `graceDays = 5`
- THEN `IsPaidPlanActive` SHALL be `true`

#### Scenario: Grace expired

- GIVEN `today = 2026-03-16`
- THEN `IsPaidPlanActive` SHALL be `false`

#### R2.4: Trial check

`IsInTrial(startDate, trialMonths, today)` = `startDate != null && today <= startDate + trialMonths`.

#### Scenario: Within trial

- GIVEN `startDate = 2026-01-10`, `trialMonths = 1`, `today = 2026-02-05`
- THEN `IsInTrial` SHALL be `true`

### R2.5: StoreBillingSummary MUST expose `IsInTrial`

`Domain/Entities/Billing/StoreBillingSummary.cs` SHALL add a `bool IsInTrial { get; init; }` property.

This makes `IsInTrial` a first-class field of the billing summary contract, eliminating the need for consumers to compute it independently with hardcoded or duplicated logic.

#### Scenario: Summary carries IsInTrial

- GIVEN a `StoreBillingSummary` is constructed with `IsInTrial = true`
- WHEN the property is read
- THEN it SHALL be `true`

### R2.6: BillingService MUST compute `IsInTrial` canonically

`BillingService.GetStoreBillingSummaryAsync()` SHALL compute `IsInTrial` using:

```
StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today)
```

The `trialMonths` and `today` variables already present in the method SHALL be reused — no new config reads or clock calls.

#### Scenario: BillingService computes IsInTrial

- GIVEN `store.PaymentStartDate = 2026-01-10`, `trialMonths = 1`, `today = 2026-02-05`
- WHEN `GetStoreBillingSummaryAsync` is called
- THEN `IsInTrial` SHALL be `true`

### R2.7: GetMeQueryHandler MUST consume `billing.IsInTrial`

`GetMeQueryHandler.Handle()` SHALL use `billing.IsInTrial` from `StoreBillingSummary` instead of computing inline with a hardcoded `AddMonths(1) >= today`.

#### Scenario: GetMe reads IsInTrial from billing summary

- GIVEN a store in trial (`billing.IsInTrial = true`)
- WHEN `GetMe` is called
- THEN `CurrentUserDto.IsInTrial` SHALL be `true`

### R2.8: All billing states MUST report correct `isInTrial`

The `IsInTrial` value SHALL be consistent with `StoreBillingUtils.IsInTrial` across all states:

| `PaymentStartDate` | Condition | `IsInTrial` |
|---|---|---|
| `null` | N/A | `false` |
| Non-null | `today <= startDate + trialMonths` | `true` |
| Non-null | `today > startDate + trialMonths` | `false` |

#### Scenario: Free store (null PaymentStartDate)

- GIVEN `PaymentStartDate = null`
- WHEN computing billing summary
- THEN `IsInTrial` SHALL be `false` AND `Status` SHALL be `NoAplica`

#### Scenario: Store within trial period

- GIVEN `PaymentStartDate = 2026-01-10`, `TestingPeriodInMonths = 1`, `today = 2026-02-05`
- THEN `IsInTrial` SHALL be `true`

#### Scenario: Store past trial period

- GIVEN `PaymentStartDate = 2026-01-10`, `TestingPeriodInMonths = 1`, `today = 2026-02-20`
- THEN `IsInTrial` SHALL be `false`

### R3: Configurable DueSoonDays

The system MUST expose `DueSoonDays` as a configurable `SystemConfigurationType` entry with a database-backed repository accessor, replacing the current hardcoded `5`.

#### R3.1: SystemConfigurationType.DueSoonDays

`SystemConfigurationType` MUST add `DueSoonDays = 4`.

| Property | Value |
|----------|-------|
| Enum id | `4` |
| Default | `5` (returned when no row exists) |
| Accessor | `GetDueSoonDaysAsync()` returning `Task<int>` |

#### R3.2: ISystemConfigurationRepository.GetDueSoonDaysAsync()

`ISystemConfigurationRepository` MUST declare `Task<int> GetDueSoonDaysAsync()`.

#### R3.3: SystemConfigurationRepository.GetDueSoonDaysAsync()

`SystemConfigurationRepository` MUST implement `GetDueSoonDaysAsync()` returning `FirstOrDefaultAsync(c => c.Id == 4)?.Value ?? 5`.

#### R3.4: BillingService consumption

`BillingService.GetStoreBillingSummaryAsync()` MUST call `GetDueSoonDaysAsync()` instead of using the hardcoded literal `5` for the `dueSoonDays` parameter passed to `StoreBillingUtils.GetBillingStatus()`.

#### R3.5: GetStoresToCollectQueryHandler consumption

`GetStoresToCollectQueryHandler` MUST read `DueSoonDays` from the repository (via `ISystemConfigurationRepository`) instead of the hardcoded `5`.

#### Scenario: DueSoonDays=5 (default) — backward compatible

- GIVEN no `SystemConfiguration` row with `Id == 4` exists
- WHEN `GetDueSoonDaysAsync()` is called
- THEN it SHALL return `5`
- AND billing status computation behaves identically to today's hardcoded behavior

#### Scenario: DueSoonDays configured via database

- GIVEN a `SystemConfiguration` row with `Id == 4` and `Value == "7"`
- WHEN `GetDueSoonDaysAsync()` is called
- THEN it SHALL return `7`
- AND `PorVencer` window shifts accordingly (wider by 2 days)

#### Scenario: BillingService test uses mock

- GIVEN `BillingService` constructed with a mock `ISystemConfigurationRepository`
- WHEN `GetStoreBillingSummaryAsync` is invoked
- THEN the mock's `GetDueSoonDaysAsync()` SHALL be called and its return value used

#### Scenario: GetStoresToCollect test uses mock

- GIVEN `GetStoresToCollectQueryHandler` with a mock `ISystemConfigurationRepository`
- WHEN the handler filters stores by status
- THEN the mock's `GetDueSoonDaysAsync()` SHALL be called

### R4: Enforcement — Overdue Downgrade

The system MUST exclude non-free (paid) modules from entitlement when the store is overdue.

| Enforcement point | Behavior |
|-------------------|----------|
| `GetMeQueryHandler` | `FilterForBilling(modules, isPaidPlanActive)` — when inactive, keep only `PriceIncluded` modules |
| `HasPermissionAttribute` | Mirror filter using `IsPaidPlanActiveAsync().Result` |

`CurrentUserDto` MUST expose fields: `PaymentDueDate` (`DateOnly?`), `IsInTrial` (`bool`), `PaymentStatus` (`string`), `PlanType` (`string`, `"Paid"`/`"Free"`).
(Previously: `PlanType` was absent from `CurrentUserDto` — it existed only on `StoreBillingSummary`.)

#### Scenario: Overdue store → free downgrade

- GIVEN store has one free module (id=20) and one paid module (id=60), and billing says `IsPaidPlanActive = false`
- WHEN `FilterForBilling` is applied
- THEN `StoreModuleIds` SHALL contain only `[20]`

#### Scenario: Paid store → full access

- GIVEN `IsPaidPlanActive = true`
- WHEN `FilterForBilling` is applied
- THEN all modules SHALL be returned unchanged

#### Scenario: Self-registered store reports PlanType=Paid
- GIVEN a self-registered store received the paid module "Estadísticas" (id 6) via `GetAvailableModulesToStore`
- WHEN `GET /auth/me` is called
- THEN `PlanType` SHALL be `"Paid"`

#### Scenario: Free-only store reports PlanType=Free
- GIVEN a store with only `PriceIncluded` modules
- WHEN `GET /auth/me` is called
- THEN `PlanType` SHALL be `"Free"`

### R5: RegisterStorePayment

The system MUST provide `POST /stores/{storeId}/payments` for recording manual payments.

| Aspect | Rule |
|--------|------|
| Authorization | SuperAdmin (any store) or ReSeller (own stores via `ReSellerOwner`) |
| Guard: never activated | `PaymentStartDate is null` → reject |
| Guard: reseller not owner | `IsStoreOwnedByReSellerUserAsync` false → reject |
| Amount | Sum of `GetCurrentPrice` for all active, non-`PriceIncluded` `StoreModules` |
| Commission | Compute via `GetReSellerCommission` from `ReSellerOwner` snapshot (zero if no reseller) |
| Due advance | `newDueDate = currentNextDue + 1 month` |
| `StorePayment` created | Status `Paid` (5), `PaidDate = UtcNow`, all reseller snapshots, `ByReSeller = (caller is ReSeller)` |

#### Scenario: Super admin records payment (no reseller)

- GIVEN store with no reseller, active paid modules totaling 2000
- WHEN super admin posts payment
- THEN `StorePayment` is created with `Price=2000`, `ReSellerId=null`, `ReSellerAmount=0`, `ByReSeller=false`

#### Scenario: ReSeller records payment with commission

- GIVEN store's owner has `ReSellerOwner` with `PercentDiscountPrice=25`, amount=2000
- WHEN ReSeller posts payment
- THEN `ReSellerAmount = 500`, `ByReSeller = true`, `ReSellerId` is set

#### Scenario: ReSeller not owning store

- GIVEN ReSeller posts payment for a store not linked to them
- THEN system SHALL reject with error

### R6: GetStoresToCollect

The system MUST provide `GET /stores/to-collect` returning stores with `PorVencer` or `EnGracia` status.

| Scope | Behavior |
|-------|----------|
| SuperAdmin | All stores with paid plan |
| ReSeller | Only stores whose owner belongs to them |

`StoreToCollectDto`: `StoreId`, `StoreName`, `OwnerName`, `Amount` (paid-module total), `NextDueDate`, `Status`.

#### Scenario: Filtered collection

- GIVEN two stores (one `PorVencer`, one `AlDia`)
- WHEN calling `GetStoresToCollect`
- THEN only the `PorVencer` store SHALL be returned

#### Scenario: Scoped by reseller

- GIVEN a ReSeller queries collections
- WHEN the store list includes stores from other resellers
- THEN only their own stores SHALL appear

### R7: GetReSellerCommissions

The system MUST provide `GET /stores/reseller-commissions` returning commissions grouped by year/month.

| Field | Source |
|-------|--------|
| `Year`, `Month` | Payment period |
| `PaymentCount` | Count of paid rows |
| `TotalCommission` | Sum of `ReSellerAmount` |

| Scope | Behavior |
|-------|----------|
| SuperAdmin | All `StorePayment` with `ReSellerId != null` |
| ReSeller | Only payments where `ReSeller.UserId == caller` |

#### Scenario: Grouped commissions

- GIVEN 3 paid rows: 2 in 2026-05 (commissions 500, 300), 1 in 2026-06 (commission 200)
- WHEN querying commissions
- THEN results SHALL be `{2026,5, count 2, total 800}` and `{2026,6, count 1, total 200}`

### R8: PaymentStartDate Backfill

The system MUST backfill sentinel `0001-01-01` values on `Store.PaymentStartDate` to `NULL` via an EF Core migration. The SQL MUST be defined as a shared constant (`PaymentStartDateBackfill.Sql`), referenced by both the migration `Up()` and its verification test. `Down()` MUST be empty (reverting would reintroduce the sentinel).

#### Scenario: Sentinel converted to null

- GIVEN a Store row with `PaymentStartDate = DATE '0001-01-01'`
- WHEN the backfill SQL executes
- THEN `PaymentStartDate` SHALL be `NULL`

### R9: IDateTimeProvider Clock Injection

The system MUST read the current date through `IDateTimeProvider` in 4 call sites: `BillingService.GetStoreBillingSummaryAsync`, `GetMeQueryHandler`, `GetStoresToCollectQueryHandler`, `UpdateStoreCommandHandler`. (Previously: `DateTime.UtcNow`.)

The interface SHALL reside in `Application.Abstractions.Time`. The `Infrastructure.Interfaces.Services` copy SHALL be deleted.

#### Scenario: BillingService clock-aware status

- GIVEN `BillingService` constructed with clock returning 2026-03-16
- AND a store with `PaymentStartDate = 2026-01-10`, due 2026-03-10, grace 5 days
- WHEN `GetStoreBillingSummaryAsync` is called
- THEN status SHALL be `Vencido`

### R10: RegisterStorePaymentValidator

`POST /stores/{storeId}/payments` MUST validate `StoreId` is not empty via FluentValidation.

#### Scenario: Empty store id

- GIVEN POST to `/stores/{Guid.Empty}/payments`
- THEN response SHALL be 400 with error code `StoreId`

### R11: BillingService Unit Coverage

`BillingService` MUST have unit tests covering: free store (`NoAplica`, no throw), unknown store (`NoAplica`), paid store without payments (amount = sum of module prices), paid store with payment (uses last payment price), reseller commission computation, months-active never negative.

### R12: StoreDto.PaymentStartDate MUST Be Nullable

The system MUST expose `StoreDto.PaymentStartDate` as `DateOnly?` (nullable).
(Previously: `DateOnly` non-nullable — free stores returned sentinel `0001-01-01`.)

When a free store is returned via the API, `PaymentStartDate` SHALL be `null`.
When a paid store is returned, `PaymentStartDate` SHALL be the actual date.

#### Scenario: Get store by ID (free store)

- GIVEN a store with no payment start date (free store)
- WHEN `GET /stores/{id}` is called
- THEN response `paymentStartDate` is `null`

#### Scenario: Get store by ID (paid store)

- GIVEN a store with `PaymentStartDate = 2026-03-10`
- WHEN `GET /stores/{id}` is called
- THEN response `paymentStartDate` is `"2026-03-10"`

### R13: Store Seed MUST NOT Set PaymentStartDate for Free Stores

`StoreSeed.SeedStoreAsync`, `SeedStoresAdminUserAsync`, and
`SeedStoreInNewTenantAsync` MUST NOT pass a `paymentStartDate` argument when
creating stores that have no payment parameters.

`Store.Create(…)`'s `paymentStartDate` parameter defaults to `null`, so the
callers simply drop the `DateOnly.FromDateTime(DateTime.UtcNow)` argument.

#### Scenario: Seed free store

- GIVEN `StoreSeed.SeedStoreAsync` is called with no payment parameters
- WHEN a store is created
- THEN its `PaymentStartDate` is `null`

#### Scenario: Seed store with admin user

- GIVEN `StoreSeed.SeedStoresAdminUserAsync` is called with no payment params
- WHEN a store is created
- THEN its `PaymentStartDate` is `null`

#### Scenario: Seed store in new tenant

- GIVEN `StoreSeed.SeedStoreInNewTenantAsync` is called with no payment params
- WHEN a store is created
- THEN its `PaymentStartDate` is `null`

### R14: Regression — All Existing Tests MUST Pass

All billing E2E tests (31 tests via `BillingSeed`), store CRUD E2E tests (via
`StoreSeed`), and solution-wide unit tests MUST remain green after the seed and
DTO changes.

#### Scenario: Billing E2E tests pass

- GIVEN the billing E2E test suite (31 tests)
- WHEN the seed and DTO changes are applied
- THEN all billing E2E tests pass

#### Scenario: Store CRUD E2E tests pass

- GIVEN the store CRUD E2E test suite
- WHEN the changes are applied
- THEN all store CRUD E2E tests pass

#### Scenario: Unit tests pass

- GIVEN all unit tests in the solution
- WHEN the changes are applied
- THEN all unit tests pass

### Requirement: Owner Plan Change Endpoint
(Added by SDD change `owner-plan-change`, archived 2026-09-11.)

The system SHALL expose `POST /v1/stores/{id}/change-plan` with body `{ storePlanId }`. The caller SHALL be the store's owner (OwnerAdmin whose owned-store graph contains the target store) or SuperAdmin. Any other caller SHALL receive 403.

On success (200, `data=true`): `Store.StorePlanId` SHALL be written to the target plan; the store's active `StoreModules` SHALL become the catalog `priceIncluded` modules ∪ target-plan members (soft-deleting absent, inserting new, reactivating soft-deleted); `StoreRoleFeatures` SHALL be regenerated for inserted modules; `Store.PaymentStartDate` SHALL NOT change (Sacred Payment Anchor); and `Store.NextDueDateOverride` SHALL be set to today when the target plan is paid and the computed next due date is <= today (Next-Due Override Mechanics), else left untouched.

The target store and its owner user SHALL be active, and the target plan SHALL be known and active — otherwise 400 with the corresponding error code.

#### Scenario: Owner changes Gratis→Pago (overdue clock)
- GIVEN a store owned by user U with `StorePlanId=Gratis`, `PaymentStartDate = 2026-01-10` (trial expired, nextDue = 2026-02-10, today = 2026-09-10)
- WHEN U posts `change-plan { storePlanId: Pago }`
- THEN the response is 200 with `data=true`
- AND `Store.StorePlanId` = Pago
- AND the store's active `StoreModules` = catalog priceIncluded modules ∪ Pago members (soft-deleting absent, inserting new, reactivating soft-deleted)
- AND `Store.PaymentStartDate` = 2026-01-10 (UNCHANGED)
- AND `Store.NextDueDateOverride` = 2026-09-10 (today — next payment date becomes today)
- AND `StoreRoleFeatures` regenerated for inserted modules

#### Scenario: Next payment date becomes today — visible
- GIVEN the store above after the change
- WHEN `GET /v1/stores/{id}/plan` is called (or /auth/me billing fields)
- THEN `nextDueDate` = today
- AND billing status computes `PorVencer` (today is within dueSoonDays of due=today) → `IsPaidPlanActive=true` → paid modules NOT gated by FilterForBilling

#### Scenario: Owner changes to paid plan with FUTURE due date
- GIVEN a paid-plan store with nextDue = 2026-12-01, today = 2026-09-10
- WHEN the owner changes to another paid plan
- THEN `PaymentStartDate` and computed `nextDueDate` are unchanged (override NOT set; existing override, if any, is left untouched)

#### Scenario: Owner changes to Gratis
- GIVEN a Pago store (any due state)
- WHEN the owner changes to Gratis
- THEN modules become Gratis membership; `StorePlanId` = Gratis
- AND `PaymentStartDate` unchanged; existing override cleared (Next-Due Override Mechanics)

#### Scenario: Owner changes to VIP
- GIVEN a store owned by U
- WHEN U posts `change-plan { storePlanId: VIP }` (VIP is a paid plan)
- THEN the same paid-plan rules apply: membership modules, anchor preserved, overdue ⇒ override = today

#### Scenario: Not the store's owner
- GIVEN an OwnerAdmin U2 who does NOT own the target store
- WHEN U2 posts change-plan on that store
- THEN 403 Forbidden

#### Scenario: Inactive store or inactive owner user
- GIVEN the target store `IsActive=false` OR the owner user `IsActive=false`
- WHEN change-plan is posted
- THEN 400 with the corresponding error code

#### Scenario: SuperAdmin path
- GIVEN a SuperAdmin posting change-plan on any store
- THEN 200: same mutation rules (modules from membership, StorePlanId written, anchor kept, overdue paid-target ⇒ override=today)

#### Scenario: Unknown plan / inactive plan
- GIVEN `storePlanId` = 99 (unknown) or an inactive plan
- WHEN change-plan is posted
- THEN 400 validation error

### Requirement: Sacred Payment Anchor
(Added by SDD change `owner-plan-change`, archived 2026-09-11.)

The system MUST NOT alter or nullify `Store.PaymentStartDate` on ANY plan-change path (change-plan, toggle-plan, update-store). Every plan-change test SHALL assert the anchor is unchanged.

#### Scenario: Anchor immutability across all paths (integration + E2E)
- GIVEN a store with `PaymentStartDate = D`
- WHEN change-plan (owner or SuperAdmin), toggle-plan, or update-store runs
- THEN `PaymentStartDate` = D in every case (assert in tests)

#### Scenario: Activation-on-first-paid removed
- GIVEN a free-modules store with `PaymentStartDate = null` (legacy row) and a caller with moduleIds containing paid modules
- WHEN update-store runs
- THEN `PaymentStartDate` remains null (no auto-activation; the clock starts only at creation or explicit SuperAdmin PUT payment-date)

### Requirement: Next-Due Override Mechanics
(Added by SDD change `owner-plan-change`, archived 2026-09-11.)

`Store.NextDueDateOverride` (nullable `DateOnly`) SHALL override the computed next due date with priority: `override > lastPaidBeforeDate > paymentStartDate+trial+1`. The override SHALL be set to TODAY when a change to a paid plan finds computed nextDue <= today. The override SHALL be cleared when a payment is registered (`RegisterStorePayment`) and when the plan changes to Gratis. Changes to paid plans with future nextDue SHALL NOT create an override.

#### Scenario: Override priority in GetNextDueDate
- GIVEN anchor 2026-01-10, trial 1, lastPaid = 2026-07-10, override = 2026-09-10
- WHEN computing next due
- THEN result = 2026-09-10 (override wins over lastPaid)

#### Scenario: Payment clears override
- GIVEN a store with override = today
- WHEN RegisterStorePayment runs (SuperAdmin/ReSeller)
- THEN override is null and nextDue = payment.PaymentBeforeDate

#### Scenario: Downgrade clears override
- GIVEN a paid store with an active NextDueDateOverride
- WHEN the plan changes to Gratis
- THEN override is null

### Requirement: Free-plan stores surface in "to collect" at Amount = 0 (accepted consequence)

Because every new store now carries a clock, a free-only store MAY reach `PorVencer`/`EnGracia` and appear in `GET /stores/to-collect` with `Amount = 0`. No `hasPaidModule` gate is added — this is accepted, not a defect.

#### Scenario: Free-plan store appears in to-collect with zero amount
- GIVEN a free-only store whose status is `PorVencer`
- WHEN `GET /stores/to-collect` is called
- THEN the store SHALL appear with `Amount = 0`

### Requirement: Free-only stores may report Vencido while owing $0 (accepted consequence)

Once `PaymentStartDate` is never `null` for new stores, `NoAplica` no longer occurs for them. A free-only store reaches `Vencido` at `due + graceDays + 1` while its billable amount is `0`. No module access is lost — `FilterForBilling` already keeps exactly the `PriceIncluded` modules for any non-active-paid-plan status.

#### Scenario: Free-only store past grace reports Vencido with all modules retained
- GIVEN a free-only store created today, clock advanced to `due + graceDays + 1`
- WHEN billing status is computed
- THEN `PaymentStatus` SHALL be `"Vencido"` AND all of its modules (all `PriceIncluded`) SHALL remain accessible

### Requirement: Angular legacy plan edits 4xx on paid stores (accepted consequence)

Legacy Angular edit form (`edit-store.component.html:99-100`) has no DG-7 guard; its plan edits on paid stores now receive 400 + `PlanLocked`. Accepted; companion guard deferred; no Angular code change.

#### Scenario: Legacy-app plan edit on paid store rejected
- GIVEN legacy Angular app PUTs module change on paid store
- WHEN update processed
- THEN 400 + `PlanLocked`
