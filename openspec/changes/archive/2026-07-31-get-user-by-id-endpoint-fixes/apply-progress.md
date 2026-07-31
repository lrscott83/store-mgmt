# Apply Progress: get-user-by-id-endpoint-fixes

**Status**: COMPLETE — all 13 tasks done, all verifications green.
**Commits**: A `2b838542` (tasks 1-8), B `4a6ab0b9` (task 9 + test assertion fix), C `235bc990` (T13 resolution: overloads). All on main.

## Completed (verified)
- T1 seed: `UserSeed.SeedOwnerAdminWithStoreAsync` adds `db.Set<StoreUser>().Add(StoreUser.Create(user.Id, store.Id, tenantId))` in 2nd SaveChanges batch + `using Domain.Entities.StoreUsers;`
- T2 test: `UsersGetByIdTests.Get_owner_admin_returns_full_body_with_owner_store_and_roles` (SuperAdmin actor != OwnerAdmin target) + inline `UserByIdData`
- T3 UserDto: OwnerName/StoreName `string?`; RoleNames `= []`
- T4 interface: `new Task<bool> ExistsAsync(Guid, CancellationToken = default)`; token params on GetUserByIdIncludingStoreAndRoles + GetByLoginWithRelatedAsync overloads
- T5 repo: ExistsAsync = `_users.IgnoreQueryFilters().AnyAsync(u => u.Id == id, ct)` (new keyword); GetByLoginWithRelatedAsync adds `.ThenInclude(o => o.User)` + token; GetUserByIdIncludingStoreAndRoles keeps old chain (Commit A) then swaps to `IncludeStoreAndRoles(_users.Where(...))` (Commit B)
- T6 validator: UserExists uses `ExistsAsync(userId, cancellationToken)`
- T7 handler: `User? user` + `if (user is null) return ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404);` + token forwarded
- T8 controller: `[FromRoute] Guid id` + ProducesResponseType 400/401/403 mirroring GetAllUsersAsync
- T9 helper swap: `GetUserByIdIncludingStoreAndRoles` = `IncludeStoreAndRoles(_users.Where(u => u.Id == userId)).FirstOrDefaultAsync(cancellationToken)`
- T10 build: SMCA.WebApi 0 errors; E2E project 0 errors; Application.Tests 0 errors (re-checked after T13 fix)
- T11 RED: 1 fail (ownerName null as designed) / 4 pass. GREEN: 5/5 pass (re-confirmed after T13 fix)
- T12 regression: UsersList+UsersUpdate filter 20/20 pass
- T13 auth regression: 19/19 PASS after overload resolution (was: CS0854 compile error x20)

## T13 resolution — Option A (overloads), commit `235bc990`
Design AD3 premise was WRONG: one-arg calls to a method with an optional param inside Moq expression trees trigger CS0854 ("An expression tree may not contain a call or invocation that uses optional arguments") — 20 errors in AuthenticationServiceTests.cs (19 .Setup + 1 .Verify at 616:41).
Fix (orchestrator-approved):
- `IUserRepository`: `Task<User?> GetByLoginWithRelatedAsync(string login);` + `Task<User?> GetByLoginWithRelatedAsync(string login, CancellationToken cancellationToken);` (NO default on 2-arg)
- `UserRepository`: 1-arg delegates `=> GetByLoginWithRelatedAsync(login, default);`; 2-arg keeps `.ThenInclude(o => o.User)` + `FirstOrDefaultAsync(cancellationToken)`
- AuthenticationService.cs, its call site, and all 20 one-arg Moq setups: UNTOUCHED
- Verified: Application.Tests 19/19 PASS, WebApi build 0 err, E2E 5/5

## Deviations
1. **Test assertion fix (Commit B)**: design/spec claimed seeded Role.Name for OwnerAdmin == "OwnerAdmin" — WRONG. Role rows seed with `RoleType.X.GetDisplayName()` (RoleEntityTypeConfiguration.cs:41); Display attr = "Administrador de tienda" (RoleType.cs:11); all migrations since 2024 contain it. API returns DB name correctly. Test now asserts `RoleType.OwnerAdmin.GetDisplayName()` (semantic contract). Endpoint code was never wrong — only the test literal.
2. **Working tree pre-existing deltas**: get-users-all-endpoint-fixes batch (IncludeStoreAndRoles helper, GetAll* token params, controller metadata) was NEVER committed (archived on disk only). Included in Commit A by necessity — code compiles against the helper. Other dirty files (frontend, middleware, Program.cs, GetStoreById etc.) left untouched.
3. **T13 mechanism deviation (orchestrator-approved)**: interface overloads instead of literal optional param on GetByLoginWithRelatedAsync (RR-G3 wording). All RR-G3 acceptance criteria met (3a include, 3b call site, 3c token).

## Risks
- Process gap closed: T10 gate now also covers Application.Tests build (verified 0 errors).
- Remaining dirty working tree (unrelated files from prior batches) still uncommitted — orchestrator should handle separately before verify/archive.
