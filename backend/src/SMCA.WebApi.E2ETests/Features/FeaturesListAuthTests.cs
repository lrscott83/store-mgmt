using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using RoleType = Domain.Common.Enums.RoleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesListAuthTests
{
    private readonly AppTestFactory _f;
    public FeaturesListAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_no_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/Features/all/true");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData((int)RoleType.OwnerAdmin)]
    [InlineData((int)RoleType.StoreUser)]
    [InlineData((int)RoleType.ReSeller)]
    public async Task List_as_non_super_admin_returns_403(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/Features/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}
