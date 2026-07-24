# Spec: Authorization E2E Tests

**Domain**: authorization-e2e — backend end-to-end authorization test scenarios  
**Origin**: SDD change `authorization-e2e`  
**Status**: Active  
**Last Updated**: 2026-07-24  

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

### R3: Store-scoping
- **R3.1**: SetMyStore changes SelectedStoreId and /me recomputes

### R4: Usages smoke
- **R4.1**: POST store-daily-usage → 200 for SuperAdmin

## Verification Criteria
1. All 4 requirement groups have passing tests (17 test scenarios total)
2. Authorization matrix is verified across all role types (SuperAdmin, OwnerAdmin, StoreUser, ReSeller)
3. Enforcement denials return HTTP 403 (not 200-wrapped)
4. /me failures return HTTP 200 with `succeeded=false`, `actionCode=404`
5. SuperAdmin bypasses the stores filter entirely
6. approve/disapprove is SuperAdmin-only (method-level `[HasPermission(SuperAdmin)]`)
7. OwnerAdmin recognition requires `UserRole.TenantId == User.TenantId`

## Related Specifications
- **auth-authorization** (frontend authorization service; separate domain)
- **route-guard-authorization** (route-level guard authorization; separate domain)

## Implementation
- Test project: `SMCA.WebApi.E2ETests`
- Infrastructure: `AuthzSeed` (OwnerAdmin, StoreUser, tenant-mismatch fixtures)
- Test classes: `AuthMePermissionsTests`, `StoresAuthorizationTests`, `StoreScopingTests`, `UsagesSmokeTests`
- 83/83 tests passing (includes existing stores E2E tests from `stores-e2e` change)
