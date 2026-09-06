using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Migrations;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Warehouses;

/// <summary>
/// WM-TE2 (spec warehouses-module-assignment): the migration's per-store INSERT-SELECT SQL
/// (WarehousesModuleBackfill, the single source of truth shared by migration + VPS script)
/// executed against a seeded store produces exactly the runtime row shapes, skips inactive
/// stores, and is idempotent.
/// </summary>
[Collection("e2e")]
public sealed class WarehousesAssignmentTests
{
    private static readonly int[] WarehouseFeatureIds = [36, 37];
    private readonly AppTestFactory _f;
    public WarehousesAssignmentTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Backfill_sql_creates_exact_runtime_shapes_for_active_store()
    {
        // WMA-1a + WMA-2a: seed a store the way runtime does (Management module via StoreModule.Create),
        // then run the migration SQL verbatim and compare shapes.
        var fx = await StoreSeed.SeedStoreAsync(_f, $"WH-A-{Guid.NewGuid():N}", approved: true);
        try
        {
            await ExecuteBackfillAsync();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var sm = await db.Set<StoreModule>().IgnoreQueryFilters()
                .FirstOrDefaultAsync(x => x.StoreId == fx.StoreId && x.ModuleId == WarehousesModuleBackfill.ModuleId);
            sm.Should().NotBeNull();
            sm!.ModulePriceIncluded.Should().BeFalse();
            sm.Price.Should().Be(2f);
            sm.ModulePrice.Should().Be(2f);
            sm.ModuleDiscountPrice.Should().Be(0f);
            sm.ModulePercentDiscountPrice.Should().Be(100f);
            sm.IsActive.Should().BeTrue();
            sm.TenantId.Should().Be(Domain.Common.Constants.DataUtils.DefaultTenant.Id);
            sm.CreatedBy.Should().Be(Domain.Common.Constants.DataUtils.SuperAdminUser.Id);
            sm.CreatedDate.Should().BeAfter(DateTimeOffset.UtcNow.AddMinutes(-5));

            var srfs = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(x => x.StoreId == fx.StoreId && WarehouseFeatureIds.Contains(x.FeatureId)).ToListAsync();
            srfs.Should().HaveCount(2);
            foreach (var srf in srfs)
            {
                srf.RoleId.Should().Be(WarehousesModuleBackfill.OwnerAdminRoleId); // OwnerAdmin only (WMA-2b: no StoreUser row)
                srf.IsActive.Should().BeTrue();
                srf.TenantId.Should().Be(Domain.Common.Constants.DataUtils.DefaultTenant.Id);
                srf.CreatedBy.Should().Be(Domain.Common.Constants.DataUtils.SuperAdminUser.Id);
            }
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); }
    }

    [Fact]
    public async Task Backfill_sql_skips_inactive_store()
    {
        // WMA-1b: inactive stores receive nothing.
        var fx = await StoreSeed.SeedStoreAsync(_f, $"WH-I-{Guid.NewGuid():N}", approved: true);
        try
        {
            await StoreSeed.DeactivateStoreAsync(_f, fx.StoreId);
            await ExecuteBackfillAsync();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<StoreModule>().IgnoreQueryFilters()
                .AnyAsync(x => x.StoreId == fx.StoreId && x.ModuleId == WarehousesModuleBackfill.ModuleId))
                .Should().BeFalse();
            (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .AnyAsync(x => x.StoreId == fx.StoreId && WarehouseFeatureIds.Contains(x.FeatureId)))
                .Should().BeFalse();
        }
        finally
        {
            // reactivate so cleanup helpers can remove the row (they use the active-set helpers only for reads)
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var s = await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AsTracking()
                    .FirstAsync(x => x.Id == fx.StoreId);
                s.IsActive = true;
                await db.SaveChangesAsync();
            }
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
        }
    }

    [Fact]
    public async Task Backfill_sql_is_idempotent()
    {
        // WMA-1c: running the SQL twice inserts nothing extra and does not throw.
        var fx = await StoreSeed.SeedStoreAsync(_f, $"WH-ID-{Guid.NewGuid():N}", approved: true);
        try
        {
            await ExecuteBackfillAsync();
            await ExecuteBackfillAsync();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<StoreModule>().IgnoreQueryFilters()
                .CountAsync(x => x.StoreId == fx.StoreId && x.ModuleId == WarehousesModuleBackfill.ModuleId))
                .Should().Be(1);
            (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .CountAsync(x => x.StoreId == fx.StoreId && WarehouseFeatureIds.Contains(x.FeatureId)))
                .Should().Be(2);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); }
    }

    private async Task ExecuteBackfillAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        // Execute the exact migration SQL — the same strings the VPS script mirrors.
        await db.Database.ExecuteSqlRawAsync(WarehousesModuleBackfill.StoreModuleSql);
        await db.Database.ExecuteSqlRawAsync(WarehousesModuleBackfill.StoreRoleFeatureSql);
    }
}
