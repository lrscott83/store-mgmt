using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersCreateValidationTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateValidationTests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task Assert400(object body, string code)
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/Owners", body);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == code);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    private static object Valid(string? login = null, string password = "Password123", string fullName = "E2E Owner",
        string cellphone = "0000000000", Guid? reSellerId = null, string? email = null) => new
    {
        Login = login ?? $"o-{Guid.NewGuid():N}@test.com", Password = password, FullName = fullName,
        Cellphone = cellphone, ReSellerId = reSellerId, Email = email, Description = "e2e"
    };

    [Fact] public Task Create_empty_login_400_Login() => Assert400(Valid(login: ""), "Login");
    [Fact] public Task Create_empty_password_400_Password() => Assert400(Valid(password: ""), "Password");
    [Fact] public Task Create_empty_fullname_400_FullName() => Assert400(Valid(fullName: ""), "FullName");
    [Fact] public Task Create_empty_cellphone_400_Cellphone() => Assert400(Valid(cellphone: ""), "Cellphone");
    [Fact] public Task Create_invalid_email_400_Email() => Assert400(Valid(email: "not-an-email"), "Email");
    [Fact] public Task Create_nonexistent_reseller_400_ReSellerId() => Assert400(Valid(reSellerId: Guid.NewGuid()), "ReSellerId");

    // Duplicate login -> IsUniqueName -> Code == "Login" (same property as empty-login; distinguished by input).
    [Fact]
    public async Task Create_duplicate_login_400_Login()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var existing = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsJsonAsync("/api/v1/Owners",
                new { Login = existing.Login, Password = "Password123", FullName = "Dup", Cellphone = "0",
                      ReSellerId = (Guid?)null, Email = (string?)null, Description = "e2e" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Login");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, existing.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}