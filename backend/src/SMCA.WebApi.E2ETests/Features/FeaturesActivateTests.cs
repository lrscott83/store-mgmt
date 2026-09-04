using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Domain.Entities.Modules;
using Domain.Entities.Features;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesActivateTests
{
    private readonly AppTestFactory _f;
    public FeaturesActivateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Activate_as_super_admin_returns_200_true()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login)
                .PostAsync("/api/v1/Features/activate", content: null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Module>().FindAsync(6))!.IsActive.Should().BeTrue();   // Statistics
            (await db.Set<Module>().FindAsync(6))!.Price.Should().Be(1000);
            (await db.Set<Feature>().FindAsync(60))!.IsActive.Should().BeTrue(); // Dashboard
            (await db.Set<Feature>().FindAsync(50))!.IsActive.Should().BeTrue(); // TodayReports
            (await db.Set<Feature>().FindAsync(33)).Should().NotBeNull();        // Egress
            (await db.Set<Feature>().FindAsync(36)).Should().NotBeNull();        // Warehouses
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // NOTE: activate always returns true because repository UpdateAsync marks entities as Modified
    // regardless of value changes, so SaveChangesAsync always returns > 0.
    [Fact]
    public async Task Activate_twice_both_return_true()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, admin, login);
            var first = await (await client.PostAsync("/api/v1/Features/activate", null))
                .Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            var second = await (await client.PostAsync("/api/v1/Features/activate", null))
                .Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            first!.Data.Should().BeTrue();
            second!.Data.Should().BeTrue();
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
