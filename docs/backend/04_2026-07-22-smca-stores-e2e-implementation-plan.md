# SMCA.WebApi `/stores` E2E — Implementation Plan (self-contained, complete)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. This is the COMPLETE stores e2e suite — every in-scope endpoint, every validation
> failure, the full authorization matrix for the Stores controller, and cross-tenant visibility.

**Goal:** Implement the full e2e suite for the 6 in-scope `StoresController` endpoints
(`04_...-test-plan.md`), executable against a real Postgres via `dotnet test`.

**Self-contained:** Does not assume the auth `01`/`02` harness is on disk. `Task 0` bootstraps the whole
`SMCA.WebApi.E2ETests` project. If it already exists, skip present files and add only what's new.

**Architecture:** In-process `WebApplicationFactory<Program>` boots the real API against `smca_test`
Postgres (migrations applied → seed data: Roles 1-4, Modules 1-7, Features, SystemConfiguration,
DefaultTenant/DefaultStore). Authorization is DB-live (JWT carries only userId+login;
`ClaimsTransformerService` recomputes permissions per request from the DB).

**Tech Stack:** .NET 8, xUnit 2.4, FluentAssertions 6.12, `Microsoft.AspNetCore.Mvc.Testing`,
EF Core 8 + Npgsql, Postgres.

## Global Constraints

- Target `net8.0`. Test DB `smca_test` ONLY, via config (not Docker).
- `ResponseResult<T>` serializes camelCase: `{ succeeded, data, errors:[{code,description}], actionCode, message }`.
- Password hash = `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(raw)))`.
- Verified entity factories (`Domain.Entities.*`, constants `Domain.Common.*`):
  - `User.Create(login, password, fullName, cellPhone, email, tenantId)` — IsActive default true; `SelectedStoreId` settable.
  - `UserRole.Create(userId, roleId, tenantId)` — IsActive default true.
  - `Owner.Create(userId, guest, tenantId, description)`.
  - `Store.Create(name, ownerId, approved, tenantId, paymentStartDate /*DateOnly*/, address=null, description=null)` — Id auto-generated; capture after Create.
  - `StoreModule.Create(storeId, moduleId, price, modulePriceIncluded, modulePrice, moduleDiscountPrice, modulePercentDiscountPrice, tenantId)`.
  - `StoreRoleFeature.Create(storeId, roleId, featureId, tenantId)`.
  - `Tenant.Create(name, description, createdDate /*DateTimeOffset*/, connectionString=null)`.
  - `RoleType`: SuperAdmin=1, OwnerAdmin=2, StoreUser=3, ReSeller=4. `DataUtils.DefaultTenant.Id = B58BF718-C4ED-4EE9-A958-BB5A5DB4F7E8`, `DataUtils.DefaultStore.Id = 0ED24A91-6748-4F04-8902-7981A0CA79E0`.
  - **Valid test `ModuleId` = 7** (Management). An **invalid/not-available** ModuleId for negative tests = `999999`.
- Seed store fixtures under `DefaultTenant.Id` (SuperAdmin `IgnoreQueryFilters` path + Store query filter resolve them). Fine-grained cleanup (never a DefaultTenant cascade).
- **Contract facts (verified):**
  - Permission failure → **HTTP 403** (`ForbidResult`); no token → **HTTP 401**.
  - Every validator failure → **HTTP 400**, `errors[].code` = the **FluentValidation property name**
    (`"Id"`, `"Name"`, `"OwnerId"`, `"ModuleIds"`), description localized. **No `Store.NotFound` code exists.**
  - UpdateStore name-collision → `throw new ValidationException(string)` → HTTP 400 with **empty `errors[]`** (status-only).
  - Update/Approve/Disapprove never return Failure → `Success(saveChanges>0)`; no-op → 200 `succeeded=true, data=false`.
  - PUT route `{id}` is authoritative (body `Id` discarded).
  - UpdateStore SuperAdmin without `PaymentStartDate` → `ApiException("UserNotFound", 400)`.
  - UpdateStore writes `Name`/`Address` always; `Description`/`Approved`/`IsActive`/`PaymentStartDate` only if SuperAdmin.
  - `StoreRoleFeatures.SuperAdmin` has no feature → approve/disapprove are unconditionally SuperAdmin-only (OwnerAdmin/StoresAdmin → 403).
- Per project policy the human runs ALL git commands. Every "Checkpoint" is a PAUSE — ask the user to commit.

---

## File Structure

Task 0 (harness — skip any that already exist):
- `SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`, `appsettings.Tests.json`
- `Infrastructure/AppTestFactory.cs`, `WebAppFixture.cs`, `ApiResponse.cs`, `TestDtos.cs`, `DbTestHelpers.cs`, `StoreSeed.cs`
- `Stores/StoresHarnessSmokeTests.cs`
- Modify `SMCA.WebApi/Program.cs` (append `public partial class Program {}`), `SMCA.sln` (add project).

Endpoint + authorization tasks:
- `Stores/StoresByCurrentUserTests.cs` (Task 1)
- `Stores/StoreGetByIdTests.cs` (Task 2)
- `Stores/StoreCreateTests.cs` (Task 3)
- `Stores/StoreUpdateTests.cs` (Task 4)
- `Stores/StoreApproveTests.cs` (Task 5)
- `Stores/StoreDisapproveTests.cs` (Task 6)
- `Stores/StoreAuthorizationTests.cs` (Task 7 — OwnerAdmin class-vs-method + field-drop)
- `Stores/StoreRoleAccessTests.cs` (Task 8 — StoreUser/ReSeller → 403)

---

## Task 0: Bootstrap harness + seeding + smoke

- [ ] **Step 1: `SMCA.WebApi.E2ETests.csproj`**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" Version="8.0.1" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.6.0" />
    <PackageReference Include="xunit" Version="2.4.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.4.5">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
    <PackageReference Include="FluentAssertions" Version="6.12.0" />
    <PackageReference Include="coverlet.collector" Version="6.0.0">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\SMCA.WebApi\SMCA.WebApi.csproj" />
    <ProjectReference Include="..\Infrastructure\Infrastructure.csproj" />
    <ProjectReference Include="..\Application\Application.csproj" />
    <ProjectReference Include="..\Domain\Domain.csproj" />
  </ItemGroup>
  <ItemGroup>
    <None Update="appsettings.Tests.json"><CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory></None>
  </ItemGroup>
</Project>
```

- [ ] **Step 2: `appsettings.Tests.json`**

```json
{
  "ConnectionStrings": {
    "Application": "Host=127.0.0.1;Port=5432;Database=smca_test;Username=postgres;Password=postgres;Persist Security Info=True;Include Error Detail=True"
  }
}
```

- [ ] **Step 3:** Append to `SMCA.WebApi/Program.cs`: `public partial class Program { }`

- [ ] **Step 4: `Infrastructure/AppTestFactory.cs`**

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public sealed class AppTestFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) =>
            config.AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.Tests.json"),
                optional: false, reloadOnChange: false));
    }
}
```

- [ ] **Step 5: `Infrastructure/WebAppFixture.cs`**

```csharp
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public sealed class WebAppFixture : IAsyncLifetime
{
    public AppTestFactory Factory { get; private set; } = default!;

    public async Task InitializeAsync()
    {
        Factory = new AppTestFactory();
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();
    }

    public Task DisposeAsync() { Factory.Dispose(); return Task.CompletedTask; }
}

[CollectionDefinition("e2e")]
public sealed class E2ECollection : ICollectionFixture<WebAppFixture>;
```

- [ ] **Step 6: `Infrastructure/ApiResponse.cs`**

```csharp
using System.Text.Json;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public sealed class ApiResponse<T>
{
    public bool Succeeded { get; set; }
    public T? Data { get; set; }
    public List<ApiError> Errors { get; set; } = new();
    public int? ActionCode { get; set; }
    public string? Message { get; set; }
}

public sealed class ApiError
{
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public static class ApiResponse
{
    public static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
}
```

- [ ] **Step 7: `Infrastructure/TestDtos.cs`**

```csharp
namespace SMCA.WebApi.E2ETests.Infrastructure;

public sealed class StoreData
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public bool Approved { get; set; }
    public Guid OwnerId { get; set; }
    public string? OwnerName { get; set; }
    public DateOnly PaymentStartDate { get; set; }
    public DateOnly NextPaymentDate { get; set; }
    public List<ModuleData> Modules { get; set; } = new();
}

public sealed class ModuleData
{
    public int Id { get; set; }
    public string? Name { get; set; }
}
```

- [ ] **Step 8: `Infrastructure/DbTestHelpers.cs`** (auth seed + JWT mint + authed client + role seed)

```csharp
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Application.Abstractions.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class DbTestHelpers
{
    public sealed record UserFixture(Guid UserId, string Login);

    public static string HashPassword(string password)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));

    public static async Task<Guid> SeedSuperAdminAsync(AppTestFactory factory, string login, string password)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = User.Create(login, HashPassword(password), "E2E Super Admin", "0000000000", login, DataUtils.DefaultTenant.Id);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.SuperAdmin, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return user.Id;
    }

    // Seeds a bare user with a single role (StoreUser=3 / ReSeller=4) under DefaultTenant.
    public static async Task<UserFixture> SeedUserWithRoleAsync(AppTestFactory factory, int roleId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"role{roleId}-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, HashPassword("Password123"), "E2E Role User", "0000000000", login, DataUtils.DefaultTenant.Id);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, roleId, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return new UserFixture(user.Id, login);
    }

    public static async Task CleanupUserAsync(AppTestFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<UserRole>().RemoveRange(await db.Set<UserRole>().IgnoreQueryFilters().Where(x => x.UserId == userId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == userId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public static string MintToken(AppTestFactory factory, Guid userId, string login)
    {
        using var scope = factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtProvider>();
        return jwt.GenerateToken(userId, login);
    }

    public static HttpClient AuthedClient(AppTestFactory factory, Guid userId, string login)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", MintToken(factory, userId, login));
        return client;
    }
}
```

- [ ] **Step 9: `Infrastructure/StoreSeed.cs`** (store/owner/tenant fixtures + cleanup)

```csharp
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.Tenants;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class StoreSeed
{
    public const int ManagementModuleId = 7;
    public const int UnavailableModuleId = 999999;

    public sealed record OwnerFixture(Guid OwnerId, Guid UserId);
    public sealed record StoreFixture(Guid StoreId, Guid OwnerId, Guid OwnerUserId);
    public sealed record StoresAdminFixture(Guid UserId, string Login, Guid StoreId, Guid OwnerId);
    public sealed record TenantStoreFixture(Guid TenantId, Guid StoreId, Guid OwnerId, Guid OwnerUserId);
    public sealed record StoreRow(string Name, string? Address, string? Description, bool Approved, bool IsActive);

    public static async Task<OwnerFixture> SeedOwnerAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"owner-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Owner", "0000000000", login, DataUtils.DefaultTenant.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, DataUtils.DefaultTenant.Id, "E2E owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        return new OwnerFixture(owner.Id, user.Id);
    }

    public static async Task<StoreFixture> SeedStoreAsync(AppTestFactory factory, string name, bool approved, IReadOnlyCollection<int>? moduleIds = null)
    {
        var owner = await SeedOwnerAsync(factory);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = Store.Create(name, owner.OwnerId, approved, DataUtils.DefaultTenant.Id, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        foreach (var moduleId in moduleIds ?? new[] { ManagementModuleId })
            db.Set<StoreModule>().Add(StoreModule.Create(store.Id, moduleId, 0, true, 0, 0, 0, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return new StoreFixture(store.Id, owner.OwnerId, owner.UserId);
    }

    // OwnerAdmin (StoresAdmin) whose selected store has active Management(7): passes class-level filter, fails method-level SuperAdmin-only.
    public static async Task<StoresAdminFixture> SeedStoresAdminUserAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"sadmin-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E StoresAdmin", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E StoresAdmin owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"SA-Store-{Guid.NewGuid():N}", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();
        return new StoresAdminFixture(user.Id, login, store.Id, owner.Id);
    }

    // A store under a fresh, non-default Tenant (for cross-tenant SuperAdmin visibility).
    public static async Task<TenantStoreFixture> SeedStoreInNewTenantAsync(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenant = Tenant.Create($"T2-{Guid.NewGuid():N}", "e2e tenant", DateTimeOffset.UtcNow);
        db.Set<Tenant>().Add(tenant);
        var login = $"t2owner-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "T2 Owner", "0000000000", login, tenant.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenant.Id, "t2 owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        var store = Store.Create($"T2-Store-{Guid.NewGuid():N}", owner.Id, false, tenant.Id, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenant.Id));
        await db.SaveChangesAsync();
        return new TenantStoreFixture(tenant.Id, store.Id, owner.Id, user.Id);
    }

    public static async Task<bool> GetApprovedAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return (await db.Set<Store>().IgnoreQueryFilters().FirstAsync(s => s.Id == storeId)).Approved;
    }

    public static async Task<StoreRow> GetStoreRowAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var s = await db.Set<Store>().IgnoreQueryFilters().FirstAsync(x => x.Id == storeId);
        return new StoreRow(s.Name, s.Address, s.Description, s.Approved, s.IsActive);
    }

    public static async Task DeactivateStoreAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var s = await db.Set<Store>().IgnoreQueryFilters().FirstAsync(x => x.Id == storeId);
        s.IsActive = false;
        await db.SaveChangesAsync();
    }

    public static async Task CleanupStoreAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreRoleFeature>().RemoveRange(await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ToListAsync());
        db.Set<Store>().RemoveRange(await db.Set<Store>().IgnoreQueryFilters().Where(x => x.Id == storeId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public static async Task CleanupOwnerAsync(AppTestFactory factory, Guid ownerId, Guid ownerUserId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<Owner>().RemoveRange(await db.Set<Owner>().IgnoreQueryFilters().Where(x => x.Id == ownerId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == ownerUserId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public static async Task CleanupStoreFixtureAsync(AppTestFactory factory, StoreFixture f)
    {
        await CleanupStoreAsync(factory, f.StoreId);
        await CleanupOwnerAsync(factory, f.OwnerId, f.OwnerUserId);
    }

    public static async Task CleanupStoresAdminAsync(AppTestFactory factory, StoresAdminFixture f)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreRoleFeature>().RemoveRange(await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<Store>().RemoveRange(await db.Set<Store>().IgnoreQueryFilters().Where(x => x.Id == f.StoreId).ToListAsync());
        db.Set<UserRole>().RemoveRange(await db.Set<UserRole>().IgnoreQueryFilters().Where(x => x.UserId == f.UserId).ToListAsync());
        db.Set<Owner>().RemoveRange(await db.Set<Owner>().IgnoreQueryFilters().Where(x => x.Id == f.OwnerId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == f.UserId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public static async Task CleanupTenantStoreAsync(AppTestFactory factory, TenantStoreFixture f)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreRoleFeature>().RemoveRange(await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == f.StoreId).ToListAsync());
        db.Set<Store>().RemoveRange(await db.Set<Store>().IgnoreQueryFilters().Where(x => x.Id == f.StoreId).ToListAsync());
        db.Set<Owner>().RemoveRange(await db.Set<Owner>().IgnoreQueryFilters().Where(x => x.Id == f.OwnerId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == f.OwnerUserId).ToListAsync());
        db.Set<Tenant>().RemoveRange(await db.Set<Tenant>().IgnoreQueryFilters().Where(x => x.Id == f.TenantId).ToListAsync());
        await db.SaveChangesAsync();
    }
}
```

- [ ] **Step 10: Smoke** — `Stores/StoresHarnessSmokeTests.cs`

```csharp
using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoresHarnessSmokeTests
{
    private readonly HttpClient _client;
    public StoresHarnessSmokeTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    [Fact]
    public async Task By_current_user_without_token_returns_401()
    {
        var response = await _client.GetAsync("/api/v1/stores/by-current-user");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
```

- [ ] **Step 11:** `dotnet sln backend/src/SMCA.sln add backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (skip if present).
- [ ] **Step 12:** Verify entity factory signatures compile (adjust a call only if a signature differs — never weaken). Create `smca_test` if missing.
- [ ] **Step 13:** `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~StoresHarnessSmokeTests` → PASS (1).
- [ ] **Step 14: Checkpoint** — `test(webapi): bootstrap e2e harness + stores seeding + smoke`.

---

## Task 1: GET `by-current-user`

Create `Stores/StoresByCurrentUserTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoresByCurrentUserTests
{
    private readonly AppTestFactory _f;
    public StoresByCurrentUserTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task SuperAdmin_gets_seeded_stores_excluding_default()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fixture = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/stores/by-current-user");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Should().Contain(s => s.Id == fixture.StoreId);
            body.Data.Should().NotContain(s => s.Id == Domain.Common.Constants.DataUtils.DefaultStore.Id);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task SuperAdmin_by_current_user_includes_inactive_stores()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fixture = await StoreSeed.SeedStoreAsync(_f, $"Inactive-{Guid.NewGuid():N}", approved: false);
        await StoreSeed.DeactivateStoreAsync(_f, fixture.StoreId);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/stores/by-current-user");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            body!.Data!.Should().Contain(s => s.Id == fixture.StoreId && s.IsActive == false);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task SuperAdmin_by_current_user_sees_stores_across_tenants()
    {
        // SuperAdmin branch uses IgnoreQueryFilters -> returns stores of ANY tenant.
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var other = await StoreSeed.SeedStoreInNewTenantAsync(_f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/stores/by-current-user");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            body!.Data!.Should().Contain(s => s.Id == other.StoreId);
        }
        finally { await StoreSeed.CleanupTenantStoreAsync(_f, other); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task By_current_user_without_token_returns_401()
    {
        var response = await _f.CreateClient().GetAsync("/api/v1/stores/by-current-user");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
```

- [ ] Run `--filter ~StoresByCurrentUserTests` → PASS (4). **Checkpoint** — `test(webapi): stores by-current-user e2e`.

---

## Task 2: GET `{id}`

Create `Stores/StoreGetByIdTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreGetByIdTests
{
    private readonly AppTestFactory _f;
    public StoreGetByIdTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Get_existing_store_returns_dto_and_maps_payment_dates()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var name = $"Store-{Guid.NewGuid():N}";
        var fixture = await StoreSeed.SeedStoreAsync(_f, name, approved: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync($"/api/v1/stores/{fixture.StoreId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Id.Should().Be(fixture.StoreId);
            body.Data.Name.Should().Be(name);
            body.Data.Modules.Should().NotBeEmpty();
            body.Data.PaymentStartDate.Should().Be(today);
            // CHARACTERIZATION: NextPaymentDate has no backing property/mapping -> default. Update if a computed value is added.
            body.Data.NextPaymentDate.Should().Be(default(DateOnly));
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_unknown_store_returns_400_property_code_Id()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync($"/api/v1/stores/{Guid.NewGuid()}");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_empty_id_returns_400_property_code_Id()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync($"/api/v1/stores/{Guid.Empty}");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_without_token_returns_401()
    {
        var response = await _f.CreateClient().GetAsync($"/api/v1/stores/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
```

- [ ] Run `--filter ~StoreGetByIdTests` → PASS (4). **Checkpoint** — `test(webapi): stores get-by-id e2e`.

---

## Task 3: POST `/stores` (create — happy + all validation failures + dup-name bug)

Create `Stores/StoreCreateTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreCreateTests
{
    private readonly AppTestFactory _f;
    public StoreCreateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(Guid ownerId, string name, IEnumerable<int> moduleIds) => new
    { OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null, Approved = false, ModuleIds = moduleIds };

    [Fact]
    public async Task Create_with_valid_payload_persists_store_and_modules()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        var name = $"Store-{Guid.NewGuid():N}";
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, name, new[] { StoreSeed.ManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            created = body.Data!.Id;
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AnyAsync(s => s.Id == created)).Should().BeTrue();
            (await db.Set<Domain.Entities.StoreModules.StoreModule>().IgnoreQueryFilters().AnyAsync(m => m.StoreId == created)).Should().BeTrue();
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_with_empty_name_returns_400_code_Name()
        => await AssertCreate400(owner => Body(owner.OwnerId, "", new[] { StoreSeed.ManagementModuleId }), "Name");

    [Fact]
    public async Task Create_with_empty_owner_returns_400_code_OwnerId()
        => await AssertCreate400(_ => Body(Guid.Empty, $"S-{Guid.NewGuid():N}", new[] { StoreSeed.ManagementModuleId }), "OwnerId", seedOwner: false);

    [Fact]
    public async Task Create_with_unknown_owner_returns_400_code_OwnerId()
        => await AssertCreate400(_ => Body(Guid.NewGuid(), $"S-{Guid.NewGuid():N}", new[] { StoreSeed.ManagementModuleId }), "OwnerId", seedOwner: false);

    [Fact]
    public async Task Create_with_empty_modules_returns_400_code_ModuleIds()
        => await AssertCreate400(owner => Body(owner.OwnerId, $"S-{Guid.NewGuid():N}", Array.Empty<int>()), "ModuleIds");

    [Fact]
    public async Task Create_with_unavailable_module_returns_400_code_ModuleIds()
        => await AssertCreate400(owner => Body(owner.OwnerId, $"S-{Guid.NewGuid():N}", new[] { StoreSeed.UnavailableModuleId }), "ModuleIds");

    // KNOWN BUG: IsUniqueName checks User.Login, not Store.Name -> duplicate store names are allowed.
    [Fact]
    public async Task Create_with_duplicate_name_currently_succeeds_KNOWN_BUG()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var o1 = await StoreSeed.SeedOwnerAsync(_f);
        var o2 = await StoreSeed.SeedOwnerAsync(_f);
        var dup = $"Dup-{Guid.NewGuid():N}";
        Guid s1 = Guid.Empty, s2 = Guid.Empty;
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var b1 = await (await client.PostAsJsonAsync("/api/v1/stores", Body(o1.OwnerId, dup, new[] { StoreSeed.ManagementModuleId })))
                .Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            b1!.Succeeded.Should().BeTrue(); s1 = b1.Data!.Id;
            var b2 = await (await client.PostAsJsonAsync("/api/v1/stores", Body(o2.OwnerId, dup, new[] { StoreSeed.ManagementModuleId })))
                .Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            b2!.Succeeded.Should().BeTrue("duplicate store names are NOT enforced (known bug)"); s2 = b2.Data!.Id;
        }
        finally
        {
            if (s1 != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, s1);
            if (s2 != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, s2);
            await StoreSeed.CleanupOwnerAsync(_f, o1.OwnerId, o1.UserId);
            await StoreSeed.CleanupOwnerAsync(_f, o2.OwnerId, o2.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_without_token_returns_401()
    {
        var response = await _f.CreateClient().PostAsJsonAsync("/api/v1/stores", Body(Guid.NewGuid(), "x", new[] { StoreSeed.ManagementModuleId }));
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task AssertCreate400(Func<StoreSeed.OwnerFixture, object> body, string expectedCode, bool seedOwner = true)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        StoreSeed.OwnerFixture? owner = seedOwner ? await StoreSeed.SeedOwnerAsync(_f) : null;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores", body(owner ?? new StoreSeed.OwnerFixture(Guid.Empty, Guid.Empty)));
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == expectedCode);
        }
        finally
        {
            if (owner is not null) await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
```

- [ ] Run `--filter ~StoreCreateTests` → PASS (8). **Checkpoint** — `test(webapi): stores create e2e (all validations + dup-name bug)`.

---

## Task 4: PUT `{id}` (update — happy + all validations + quirks + route-id)

Create `Stores/StoreUpdateTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreUpdateTests
{
    private readonly AppTestFactory _f;
    public StoreUpdateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(Guid bodyId, string name, IEnumerable<int> moduleIds, bool withPaymentDate = true) => new
    {
        Id = bodyId, Name = name, Address = "a", Description = "d", Approved = false,
        PaymentStartDate = withPaymentDate ? DateTime.UtcNow : (DateTime?)null, ModuleIds = moduleIds, IsActive = true
    };

    [Fact]
    public async Task Update_as_superadmin_with_payment_date_succeeds()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var newName = $"Renamed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", Body(Guid.Empty, newName, new[] { StoreSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
            (await StoreSeed.GetStoreRowAsync(_f, fx.StoreId)).Name.Should().Be(newName);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_as_superadmin_without_payment_date_returns_400_KNOWN_QUIRK()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", Body(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { StoreSeed.ManagementModuleId }, withPaymentDate: false));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest); // ApiException("UserNotFound") - misleading message, SuperAdmin must supply PaymentStartDate
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_uses_route_id_not_body_id()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await StoreSeed.SeedStoreAsync(_f, $"Target-{Guid.NewGuid():N}", approved: false);
        var decoy = await StoreSeed.SeedStoreAsync(_f, $"Decoy-{Guid.NewGuid():N}", approved: false);
        try
        {
            var newName = $"Routed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{target.StoreId}", Body(decoy.StoreId, newName, new[] { StoreSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            (await StoreSeed.GetStoreRowAsync(_f, target.StoreId)).Name.Should().Be(newName);
            (await StoreSeed.GetStoreRowAsync(_f, decoy.StoreId)).Name.Should().NotBe(newName);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, target); await StoreSeed.CleanupStoreFixtureAsync(_f, decoy); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_name_colliding_with_another_store_returns_400_empty_errors()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var taken = $"Taken-{Guid.NewGuid():N}";
        var other = await StoreSeed.SeedStoreAsync(_f, taken, approved: false);
        var target = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{target.StoreId}", Body(Guid.Empty, taken, new[] { StoreSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest); // ValidationException(string) -> empty errors[]
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, other); await StoreSeed.CleanupStoreFixtureAsync(_f, target); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Update_unknown_id_returns_400_code_Id()
        => await AssertUpdate400(Guid.NewGuid(), Body(Guid.Empty, "x", new[] { StoreSeed.ManagementModuleId }), "Id", seedStore: false);

    [Fact]
    public async Task Update_empty_route_id_returns_400_code_Id()
        => await AssertUpdate400(Guid.Empty, Body(Guid.Empty, "x", new[] { StoreSeed.ManagementModuleId }), "Id", seedStore: false);

    [Fact]
    public async Task Update_empty_name_returns_400_code_Name()
        => await AssertUpdate400WithStore(fx => Body(Guid.Empty, "", new[] { StoreSeed.ManagementModuleId }), "Name");

    [Fact]
    public async Task Update_empty_modules_returns_400_code_ModuleIds()
        => await AssertUpdate400WithStore(fx => Body(Guid.Empty, $"n-{Guid.NewGuid():N}", Array.Empty<int>()), "ModuleIds");

    [Fact]
    public async Task Update_unavailable_module_returns_400_code_ModuleIds()
        => await AssertUpdate400WithStore(fx => Body(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { StoreSeed.UnavailableModuleId }), "ModuleIds");

    [Fact]
    public async Task Update_without_token_returns_401()
    {
        var r = await _f.CreateClient().PutAsJsonAsync($"/api/v1/stores/{Guid.NewGuid()}", Body(Guid.Empty, "x", new[] { StoreSeed.ManagementModuleId }));
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task AssertUpdate400(Guid routeId, object body, string code, bool seedStore)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PutAsJsonAsync($"/api/v1/stores/{routeId}", body);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    private async Task AssertUpdate400WithStore(Func<StoreSeed.StoreFixture, object> body, string code)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}", body(fx));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}
```

- [ ] Run `--filter ~StoreUpdateTests` → PASS (10). **Checkpoint** — `test(webapi): stores update e2e (all validations + quirks + route-id)`.

---

## Task 5: POST `approve` (SuperAdmin-only)

Create `Stores/StoreApproveTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreApproveTests
{
    private readonly AppTestFactory _f;
    public StoreApproveTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Approve_sets_approved_true()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = fx.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
            (await StoreSeed.GetApprovedAsync(_f, fx.StoreId)).Should().BeTrue();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Approve_already_approved_returns_succeeded_data_false()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = fx.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeFalse();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Approve_unknown_store_returns_400_code_Id()
        => await AssertApprove400(Guid.NewGuid());

    [Fact]
    public async Task Approve_empty_id_returns_400_code_Id()
        => await AssertApprove400(Guid.Empty);

    [Fact]
    public async Task Approve_without_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsJsonAsync("/api/v1/stores/approve", new { Id = Guid.NewGuid() });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task AssertApprove400(Guid id)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = id });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}
```

- [ ] Run `--filter ~StoreApproveTests` → PASS (5). **Checkpoint** — `test(webapi): stores approve e2e`.

---

## Task 6: POST `disapprove` (SuperAdmin-only)

Create `Stores/StoreDisapproveTests.cs` — mirror of approve (seed `approved: true`, assert `Approved == false`):

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreDisapproveTests
{
    private readonly AppTestFactory _f;
    public StoreDisapproveTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Disapprove_sets_approved_false()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/disapprove", new { Id = fx.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
            (await StoreSeed.GetApprovedAsync(_f, fx.StoreId)).Should().BeFalse();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Disapprove_already_disapproved_returns_succeeded_data_false()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/disapprove", new { Id = fx.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeFalse();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Disapprove_unknown_store_returns_400_code_Id()
        => await AssertDisapprove400(Guid.NewGuid());

    [Fact]
    public async Task Disapprove_empty_id_returns_400_code_Id()
        => await AssertDisapprove400(Guid.Empty);

    [Fact]
    public async Task Disapprove_without_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsJsonAsync("/api/v1/stores/disapprove", new { Id = Guid.NewGuid() });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task AssertDisapprove400(Guid id)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/disapprove", new { Id = id });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}
```

- [ ] Run `--filter ~StoreDisapproveTests` → PASS (5). **Checkpoint** — `test(webapi): stores disapprove e2e`.

---

## Task 7: Authorization — OwnerAdmin (class passes, method 403, field-drop)

Create `Stores/StoreAuthorizationTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreAuthorizationTests
{
    private readonly AppTestFactory _f;
    public StoreAuthorizationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact] // validity anchor: proves the seed PASSES the class-level filter
    public async Task OwnerAdmin_can_reach_stores_controller()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data!.Should().Contain(s => s.Id == sa.StoreId);
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task OwnerAdmin_cannot_approve_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = sa.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task OwnerAdmin_cannot_disapprove_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).PostAsJsonAsync("/api/v1/stores/disapprove", new { Id = sa.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task OwnerAdmin_update_ignores_superadmin_only_fields()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f); // seeded: Description=null, Approved=false, IsActive=true
        try
        {
            var newName = $"Renamed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).PutAsJsonAsync($"/api/v1/stores/{sa.StoreId}", new
            {
                Id = Guid.Empty, Name = newName, Address = "owner-addr", Description = "SHOULD-BE-IGNORED",
                Approved = true, PaymentStartDate = (DateTime?)null, ModuleIds = new[] { StoreSeed.ManagementModuleId }, IsActive = false
            });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var row = await StoreSeed.GetStoreRowAsync(_f, sa.StoreId);
            row.Name.Should().Be(newName);
            row.Address.Should().Be("owner-addr");
            row.Description.Should().BeNull();   // dropped
            row.Approved.Should().BeFalse();     // dropped
            row.IsActive.Should().BeTrue();      // dropped
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }
}
```

- [ ] Run `--filter ~StoreAuthorizationTests` → PASS (4). If `OwnerAdmin_can_reach_stores_controller`
  is 403, verify Module 7 active/available and `UserRole(OwnerAdmin).TenantId == User.TenantId`.
  **Checkpoint** — `test(webapi): stores authorization e2e (OwnerAdmin class-vs-method + field-drop)`.

---

## Task 8: Role enforcement — StoreUser / ReSeller → 403

Both fail the class-level `[HasPermission(SuperAdmin, StoresAdmin)]` on the Stores controller:
StoreUser has no `StoreRoleFeature` granting Stores; ReSeller's only feature is Owners.

Create `Stores/StoreRoleAccessTests.cs`:

```csharp
using System.Net;
using FluentAssertions;
using Domain.Common.Enums;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreRoleAccessTests
{
    private readonly AppTestFactory _f;
    public StoreRoleAccessTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task StoreUser_cannot_reach_stores_controller_returns_403()
    {
        var u = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, u.UserId, u.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, u.UserId); }
    }

    [Fact]
    public async Task ReSeller_cannot_reach_stores_controller_returns_403()
    {
        var u = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, u.UserId, u.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, u.UserId); }
    }
}
```

- [ ] Run `--filter ~StoreRoleAccessTests` → PASS (2).
- [ ] **Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS (all).
- [ ] **Checkpoint** — `test(webapi): stores role-access e2e (StoreUser/ReSeller 403)`.

---

## Coverage summary

- **by-current-user:** SuperAdmin happy, inactive appears, cross-tenant, 401.
- **{id}:** happy + date mapping, unknown→400"Id", empty→400"Id", 401.
- **POST:** happy+persistence, dup-name bug, empty Name/OwnerId/ModuleIds, unknown OwnerId, unavailable ModuleId, 401.
- **PUT:** superadmin happy, payment-date quirk, route-id-wins, name-collision (empty errors), unknown/empty Id, empty Name, empty/unavailable ModuleIds, 401.
- **approve / disapprove:** happy, no-op (data:false), unknown/empty Id → 400"Id", 401.
- **Authorization matrix (Stores controller):** SuperAdmin passes all; OwnerAdmin passes class / 403 method + field-drop; StoreUser → 403; ReSeller → 403.
- **Every validator rule** across the 5 stores validators is exercised (property-name codes). No `Store.NotFound` code is asserted (it does not exist).
- Cleanup in `finally` for every write; fixtures under DefaultTenant except the cross-tenant seed.

## Self-Review

- Self-contained (Task 0 bootstraps harness) ✓. All 6 endpoints + full validation + authorization + roles ✓.
- No placeholders; every task has compilable code ✓.
- Open items: confirm entity factory signatures compile; confirm `ModuleDto` field names if deeper
  `Modules` asserts are wanted; confirm migrations seed Module 7 + SystemConfiguration.
