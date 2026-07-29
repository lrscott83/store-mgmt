using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class RegisterStorePaymentValidationTests
{
    private readonly AppTestFactory _f;
    public RegisterStorePaymentValidationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Pay_withEmptyStoreId_returns400_codeStoreId()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            var response = await client.PostAsync($"/api/v1/stores/{Guid.Empty}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().Contain(e => e.Code == "StoreId");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
