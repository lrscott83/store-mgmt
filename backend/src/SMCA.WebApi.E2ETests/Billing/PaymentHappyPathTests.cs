using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class PaymentHappyPathTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public PaymentHappyPathTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    [Fact]
    public async Task SuperAdmin_pays_any_store_returns_200()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2026, 6, 1), paidModulePrice: 2000f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.PostAsync(
                $"/api/v1/stores/{store.StoreId}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().BeTrue();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Unauthenticated_request_returns_401()
    {
        var response = await _f.CreateClient()
            .PostAsync($"/api/v1/stores/{Guid.NewGuid()}/payments", null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task OwnerAdmin_rejected_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login);
            var response = await client.PostAsync(
                $"/api/v1/stores/{sa.StoreId}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, sa);
        }
    }

    [Fact]
    public async Task StoreWithNullPaymentStartDate_returns_400()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var freeStore = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.PostAsync(
                $"/api/v1/stores/{freeStore.StoreId}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, freeStore);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
