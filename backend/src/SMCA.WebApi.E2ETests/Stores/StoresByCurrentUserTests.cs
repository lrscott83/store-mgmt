using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoresByCurrentUserTests
{
    private readonly AppTestFactory _f;
    public StoresByCurrentUserTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task SuperAdmin_gets_seeded_stores_excluding_default()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fixture = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/stores/by-current-user");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Should().Contain(s => s.Id == fixture.StoreId);
            body.Data.Should().NotContain(s => s.Id == Domain.Common.Constants.DataUtils.DefaultStore.Id);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task SuperAdmin_by_current_user_includes_inactive_stores()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fixture = await StoreSeed.SeedStoreAsync(_f, $"Inactive-{Guid.NewGuid():N}", approved: false);
        await StoreSeed.DeactivateStoreAsync(_f, fixture.StoreId);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/stores/by-current-user");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            body!.Data!.Should().Contain(s => s.Id == fixture.StoreId && s.IsActive == false);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task SuperAdmin_by_current_user_sees_stores_across_tenants()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var other = await StoreSeed.SeedStoreInNewTenantAsync(_f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync("/api/v1/stores/by-current-user");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            body!.Data!.Should().Contain(s => s.Id == other.StoreId);
        }
        finally { await StoreSeed.CleanupTenantStoreAsync(_f, other); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task By_current_user_without_token_returns_401()
    {
        var response = await _f.CreateClient().GetAsync("/api/v1/stores/by-current-user");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
