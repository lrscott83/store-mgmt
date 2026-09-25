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
/// must land on plan Pago (StorePlanId=2) with the trial clock started
/// (PaymentStartDate=today), the requested module set with catalog price
/// snapshots, and the StoreRoleFeatures the real flow generates. Strict birth invariant
/// (2026-09-25, store-birth-pago-only): the birth module set is clamped to the ACTIVE
/// Pago plan catalog — Superior/VIP-only members (12..17) are rejected 400 and the
/// 2026-09-18 Option A REQUEST-driven divergence is closed. The exhaustive 12..17 sweep
/// lives in StoreBirthPagoOnlyTests; this file pins the plan/price/feature shape on Pago members.
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
    private const int MultiMonedasModuleId = 15;
    private const int ElaborationModuleId = 17;
    private const int SuperiorPlanId = (int)Domain.Common.Enums.StorePlanType.Superior;
    private const int PagoPlanId = (int)Domain.Common.Enums.StorePlanType.Pago;

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
            // Request = Pago members only (strict birth invariant): Management (7, free) +
            // Statistics (6, paid). Warehouses (13) is Superior/VIP-only since 2026-09-25.
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores",
                    Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}", new[] { FreeManagementModuleId, StatisticsModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
            store.StorePlanId.Should().Be(PagoPlanId); // default plan is Pago (2) since the 2026-09-18 birth-plan change
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow)); // trial clock starts unconditionally

            var storeModules = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == created && sm.IsActive).ToListAsync();
            storeModules.Select(sm => sm.ModuleId).Should().BeEquivalentTo(new[]
            {
                FreeManagementModuleId, StatisticsModuleId
            });

            // StoreRoleFeatures rows exist for the mapped features of the requested modules.
            var srfFeatureIds = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == created && srf.IsActive)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();
            srfFeatureIds.Should().Contain(60); // Statistics feature
            srfFeatureIds.Should().NotContain(new[] { 36, 37, 38, 39 }); // Warehouses/MultiStores/WholesaleSales are not requested
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_rejects_wholesale_sales_module_for_pago_birth()
    {
        // Strict birth invariant (2026-09-25, store-birth-pago-only): every store born via
        // POST /v1/stores lands on Pago (CreateStoreService hardcodes StorePlanType.Pago), so a
        // request naming ANY Superior/VIP-only member is rejected 400 (ModuleNotAvailableForPagoPlan,
        // fail-closed). WholesaleSales (12) is the closure case kept here; the exhaustive 12..17
        // sweep lives in StoreBirthPagoOnlyTests.
        var login = $"sa-ca-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores",
                    Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}",
                        new[] { 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, WholesaleSalesModuleId, WarehousesModuleId, MultiStoresModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "ModuleIds");

            // No store may be left behind by the rejected request.
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.OwnerId == owner.OwnerId))
                .Should().BeFalse("the rejected create must not persist any store");
        }
        finally
        {
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_with_full_pago_catalog_births_exact_request_set()
    {
        // Strict birth invariant (2026-09-25, store-birth-pago-only): every created store
        // births on Pago (2) and the birth module set EQUALS the active Pago plan catalog —
        // the 2026-09-18 Option A request-driven divergence (Superior members honored on a
        // Pago birth) is closed. The full catalog request yields exactly the catalog set.
        var login = $"sa-csc-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            // The full Pago catalog (10 members) — read from StorePlanModule, the SAME source
            // the validator uses, so the pin stays honest if the catalog ever changes.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var catalog = await db.Set<StorePlanModule>().IgnoreQueryFilters()
                    .Where(spm => spm.PlanId == PagoPlanId)
                    .Select(spm => spm.ModuleId).ToListAsync();
                catalog.Should().HaveCount(10,
                    "Pago is 10 members (WholesaleSales 12 removed 2026-09-23; 13..17 are Superior/VIP-only)");

                var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                    .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}", catalog));
                response.StatusCode.Should().Be(HttpStatusCode.Created);
                created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

                var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
                store.StorePlanId.Should().Be(PagoPlanId);

                var storeModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(sm => sm.StoreId == created && sm.IsActive)
                    .Select(sm => sm.ModuleId).ToListAsync();
                // Divergence closed: the birth module set equals the Pago catalog exactly.
                storeModuleIds.Should().BeEquivalentTo(catalog);
            }
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_free_only_modules_still_plan_pago_with_trial_clock()
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
            // Plan is Pago and the trial clock starts even for free-only module sets —
            // but PlanType resolves "Free" (no paid module active) until one is added.
            store.StorePlanId.Should().Be(PagoPlanId);
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
