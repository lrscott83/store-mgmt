using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class PaymentDateTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public PaymentDateTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    [Fact]
    public async Task SuperAdmin_sets_payment_date_returns_200()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/payment-date",
                    new { PaymentStartDate = "2026-07-01" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_cannot_set_payment_date_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)
                .PutAsJsonAsync($"/api/v1/stores/{sa.StoreId}/payment-date",
                    new { PaymentStartDate = "2026-07-01" });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, sa);
        }
    }

    [Fact]
    public async Task ReSeller_cannot_set_payment_date_returns_403()
    {
        var fx = await BillingSeed.SeedPaidStoreWithReSellerAsync(
            _f, new DateOnly(2026, 6, 1), 1000f, 0f, 25f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, fx.UserId, fx.Login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/payment-date",
                    new { PaymentStartDate = "2026-07-01" });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
        }
    }

    [Fact]
    public async Task Unauthenticated_cannot_set_payment_date_returns_401()
    {
        var r = await _f.CreateClient()
            .PutAsJsonAsync($"/api/v1/stores/{Guid.NewGuid()}/payment-date",
                new { PaymentStartDate = "2026-07-01" });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Unknown_store_id_returns_400()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{Guid.NewGuid()}/payment-date",
                    new { PaymentStartDate = "2026-07-01" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Empty_store_id_returns_400_code_StoreId()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{Guid.Empty}/payment-date",
                    new { PaymentStartDate = "2026-07-01" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Errors.Should().Contain(e => e.Code == "StoreId");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Missing_paymentStartDate_returns_400_code_PaymentStartDate()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}/payment-date",
                    new { });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Errors.Should().Contain(e => e.Code == "PaymentStartDate");
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
