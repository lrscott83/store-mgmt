# 07 — SMCA.WebApi StoreUsers E2E — Test Suite

**Date:** 2026-07-23
**Scope:** all 3 endpoints of `StoreUsersController` (`api/v1/StoreUsers`) — none are covered by plans
`01`–`06` (verified: StoreUsers appears there only as cleanup/seed-helper/cross-reference, never as an
endpoint test). Generated via the `api-endpoint-tests` workflow.
**Depends on / reuses:** the `04`/`05` harness (`AppTestFactory`, `WebAppFixture`, `ApiResponse<T>`,
`DbTestHelpers`, `StoreSeed`, `AuthzSeed`) against real Postgres `smca_test`.

---

## What the controller does + dependencies

`StoreUsersController` (`api/v1/StoreUsers`) — class-level `[HasPermission(StoreRoleFeatures.UsersAdmin)]`,
and **every handler additionally hard-gates on `IsSuperAdminOrOwnerAdmin`** → throws
`ApiException(..., BadRequest)` (real **400**) for any other caller.

- **Dependencies:** real Postgres (`smca_test`), MediatR handlers, `IVisibleRoleService`. No mocks — full
  e2e through the real pipeline.
- **Contract facts (verified):** controllers `return Ok(...)` → HTTP 200 unless a handler/pipeline throws;
  validation failure = **HTTP 400** (`ValidationException` → `ErrorHandlerMiddleware`), `Errors[].code` =
  validator key (`IsRequired`, `UserNotFound`, `StoreNotFound`, `UserAlreadyExists`, `EmailFormatInvalid`,
  `RoleNotFound`); non-admin handler guard = **real 400** (`ApiException`).
- **Actor:** SuperAdmin (bypasses the `[HasPermission]` gate and the `IsSuperAdminOrOwnerAdmin` handler
  guard) — cheapest seeding. Create needs a seeded `Store` and a visible `RoleId` (`StoreUser=3`).

Endpoints:
| Verb + route | Query/Command | Notes |
|---|---|---|
| `GET StoreUsers/list/{includeInactive}` | `GetStoreUsersQuery(bool)` | no validator; SuperAdmin all / OwnerAdmin store-scoped |
| `GET StoreUsers/{id}` | `GetStoreUserByIdQuery(Guid StoreUserId)` | validator `IsRequired` + `UserExists`→`UserNotFound` |
| `POST StoreUsers` | `CreateStoreUserCommand(StoreId, Login, Password, FullName, CellPhone?, Email?, RoleIds)` | validators below; persists User+StoreUser+UserRole |

`CreateStoreUserCommandValidator`: `StoreId` `IsRequired`+`StoreExists`(`StoreNotFound`); `Login`
`IsRequired`+`IsUniqueName`(`UserAlreadyExists`); `Password` `IsRequired`; `FullName` `IsRequired`;
`Email` `EmailFormatInvalid` when non-empty; `RoleIds` `IsRequired`+`AreRolesVisibles`(`RoleNotFound`).

---

## `StoreUsers/StoreUsersListTests.cs`

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

---

## `StoreUsers/StoreUsersGetByIdTests.cs`

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
}
```

---

## `StoreUsers/StoreUsersCreateTests.cs` (integration: DB assertions)

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

---

## `StoreUsers/StoreUsersCreateValidationTests.cs`

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

    // Seeds a SuperAdmin + a valid store, then posts a `mutate`d body; asserts 400 + validator code.
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

    [Fact] public Task Create_empty_login_400_IsRequired()
        => Assert400(s => Valid(s, login: ""), "IsRequired");

    [Fact] public Task Create_empty_password_400_IsRequired()
        => Assert400(s => Valid(s, password: ""), "IsRequired");

    [Fact] public Task Create_empty_fullname_400_IsRequired()
        => Assert400(s => Valid(s, fullName: ""), "IsRequired");

    [Fact] public Task Create_empty_roleids_400_IsRequired()
        => Assert400(s => Valid(s, roleIds: Array.Empty<int>()), "IsRequired");

    [Fact] public Task Create_invalid_email_400_EmailFormatInvalid()
        => Assert400(s => Valid(s, email: "not-an-email"), "EmailFormatInvalid");

    [Fact] public Task Create_nonexistent_store_400_StoreNotFound()
        => Assert400(_ => Valid(Guid.NewGuid()), "StoreNotFound");

    [Fact] public Task Create_invisible_role_400_RoleNotFound()
        => Assert400(s => Valid(s, roleIds: new[] { 999999 }), "RoleNotFound");

    // Duplicate login -> IsUniqueName -> UserAlreadyExists. Needs an existing user with the same login.
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

---

## Coverage & notes

- **4 QA categories:** happy (list ×2, get-by-id, create), edge/error (get-by-id `UserNotFound`, 7 create
  validators), integration (create persists User+StoreUser+UserRole, asserted in DB). All 3 endpoints
  touched; 0 duplication with `01`–`06`.
- **Confirm before running (flagged inline — not invented):**
  1. `GetStoreUserByIdQuery.StoreUserId` semantics — `User.Id` vs `StoreUser`-entity id. If the latter,
     replace `su.UserId` with the entity id.
  2. `RoleNotFound` with `RoleId 999999` — assumes a nonexistent role fails `AreRolesVisibles`. If
     `IVisibleRoleService` NPEs on a nonexistent id instead of returning false, use an existing-but-not-
     visible role (e.g. `SuperAdmin=1` with an OwnerAdmin actor).
- **Deliberately excluded (not padded):** the double-gate edge case "a StoreUser WITH the `Users` feature
  passes `[HasPermission]` but the handler rejects with 400". It needs seeding a StoreUser with the `Users`
  feature granted — **feature id unverified**; confirm the id before adding.
- **Files:** `StoreUsers/StoreUsersListTests.cs`, `StoreUsersGetByIdTests.cs`, `StoreUsersCreateTests.cs`,
  `StoreUsersCreateValidationTests.cs`.
