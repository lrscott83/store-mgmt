# 07 — SMCA.WebApi StoreUsers E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `07` test-plan: the 3 `StoreUsersController` endpoints, exhaustively,
> including the controller-specific double-gate. Permission-matrix coverage belongs to `05`.

**Goal:** Implement, against real Postgres via `dotnet test`, the StoreUsers endpoint behavior, all
`CreateStoreUserCommand` validators, and the `IsSuperAdminOrOwnerAdmin` handler guard.

**Reuses (do NOT redefine):** `04`/`05` harness — `DbTestHelpers.{SeedSuperAdminAsync, SeedUserWithRoleAsync,
AuthedClient, CleanupUserAsync, GetUserByLoginAsync}`, `StoreSeed.{SeedStoreAsync, CleanupStoreFixtureAsync}`,
`AuthzSeed.{SeedOwnerAdminAsync, SeedStoreUserAsync, CleanupStoreGraphAsync}`. No new helper class.

**Actor strategy:** default = SuperAdmin (bypasses `[HasPermission]` and the `IsSuperAdminOrOwnerAdmin`
handler guard). The guard tests deliberately use a StoreUser with the Users(72) feature.

## Global Constraints (verified — `07` test-plan §2)

- Class-level `[HasPermission(UsersAdmin)]`; every handler hard-gates `IsSuperAdminOrOwnerAdmin` →
  `ApiException` real **400**.
- `Ok(...)` → 200 unless thrown; validation = **400** with validator-key codes; no `StoreUserErrors`.
- Create success = 200 `Success(saved>0)`, persists User+StoreUser+UserRole.
- `FeatureType.Users = 72`; visible role for create = `StoreUser=3`.
- Human runs ALL git. Every Checkpoint is a PAUSE.

## File Structure

- Create: `StoreUsers/StoreUsersListTests.cs`, `StoreUsersGetByIdTests.cs`, `StoreUsersCreateTests.cs`,
  `StoreUsersCreateValidationTests.cs`, `StoreUsersGuardTests.cs`.

---

## Task 1: `StoreUsersListTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.StoreUsers;

[Collection("e2e")]
public sealed class StoreUsersListTests
{
    private readonly AppTestFactory _f;
    public StoreUsersListTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_store_users_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/StoreUsers/list/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_store_users_as_owner_admin_returns_200()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/StoreUsers/list/false");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }
}
```

- [ ] Run `--filter ~StoreUsersListTests`. **Checkpoint** — `test(webapi): storeusers list e2e`.

---

## Task 2: `StoreUsersGetByIdTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.StoreUsers;

[Collection("e2e")]
public sealed class StoreUsersGetByIdTests
{
    private readonly AppTestFactory _f;
    public StoreUsersGetByIdTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Get_store_user_by_id_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);
        try
        {
            // CONFIRM: GetStoreUserByIdQuery.StoreUserId semantics — user id vs StoreUser-entity id.
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/StoreUsers/{su.UserId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Get_store_user_by_id_nonexistent_returns_400_UserNotFound()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/StoreUsers/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "UserNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Get_store_user_by_id_empty_guid_returns_400_IsRequired()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/StoreUsers/{Guid.Empty}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "IsRequired");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~StoreUsersGetByIdTests`. **Checkpoint** — `test(webapi): storeusers get-by-id e2e`.

---

## Task 3: `StoreUsersCreateTests` (integration: DB)

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.StoreUsers;

[Collection("e2e")]
public sealed class StoreUsersCreateTests
{
    private readonly AppTestFactory _f;
    private const int StoreUserRoleId = 3; // RoleType.StoreUser — visible to Super/OwnerAdmin
    public StoreUsersCreateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Create_store_user_persists_user_storeuser_and_role()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"SU-{Guid.NewGuid():N}", approved: true);
        var newLogin = $"su-{Guid.NewGuid():N}@test.com";
        Guid createdUserId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/StoreUsers", new
            {
                StoreId = store.StoreId, Login = newLogin, Password = "Password123",
                FullName = "E2E StoreUser", CellPhone = "0000000000", Email = (string?)null,
                RoleIds = new[] { StoreUserRoleId }
            });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();

            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            created.Should().NotBeNull();
            createdUserId = created!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.StoreUsers.StoreUser>().IgnoreQueryFilters()
                .AnyAsync(x => x.UserId == createdUserId && x.StoreId == store.StoreId)).Should().BeTrue();
            (await db.Set<Domain.Entities.UserRoles.UserRole>().IgnoreQueryFilters()
                .AnyAsync(x => x.UserId == createdUserId && x.RoleId == StoreUserRoleId)).Should().BeTrue();
        }
        finally
        {
            if (createdUserId != Guid.Empty) await DbTestHelpers.CleanupUserAsync(_f, createdUserId);
            await StoreSeed.CleanupStoreFixtureAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }
}
```

- [ ] Run `--filter ~StoreUsersCreateTests`. **Checkpoint** — `test(webapi): storeusers create e2e`.

---

## Task 4: `StoreUsersCreateValidationTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.StoreUsers;

[Collection("e2e")]
public sealed class StoreUsersCreateValidationTests
{
    private readonly AppTestFactory _f;
    private const int StoreUserRoleId = 3;
    public StoreUsersCreateValidationTests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task Assert400(Func<Guid, object> body, string code)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"SUV-{Guid.NewGuid():N}", approved: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/StoreUsers", body(store.StoreId));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    private static object Valid(Guid storeId, string? login = null, string password = "Password123",
        string fullName = "E2E", string? email = null, IEnumerable<int>? roleIds = null) => new
    {
        StoreId = storeId, Login = login ?? $"su-{Guid.NewGuid():N}@test.com",
        Password = password, FullName = fullName, CellPhone = "0000000000",
        Email = email, RoleIds = roleIds ?? new[] { StoreUserRoleId }
    };

    [Fact] public Task Create_empty_login_400_IsRequired() => Assert400(s => Valid(s, login: ""), "IsRequired");
    [Fact] public Task Create_empty_password_400_IsRequired() => Assert400(s => Valid(s, password: ""), "IsRequired");
    [Fact] public Task Create_empty_fullname_400_IsRequired() => Assert400(s => Valid(s, fullName: ""), "IsRequired");
    [Fact] public Task Create_empty_roleids_400_IsRequired() => Assert400(s => Valid(s, roleIds: Array.Empty<int>()), "IsRequired");
    [Fact] public Task Create_invalid_email_400_EmailFormatInvalid() => Assert400(s => Valid(s, email: "not-an-email"), "EmailFormatInvalid");
    [Fact] public Task Create_nonexistent_store_400_StoreNotFound() => Assert400(_ => Valid(Guid.NewGuid()), "StoreNotFound");
    [Fact] public Task Create_invisible_role_400_RoleNotFound() => Assert400(s => Valid(s, roleIds: new[] { 999999 }), "RoleNotFound");

    // Duplicate login -> IsUniqueName -> UserAlreadyExists (needs an existing user with the same login).
    [Fact]
    public async Task Create_duplicate_login_400_UserAlreadyExists()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await StoreSeed.SeedStoreAsync(_f, $"SUD-{Guid.NewGuid():N}", approved: true);
        var existing = await DbTestHelpers.SeedUserWithRoleAsync(_f, StoreUserRoleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/StoreUsers",
                Valid(store.StoreId, login: existing.Login));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "UserAlreadyExists");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, existing.UserId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

> `RoleNotFound` with `RoleId 999999` assumes `AreRolesVisibles` returns false for a nonexistent role. If
> `IVisibleRoleService` NPEs on a nonexistent id, use `SuperAdmin=1` with an OwnerAdmin actor instead.

- [ ] Run `--filter ~StoreUsersCreateValidationTests`. **Checkpoint** — `test(webapi): storeusers create validation e2e`.

---

## Task 5: `StoreUsersGuardTests` (double-gate — controller-specific)

A StoreUser with the Users(72) feature passes `[HasPermission(UsersAdmin)]` but is rejected inside each
handler by `IsSuperAdminOrOwnerAdmin` → real 400.

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.StoreUsers;

[Collection("e2e")]
public sealed class StoreUsersGuardTests
{
    private readonly AppTestFactory _f;
    private const int StoreUserRoleId = 3;
    public StoreUsersGuardTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_as_store_user_with_users_feature_returns_400_guard()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: 72);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login).GetAsync("/api/v1/StoreUsers/list/false");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }

    [Fact]
    public async Task Get_by_id_as_store_user_with_users_feature_returns_400_guard()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: 72);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login).GetAsync($"/api/v1/StoreUsers/{su.UserId}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }

    [Fact]
    public async Task Create_as_store_user_with_users_feature_returns_400_guard()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: 72);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login).PostAsJsonAsync("/api/v1/StoreUsers", new
            {
                StoreId = su.StoreId, Login = $"x-{Guid.NewGuid():N}@test.com", Password = "Password123",
                FullName = "X", CellPhone = "0", Email = (string?)null, RoleIds = new[] { StoreUserRoleId }
            });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }
}
```

- [ ] Run `--filter ~StoreUsersGuardTests`.
- [ ] **Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS.
- [ ] **Checkpoint** — `test(webapi): storeusers handler-guard e2e`.

---

## Self-Review

- **Endpoint coverage:** list ✓ (super + owner), get-by-id ✓ (happy + UserNotFound + empty-guid), create ✓
  (integration DB), create validation ✓ (8 rules), double-gate guard ✓ (all 3 endpoints → 400). 16 tests.
- **Verified facts baked in:** validation=400 with validator-key codes; handler guard=real 400
  (`ApiException`); create persists User+StoreUser+UserRole; SuperAdmin actor bypasses both gates.
- **Helpers reused, not redefined:** all from `04`/`05`; no new helper class.
- **Open confirmations (flagged inline):** `StoreUserId` id-semantics; `RoleNotFound` NPE-vs-false.
- **Supersedes** the single-file `07_...-suite.md` (removed).
