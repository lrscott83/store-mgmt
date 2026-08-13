# Spec: Authorization E2E Tests

**Domain**: authorization-e2e — backend end-to-end authorization test scenarios  
**Origin**: SDD change `authorization-e2e` (extended by `e2e-stage-1-s2-03`, 2026-08-06; then `s2-03-backend-h10`, 2026-08-13)  
**Status**: Active  
**Last Updated**: 2026-08-13  

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

### Requirement: R2.14: Handler rejects non-SuperAdmin direct callers with 403

The system SHALL enforce the rule in the handler: a direct (non-HTTP) caller of `CreateStoreCommand` who is not SuperAdmin SHALL be rejected with **403 Forbidden** (not 400), and the handler SHALL NOT re-point `SelectedStoreId`. Closes the latent path outside the HTTP pipeline.
(Previously: handler admitted SuperAdmin-or-OwnerAdmin and rejected others with 400.)

#### Scenario: Direct handler call by a non-SuperAdmin is rejected

- GIVEN a non-SuperAdmin invokes CreateStoreCommand directly (outside the HTTP pipeline, filter not applied)
- WHEN the handler executes the authorization guard
- THEN the caller SHALL receive Forbidden (403), not BadRequest (400)
- AND no Store row SHALL be persisted and no SelectedStoreId re-pointed

> **Delivery note (2026-08-13)**: R2.10/R2.11 replaced, R2.12/R2.13/R2.14 added by
> change `s2-03-backend-h10` (H-10 fix, archive-time main-spec sync): POST /v1/stores
> is SuperAdmin-only — 403 for all non-SuperAdmins, no persistence, no SelectedStoreId
> re-point. Verified: gap 2/2, Stores 61/61, StoreCreationTrial 18/18,
> AuthRegisterDataAssertions 6/6; evidence revision sha256:d089177b...

### R3: Store-scoping
- **R3.1**: SetMyStore changes SelectedStoreId and /me recomputes

### R4: Usages smoke
- **R4.1**: POST store-daily-usage → 200 for SuperAdmin

## Verification Criteria
1. All 4 requirement groups have passing tests (22 test scenarios total — 17 baseline + R2.10 + R2.11 + R2.12 + R2.13 + R2.14)
2. Authorization matrix is verified across all role types (SuperAdmin, OwnerAdmin, StoreUser, ReSeller)
3. Enforcement denials return HTTP 403 (not 200-wrapped)
4. /me failures return HTTP 404 with `succeeded=false`, `actionCode=404` (real HTTP status — see `AuthMeFailureTests`; includes `Auth.AccountInactive` for deactivated accounts, R1.7)
5. SuperAdmin bypasses the stores filter entirely
6. approve/disapprove is SuperAdmin-only (method-level `[HasPermission(SuperAdmin)]`)
7. OwnerAdmin recognition requires `UserRole.TenantId == User.TenantId`
8. POST /v1/stores is SuperAdmin-only (change `s2-03-backend-h10`): OwnerAdmin with feature 73 → 403, no Store/StoreModule row, SelectedStoreId unchanged (R2.10); StoreUser with feature 73 → 403 not 400 (R2.11); SuperAdmin → 201 + persistence (R2.12); auto-registration one-step intact (R2.13); handler guard → 403 not 400 (R2.14). Both `StoreCreateAuthorizationGapTests` updated in the same change.

## Related Specifications
- **auth-authorization** (frontend authorization service; separate domain)
- **route-guard-authorization** (route-level guard authorization; separate domain)

## Implementation
- Test project: `SMCA.WebApi.E2ETests`
- Infrastructure: `AuthzSeed` (OwnerAdmin, StoreUser, tenant-mismatch fixtures)
- Test classes: `AuthMePermissionsTests`, `StoresAuthorizationTests`, `StoreScopingTests`, `UsagesSmokeTests`, `StoreCreateAuthorizationGapTests` (added by `e2e-stage-1-s2-03`, 2026-08-06)
- Final evidence (change `e2e-stage-1-s2-03`, close 2026-08-06): focused `StoreCreateAuthorizationGapTests` 2/2 passed; Stores-area regression `FullyQualifiedName~SMCA.WebApi.E2ETests.Stores` 57/57 passed; build 0 errors; evidence revision sha256:0dfed88b... — carried per launch-prompt final-state facts (outranks intermediate snapshots)
