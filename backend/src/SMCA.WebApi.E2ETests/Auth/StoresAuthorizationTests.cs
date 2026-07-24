using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// Authorization tests for the Stores controller that fill gaps NOT covered
/// by existing StoreAuthorizationTests and StoreRoleAccessTests in the Stores namespace.
///
/// Covered elsewhere:
///   - 401 per-endpoint → StoreXxxTests
///   - OwnerAdmin can reach/403 approve → StoreAuthorizationTests
///   - StoreUser/ReSeller 403 → StoreRoleAccessTests
///
/// Gaps filled here:
///   - Super admin reads stores
///   - Owner admin WITHOUT management module → 403
///   - Store user WITH StoresFeature → 200
///   - Tenant-mismatch OwnerAdmin → 403
/// </summary>
[Collection("e2e")]
public sealed class StoresAuthorizationTests
{
    private readonly AppTestFactory _f;
    public StoresAuthorizationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Stores_super_admin_reads_by_current_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Stores_owner_admin_without_management_returns_403()
    {
        var f = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Stores_store_user_with_feature_passes_read()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId); }
    }

    [Fact]
    public async Task Stores_tenant_mismatch_owner_admin_returns_403()
    {
        var f = await AuthzSeed.SeedTenantMismatchOwnerAdminAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }
}
