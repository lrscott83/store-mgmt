using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreAuthorizationTests
{
    private readonly AppTestFactory _f;
    public StoreAuthorizationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task OwnerAdmin_can_reach_stores_controller()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<StoreData>>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data!.Should().Contain(s => s.Id == sa.StoreId);
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task OwnerAdmin_cannot_approve_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).PostAsJsonAsync("/api/v1/stores/approve", new { Id = sa.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task OwnerAdmin_cannot_disapprove_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).PostAsJsonAsync("/api/v1/stores/disapprove", new { Id = sa.StoreId });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }

    [Fact]
    public async Task OwnerAdmin_update_ignores_superadmin_only_fields()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var newName = $"Renamed-{Guid.NewGuid():N}";
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login).PutAsJsonAsync($"/api/v1/stores/{sa.StoreId}", new
            {
                Id = Guid.Empty, Name = newName, Address = "owner-addr", Description = "SHOULD-BE-IGNORED",
                Approved = true, ModuleIds = new[] { StoreSeed.ManagementModuleId }, IsActive = false
            });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var row = await StoreSeed.GetStoreRowAsync(_f, sa.StoreId);
            row.Name.Should().Be(newName);
            row.Address.Should().Be("owner-addr");
            row.Description.Should().BeNull();
            row.Approved.Should().BeFalse();
            row.IsActive.Should().BeTrue();
        }
        finally { await StoreSeed.CleanupStoresAdminAsync(_f, sa); }
    }
}