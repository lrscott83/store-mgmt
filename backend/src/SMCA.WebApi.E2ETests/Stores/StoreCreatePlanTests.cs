using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
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
/// E2E tests for the plan dimension of <c>POST /api/v1/stores</c>: every created store must land
/// on plan Superior (3) with the trial clock started (PaymentStartDate=today), the catalog price
/// snapshot of every granted module, and the StoreRoleFeatures the real flow generates.
///
/// store-birth-superior (2026-10-11, replaces store-birth-pago-only): the birth module set is the
/// Superior catalog, NOT a request field — <c>ModuleIds</c> was removed from the command, so there
/// is nothing to request and nothing to reject. The exhaustive rules live in
/// <see cref="StoreBirthSuperiorTests"/> (exact catalog + VIP-only 16) and
/// <see cref="StoreBirthCatalogFlagTests"/> (IsActive / AvailableToStore); this file pins the
/// plan/price/feature SHAPE on the created rows.
/// </summary>
[Collection("e2e")]
public sealed class StoreCreatePlanTests
{
    private readonly AppTestFactory _f;
    public StoreCreatePlanTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int SuperiorPlanId = (int)StorePlanType.Superior;
    private const int FreeManagementModuleId = 7;
    private const int StatisticsModuleId = 6;
    private const int MultiStoresModuleId = 14;

    /// <summary>No ModuleIds any more (store-birth-superior) — the body is just the store data.</summary>
    private static object Body(Guid ownerId, string name) => new
    {
        OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null,
        Approved = false
    };

    // ── Happy Path ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_store_gets_superior_plan_modules_and_features()
    {
        var login = $"sa-cp-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
            store.StorePlanId.Should().Be(SuperiorPlanId); // birth default (store-birth-superior, 2026-10-11)
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow)); // trial clock starts unconditionally

            var catalog = await SuperiorCatalogAsync(db);
            var storeModules = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == created && sm.IsActive).ToListAsync();
            storeModules.Select(sm => sm.ModuleId).Should().BeEquivalentTo(catalog);

            // Price snapshots come from the catalog row, not from anything the caller sent.
            var catalogById = await db.Set<Domain.Entities.Modules.Module>().IgnoreQueryFilters()
                .ToDictionaryAsync(m => m.Id);
            foreach (var sm in storeModules)
            {
                var module = catalogById[sm.ModuleId];
                sm.ModulePrice.Should().Be(module.Price);
                sm.ModulePriceIncluded.Should().Be(module.PriceIncluded);
            }

            // StoreRoleFeatures rows exist for the mapped features of the granted modules.
            var srfFeatureIds = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == created && srf.IsActive)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();
            srfFeatureIds.Should().Contain(60); // Statistics feature
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_births_with_catalog_price_snapshots()
    {
        var login = $"sa-cpc-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Both a free member and a paid one, so the assertion covers PriceIncluded true AND false.
            var sm = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(x => x.StoreId == created && x.ModuleId == StatisticsModuleId)
                .SingleAsync();
            var statistics = await db.Set<Domain.Entities.Modules.Module>().IgnoreQueryFilters()
                .SingleAsync(m => m.Id == StatisticsModuleId);

            sm.ModulePriceIncluded.Should().Be(statistics.PriceIncluded).And.BeFalse();
            sm.ModulePrice.Should().Be(statistics.Price);
            sm.ModulePercentDiscountPrice.Should().Be(statistics.PercentDiscountPrice);
            sm.ModuleDiscountPrice.Should().Be(statistics.DiscountPrice);

            var management = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(x => x.StoreId == created && x.ModuleId == FreeManagementModuleId)
                .SingleAsync();
            management.ModulePriceIncluded.Should().BeTrue();
            management.ModulePrice.Should().Be(0f);
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_always_starts_the_trial_clock_on_superior()
    {
        // store-birth-superior: there is no longer a "free-only module set" request to send — the
        // catalog always carries paid members, so the trial clock is unconditional by construction.
        // The body Approved=false is still ignored (every creation path forces approved=true).
        var login = $"sa-cf-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
            store.StorePlanId.Should().Be(SuperiorPlanId);
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
            store.Approved.Should().BeTrue("body Approved=false is ignored");
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
    public async Task Create_store_grants_multi_stores_because_the_birth_plan_is_superior()
    {
        // The closure case of the OLD invariant (store-birth-pago-only rejected 12..17 with 400
        // ModuleIds). Under store-birth-superior there is nothing to reject: MultiStores (14) IS a
        // Superior member, so it is granted like any other catalog entry.
        var login = $"sa-ca-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"Store-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<StoreModule>().IgnoreQueryFilters()
                .AnyAsync(sm => sm.StoreId == created && sm.ModuleId == MultiStoresModuleId && sm.IsActive))
                .Should().BeTrue("MultiStores (14) is a Superior member and is granted at birth");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Create_store_ignores_an_unknown_moduleIds_field_in_the_body()
    {
        // store-birth-superior removed ModuleIds from the command, but System.Text.Json ignores
        // unknown members by default — a client still sending it gets the SAME catalog, silently.
        // That is the contract the React payload removal rides on: no 400, no partial grant.
        var login = $"sa-cu-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", new
                {
                    OwnerId = owner.OwnerId,
                    Name = $"Store-{Guid.NewGuid():N}",
                    Address = (string?)null,
                    Description = (string?)null,
                    Approved = true,
                    ModuleIds = new[] { FreeManagementModuleId }, // legacy field, no longer in the command
                });
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var granted = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == created && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            granted.Should().BeEquivalentTo(await SuperiorCatalogAsync(db),
                "a legacy ModuleIds field neither narrows nor widens the grant");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    private static async Task<List<int>> SuperiorCatalogAsync(ApplicationDbContext db)
        => await db.Set<StorePlanModule>().IgnoreQueryFilters()
            .Where(spm => spm.PlanId == SuperiorPlanId
                && spm.Module.IsActive && spm.Module.AvailableToStore)
            .Select(spm => spm.ModuleId)
            .ToListAsync();
}