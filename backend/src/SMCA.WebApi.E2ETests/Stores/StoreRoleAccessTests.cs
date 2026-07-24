using System.Net;
using FluentAssertions;
using Domain.Common.Enums;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreRoleAccessTests
{
    private readonly AppTestFactory _f;
    public StoreRoleAccessTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task StoreUser_cannot_reach_stores_controller_returns_403()
    {
        var u = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, u.UserId, u.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, u.UserId); }
    }

    [Fact]
    public async Task ReSeller_cannot_reach_stores_controller_returns_403()
    {
        var u = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, u.UserId, u.Login).GetAsync("/api/v1/stores/by-current-user");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, u.UserId); }
    }
}