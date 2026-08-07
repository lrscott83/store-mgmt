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
public sealed class UsersIsolationTests
{
    private readonly AppTestFactory _f;
    public UsersIsolationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404()
    {
        var oa = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        var (tenantId, victimId, victimLogin) = await SeedCustomTenantVictimAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)
                .PutAsJsonAsync($"/api/v1/users/{victimId}", new { FullName = $"Edited by {Guid.NewGuid():N}" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(404);
            body.Errors.Should().ContainSingle(e => e.Code == "User.NotFound");

            var dbUser = await DbTestHelpers.GetUserByLoginAsync(_f, victimLogin);
            dbUser.Should().NotBeNull();
            dbUser!.FullName.Should().Be("E2E XTenant Victim");
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
        }
    }

    [Fact]
    public async Task Update_owner_admin_updates_user_in_other_store_returns_200()
    {
        var oa = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);
        try
        {
            var newFullName = $"Edited by {Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)
                .PutAsJsonAsync($"/api/v1/users/{su.UserId}", new { FullName = newFullName });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var dbUser = await DbTestHelpers.GetUserByLoginAsync(_f, su.Login);
            dbUser.Should().NotBeNull();
            dbUser!.FullName.Should().Be(newFullName);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId);
        }
    }

    /// <summary>
    /// Seeds a User + UserRole in a freshly-created non-default Tenant
    /// (pattern: DbTestHelpers.SeedUserWithRoleAsync + custom tenant).
    /// Returns (TenantId, UserId, Login) so the caller can assert on the login.
    /// </summary>
    private async Task<(Guid TenantId, Guid UserId, string Login)> SeedCustomTenantVictimAsync()
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
        return (tenantId, user.Id, login);
    }
}
