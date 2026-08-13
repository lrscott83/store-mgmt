# Delta for billing

## MODIFIED Requirements

### Domain Model: `Store.PaymentStartDate`

| Aspect | Rule |
|--------|------|
| Type | `DateOnly?` (nullable) — `null` = never activated paid plan (legacy rows only) |
| Activation (creation) | Set unconditionally to `DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime)` at store creation (`CreateStoreService.CreateStoreAsync`), for BOTH admin `POST /v1/stores` and self-registration, regardless of paid/free-only modules |
| Activation (legacy update path) | For rows where `PaymentStartDate is null` at update time, `UpdateStoreCommandHandler` SHALL still set it to today on first paid-module add (unchanged conditional, `UpdateStoreCommand.cs:96-97`) — the only remaining activation path for pre-existing rows |
| Client input | The client cannot seed `PaymentStartDate` on creation (no such field on `CreateStoreCommand`). On update, a value supplied by a non-SuperAdmin caller MUST be ignored; only SuperAdmin MAY set it explicitly (`UpdateStoreCommand.cs:100-101`) |
| Lock | While the store has ANY active paid module (`ModulePriceIncluded == false`), OwnerAdmin MUST NOT change modules: requests whose `ModuleIds` differ from the current active set (distinct-sorted; duplicates/order never reject) SHALL be rejected (`ValidationException`, 400, code `PlanLocked`). Same-set updates SHALL stay allowed; stores with no active paid module SHALL activate; trigger is modules, not `PaymentStartDate`. SuperAdmin SHALL retain full edit |
| Migration | Existing rows keep their current value. NO migration, NO backfill — legacy `null` rows are never retro-activated |

(Previously: the Lock row read "Once non-null..." — the `PaymentStartDate` proxy.)

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

## ADDED Requirements

### Requirement: Angular legacy plan edits 4xx on paid stores (accepted consequence)

Legacy Angular edit form (`edit-store.component.html:99-100`) has no DG-7 guard; its plan edits on paid stores now receive 400 + `PlanLocked`. Accepted; companion guard deferred; no Angular code change.

#### Scenario: Legacy-app plan edit on paid store rejected
- GIVEN legacy Angular app PUTs module change on paid store
- WHEN update processed
- THEN 400 + `PlanLocked`