# Tasks: Users E2E Tests

## Task 0: UserSeed helper (Infrastructure)
- [x] Create `Infrastructure/UserSeed.cs` — SeedUserAsync(role), SeedUserWithStoreAsync() (User + Owner + Store + UserRole), CleanupUserAsync(), CleanupUserGraphAsync()
- [x] Create `Users/` test folder
- [x] Build to verify compilation

## Task 1: Users List tests (UsersListTests.cs)
- [x] Add `Users/UsersListTests.cs` — SuperAdmin 200, OwnerAdmin+UsersAdmin 200, StoreUser 403, ReSeller 403, no-token 401
- [x] Add includeInactive variants: true → includes, false → excludes, not-a-bool → 400, malformed token → 401
- [x] Run `dotnet test --filter ~UsersListTests`, verify all pass

## Task 2: Users GetById tests (UsersGetByIdTests.cs)
- [x] Add `Users/UsersGetByIdTests.cs` — existing user 200, non-existent id 400, no-token 401, wrong role 403
- [x] Run `dotnet test --filter ~UsersGetByIdTests`, verify all pass

## Task 3: Users Update tests (UsersUpdateTests.cs)
- [x] Add `Users/UsersUpdateTests.cs` — SuperAdmin 200, OwnerAdmin 200, StoreUser 403, no-token 401, empty body 400, non-existent id 400
- [x] Run `dotnet test --filter ~UsersUpdateTests`, verify all pass

## Task 4: Users Delete tests (UsersDeleteTests.cs)
- [x] Add `Users/UsersDeleteTests.cs` — SuperAdmin soft-delete 200 (IsActive=false), non-existent 400, no-token 401
- [x] Run `dotnet test --filter ~UsersDeleteTests`, verify all pass

## Task 5: Users Activate tests (UsersActivateTests.cs)
- [x] Add `Users/UsersActivateTests.cs` — SuperAdmin activate 200, KNOWN BUG: always sets active=true (document), non-existent 400
- [x] Run `dotnet test --filter ~UsersActivateTests`, verify all pass

## Task 6: Users Add/Delete Roles tests (UsersRolesTests.cs)
- [x] Add `Users/UsersRolesTests.cs` — add roles 200, add existing role idempotent 200, delete roles 200, delete non-existent role 200, empty RoleIds 400
- [x] Run `dotnet test --filter ~UsersRolesTests`, verify all pass

## Task 7: Users ChangePassword tests (UsersChangePasswordTests.cs)
- [x] Add `Users/UsersChangePasswordTests.cs` — change own password 200, change as another user without permission 403
- [x] Run `dotnet test --filter ~UsersChangePasswordTests`, verify all pass

## Task 8: StoreUsers List tests (StoreUsersListTests.cs)
- [x] Add `Users/StoreUsersListTests.cs` — SuperAdmin list 200, no-token 401
- [x] Run `dotnet test --filter ~StoreUsersListTests`, verify all pass

## Task 9: StoreUsers GetById + Create tests (StoreUsersCrudTests.cs)
- [x] Add `Users/StoreUsersCrudTests.cs` — Get existing 200, Create valid 200, duplicate login 400, no-token 401
- [x] Run `dotnet test --filter ~StoreUsersCrudTests`, verify all pass

## Task 10: Full suite build + verify
- [x] `dotnet build backend/src/SMCA.WebApi.E2ETests` — no compilation errors
- [x] `dotnet test backend/src/SMCA.WebApi.E2ETests` — all 46+ tests pass