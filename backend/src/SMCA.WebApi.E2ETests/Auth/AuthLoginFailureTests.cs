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
    public async Task Login_with_wrong_password_for_active_user_returns_200_with_InvalidPassword()
    {
        var login = $"wrongpass_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedSuperAdminAsync(_factory, login, "Password123");
        try
        {
            var res = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "WrongPassword1" });

            res.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(400);
            body.Errors.Should().ContainSingle(e => e.Code == "User.InvalidPassword");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }

    [Fact]
    public async Task Login_with_inactive_user_returns_200_with_Inactive()
    {
        var login = $"inactive_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedInactiveUserAsync(_factory, login, "Password123");
        try
        {
            var res = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "Password123" });

            res.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(400);
            body.Errors.Should().ContainSingle(e => e.Code == "User.Inactive");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }
}