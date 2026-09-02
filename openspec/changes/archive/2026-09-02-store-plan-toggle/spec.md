# Spec Delta: Store Plan Toggle

**Change**: `store-plan-toggle`
**Type**: Hybrid — 1 new spec + 3 modified capability deltas
**Mode**: hybrid (Engram + OpenSpec filesystem)

---

# 1. NEW: Store Plan Toggle

## Purpose

Atomic Free ↔ Paid plan toggle via a confirmed gear-menu action on `/admin/stores`, for SuperAdmin and ReSeller roles.

## Requirements

### R1: Toggle Endpoint

The system SHALL expose `POST /v1/stores/{id}/toggle-plan` (no request body). The endpoint SHALL be gated by `[HasPermission(SuperAdmin, StorePaymentAdmin)]`. The action SHALL be atomic — one `SaveChangesAsync` transaction.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | SuperAdmin toggles Free→Paid | SuperAdmin, store with `PaymentStartDate=null`, inactive store is active, owner user is active | POST `/v1/stores/{id}/toggle-plan` | 200 OK, `PaymentStartDate=today`, all paid modules added, `StoreRoleFeature` rows generated |
| 1b | SuperAdmin toggles Paid→Free | SuperAdmin, store with non-null `PaymentStartDate` | POST `/v1/stores/{id}/toggle-plan` | 200 OK, `PaymentStartDate=null`, paid `StoreModules` soft-deleted (`IsActive=false`), `StoreRoleFeature` rows deactivated |
| 1c | ReSeller toggles Free→Paid | ReSeller with `ReSellerOwner` link, store owned by linked owner | POST `/v1/stores/{id}/toggle-plan` | 200 OK, same mutations as 1a |
| 1d | ReSeller toggles Paid→Free | ReSeller with `ReSellerOwner` link, store owned by linked owner | POST `/v1/stores/{id}/toggle-plan` | 200 OK, same mutations as 1b |

### R2: Preconditions

The toggle SHALL be blocked with 400 + error code if ANY precondition fails.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Inactive store | `store.IsActive=false` | POST toggle | 400, `StoreInactive` |
| 2b | Owner user inactive | `store.Owner.User.IsActive=false` | POST toggle | 400, `OwnerUserInactive` |
| 2c | No permission | Caller is OwnerAdmin (lacks `StorePaymentAdmin`) | POST toggle | 403 Forbidden |

### R3: Free→Paid Module Mutation

When toggling Free→Paid, the handler SHALL:
1. Set `PaymentStartDate = DateOnly.FromDateTime(dateTimeProvider.UtcNow.UtcDateTime)`
2. Add ALL modules where `PriceIncluded=false` to `StoreModules` (insert if absent, re-activate `IsActive=true` if soft-deleted)
3. Generate `StoreRoleFeature` rows following `UpdateStoreCommand` pattern (module → feature mapping)
4. Commit in a single `SaveChangesAsync`

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | All paid modules added | Catalog has 5 modules with `PriceIncluded=false`, store has none active | Toggle Free→Paid | 5 new `StoreModule` rows with `IsActive=true` |
| 3b | Previously soft-deleted modules reactivated | Store had paid modules soft-deleted from Paid→Free | Toggle Free→Paid | Those rows are re-activated (`IsActive=true`), no new inserts |
| 3c | Free modules untouched | Store has modules with `PriceIncluded=true` active | Toggle Free→Paid | Free module rows remain unchanged |
| 3d | StoreRoleFeatures generated | Paid module maps to features via existing pattern | Toggle Free→Paid | Corresponding `StoreRoleFeature` rows created |

### R4: Paid→Free Module Mutation

When toggling Paid→Free, the handler SHALL:
1. Set `PaymentStartDate = null`
2. Soft-delete ALL paid `StoreModules` (`IsActive=false`) — never hard-delete
3. Deactivate associated `StoreRoleFeature` rows (`IsActive=false`)
4. Free modules (`PriceIncluded=true`) remain untouched
5. Commit in a single `SaveChangesAsync`

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Paid modules soft-deleted | Store has 3 active paid modules | Toggle Paid→Free | 3 rows set `IsActive=false` |
| 4b | StoreRoleFeatures deactivated | Paid modules had associated feature rows | Toggle Paid→Free | Feature rows set `IsActive=false` |
| 4c | Free modules untouched | Store has active free modules | Toggle Paid→Free | Free module rows unchanged |
| 4d | Idempotent: already Free | `PaymentStartDate=null`, no active paid modules | Toggle Paid→Free | 200 OK (no-op), no mutation |

### R5: Response Contract

The endpoint SHALL return `ResponseResult<bool>` with `data=true` on success.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Success response shape | Valid toggle | POST succeeds | `{ succeeded: true, data: true, errors: [] }` |
| 5b | Error response shape | Precondition fails | POST blocked | `{ succeeded: false, data: null, errors: [{ code: "StoreInactive" }] }` |

---

# 2. DELTA: stores-by-current-user

(Previously: R1 role table only had SuperAdmin and Non-SuperAdmin (StoresAdmin) rows.)

### R1 MODIFIED: Role-Based Store Filtering

The role table SHALL gain a ReSeller row. The full table becomes:

| Role | Store scope | Includes inactive? | Excludes DefaultStore? |
|------|-------------|-------------------|----------------------|
| SuperAdmin | All stores, all tenants | Yes | Yes (at DB level) |
| Non-SuperAdmin (StoresAdmin) | Stores where `Owner.UserId == currentUserId` | No | Yes (at DB level) |
| ReSeller | Stores where `Owner` is linked via `ReSellerOwner` to the caller | No | Yes (at DB level) |

#### Scenario: ReSeller sees linked stores only (NEW)

- GIVEN a ReSeller with `ReSellerOwner` links to 3 owners
- WHEN calling `GET /v1/stores/by-current-user`
- THEN only stores owned by those 3 owners are returned (active only)
- AND `DefaultStore` is excluded

#### Scenario: ReSeller with no linked owners (NEW)

- GIVEN a ReSeller with zero `ReSellerOwner` links
- WHEN calling `GET /v1/stores/by-current-user`
- THEN empty list, 200 OK

---

# 3. DELTA: admin-stores

(Previously: gear menu had no Change Plan item; loader was `superAdminLoader`.)

### Requirement: Gear Menu Change Plan Item (ADDED)

Each store card in the gear menu SHALL include a "Change Plan" / "Cambiar plan" action. The item SHALL be visible to SuperAdmin and ReSeller roles. The item SHALL be hidden when the store is inactive.

#### Scenario: SuperAdmin sees Change Plan in gear menu (NEW)

- GIVEN a SuperAdmin views an active store card
- WHEN the gear menu renders
- THEN "Cambiar plan" item is present

#### Scenario: ReSeller sees Change Plan in gear menu (NEW)

- GIVEN a ReSeller views an active store card they have access to
- WHEN the gear menu renders
- THEN "Cambiar plan" item is present

#### Scenario: Inactive store hides Change Plan (NEW)

- GIVEN a store with `isActive=false`
- WHEN the gear menu renders
- THEN "Cambiar plan" item is NOT present

### Requirement: Change Plan Confirmation Dialog (ADDED)

Clicking "Change Plan" SHALL open a direction-aware confirmation dialog using the shared `confirmDialog`. Dialog copy SHALL be:

| Direction | Title | Message |
|-----------|-------|---------|
| Free→Paid | "Activar plan pago" | "¿Está seguro que desea activar el plan de pago para esta tienda? Se habilitarán todos los módulos de pago." |
| Paid→Free | "Desactivar plan pago" | "¿Está seguro que desea desactivar el plan de pago? Se deshabilitarán los módulos de pago asociados." |

Buttons: `GENERAL.YES` ("Si") / `GENERAL.NO` ("No"). Confirmed → POST toggle + reload list. Cancelled → no call.

#### Scenario: Free→Paid dialog copy (NEW)

- GIVEN a store in Free plan
- WHEN user clicks "Cambiar plan"
- THEN dialog shows title "Activar plan pago" and the activation message

#### Scenario: Paid→Free dialog copy (NEW)

- GIVEN a store in Paid plan
- WHEN user clicks "Cambiar plan"
- THEN dialog shows title "Desactivar plan pago" and the deactivation message

#### Scenario: Cancel dialog (NEW)

- GIVEN a toggle confirmation dialog is open
- WHEN user clicks "No"
- THEN no HTTP call is made

### Requirement: Store List Loader Swap (MODIFIED)

`store-list.tsx` loader SHALL change from `superAdminLoader` to `resellerLoader`. `superAdminLoader` SHALL remain frozen (no deletion). `resellerLoader` admits both SuperAdmin and ReSeller roles.

(Previously: loader was `superAdminLoader`, only SuperAdmin could access the list.)

#### Scenario: ReSeller can access store list (NEW)

- GIVEN a ReSeller user
- WHEN navigating to `/admin/stores`
- THEN the list loads successfully showing only their linked stores

### Requirement: storeHttpService.toggleStorePlan (ADDED)

`storeHttpService` SHALL expose `toggleStorePlan(storeId: string): Promise<ResponseResult<boolean>>` issuing `POST /v1/stores/{id}/toggle-plan`.

### Requirement: List Refresh After Toggle (ADDED)

After a successful toggle, the store list SHALL reload (same pattern as approve/disapprove — call `loadStores()`).

#### Scenario: List refreshes after toggle (NEW)

- GIVEN a toggle completes with 200
- WHEN the response is received
- THEN `loadStores()` is called and the list re-renders with updated plan state

---

# 4. DELTA: billing

(Previously: R8/R12 interplay did not account for explicit toggle path.)

### R8 MODIFIED: PaymentStartDate Backfill + Toggle Reset

`PaymentStartDate` SHALL be settable to `null` by the toggle endpoint (Paid→Free direction). This is the ONLY path that MAY set `PaymentStartDate` back to null after initial activation.

(Previously: once set, `PaymentStartDate` was never nullified by any endpoint.)

#### Scenario: Toggle Paid→Free nullifies PaymentStartDate (NEW)

- GIVEN a paid store with `PaymentStartDate = 2026-03-10`
- WHEN toggle endpoint runs Paid→Free
- THEN `PaymentStartDate` SHALL be `null`
- AND billing status SHALL compute as `NoAplica`

### R12 MODIFIED: StoreDto.PaymentStartDate Reflects Toggle

After toggle, the store DTO returned by any subsequent `GET` SHALL reflect the new `PaymentStartDate` value (null for Free, date for Paid).

(Previously: R12 only described the get-by-id contract; toggle is a new mutation path that feeds the same contract.)

#### Scenario: After Free→Paid toggle, DTO shows date (NEW)

- GIVEN a store toggled from Free to Paid
- WHEN `GET /stores/{id}` is called
- THEN `paymentStartDate` SHALL be today's date

#### Scenario: After Paid→Free toggle, DTO shows null (NEW)

- GIVEN a store toggled from Paid to Free
- WHEN `GET /stores/{id}` is called
- THEN `paymentStartDate` SHALL be `null`
