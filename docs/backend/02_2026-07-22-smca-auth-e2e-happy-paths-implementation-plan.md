# SMCA.WebApi `/auth` heavy happy-paths E2E — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three e2e tests to the existing `SMCA.WebApi.E2ETests` project covering login full success (super-admin), register full success, and the register-duplicate 500 bug-pin — against real Postgres.

**Architecture:** Reuse the `01` harness (`AppTestFactory`, `WebAppFixture`, `ApiResponse<T>`). A shared `DbTestHelpers` static class seeds a super-admin, looks up users, and cleans created rows in FK order via `context.Set<T>().IgnoreQueryFilters()`. Each test cleans up in a `finally`.

**Tech Stack:** .NET 8, xUnit, FluentAssertions, EF Core 8 + Npgsql.

## Global Constraints

- No new project, no new NuGet packages — extend `backend/src/SMCA.WebApi.E2ETests`.
- Test DB `smca_test` only; provided via config (from the `01` plan). Postgres must be reachable when tests run.
- Password hash for seeding: `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(plaintext)))`.
- Seed super-admin `TenantId = DataUtils.DefaultTenant.Id` (`B58BF718-C4ED-4EE9-A958-BB5A5DB4F7E8`); `Role` rows 1–4 exist from migrations.
- Persistence assertions and cleanup MUST use `IgnoreQueryFilters()` (test context has null tenant / non-super-admin → filters hide rows).
- Register `Password` must contain an uppercase letter and be ≥8 chars (`"Password123"` satisfies both login and register validators).
- Per project policy the human runs ALL git commands. Every "Checkpoint" step is a PAUSE — ask the user to commit; do not run git.

---

## File Structure

- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` — `AuthData` DTO for deserializing `AuthDto`.
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs` — seed/lookup/cleanup helpers.
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginSuccessTests.cs` — Task 1.
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterSuccessTests.cs` — Task 2.
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDuplicateTests.cs` — Task 3.

Reused from `01` (do not recreate): `Infrastructure/AppTestFactory.cs`, `Infrastructure/WebAppFixture.cs` (collection `"e2e"`), `Infrastructure/ApiResponse.cs` (`ApiResponse<T>`, `ApiError`, `ApiResponse.Json`).

---

## Task 1: Shared helpers + Login full success

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs`
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginSuccessTests.cs`

**Interfaces:**
- Consumes: `AppTestFactory`, `WebAppFixture` (collection `"e2e"`), `ApiResponse<T>` / `ApiResponse.Json` (from `01`); `Domain.Entities.Users.User.Create(login,password,fullName,cellPhone,email,tenantId)`; `Domain.Entities.UserRoles.UserRole.Create(userId,roleId,tenantId)`; `Domain.Common.Enums.RoleType.SuperAdmin`; `Domain.Common.Constants.DataUtils.DefaultTenant.Id`; `Infrastructure.Persistence.Contexts.ApplicationDbContext`.
- Produces: `AuthData` (`Login`, `AuthToken`, `RefreshToken`, `ExpiresIn`); `DbTestHelpers.HashPassword(string)`, `DbTestHelpers.SeedSuperAdminAsync(AppTestFactory, string login, string password) -> Task<Guid>`, `DbTestHelpers.CleanupUserAsync(AppTestFactory, Guid userId)`, `DbTestHelpers.GetUserByLoginAsync(AppTestFactory, string login) -> Task<User?>`, `DbTestHelpers.CleanupTenantCascadeAsync(AppTestFactory, Guid tenantId)`.

- [ ] **Step 1: Create the auth response DTO**

Create `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`:

```csharp
namespace SMCA.WebApi.E2ETests.Infrastructure;

// Mirrors Application.Dtos.Authentication.AuthDto (record Login, AuthToken, RefreshToken, ExpiresIn),
// deserialized from camelCase JSON.
public sealed class AuthData
{
    public string Login { get; set; } = string.Empty;
    public string AuthToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTime ExpiresIn { get; set; }
}
```

- [ ] **Step 2: Create the DB test helpers**

Create `backend/src/SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class DbTestHelpers
{
    public static string HashPassword(string password)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));

    public static async Task<Guid> SeedSuperAdminAsync(AppTestFactory factory, string login, string password)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var user = User.Create(login, HashPassword(password), "E2E Super Admin", "0000000000", login,
            DataUtils.DefaultTenant.Id);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.SuperAdmin, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return user.Id;
    }

    public static async Task<User?> GetUserByLoginAsync(AppTestFactory factory, string login)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<User>().IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Login == login);
    }

    public static async Task CleanupUserAsync(AppTestFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var roles = await db.Set<UserRole>().IgnoreQueryFilters().Where(x => x.UserId == userId).ToListAsync();
        db.Set<UserRole>().RemoveRange(roles);
        var users = await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == userId).ToListAsync();
        db.Set<User>().RemoveRange(users);
        await db.SaveChangesAsync();
    }

    public static async Task CleanupTenantCascadeAsync(AppTestFactory factory, Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await RemoveByTenantAsync<StoreRoleFeature>(db, tenantId);
        await RemoveByTenantAsync<StoreModule>(db, tenantId);
        await RemoveByTenantAsync<Store>(db, tenantId);
        await RemoveByTenantAsync<UserRole>(db, tenantId);
        await RemoveByTenantAsync<Owner>(db, tenantId);
        await RemoveByTenantAsync<User>(db, tenantId);

        var tenants = await db.Set<Tenant>().IgnoreQueryFilters().Where(x => x.Id == tenantId).ToListAsync();
        db.Set<Tenant>().RemoveRange(tenants);
        await db.SaveChangesAsync();
    }

    private static async Task RemoveByTenantAsync<T>(ApplicationDbContext db, Guid tenantId) where T : class
    {
        var rows = await db.Set<T>().IgnoreQueryFilters()
            .Where(x => EF.Property<Guid>(x, "TenantId") == tenantId).ToListAsync();
        db.Set<T>().RemoveRange(rows);
    }
}
```

- [ ] **Step 3: Write the failing login-success test**

Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginSuccessTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLoginSuccessTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthLoginSuccessTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Login_with_seeded_super_admin_returns_200_and_token()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedSuperAdminAsync(_factory, login, "Password123");
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "Password123" });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.AuthToken.Should().NotBeNullOrEmpty();
            body.Data.Login.Should().Be(login);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthLoginSuccessTests`
Expected: PASS (1 test). If it returns 200 with `succeeded=false`, the seeded super-admin failed `HasActiveStoreAsync` — verify `RoleType.SuperAdmin == 1` and that the `UserRole` row was written with `RoleId=1`.

- [ ] **Step 5: Checkpoint — ask the user to commit**

Suggested message: `test(webapi): add login full-success e2e test with super-admin seed`

---

## Task 2: Register full success

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterSuccessTests.cs`

**Interfaces:**
- Consumes: `DbTestHelpers.GetUserByLoginAsync`, `DbTestHelpers.CleanupTenantCascadeAsync`; `Domain.Entities.Owners.Owner`, `Domain.Entities.Stores.Store`, `ApplicationDbContext` (`Set<T>().IgnoreQueryFilters()`); `ApiResponse<bool>`.

- [ ] **Step 1: Write the failing register-success test**

Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterSuccessTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthRegisterSuccessTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthRegisterSuccessTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Register_with_valid_payload_creates_owner_and_store()
    {
        var login = $"reg-{Guid.NewGuid():N}@test.com";
        var storeName = $"Store-{Guid.NewGuid():N}";
        Guid tenantId = Guid.Empty;
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = "E2E Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = storeName,
                Code = (string?)null
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().BeTrue();

            var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            user.Should().NotBeNull();
            tenantId = user!.TenantId;

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Owner>().IgnoreQueryFilters().AnyAsync(o => o.UserId == user.Id)).Should().BeTrue();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.TenantId == tenantId)).Should().BeTrue();
        }
        finally
        {
            if (tenantId == Guid.Empty)
            {
                var created = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
                if (created is not null) tenantId = created.TenantId;
            }
            if (tenantId != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, tenantId);
        }
    }
}
```

- [ ] **Step 2: Run the test — expect PASS**

Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthRegisterSuccessTests`
Expected: PASS (1 test). If it 500s, inspect the body's `errors[0].description`; the most likely cause is a missing seeded `Module`/`Feature` row — confirm migrations applied to `smca_test`.

- [ ] **Step 3: Checkpoint — ask the user to commit**

Suggested message: `test(webapi): add register full-success e2e test`

---

## Task 3: Register duplicate — pin the 500 (KNOWN BUG)

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDuplicateTests.cs`

**Interfaces:**
- Consumes: `DbTestHelpers.GetUserByLoginAsync`, `DbTestHelpers.CleanupTenantCascadeAsync`; `ApiResponse<string>`.

- [ ] **Step 1: Write the failing duplicate-register test**

Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDuplicateTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthRegisterDuplicateTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthRegisterDuplicateTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    // KNOWN BUG: a duplicate register should return a controlled 4xx. Today the app-level
    // uniqueness check (RegisterCommandValidator -> IUserRepository.IsUniqueLoginAsync) is
    // bypassed because the User query filter (null tenant on an anonymous request) hides all
    // rows, so `.All(...)` is vacuously true. The second insert then violates a DB unique index
    // (Tenant.Name / User.Login) and throws DbUpdateException, surfaced by ErrorHandlerMiddleware
    // as HTTP 500 / Error("App.Unexpected", ...). When the check is fixed (IgnoreQueryFilters),
    // this test WILL FAIL and must be updated to assert the controlled 4xx.
    [Fact]
    public async Task Register_with_duplicate_login_currently_returns_500()
    {
        var login = $"dup-{Guid.NewGuid():N}@test.com";
        Guid tenantId = Guid.Empty;
        try
        {
            var first = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = "Dup Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = $"Store-{Guid.NewGuid():N}",
                Code = (string?)null
            });
            first.StatusCode.Should().Be(HttpStatusCode.OK);

            var created = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            created.Should().NotBeNull();
            tenantId = created!.TenantId;

            var second = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = "Dup Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = $"Store-{Guid.NewGuid():N}",
                Code = (string?)null
            });

            second.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
            var body = await second.Content.ReadFromJsonAsync<ApiResponse<string>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().Contain(e => e.Code == "App.Unexpected");
        }
        finally
        {
            if (tenantId != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, tenantId);
        }
    }
}
```

- [ ] **Step 2: Run the test — expect PASS**

Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthRegisterDuplicateTests`
Expected: PASS (1 test) — i.e. the second register returns HTTP 500 with `App.Unexpected`. If a fix lands and it returns 4xx, this test fails by design: update the assertion to the new controlled status and remove the KNOWN BUG note.

- [ ] **Step 3: Run the whole e2e suite (01 + 02)**

Run: `dotnet test backend/src/SMCA.WebApi.E2ETests`
Expected: PASS — all `01` tests plus the three `02` tests.

- [ ] **Step 4: Checkpoint — ask the user to commit**

Suggested message: `test(webapi): pin register-duplicate 500 (known bug) e2e test`

---

## Self-Review

- **Spec coverage:** login full success ✓ Task 1; register full success + persistence assert with `IgnoreQueryFilters()` ✓ Task 2; register duplicate 500 pin ✓ Task 3; manual per-test cleanup in `finally`, FK order ✓ `DbTestHelpers.CleanupTenantCascadeAsync`; no new packages/project ✓; super-admin cheapest seed ✓ Task 1.
- **Placeholder scan:** none — every step has full file content and exact commands.
- **Type consistency:** `DbTestHelpers.{HashPassword,SeedSuperAdminAsync,GetUserByLoginAsync,CleanupUserAsync,CleanupTenantCascadeAsync}`, `AuthData.{Login,AuthToken}`, `ApiResponse<T>`/`ApiResponse.Json`, entity factories `User.Create`, `UserRole.Create(userId,roleId,tenantId)`, `RoleType.SuperAdmin`, `DataUtils.DefaultTenant.Id`, `ApplicationDbContext.Set<T>().IgnoreQueryFilters()` — consistent across tasks and matching the verified backend signatures.
