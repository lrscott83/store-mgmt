# Delta for authorization-e2e

Delta for change `s2-03-backend-h10`: POST /v1/stores becomes SuperAdmin-only. Replaces R2.10/R2.11 and criterion #8 (coupling pre-annotated at lines 53/68/91).

## ADDED Requirements

### Requirement: R2.12: SuperAdmin POST /v1/stores returns 201 and persists

The system MUST preserve the SuperAdmin creation path: a SuperAdmin calling `POST /v1/stores` MUST receive 201 Created with `Succeeded=true` and Location, and MUST persist the Store and StoreModule rows. (Regression guard for the new rule.)

#### Scenario: SuperAdmin creates a store via the API (regression)

- GIVEN an authenticated SuperAdmin
- WHEN the SuperAdmin sends POST /v1/stores with OwnerId, a unique name, and ModuleIds=[7]
- THEN the response MUST be 201 Created with Succeeded=true and Location /api/v1/stores/{id}
- AND a Store row and its StoreModule row MUST be persisted (IgnoreQueryFilters)

### Requirement: R2.13: Auto-registration still creates owner + store in one step

The system MUST NOT change self-registration: registering an OwnerAdmin via `POST /v1/auth/register` MUST still create owner + store in one step through the separate service path (`RegisterCommand` → `ICreateStoreService`), bypassing `CreateStoreCommand`. (S1-01 regression guard.)

#### Scenario: Registering an OwnerAdmin creates owner and store

- GIVEN a valid registration via POST /v1/auth/register
- THEN the OwnerAdmin user, owner, and Store with StoreModule rows MUST be persisted
- AND the OwnerAdmin's SelectedStoreId MUST be set to the created store

## MODIFIED Requirements

### Requirement: R2.10: OwnerAdmin direct POST /v1/stores → 403 Forbidden, no persistence, no re-point

The system MUST reject an OwnerAdmin holding Stores feature (73) calling `POST /v1/stores` with **403 Forbidden** before any persistence. The action-level `[HasPermission(SuperAdmin)]` gate SHALL deny OwnerAdmin/StoreUser/ReSeller even when the class-level gate is satisfied; the handler SHALL NOT admit them (defense in depth).
(Previously: OwnerAdmin got 201 + Store/StoreModule persistence + SelectedStoreId re-point.)

#### Scenario: OwnerAdmin with Stores feature is rejected without side effects

- GIVEN an authenticated OwnerAdmin with a Management(7) store (feature 73 granted, SelectedStoreId set)
- WHEN the OwnerAdmin sends POST /v1/stores with OwnerId, a unique name, and ModuleIds=[7]
- THEN the response MUST be 403 Forbidden (not 201, not 400)
- AND no Store and no StoreModule row MUST be persisted for the request (IgnoreQueryFilters)
- AND the OwnerAdmin's SelectedStoreId MUST remain the original store
- AND cleanup MUST only delete the seeded fixture graph

### Requirement: R2.11: StoreUser with Stores feature direct POST /v1/stores → 403, not 400

The system MUST reject a StoreUser granted Stores feature (73) calling `POST /v1/stores` with **403 Forbidden** — not 400 — enforced by the action-level `[HasPermission(SuperAdmin)]` gate before the handler runs.
(Previously: StoreUser reached the handler and got 400 BadRequest.)

#### Scenario: StoreUser with Stores feature is rejected with 403

- GIVEN an authenticated StoreUser with a Management(7) store and a StoreRoleFeature granting Stores (73)
- WHEN the StoreUser sends POST /v1/stores with OwnerId, a unique name, and ModuleIds=[7]
- THEN the response MUST be 403 Forbidden (not 400)
- AND no Store row MUST be created for the request

### Requirement: R2.14: Handler rejects non-SuperAdmin direct callers with 403

The system SHALL enforce the rule in the handler: a direct (non-HTTP) caller of `CreateStoreCommand` who is not SuperAdmin SHALL be rejected with **403 Forbidden** (not 400), and the handler SHALL NOT re-point `SelectedStoreId`. Closes the latent path outside the HTTP pipeline.
(Previously: handler admitted SuperAdmin-or-OwnerAdmin and rejected others with 400.)

#### Scenario: Direct handler call by a non-SuperAdmin is rejected

- GIVEN a non-SuperAdmin invokes CreateStoreCommand directly (outside the HTTP pipeline, filter not applied)
- WHEN the handler executes the authorization guard
- THEN the caller SHALL receive Forbidden (403), not BadRequest (400)
- AND no Store row SHALL be persisted and no SelectedStoreId re-pointed

## Verification Criteria

Replaces criterion #8: POST /v1/stores is SuperAdmin-only. OwnerAdmin with feature 73 → 403, no Store/StoreModule row, SelectedStoreId unchanged (R2.10); StoreUser with feature 73 → 403 not 400 (R2.11); SuperAdmin → 201 + persistence (R2.12); auto-registration one-step intact (R2.13); handler guard → 403 not 400 (R2.14). Both `StoreCreateAuthorizationGapTests` updated in the same change.

## Related Specifications

- **billing** / **billing-e2e-coverage**: admin POST actors are SuperAdmins — remain valid, no delta.
- **store-service**: `CreateStoreService` path unchanged — remains valid.

## Implementation

- `StoresController.cs` POST: add `[HasPermission(StoreRoleFeatures.SuperAdmin)]` (mirrors DELETE/approve/disapprove/payment-date).
- `CreateStoreCommand.cs`: guard → `IsSuperAdmin`, status → `Forbidden`; remove re-point branch.
- `StoreCreateAuthorizationGapTests.cs`: both tests assert 403.
- `RegisterCommand.cs` / `CreateStoreService.cs`: NOT touched (S1-01).
