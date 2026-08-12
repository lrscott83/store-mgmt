# Delta for billing

## MODIFIED Requirements

### Domain Model: `Store.PaymentStartDate`

| Aspect | Rule |
|--------|------|
| Type | `DateOnly?` (nullable) — `null` = never activated paid plan (legacy rows only) |
| Activation (creation) | Set unconditionally to `DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime)` at store creation (`CreateStoreService.CreateStoreAsync`), for BOTH admin `POST /v1/stores` and self-registration, regardless of paid/free-only modules |
| Activation (legacy update path) | For rows where `PaymentStartDate is null` at update time, `UpdateStoreCommandHandler` SHALL still set it to today on first paid-module add (unchanged conditional, `UpdateStoreCommand.cs:96-97`) — the only remaining activation path for pre-existing rows |
| Client input | The client cannot seed `PaymentStartDate` on creation (no such field on `CreateStoreCommand`). On update, a value supplied by a non-SuperAdmin caller MUST be ignored; only SuperAdmin MAY set it explicitly (`UpdateStoreCommand.cs:100-101`) |
| Lock | Once non-null, OwnerAdmin cannot change modules (plan is locked). SuperAdmin retains full edit |
| Migration | Existing rows keep their current value. NO migration, NO backfill — legacy `null` rows are never retro-activated |

(Previously: only the update-path conditional set `PaymentStartDate`; creation always passed `null`.)

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

## ADDED Requirements

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
