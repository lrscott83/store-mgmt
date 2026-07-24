# Tasks: Stores E2E Tests

## Task 0: Infrastructure additions
- [ ] Add StoreData and ModuleData DTOs to TestDtos.cs
- [ ] Add StoreSeed.cs with all seed/cleanup helpers
- [ ] Add SeedUserWithRoleAsync and AuthedClient to DbTestHelpers.cs
- [ ] Create Stores/ test folder

## Task 1: GET by-current-user (4 tests)
- [ ] StoresByCurrentUserTests.cs — SuperAdmin gets seeded stores, inactive included, cross-tenant, 401

## Task 2: GET {id} (4 tests)
- [ ] StoreGetByIdTests.cs — existing store, unknown store, empty id, 401

## Task 3: POST create (8 tests)
- [ ] StoreCreateTests.cs — valid create+persist, empty Name, empty/unknown OwnerId, empty/unavailable ModuleIds, duplicate name bug, 401

## Task 4: PUT {id} (10 tests)
- [ ] StoreUpdateTests.cs — superadmin happy, payment-date quirk, route-id-wins, name collision, unknown/empty id, empty Name, empty/unavailable ModuleIds, 401

## Task 5: POST approve (5 tests)
- [ ] StoreApproveTests.cs — happy, already-approved, unknown/empty id, 401

## Task 6: POST disapprove (5 tests)
- [ ] StoreDisapproveTests.cs — happy, already-disapproved, unknown/empty id, 401

## Task 7: Authorization (4 tests)
- [ ] StoreAuthorizationTests.cs — OwnerAdmin reaches controller, 403 on approve/disapprove, field-drop on update

## Task 8: Role access (2 tests)
- [ ] StoreRoleAccessTests.cs — StoreUser 403, ReSeller 403

## Task 9: Build and run
- [ ] dotnet build backend/src/SMCA.WebApi.E2ETests
- [ ] dotnet test backend/src/SMCA.WebApi.E2ETests — all tests pass