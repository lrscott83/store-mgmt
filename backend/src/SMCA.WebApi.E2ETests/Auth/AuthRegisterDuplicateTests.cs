using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthRegisterDuplicateTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthRegisterDuplicateTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Register_with_duplicate_login_returns_400()
    {
        var login = $"dup-{Guid.NewGuid():N}@test.com";
        Guid tenantId = Guid.Empty;
        try
        {
            var first = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = "Dup Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = $"Store-{Guid.NewGuid():N}",
                Code = (string?)null
            });
            first.StatusCode.Should().Be(HttpStatusCode.OK);

            var created = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            created.Should().NotBeNull();
            tenantId = created!.TenantId;

            var second = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = "Dup Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = $"Store-{Guid.NewGuid():N}",
                Code = (string?)null
            });

            second.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await second.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().Contain(e => e.Code == "Login");
        }
        finally
        {
            if (tenantId != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, tenantId);
        }
    }
}