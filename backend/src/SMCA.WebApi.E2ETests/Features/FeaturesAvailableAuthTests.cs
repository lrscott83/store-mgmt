using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using RoleType = Domain.Common.Enums.RoleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesAvailableAuthTests
{
    private readonly AppTestFactory _f;
    public FeaturesAvailableAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Available_no_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/Features/available");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // All non-SuperAdmin actors fail. Even full StoresAdmin (OwnerAdmin+Stores+Mgmt) is blocked by
    // the class-level [HasPermission(SuperAdmin)] filter before the method-level widening runs.
    [Theory]
    [InlineData((int)RoleType.StoreUser)]
    [InlineData((int)RoleType.ReSeller)]
    [InlineData((int)RoleType.OwnerAdmin)]
    public async Task Available_as_non_qualifying_actor_returns_403(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/Features/available");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}
