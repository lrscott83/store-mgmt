using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Features;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

[Collection("e2e")]
public sealed class StoreModuleLifecycleTests
{
    private readonly AppTestFactory _f;
    public StoreModuleLifecycleTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(Guid bodyId, string name, IEnumerable<int> moduleIds) => new
    {
        Id = bodyId, Name = name, Address = "a", Description = "d", Approved = false,
        ModuleIds = moduleIds, IsActive = true
    };

    // D1: seed the inactive module as an Added entity. Added entities are tracked
    // regardless of the global NoTracking default, so the mutate-before-save is safe.
    private async Task SeedInactiveStoreModuleAsync(Guid storeId, int moduleId, Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storeModule = StoreModule.Create(storeId, moduleId, 0, true, 0, 0, 0, tenantId);
        storeModule.IsActive = false;
        db.Set<StoreModule>().Add(storeModule);
        await db.SaveChangesAsync();
    }

    private async Task SeedStoreRoleFeatureAsync(Guid storeId, int roleId, int featureId, Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(storeId, roleId, featureId, tenantId));
        await db.SaveChangesAsync();
    }

    // Tenant query filters hide rows from a non-SuperAdmin context — every direct read
    // in this class uses IgnoreQueryFilters.
    private async Task<List<int>> GetStoreModuleIdsAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId)
            .Select(x => x.ModuleId)
            .ToListAsync();
    }

    private async Task<StoreModule> GetStoreModuleAsync(Guid storeId, int moduleId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreModule>().IgnoreQueryFilters()
            .SingleAsync(x => x.StoreId == storeId && x.ModuleId == moduleId);
    }

    private async Task<List<StoreRoleFeature>> GetStoreRoleFeaturesAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId)
            .ToListAsync();
    }

    // D4: replicates StoreRoleFeatureGenerator.GenerateStoreRoleFeaturesAsync
    // (feature filter from FeatureRepository.GetAvailableFeatureIdsByModuleIdsAsync,
    // then one SRF per role in HasRoles for every matching StoreRoleFeatures value).
    // Not hardcoded: survives catalog/attribute changes.
    private async Task<List<(int RoleId, int FeatureId)>> ComputeExpectedSrfAsync(Guid tenantId, List<int> moduleIds)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var featureIds = await db.Set<Feature>().IgnoreQueryFilters()
            .Where(f => moduleIds.Contains(f.ModuleId) && f.IsActive && f.AvailableToStore)
            .Select(f => f.Id)
            .ToListAsync();

        return ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
            .Where(srf => featureIds.Any(id => srf.HasFeature(id)))
            .SelectMany(srf => srf.GetRoles().Select(r => ((int)r, (int)srf.GetFeatureType()!.Value)))
            .ToList();
    }

    [Fact]
    public async Task Get_returns_only_active_modules_when_inactive_module_seeded()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { BillingSeed.ManagementModuleId });
        try
        {
            await SeedInactiveStoreModuleAsync(fx.StoreId, BillingSeed.StatisticsModuleId, DataUtils.DefaultTenant.Id);

            // Precondition: both rows exist in DB — the include filter, not an empty
            // read, is what excludes module 6 from the response.
            (await GetStoreModuleIdsAsync(fx.StoreId)).Should().BeEquivalentTo(
                new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });

            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync($"/api/v1/stores/{fx.StoreId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data!.Modules.Select(m => m.Id).Should().BeEquivalentTo(new[] { BillingSeed.ManagementModuleId });
            b.Data.Modules.Select(m => m.Id).Should().NotContain(BillingSeed.StatisticsModuleId);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Get_returns_catalog_module_ids()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var seeded = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 5, 1));
        try
        {
            // StoreModule has no row id (composite PK StoreId+ModuleId), so the ids in
            // StoreDto.Modules must be the catalog ModuleId of each row.
            var dbModuleIds = await GetStoreModuleIdsAsync(seeded.StoreId);

            var r = await DbTestHelpers.AuthedClient(_f, adminId, login).GetAsync($"/api/v1/stores/{seeded.StoreId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data!.Modules.Select(m => m.Id).Should().BeEquivalentTo(dbModuleIds);
        }
        finally { await BillingSeed.CleanupAsync(_f, seeded); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Put_removing_module_deactivates_its_store_role_features()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });
        try
        {
            // Real feature 60 (Dashboard, module 6, AvailableToStore) with OwnerAdmin —
            // the handler only deactivates SRFs whose Feature.AvailableToStore is true
            // and whose ModuleId is among the removed modules (StoreRoleFeatureRepository.cs:27-28).
            await SeedStoreRoleFeatureAsync(fx.StoreId, (int)RoleType.OwnerAdmin, (int)FeatureType.Dashboard, DataUtils.DefaultTenant.Id);
            (await GetStoreRoleFeaturesAsync(fx.StoreId)).Single().IsActive.Should().BeTrue();

            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{fx.StoreId}",
                    Body(Guid.Empty, $"n-{Guid.NewGuid():N}", new[] { BillingSeed.ManagementModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            (await GetStoreModuleIdsAsync(fx.StoreId)).Should().BeEquivalentTo(
                new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId });
            (await GetStoreModuleAsync(fx.StoreId, BillingSeed.StatisticsModuleId)).IsActive.Should().BeFalse();
            (await GetStoreRoleFeaturesAsync(fx.StoreId)).Single().IsActive.Should().BeFalse();
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fx); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    [Fact]
    public async Task Put_adding_module_generates_store_role_features()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var seeded = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            // Module 6 must have AvailableToStore features in the catalog for the
            // generator to produce anything — guard, not assumption.
            var expected = await ComputeExpectedSrfAsync(DataUtils.DefaultTenant.Id, new List<int> { BillingSeed.StatisticsModuleId });
            expected.Should().NotBeEmpty();

            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{seeded.StoreId}",
                    Body(Guid.Empty, $"n-{Guid.NewGuid():N}",
                        new[] { BillingSeed.ManagementModuleId, BillingSeed.StatisticsModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var actual = (await GetStoreRoleFeaturesAsync(seeded.StoreId))
                .Select(srf => (srf.RoleId, srf.FeatureId));
            actual.Should().BeEquivalentTo(expected);
            (await GetStoreRoleFeaturesAsync(seeded.StoreId)).All(srf => srf.IsActive).Should().BeTrue();
        }
        finally { await BillingSeed.CleanupAsync(_f, seeded); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }
}
