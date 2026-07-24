# 08 — SMCA.WebApi Owners E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `08` test-plan: the 5 `OwnersController` endpoints, exhaustively,
> including the per-endpoint handler hard-gates and the delete-500 bug-pin.

**Goal:** Implement, against real Postgres via `dotnet test`, the Owners endpoint behavior, all validators,
the ReSeller-exclusion delete gate, and the delete-500 bug.

**Reuses (do NOT redefine):** `04`/`05` harness — `DbTestHelpers.{SeedSuperAdminAsync, SeedUserWithRoleAsync,
AuthedClient, CleanupUserAsync, GetUserByLoginAsync, CleanupTenantCascadeAsync}`, `StoreSeed.{SeedOwnerAsync,
CleanupOwnerAsync}`. No new helper class.

**Actor strategy:** default = SuperAdmin (bypasses the filter + passes every handler gate). ReSeller actor =
`SeedUserWithRoleAsync((int)RoleType.ReSeller)`.

## Global Constraints (verified — `08` test-plan §2)

- All failures are **thrown → real HTTP status** (not 200-wrapped). **Validation failure = 400 with
  `Errors[].Code` = the PROPERTY NAME** (`ValidationException` builds `new Error(PropertyName, ErrorMessage)`;
  the message key like `OwnerNotFound` lives in the `Description`). Handler hard-gate = 400 (`ApiException`).
- Handler gates: List/Create/Update → `SuperAdmin || ReSeller`; Delete → `SuperAdmin || OwnerAdmin`
  (excludes ReSeller); GetById → no handler gate.
- `CreateOwnerService` creates a NEW `Tenant` + `User` + `Owner` + `UserRole(OwnerAdmin)`
  (`CreateOwnerService.cs:35-46`) → clean up with `CleanupTenantCascadeAsync(newTenantId)`.
- **DELETE always 500** (`_storeUserRepository` never injected — `DeleteOwnerCommand.cs:26,74`).
- Command fields: `CreateOwnerCommand(Login, Password, FullName, Cellphone, ReSellerId?, Email?, Description?)`;
  `UpdateOwnerCommand{Id, ReSellerId?, FullName, CellPhone, Email?, Description, Guest, IsActive}`.
- Human runs ALL git. Every Checkpoint is a PAUSE.

## File Structure

- Create: `Owners/OwnersListTests.cs`, `OwnersGetByIdTests.cs`, `OwnersCreateTests.cs`,
  `OwnersCreateValidationTests.cs`, `OwnersUpdateTests.cs`, `OwnersDeleteTests.cs`,
  `OwnersCreateGapTests.cs`, `OwnersUpdateGapTests.cs`, `OwnersListGapTests.cs`.

---

## Task 1: `OwnersListTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersListTests
{
    private readonly AppTestFactory _f;
    public OwnersListTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_owners_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Owners/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // ReSeller passes the controller filter (Owners feature via the ReSeller allowed-features branch)
    // and the handler gate (SuperAdmin || ReSeller). ReSeller-scoped result may be empty -> still 200.
    [Fact]
    public async Task List_owners_as_reseller_returns_200()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.ReSeller);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/Owners/all/false");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}
```

- [ ] Run `--filter ~OwnersListTests`. **Checkpoint** — `test(webapi): owners list e2e`.

---

## Task 2: `OwnersGetByIdTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersGetByIdTests
{
    private readonly AppTestFactory _f;
    public OwnersGetByIdTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Get_owner_by_id_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/Owners/{owner.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Get_owner_by_id_nonexistent_returns_400_OwnerNotFound()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/Owners/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "OwnerId");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Get_owner_by_id_empty_guid_returns_400_IsRequired()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/Owners/{Guid.Empty}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "OwnerId");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~OwnersGetByIdTests`. **Checkpoint** — `test(webapi): owners get-by-id e2e`.

---

## Task 3: `OwnersCreateTests` (integration: DB)

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersCreateTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Create_owner_persists_tenant_user_owner_and_role()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var newLogin = $"owner-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/Owners", new
            {
                Login = newLogin, Password = "Password123", FullName = "E2E Owner",
                Cellphone = "0000000000", ReSellerId = (Guid?)null, Email = (string?)null, Description = "e2e"
            });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();

            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            created.Should().NotBeNull();
            newTenantId = created!.TenantId;   // CreateOwnerService creates a NEW tenant

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters()
                .AnyAsync(o => o.UserId == created.Id)).Should().BeTrue();
            (await db.Set<Domain.Entities.UserRoles.UserRole>().IgnoreQueryFilters()
                .AnyAsync(x => x.UserId == created.Id && x.RoleId == (int)Domain.Common.Enums.RoleType.OwnerAdmin)).Should().BeTrue();
        }
        finally
        {
            if (newTenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, newTenantId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }
}
```

- [ ] Run `--filter ~OwnersCreateTests`. **Checkpoint** — `test(webapi): owners create e2e`.

---

## Task 4: `OwnersCreateValidationTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersCreateValidationTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateValidationTests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task Assert400(object body, string code)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/Owners", body);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    private static object Valid(string? login = null, string password = "Password123", string fullName = "E2E Owner",
        string cellphone = "0000000000", Guid? reSellerId = null, string? email = null) => new
    {
        Login = login ?? $"o-{Guid.NewGuid():N}@test.com", Password = password, FullName = fullName,
        Cellphone = cellphone, ReSellerId = reSellerId, Email = email, Description = "e2e"
    };

    [Fact] public Task Create_empty_login_400_Login() => Assert400(Valid(login: ""), "Login");
    [Fact] public Task Create_empty_password_400_Password() => Assert400(Valid(password: ""), "Password");
    [Fact] public Task Create_empty_fullname_400_FullName() => Assert400(Valid(fullName: ""), "FullName");
    [Fact] public Task Create_empty_cellphone_400_Cellphone() => Assert400(Valid(cellphone: ""), "Cellphone");
    [Fact] public Task Create_invalid_email_400_Email() => Assert400(Valid(email: "not-an-email"), "Email");
    [Fact] public Task Create_nonexistent_reseller_400_ReSellerId() => Assert400(Valid(reSellerId: Guid.NewGuid()), "ReSellerId");

    // Duplicate login -> IsUniqueName -> Code == "Login" (same property as empty-login; distinguished by input).
    [Fact]
    public async Task Create_duplicate_login_400_Login()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var existing = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/Owners",
                new { Login = existing.Login, Password = "Password123", FullName = "Dup", Cellphone = "0",
                      ReSellerId = (Guid?)null, Email = (string?)null, Description = "e2e" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Login");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, existing.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~OwnersCreateValidationTests`. **Checkpoint** — `test(webapi): owners create validation e2e`.

---

## Task 5: `OwnersUpdateTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersUpdateTests
{
    private readonly AppTestFactory _f;
    public OwnersUpdateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(string fullName = "Updated Owner", string cellPhone = "1112223333",
        string? email = null, bool isActive = true) => new
    {
        ReSellerId = (Guid?)null, FullName = fullName, CellPhone = cellPhone,
        Email = email, Description = "upd", Guest = false, IsActive = isActive
    };

    [Fact]
    public async Task Update_owner_persists_fullname_and_isactive()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(fullName: "Updated Owner", isActive: false));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters().FirstAsync(u => u.Id == owner.UserId))
                .FullName.Should().Be("Updated Owner");
            (await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters().FirstAsync(o => o.Id == owner.OwnerId))
                .IsActive.Should().BeFalse();
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_owner_nonexistent_id_returns_400_Id()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/Owners/{Guid.NewGuid()}", Body());
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_owner_empty_fullname_returns_400_FullName()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(fullName: ""));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "FullName");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_owner_invalid_email_returns_400_Email()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(email: "not-an-email"));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Email");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~OwnersUpdateTests`. **Checkpoint** — `test(webapi): owners update e2e`.

---

## Task 6: `OwnersDeleteTests` (bug-pin + guard)

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersDeleteTests
{
    private readonly AppTestFactory _f;
    public OwnersDeleteTests(WebAppFixture fixture) => _f = fixture.Factory;

    // PIN BUG: DeleteOwnerCommandHandler._storeUserRepository is declared but never injected -> NRE -> 500
    // on any authorized valid delete. Update when the injection is fixed.
    [Fact]
    public async Task Delete_owner_currently_returns_500()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/Owners/{owner.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Delete_owner_nonexistent_id_returns_400_Id()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/Owners/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // The delete gate is SuperAdmin || OwnerAdmin — a ReSeller (allowed on list/create/update) is rejected
    // by the handler with a real 400 (fires before the null-repo crash).
    [Fact]
    public async Task Delete_owner_as_reseller_returns_400_guard()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.ReSeller);
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).DeleteAsync($"/api/v1/Owners/{owner.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}
```

- [ ] Run `--filter ~OwnersDeleteTests`.
- [ ] **Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS.
- [ ] **Checkpoint** — `test(webapi): owners delete (bug-pin + reseller-guard) e2e`.

---

## Task 7: `OwnersCreateGapTests` (scenario gap)

> Verified: the create handler gate is `SuperAdmin || ReSeller` — a ReSeller actor can create (200).

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersCreateGapTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // The create handler gate is SuperAdmin || ReSeller — a ReSeller actor can create an owner.
    [Fact]
    public async Task Create_owner_as_reseller_returns_200()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.ReSeller);
        var newLogin = $"owner-{Guid.NewGuid():N}@test.com";
        Guid newTenantId = Guid.Empty;
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).PostAsJsonAsync("/api/v1/Owners", new
            {
                Login = newLogin, Password = "Password123", FullName = "E2E Owner",
                Cellphone = "0000000000", ReSellerId = (Guid?)null, Email = (string?)null, Description = "e2e"
            });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var created = await DbTestHelpers.GetUserByLoginAsync(_f, newLogin);
            if (created is not null) newTenantId = created.TenantId;
        }
        finally
        {
            if (newTenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, newTenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }
}
```

- [ ] Run `--filter ~OwnersCreateGapTests`. **Checkpoint** — `test(webapi): owners create gap (reseller) e2e`.

---

## Task 8: `OwnersUpdateGapTests` (scenario gaps)

> Verified: `UpdateOwnerCommandValidator` `CellPhone` `NotNull/NotEmpty` → `Code=="CellPhone"`;
> `When(ReSellerId.HasValue)` `ReSellerExists` → `Code=="ReSellerId"`.

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersUpdateGapTests
{
    private readonly AppTestFactory _f;
    public OwnersUpdateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(string fullName = "Upd", string cellPhone = "1112223333",
        Guid? reSellerId = null, string? email = null) => new
    {
        ReSellerId = reSellerId, FullName = fullName, CellPhone = cellPhone,
        Email = email, Description = "upd", Guest = false, IsActive = true
    };

    [Fact]
    public async Task Update_owner_empty_cellphone_returns_400_CellPhone()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(cellPhone: ""));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "CellPhone");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_owner_nonexistent_reseller_returns_400_ReSellerId()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(reSellerId: Guid.NewGuid()));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "ReSellerId");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~OwnersUpdateGapTests`. **Checkpoint** — `test(webapi): owners update gap (cellphone + reseller) e2e`.

---

## Task 9: `OwnersListGapTests` (scenario gaps)

> Verified: `GetAllOwnersIncludingStoreModulesAsync(includeInactive)` filters `Where(o => includeInactive || o.IsActive)`
> on the Owner entity — `false` excludes `Owner.IsActive==false`. `OwnerDto` exposes `Id` + `IsActive` — match a row by `Id`.

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersListGapTests
{
    private readonly AppTestFactory _f;
    public OwnersListGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed class OwnerRow { public Guid Id { get; set; } public bool IsActive { get; set; } }

    private async Task DeactivateOwnerAsync(Guid ownerId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var o = await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters().FirstAsync(x => x.Id == ownerId);
        o.IsActive = false;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task List_owners_includeInactive_true_includes_inactive_owner()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        await DeactivateOwnerAsync(owner.OwnerId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Owners/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<OwnerRow>>>(ApiResponse.Json);
            b!.Data!.Should().Contain(o => o.Id == owner.OwnerId && !o.IsActive);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_owners_includeInactive_false_excludes_inactive_owner()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        await DeactivateOwnerAsync(owner.OwnerId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Owners/all/false");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<OwnerRow>>>(ApiResponse.Json);
            b!.Data!.Should().NotContain(o => o.Id == owner.OwnerId);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~OwnersListGapTests`.
- [ ] **Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS.
- [ ] **Checkpoint** — `test(webapi): owners list gap (includeInactive) e2e`.

---

## Self-Review

- **Endpoint coverage:** list ✓ (super + reseller), get-by-id ✓ (happy + OwnerId nonexistent/empty), create ✓
  (integration DB on the new tenant graph), create validation ✓ (Login/Password/FullName/Cellphone/Email/
  ReSellerId + duplicate-login), update ✓ (persist + Id/FullName/Email validation), delete ✓ (**500 bug-pin**
  + Id nonexistent + **ReSeller-guard 400**). Plus scenario-gap classes: create-as-ReSeller (Task 7),
  update empty-CellPhone + nonexistent-ReSellerId (Task 8), list includeInactive true/false (Task 9). 22 tests.
- **Validation codes = PROPERTY NAMES** (`Login`, `Password`, `FullName`, `Cellphone`, `Email`, `ReSellerId`,
  `OwnerId`, `Id`) — per `ValidationException` mapping. NOT message keys.
- **Handler-gate inconsistency covered:** ReSeller allowed on list/create/update but 400 on delete.
- **Helpers reused, not redefined:** all from `04`/`05`; `CleanupTenantCascadeAsync` for the create's new tenant.
- **Bug pin:** delete-500 (Task 6), note "update when the injection is fixed".
- **Not asserted (by design):** the generic 403 matrix (`05`); the 4 minor findings (missing resx key,
  misplaced `OwnerErrors`, handler null-checks masked by validators, redundant validator assignment).
