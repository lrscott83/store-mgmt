using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Migrations;
using Microsoft.EntityFrameworkCore.Storage;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Warehouses;

/// <summary>
/// WMA-5a (spec warehouses-module-assignment): the migration's Down removes the per-store
/// rows (StoreRoleFeature before StoreModule) and the catalog rows, reverting the assignment
/// cleanly. The Down SQL is executed verbatim inside a transaction that is then rolled back,
/// so the shared smca_test state keeps the module after the test.
///
/// The Down statements mirror exactly what the generated migration class emits:
/// WarehousesModuleBackfill.DownSql (SRF -> StoreModule) followed by the EF DeleteData
/// calls (Feature 36 -> Feature 37 -> Module 13) and the history-row delete.
/// </summary>
[Collection("e2e")]
public sealed class WarehousesRollbackTests
{
    private const string MigrationId = "20260905224007_Add-Warehouses-Module";

    private static readonly int[] WarehouseFeatureIds = [36, 37];

    private readonly AppTestFactory _f;
    public WarehousesRollbackTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Migration_down_reverts_assignment_and_catalog_inside_rolled_back_transaction()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Precondition (WMC-1a/2a re-asserted): catalog present.
        (await db.Set<Module>().FindAsync(13)).Should().NotBeNull();
        (await db.Set<Feature>().FindAsync(36)).Should().NotBeNull();
        (await db.Set<Feature>().FindAsync(37)).Should().NotBeNull();

        await using var tx = await db.Database.BeginTransactionAsync();
        try
        {
            // 1) DownSql: per-store rows, SRF before StoreModule (same constant the migration Down runs).
            await db.Database.ExecuteSqlRawAsync(WarehousesModuleBackfill.DownSql);
            // 2) The exact DeleteData statements the generated Down emits, in its order.
            await db.Database.ExecuteSqlRawAsync(
                """
                DELETE FROM "Feature" WHERE "Id" = 36;
                DELETE FROM "Feature" WHERE "Id" = 37;
                DELETE FROM "Module" WHERE "Id" = 13;
                DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20260905224007_Add-Warehouses-Module';
                """);

            // Everything the migration created is gone.
            (await db.Set<Module>().IgnoreQueryFilters().AnyAsync(m => m.Id == 13)).Should().BeFalse();
            (await db.Set<Feature>().IgnoreQueryFilters()
                .AnyAsync(f => WarehouseFeatureIds.Contains(f.Id))).Should().BeFalse();
            (await db.Set<StoreModule>().IgnoreQueryFilters()
                .AnyAsync(sm => sm.ModuleId == 13)).Should().BeFalse("Down deletes per-store rows after SRF");
            (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .AnyAsync(srf => WarehouseFeatureIds.Contains(srf.FeatureId))).Should().BeFalse();

            var history = await db.Database.SqlQueryRaw<string>(
                $"SELECT \"MigrationId\" AS \"Value\" FROM \"__EFMigrationsHistory\" WHERE \"MigrationId\" = '{MigrationId}'")
                .ToListAsync();
            history.Should().BeEmpty("Down removes the history row");
        }
        finally
        {
            // Roll back so the shared database keeps the applied migration.
            await tx.RollbackAsync();
        }

        // Postcondition: state restored (module 13 back) — proves the rollback worked.
        (await db.Set<Module>().FindAsync(13)).Should().NotBeNull();
        (await db.Set<Feature>().FindAsync(36)).Should().NotBeNull();
    }
}
