using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoresListTests
{
    private readonly AppTestFactory _f;
    public StoresListTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_active_only_returns_active_stores()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var name = $"Store-{Guid.NewGuid():N}";
        var fixture = await StoreSeed.SeedStoreAsync(_f, name, approved: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync("/api/v1/stores/list/false");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeEmpty();
            body.Data.Should().Contain(s => s.Name == name);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task List_with_inactive_includes_inactive_stores()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var name = $"Inactive-{Guid.NewGuid():N}";
        var fixture = await StoreSeed.SeedStoreAsync(_f, name, approved: false);
        await StoreSeed.DeactivateStoreAsync(_f, fixture.StoreId);
        try
        {
            // includeInactive = true → the inactive store should be included
            var responseTrue = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync("/api/v1/stores/list/true");
            responseTrue.StatusCode.Should().Be(HttpStatusCode.OK);
            var bodyTrue = await responseTrue.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            bodyTrue!.Succeeded.Should().BeTrue();
            bodyTrue.Data.Should().Contain(s => s.Id == fixture.StoreId);

            // includeInactive = false → the inactive store should NOT be included
            var responseFalse = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync("/api/v1/stores/list/false");
            responseFalse.StatusCode.Should().Be(HttpStatusCode.OK);
            var bodyFalse = await responseFalse.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            bodyFalse!.Succeeded.Should().BeTrue();
            bodyFalse.Data.Should().NotContain(s => s.Id == fixture.StoreId);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task List_returns_owner_name()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var name = $"Store-{Guid.NewGuid():N}";
        var fixture = await StoreSeed.SeedStoreAsync(_f, name, approved: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync("/api/v1/stores/list/true");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var store = body.Data!.First(s => s.Id == fixture.StoreId);
            store.OwnerName.Should().NotBeNullOrEmpty();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task List_without_token_returns_401()
    {
        var response = await _f.CreateClient().GetAsync("/api/v1/stores/list/false");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task List_with_wrong_role_returns_403()
    {
        var userFixture = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.OwnerAdmin);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, userFixture.UserId, userFixture.Login);
            var response = await client.GetAsync("/api/v1/stores/list/false");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, userFixture.UserId); }
    }
}
