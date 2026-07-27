using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersUpdateGapTests
{
    private readonly AppTestFactory _f;
    public OwnersUpdateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(string fullName = "Upd", string cellPhone = "1112223333",
        Guid? reSellerId = null, string? email = null) => new
    {
        ReSellerId = reSellerId, FullName = fullName, CellPhone = cellPhone,
        Email = email, Description = "upd", Guest = false, IsActive = true
    };

    [Fact]
    public async Task Update_owner_empty_cellphone_returns_400_CellPhone()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(cellPhone: ""));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "CellPhone");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Update_owner_nonexistent_reseller_returns_400_ReSellerId()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PutAsJsonAsync($"/api/v1/Owners/{owner.OwnerId}", Body(reSellerId: Guid.NewGuid()));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "ReSellerId");
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}