using System.Net;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesAvailableTests
{
    private readonly AppTestFactory _f;
    public FeaturesAvailableTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Available_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/available");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // NOTE: StoresAdmin cannot reach this endpoint despite the method-level
    // [HasPermission(SuperAdmin, StoresAdmin)] because the class-level
    // [HasPermission(SuperAdmin)] filter blocks ALL non-SuperAdmin users first.
    // Only SuperAdmin can access /api/v1/Features/available.
}
