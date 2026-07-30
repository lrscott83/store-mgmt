using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLogoutTests
{
    private readonly AppTestFactory _f;
    public AuthLogoutTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Logout_anonymous_returns_200_true()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/auth/logout");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        b.Data.Should().BeTrue();
    }

    [Fact]
    public async Task Logout_with_valid_token_for_seeded_user_returns_200_true()
    {
        var login = $"lo-{Guid.NewGuid():N}@test.com";
        var userId = await AuthTestHelpers.SeedActiveUserAsync(_f, login);
        try
        {
            var token = AuthTestHelpers.MintToken(_f, userId, login);
            var r = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/logout");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();
        }
        finally { await AuthTestHelpers.CleanupUserAsync(_f, userId); }
    }

    [Fact]
    public async Task Logout_with_malformed_token_returns_200_true()
    {
        var r = await AuthTestHelpers.BearerClient(_f, "not-a-real-jwt").GetAsync("/api/v1/auth/logout");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        b.Data.Should().BeTrue();
    }

    [Fact]
    public async Task Logout_with_token_for_unknown_user_returns_200_true()
    {
        var token = AuthTestHelpers.MintToken(_f, Guid.NewGuid(), $"ghost-{Guid.NewGuid():N}@test.com");
        var r = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/logout");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        b.Data.Should().BeTrue();
    }
}