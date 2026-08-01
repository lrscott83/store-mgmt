using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreApproveTests
{
    private readonly AppTestFactory _f;
    public StoreApproveTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Approve_sets_approved_true()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = fx.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
            (await StoreSeed.GetApprovedAsync(_f, fx.StoreId)).Should().BeTrue();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Approve_already_approved_returns_succeeded_data_true()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = fx.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue(); b.Data.Should().BeTrue();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Approve_unknown_store_returns_404_code_StoreNotFound()
        => await AssertApprove404(Guid.NewGuid());

    [Fact]
    public async Task Approve_empty_id_returns_400_code_Id()
        => await AssertApprove400(Guid.Empty);

    [Fact]
    public async Task Approve_without_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsJsonAsync("/api/v1/stores/approve", new { Id = Guid.NewGuid() });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private async Task AssertApprove400(Guid id)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = id });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    private async Task AssertApprove404(Guid id)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = id });
            r.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "StoreNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}