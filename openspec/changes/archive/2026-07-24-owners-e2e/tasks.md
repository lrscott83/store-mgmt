# Tasks: Owners E2E Tests

25 tests across 9 new files in `SMCA.WebApi.E2ETests/Owners/`. No app code changes.

## Phase 1: Core Endpoint Tests

- [x] 1.1 `Owners/OwnersListTests.cs` — `List_owners_as_super_admin_returns_200`, `List_owners_as_reseller_returns_200`. Run: `--filter OwnersListTests`
- [x] 1.2 `Owners/OwnersGetByIdTests.cs` — `Get_owner_by_id_returns_200`, `Get_owner_by_id_nonexistent_returns_400_OwnerNotFound`, `Get_owner_by_id_empty_guid_returns_400_IsRequired`. Run: `--filter OwnersGetByIdTests`
- [x] 1.3 `Owners/OwnersCreateTests.cs` — `Create_owner_persists_tenant_user_owner_and_role` (DB assertions via ApplicationDbContext). Run: `--filter OwnersCreateTests`
- [x] 1.4 `Owners/OwnersCreateValidationTests.cs` — 7 tests: empty Login/Password/FullName/Cellphone, invalid Email, nonexistent ReSellerId, duplicate Login. Run: `--filter OwnersCreateValidationTests`
- [x] 1.5 `Owners/OwnersUpdateTests.cs` — 4 tests: persist FullName+IsActive, nonexistent Id (400/Id), empty FullName (400), invalid Email (400). Run: `--filter OwnersUpdateTests`
- [x] 1.6 `Owners/OwnersDeleteTests.cs` — 3 tests: bug-pin 500, nonexistent Id (400/Id), ReSeller guard (400). Run: `--filter OwnersDeleteTests`

## Phase 2: Gap Scenario Tests

- [x] 2.1 `Owners/OwnersCreateGapTests.cs` — `Create_owner_as_reseller_returns_200`. Run: `--filter OwnersCreateGapTests`
- [x] 2.2 `Owners/OwnersUpdateGapTests.cs` — empty CellPhone (400), nonexistent ReSellerId (400). Run: `--filter OwnersUpdateGapTests`
- [x] 2.3 `Owners/OwnersListGapTests.cs` — includeInactive true (includes inactive), false (excludes inactive). Run: `--filter OwnersListGapTests`

## Phase 3: Full Suite Verification

- [x] 3.1 `dotnet test backend/src/SMCA.WebApi.E2ETests` — all 25 tests PASS (148 total across all E2E).