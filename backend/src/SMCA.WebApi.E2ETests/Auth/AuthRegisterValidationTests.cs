using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthRegisterValidationTests
{
    private readonly HttpClient _client;
    public AuthRegisterValidationTests(WebAppFixture fixture) => _client = fixture.Factory.CreateClient();

    private static object Register(string? login = null, string password = "Password123", string fullName = "E2E User",
        string cellPhone = "0000000000", string? email = null, string? storeName = "E2E Store") => new
    {
        Login = login ?? $"reg-{Guid.NewGuid():N}@test.com",
        Password = password, FullName = fullName, CellPhone = cellPhone,
        Email = email, StoreName = storeName, Code = (string?)null
    };

    private async Task Assert400(object body, string code)
    {
        var r = await _client.PostAsJsonAsync("/api/v1/auth/register", body);
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        b!.Succeeded.Should().BeFalse();
        b.Errors.Should().Contain(e => e.Code == code);
    }

    [Fact] public Task Register_empty_login_400_code_Login()
        => Assert400(Register(login: ""), "Login");

    [Fact] public Task Register_empty_password_400_code_Password()
        => Assert400(Register(password: ""), "Password");

    [Fact] public Task Register_short_password_400_code_Password()
        => Assert400(Register(password: "Ab1"), "Password");

    [Fact] public Task Register_password_without_uppercase_400_code_Password()
        => Assert400(Register(password: "password123"), "Password");

    [Fact] public Task Register_empty_fullname_400_code_FullName()
        => Assert400(Register(fullName: ""), "FullName");

    [Fact] public Task Register_empty_cellphone_400_code_CellPhone()
        => Assert400(Register(cellPhone: ""), "CellPhone");

    [Fact] public Task Register_invalid_email_400_code_Email()
        => Assert400(Register(email: "not-an-email"), "Email");

    [Fact] public Task Register_empty_storename_400_code_StoreName()
        => Assert400(Register(storeName: ""), "StoreName");
}