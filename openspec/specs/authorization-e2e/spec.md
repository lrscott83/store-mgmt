# Spec: Authorization E2E Tests

**Domain**: authorization-e2e — backend end-to-end authorization test scenarios  
**Origin**: SDD change `authorization-e2e` (extended by `e2e-stage-1-s2-03`, 2026-08-06)  
**Status**: Active  
**Last Updated**: 2026-08-06  

## Purpose
Define backend E2E test scenarios that validate the authorization engine through its two primary windows — the `/auth/me` report endpoint and the Stores enforcement pipeline — plus store-scoping and a usage smoke test.

## In Scope
- `/auth/me` report window: SuperAdmin, OwnerAdmin (±Management store), StoreUser, ReSeller, tenant mismatch
- Stores enforcement window: no-token 401, SuperAdmin read/approve, OwnerAdmin (±Management), StoreUser (±feature), ReSeller, tenant mismatch
- Store-scoping: SetMyStore changes SelectedStoreId and `/me` recomputes
- Usages smoke: POST store-daily-usage returns 200 for SuperAdmin

## Out of Scope
- Other API resources (users, owners, inventory) — covered by separate E2E test changes
- Non-authorization negative scenarios (validation, missing fields)

## Requirements

### R1: /auth/me report window
- **R1.1**: SuperAdmin → IsSuperAdmin=true
- **R1.2**: OwnerAdmin with Management(7) store → IsOwnerAdmin=true, FeatureIds contains Stores(73)
- **R1.3**: OwnerAdmin without Management store → IsOwnerAdmin=true, FeatureIds excludes Stores(73)
- **R1.4**: StoreUser with feature → IsSuperAdmin=false, IsOwnerAdmin=false, SelectedStoreId matches
- **R1.5**: ReSeller → IsReSeller=true
- **R1.6**: UserRole tenant mismatch → IsOwnerAdmin=false (not recognized)
- **R1.7**: Deactivated account (real-flow) → HTTP 404, `Succeeded=false`, `ActionCode=404`, single error `Auth.AccountInactive` (B-6, delivered by `e2e-b6-me-inactive-404` — `AuthMeDeactivationTests.cs`)

> **Delivery note (2026-08-10)**: R1.7 is DELIVERED by change `e2e-b6-me-inactive-404`
> (spec-time main-spec update, B-3 precedent) — closes the B-6 declared gap: no flow
> ever deactivated an account over HTTP, so the server-side `/me` 404 for a
> deactivated account was never exercised end-to-end. Verification run pending in
> that change's sdd-verify.

### R2: Stores enforcement window
- **R2.1**: No token → 401
- **R2.2**: SuperAdmin → passes read (200)
- **R2.3**: SuperAdmin → can approve (200)
- **R2.4**: OwnerAdmin with feature → passes read (200), approve → 403
- **R2.5**: OwnerAdmin without Management → 403
- **R2.6**: StoreUser with feature → passes (200)
- **R2.7**: StoreUser without feature → 403
- **R2.8**: ReSeller → 403
- **R2.9**: Tenant mismatch → 403

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

### R3: Store-scoping
- **R3.1**: SetMyStore changes SelectedStoreId and /me recomputes

### R4: Usages smoke
- **R4.1**: POST store-daily-usage → 200 for SuperAdmin

## Verification Criteria
1. All 4 requirement groups have passing tests (19 test scenarios total — 17 baseline + R2.10 + R2.11)
2. Authorization matrix is verified across all role types (SuperAdmin, OwnerAdmin, StoreUser, ReSeller)
3. Enforcement denials return HTTP 403 (not 200-wrapped)
4. /me failures return HTTP 404 with `succeeded=false`, `actionCode=404` (real HTTP status — see `AuthMeFailureTests`; includes `Auth.AccountInactive` for deactivated accounts, R1.7)
5. SuperAdmin bypasses the stores filter entirely
6. approve/disapprove is SuperAdmin-only (method-level `[HasPermission(SuperAdmin)]`)
7. OwnerAdmin recognition requires `UserRole.TenantId == User.TenantId`
8. H-10 gap pinned by E2E (change `e2e-stage-1-s2-03`): OwnerAdmin direct `POST /v1/stores` → 201 + persistence + SelectedStoreId re-point (R2.10); StoreUser with feature 73 → 400 not 403 (R2.11). **Coupling**: when H-10 is fixed — action-level `[HasPermission(SuperAdmin)]` on the POST action or removal of the re-point branch at `CreateStoreCommand.cs:57-61` — R2.10/R2.11 and both `StoreCreateAuthorizationGapTests` tests MUST be updated in the same change.

## Related Specifications
- **auth-authorization** (frontend authorization service; separate domain)
- **route-guard-authorization** (route-level guard authorization; separate domain)

## Implementation
- Test project: `SMCA.WebApi.E2ETests`
- Infrastructure: `AuthzSeed` (OwnerAdmin, StoreUser, tenant-mismatch fixtures)
- Test classes: `AuthMePermissionsTests`, `StoresAuthorizationTests`, `StoreScopingTests`, `UsagesSmokeTests`, `StoreCreateAuthorizationGapTests` (added by `e2e-stage-1-s2-03`, 2026-08-06)
- Final evidence (change `e2e-stage-1-s2-03`, close 2026-08-06): focused `StoreCreateAuthorizationGapTests` 2/2 passed; Stores-area regression `FullyQualifiedName~SMCA.WebApi.E2ETests.Stores` 57/57 passed; build 0 errors; evidence revision sha256:0dfed88b... — carried per launch-prompt final-state facts (outranks intermediate snapshots)
