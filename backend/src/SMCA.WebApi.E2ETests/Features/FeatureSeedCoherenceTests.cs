using Domain.Common.Enums;
using Domain.Entities.Features;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Features;

/// <summary>
/// Authorized seed-to-database drift canary (2026-09-25). It intentionally fails today
/// because Egress (33) and StorePayment (91) are declared AvailableToStore by the EF seed
/// but are absent from the migrated smca_test Feature table. Keep this canary strict; it
/// will pass when the drift is resolved by correcting the model seed or adding a migration
/// that materializes the declared rows.
/// </summary>
[Collection("e2e")]
public sealed class FeatureSeedCoherenceTests
{
    private readonly AppTestFactory _f;
    public FeatureSeedCoherenceTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Seed_features_available_to_store_exist_active_and_available_in_database()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var seedRows = db.GetService<IDesignTimeModel>().Model.GetEntityTypes()
            .Single(entityType => entityType.ClrType == typeof(Feature))
            .GetSeedData();

        var liveFeatures = await db.Set<Feature>()
            .IgnoreQueryFilters()
            .AsNoTracking()
            .ToDictionaryAsync(feature => feature.Id);

        var discrepancies = new List<string>();
        foreach (var seedRow in seedRows)
        {
            var featureId = Convert.ToInt32(seedRow["Id"]);
            var moduleId = Convert.ToInt32(seedRow["ModuleId"]);
            var seedIsActive = Convert.ToBoolean(seedRow["IsActive"]);
            var seedAvailableToStore = Convert.ToBoolean(seedRow["AvailableToStore"]);

            if (!seedAvailableToStore)
                continue;

            liveFeatures.TryGetValue(featureId, out var liveFeature);
            if (liveFeature is { IsActive: true, AvailableToStore: true })
                continue;

            var featureName = Enum.IsDefined(typeof(FeatureType), featureId)
                ? ((FeatureType)featureId).ToString()
                : "unknown";
            var liveState = liveFeature is null
                ? "missing"
                : $"IsActive={liveFeature.IsActive}, AvailableToStore={liveFeature.AvailableToStore}";

            discrepancies.Add(
                $"FeatureId={featureId} ({featureName}), ModuleId={moduleId} | " +
                $"seed: IsActive={seedIsActive}, AvailableToStore={seedAvailableToStore} | live: {liveState}");
        }

        Assert.True(
            discrepancies.Count == 0,
            $"Seed-to-database Feature drift detected ({discrepancies.Count} discrepancies):{Environment.NewLine}" +
            $"{string.Join(Environment.NewLine, discrepancies)}{Environment.NewLine}" +
            "Resolve the drift by correcting the model seed or adding a migration that materializes the declared feature.");
    }
}
