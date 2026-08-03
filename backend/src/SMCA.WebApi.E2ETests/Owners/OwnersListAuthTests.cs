using System.Net;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersListAuthTests
{
    private readonly AppTestFactory _f;
    public OwnersListAuthTests(WebAppFixture fixture) => _f = fixture.Factory;

    // OQ-1 1a: an authenticated actor that is neither SuperAdmin nor ReSeller
    // must be rejected with 403 Forbidden — never 400 "UserNotFound".
    [Fact]
    public async Task List_owners_as_unauthorized_returns_403()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/Owners/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await r.Content.ReadAsStringAsync();
            body.Should().NotContain("UserNotFound");
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}
