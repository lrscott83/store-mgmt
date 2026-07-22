# SMCA.WebApi `/auth` — logout + validation E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. This is the `03` implementation-plan: it materializes the logout suite
> (`03_...-logout-test-plan.md`) AND adds the full validation-error suite for the auth endpoints that
> have validators (login, register). `me`/`ping`/`logout` have no validators.

**Goal:** Implement, against real Postgres via `dotnet test`: the `/auth/logout` cases and every
FluentValidation failure of `LoginCommandValidator` and `RegisterCommandValidator`.

**Self-contained:** Does not assume the `01`/`02` harness is on disk. `Task 0` bootstraps
`SMCA.WebApi.E2ETests`. If it already exists, skip present files and add only the new test classes.

**Tech Stack:** .NET 8, xUnit 2.4, FluentAssertions 6.12, `Microsoft.AspNetCore.Mvc.Testing`,
EF Core 8 + Npgsql.

## Global Constraints

- Target `net8.0`. Test DB `smca_test` only, via config (not Docker). Route base `api/v1/auth`.
- `ResponseResult<T>` serializes camelCase: `{ succeeded, data, errors:[{code,description}], actionCode, message }`.
- Password hash for seeding = `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(raw)))`.
- `IJwtProvider.GenerateToken(Guid userId, string login)`; identity claim = `ClaimTypes.NameIdentifier`.
- **Verified contract facts:**
  - `logout` is `[AllowAnonymous]`, `GET`, empty `LogoutQuery`. Handler branches: no principal → `Success(true)`; user found → `SignOutAsync` → `Success(true)`; user missing → `Failure(UserErrors.NotFound, 404)`.
  - The controller wraps everything in `Ok(...)` → **HTTP 200**. A returned `Failure` surfaces as HTTP 200 with `succeeded=false`, `actionCode=404`, `errors[0].code == "User.NotFound"` (constant `UserErrors.NotFound = ("User.NotFound", ...)`). A malformed/absent token → branch A → 200 `data=true` (AllowAnonymous does NOT 401).
  - **Validation failures throw** `ValidationException` → **HTTP 400**; `errors[].code` = the **property name** (`"Login"`, `"Password"`, `"FullName"`, `"CellPhone"`, `"Email"`, `"StoreName"`).
  - `LoginCommandValidator`: `Login` required; `Password` required + `MinimumLength(8)`.
  - `RegisterCommandValidator`: `Login` required (+ `IsUniqueName` — bypassed by the query-filter bug, pinned as the register-duplicate 500 in `02`, NOT tested here); `Password` required + `MinimumLength(8)` + must contain an uppercase; `FullName` required; `CellPhone` required; `Email` `EmailAddress()` **only when non-empty**; `StoreName` required.
  - `LoginCommand(Login, Password)`. `RegisterCommand(Login, Password, FullName, CellPhone, Email?, StoreName, Code?)`.
- Per project policy the human runs ALL git commands. Every "Checkpoint" is a PAUSE.

---

## File Structure

Task 0 (harness — skip any that already exist from `01`/`02`/`04`):
- `SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`, `appsettings.Tests.json`
- `Infrastructure/AppTestFactory.cs`, `WebAppFixture.cs`, `ApiResponse.cs`, `AuthTestHelpers.cs`
- Modify `SMCA.WebApi/Program.cs` (append `public partial class Program {}`), `SMCA.sln`.

Test classes:
- `Auth/AuthLogoutTests.cs` (Task 1)
- `Auth/AuthLoginValidationTests.cs` (Task 2)
- `Auth/AuthRegisterValidationTests.cs` (Task 3)

> If `01`'s `DbTestHelpers`/`ApiResponse` already exist, reuse them and skip Task 0 Steps that recreate
> them; only add `SeedActiveUserAsync`/`MintToken` if missing.

---

## Task 0: Harness + auth helpers (skip files that already exist)

- [ ] **Step 1:** `SMCA.WebApi.E2ETests.csproj` (as in `01`/`04` Task 0). If the project exists, skip.
- [ ] **Step 2:** `appsettings.Tests.json` (Connection → `smca_test`). Skip if present.
- [ ] **Step 3:** Append `public partial class Program { }` to `SMCA.WebApi/Program.cs`. Skip if present.
- [ ] **Step 4:** `Infrastructure/AppTestFactory.cs` (as in `04` Task 0). Skip if present.
- [ ] **Step 5:** `Infrastructure/WebAppFixture.cs` (collection `"e2e"`, `MigrateAsync`). Skip if present.
- [ ] **Step 6:** `Infrastructure/ApiResponse.cs` (`ApiResponse<T>`, `ApiError`, `ApiResponse.Json`). Skip if present.

- [ ] **Step 7: `Infrastructure/AuthTestHelpers.cs`** (seed active user + mint token + authed client)

```csharp
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Application.Abstractions.Authentication;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public static class AuthTestHelpers
{
    public static string HashPassword(string password)
        => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));

    // A bare active user (IsActive=true) is enough for logout branch B (/me is not exercised here).
    public static async Task<Guid> SeedActiveUserAsync(AppTestFactory factory, string login)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = User.Create(login, HashPassword("Password123"), "E2E User", "0000000000", login, Guid.NewGuid());
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    public static async Task CleanupUserAsync(AppTestFactory factory, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters().Where(x => x.Id == userId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public static string MintToken(AppTestFactory factory, Guid userId, string login)
    {
        using var scope = factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtProvider>();
        return jwt.GenerateToken(userId, login);
    }

    public static HttpClient BearerClient(AppTestFactory factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
```

- [ ] **Step 8:** Add project to solution (skip if present); ensure `smca_test` exists.

---

## Task 1: `/auth/logout`

Create `Auth/AuthLogoutTests.cs`:

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

- [ ] Run `--filter ~AuthLogoutTests` → PASS (4). **Checkpoint** — `test(webapi): auth logout e2e`.

---

## Task 2: `/auth/login` validation

Create `Auth/AuthLoginValidationTests.cs`:

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

- [ ] Run `--filter ~AuthLoginValidationTests` → PASS (3). **Checkpoint** — `test(webapi): auth login validation e2e`.

---

## Task 3: `/auth/register` validation

Create `Auth/AuthRegisterValidationTests.cs`:

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

- [ ] Run `--filter ~AuthRegisterValidationTests` → PASS (8).
- [ ] **Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS.
- [ ] **Checkpoint** — `test(webapi): auth register validation e2e`.

---

## Coverage summary

- **logout:** anonymous 200; valid token 200; malformed token 200 (AllowAnonymous); unknown-user → 200 body `User.NotFound`/actionCode 404.
- **login validation:** `Login` required, `Password` required, `Password` MinimumLength(8) — each → 400 with property-name code.
- **register validation:** `Login`/`FullName`/`CellPhone`/`StoreName` required; `Password` required + MinimumLength(8) + uppercase; `Email` format (when present) — each → 400 with property-name code.
- **Not tested here (by design):** register `Login` uniqueness — bypassed by the query-filter bug and
  pinned as the register-duplicate 500 in `02`.

## Self-Review

- Self-contained (Task 0 bootstraps harness, skip-if-exists) ✓. Every login/register validator rule
  exercised ✓. Logout suite materialized ✓.
- No placeholders; compilable code ✓.
- Open items: confirm the harness files reuse cleanly if `01` was already implemented; confirm
  `RegisterCommand` has no extra required field beyond those validated.
