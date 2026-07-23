# 03b — SMCA.WebApi Auth e2e gap-fill plan

**Date:** 2026-07-23
**Scope:** `AuthController` (`backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs`) — the branch-level scenarios that plans `01`/`02`/`03` planned-but-never-implemented, plus branches never mentioned. Self-contained: gap analysis + verified behaviors + ready test code.
**Depends on:** the `SMCA.WebApi.E2ETests` harness described in plans `01`–`03` (`AppTestFactory`, `WebAppFixture`, `[Collection("e2e")]`, `DbTestHelpers`, `AuthTestHelpers`, `ApiResponse<T>`). As of this date that harness is **planned only, not yet implemented as code** — these tests slot into it once it exists.

---

## 1. Why this plan exists

The Auth controller has 5 endpoints (`POST login`, `POST register`, `GET me`, `GET ping`, `GET logout`). All 5 already appear across plans `01`/`02`/`03`, so there is **no uncovered endpoint**. The gaps are at the **scenario / branch** level: specific error paths that the plans either listed but never turned into a `[Fact]`, or never listed at all.

This plan adds **5 new tests, 0 duplicates**.

---

## 2. Verified handler behavior (read from source, not assumed)

`Application/Services/Authentication/AuthenticationService.cs` — `IsValidUserAsync` checks in order:

1. user is `null` → `UserErrors.LoginNotFound` → `User.NotFound`
2. `!user.IsActive` → `UserErrors.Inactive` → `User.Inactive`
3. password hash mismatch → `UserErrors.InvalidPassword` → `User.InvalidPassword`
4. reseller/owner/store-active gates → `ReSeller.Inactive` / `Owner.Inactive` / `Store.Inactive`

`Application/Features/Authentication/Commands/Login/LoginCommand.cs` — `LoginCommandHandler` wraps any failed `IsValidUserAsync` as `ResponseResult.Failure(..., HttpStatusCode.BadRequest)`; the controller returns `Ok(...)`, so the transport is **HTTP 200** with `ActionCode = 400`.

`Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` — `GetMeQueryHandler`:

- empty external id → `NotFound` (404)
- user row not found (`IgnoreQueryFilters`) → `NotFound` (404)
- `!user.IsActive` → `SignOutAsync()` + `Inactive` (404)
- success → `CurrentUserDto`

Controller returns `Ok(...)` for all of these, so failures are **HTTP 200** with `ActionCode = 404`.

`Domain/Entities/Users/UserErrors.cs` — codes: `User.NotFound`, `User.Inactive`, `User.InvalidPassword`.
`Domain/Common/Entities/AuditableEntity.cs` — `IsActive` is a public `{ get; set; }` (default `true`); an inactive user is created by setting it to `false` before save.

---

## 3. Gap matrix

| Endpoint | Already covered (01/02/03) | New test (this plan) |
|---|---|---|
| **login** | empty creds → 400; unknown user → 200/`User.NotFound`; super-admin ok → 200 + token; Login/Password validation | **① wrong password (active user)** → 200, `ActionCode=400`, `User.InvalidPassword` — distinct branch from unknown-user<br>**② inactive user** → 200, `ActionCode=400`, `User.Inactive` |
| **me** | no token → 401; valid token → 200 | **③ malformed token** → 401 (planned in 01, never implemented)<br>**④ token for unknown user** → 200, `ActionCode=404`, `User.NotFound`<br>**⑤ token for inactive user** → 200, `ActionCode=404`, `User.Inactive` (handler SignOut branch) |
| **register** | 8 validation cases + success + duplicate-500 bug pin | none — no real endpoint gap; do not pad |
| **ping** | smoke 200/true | none — no branches |
| **logout** | anonymous, valid token, malformed token, unknown user → 404 | **blocked:** expired-token case needs `IJwtProvider` TTL support; do not fake |

---

## 4. New seed helper (required)

No existing helper creates an inactive user. Add to `Infrastructure/DbTestHelpers.cs`:

```csharp
public static async Task<Guid> SeedInactiveUserAsync(AppTestFactory factory, string login, string password)
{
    using var scope = factory.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    var user = User.Create(login, HashPassword(password), "E2E Inactive User",
        "0000000000", login, DataUtils.DefaultTenant.Id);
    user.IsActive = false;              // verified: public setter on AuditableEntity
    db.Set<User>().Add(user);
    await db.SaveChangesAsync();
    return user.Id;
}
```

---

## 5. `Auth/AuthLoginFailureTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
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

---

## 6. `Auth/AuthMeFailureTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
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

---

## 7. Files

- **New:** `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs`
- **New:** `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeFailureTests.cs`
- **Modified:** `backend/src/SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs` (add `SeedInactiveUserAsync`)

---

## 8. Deliberately excluded / deferred

- **register / ping** — no real branch gap; not padded.
- **logout expired token** — blocked: `IJwtProvider.GenerateToken(Guid, string)` has no expiry/TTL parameter; a test-only provider that can backdate `exp` is required before this case can be written honestly.
- **login `Store.Inactive`** (active user, correct password, not super/store-admin, no active store) — real branch in `HasActiveStoreAsync`, not written here because it needs full Owner/Store/StoreUser seeding (reuse plan `04`'s `StoreSeed`). Follow-up.
