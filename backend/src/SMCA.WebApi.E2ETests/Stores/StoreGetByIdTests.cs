using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreGetByIdTests
{
    private readonly AppTestFactory _f;
    public StoreGetByIdTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Get_existing_store_returns_dto_and_maps_payment_dates()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var name = $"Store-{Guid.NewGuid():N}";
        var fixture = await StoreSeed.SeedStoreAsync(_f, name, approved: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync($"/api/v1/stores/{fixture.StoreId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Id.Should().Be(fixture.StoreId);
            body.Data.Name.Should().Be(name);
            body.Data.Modules.Should().NotBeEmpty();
            body.Data.PaymentStartDate.Should().BeNull();
            body.Data.NextPaymentDate.Should().Be(default(DateOnly));
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_unknown_store_returns_400_property_code_Id()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync($"/api/v1/stores/{Guid.NewGuid()}");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_empty_id_returns_400_property_code_Id()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync($"/api/v1/stores/{Guid.Empty}");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_without_token_returns_401()
    {
        var response = await _f.CreateClient().GetAsync($"/api/v1/stores/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}