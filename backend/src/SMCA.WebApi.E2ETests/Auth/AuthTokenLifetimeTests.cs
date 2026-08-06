using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// A token lives for 35 days. That is a business rule, not a tuning knob: the React client
/// stamps its own session expiry from a hardcoded 35-day constant
/// (frontend-react/apps/web-store-pos/app/shared/lib/stores/auth-store.ts) instead of reading
/// the token's exp claim. If the backend ever issues a shorter-lived token, the client keeps
/// believing the session is alive long after the API starts rejecting it.
///
/// These tests pin the rule end to end, so a configuration change cannot move it silently.
/// </summary>
[Collection("e2e")]
public sealed class AuthTokenLifetimeTests
{
    private const int ExpectedLifetimeDays = 35;

    // The clock advances between the API minting the token and this assertion running, so the
    // comparison is a window rather than an equality. It is tight enough that a lifetime of 34
    // or 36 days fails.
    private static readonly TimeSpan Tolerance = TimeSpan.FromHours(1);

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthTokenLifetimeTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Login_returns_a_token_that_expires_in_35_days()
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

            var expected = DateTime.UtcNow.AddDays(ExpectedLifetimeDays);

            // What the API reports back to the client.
            body.Data!.ExpiresIn.Should().BeCloseTo(expected, Tolerance);

            // What the token itself carries. This is the one that decides when the API starts
            // rejecting the caller, so it is asserted separately from the reported value.
            var token = new JwtSecurityTokenHandler().ReadJwtToken(body.Data.AuthToken);
            token.ValidTo.Should().BeCloseTo(expected, Tolerance);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }

    [Fact]
    public async Task Register_returns_a_token_that_expires_in_35_days()
    {
        var login = $"owner-{Guid.NewGuid():N}@test.com";
        var storeName = $"Store-{Guid.NewGuid():N}";

        var response = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = "Token Lifetime Owner",
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = storeName,
            Code = (string?)null
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthData>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();

        var expected = DateTime.UtcNow.AddDays(ExpectedLifetimeDays);

        body.Data!.ExpiresIn.Should().BeCloseTo(expected, Tolerance);

        var token = new JwtSecurityTokenHandler().ReadJwtToken(body.Data.AuthToken);
        token.ValidTo.Should().BeCloseTo(expected, Tolerance);
    }
}
