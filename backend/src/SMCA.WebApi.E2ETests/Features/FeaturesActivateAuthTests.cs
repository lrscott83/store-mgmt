using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using RoleType = Domain.Common.Enums.RoleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesActivateAuthTests
{
    private readonly AppTestFactory _f;
    public FeaturesActivateAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Activate_no_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsync("/api/v1/Features/activate", null);
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData((int)RoleType.OwnerAdmin)]
    [InlineData((int)RoleType.StoreUser)]
    [InlineData((int)RoleType.ReSeller)]
    public async Task Activate_as_non_super_admin_returns_403(int roleId)
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, roleId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).PostAsync("/api/v1/Features/activate", null);
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}
