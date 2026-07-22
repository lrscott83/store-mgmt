# SMCA.WebApi `/auth` E2E Pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an in-process e2e test harness for `SMCA.WebApi` and cover the `/auth` endpoints at the contract level against a real Postgres, proving the pipeline (routing, JWT auth, FluentValidation, MediatR, EF Core) end-to-end.

**Architecture:** A new xUnit project `SMCA.WebApi.E2ETests` uses `WebApplicationFactory<Program>` to boot the real API in-process. The connection string is overridden from `appsettings.Tests.json` to a dedicated `smca_test` Postgres DB (no Docker/Testcontainers). Protected endpoints are exercised with a JWT minted in-test via the app's own `IJwtProvider` (same signing config), so the real authorization pipeline runs.

**Tech Stack:** .NET 8, xUnit 2.4, FluentAssertions 6.12, `Microsoft.AspNetCore.Mvc.Testing`, EF Core 8 + Npgsql, Postgres.

## Global Constraints

- Target framework: `net8.0` (match existing test projects).
- Test DB is `smca_test` ONLY (never `smca` dev/prod). Connection provided via config, not Docker.
- Route base is `api/v1/auth` (`BaseApiController.cs:11` → `[Route("api/v1/[controller]")]`).
- `ResponseResult<T>` serializes (camelCase) as `{ succeeded: bool, data: T, errors: [{code, description}], actionCode: int?, message: string? }`. There is NO `statusCode`/`isSuccess` field. On success `actionCode` is `null`.
- Password hash for seeding = `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(raw)))` (plain SHA-256, no salt) — matches `HashPasswordService`.
- The JWT claim the API reads for identity is `ClaimTypes.NameIdentifier` (the user `Guid`). `IJwtProvider.GenerateToken(Guid userId, string userLogin)` already sets it.
- Per project policy the human runs ALL git commands. Every "Checkpoint" step below is where you PAUSE and ask the user to commit — do not run git yourself.

---

## File Structure

- Create: `backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` — the test project.
- Create: `backend/src/SMCA.WebApi.E2ETests/appsettings.Tests.json` — test connection string.
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs` — WebApplicationFactory + config override.
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs` — collection fixture: owns factory, applies migrations.
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/ApiResponse.cs` — test-side DTOs for `ResponseResult<T>`.
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthPingTests.cs` — harness smoke test.
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginTests.cs` — login contract tests.
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterTests.cs` — register validation test.
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeTests.cs` — `/me` auth tests + user seeding.
- Modify: `backend/src/SMCA.WebApi/Program.cs` — append `public partial class Program { }`.
- Modify: `backend/src/SMCA.sln` — add the test project.

---

## Task 1: Harness scaffold + ping smoke test

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`
- Create: `backend/src/SMCA.WebApi.E2ETests/appsettings.Tests.json`
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs`
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs`
- Create: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/ApiResponse.cs`
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthPingTests.cs`
- Modify: `backend/src/SMCA.WebApi/Program.cs`
- Modify: `backend/src/SMCA.sln`

**Interfaces:**
- Produces: `AppTestFactory : WebApplicationFactory<Program>`; `WebAppFixture` (property `AppTestFactory Factory`); collection name `"e2e"`; `ApiResponse<T>` (`bool Succeeded`, `T? Data`, `List<ApiError> Errors`, `int? ActionCode`, `string? Message`), `ApiError` (`string Code`, `string Description`), and `ApiResponse.Json` (`JsonSerializerOptions` with `PropertyNameCaseInsensitive = true`).

- [ ] **Step 1: Create the test project file**

Create `backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`:

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
    <None Update="appsettings.Tests.json">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    </None>
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Create the test connection config**

Create `backend/src/SMCA.WebApi.E2ETests/appsettings.Tests.json`:

```json
{
  "ConnectionStrings": {
    "Application": "Host=127.0.0.1;Port=5432;Database=smca_test;Username=postgres;Password=postgres;Persist Security Info=True;Include Error Detail=True"
  }
}
```

- [ ] **Step 3: Expose Program for the test host**

Append to the very end of `backend/src/SMCA.WebApi/Program.cs` (top-level statements file, so this goes after the last statement):

```csharp

public partial class Program { }
```

- [ ] **Step 4: Create the WebApplicationFactory**

Create `backend/src/SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs`:

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
        {
            // Loaded last so ConnectionStrings:Application overrides appsettings.json (smca -> smca_test).
            config.AddJsonFile(
                Path.Combine(AppContext.BaseDirectory, "appsettings.Tests.json"),
                optional: false,
                reloadOnChange: false);
        });
    }
}
```

- [ ] **Step 5: Create the collection fixture (applies migrations)**

Create `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs`:

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
        // Force host build and apply EF migrations to smca_test (env "Testing" skips the app's dev-only auto-migrate).
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();
    }

    public Task DisposeAsync()
    {
        Factory.Dispose();
        return Task.CompletedTask;
    }
}

[CollectionDefinition("e2e")]
public sealed class E2ECollection : ICollectionFixture<WebAppFixture>;
```

- [ ] **Step 6: Create the response DTOs**

Create `backend/src/SMCA.WebApi.E2ETests/Infrastructure/ApiResponse.cs`:

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

- [ ] **Step 7: Write the failing ping test**

Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthPingTests.cs`:

```csharp
using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthPingTests
{
    private readonly HttpClient _client;

    public AuthPingTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    [Fact]
    public async Task Ping_returns_200_and_true()
    {
        var response = await _client.GetAsync("/api/v1/auth/ping");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync()).Should().Be("true");
    }
}
```

- [ ] **Step 8: Add the project to the solution**

Run: `dotnet sln backend/src/SMCA.sln add backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`
Expected: `Project ... added to the solution.`

- [ ] **Step 9: Run the test — expect it to PASS**

Ensure Postgres is reachable at the configured connection and `smca_test` exists (create it once: `createdb -h 127.0.0.1 -U postgres smca_test`, or `CREATE DATABASE smca_test;`).
Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthPingTests`
Expected: PASS (1 test). This proves the host boots, config override loads, and migrations apply to `smca_test`.

- [ ] **Step 10: Checkpoint — ask the user to commit**

Suggested message: `test(webapi): add e2e harness + auth ping smoke test`
Files: the new `SMCA.WebApi.E2ETests/**` and the `Program.cs` + `SMCA.sln` changes.

---

## Task 2: Login contract tests

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginTests.cs`

**Interfaces:**
- Consumes: `WebAppFixture`, collection `"e2e"`, `ApiResponse<T>` / `ApiResponse.Json` from Task 1.

- [ ] **Step 1: Write the failing login tests**

Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLoginTests
{
    private readonly HttpClient _client;

    public AuthLoginTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    [Fact]
    public async Task Login_with_empty_credentials_returns_400_from_validation()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
            new { Login = "", Password = "" });

        // FluentValidation -> ValidationException -> ErrorHandlerMiddleware sets HTTP 400.
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.Errors.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Login_with_unknown_user_returns_200_with_failure_body()
    {
        // Password length >= 8 passes validation, so the request reaches the handler,
        // which returns ResponseResult.Failure(400). The controller wraps it in Ok() => HTTP 200.
        var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
            new { Login = "nobody-" + Guid.NewGuid().ToString("N") + "@test.com", Password = "Password123" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.ActionCode.Should().Be(400);
    }
}
```

- [ ] **Step 2: Run the tests — expect PASS**

Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthLoginTests`
Expected: PASS (2 tests). If `Login_with_unknown_user` returns 400 instead of 200, the controller behavior changed — reconcile against `AuthController.AuthAsync` before adjusting the assertion.

- [ ] **Step 3: Checkpoint — ask the user to commit**

Suggested message: `test(webapi): add login contract e2e tests`

---

## Task 3: Register validation test

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterTests.cs`

**Interfaces:**
- Consumes: `WebAppFixture`, collection `"e2e"`, `ApiResponse<T>` / `ApiResponse.Json` from Task 1.

- [ ] **Step 1: Write the failing register validation test**

Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthRegisterTests
{
    private readonly HttpClient _client;

    public AuthRegisterTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    [Fact]
    public async Task Register_with_empty_body_returns_400_from_validation()
    {
        // RegisterCommandValidator requires Login/Password/FullName/CellPhone/StoreName.
        var response = await _client.PostAsJsonAsync("/api/v1/auth/register",
            new { Login = "", Password = "", FullName = "", CellPhone = "", Email = (string?)null, StoreName = "", Code = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.Errors.Should().NotBeEmpty();
    }
}
```

- [ ] **Step 2: Run the test — expect PASS**

Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthRegisterTests`
Expected: PASS (1 test).

- [ ] **Step 3: Checkpoint — ask the user to commit**

Suggested message: `test(webapi): add register validation e2e test`

---

## Task 4: `/me` authorization tests + user seeding

**Files:**
- Create: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeTests.cs`

**Interfaces:**
- Consumes: `WebAppFixture.Factory` (for `Services` scope + `CreateClient`), `ApiResponse<T>` / `ApiResponse.Json`, `Domain.Entities.Users.User.Create(...)`, `Infrastructure.Persistence.Contexts.ApplicationDbContext` (`Set<User>()`), `Application.Abstractions.Authentication.IJwtProvider`, `Application.Dtos.Authentication.CurrentUserDto`.

- [ ] **Step 1: Write the failing `/me` tests**

Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Application.Abstractions.Authentication;
using Application.Dtos.Authentication;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthMeTests
{
    private readonly WebAppFixture _fixture;
    private readonly HttpClient _client;

    public AuthMeTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Me_without_token_returns_401()
    {
        var response = await _client.GetAsync("/api/v1/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Me_with_valid_minted_token_returns_current_user()
    {
        var login = $"me-{Guid.NewGuid():N}@test.com";
        var userId = await SeedActiveUserAsync(login);
        var token = MintToken(userId, login);

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        body.Data!.Id.Should().Be(userId);
        body.Data.Login.Should().Be(login);
    }

    private async Task<Guid> SeedActiveUserAsync(string login)
    {
        using var scope = _fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // User.Create sets IsActive=true (AuditableEntity default). /me does not check the password,
        // so a placeholder password value is fine here.
        var user = User.Create(login, "seed-hash", "E2E User", "0000000000", login, Guid.NewGuid());
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    private string MintToken(Guid userId, string login)
    {
        using var scope = _fixture.Factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtProvider>();
        return jwt.GenerateToken(userId, login);
    }
}
```

- [ ] **Step 2: Run the tests — expect PASS**

Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthMeTests`
Expected: PASS (2 tests).
If `Me_with_valid_minted_token` returns a non-200 or a failure body, `GetMeQueryHandler` likely requires more than a bare `User` row (e.g. a selected store / roles). In that case, capture the exact failure and extend `SeedActiveUserAsync` with the minimal role/store rows the handler dereferences — do NOT weaken the assertion. This is the one flagged risk of the pilot (see Open Items).

- [ ] **Step 3: Run the whole suite**

Run: `dotnet test backend/src/SMCA.WebApi.E2ETests`
Expected: PASS (all tests from Tasks 1–4).

- [ ] **Step 4: Checkpoint — ask the user to commit**

Suggested message: `test(webapi): add /me authorization e2e tests with user seeding`

---

## Deferred (out of this pilot — documented, not implemented)

These two require heavy domain seeding that does not add harness-validation value; capture them as a follow-up plan once the pilot is green.

- **Login full success (HTTP 200 + real token).** `AuthenticationService.IsValidUserAsync` requires an "active store" — a super-admin role, or an active `Store` reachable via `StoreUser`/`Owner`. Needs `Role`/`UserRole`/`Store`/`Owner` seeding not yet mapped.
- **Register full success (owner + store creation).** `RegisterCommandHandler` calls `ICreateOwnerService` / `ICreateStoreService` and `IModuleRepository.GetAvailableModulesToStore()` — needs `Module` rows present (verify whether migrations seed them) plus assertion on the persisted `User`/`Owner`/`Store`.

---

## Open Items to verify during implementation

- EF migrations apply cleanly to an empty `smca_test` (8 migrations exist under `Infrastructure/Migrations/`; `MigrateAsync` in the fixture applies them). If a migration is environment-coupled, resolve before Task 1 Step 9.
- `GetMeQueryHandler` tolerates a `User` with no roles/selected store (Task 4 risk). If not, extend the seed as noted.
- Test isolation: tests use unique random logins, so no cross-test cleanup is required for this pilot. If future resource tests mutate shared rows, add a between-test reset (truncate or transaction-per-test) at that point.

---

## Self-Review

- **Spec coverage:** harness (WebApplicationFactory + config Postgres + partial Program + JWT-in-test) ✓ Tasks 1/4; login/me/register contract ✓ Tasks 2/3/4; ping smoke ✓ Task 1. Register/login full happy-paths intentionally deferred with rationale.
- **No placeholders:** every code step contains the full file/content; no TBD.
- **Type consistency:** `AppTestFactory`, `WebAppFixture.Factory`, collection `"e2e"`, `ApiResponse<T>`/`ApiResponse.Json`, `IJwtProvider.GenerateToken(Guid,string)`, `User.Create(login,password,fullName,cellPhone,email,tenantId)`, `ApplicationDbContext.Set<User>()`, `CurrentUserDto.{Id,Login}` — all consistent across tasks.
