# 06 — SMCA.WebApi Users E2E — Implementation Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. Materializes the `06` test-plan: behavior + validation + bug-pins for the 8
> `UsersController` endpoints. Permission-matrix coverage belongs to `05` and is not repeated here.

**Goal:** Implement, against real Postgres via `dotnet test`, the `UsersController` endpoint behavior,
validation failures, and the two pinned bugs.

**Reuses (do NOT redefine):** `04`/`05` harness — `AppTestFactory`, `WebAppFixture`, `ApiResponse<T>`,
`DbTestHelpers.{HashPassword, SeedSuperAdminAsync, SeedUserWithRoleAsync, CleanupUserAsync, AuthedClient,
GetUserByLoginAsync}` (`UserFixture(Guid UserId, string Login)`, seeded password `"Password123"`),
`SeedInactiveUserAsync` (`03b`), `AuthzSeed.SeedOwnerAdminAsync` (`05`). No new helper class needed.

**Actor strategy:** default actor = **SuperAdmin** (bypasses `[HasPermission]` and the
`IsSuperAdminOrOwnerAdmin` handler guards) — cheapest, least seeding. Use OwnerAdmin/StoreUser only where
behavior depends on the role (list scoping, the `IsActive`-privilege case).

## Global Constraints (verified — `06` test-plan §2/§3)

- Controllers `return Ok(...)` → HTTP 200 unless a handler/pipeline throws.
- Validation failure = **HTTP 400** (`ValidationException` → `ErrorHandlerMiddleware`); `Errors[].code` =
  validator key (`IsRequired`, `UserNotFound`, `EmailFormatInvalid`, `RoleNotFound`).
- `change-password` wrong-old / non-admin-other = **soft 200**, `Succeeded=false`, `ActionCode=400`, code
  `User.InvalidPassword`.
- `DELETE {id}` = soft-deactivate (`IsActive=false`, row kept); non-admin → real 400.
- `POST activate` ignores body, sets `IsActive=true`; **nonexistent id → 500 (BUG #1, no validation)**.
- `change-password` persists the new password **in plaintext** (BUG #2).
- Routes: `GET Users/all/{includeInactive}`, `GET Users/{id}`, `PUT Users/{id}`, `DELETE Users/{id}`,
  `POST Users/activate`, `POST Users/AddUserRoles`, `POST Users/DeleteUserRoles`,
  `POST Users/change-password`. Command fields per the endpoint map.
- Roles 1–4 pre-seeded; a non-admin role (`StoreUser=3`) is visible to an OwnerAdmin/SuperAdmin actor for
  `AddUserRoles` (`VisibleRoleService.cs:28-38`).
- Human runs ALL git. Every Checkpoint is a PAUSE.

---

## File Structure

- Create: `Auth/UsersListTests.cs`, `Auth/UsersUpdateTests.cs`, `Auth/UsersDeleteActivateTests.cs`,
  `Auth/UsersRolesTests.cs`, `Auth/UsersChangePasswordTests.cs` (or a `Users/` subfolder — match project layout).

---

## Task 1: `UsersListTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersListTests
{
    private readonly AppTestFactory _f;
    public UsersListTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Get_all_users_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/Users/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Get_all_users_as_owner_admin_returns_200()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/Users/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Get_user_by_id_returns_the_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/Users/{target.UserId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Get_user_by_id_nonexistent_returns_400_UserNotFound()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync($"/api/v1/Users/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "UserNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~UsersListTests`. **Checkpoint** — `test(webapi): users list e2e`.

---

## Task 2: `UsersUpdateTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersUpdateTests
{
    private readonly AppTestFactory _f;
    public UsersUpdateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient AdminClient(out Guid adminId, out string login)
    {
        login = $"sa-{Guid.NewGuid():N}@test.com";
        adminId = DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123").GetAwaiter().GetResult();
        return DbTestHelpers.AuthedClient(_f, adminId, login);
    }

    [Fact]
    public async Task Update_user_profile_persists_fullname_and_email()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/Users/{target.UserId}",
                new { FullName = "Updated Name", CellPhone = "1112223333", Email = "updated@test.com", IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var saved = await DbTestHelpers.GetUserByLoginAsync(_f, target.Login);
            saved!.FullName.Should().Be("Updated Name");
            saved.Email.Should().Be("updated@test.com");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_user_empty_fullname_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/Users/{target.UserId}",
                new { FullName = "", CellPhone = "1112223333", Email = (string?)null, IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "IsRequired");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_user_invalid_email_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/Users/{target.UserId}",
                new { FullName = "Name", CellPhone = "1", Email = "not-an-email", IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "EmailFormatInvalid");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_user_nonexistent_id_returns_400_UserNotFound()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PutAsJsonAsync($"/api/v1/Users/{Guid.NewGuid()}",
                new { FullName = "Name", CellPhone = "1", Email = (string?)null, IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "UserNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

> `AdminClient(out ...)` helper is illustrative; each test seeds its own admin inline to keep isolation.
> Drop it if unused. The `IsActive`-privilege behavior (StoreUser cannot toggle own `IsActive`) is a
> role-specific case — implement it only if you seed a StoreUser editing itself; otherwise it overlaps
> `05`.

- [ ] Run `--filter ~UsersUpdateTests`. **Checkpoint** — `test(webapi): users update e2e`.

---

## Task 3: `UsersDeleteActivateTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersDeleteActivateTests
{
    private readonly AppTestFactory _f;
    public UsersDeleteActivateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Delete_user_soft_deactivates_sets_isactive_false()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/Users/{target.UserId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var saved = await DbTestHelpers.GetUserByLoginAsync(_f, target.Login);
            saved.Should().NotBeNull();          // soft delete: row still present
            saved!.IsActive.Should().BeFalse();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Delete_user_nonexistent_id_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/Users/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Activate_user_sets_isactive_true()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var targetLogin = $"inact-{Guid.NewGuid():N}@test.com";
        var targetId = await DbTestHelpers.SeedInactiveUserAsync(_f, targetLogin, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/activate", new { Id = targetId, IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var saved = await DbTestHelpers.GetUserByLoginAsync(_f, targetLogin);
            saved!.IsActive.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, targetId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // PIN BUG #1: ActivateUserCommandValidator validates DeleteUserCommand, so activate has NO validation.
    // A nonexistent Id bypasses UserExists and NPEs in the handler -> HTTP 500 (not 400). Update when fixed.
    [Fact]
    public async Task Activate_user_nonexistent_id_returns_500()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/activate", new { Id = Guid.NewGuid(), IsActive = true });
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~UsersDeleteActivateTests`. **Checkpoint** — `test(webapi): users delete+activate e2e (bug pin)`.

---

## Task 4: `UsersRolesTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersRolesTests
{
    private readonly AppTestFactory _f;
    public UsersRolesTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int StoreUserRoleId = 3; // RoleType.StoreUser — visible to Super/OwnerAdmin

    [Fact]
    public async Task Add_user_roles_grants_role()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, StoreUserRoleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/AddUserRoles", new { UserId = target.UserId, RoleIds = new[] { StoreUserRoleId } });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Add_user_roles_empty_roleids_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, StoreUserRoleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/AddUserRoles", new { UserId = target.UserId, RoleIds = Array.Empty<int>() });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "IsRequired");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Add_user_roles_nonexistent_user_returns_400_UserNotFound()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/AddUserRoles", new { UserId = Guid.NewGuid(), RoleIds = new[] { StoreUserRoleId } });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "UserNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Delete_user_roles_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, StoreUserRoleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/DeleteUserRoles", new { UserId = target.UserId, RoleIds = new[] { StoreUserRoleId } });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
```

- [ ] Run `--filter ~UsersRolesTests`. **Checkpoint** — `test(webapi): users roles e2e`.

---

## Task 5: `UsersChangePasswordTests`

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersChangePasswordTests
{
    private readonly AppTestFactory _f;
    public UsersChangePasswordTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Self-service: UserId == caller, correct old password -> success.
    [Fact]
    public async Task Change_password_self_with_correct_old_password_succeeds()
    {
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, target.UserId, target.Login)
                .PostAsJsonAsync("/api/v1/Users/change-password",
                    new { UserId = target.UserId, OldPassword = "Password123", NewPassword = "NewPass123" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); }
    }

    // Self-service, wrong old password -> SOFT 200 failure with User.InvalidPassword.
    [Fact]
    public async Task Change_password_self_with_wrong_old_password_returns_200_InvalidPassword()
    {
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, target.UserId, target.Login)
                .PostAsJsonAsync("/api/v1/Users/change-password",
                    new { UserId = target.UserId, OldPassword = "WrongOld1", NewPassword = "NewPass123" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeFalse();
            b.ActionCode.Should().Be(400);
            b.Errors.Should().Contain(e => e.Code == "User.InvalidPassword");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); }
    }

    // Admin resets someone else's password without knowing the old one -> success.
    [Fact]
    public async Task Change_password_admin_resets_other_without_old_password_succeeds()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsJsonAsync("/api/v1/Users/change-password",
                    new { UserId = target.UserId, OldPassword = "anything", NewPassword = "NewPass123" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Change_password_missing_newpassword_returns_400()
    {
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, target.UserId, target.Login)
                .PostAsJsonAsync("/api/v1/Users/change-password",
                    new { UserId = target.UserId, OldPassword = "Password123", NewPassword = "" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "IsRequired");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); }
    }

    // PIN BUG #2: the new password is persisted in plaintext (no hashing). Update when fixed to assert the hash.
    [Fact]
    public async Task Change_password_persists_plaintext()
    {
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var res = await DbTestHelpers.AuthedClient(_f, target.UserId, target.Login)
                .PostAsJsonAsync("/api/v1/Users/change-password",
                    new { UserId = target.UserId, OldPassword = "Password123", NewPassword = "NewPass123" });
            res.StatusCode.Should().Be(HttpStatusCode.OK);

            var saved = await DbTestHelpers.GetUserByLoginAsync(_f, target.Login);
            saved!.Password.Should().Be("NewPass123");                          // stored raw (BUG)
            saved.Password.Should().NotBe(DbTestHelpers.HashPassword("NewPass123"));
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, target.UserId); }
    }
}
```

- [ ] Run `--filter ~UsersChangePasswordTests`.
- [ ] **Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` → PASS.
- [ ] **Checkpoint** — `test(webapi): users change-password e2e (bug pin)`.

---

## Self-Review

- **Endpoint coverage:** list ✓ (all + by-id + UserNotFound), update ✓ (persist + FullName/email/UserExists
  validation), delete ✓ (soft-deactivate + non-existent 400), activate ✓ (reactivate + **BUG #1 500**),
  roles ✓ (add/delete + validation), change-password ✓ (self ok/wrong-soft-200, admin-reset, validation,
  **BUG #2 plaintext**).
- **Verified facts baked in:** validation=400 with validator-key codes; change-password soft-200
  `User.InvalidPassword`; delete=soft-deactivate; activate ignores body; SuperAdmin actor bypasses gates.
- **Helpers reused, not redefined:** all from `04`/`05`/`03b`; no new helper class.
- **Bug pins:** #1 (activate 500) Task 3, #2 (plaintext) Task 5 — both note "update when fixed".
- **Open confirmations (flagged, don't change assertions):** exact JSON casing of command fields
  (`Id` vs route), `04` `UserFixture` members (confirmed `UserId`/`Login`), the `IsActive`-privilege
  role-specific case left optional (overlaps `05`).
- **Not covered (by design):** the role×feature 403 matrix → `05`; `StoreUsersController` → `07`.
