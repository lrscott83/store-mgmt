# Design: Users E2E Tests

## Technical Approach

Extend existing E2ETests project at `SMCA.WebApi.E2ETests/Users/` with one file per endpoint group. Add a `UserSeed` static helper under `Infrastructure/` for creating User fixtures (users with specific roles, OwnerAdmin with store graph, StoreUser with store assignment). Reuse `DbTestHelpers`, `AuthzSeed`, and `WebAppFixture` patterns exactly. Follow existing try/finally seed+cleanup, `[Collection("e2e")]`, `AppTestFactory` constructor conventions.

## Architecture Decisions

### Decision: File-per-endpoint-group vs mega-file

| Option | Tradeoff | Decision |
|--------|----------|----------|
| One file per logical group (List, GetById, CRUD, etc.) | + Navigable, parallel-friendly, matches Stores/ pattern | **Chosen** |
| Single `UsersTests.cs` | - Cluttered, hard to review | Rejected |

### Decision: UserSeed helper design

| Aspect | Decision |
|--------|----------|
| Location | `Infrastructure/UserSeed.cs` (static class, namespace `SMCA.WebApi.E2ETests.Infrastructure`) |
| Scope | Create test users with any role, return fixture record with cleanup method |
| Fixture record | `UserFixture(Guid UserId, string Login)` — matches existing `DbTestHelpers.UserFixture` |
| Methods | `SeedSuperAdminAsync`, `SeedStoreUserAsync`, `CleanupUserAsync` + factory methods |
| Why not AuthzSeed | AuthzSeed is OwnerAdmin+Store-graph heavy. `UserSeed` is user-centric, lightweight. OwnerAdmin for UsersAdmin tests still uses `AuthzSeed.SeedOwnerAdminAsync`. |

### Decision: Actor provisioning strategy

| Endpoint Permission | SuperAdmin | OwnerAdmin | StoreUser | ReSeller |
|--------------------|------------|------------|-----------|----------|
| `UsersAdmin` (GET, DELETE, Activate, Add/Delete Roles) | Bypasses — use `DbTestHelpers.SeedSuperAdminAsync` | Use `AuthzSeed.SeedOwnerAdminAsync(withManagementModule: true)` | Use `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.StoreUser)` | Use `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.ReSeller)` |
| `ProfileAdmin` (PUT, ChangePassword) | Same | Same OwnerAdmin but with `ManagementModule: false` (if needed) | Same | Same |

### Decision: Known bugs test strategy

| Bug | Approach |
|-----|----------|
| Activate always sets IsActive=true | Assert `IsActive == true` regardless of request body. Async assert comment referencing the bug. |
| StoreName = Guid string | Assert `StoreName` is not null/empty but skip value assertion. Comment referencing the bug. |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `SMCA.WebApi.E2ETests/Users/UserListTests.cs` | Create | GetAllUsers: happy path, auth matrix (SA, OwnerAdmin, StoreUser, ReSeller, 401), includeInactive toggle, non-bool param |
| `SMCA.WebApi.E2ETests/Users/UserGetByIdTests.cs` | Create | GetUserById: happy path SA, OwnerAdmin, 403, 401, 404, invalid id |
| `SMCA.WebApi.E2ETests/Users/UserUpdateTests.cs` | Create | Update: name change, IsActive toggle, auth matrix, 404, validation |
| `SMCA.WebApi.E2ETests/Users/UserDeleteTests.cs` | Create | Delete: soft-delete, OwnerAdmin auth, 403, 401, 404, already-inactive |
| `SMCA.WebApi.E2ETests/Users/UserActivateTests.cs` | Create | Activate: known bug test, OwnerAdmin, 403, 401, verb mismatch |
| `SMCA.WebApi.E2ETests/Users/UserRolesTests.cs` | Create | AddUserRoles + DeleteUserRoles: happy auth matrix, validation, idempotent delete |
| `SMCA.WebApi.E2ETests/Users/UserChangePasswordTests.cs` | Create | ChangePassword: correct/wrong old pass, auth matrix, validation |
| `SMCA.WebApi.E2ETests/Users/StoreUserListTests.cs` | Create | StoreUsers list: happy path SA, OwnerAdmin, 403, 401, includeInactive |
| `SMCA.WebApi.E2ETests/Users/StoreUserGetByIdTests.cs` | Create | StoreUser by id: SA, OwnerAdmin, 403, 401, 404 |
| `SMCA.WebApi.E2ETests/Users/StoreUserCreateTests.cs` | Create | Create StoreUser: all fields, auth matrix, validation, duplicate, verb mismatch |
| `SMCA.WebApi.E2ETests/Infrastructure/UserSeed.cs` | Create | Static helper for User fixtures (sync with DbTestHelpers pattern) |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| E2E | All 11 endpoint groups | Real DB (smca_test), real JWT, `WebAppFixture`, try/finally cleanup |
| E2E | Auth matrix per endpoint | 401 (no token) + 403 (wrong role: StoreUser, ReSeller) + 200 (SuperAdmin, OwnerAdmin+UsersAdmin) |
| E2E | Known bugs | Assert actual (buggy) behavior with comments linking to each bug |
| E2E | Verb mismatch | GET on POST route → 405, POST on GET route → 405 |
| E2E | Validation | Missing fields, invalid types, empty collections → 400 with error code |

## Open Questions

- None. All decisions are resolved from existing patterns and spec.

## Risks

| Risk | Mitigation |
|------|------------|
| ActivateHandler bug causes false negatives | Test documents behavior — assertions match actual behavior |
| StoreName Guid breaks StoreUser assertions | Assert existence only, not value |
| OwnerAdmin without Management module fails UsersAdmin tests | Always use `withManagementModule: true` from `AuthzSeed.SeedOwnerAdminAsync` |