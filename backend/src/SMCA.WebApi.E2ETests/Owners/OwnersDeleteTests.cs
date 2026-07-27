using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersDeleteTests
{
    private readonly AppTestFactory _f;
    public OwnersDeleteTests(WebAppFixture fixture) => _f = fixture.Factory;

    // PIN BUG: DeleteOwnerCommandHandler._storeUserRepository is declared but never injected -> NRE -> 500
    // on any authorized valid delete. Update when the injection is fixed.
    [Fact]
    public async Task Delete_owner_currently_returns_500()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/Owners/{owner.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task Delete_owner_nonexistent_id_returns_400_Id()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).DeleteAsync($"/api/v1/Owners/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "Id");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // The delete gate is SuperAdmin || OwnerAdmin — a ReSeller (allowed on list/create/update) is rejected
    // by the handler with a real 400 (fires before the null-repo crash).
    [Fact]
    public async Task Delete_owner_as_reseller_returns_400_guard()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)Domain.Common.Enums.RoleType.ReSeller);
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).DeleteAsync($"/api/v1/Owners/{owner.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}