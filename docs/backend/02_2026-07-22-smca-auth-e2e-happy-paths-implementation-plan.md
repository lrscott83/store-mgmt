# SMCA.WebApi `/auth` E2E — Consolidated Implementation Plan (happy paths + failures + validation + logout)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the full `/auth` e2e coverage to the existing `SMCA.WebApi.E2ETests` project — against real Postgres. Tasks 1–3 cover the happy paths (login full success, register full success, register-duplicate 500 bug-pin); Tasks 4–8 add the failure, `/me`, logout, and validation cases consolidated from the `03`/`03b` plans. Helper classes (`DbTestHelpers`, `AuthTestHelpers`, `SeedInactiveUserAsync`) are NOT redefined here — they are defined by their owning plans (`02` Task 1, `03` Task 0, `03b`) and reused, since every plan targets the same project.

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

## Task 4: `/auth/login` failure paths (from `03b`)

**Files:** Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs`.
**Reuses (do not redefine):** `DbTestHelpers.SeedSuperAdminAsync`, `DbTestHelpers.CleanupUserAsync` (`02` Task 1); `DbTestHelpers.SeedInactiveUserAsync` (`03b`).

- [ ] **Step 1: Write the login-failure tests**

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLoginFailureTests
{
    private readonly WebAppFixture _fixture;

    public AuthLoginFailureTests(WebAppFixture fixture) => _fixture = fixture;

    // Distinct branch from Login_with_unknown_user: user EXISTS and is active, only the password is wrong.
    [Fact]
    public async Task Login_with_wrong_password_for_active_user_returns_200_with_InvalidPassword()
    {
        var login = $"wrongpass_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        try
        {
            var client = _fixture.Factory.CreateClient();
            var res = await client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "WrongPassword1" });

            res.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(400);
            body.Errors.Should().ContainSingle(e => e.Code == "User.InvalidPassword");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, userId);
        }
    }

    // IsValidUserAsync short-circuits on !IsActive BEFORE the password check, so the password here is correct.
    [Fact]
    public async Task Login_with_inactive_user_returns_200_with_Inactive()
    {
        var login = $"inactive_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedInactiveUserAsync(_fixture.Factory, login, "Password123");
        try
        {
            var client = _fixture.Factory.CreateClient();
            var res = await client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "Password123" });

            res.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(400);
            body.Errors.Should().ContainSingle(e => e.Code == "User.Inactive");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, userId);
        }
    }
}
```

- [ ] **Step 2:** Run `--filter ~AuthLoginFailureTests` → PASS (2). **Checkpoint** — `test(webapi): auth login failure-path e2e`.

---

## Task 5: `/auth/me` failure paths (from `03b`)

**Files:** Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeFailureTests.cs`.
**Reuses (do not redefine):** `AuthTestHelpers.MintToken`, `AuthTestHelpers.BearerClient` (`03`); `DbTestHelpers.SeedInactiveUserAsync`, `DbTestHelpers.CleanupUserAsync` (`03b`/`02`).

- [ ] **Step 1: Write the `/me` failure tests**

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthMeFailureTests
{
    private readonly WebAppFixture _fixture;

    public AuthMeFailureTests(WebAppFixture fixture) => _fixture = fixture;

    // Distinct from Me_without_token_returns_401: a token IS sent, but it fails JWT validation -> pipeline 401.
    [Fact]
    public async Task Me_with_malformed_token_returns_401()
    {
        var client = AuthTestHelpers.BearerClient(_fixture.Factory, "not-a-real-jwt");

        var res = await client.GetAsync("/api/v1/auth/me");

        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // Structurally valid JWT for a Guid with no User row: [Authorize] passes, handler returns NotFound wrapped in 200.
    [Fact]
    public async Task Me_with_token_for_unknown_user_returns_200_with_NotFound_body()
    {
        var unknownId = Guid.NewGuid();
        var token = AuthTestHelpers.MintToken(_fixture.Factory, unknownId, $"ghost_{unknownId:N}@test.com");
        var client = AuthTestHelpers.BearerClient(_fixture.Factory, token);

        var res = await client.GetAsync("/api/v1/auth/me");

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.ActionCode.Should().Be(404);
        body.Errors.Should().ContainSingle(e => e.Code == "User.NotFound");
    }

    // Handler's SignOut branch: valid token, user exists but IsActive == false -> Inactive wrapped in 200.
    [Fact]
    public async Task Me_with_token_for_inactive_user_returns_200_with_Inactive_body()
    {
        var login = $"inactive_me_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedInactiveUserAsync(_fixture.Factory, login, "Password123");
        try
        {
            var token = AuthTestHelpers.MintToken(_fixture.Factory, userId, login);
            var client = AuthTestHelpers.BearerClient(_fixture.Factory, token);

            var res = await client.GetAsync("/api/v1/auth/me");

            res.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(404);
            body.Errors.Should().ContainSingle(e => e.Code == "User.Inactive");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, userId);
        }
    }
}
```

- [ ] **Step 2:** Run `--filter ~AuthMeFailureTests` → PASS (3). **Checkpoint** — `test(webapi): auth /me failure-path e2e`.

---

## Task 6: `/auth/logout` (from `03`)

**Files:** Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLogoutTests.cs`.
**Reuses (do not redefine):** `AuthTestHelpers.SeedActiveUserAsync`, `AuthTestHelpers.MintToken`, `AuthTestHelpers.BearerClient`, `AuthTestHelpers.CleanupUserAsync` (`03`).

- [ ] **Step 1: Write the logout tests**

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLogoutTests
{
    private readonly AppTestFactory _f;
    public AuthLogoutTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Logout_anonymous_returns_200_true()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/auth/logout");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
    }

    [Fact]
    public async Task Logout_with_valid_token_for_seeded_user_returns_200_true()
    {
        var login = $"lo-{Guid.NewGuid():N}@test.com";
        var userId = await AuthTestHelpers.SeedActiveUserAsync(_f, login);
        try
        {
            var token = AuthTestHelpers.MintToken(_f, userId, login);
            var r = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/logout");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
        }
        finally { await AuthTestHelpers.CleanupUserAsync(_f, userId); }
    }

    [Fact]
    public async Task Logout_with_malformed_token_returns_200_true()
    {
        // [AllowAnonymous]: a bad token does NOT 401 (contrast with /me). Falls to branch A.
        var r = await AuthTestHelpers.BearerClient(_f, "not-a-real-jwt").GetAsync("/api/v1/auth/logout");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
    }

    [Fact]
    public async Task Logout_with_token_for_unknown_user_returns_200_with_NotFound_body()
    {
        // Branch C: valid token, no matching User -> Failure(UserErrors.NotFound, 404).
        // Controller Ok() => HTTP 200; the 404 lives in the body (actionCode + code "User.NotFound").
        var token = AuthTestHelpers.MintToken(_f, Guid.NewGuid(), $"ghost-{Guid.NewGuid():N}@test.com");
        var r = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/logout");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
        b!.Succeeded.Should().BeFalse();
        b.ActionCode.Should().Be(404);
        b.Errors.Should().Contain(e => e.Code == "User.NotFound");
    }
}
```

- [ ] **Step 2:** Run `--filter ~AuthLogoutTests` → PASS (4). **Checkpoint** — `test(webapi): auth logout e2e`.

---

## Task 7: `/auth/login` validation (from `03`)

**Files:** Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginValidationTests.cs`.

- [ ] **Step 1: Write the login-validation tests**

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLoginValidationTests
{
    private readonly HttpClient _client;
    public AuthLoginValidationTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    private async Task Assert400(object body, string code)
    {
        var r = await _client.PostAsJsonAsync("/api/v1/auth/login", body);
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        b!.Succeeded.Should().BeFalse();
        b.Errors.Should().Contain(e => e.Code == code);
    }

    [Fact] public Task Login_empty_login_400_code_Login()
        => Assert400(new { Login = "", Password = "Password123" }, "Login");

    [Fact] public Task Login_empty_password_400_code_Password()
        => Assert400(new { Login = "user@test.com", Password = "" }, "Password");

    [Fact] public Task Login_short_password_400_code_Password()
        => Assert400(new { Login = "user@test.com", Password = "abc" }, "Password"); // MinimumLength(8)
}
```

- [ ] **Step 2:** Run `--filter ~AuthLoginValidationTests` → PASS (3). **Checkpoint** — `test(webapi): auth login validation e2e`.

---

## Task 8: `/auth/register` validation (from `03`)

**Files:** Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterValidationTests.cs`.

- [ ] **Step 1: Write the register-validation tests**

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthRegisterValidationTests
{
    private readonly HttpClient _client;
    public AuthRegisterValidationTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    // Valid baseline; each test mutates ONE field to the invalid value under test.
    private static object Register(string? login = null, string password = "Password123", string fullName = "E2E User",
        string cellPhone = "0000000000", string? email = null, string? storeName = "E2E Store") => new
    {
        Login = login ?? $"reg-{Guid.NewGuid():N}@test.com",
        Password = password, FullName = fullName, CellPhone = cellPhone,
        Email = email, StoreName = storeName, Code = (string?)null
    };

    private async Task Assert400(object body, string code)
    {
        var r = await _client.PostAsJsonAsync("/api/v1/auth/register", body);
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        b!.Succeeded.Should().BeFalse();
        b.Errors.Should().Contain(e => e.Code == code);
    }

    [Fact] public Task Register_empty_login_400_code_Login()
        => Assert400(Register(login: ""), "Login");

    [Fact] public Task Register_empty_password_400_code_Password()
        => Assert400(Register(password: ""), "Password");

    [Fact] public Task Register_short_password_400_code_Password()
        => Assert400(Register(password: "Ab1"), "Password"); // MinimumLength(8), has uppercase

    [Fact] public Task Register_password_without_uppercase_400_code_Password()
        => Assert400(Register(password: "password123"), "Password"); // >=8, no uppercase

    [Fact] public Task Register_empty_fullname_400_code_FullName()
        => Assert400(Register(fullName: ""), "FullName");

    [Fact] public Task Register_empty_cellphone_400_code_CellPhone()
        => Assert400(Register(cellPhone: ""), "CellPhone");

    [Fact] public Task Register_invalid_email_400_code_Email()
        => Assert400(Register(email: "not-an-email"), "Email"); // When(non-empty) EmailAddress()

    [Fact] public Task Register_empty_storename_400_code_StoreName()
        => Assert400(Register(storeName: ""), "StoreName");
}
```

- [ ] **Step 2:** Run `--filter ~AuthRegisterValidationTests` → PASS (8).
- [ ] **Step 3: Run the whole e2e suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS (all `01` + the 23 `/auth` tests). **Checkpoint** — `test(webapi): auth register validation e2e`.

---

## Self-Review

- **Spec coverage:** login full success ✓ Task 1; register full success + persistence assert with `IgnoreQueryFilters()` ✓ Task 2; register duplicate 500 pin ✓ Task 3; manual per-test cleanup in `finally`, FK order ✓ `DbTestHelpers.CleanupTenantCascadeAsync`; no new packages/project ✓; super-admin cheapest seed ✓ Task 1.
- **Consolidated coverage (Tasks 4–8, from `03`/`03b`):** login failures (wrong password, inactive) ✓ Task 4; `/me` failures (malformed token 401, unknown user 404-body, inactive 404-body) ✓ Task 5; logout (anonymous, valid, malformed, unknown user) ✓ Task 6; login validation (3) ✓ Task 7; register validation (8) ✓ Task 8. **23 `/auth` tests total.** Helpers are reused, not redefined: `DbTestHelpers` (`02` Task 1) + `SeedInactiveUserAsync` (`03b`), `AuthTestHelpers` (`03`). Duplication with the standalone `03`/`03b` plans is intentional (both target the same project; running the suite once exercises each test once regardless of which plan authored it).
- **Placeholder scan:** none — every step has full file content and exact commands.
- **Type consistency:** `DbTestHelpers.{HashPassword,SeedSuperAdminAsync,GetUserByLoginAsync,CleanupUserAsync,CleanupTenantCascadeAsync}`, `AuthData.{Login,AuthToken}`, `ApiResponse<T>`/`ApiResponse.Json`, entity factories `User.Create`, `UserRole.Create(userId,roleId,tenantId)`, `RoleType.SuperAdmin`, `DataUtils.DefaultTenant.Id`, `ApplicationDbContext.Set<T>().IgnoreQueryFilters()` — consistent across tasks and matching the verified backend signatures.
