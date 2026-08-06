# Delta for authorization-e2e

Delta for change `e2e-stage-1-s2-03`. Extends the Stores enforcement window (R2) with 2 ADDED requirements that pin CURRENT `POST /v1/stores` behavior as E2E coverage (H-10). No product behavior is added or modified — the requirements describe test coverage of existing defective behavior.

## ADDED Requirements

### Requirement: R2.10: OwnerAdmin direct POST /v1/stores returns 201, persists, and re-points SelectedStoreId

The system MUST document via an E2E test that an OwnerAdmin holding the Stores feature (73) — which passes the class-level `[HasPermission(SuperAdmin, StoresAdmin)]` gate — can create a store by direct `POST /v1/stores`, because the action carries no action-level `[HasPermission]` and the handler deliberately admits OwnerAdmins.

(Coupling: if H-10 is fixed — action-level `[HasPermission]` or removal of the re-point branch — this requirement MUST be updated in the same change.)

#### Scenario: OwnerAdmin with Stores feature creates a store via the API

- GIVEN an authenticated OwnerAdmin seeded with a Management(7) store so the Stores feature (73) is granted and SelectedStoreId is set
- WHEN the OwnerAdmin sends POST /v1/stores with OwnerId, a unique name, and ModuleIds=[7]
- THEN the response MUST be 201 Created with Succeeded=true and Location /api/v1/stores/{id}
- AND a Store row and its StoreModule row MUST be persisted (DB reads use IgnoreQueryFilters)
- AND the OwnerAdmin's SelectedStoreId MUST be re-pointed to the new store, no longer the original
- AND cleanup MUST delete the new store graph before the seeded fixture graph (shared owner)

### Requirement: R2.11: StoreUser with Stores feature direct POST /v1/stores returns 400, not 403

The system MUST document via an E2E test that a StoreUser granted the Stores feature (73) passes the class-level gate, reaches the handler, and receives 400 BadRequest — not 403 — because the handler rejects any caller who is neither SuperAdmin nor OwnerAdmin with BadRequest.

(Coupling: if H-10 is fixed, this requirement MUST be updated in the same change.)

#### Scenario: StoreUser with Stores feature reaches the handler and is rejected

- GIVEN an authenticated StoreUser seeded with a Management(7) store and a StoreRoleFeature granting Stores (73)
- WHEN the StoreUser sends POST /v1/stores with OwnerId, a unique name, and ModuleIds=[7]
- THEN the response MUST be 400 BadRequest (not 403)
- AND no Store row MUST be created for the request
