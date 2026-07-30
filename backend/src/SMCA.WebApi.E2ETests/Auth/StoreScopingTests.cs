using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class StoreScopingTests
{
    private readonly AppTestFactory _f;
    public StoreScopingTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task SetMyStore_changes_selected_store_and_me_recomputes()
    {
        var login = $"super-{Guid.NewGuid():N}@test.com";
        var userId = await AuthTestHelpers.SeedActiveUserAsync(_f, login);
        var storeB = await StoreSeed.SeedStoreAsync(_f, $"B-{Guid.NewGuid():N}", approved: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, userId, login);
            var put = await client.PutAsJsonAsync("/api/v1/stores", new { StoreId = storeB.StoreId });
            put.StatusCode.Should().Be(HttpStatusCode.OK);

            var me = await client.GetAsync("/api/v1/auth/me");
            var b = await me.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json);
            b!.Data!.SelectedStoreId.Should().Be(storeB.StoreId);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, storeB);
            await AuthTestHelpers.CleanupUserAsync(_f, userId);
        }
    }
}
