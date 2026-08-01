using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersUpdateTests
{
    private readonly AppTestFactory _f;
    public UsersUpdateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Update_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PutAsJsonAsync($"/api/v1/users/{id}", new { FullName = "Updated Name" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Update_as_owner_admin_returns_200()
    {
        var f = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PutAsJsonAsync($"/api/v1/users/{f.UserId}", new { FullName = "Updated by OA" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Update_as_store_user_returns_403()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/users/{actor.UserId}", new { FullName = "Hacker" });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact]
    public async Task Update_without_token_returns_401()
    {
        var r = await _f.CreateClient()
            .PutAsJsonAsync($"/api/v1/users/{Guid.NewGuid()}", new { FullName = "Ghost" });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Update_empty_body_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PutAsJsonAsync($"/api/v1/users/{id}", new { });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Update_nonexistent_id_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PutAsJsonAsync($"/api/v1/users/{Guid.NewGuid()}", new { FullName = "Ghost" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Update_other_user_as_store_user_with_profile_feature_returns_envelope_404()
    {
        var actor = await AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Profile);
        var victim = await UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/users/{victim.UserId}", new { FullName = "Hacker" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(404);
            body.Errors.Should().ContainSingle(e => e.Code == "User.NotFound");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, victim.UserId);
        }
    }

    [Fact]
    public async Task Update_partial_body_preserves_email_and_cellphone()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, login)
                .PutAsJsonAsync($"/api/v1/users/{target.UserId}", new { FullName = "Renamed" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var dbUser = await DbTestHelpers.GetUserByLoginAsync(_f, target.Login);
            dbUser.Should().NotBeNull();
            dbUser!.Email.Should().Be(target.Login);
            dbUser.CellPhone.Should().Be("0000000000");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saId);
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
        }
    }

    [Fact]
    public async Task Update_with_empty_cellphone_clears_value()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, login)
                .PutAsJsonAsync($"/api/v1/users/{target.UserId}", new { FullName = "Renamed", CellPhone = "" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var dbUser = await DbTestHelpers.GetUserByLoginAsync(_f, target.Login);
            dbUser.Should().NotBeNull();
            dbUser!.CellPhone.Should().BeNull();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saId);
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
        }
    }

    [Fact]
    public async Task Update_omitting_isActive_preserves_active_state()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, login)
                .PutAsJsonAsync($"/api/v1/users/{target.UserId}", new { FullName = "Renamed" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var dbUser = await DbTestHelpers.GetUserByLoginAsync(_f, target.Login);
            dbUser.Should().NotBeNull();
            dbUser!.IsActive.Should().BeTrue();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saId);
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
        }
    }

    [Fact]
    public async Task Update_explicit_is_active_false_as_super_admin_deactivates()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, login)
                .PutAsJsonAsync($"/api/v1/users/{target.UserId}", new { FullName = "Renamed", IsActive = false });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var dbUser = await DbTestHelpers.GetUserByLoginAsync(_f, target.Login);
            dbUser.Should().NotBeNull();
            dbUser!.IsActive.Should().BeFalse();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saId);
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
        }
    }

    [Fact]
    public async Task Update_owner_admin_edits_staff_returns_200()
    {
        var oa = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        var staff = await UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)
                .PutAsJsonAsync($"/api/v1/users/{staff.UserId}", new { FullName = "Edited by OA" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, staff.UserId);
        }
    }

    [Fact]
    public async Task Update_as_store_user_with_profile_keeps_own_is_active()
    {
        var actor = await AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Profile);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/users/{actor.UserId}", new { FullName = "Self edit", IsActive = false });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Non-admin (StoreUser + Profile): the D4 admin gate must IGNORE the isActive:false request.
            var dbUser = await DbTestHelpers.GetUserByLoginAsync(_f, actor.Login);
            dbUser.Should().NotBeNull();
            dbUser!.IsActive.Should().BeTrue();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId);
        }
    }
}
