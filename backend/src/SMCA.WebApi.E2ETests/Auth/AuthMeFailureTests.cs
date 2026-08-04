using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthMeFailureTests
{
    private readonly WebAppFixture _fixture;

    public AuthMeFailureTests(WebAppFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Me_with_malformed_token_returns_401()
    {
        var client = AuthTestHelpers.BearerClient(_fixture.Factory, "not-a-real-jwt");
        var res = await client.GetAsync("/api/v1/auth/me");
        res.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Me_with_token_for_unknown_user_returns_404_with_NotFound_body()
    {
        var unknownId = Guid.NewGuid();
        var token = AuthTestHelpers.MintToken(_fixture.Factory, unknownId, $"ghost_{unknownId:N}@test.com");
        var client = AuthTestHelpers.BearerClient(_fixture.Factory, token);

        var res = await client.GetAsync("/api/v1/auth/me");
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.ActionCode.Should().Be(404);
        body.Errors.Should().ContainSingle(e => e.Code == "User.NotFound");
    }

    [Fact]
    public async Task Me_with_token_for_inactive_user_returns_404_with_Inactive_body()
    {
        var login = $"inactive_me_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedInactiveUserAsync(_fixture.Factory, login, "Password123");
        try
        {
            var token = AuthTestHelpers.MintToken(_fixture.Factory, userId, login);
            var client = AuthTestHelpers.BearerClient(_fixture.Factory, token);

            var res = await client.GetAsync("/api/v1/auth/me");
            res.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(404);
            body.Errors.Should().ContainSingle(e => e.Code == "Auth.AccountInactive");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, userId);
        }
    }

    [Fact]
    public async Task Me_with_inactive_user_token_second_call_returns_401_from_blacklist()
    {
        var login = $"inactive_me_{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedInactiveUserAsync(_fixture.Factory, login, "Password123");
        try
        {
            var token = AuthTestHelpers.MintToken(_fixture.Factory, userId, login);
            var client = AuthTestHelpers.BearerClient(_fixture.Factory, token);

            // First call: inactive user → 404 (the handler blacklists the token in the process).
            var first = await client.GetAsync("/api/v1/auth/me");
            first.StatusCode.Should().Be(HttpStatusCode.NotFound);

            // Second call with the same (now blacklisted) token → 401 from the blacklist
            // middleware, action NOT executed. The body is the app's OnChallenge message
            // ("Token Validation Has Failed. Request Access Denied"), NOT the /auth/me
            // envelope — the action never ran, so no AccountInactive payload exists.
            // 404-then-401 is intended: both report the same verdict — "session over".
            var second = await client.GetAsync("/api/v1/auth/me");
            second.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            var body = await second.Content.ReadAsStringAsync();
            body.Should().NotContain("AccountInactive");
            body.Should().NotContain("succeeded");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, userId);
        }
    }
}