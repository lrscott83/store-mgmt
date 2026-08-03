using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersChangePasswordTests
{
    private readonly AppTestFactory _f;
    public UsersChangePasswordTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Change_own_password_returns_200_and_relogin()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{id}",
                    new { OldPassword = "Password123", NewPassword = "NewPass123!" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // New password logs in with a token.
            var relogin = await _f.CreateClient().PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "NewPass123!" });
            relogin.StatusCode.Should().Be(HttpStatusCode.OK);
            var reloginBody = await relogin.Content.ReadFromJsonAsync<ApiResponse<AuthData>>(ApiResponse.Json);
            reloginBody!.Succeeded.Should().BeTrue();
            reloginBody.Data!.AuthToken.Should().NotBeNullOrEmpty();

            // Old password is dead — real 401 from the auth filter.
            var oldLogin = await _f.CreateClient().PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "Password123" });
            oldLogin.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            var oldBody = await oldLogin.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            oldBody!.Succeeded.Should().BeFalse();
            oldBody.ActionCode.Should().Be(401);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Change_password_with_wrong_old_password_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{id}",
                    new { OldPassword = "WrongPassword1", NewPassword = "NewPass123!" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().NotBeEmpty();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Change_password_with_weak_new_password_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            // Too short (7 chars).
            var shortPass = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{id}",
                    new { OldPassword = "Password123", NewPassword = "abc123" });
            shortPass.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var shortBody = await shortPass.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            shortBody!.Succeeded.Should().BeFalse();
            shortBody.Errors.Should().NotBeEmpty();

            // No uppercase letter.
            var noUpper = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{id}",
                    new { OldPassword = "Password123", NewPassword = "alllowercase123" });
            noUpper.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var noUpperBody = await noUpper.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            noUpperBody!.Succeeded.Should().BeFalse();
            noUpperBody.Errors.Should().NotBeEmpty();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Change_password_with_nonexistent_id_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{Guid.NewGuid()}",
                    new { OldPassword = "Password123", NewPassword = "NewPass123!" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().NotBeEmpty();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Change_password_cross_tenant_owner_admin_returns_404()
    {
        var oa = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        var (tenantId, victimId) = await SeedCustomTenantVictimAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{victimId}",
                    new { OldPassword = "Password123", NewPassword = "NewPass123!" });
            r.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().NotBeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
        }
    }

    [Fact]
    public async Task Change_password_same_tenant_owner_admin_returns_200()
    {
        var oa = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        var staff = await UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{staff.UserId}",
                    new { OldPassword = "Password123", NewPassword = "NewPass123!" });
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
    public async Task Change_password_as_store_user_without_permission_returns_403()
    {
        var actor = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);
        var victim = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{victim.UserId}",
                    new { OldPassword = "", NewPassword = "Hacked123!" });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, victim.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId);
        }
    }

    [Fact]
    public async Task Change_password_super_admin_cross_tenant_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var (tenantId, victimId) = await SeedCustomTenantVictimAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, login)
                .PostAsJsonAsync($"/api/v1/users/change-password/{victimId}",
                    new { OldPassword = "Password123", NewPassword = "NewPass123!" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>
    /// Seeds a User + UserRole in a freshly-created non-default Tenant
    /// (pattern: DbTestHelpers.SeedUserWithRoleAsync + custom tenant).
    /// </summary>
    private async Task<(Guid TenantId, Guid UserId)> SeedCustomTenantVictimAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = Guid.NewGuid();
        db.Set<Tenant>().Add(Tenant.Create(tenantId, "E2E XTenant", "e2e", DateTimeOffset.UtcNow));
        var login = $"xtenant-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E XTenant Victim", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        await db.SaveChangesAsync();
        return (tenantId, user.Id);
    }
}
