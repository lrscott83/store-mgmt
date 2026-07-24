# Archive Report: authorization-e2e

**Change:** `authorization-e2e`
**Archived:** 2026-07-24
**Mode:** openspec

---

## Executive Summary

Implemented and verified a comprehensive backend E2E authorization test suite covering the `/auth/me` report window (6 scenarios), Stores enforcement window (9 scenarios), store-scoping (1 scenario), and usages smoke test (1 scenario). All 83 tests passing (including the existing stores E2E suite from `stores-e2e`). The test infrastructure reuses the existing `SMCA.WebApi.E2ETests` project with `AuthzSeed` helpers for OwnerAdmin, StoreUser, and tenant-mismatch fixtures.

## Tests Implemented

| Test Class | Tests | Description |
|-----------|-------|-------------|
| `AuthMePermissionsTests` | 6 | SuperAdmin, OwnerAdmin ±Management, StoreUser, ReSeller, tenant mismatch |
| `StoresAuthorizationTests` | 9 | No-token 401, SuperAdmin r/w, OwnerAdmin ±Management, StoreUser ±feature, ReSeller, tenant mismatch |
| `StoreScopingTests` | 1 | SetMyStore changes SelectedStoreId and /me recomputes |
| `UsagesSmokeTests` | 1 | POST store-daily-usage returns 200 for SuperAdmin |
| Stores tests (existing) | 66 | From `stores-e2e` change (harness, CRUD, approve, auth, role access) |
| **Total** | **83** | **All passing** |

## Key Design Decisions

1. **Enforcement denial = HTTP 403** (ForbidResult, empty body) — NOT 200-wrapped, consistent with the production filter behavior.
2. **/me failures = HTTP 200** with `succeeded=false`, `actionCode=404`, `User.NotFound/Inactive` — NOT a 401.
3. **SuperAdmin bypasses** the stores filter entirely (approve/disapprove is SuperAdmin-only via `[HasPermission(SuperAdmin)]`).
4. **OwnerAdmin recognition** requires `UserRole.TenantId == User.TenantId` — tenant mismatch renders `IsOwnerAdmin=false`.

## Deviations from Spec

None. All scenarios implemented as specified.

## Verification Results

- **Build**: ✅ Passed
- **Tests**: ✅ 83/83 passing
- **Verdict**: PASS

## Spec Compliance

| Requirement | Scenario | Coverage | Notes |
|------------|----------|----------|-------|
| R1.1 | SuperAdmin → IsSuperAdmin=true | ✅ Full | Tested |
| R1.2 | OwnerAdmin + Management → Stores feature | ✅ Full | Tested |
| R1.3 | OwnerAdmin - Management → no Stores | ✅ Full | Tested |
| R1.4 | StoreUser with feature | ✅ Full | Tested |
| R1.5 | ReSeller → IsReSeller=true | ✅ Full | Tested |
| R1.6 | Tenant mismatch → IsOwnerAdmin=false | ✅ Full | Tested |
| R2.1 | No token → 401 | ✅ Full | Tested |
| R2.2 | SuperAdmin read → 200 | ✅ Full | Tested |
| R2.3 | SuperAdmin approve → 200 | ✅ Full | Tested |
| R2.4 | OwnerAdmin + feature read/approve | ✅ Full | Tested |
| R2.5 | OwnerAdmin - Management → 403 | ✅ Full | Tested |
| R2.6 | StoreUser + feature → 200 | ✅ Full | Tested |
| R2.7 | StoreUser - feature → 403 | ✅ Full | Tested |
| R2.8 | ReSeller → 403 | ✅ Full | Tested |
| R2.9 | Tenant mismatch → 403 | ✅ Full | Tested |
| R3.1 | SetMyStore → /me recomputes | ✅ Full | Tested |
| R4.1 | POST usage → 200 | ✅ Full | Tested |

## Key Learnings

- `CleanupStoreGraphAsync` must delete in FK order: StoreRoleFeature → StoreUser → StoreModule → Store → Owner → UserRole → User.
- AuthzSeed requires `DbContext` scoped to the test fixture — shared across test classes via collection fixture.
- Enforcement denial returns empty body HTTP 403 (ForbidResult), not a 200-wrapped error response.
- /me failure returns 200 with `succeeded=false` — the endpoint itself never returns 401.

## Archive Contents

- `proposal.md` ✅
- `spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅
- `archive-report.md` ✅ (this file)

## SDD Cycle Complete

This change has been fully planned, implemented, verified, and archived. The authorization E2E coverage is now comprehensive across all role types and both authorization windows.

## Next Recommended

- Add authorization E2E tests for other API resources (users, owners, inventory)
- Add CI pipeline integration for automated E2E test execution against the test database
- Consider extracting common authz assertions into a shared helper base class
