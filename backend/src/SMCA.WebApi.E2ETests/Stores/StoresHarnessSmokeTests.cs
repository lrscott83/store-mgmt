using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoresHarnessSmokeTests
{
    private readonly HttpClient _client;
    public StoresHarnessSmokeTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    [Fact]
    public async Task By_current_user_without_token_returns_401()
    {
        var response = await _client.GetAsync("/api/v1/stores/by-current-user");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
