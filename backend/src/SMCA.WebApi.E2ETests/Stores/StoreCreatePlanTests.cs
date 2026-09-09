using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Entities.Plans;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E tests for the plan dimension of <c>POST /api/v1/stores</c>: every created store
/// must land on plan Superior (StorePlanId=3) with the trial clock started
/// (PaymentStartDate=today), the exact requested module set with catalog price
/// snapshots, and the StoreRoleFeatures the real flow generates — including the new
/// plan modules 12/13/14. Plan 2026-09-08-e2e-plan-gated-modules-auth-roster (Lote 2).
/// Default plan changed Pago→Superior (2026-09-09): a new store gets the Superior
/// plan whose StorePlanModule catalog covers all 13 AvailableToStore modules.
/// </summary>
[Collection("e2e")]
public sealed class StoreCreatePlanTests
{
    private readonly AppTestFactory _f;
    public StoreCreatePlanTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int FreeManagementModuleId = 7;
    private const int StatisticsModuleId = 6;
    private const int WarehousesModuleId = 13;
    private const int WholesaleSalesModuleId = 12;
    private const int MultiStoresModuleId = 14;
    private const int SuperiorPlanId = (int)Domain.Common.Enums.StorePlanType.Superior;

    private static object Body(Guid ownerId, string name, IEnumerable<int> moduleIds) => new
    {
        OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null,
        Approved = false, ModuleIds = moduleIds
    };

    // ── Happy Path ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_store_gets_pago_plan_modules_and_features()
    {
        var login = $"sa-cp-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores",
                    Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}", new[] { FreeManagementModuleId, StatisticsModuleId, WarehousesModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
            store.StorePlanId.Should().Be(SuperiorPlanId); // default plan is Superior (3)
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow)); // trial clock starts unconditionally

            var storeModules = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == created && sm.IsActive).ToListAsync();
            storeModules.Select(sm => sm.ModuleId).Should().BeEquivalentTo(new[]
            {
                FreeManagementModuleId, StatisticsModuleId, WarehousesModuleId
            });

            // Catalog price snapshots: Warehouses carries the post-Update-Warehouses-Price
            // catalog values (Price=5, PercentDiscount=50 → effective 2.5).
            var warehouses = storeModules.Single(sm => sm.ModuleId == WarehousesModuleId);
            warehouses.Price.Should().Be(5f);
            warehouses.ModulePercentDiscountPrice.Should().Be(50f);
            warehouses.ModulePriceIncluded.Should().BeFalse();

            // StoreRoleFeatures rows exist for the mapped features of the requested modules.
            var srfFeatureIds = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == created && srf.IsActive)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();
            srfFeatureIds.Should().Contain(new[] { 60, 36, 37 }); // Statistics + Warehouses features
            srfFeatureIds.Should().NotContain(new[] { 38, 39 }); // not mapped in StoreRoleFeatures (production gap)
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_with_all_paid_modules_including_new_12_14()
    {
        var login = $"sa-ca-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores",
                    Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}",
                        new[] { 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, WholesaleSalesModuleId, WarehousesModuleId, MultiStoresModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
            store.StorePlanId.Should().Be(SuperiorPlanId);

            var activeModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == created && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            activeModuleIds.Should().BeEquivalentTo(new[] { 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 });
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_defaults_to_superior_plan_matching_plan_catalog()
    {
        // Default plan change (2026-09-09): every created store lands on Superior (3).
        // The Superior StorePlanModule catalog is exactly the 13 AvailableToStore
        // modules, so a store created with the full catalog set ends up whose active
        // modules are precisely its plan's catalog — store plan and assigned modules agree.
        var login = $"sa-csc-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var fullCatalogRequest = new[] { 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, WholesaleSalesModuleId, WarehousesModuleId, MultiStoresModuleId };
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}", fullCatalogRequest));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
            store.StorePlanId.Should().Be(SuperiorPlanId);

            var planCatalogModuleIds = await db.Set<StorePlanModule>().IgnoreQueryFilters()
                .Where(spm => spm.PlanId == SuperiorPlanId)
                .Select(spm => spm.ModuleId).ToListAsync();
            planCatalogModuleIds.Should().HaveCount(13);

            var storeModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == created && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            storeModuleIds.Should().BeEquivalentTo(planCatalogModuleIds);
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_free_only_modules_still_plan_superior_with_trial_clock()
    {
        var login = $"sa-cf-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores",
                    Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}", new[] { 2, 3, 4, FreeManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
            // Plan is Superior and the trial clock starts even for free-only module sets —
            // but PlanType resolves "Free" (no paid module active) until one is added.
            store.StorePlanId.Should().Be(SuperiorPlanId);
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    // ── Edge Cases ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_store_module_ids_duplicates_return_500_pk_collision()
    {
        // Documented current behavior: CreateStoreService loops over moduleIds WITHOUT
        // deduplication and StoreModule has PK (StoreId, ModuleId) — a duplicated id in
        // the request makes the second INSERT collide with the first and the endpoint
        // fails with 500 (unlike UpdateStoreCommand's DG-7 guard, which dedups with
        // Distinct()). Asserted as-is; fixing the handler is a production change.
        var login = $"sa-cd-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores",
                    Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}",
                        new[] { FreeManagementModuleId, FreeManagementModuleId, StatisticsModuleId, StatisticsModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.InternalServerError);

            // The failed transaction must not leave a partial store behind.
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Name != null && s.OwnerId == owner.OwnerId))
                .Should().BeFalse("the failed create must not persist a partial store");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_unavailable_module_38_stores_no_row()
    {
        // Module 1 (Administration) exists in the catalog but is NOT AvailableToStore:
        // the validator rejects it with 400 ModuleIds.
        var login = $"sa-cu-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores",
                    Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}", new[] { FreeManagementModuleId, 1 }));
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "ModuleIds");
        }
        finally
        {
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
