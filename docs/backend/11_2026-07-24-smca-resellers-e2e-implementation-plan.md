# 11 — SMCA.WebApi ReSellers E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `11` test-plan: the 5 `ReSellersController` endpoints, exhaustively,
> including every `11c` gap scenario (`L*`/`G*`/`C*`/`U*`/`D*`) and the delete-orphan bug-pin.

**Goal:** Implement, against real Postgres via `dotnet test`, the full ReSellers CRUD behavior, all
validators, the per-endpoint SuperAdmin-only auth, and the documented edge/error/integration surface.

**Reuses (do NOT redefine):** `DbTestHelpers.{SeedSuperAdminAsync, SeedUserWithRoleAsync, AuthedClient,
CleanupUserAsync, GetUserByLoginAsync, CleanupTenantCascadeAsync, HashPassword}`, `AuthTestHelpers.BearerClient`,
`ApiResponse<T>` + `ApiResponse.Json`. Adds one new helper `ReSellerSeed` (Task 0).

**Actor strategy:** default = SuperAdmin (the only actor that passes the class filter). 403 actors =
`SeedUserWithRoleAsync((int)RoleType.{OwnerAdmin|StoreUser|ReSeller})`.

## Global Constraints (verified — `11` test-plan §2)

- All 5 endpoints `[HasPermission(SuperAdmin)]`. Validation failure → **400** with `Errors[].Code = property
  name`; no token → **401**; authenticated non-SuperAdmin → **403**; verb mismatch → **405**.
- `CreateReSellerCommand(Login, Password, FullName, Cellphone, Email?, Description?)` creates a NEW `Tenant` +
  `User` + `ReSeller` + `UserRole(ReSeller)`; `ReSeller.Create(userId, approved:false, discountPrice:0,
  percentDiscountPrice:=system default, tenantId, Description ?? "")`. Clean up with
  `ReSellerSeed.CleanupReSellerGraphByTenantAsync(newTenantId)`.
- `UpdateReSellerCommand{ Id, FullName, CellPhone, Email?, DiscountPrice, PercentDiscountPrice, Description,
  IsActive }`; route id overrides body id. Validator: `Id`+ReSellerExists, `FullName`/`CellPhone` required,
  `DiscountPrice ≥0`, `PercentDiscountPrice` in `[0,100]`, `Email` when set.
- `DeleteReSellerCommand` validator guards a nonexistent id (`400 Id`); the handler deletes **only** the
  `ReSeller` row (User + UserRole orphaned — pinned).
- `ReSellerDto{ Id, UserId, Approved, IsActive, Login, FullName, CellPhone, DiscountPrice,
  PercentDiscountPrice, Email?, Description? }`.
- Human runs ALL git. Every Checkpoint is a PAUSE.

## File Structure

- Create: `SMCA.WebApi.E2ETests/Infrastructure/ReSellerSeed.cs`
- Create under `SMCA.WebApi.E2ETests/ReSellers/`: `ReSellersListTests.cs`, `ReSellersListAuthTests.cs`,
  `ReSellersGetByIdTests.cs`, `ReSellersGetByIdAuthTests.cs`, `ReSellersCreateTests.cs`,
  `ReSellersCreateValidationTests.cs`, `ReSellersCreateAuthTests.cs`, `ReSellersUpdateTests.cs`,
  `ReSellersUpdateValidationTests.cs`, `ReSellersUpdateAuthTests.cs`, `ReSellersDeleteTests.cs`,
  `ReSellersDeleteAuthTests.cs`.

---

## Task 0: `ReSellerSeed` infra helper

```csharp
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.ReSellers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class ReSellerSeed
{
    public sealed record ReSellerFixture(Guid ReSellerId, Guid UserId, string Login);

    public static async Task<ReSellerFixture> SeedReSellerAsync(AppTestFactory factory, bool approved = false,
        bool isActive = true, float percent = 10f, float discount = 0f)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"reseller-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E ReSeller", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var reseller = ReSeller.Create(user.Id, approved, discount, percent, tenantId, "e2e reseller");
        reseller.IsActive = isActive; // IsActive is on AuditableEntity
        db.Set<ReSeller>().Add(reseller);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        await db.SaveChangesAsync();
        return new ReSellerFixture(reseller.Id, user.Id, login);
    }

    public static async Task CleanupReSellerAsync(AppTestFactory factory, Guid reSellerId, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<ReSeller>().RemoveRange(await db.Set<ReSeller>().IgnoreQueryFilters().Where(r => r.Id == reSellerId).ToListAsync());
        db.Set<UserRole>().RemoveRange(await db.Set<UserRole>().IgnoreQueryFilters().Where(x => x.UserId == userId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(u => u.Id == userId).ToListAsync());
        await db.SaveChangesAsync();
    }

    // For the Create test: removes the ReSeller row (CleanupTenantCascadeAsync misses it), then the rest.
    public static async Task CleanupReSellerGraphByTenantAsync(AppTestFactory factory, Guid tenantId)
    {
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Set<ReSeller>().RemoveRange(await db.Set<ReSeller>().IgnoreQueryFilters().Where(r => r.TenantId == tenantId).ToListAsync());
            await db.SaveChangesAsync();
        }
        await DbTestHelpers.CleanupTenantCascadeAsync(factory, tenantId);
    }
}
```

- [ ] Build the test project (helper must compile). **Checkpoint** — `test(webapi): add ReSellerSeed helper`.

---

## Task 1: `ReSellersListTests` + `ReSellersListAuthTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.ReSellers;

[Collection("e2e")]
public sealed class ReSellersListTests
{
    private readonly AppTestFactory _f;
    public ReSellersListTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed class Row { public Guid Id { get; set; } public bool IsActive { get; set; } public string Login { get; set; } = ""; }

    [Fact]
    public async Task List_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/reSellers/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json))!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_includeInactive_true_includes_inactive_reseller()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f, isActive: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/reSellers/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<Row>>>(ApiResponse.Json);
            b!.Data!.Should().Contain(x => x.Id == rs.ReSellerId && !x.IsActive);
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_includeInactive_false_excludes_inactive_reseller()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f, isActive: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/reSellers/all/false");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<Row>>>(ApiResponse.Json);
            b!.Data!.Should().NotContain(x => x.Id == rs.ReSellerId);
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // L1 VERIFY&PIN
    public async Task List_includeInactive_nonbool_returns_400_or_404()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/reSellers/all/not-a-bool");
            r.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.NotFound);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // L2
    public async Task List_items_have_dto_shape_and_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/reSellers/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<Row>>>(ApiResponse.Json);
            b!.Data!.Should().Contain(x => x.Id == rs.ReSellerId && !string.IsNullOrEmpty(x.Login));
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // L3 PIN — membership only, never sequence
    public async Task List_result_is_not_guaranteed_ordered()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var a = await ReSellerSeed.SeedReSellerAsync(_f);
        var b = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/reSellers/all/true");
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<List<Row>>>(ApiResponse.Json);
            body!.Data!.Select(x => x.Id).Should().Contain(new[] { a.ReSellerId, b.ReSellerId }); // set membership
        }
        finally
        {
            await ReSellerSeed.CleanupReSellerAsync(_f, a.ReSellerId, a.UserId);
            await ReSellerSeed.CleanupReSellerAsync(_f, b.ReSellerId, b.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    [Fact] // L4
    public async Task List_with_POST_verb_returns_405()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/reSellers/all/true", new { });
            r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}

[Collection("e2e")]
public sealed class ReSellersListAuthTests
{
    private readonly AppTestFactory _f;
    public ReSellersListAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact] public async Task List_no_token_returns_401()
    { (await _f.CreateClient().GetAsync("/api/v1/reSellers/all/true")).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    [Fact] public async Task List_malformed_token_returns_401()
    { (await AuthTestHelpers.BearerClient(_f, "not.a.valid.jwt").GetAsync("/api/v1/reSellers/all/true")).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    private async Task AssertRoleForbidden(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/reSellers/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact] public Task List_as_owner_admin_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.OwnerAdmin);
    [Fact] public Task List_as_store_user_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.StoreUser);
    [Fact] public Task List_as_reseller_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.ReSeller);
}
```

- [ ] Run `--filter ~ReSellersList`. **Checkpoint** — `test(webapi): resellers list e2e (behavior + auth + gaps)`.

---

## Task 2: `ReSellersGetByIdTests` + `ReSellersGetByIdAuthTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.ReSellers;

[Collection("e2e")]
public sealed class ReSellersGetByIdTests
{
    private readonly AppTestFactory _f;
    public ReSellersGetByIdTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed class Dto { public Guid Id { get; set; } public bool IsActive { get; set; } public string Login { get; set; } = ""; public float PercentDiscountPrice { get; set; } }

    [Fact]
    public async Task Get_by_id_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/reSellers/{rs.ReSellerId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Get_nonexistent_returns_400_ReSellerId()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/reSellers/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "ReSellerId");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Get_empty_guid_returns_400_ReSellerId()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/reSellers/{Guid.Empty}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "ReSellerId");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // G1 VERIFY&PIN
    public async Task Get_malformed_guid_returns_400_or_404()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/reSellers/not-a-guid");
            r.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.NotFound);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // G2
    public async Task Get_returned_dto_has_full_shape()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f, percent: 12.5f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/reSellers/{rs.ReSellerId}");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<Dto>>(ApiResponse.Json);
            b!.Data!.Id.Should().Be(rs.ReSellerId);
            b.Data.Login.Should().NotBeNullOrEmpty();
            b.Data.PercentDiscountPrice.Should().Be(12.5f);
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}

[Collection("e2e")]
public sealed class ReSellersGetByIdAuthTests
{
    private readonly AppTestFactory _f;
    public ReSellersGetByIdAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact] public async Task Get_no_token_returns_401()
    { (await _f.CreateClient().GetAsync($"/api/v1/reSellers/{Guid.NewGuid()}")).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    private async Task AssertRoleForbidden(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync($"/api/v1/reSellers/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden); // filter runs before the validator
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact] public Task Get_as_owner_admin_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.OwnerAdmin);
    [Fact] public Task Get_as_store_user_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.StoreUser);
    [Fact] public Task Get_as_reseller_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.ReSeller);
}
```

- [ ] Run `--filter ~ReSellersGetById`. **Checkpoint** — `test(webapi): resellers get-by-id e2e`.

---

## Task 3: `ReSellersCreateTests` + `ReSellersCreateValidationTests` + `ReSellersCreateAuthTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.ReSellers;

[Collection("e2e")]
public sealed class ReSellersCreateTests
{
    private readonly AppTestFactory _f;
    public ReSellersCreateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(string login, string? email = null, string? description = "e2e") => new
    { Login = login, Password = "Password123", FullName = "E2E ReSeller", Cellphone = "0000000000", Email = email, Description = description };

    [Fact]
    public async Task Create_persists_tenant_user_reseller_and_role()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var newLogin = $"rs-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/reSellers", Body(newLogin));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();

            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            created.Should().NotBeNull();
            newTenantId = created!.TenantId;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<ReSeller>().IgnoreQueryFilters().AnyAsync(x => x.UserId == created.Id)).Should().BeTrue();
            (await db.Set<Domain.Entities.UserRoles.UserRole>().IgnoreQueryFilters()
                .AnyAsync(x => x.UserId == created.Id && x.RoleId == (int)Domain.Common.Enums.RoleType.ReSeller)).Should().BeTrue();
        }
        finally
        {
            if (newTenantId != Guid.Empty) await ReSellerSeed.CleanupReSellerGraphByTenantAsync(_f, newTenantId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    [Fact] // C1
    public async Task Create_with_email_persists_email()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var newLogin = $"rs-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/reSellers", Body(newLogin, email: "rs@test.com"));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            newTenantId = created!.TenantId;
            created.Email.Should().Be("rs@test.com");
        }
        finally { if (newTenantId != Guid.Empty) await ReSellerSeed.CleanupReSellerGraphByTenantAsync(_f, newTenantId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // C2
    public async Task Create_with_null_description_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var newLogin = $"rs-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/reSellers", Body(newLogin, description: null));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            newTenantId = created!.TenantId;
        }
        finally { if (newTenantId != Guid.Empty) await ReSellerSeed.CleanupReSellerGraphByTenantAsync(_f, newTenantId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // C3 — default percent from SystemConfiguration + DiscountPrice 0
    public async Task Create_reseller_has_default_percent_and_zero_discount()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var newLogin = $"rs-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            float expectedPercent;
            using (var scope = _f.Services.CreateScope())
                expectedPercent = await scope.ServiceProvider.GetRequiredService<ISystemConfigurationRepository>().GetReSellerPercentDiscountPriceAsync();

            await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/reSellers", Body(newLogin));
            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            newTenantId = created!.TenantId;

            using var scope2 = _f.Services.CreateScope();
            var db = scope2.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var reseller = await db.Set<ReSeller>().IgnoreQueryFilters().FirstAsync(x => x.UserId == created.Id);
            reseller.DiscountPrice.Should().Be(0);
            reseller.PercentDiscountPrice.Should().Be(expectedPercent);
        }
        finally { if (newTenantId != Guid.Empty) await ReSellerSeed.CleanupReSellerGraphByTenantAsync(_f, newTenantId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // C4
    public async Task Create_stored_password_is_hashed()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var newLogin = $"rs-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/reSellers", Body(newLogin));
            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            newTenantId = created!.TenantId;
            created.Password.Should().NotBe("Password123");
        }
        finally { if (newTenantId != Guid.Empty) await ReSellerSeed.CleanupReSellerGraphByTenantAsync(_f, newTenantId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}

[Collection("e2e")]
public sealed class ReSellersCreateValidationTests
{
    private readonly AppTestFactory _f;
    public ReSellersCreateValidationTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Valid(string? login = null, string password = "Password123", string fullName = "E2E RS",
        string cellphone = "0000000000", string? email = null) => new
    { Login = login ?? $"rs-{Guid.NewGuid():N}@test.com", Password = password, FullName = fullName, Cellphone = cellphone, Email = email, Description = "e2e" };

    private async Task Assert400(object body, string code)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/reSellers", body);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] public Task Create_empty_login_400_Login() => Assert400(Valid(login: ""), "Login");
    [Fact] public Task Create_empty_password_400_Password() => Assert400(Valid(password: ""), "Password");
    [Fact] public Task Create_empty_fullname_400_FullName() => Assert400(Valid(fullName: ""), "FullName");
    [Fact] public Task Create_empty_cellphone_400_Cellphone() => Assert400(Valid(cellphone: ""), "Cellphone");
    [Fact] public Task Create_invalid_email_400_Email() => Assert400(Valid(email: "not-an-email"), "Email");

    [Fact]
    public async Task Create_duplicate_login_400_Login()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var existing = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/reSellers", Valid(login: existing.Login));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json))!.Errors.Should().Contain(e => e.Code == "Login");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, existing.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}

[Collection("e2e")]
public sealed class ReSellersCreateAuthTests
{
    private readonly AppTestFactory _f;
    public ReSellersCreateAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body() => new { Login = $"rs-{Guid.NewGuid():N}@test.com", Password = "Password123", FullName = "X", Cellphone = "0", Email = (string?)null, Description = "e2e" };

    [Fact] public async Task Create_no_token_returns_401()
    { (await _f.CreateClient().PostAsJsonAsync("/api/v1/reSellers", Body())).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    private async Task AssertRoleForbidden(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).PostAsJsonAsync("/api/v1/reSellers", Body());
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact] public Task Create_as_owner_admin_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.OwnerAdmin);
    [Fact] public Task Create_as_store_user_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.StoreUser);
    [Fact] public Task Create_as_reseller_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.ReSeller);
}
```

- [ ] Run `--filter ~ReSellersCreate`. **Checkpoint** — `test(webapi): resellers create e2e (behavior + validation + auth)`.

---

## Task 4: `ReSellersUpdateTests` + `ReSellersUpdateValidationTests` + `ReSellersUpdateAuthTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.ReSellers;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.ReSellers;

[Collection("e2e")]
public sealed class ReSellersUpdateTests
{
    private readonly AppTestFactory _f;
    public ReSellersUpdateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(string fullName = "Updated", string cellPhone = "111", string? email = null,
        float discount = 5f, float percent = 10f, bool isActive = true, Guid? bodyId = null) => new
    { Id = bodyId ?? Guid.NewGuid(), FullName = fullName, CellPhone = cellPhone, Email = email,
      DiscountPrice = discount, PercentDiscountPrice = percent, Description = "upd", IsActive = isActive };

    private async Task<(Guid admin, string login)> AdminAsync()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        return (await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123"), login);
    }

    [Fact]
    public async Task Update_persists_fullname_isactive_and_discounts()
    {
        var (admin, login) = await AdminAsync();
        var rs = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/reSellers/{rs.ReSellerId}", Body(fullName: "New Name", discount: 7f, percent: 20f, isActive: false));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var reseller = await db.Set<ReSeller>().IgnoreQueryFilters().Include(x => x.User).FirstAsync(x => x.Id == rs.ReSellerId);
            reseller.User.FullName.Should().Be("New Name");
            reseller.DiscountPrice.Should().Be(7f);
            reseller.PercentDiscountPrice.Should().Be(20f);
            reseller.IsActive.Should().BeFalse();
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // U1 boundary 100
    public async Task Update_percent_100_boundary_returns_200() => await OkWith(percent: 100f);
    [Fact] // U2 zero boundaries
    public async Task Update_zero_boundaries_returns_200() => await OkWith(discount: 0f, percent: 0f);
    [Fact] // U4 no upper bound on DiscountPrice
    public async Task Update_large_discount_returns_200() => await OkWith(discount: 999999f);
    [Fact] // U5 email null
    public async Task Update_email_null_returns_200() => await OkWith(email: null);

    private async Task OkWith(float discount = 5f, float percent = 10f, string? email = null)
    {
        var (admin, login) = await AdminAsync();
        var rs = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/reSellers/{rs.ReSellerId}", Body(discount: discount, percent: percent, email: email));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // U6 PIN — route id overrides body id
    public async Task Update_route_id_overrides_body_id()
    {
        var (admin, login) = await AdminAsync();
        var a = await ReSellerSeed.SeedReSellerAsync(_f);
        var b = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            // route = A, body.Id = B -> A must be updated, B untouched
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/reSellers/{a.ReSellerId}", Body(fullName: "RouteWins", bodyId: b.ReSellerId));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<ReSeller>().IgnoreQueryFilters().Include(x => x.User).FirstAsync(x => x.Id == a.ReSellerId)).User.FullName.Should().Be("RouteWins");
            (await db.Set<ReSeller>().IgnoreQueryFilters().Include(x => x.User).FirstAsync(x => x.Id == b.ReSellerId)).User.FullName.Should().NotBe("RouteWins");
        }
        finally
        {
            await ReSellerSeed.CleanupReSellerAsync(_f, a.ReSellerId, a.UserId);
            await ReSellerSeed.CleanupReSellerAsync(_f, b.ReSellerId, b.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }
}

[Collection("e2e")]
public sealed class ReSellersUpdateValidationTests
{
    private readonly AppTestFactory _f;
    public ReSellersUpdateValidationTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(string fullName = "Upd", string cellPhone = "111", string? email = null,
        float discount = 5f, float percent = 10f) => new
    { FullName = fullName, CellPhone = cellPhone, Email = email, DiscountPrice = discount,
      PercentDiscountPrice = percent, Description = "upd", IsActive = true };

    // Validates against a REAL seeded reseller (so only the field under test fails), except id-shape cases.
    private async Task Assert400OnSeeded(object body, string code)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/reSellers/{rs.ReSellerId}", body);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json))!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    private async Task Assert400OnId(Guid routeId, string code)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/reSellers/{routeId}", Body());
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json))!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] public Task Update_nonexistent_id_400_Id() => Assert400OnId(Guid.NewGuid(), "Id");
    [Fact] public Task Update_empty_guid_id_400_Id() => Assert400OnId(Guid.Empty, "Id"); // U7
    [Fact] public Task Update_empty_fullname_400_FullName() => Assert400OnSeeded(Body(fullName: ""), "FullName");
    [Fact] public Task Update_empty_cellphone_400_CellPhone() => Assert400OnSeeded(Body(cellPhone: ""), "CellPhone");
    [Fact] public Task Update_invalid_email_400_Email() => Assert400OnSeeded(Body(email: "not-an-email"), "Email");
    [Fact] public Task Update_discount_negative_400_DiscountPrice() => Assert400OnSeeded(Body(discount: -1f), "DiscountPrice");
    [Fact] public Task Update_percent_over_100_400_PercentDiscountPrice() => Assert400OnSeeded(Body(percent: 101f), "PercentDiscountPrice");
    [Fact] public Task Update_percent_negative_400_PercentDiscountPrice() => Assert400OnSeeded(Body(percent: -1f), "PercentDiscountPrice"); // U3
}

[Collection("e2e")]
public sealed class ReSellersUpdateAuthTests
{
    private readonly AppTestFactory _f;
    public ReSellersUpdateAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body() => new { FullName = "X", CellPhone = "1", Email = (string?)null, DiscountPrice = 1f, PercentDiscountPrice = 1f, Description = "u", IsActive = true };

    [Fact] public async Task Update_no_token_returns_401()
    { (await _f.CreateClient().PutAsJsonAsync($"/api/v1/reSellers/{Guid.NewGuid()}", Body())).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    private async Task AssertRoleForbidden(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).PutAsJsonAsync($"/api/v1/reSellers/{Guid.NewGuid()}", Body());
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact] public Task Update_as_owner_admin_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.OwnerAdmin);
    [Fact] public Task Update_as_store_user_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.StoreUser);
    [Fact] public Task Update_as_reseller_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.ReSeller);
}
```

- [ ] Run `--filter ~ReSellersUpdate`. **Checkpoint** — `test(webapi): resellers update e2e (behavior + validation + auth)`.

---

## Task 5: `ReSellersDeleteTests` + `ReSellersDeleteAuthTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.ReSellers;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.ReSellers;

[Collection("e2e")]
public sealed class ReSellersDeleteTests
{
    private readonly AppTestFactory _f;
    public ReSellersDeleteTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Delete_reseller_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/reSellers/{rs.ReSellerId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<ReSeller>().IgnoreQueryFilters().AnyAsync(x => x.Id == rs.ReSellerId)).Should().BeFalse();
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // D1 BUG-REVEAL — delete leaves the User + UserRole orphaned
    public async Task Delete_orphans_user_and_userrole()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            (await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/reSellers/{rs.ReSellerId}")).StatusCode.Should().Be(HttpStatusCode.OK);
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters().AnyAsync(u => u.Id == rs.UserId)).Should().BeTrue();
            (await db.Set<Domain.Entities.UserRoles.UserRole>().IgnoreQueryFilters().AnyAsync(x => x.UserId == rs.UserId)).Should().BeTrue();
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] // D2
    public async Task Delete_twice_second_returns_400_Id()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var rs = await ReSellerSeed.SeedReSellerAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, admin, login);
            (await client.DeleteAsync($"/api/v1/reSellers/{rs.ReSellerId}")).StatusCode.Should().Be(HttpStatusCode.OK);
            var second = await client.DeleteAsync($"/api/v1/reSellers/{rs.ReSellerId}");
            second.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await second.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json))!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await ReSellerSeed.CleanupReSellerAsync(_f, rs.ReSellerId, rs.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact] public async Task Delete_nonexistent_returns_400_Id() => await Assert400OnId(Guid.NewGuid());
    [Fact] public async Task Delete_empty_guid_returns_400_Id() => await Assert400OnId(Guid.Empty); // D3

    private async Task Assert400OnId(Guid id)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/reSellers/{id}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json))!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}

[Collection("e2e")]
public sealed class ReSellersDeleteAuthTests
{
    private readonly AppTestFactory _f;
    public ReSellersDeleteAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact] public async Task Delete_no_token_returns_401()
    { (await _f.CreateClient().DeleteAsync($"/api/v1/reSellers/{Guid.NewGuid()}")).StatusCode.Should().Be(HttpStatusCode.Unauthorized); }

    private async Task AssertRoleForbidden(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).DeleteAsync($"/api/v1/reSellers/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact] public Task Delete_as_owner_admin_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.OwnerAdmin);
    [Fact] public Task Delete_as_store_user_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.StoreUser);
    [Fact] public Task Delete_as_reseller_returns_403() => AssertRoleForbidden((int)Domain.Common.Enums.RoleType.ReSeller);
}
```

- [ ] Run `--filter ~ReSellersDelete`.
- [ ] **Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS.
- [ ] **Checkpoint** — `test(webapi): resellers delete e2e (behavior + orphan-pin + auth)`.

---

## Self-Review

- **Coverage — 45 tests across 12 classes, nothing dropped:** List 7 + ListAuth 5; GetById 5 + GetByIdAuth 4;
  Create 5 + CreateValidation 6 + CreateAuth 4; Update 6 + UpdateValidation 8 + UpdateAuth 4; Delete 5 +
  DeleteAuth 4. All `11c` gap ids (`L1-L4, G1-G2, C1-C4, U1-U7, D1-D3`) folded in.
- **Bug-pin:** `Delete_orphans_user_and_userrole` (D1) — update if the handler is later made to cascade.
- **VERIFY&PIN:** `List_includeInactive_nonbool_returns_400_or_404` (L1), `Get_malformed_guid_returns_400_or_404`
  (G1) — `BeOneOf(400,404)`; pin the actual pipeline status.
- **Validation codes = property names** (`Login`, `Password`, `FullName`, `Cellphone`/`CellPhone`, `Email`,
  `DiscountPrice`, `PercentDiscountPrice`, `Id`, `ReSellerId`) — per the house `ValidationException` mapping.
- **New helper reused, not redefined:** `ReSellerSeed` (Task 0); Create uses `CleanupReSellerGraphByTenantAsync`
  because `CleanupTenantCascadeAsync` alone leaks the `ReSeller` row.
- **Dead-gates (documented, not asserted):** GetAll/Create/Delete `IsSuperAdmin` + Update `||IsReSeller` —
  unreachable via e2e (class filter is SuperAdmin), per test-plan §5.
