using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthMePermissionsTests
{
    private readonly AppTestFactory _f;
    public AuthMePermissionsTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static async Task<MeData> MeAsync(HttpClient client)
    {
        var r = await client.GetAsync("/api/v1/auth/me");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b.Data!;
    }

    [Fact]
    public async Task Me_super_admin_reports_IsSuperAdmin()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, id, login));
            me.IsSuperAdmin.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Me_owner_admin_with_management_store_includes_stores_feature()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsOwnerAdmin.Should().BeTrue();
            me.FeatureIds.Should().Contain(AuthzSeed.StoresFeatureId);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Me_owner_admin_without_management_store_excludes_stores_feature()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: false);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsOwnerAdmin.Should().BeTrue();
            me.FeatureIds.Should().NotContain(AuthzSeed.StoresFeatureId);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Me_store_user_with_feature_reports_role_in_selected_store()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsSuperAdmin.Should().BeFalse();
            me.IsOwnerAdmin.Should().BeFalse();
            me.SelectedStoreId.Should().Be(f.StoreId);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId); }
    }

    [Fact]
    public async Task Me_reseller_reports_IsReSeller()
    {
        var uf = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.ReSeller);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, uf.UserId, uf.Login));
            me.IsReSeller.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, uf.UserId); }
    }

    [Fact]
    public async Task Me_user_role_tenant_mismatch_not_recognized_as_owner_admin()
    {
        var f = await AuthzSeed.SeedTenantMismatchOwnerAdminAsync(_f);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsOwnerAdmin.Should().BeFalse();
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }
}
