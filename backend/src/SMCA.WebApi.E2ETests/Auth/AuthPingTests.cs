using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthPingTests
{
    private readonly HttpClient _client;

    public AuthPingTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    [Fact]
    public async Task Ping_returns_200_and_true()
    {
        var response = await _client.GetAsync("/api/v1/auth/ping");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync()).Should().Be("true");
    }
}
