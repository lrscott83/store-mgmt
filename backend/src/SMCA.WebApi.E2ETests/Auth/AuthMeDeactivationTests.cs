using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Enums;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// B-6 coverage: the server-side inactive-account /me 404 over HTTP. No prior E2E flow
/// ever deactivated an account through the API, so GET /api/v1/auth/me returning 404
/// Auth.AccountInactive was only reachable via MintToken-seeded users.
/// <para>
/// T1 proves the positive chain end-to-end: deactivate via the API (200 + DB read-back),
/// then the target's REAL login token hits the /me inactive branch (404, contain-single
/// code assert — discriminates AccountInactive from a generic User.NotFound 404).
/// T2 proves tenant isolation: deactivating a victim in another tenant is a 404 envelope,
/// NOT a cross-tenant write.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class AuthMeDeactivationTests
{
    private const string Password = "Password123";

    private readonly AppTestFactory _f;
    private readonly HttpClient _client;

    public AuthMeDeactivationTests(WebAppFixture fixture)
    {
        _f = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Deactivated_same_tenant_store_user_me_returns_404_account_inactive()
    {
        var oa = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);
        try
        {
            // REAL login BEFORE deactivation (AuthLoginStoreUserTests pattern): the
            // target's store and owner are active at seed, so login is 200 and yields a
            // real AuthToken. A login AFTER deactivation would 403 Auth.AccountInactive.
            var login = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = su.Login, Password });
            login.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await login.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            loginBody!.Succeeded.Should().BeTrue();
            loginBody.Data!.AuthToken.Should().NotBeNullOrEmpty();
            var targetToken = loginBody.Data.AuthToken;

            // Minted OA actor (Management module) deactivates the same-tenant StoreUser
            // via the API — the point of B-6 (UserSeed.DeactivateUserAsync would be a
            // silent NoTracking no-op, so deactivation goes ONLY through this endpoint).
            var activate = await DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)
                .PostAsJsonAsync("/api/v1/users/activate", new { Id = su.UserId, IsActive = false });
            activate.StatusCode.Should().Be(HttpStatusCode.OK);

            // DB read-back via IgnoreQueryFilters: the API really wrote IsActive=false
            // (a bare 200 without a write would not be evidence).
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Set<User>().IgnoreQueryFilters().FirstAsync(u => u.Id == su.UserId);
            user.IsActive.Should().BeFalse();

            // Exactly ONE /me call with the target's REAL token: the inactive branch of
            // GetMeQuery fires → 404 AccountInactive. Contain-single discriminates it
            // from the generic User.NotFound 404 (AuthMeFailureTests convention).
            var me = await AuthTestHelpers.BearerClient(_f, targetToken).GetAsync("/api/v1/auth/me");
            me.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var meBody = await me.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            meBody!.Succeeded.Should().BeFalse();
            meBody.ActionCode.Should().Be(404);
            meBody.Errors.Should().ContainSingle(e => e.Code == "Auth.AccountInactive");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
        }
    }

    [Fact]
    public async Task Cross_tenant_activate_returns_404()
    {
        var oa = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var (tenantBId, victimId, _) = await SeedTenantBVictimAsync();
        try
        {
            // The tenant query filter (UserEntityTypeConfiguration) makes the handler's
            // GetByIdAsync return null for the other-tenant victim → 404 envelope, NOT a
            // 403 handler guard and NOT a cross-tenant write. The middleware yields
            // App.Unexpected, so the assert pins the envelope only (Activate_nonexistent
            // convention — never a code).
            var r = await DbTestHelpers.AuthedClient(_f, oa.UserId, oa.Login)
                .PostAsJsonAsync("/api/v1/users/activate", new { Id = victimId, IsActive = false });
            r.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().NotBeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantBId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
        }
    }

    /// <summary>
    /// MINIMAL tenant-B seed (UsersIsolationTests.SeedCustomTenantVictimAsync shape):
    /// Tenant + User + StoreUser UserRole only — NO Store/StoreUser/StoreModule rows.
    /// Sufficient because the 404 fires on the tenant-filtered lookup null, and FK-safe
    /// because CleanupTenantCascadeAsync removes Store/UserRole/Owner/User/Tenant but not
    /// StoreUser — a StoreUser row would strand on the Store delete.
    /// </summary>
    private async Task<(Guid TenantId, Guid UserId, string Login)> SeedTenantBVictimAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = Guid.NewGuid();
        db.Set<Tenant>().Add(Tenant.Create(tenantId, "E2E XTenant B", "e2e", DateTimeOffset.UtcNow));
        var login = $"xtenantb-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword(Password), "E2E XTenant B Victim", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        await db.SaveChangesAsync();
        return (tenantId, user.Id, login);
    }
}
