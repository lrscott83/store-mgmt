using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLoginSuccessTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthLoginSuccessTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Login_with_seeded_super_admin_returns_200_and_token()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedSuperAdminAsync(_factory, login, "Password123");
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "Password123" });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.AuthToken.Should().NotBeNullOrEmpty();
            body.Data.Login.Should().Be(login);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }
}