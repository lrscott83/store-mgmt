using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLoginFailureTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthLoginFailureTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Login_with_wrong_password_for_active_user_returns_401()
    {
        var login = $"wrongpass_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedSuperAdminAsync(_factory, login, "Password123");
        try
        {
            var res = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "WrongPassword1" });

            res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().ContainSingle(e => e.Code == "Auth.InvalidCredentials");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }

    [Fact]
    public async Task Login_with_inactive_user_returns_403()
    {
        var login = $"inactive_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedInactiveUserAsync(_factory, login, "Password123");
        try
        {
            var res = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "Password123" });

            res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().ContainSingle(e => e.Code == "Auth.AccountInactive");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }
}
