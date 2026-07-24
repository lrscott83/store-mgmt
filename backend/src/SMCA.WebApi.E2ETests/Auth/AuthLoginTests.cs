using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLoginTests
{
    private readonly HttpClient _client;

    public AuthLoginTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    [Fact]
    public async Task Login_with_empty_credentials_returns_400_from_validation()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
            new { Login = "", Password = "" });

        // FluentValidation -> ValidationException -> ErrorHandlerMiddleware sets HTTP 400.
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.Errors.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Login_with_unknown_user_returns_200_with_failure_body()
    {
        // Password length >= 8 passes validation, so the request reaches the handler,
        // which returns ResponseResult.Failure(400). The controller wraps it in Ok() => HTTP 200.
        var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
            new { Login = "nobody-" + Guid.NewGuid().ToString("N") + "@test.com", Password = "Password123" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.ActionCode.Should().Be(400);
    }
}
