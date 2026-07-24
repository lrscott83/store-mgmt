using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthLoginValidationTests
{
    private readonly HttpClient _client;
    public AuthLoginValidationTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    private async Task Assert400(object body, string code)
    {
        var r = await _client.PostAsJsonAsync("/api/v1/auth/login", body);
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        b!.Succeeded.Should().BeFalse();
        b.Errors.Should().Contain(e => e.Code == code);
    }

    [Fact] public Task Login_empty_login_400_code_Login()
        => Assert400(new { Login = "", Password = "Password123" }, "Login");

    [Fact] public Task Login_empty_password_400_code_Password()
        => Assert400(new { Login = "user@test.com", Password = "" }, "Password");

    [Fact] public Task Login_short_password_400_code_Password()
        => Assert400(new { Login = "user@test.com", Password = "abc" }, "Password");
}