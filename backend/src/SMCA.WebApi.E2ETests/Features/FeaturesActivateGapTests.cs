using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Domain.Entities.Features;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using FeatureType = Domain.Common.Enums.FeatureType;
using ModuleType = Domain.Common.Enums.ModuleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesActivateGapTests
{
    private readonly AppTestFactory _f;
    public FeaturesActivateGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Create branch: Egress(33) absent -> activate creates it (Inventory=3, order 71, both flags true).
    [Fact]
    public async Task Activate_creates_Egress_when_missing()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        await FeatureSeed.DeleteEgressAsync(_f); // force the create branch
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsync("/api/v1/Features/activate", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var egress = await db.Set<Feature>().FindAsync((int)FeatureType.Egress);
            egress.Should().NotBeNull();
            egress!.ModuleId.Should().Be((int)ModuleType.Inventory);
            egress.Order.Should().Be(71);
            egress.IsActive.Should().BeTrue();
            egress.AvailableToStore.Should().BeTrue();
        }
        // snap.EgressExisted was false (we deleted it) -> RestoreAsync removes the created row.
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // Existing branch: after two activates, Egress(33) is a single PK row, not duplicated.
    [Fact]
    public async Task Activate_does_not_duplicate_Egress_when_present()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, admin, login);
            await client.PostAsync("/api/v1/Features/activate", null); // ensures Egress exists
            await client.PostAsync("/api/v1/Features/activate", null); // 2nd call must not re-insert
            (await FeatureSeed.EgressCountAsync(_f)).Should().Be(1);
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // Null-guard tolerance: with an optional target (TodayReports=50) absent, activate still 200 (no throw).
    [Fact]
    public async Task Activate_tolerates_missing_optional_seed_row()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);

        int moduleId = 0, order = 0; bool availableToStore = false, existed;
        string name = "TodayReports", description = "";
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var tr = await db.Set<Feature>().FindAsync((int)FeatureType.TodayReports);
            existed = tr is not null;
            if (tr is not null)
            {
                moduleId = tr.ModuleId; order = tr.Order; availableToStore = tr.AvailableToStore;
                name = tr.Name; description = tr.Description;
                db.Set<Feature>().Remove(tr);
                await db.SaveChangesAsync();
            }
        }
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsync("/api/v1/Features/activate", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK); // null-guard skips the missing row, no throw
        }
        finally
        {
            if (existed)
            {
                using var scope = _f.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                if (await db.Set<Feature>().FindAsync((int)FeatureType.TodayReports) is null)
                {
                    db.Set<Feature>().Add(Feature.Create((int)FeatureType.TodayReports,
                        name, description, moduleId, order, availableToStore, true));
                    await db.SaveChangesAsync();
                }
            }
            await FeatureSeed.RestoreAsync(_f, snap);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    // Verb mismatch: GET on the POST-only activate route.
    [Fact]
    public async Task Activate_with_GET_verb_returns_405()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/Features/activate");
        r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    // Command is a parameterless record: an unexpected body is ignored, call still 200.
    [Fact]
    public async Task Activate_ignores_unexpected_request_body()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var snap = await FeatureSeed.SnapshotAsync(_f);
        try
        {
            var body = new StringContent("{\"junk\":true}", Encoding.UTF8, "application/json");
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).PostAsync("/api/v1/Features/activate", body);
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await FeatureSeed.RestoreAsync(_f, snap); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}
