using Domain.Entities.Features;
using Domain.Entities.Modules;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;

using Domain.Entities.StoreRoleFeatures;

namespace SMCA.WebApi.E2ETests.Features;

// Snapshot of the rows `activate` mutates, so a test can restore the shared seed in finally.
public sealed record ActivateSnapshot(
    bool StatisticsActive, float StatisticsPrice, bool ReportsActive,
    bool DashboardActive, bool TodayReportsActive, bool EgressExisted);

public static class FeatureSeed
{
    // --- inactive feature for the List tests (insert + delete; our own row) ---
    public static async Task<int> InsertInactiveFeatureAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var feature = Feature.Create(9099, "E2E-Inactive", "e2e inactive feature",
            (int)Domain.Common.Enums.ModuleType.Inventory, 999, false, false);
        db.Set<Feature>().Add(feature);
        await db.SaveChangesAsync();
        return feature.Id;
    }

    public static async Task DeleteFeatureAsync(AppTestFactory f, int id)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var feature = await db.Set<Feature>().FindAsync(id);
        if (feature is not null) { db.Set<Feature>().Remove(feature); await db.SaveChangesAsync(); }
    }

    // --- activate snapshot/restore (use .AsTracking() because NoTracking default) ---
    public static async Task<ActivateSnapshot> SnapshotAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var stats = await db.Set<Module>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(m => m.Id == 6);
        var reports = await db.Set<Module>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(m => m.Id == 5);
        var dashboard = await db.Set<Feature>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(fe => fe.Id == 60);
        var todayReports = await db.Set<Feature>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(fe => fe.Id == 50);
        var egress = await db.Set<Feature>().IgnoreQueryFilters().FirstOrDefaultAsync(fe => fe.Id == 33);
        return new ActivateSnapshot(
            stats?.IsActive ?? false, stats?.Price ?? 0, reports?.IsActive ?? false,
            dashboard?.IsActive ?? false, todayReports?.IsActive ?? false, egress is not null);
    }

    /// <summary>
    /// Remove StoreRoleFeature rows referencing the given feature IDs.
    /// Needed because DeleteBehavior.Restrict prevents deleting Feature rows that are referenced.
    /// Tests that seed StoreUser with features (via AuthzSeed.SeedStoreUserAsync) can leave
    /// StoreRoleFeature rows that block cleanup in RestoreAsync and individual test finally blocks.
    /// </summary>
    public static async Task CleanFeatureRefsAsync(AppTestFactory f, params int[] featureIds)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var refs = await db.Set<StoreRoleFeature>()
            .IgnoreQueryFilters()
            .Where(srf => featureIds.Contains(srf.FeatureId))
            .ToListAsync();
        db.Set<StoreRoleFeature>().RemoveRange(refs);
        await db.SaveChangesAsync();
    }

    public static async Task RestoreAsync(AppTestFactory f, ActivateSnapshot s)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // 🛡️ Cascade manual: remove StoreRoleFeature refs before touching features that may be referenced
        var featureIdsToClean = new List<int>();
        if (!s.EgressExisted) featureIdsToClean.Add(33);
        featureIdsToClean.Add(50); // TodayReports may also have stale refs
        if (featureIdsToClean.Count > 0)
        {
            var refs = await db.Set<StoreRoleFeature>()
                .IgnoreQueryFilters()
                .Where(srf => featureIdsToClean.Contains(srf.FeatureId))
                .ToListAsync();
            db.Set<StoreRoleFeature>().RemoveRange(refs);
        }

        var stats = await db.Set<Module>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(m => m.Id == 6);
        if (stats is not null) { stats.IsActive = s.StatisticsActive; stats.Price = s.StatisticsPrice; }
        var reports = await db.Set<Module>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(m => m.Id == 5);
        if (reports is not null) reports.IsActive = s.ReportsActive;
        var dashboard = await db.Set<Feature>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(fe => fe.Id == 60);
        if (dashboard is not null) dashboard.IsActive = s.DashboardActive;
        var todayReports = await db.Set<Feature>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(fe => fe.Id == 50);
        if (todayReports is not null) todayReports.IsActive = s.TodayReportsActive;
        if (!s.EgressExisted)
        {
            var egress = await db.Set<Feature>().IgnoreQueryFilters().FirstOrDefaultAsync(fe => fe.Id == 33);
            if (egress is not null) db.Set<Feature>().Remove(egress);
        }
        await db.SaveChangesAsync();
    }

    // ---------- gap-fill helpers (09c) ----------

    // Active/inactive feature under an arbitrary module (id 909x range). Delete via DeleteFeatureAsync.
    public static async Task<int> InsertFeatureUnderModuleAsync(AppTestFactory f, int moduleId, bool isActive, int id)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var feature = Feature.Create(id, $"E2E-{id}", "e2e gap feature", moduleId, 995, true, isActive);
        db.Set<Feature>().Add(feature);
        await db.SaveChangesAsync();
        return feature.Id;
    }

    // Throwaway INACTIVE module (9090) + ACTIVE feature (9092) under it. Delete feature THEN module.
    public static async Task<(int ModuleId, int FeatureId)> InsertInactiveModuleWithActiveFeatureAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var module = Module.Create(9090, "E2E-InactiveModule", 990, false, 0f, false, false);
        db.Set<Module>().Add(module);
        var feature = Feature.Create(9092, "E2E-UnderInactiveModule", "e2e", 9090, 996, true, true);
        db.Set<Feature>().Add(feature);
        await db.SaveChangesAsync();
        return (module.Id, feature.Id);
    }

    public static async Task DeleteModuleAsync(AppTestFactory f, int id)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var m = await db.Set<Module>().FindAsync(id);
        if (m is not null) { db.Set<Module>().Remove(m); await db.SaveChangesAsync(); }
    }

    // Force the activate create-branch: ensure Egress(33) is ABSENT.
    public static async Task DeleteEgressAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        // 🛡️ Remove StoreRoleFeature refs first (FK constraint)
        var refs = await db.Set<StoreRoleFeature>()
            .IgnoreQueryFilters()
            .Where(srf => srf.FeatureId == (int)Domain.Common.Enums.FeatureType.Egress)
            .ToListAsync();
        db.Set<StoreRoleFeature>().RemoveRange(refs);
        var egress = await db.Set<Feature>().FindAsync((int)Domain.Common.Enums.FeatureType.Egress);
        if (egress is not null) { db.Set<Feature>().Remove(egress); await db.SaveChangesAsync(); }
    }

    // Egress(33) is a PK row, so this is 0 or 1.
    public static async Task<int> EgressCountAsync(AppTestFactory f)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var egress = await db.Set<Feature>().FindAsync((int)Domain.Common.Enums.FeatureType.Egress);
        return egress is null ? 0 : 1;
    }

    // Flip the Management(7) module IsActive flag; returns the PREVIOUS value so the caller can restore it.
    public static async Task<bool> SetManagementModuleActiveAsync(AppTestFactory f, bool isActive)
    {
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var m = await db.Set<Module>().IgnoreQueryFilters().AsTracking().FirstOrDefaultAsync(x => x.Id == (int)Domain.Common.Enums.ModuleType.Management);
        var previous = m?.IsActive ?? false;
        if (m is not null) { m.IsActive = isActive; await db.SaveChangesAsync(); }
        return previous;
    }
}
