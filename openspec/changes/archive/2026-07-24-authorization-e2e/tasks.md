# Tasks: Authorization E2E Tests

## Task 1: AuthzSeed helpers + MeData DTO
- [ ] Add MeData DTO to Infrastructure/TestDtos.cs
- [ ] Create Infrastructure/AuthzSeed.cs with SeedOwnerAdminAsync, SeedTenantMismatchOwnerAdminAsync, SeedStoreUserAsync, CleanupStoreGraphAsync
- [ ] Build to verify compilation

## Task 2: /auth/me report window (6 tests)
- [ ] Create Auth/AuthMePermissionsTests.cs
- [ ] Run --filter ~AuthMePermissionsTests

## Task 3: Stores enforcement window (9 tests)
- [ ] Create Auth/StoresAuthorizationTests.cs
- [ ] Run --filter ~StoresAuthorizationTests

## Task 4: Store-scoping (1 test)
- [ ] Create Auth/StoreScopingTests.cs
- [ ] Run --filter ~StoreScopingTests

## Task 5: Usages smoke (1 test)
- [ ] Create Auth/UsagesSmokeTests.cs
- [ ] Run --filter ~UsagesSmokeTests

## Task 6: Full suite
- [ ] dotnet test backend/src/SMCA.WebApi.E2ETests — all pass