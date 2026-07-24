using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthRegisterTests
{
    private readonly HttpClient _client;

    public AuthRegisterTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    [Fact]
    public async Task Register_with_empty_body_returns_400_from_validation()
    {
        // RegisterCommandValidator requires Login/Password/FullName/CellPhone/StoreName.
        var response = await _client.PostAsJsonAsync("/api/v1/auth/register",
            new { Login = "", Password = "", FullName = "", CellPhone = "", Email = (string?)null, StoreName = "", Code = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.Errors.Should().NotBeEmpty();
    }
}
