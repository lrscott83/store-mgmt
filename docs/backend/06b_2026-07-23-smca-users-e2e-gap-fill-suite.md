# 06b — SMCA.WebApi Users E2E — Gap-fill Suite

**Date:** 2026-07-23
**Scope:** the scenario-level gaps of the 8 `UsersController` endpoints that plan `06` did NOT cover. All 8
endpoints are already in `06`; this file adds only the MISSING scenarios (no duplication).
**Depends on / reuses:** the `04`/`05` harness (`AppTestFactory`, `WebAppFixture`, `ApiResponse<T>`,
`DbTestHelpers`, `StoreSeed`, `AuthzSeed`, `SeedInactiveUserAsync`) against real Postgres `smca_test`.

---

## Verified facts used here

- `FeatureType.Users = 72`, `FeatureType.Profile = 70` (`FeatureType.cs:82,85`).
- `UsersAdmin` = `[HasRoles(OwnerAdmin)] [HasFeature(Users)] [HasModule(Management)]`; `ProfileAdmin` =
  `[HasFeature(Profile)] [HasModule(Management)]`, roles incl. StoreUser (`StoreRoleFeatures.cs:178-186`).
  A plain StoreUser passes a `[HasPermission]` gate via the filter's plain-StoreUser branch when it has a
  `StoreRoleFeature` granting that feature — so `AuthzSeed.SeedStoreUserAsync(grantedFeatureId: 72/70)`
  lets a StoreUser reach the handler.
- Handler guards: `DeleteUserCommand`/`ActivateUserCommand`/`UpdateUserPassword`(other) hard-gate on
  `IsSuperAdminOrOwnerAdmin` → `ApiException` real **400**. `UpdateUserCommand` applies `IsActive` only for
  `IsSuperAdminOrOwnerAdmin`. `VisibleRoleService`: SuperAdmin role is not visible to an OwnerAdmin →
  `RoleNotFound`.

## Missing scenarios covered (11)

| Endpoint | Missing scenario (this file) |
|---|---|
| `GET all/{includeInactive}` | flag `true` includes / `false` excludes an inactive user; StoreUser-scoped branch (feature 72) → 200 |
| `GET {id}` | `Guid.Empty` → 400 `IsRequired` |
| `PUT {id}` | `IsActive` NOT applied for a StoreUser editing self (privileged field) |
| `DELETE {id}` | StoreUser (passed the gate) → handler guard 400 |
| `POST activate` | StoreUser → handler guard 400 |
| `POST AddUserRoles` | OwnerAdmin assigning SuperAdmin role → 400 `RoleNotFound` |
| `POST DeleteUserRoles` | nonexistent user → 400 `UserNotFound`; empty `RoleIds` → 400 `IsRequired` |
| `POST change-password` | nonexistent user → 400 `UserNotFound`; empty `OldPassword` → 400 `IsRequired` |

**Confirm before running:** that `GET all/{includeInactive}` actually honors the flag for a SuperAdmin
caller — if the handler ignores it, adjust the two include/exclude asserts.

---

## `Users/UsersListGapTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersListGapTests
{
    private readonly AppTestFactory _f;
    public UsersListGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed class UserRow { public Guid Id { get; set; } public bool IsActive { get; set; } }

    // GET all/{includeInactive}: the flag must gate inactive users in/out. (CONFIRM the handler honors it.)
    [Fact]
    public async Task Get_all_includeInactive_true_includes_inactive_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var inactive = await DbTestHelpers.SeedInactiveUserAsync(_f, $"inact-{Guid.NewGuid():N}@test.com", "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Users/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<UserRow>>>(ApiResponse.Json);
            b!.Data!.Should().Contain(u => u.Id == inactive && !u.IsActive);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, inactive); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Get_all_includeInactive_false_excludes_inactive_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var inactive = await DbTestHelpers.SeedInactiveUserAsync(_f, $"inact-{Guid.NewGuid():N}@test.com", "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Users/all/false");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<UserRow>>>(ApiResponse.Json);
            b!.Data!.Should().NotContain(u => u.Id == inactive);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, inactive); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // Third handler branch (neither Super nor Owner): StoreUser with the Users(72) feature -> store-scoped 200.
    [Fact]
    public async Task Get_all_as_store_user_with_users_feature_returns_200()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: 72); // FeatureType.Users
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login).GetAsync("/api/v1/Users/all/false");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }

    // GET {id} with Guid.Empty -> validator NotEmpty -> 400 IsRequired.
    [Fact]
    public async Task Get_user_by_id_empty_guid_returns_400_IsRequired()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/Users/{Guid.Empty}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "IsRequired");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

## `Users/UsersUpdateGapTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersUpdateGapTests
{
    private readonly AppTestFactory _f;
    public UsersUpdateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // PUT {id}: IsActive is only applied for IsSuperAdminOrOwnerAdmin. A StoreUser editing self cannot toggle it.
    [Fact]
    public async Task Update_isactive_not_applied_for_store_user_self()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: 70); // FeatureType.Profile (ProfileAdmin gate)
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login).PutAsJsonAsync($"/api/v1/Users/{su.UserId}",
                new { FullName = "Self Edit", CellPhone = "1", Email = (string?)null, IsActive = false });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var saved = await DbTestHelpers.GetUserByLoginAsync(_f, su.Login);
            saved!.IsActive.Should().BeTrue();        // request said false, but a StoreUser may not deactivate itself
            saved.FullName.Should().Be("Self Edit");  // non-privileged fields DID apply
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }
}
```

## `Users/UsersDeleteActivateGapTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersDeleteActivateGapTests
{
    private readonly AppTestFactory _f;
    public UsersDeleteActivateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // DELETE handler hard-gates on IsSuperAdminOrOwnerAdmin -> ApiException 400 for a StoreUser
    // (who passed [HasPermission(UsersAdmin)] via the Users(72) feature).
    [Fact]
    public async Task Delete_user_as_store_user_returns_400_guard()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: 72);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login).DeleteAsync($"/api/v1/Users/{su.UserId}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }

    // Same guard on activate (the guard runs BEFORE the missing-validation NPE path).
    [Fact]
    public async Task Activate_user_as_store_user_returns_400_guard()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: 72);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login)
                .PostAsJsonAsync("/api/v1/Users/activate", new { Id = su.UserId, IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }
}
```

## `Users/UsersRolesGapTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersRolesGapTests
{
    private readonly AppTestFactory _f;
    private const int SuperAdminRoleId = 1;
    private const int StoreUserRoleId = 3;

    public UsersRolesGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // AddUserRoles: OwnerAdmin cannot assign the SuperAdmin role -> AreVisibleRoles fails -> 400 RoleNotFound.
    [Fact]
    public async Task Add_user_roles_invisible_superadmin_role_returns_400_RoleNotFound()
    {
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, StoreUserRoleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Users/AddUserRoles", new { UserId = target.UserId, RoleIds = new[] { SuperAdminRoleId } });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "RoleNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId); }
    }

    // DeleteUserRoles validator: UserExists.
    [Fact]
    public async Task Delete_user_roles_nonexistent_user_returns_400_UserNotFound()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/DeleteUserRoles", new { UserId = Guid.NewGuid(), RoleIds = new[] { StoreUserRoleId } });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "UserNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // DeleteUserRoles validator: RoleIds required (no visibility check here, unlike AddUserRoles).
    [Fact]
    public async Task Delete_user_roles_empty_roleids_returns_400_IsRequired()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, StoreUserRoleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/DeleteUserRoles", new { UserId = target.UserId, RoleIds = Array.Empty<int>() });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "IsRequired");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

## `Users/UsersChangePasswordGapTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersChangePasswordGapTests
{
    private readonly AppTestFactory _f;
    public UsersChangePasswordGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Validator UserExists (hard 400) vs the soft User.InvalidPassword path.
    [Fact]
    public async Task Change_password_nonexistent_user_returns_400_UserNotFound()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/Users/change-password",
                new { UserId = Guid.NewGuid(), OldPassword = "Password123", NewPassword = "NewPass123" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "UserNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Change_password_missing_oldpassword_returns_400_IsRequired()
    {
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, target.UserId, target.Login).PostAsJsonAsync("/api/v1/Users/change-password",
                new { UserId = target.UserId, OldPassword = "", NewPassword = "NewPass123" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "IsRequired");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); }
    }
}
```

---

## Files

`Users/UsersListGapTests.cs`, `Users/UsersUpdateGapTests.cs`, `Users/UsersDeleteActivateGapTests.cs`,
`Users/UsersRolesGapTests.cs`, `Users/UsersChangePasswordGapTests.cs`. All reuse `04`/`05`/`03b` helpers;
no new helper class. Complements `06` (no duplication).
