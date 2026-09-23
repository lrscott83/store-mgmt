using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Migrations;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Plans;

/// <summary>
/// Verifies the shared cleanup SQL (<see cref="WholesaleSalesPagoRemoval.CleanupSql"/>)
/// run by the EF migration 20260923155514_RemoveWholesaleSalesFromPagoPlan and by the VPS
/// script backend/scripts/21-20260923-Remove-WholesaleSales-From-Pago.sql: every Pago
/// store loses WholesaleSales (module 12 / feature 39) for good — active or soft-deleted —
/// Superior/VIP stores are untouched, and re-running the SQL is an idempotent no-op.
/// Change wholesale-superior-vip-only, 2026-09-23.
/// </summary>
[Collection("e2e")]
public sealed class WholesaleSalesPagoRemovalTests
{
    private readonly AppTestFactory _f;

    public WholesaleSalesPagoRemovalTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int StatisticsFeatureId = (int)FeatureType.Dashboard; // 60 — unrelated feature that must survive

    [Fact]
    public async Task CleanupSql_removes_wholesale_sales_from_pago_stores_and_leaves_superior_untouched()
    {
        Guid userId = default;
        Guid ownerId = default;
        Guid pagoActiveStoreId = default;
        Guid pagoSoftDeletedStoreId = default;
        Guid superiorStoreId = default;

        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var tenantId = DataUtils.DefaultTenant.Id;

                var login = $"wsrem-{Guid.NewGuid():N}@test.com";
                var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
                    "E2E WholesaleRemoval", "0000000000", login, tenantId);
                db.Set<User>().Add(user);
                var owner = Owner.Create(user.Id, false, tenantId, "E2E WholesaleRemoval Owner");
                db.Set<Owner>().Add(owner);
                await db.SaveChangesAsync();

                userId = user.Id;
                ownerId = owner.Id;

                // Store A — legacy Pago store holding module 12 ACTIVE + feature 39 (OwnerAdmin)
                // plus an unrelated feature (60) that must survive the cleanup.
                var pagoActive = Store.Create($"WS-Pago-A-{Guid.NewGuid():N}", owner.Id, approved: true,
                    tenantId, paymentStartDate: null, storePlanId: (int)StorePlanType.Pago);
                db.Set<Store>().Add(pagoActive);
                // Store B — legacy Pago store holding module 12 SOFT-DELETED (IsActive=false):
                // the cleanup must hard-delete those rows too ("active or soft-deleted").
                var pagoSoftDeleted = Store.Create($"WS-Pago-B-{Guid.NewGuid():N}", owner.Id, approved: true,
                    tenantId, paymentStartDate: null, storePlanId: (int)StorePlanType.Pago);
                db.Set<Store>().Add(pagoSoftDeleted);
                // Store C — Superior store holding module 12 + feature 39: MUST be untouched.
                var superior = Store.Create($"WS-Sup-C-{Guid.NewGuid():N}", owner.Id, approved: true,
                    tenantId, paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
                    storePlanId: (int)StorePlanType.Superior);
                db.Set<Store>().Add(superior);
                await db.SaveChangesAsync();

                pagoActiveStoreId = pagoActive.Id;
                pagoSoftDeletedStoreId = pagoSoftDeleted.Id;
                superiorStoreId = superior.Id;

                db.Set<StoreModule>().Add(StoreModule.Create(pagoActive.Id, WholesaleSalesPagoRemoval.WholesaleSalesModuleId,
                    2, modulePriceIncluded: false, 2, 0, 100, tenantId));
                db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(pagoActive.Id, (int)RoleType.OwnerAdmin,
                    WholesaleSalesPagoRemoval.WholesaleSalesFeatureId, tenantId));
                db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(pagoActive.Id, (int)RoleType.OwnerAdmin,
                    StatisticsFeatureId, tenantId));

                var softDeletedModule = StoreModule.Create(pagoSoftDeleted.Id, WholesaleSalesPagoRemoval.WholesaleSalesModuleId,
                    2, modulePriceIncluded: false, 2, 0, 100, tenantId);
                softDeletedModule.IsActive = false; // soft-deleted legacy row
                db.Set<StoreModule>().Add(softDeletedModule);

                db.Set<StoreModule>().Add(StoreModule.Create(superior.Id, WholesaleSalesPagoRemoval.WholesaleSalesModuleId,
                    2, modulePriceIncluded: false, 2, 0, 100, tenantId));
                db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(superior.Id, (int)RoleType.OwnerAdmin,
                    WholesaleSalesPagoRemoval.WholesaleSalesFeatureId, tenantId));
                await db.SaveChangesAsync();
            }

            // Act: run the shared cleanup SQL once...
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Database.ExecuteSqlRawAsync(WholesaleSalesPagoRemoval.CleanupSql);
            }

            // Assert.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                // Store A: module 12 and feature 39 are GONE; unrelated feature 60 survives.
                (await db.Set<StoreModule>().IgnoreQueryFilters()
                    .AnyAsync(sm => sm.StoreId == pagoActiveStoreId
                        && sm.ModuleId == WholesaleSalesPagoRemoval.WholesaleSalesModuleId))
                    .Should().BeFalse("module 12 of a Pago store must be deleted entirely");
                (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                    .AnyAsync(srf => srf.StoreId == pagoActiveStoreId
                        && srf.FeatureId == WholesaleSalesPagoRemoval.WholesaleSalesFeatureId))
                    .Should().BeFalse("feature 39 of a Pago store must be deleted entirely");
                (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                    .AnyAsync(srf => srf.StoreId == pagoActiveStoreId && srf.FeatureId == StatisticsFeatureId))
                    .Should().BeTrue("unrelated StoreRoleFeatures of a Pago store must survive");

                // Store B: even the SOFT-DELETED module 12 row is hard-deleted.
                (await db.Set<StoreModule>().IgnoreQueryFilters()
                    .AnyAsync(sm => sm.StoreId == pagoSoftDeletedStoreId
                        && sm.ModuleId == WholesaleSalesPagoRemoval.WholesaleSalesModuleId))
                    .Should().BeFalse("soft-deleted module 12 rows of a Pago store must also be deleted");

                // Store C: Superior keeps module 12 and feature 39.
                (await db.Set<StoreModule>().IgnoreQueryFilters()
                    .AnyAsync(sm => sm.StoreId == superiorStoreId
                        && sm.ModuleId == WholesaleSalesPagoRemoval.WholesaleSalesModuleId))
                    .Should().BeTrue("Superior stores are out of scope and must keep module 12");
                (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                    .AnyAsync(srf => srf.StoreId == superiorStoreId
                        && srf.FeatureId == WholesaleSalesPagoRemoval.WholesaleSalesFeatureId))
                    .Should().BeTrue("Superior stores are out of scope and must keep feature 39");
            }

            // Idempotence: a second run is a no-op — no exception, same state.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Database.ExecuteSqlRawAsync(WholesaleSalesPagoRemoval.CleanupSql);

                (await db.Set<StoreModule>().IgnoreQueryFilters()
                    .CountAsync(sm => sm.StoreId == pagoActiveStoreId
                        || sm.StoreId == pagoSoftDeletedStoreId)).Should().Be(0);
                (await db.Set<StoreModule>().IgnoreQueryFilters()
                    .CountAsync(sm => sm.StoreId == superiorStoreId)).Should().Be(1);
            }
        }
        finally
        {
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var storeIds = new[] { pagoActiveStoreId, pagoSoftDeletedStoreId, superiorStoreId }
                .Where(id => id != Guid.Empty).ToList();
            if (storeIds.Count > 0)
            {
                db.Set<StoreRoleFeature>().RemoveRange(
                    await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                        .Where(x => storeIds.Contains(x.StoreId)).ToListAsync());
                db.Set<StoreModule>().RemoveRange(
                    await db.Set<StoreModule>().IgnoreQueryFilters()
                        .Where(x => storeIds.Contains(x.StoreId)).ToListAsync());
                db.Set<Store>().RemoveRange(
                    await db.Set<Store>().IgnoreQueryFilters()
                        .Where(x => storeIds.Contains(x.Id)).ToListAsync());
            }
            if (ownerId != Guid.Empty)
            {
                db.Set<Owner>().RemoveRange(
                    await db.Set<Owner>().IgnoreQueryFilters()
                        .Where(x => x.Id == ownerId).ToListAsync());
            }
            if (userId != Guid.Empty)
            {
                db.Set<User>().RemoveRange(
                    await db.Set<User>().IgnoreQueryFilters()
                        .Where(x => x.Id == userId).ToListAsync());
            }
            await db.SaveChangesAsync();
        }
    }
}