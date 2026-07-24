# Stores E2E Tests

## Intent
Cover 6 in-scope StoresController endpoints end-to-end against real Postgres, reusing the auth e2e harness.

## Scope
- **Included**: by-current-user, get-by-id, create, update, approve, disapprove + full authorization matrix (SuperAdmin, OwnerAdmin, StoreUser, ReSeller) + full validation coverage
- **New files**: Stores/StoresHarnessSmokeTests.cs, StoresByCurrentUserTests.cs, StoreGetByIdTests.cs, StoreCreateTests.cs, StoreUpdateTests.cs, StoreApproveTests.cs, StoreDisapproveTests.cs, StoreAuthorizationTests.cs, StoreRoleAccessTests.cs
- **New helper**: Infrastructure/StoreSeed.cs
- **Existing modified**: TestDtos.cs (add StoreData/ModuleData), DbTestHelpers.cs (add SeedUserWithRoleAsync/AuthedClient)

## Approach
Extend existing SMCA.WebApi.E2ETests project. Reuse AppTestFactory, WebAppFixture, ApiResponse, DbTestHelpers, AuthTestHelpers. Seed fixtures under DataUtils.DefaultTenant.Id. Cleanup in finally blocks with IgnoreQueryFilters in FK order. SuperAdmin is the cheapest passing seed.

## Known Bugs (pinned, not fixed)
1. Store name uniqueness checks User.Login not Store.Name → duplicate names succeed
2. SuperAdmin PUT without PaymentStartDate → misleading UserNotFound error
3. OwnerAdmin PUT silently drops Description/Approved/IsActive/PaymentStartDate

## Dependencies
Auth e2e harness already exists on disk.