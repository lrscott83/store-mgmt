# Authorization (cross-cutting) E2E Tests

## Intent
Cover the permissions engine through its two windows — GET /auth/me (report) and Stores (enforcement) — plus the §9.5 store-scoping chain and a Usages smoke test.

## Scope
- **AuthMePermissionsTests** (6 tests): SuperAdmin, OwnerAdmin ±Management, StoreUser, ReSeller, tenant mismatch
- **StoresAuthorizationTests** (9 tests): no-token 401, SuperAdmin passes, SuperAdmin approve, OwnerAdmin ±Management, StoreUser ±feature, ReSeller, tenant mismatch
- **StoreScopingTests** (1 test): SetMyStore changes SelectedStoreId and /me recomputes
- **UsagesSmokeTests** (1 test): POST store-daily-usage returns 200 for SuperAdmin
- **New files**: Infrastructure/AuthzSeed.cs, Auth/AuthMePermissionsTests.cs, Auth/StoresAuthorizationTests.cs, Auth/StoreScopingTests.cs, Auth/UsagesSmokeTests.cs
- **Existing modified**: Infrastructure/TestDtos.cs (add MeData DTO)

## Approach
Extend existing SMCA.WebApi.E2ETests project. Reuse AppTestFactory, WebAppFixture, DbTestHelpers, StoreSeed from Plan 04. Add AuthzSeed with OwnerAdmin, StoreUser, and tenant-mismatch fixtures. All assertions on status codes (403/401/200) and /me claim payloads.

## Dependencies
Plan 04 harness on disk (StoreSeed, DbTestHelpers, etc.)