using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Application.Dtos.StoreManagement;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Services.Tenants;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// New coverage for the SuperAdmin store-module pricing capability:
/// PUT/GET /api/v1/stores/{storeId}/module-pricing.
///
/// Ten discrete facts, one per test, each pinning one clause of the endpoint contract:
/// <para>
///  1. a ticked module the store never had is INSERTED with the payload's exact prices;
///  2. an unticked module is DEACTIVATED, never deleted, and its role features follow;
///  3. an inactive module is REACTIVATED with the PAYLOAD's prices, not catalog ones;
///  4. the reported current price and total follow CurrentPriceServiceUtils, clamped at 0;
///  5. the total sums BILLABLE rows only — ticked AND not price-included;
///  6. a module ABSENT from the payload is left completely untouched;
///  7. GET returns exactly the available-to-store catalog, seeded from the catalog for
///     modules the store lacks and from the store for modules it holds;
///  8. an OwnerAdmin is refused 403 on BOTH verbs;
///  9. the endpoint's StoreRoleFeature sync keeps /me FeatureIds coherent with the active set;
/// 10. a saved state is persisted, not merely echoed.
/// </para>
///
/// Modeled on StoreModuleLifecycleTests (same WebAppFixture / real PostgreSQL harness,
/// DbTestHelpers.SeedSuperAdminAsync, StoreSeed.SeedStoreAsync, StoreSeed.CleanupStoreFixtureAsync).
/// All catalog facts are read from the database at run time instead of hardcoded ids, so
/// these tests keep their meaning as the Module/Feature catalog evolves.
/// </summary>
[Collection("e2e")]
public sealed class StoreModulePricingTests
{
    private readonly AppTestFactory _f;
    public StoreModulePricingTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int ManagementModuleId = 7;              // the free module StoreSeed adds
    private const int StatisticsModuleId = 6;               // a second catalog module to move around
    private const float Tolerance = 0.0001f;

    // ── Payload / catalog shapes ──────────────────────────────────────────

    private sealed record PricingRow(int ModuleId, bool IsSelected, float Price,
        float DiscountPrice, float PercentDiscountPrice);

    /// <summary>
    /// <c>PriceIncluded</c> is carried because it is one of the TWO flags the price rule
    /// (ModulePriceCalculator.IsBillable = active &amp;&amp; !priceIncluded) reads: a row the
    /// catalog reports as bundled is excluded from the total even when it is ticked.
    /// </summary>
    private sealed record CatalogModule(int Id, string Name, float Price,
        float DiscountPrice, float PercentDiscountPrice, bool PriceIncluded);

    private sealed record OwnerFixture(Guid UserId, string Login, Guid StoreId);

    private static object PricingBody(Guid storeId, IEnumerable<PricingRow> rows) => new
    {
        StoreId = storeId,
        Modules = rows.Select(r => new
        {
            r.ModuleId,
            r.IsSelected,
            r.Price,
            r.DiscountPrice,
            r.PercentDiscountPrice
        }).ToList()
    };

    // ── HTTP helpers ──────────────────────────────────────────────────────

    private async Task<ApiResponse<StoreModulePricingResultDto>> PutPricingAsync(
        HttpClient client, Guid storeId, IEnumerable<PricingRow> rows)
    {
        var r = await client.PutAsJsonAsync($"/api/v1/stores/{storeId}/module-pricing",
            PricingBody(storeId, rows));
        r.StatusCode.Should().Be(HttpStatusCode.OK, "the save must succeed");
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<StoreModulePricingResultDto>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        b.Data!.StoreId.Should().Be(storeId);
        return b;
    }

    private async Task<ApiResponse<StoreModulePricingReadResultDto>> GetPricingAsync(HttpClient client, Guid storeId)
    {
        var r = await client.GetAsync($"/api/v1/stores/{storeId}/module-pricing");
        r.StatusCode.Should().Be(HttpStatusCode.OK, "the read must succeed");
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<StoreModulePricingReadResultDto>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        b.Data!.StoreId.Should().Be(storeId);
        return b;
    }

    private static async Task<CurrentUserDto> MeAsync(HttpClient client)
    {
        var r = await client.GetAsync("/api/v1/auth/me");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b.Data!;
    }

    // ── Catalog reads (DB-driven, auto-extensible) ───────────────────────

    /// <summary>
    /// Mirrors ModuleRepository.GetAvailableModulesToStore exactly, filter AND ordering:
    /// IsActive &amp;&amp; AvailableToStore &amp;&amp; at least one active+available feature,
    /// ordered by PriceIncluded descending then Order. The "at least one active available
    /// feature" clause is not cosmetic — it is what makes this list the same universe the
    /// endpoint shows, and it is narrower than IsActive &amp;&amp; AvailableToStore alone.
    /// </summary>
    private async Task<List<CatalogModule>> AvailableCatalogAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var modules = await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.IsActive && m.AvailableToStore
                && m.Features.Any(f => f.IsActive && f.AvailableToStore))
            .OrderByDescending(m => m.PriceIncluded).ThenBy(m => m.Order)
            .ToListAsync();
        return modules
            .Select(m => new CatalogModule(m.Id, m.Name, m.Price, m.DiscountPrice,
                m.PercentDiscountPrice, m.PriceIncluded))
            .ToList();
    }

    /// <summary>Every module id in the Module table, whatever its catalog flags.</summary>
    private async Task<List<int>> AllModuleIdsAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Module>().IgnoreQueryFilters().Select(m => m.Id).ToListAsync();
    }

    /// <summary>
    /// The first catalog module the price rule can actually CHARGE: catalog
    /// <c>PriceIncluded == false</c> (so ticking it produces a billable snapshot) and not
    /// already held by the store, whose frozen flag would otherwise decide the total.
    /// Derived from the database instead of hardcoded so the tests survive catalog
    /// evolution — a hardcoded id could silently become a bundled module and turn a total
    /// assertion into a vacuous 0.
    /// </summary>
    private async Task<CatalogModule> BillableCatalogModuleAsync(Guid storeId, params int[] excludedModuleIds)
    {
        var held = await GetStoreModuleIdsAsync(storeId);
        var candidate = (await AvailableCatalogAsync()).FirstOrDefault(m => !m.PriceIncluded
            && !held.Contains(m.Id) && !excludedModuleIds.Contains(m.Id));
        candidate.Should().NotBeNull(
            "precondition: the catalog must offer a module that is neither bundled nor already held");
        return candidate!;
    }

    /// <summary>
    /// The first catalog module that is BUNDLED (PriceIncluded == true): ticking it freezes
    /// ModulePriceIncluded = true on the store snapshot, which is what makes it non-billable.
    /// </summary>
    private async Task<CatalogModule> BundledCatalogModuleAsync(params int[] excludedModuleIds)
    {
        var candidate = (await AvailableCatalogAsync()).FirstOrDefault(m => m.PriceIncluded
            && !excludedModuleIds.Contains(m.Id));
        candidate.Should().NotBeNull("precondition: the catalog must offer a price-included module");
        return candidate!;
    }

    private async Task<List<int>> AvailableFeatureIdsAsync(List<int> moduleIds)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Feature>().IgnoreQueryFilters()
            .Where(f => moduleIds.Contains(f.ModuleId) && f.IsActive && f.AvailableToStore)
            .Select(f => f.Id).ToListAsync();
    }

    /// <summary>
    /// Replicates StoreRoleFeatureGenerator.GenerateStoreRoleFeaturesAsync: the feature ids
    /// come from the catalog (active + available) and each StoreRoleFeatures enum value
    /// carrying one of them produces one row per role it lists. Derived from the enum, not
    /// hardcoded, so it survives catalog/attribute changes.
    /// </summary>
    private async Task<List<(int RoleId, int FeatureId)>> ExpectedSrfAsync(List<int> moduleIds)
    {
        var featureIds = await AvailableFeatureIdsAsync(moduleIds);
        return ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
            .Where(srf => featureIds.Any(id => srf.HasFeature(id)))
            .SelectMany(srf => srf.GetRoles().Select(r => ((int)r, (int)srf.GetFeatureType()!.Value)))
            .ToList();
    }

    // ── DB reads (IgnoreQueryFilters: tenant filters hide rows from a non-request scope) ──

    private async Task<StoreModule> GetStoreModuleAsync(Guid storeId, int moduleId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreModule>().IgnoreQueryFilters()
            .SingleAsync(x => x.StoreId == storeId && x.ModuleId == moduleId);
    }

    private async Task<List<int>> GetStoreModuleIdsAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId).Select(x => x.ModuleId).ToListAsync();
    }

    private async Task<List<StoreRoleFeature>> GetStoreRoleFeaturesAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId).ToListAsync();
    }

    // ── Seed helpers (Added entities are tracked despite the global NoTracking default) ──

    private async Task SeedStoreModuleAsync(Guid storeId, int moduleId, float price,
        float discount, float percentDiscount, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storeModule = StoreModule.Create(storeId, moduleId, price, false, price,
            discount, percentDiscount, DataUtils.DefaultTenant.Id);
        if (!isActive) storeModule.IsActive = false;
        db.Set<StoreModule>().Add(storeModule);
        await db.SaveChangesAsync();
    }

    private async Task SeedStoreRoleFeatureAsync(Guid storeId, int roleId, int featureId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var srf = StoreRoleFeature.Create(storeId, roleId, featureId, DataUtils.DefaultTenant.Id);
        if (!isActive) srf.IsActive = false;
        db.Set<StoreRoleFeature>().Add(srf);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// LOCAL OwnerAdmin fixture: user + owner + approved store (paymentStartDate null, so
    /// billing stays NoAplica and FilterForBilling is a no-op — the active module set is then
    /// the only variable), the Management module, and the StoreRoleFeature rows the REAL
    /// generator produces for it. Does not touch the shared AuthzSeed/StoreSeed helpers.
    /// </summary>
    private async Task<OwnerFixture> SeedOwnerAdminWithManagementAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"smp-owner-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E StoreModulePricing Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E StoreModulePricing owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"SMP-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            paymentStartDate: null);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ManagementModuleId, 0, true, 0, 0, 0, tenantId));

        var featureIds = await db.Set<Feature>().IgnoreQueryFilters()
            .Where(f => f.ModuleId == ManagementModuleId && f.IsActive && f.AvailableToStore)
            .Select(f => f.Id).ToListAsync();
        var generator = scope.ServiceProvider.GetRequiredService<IStoreRoleFeatureGenerator>();
        foreach (var srf in await generator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds))
            db.Set<StoreRoleFeature>().Add(srf);

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return new OwnerFixture(user.Id, login, store.Id);
    }

    // ══════════════════════════════════════════════════════════════════════
    // 1. Insert
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_inserts_a_store_module_the_store_never_had_with_the_exact_prices()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { ManagementModuleId });
        try
        {
            var catalog = await AvailableCatalogAsync();
            var target = catalog.First(m => m.Id != ManagementModuleId);
            (await GetStoreModuleIdsAsync(fx.StoreId)).Should().NotContain(target.Id,
                "precondition: the store does not have this module yet");

            // Guard, not assumption: the insert path only materializes role features when the
            // catalog maps the module's available features onto roles.
            var expectedSrf = await ExpectedSrfAsync(new List<int> { target.Id });
            expectedSrf.Should().NotBeEmpty();

            var body = await PutPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), fx.StoreId,
                new[] { new PricingRow(target.Id, true, 123.5f, 7.25f, 3.5f) });

            // Echo: the persisted state, with IsActive reflecting the tick.
            var echoed = body.Data!.Modules.Should().ContainSingle().Subject;
            echoed.ModuleId.Should().Be(target.Id);
            echoed.IsActive.Should().BeTrue();

            // Persisted: a row now exists, active, holding EXACTLY the submitted values.
            var row = await GetStoreModuleAsync(fx.StoreId, target.Id);
            row.IsActive.Should().BeTrue();
            row.Price.Should().BeApproximately(123.5f, Tolerance);
            row.ModuleDiscountPrice.Should().BeApproximately(7.25f, Tolerance);
            row.ModulePercentDiscountPrice.Should().BeApproximately(3.5f, Tolerance);

            // And the role features the module grants are materialized for the new row.
            var actualSrf = (await GetStoreRoleFeaturesAsync(fx.StoreId)).Select(s => (s.RoleId, s.FeatureId));
            actualSrf.Should().BeEquivalentTo(expectedSrf);
            (await GetStoreRoleFeaturesAsync(fx.StoreId)).All(s => s.IsActive).Should().BeTrue();
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. Deactivate, never delete
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_unticking_an_active_module_deactivates_the_row_without_deleting_it()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { ManagementModuleId, StatisticsModuleId });
        try
        {
            var featureIds = await AvailableFeatureIdsAsync(new List<int> { StatisticsModuleId });
            featureIds.Should().NotBeEmpty("precondition: the module must grant store features");
            foreach (var featureId in featureIds)
                await SeedStoreRoleFeatureAsync(fx.StoreId, (int)RoleType.OwnerAdmin, featureId, isActive: true);

            var before = await GetStoreModuleIdsAsync(fx.StoreId);
            before.Should().BeEquivalentTo(new[] { ManagementModuleId, StatisticsModuleId });
            (await GetStoreModuleAsync(fx.StoreId, StatisticsModuleId)).IsActive.Should().BeTrue();

            await PutPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), fx.StoreId,
                new[] { new PricingRow(StatisticsModuleId, false, 0f, 0f, 0f) });

            // Deactivated, and the row is still there under the SAME composite key.
            var row = await GetStoreModuleAsync(fx.StoreId, StatisticsModuleId);
            row.IsActive.Should().BeFalse();
            row.StoreId.Should().Be(fx.StoreId);
            row.ModuleId.Should().Be(StatisticsModuleId);
            (await GetStoreModuleIdsAsync(fx.StoreId)).Should().HaveCount(before.Count,
                "deactivation is a soft flag: no StoreModule row is ever removed");

            // Its role features are deactivated too — and equally not deleted.
            var srfs = await GetStoreRoleFeaturesAsync(fx.StoreId);
            srfs.Should().HaveCount(featureIds.Count, "StoreRoleFeature rows are flagged, not removed");
            srfs.Should().OnlyContain(s => !s.IsActive);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. Reactivate with the payload's prices
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_reactivating_an_inactive_module_writes_the_payload_prices_not_the_catalog_prices()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { ManagementModuleId });
        try
        {
            var catalog = await AvailableCatalogAsync();
            var target = catalog.First(m => m.Id != ManagementModuleId);
            var featureIds = await AvailableFeatureIdsAsync(new List<int> { target.Id });
            featureIds.Should().NotBeEmpty();

            // Seed the inactive row carrying the CATALOG's prices — exactly what the
            // plan-driven whole-set rewrite (UpdateStoreCommand) leaves behind. Reactivating
            // through THAT path would keep these values; this endpoint must not.
            await SeedStoreModuleAsync(fx.StoreId, target.Id, target.Price, target.DiscountPrice,
                target.PercentDiscountPrice, isActive: false);
            foreach (var featureId in featureIds)
                await SeedStoreRoleFeatureAsync(fx.StoreId, (int)RoleType.OwnerAdmin, featureId, isActive: false);

            (await GetStoreModuleAsync(fx.StoreId, target.Id)).IsActive.Should().BeFalse();

            await PutPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), fx.StoreId,
                new[] { new PricingRow(target.Id, true, 777f, 11f, 22f) });

            var row = await GetStoreModuleAsync(fx.StoreId, target.Id);
            row.IsActive.Should().BeTrue();
            row.Price.Should().BeApproximately(777f, Tolerance);
            row.ModuleDiscountPrice.Should().BeApproximately(11f, Tolerance);
            row.ModulePercentDiscountPrice.Should().BeApproximately(22f, Tolerance);
            // The catalog value is NOT what landed on the row: the payload is.
            row.Price.Should().NotBe(target.Price);

            // Reactivation restores the module's feature grants.
            var activeFeatureIds = (await GetStoreRoleFeaturesAsync(fx.StoreId))
                .Where(s => s.IsActive).Select(s => s.FeatureId).Distinct().ToList();
            activeFeatureIds.Should().Contain(featureIds);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. The formula and the clamp at zero
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_reports_the_current_price_formula_and_clamps_the_total_at_zero()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { ManagementModuleId });
        try
        {
            // A BILLABLE target on purpose: the catalog's first non-Management entry is a
            // bundled module (PriceIncluded = true), and ticking a bundled row excludes it
            // from the total (ModulePriceCalculator.IsBillable), which would make both total
            // assertions below 0 for a reason unrelated to the formula they are pinning.
            var target = await BillableCatalogModuleAsync(fx.StoreId, ManagementModuleId);
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            // The inserted snapshot freezes ModulePriceIncluded = false from the catalog, so
            // the row IS billable: GetCurrentPrice(100, 10, 5) = 100 - 10 - 5 = 85, and the
            // total is that same 85 (single billable row).
            var first = await PutPricingAsync(client, fx.StoreId,
                new[] { new PricingRow(target.Id, true, 100f, 5f, 10f) });
            first.Data!.Modules.Should().ContainSingle()
                .Which.CurrentPrice.Should().BeApproximately(85f, Tolerance);
            first.Data!.TotalCurrentPrice.Should().BeApproximately(85d, 0.0001d);
            var row = await GetStoreModuleAsync(fx.StoreId, target.Id);
            row.Price.Should().BeApproximately(100f, Tolerance);
            row.ModuleDiscountPrice.Should().BeApproximately(5f, Tolerance);
            row.ModulePercentDiscountPrice.Should().BeApproximately(10f, Tolerance);

            // Same billable row, now over-discounted: GetCurrentPrice(10, 50, 20) = -15,
            // clamped at 0 — never a negative total, and here the clamp alone (not an
            // exclusion) is what drives the total to 0.
            var second = await PutPricingAsync(client, fx.StoreId,
                new[] { new PricingRow(target.Id, true, 10f, 20f, 50f) });
            second.Data!.Modules.Should().ContainSingle()
                .Which.CurrentPrice.Should().BeApproximately(0f, Tolerance);
            second.Data!.TotalCurrentPrice.Should().BeApproximately(0d, 0.0001d);
            (await GetStoreModuleAsync(fx.StoreId, target.Id)).Price.Should().BeApproximately(10f, Tolerance);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. The total covers BILLABLE rows only (ticked AND not price-included)
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_total_sums_the_ticked_modules_that_are_not_price_included()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { ManagementModuleId, StatisticsModuleId });
        try
        {
            // Three rows, one per branch of ModulePriceCalculator.IsBillable, each chosen from
            // the catalog so the expected total below is derived, never hardcoded.
            var billable = await BillableCatalogModuleAsync(fx.StoreId,
                ManagementModuleId, StatisticsModuleId);
            var bundled = await BundledCatalogModuleAsync(
                ManagementModuleId, StatisticsModuleId, billable.Id);
            var unticked = (await AvailableCatalogAsync()).First(m =>
                m.Id != ManagementModuleId && m.Id != StatisticsModuleId
                && m.Id != billable.Id && m.Id != bundled.Id);

            var body = await PutPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), fx.StoreId,
                new[] {
                    new PricingRow(billable.Id, true, 40f, 0f, 0f),      // ticked + not bundled -> charged
                    new PricingRow(bundled.Id, true, 70f, 0f, 0f),       // ticked + bundled      -> free
                    new PricingRow(unticked.Id, false, 50f, 0f, 0f)      // unticked              -> free
                });

            var echoed = body.Data!.Modules.ToDictionary(m => m.ModuleId);
            echoed.Should().ContainKeys(billable.Id, bundled.Id, unticked.Id);

            // The billable row is the only one the total sees.
            echoed[billable.Id].IsActive.Should().BeTrue();
            echoed[billable.Id].PriceIncluded.Should().BeFalse(
                "the insert froze ModulePriceIncluded from the catalog, which must be false");
            echoed[billable.Id].CurrentPrice.Should().BeApproximately(40f, Tolerance);

            // A TICKED but bundled row is still reported in full — and still charges nothing.
            echoed[bundled.Id].IsActive.Should().BeTrue();
            echoed[bundled.Id].PriceIncluded.Should().BeTrue(
                "ticking a bundled module freezes ModulePriceIncluded = true");
            echoed[bundled.Id].CurrentPrice.Should().BeApproximately(70f, Tolerance,
                "every row reports what it would cost, billable or not");

            // The unticked row likewise: reported, never charged.
            echoed[unticked.Id].IsActive.Should().BeFalse();
            echoed[unticked.Id].CurrentPrice.Should().BeApproximately(50f, Tolerance);

            // 40 (billable) + 0 (bundled, ticked) + 0 (unticked) = 40.
            body.Data!.TotalCurrentPrice.Should().BeApproximately(40d, 0.0001d,
                "the total is the BILLABLE sum: 40 + 70 + 50 is 40, not 165");
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 6. A module absent from the payload is untouched
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_leaves_untouched_a_module_the_payload_does_not_contain()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { ManagementModuleId });
        try
        {
            // A module that EXISTS but is outside the available-to-store catalog, so the
            // operator was never shown it and could not have unticked it.
            var catalogIds = (await AvailableCatalogAsync()).Select(m => m.Id).ToHashSet();
            var outside = (await AllModuleIdsAsync()).Where(id => !catalogIds.Contains(id)).ToList();
            outside.Should().NotBeEmpty("precondition: the catalog must not cover every Module row");

            await SeedStoreModuleAsync(fx.StoreId, outside[0], 55f, 0f, 0f, isActive: true);
            (await GetStoreModuleAsync(fx.StoreId, outside[0])).IsActive.Should().BeTrue();

            var target = (await AvailableCatalogAsync()).First(m => m.Id != ManagementModuleId);
            await PutPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), fx.StoreId,
                new[] { new PricingRow(target.Id, true, 20f, 0f, 0f) });

            // Absence means "not part of this edit", never "deactivate".
            var untouched = await GetStoreModuleAsync(fx.StoreId, outside[0]);
            untouched.IsActive.Should().BeTrue();
            untouched.Price.Should().BeApproximately(55f, Tolerance);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 7. The GET universe and its seeding
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Get_returns_the_available_catalog_seeded_from_the_catalog_and_from_the_store()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { ManagementModuleId });
        try
        {
            var catalog = await AvailableCatalogAsync();
            catalog.Should().HaveCountGreaterThan(1);
            var held = catalog.First(m => m.Id == StatisticsModuleId);
            var missing = catalog.First(m => m.Id != ManagementModuleId && m.Id != StatisticsModuleId);

            // The store holds Statistics with its OWN prices, deliberately unlike the catalog.
            await SeedStoreModuleAsync(fx.StoreId, StatisticsModuleId, 123.5f, 7.25f, 3.5f, isActive: true);

            var body = await GetPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), fx.StoreId);
            var rows = body.Data!.Modules;

            // The universe is exactly the available-to-store catalog, in catalog order.
            rows.Select(m => m.ModuleId).Should().Equal(catalog.Select(m => m.Id));

            // A module the store does NOT hold: unticked, seeded with the catalog prices.
            var seeded = rows.Single(m => m.ModuleId == missing.Id);
            seeded.IsActive.Should().BeFalse();
            seeded.Name.Should().Be(missing.Name);
            seeded.Price.Should().BeApproximately(missing.Price, Tolerance);
            seeded.DiscountPrice.Should().BeApproximately(missing.DiscountPrice, Tolerance);
            seeded.PercentDiscountPrice.Should().BeApproximately(missing.PercentDiscountPrice, Tolerance);

            // A module the store DOES hold: the store's own values, never a catalog fallback.
            var own = rows.Single(m => m.ModuleId == StatisticsModuleId);
            own.IsActive.Should().BeTrue();
            own.Price.Should().BeApproximately(123.5f, Tolerance);
            own.DiscountPrice.Should().BeApproximately(7.25f, Tolerance);
            own.PercentDiscountPrice.Should().BeApproximately(3.5f, Tolerance);
            own.Price.Should().NotBe(held.Price, "the read must not fall back to the catalog price");

            // The read's total covers the BILLABLE rows only — active AND not price-included
            // (ModulePriceCalculator.IsBillable). Here that is Statistics alone: Management is
            // active but its seeded snapshot is bundled (StoreSeed.cs:48 freezes
            // ModulePriceIncluded = true), so it contributes 0 even though it is a live row.
            // Derived from the response, so no catalog id or price is hardcoded here.
            body.Data.TotalCurrentPrice.Should().BeApproximately(
                rows.Where(m => m.IsActive && !m.PriceIncluded).Sum(m => (double)m.CurrentPrice), 0.0001d);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 8. 403 for a non-SuperAdmin, both verbs
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task An_owner_admin_is_forbidden_on_both_verbs_of_the_module_pricing_route()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await SeedOwnerAdminWithManagementAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var before = await GetStoreModuleIdsAsync(owner.StoreId);

            var get = await client.GetAsync($"/api/v1/stores/{owner.StoreId}/module-pricing");
            get.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            // A well-formed payload, so a rejection can only come from the guard.
            var catalog = await AvailableCatalogAsync();
            var put = await client.PutAsJsonAsync($"/api/v1/stores/{owner.StoreId}/module-pricing",
                PricingBody(owner.StoreId,
                    new[] { new PricingRow(catalog.First(m => m.Id != ManagementModuleId).Id, true, 10f, 0f, 0f) }));
            put.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            (await GetStoreModuleIdsAsync(owner.StoreId)).Should().BeEquivalentTo(before,
                "both refusals must leave the store's module set untouched");
        }
        finally
        {
            await StoreSeed.CleanupStoreAsync(_f, owner.StoreId);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 9. /me FeatureIds coherence after a transition save
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_keeps_the_me_feature_ids_coherent_with_the_saved_module_set()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await SeedOwnerAdminWithManagementAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var managementFeatures = await AvailableFeatureIdsAsync(new List<int> { ManagementModuleId });
            managementFeatures.Should().NotBeEmpty();

            // Precondition: the store's Management module is live on /me, with its features.
            var before = await MeAsync(client);
            before.StoreModuleIds.Should().Contain(ManagementModuleId);
            before.FeatureIds.Should().Contain(managementFeatures);

            var target = (await AvailableCatalogAsync()).First(m => m.Id != ManagementModuleId);
            var targetFeatures = await AvailableFeatureIdsAsync(new List<int> { target.Id });
            targetFeatures.Should().NotBeEmpty();

            // One save that both inserts the new module and deactivates Management.
            await PutPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), owner.StoreId, new[]
            {
                new PricingRow(target.Id, true, 30f, 0f, 0f),
                new PricingRow(ManagementModuleId, false, 0f, 0f, 0f)
            });

            // /me follows the StoreRoleFeature sync the endpoint performed: the new module's
            // grants appear, the deactivated module's grants are gone.
            var after = await MeAsync(client);
            after.StoreModuleIds.Should().Contain(target.Id);
            after.StoreModuleIds.Should().NotContain(ManagementModuleId);
            after.FeatureIds.Should().Contain(targetFeatures);
            after.FeatureIds.Should().NotContain(managementFeatures);
        }
        finally
        {
            await StoreSeed.CleanupStoreAsync(_f, owner.StoreId);
            await DbTestHelpers.CleanupUserAsync(_f, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 10. A fresh read reflects the saved state
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Get_after_a_save_returns_the_persisted_active_set_and_prices()
    {
        var saLogin = $"smp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"Store-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { ManagementModuleId });
        try
        {
            var target = (await AvailableCatalogAsync()).First(m => m.Id != ManagementModuleId);

            await PutPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), fx.StoreId, new[]
            {
                new PricingRow(target.Id, true, 40f, 4f, 2f),
                new PricingRow(ManagementModuleId, false, 0f, 0f, 0f)
            });

            // A separate request against the database, not the save's own echo.
            var body = await GetPricingAsync(DbTestHelpers.AuthedClient(_f, saId, saLogin), fx.StoreId);
            var rows = body.Data!.Modules;

            rows.Single(m => m.ModuleId == target.Id).IsActive.Should().BeTrue();
            rows.Single(m => m.ModuleId == ManagementModuleId).IsActive.Should().BeFalse();

            var read = rows.Single(m => m.ModuleId == target.Id);
            read.Price.Should().BeApproximately(40f, Tolerance);
            read.DiscountPrice.Should().BeApproximately(4f, Tolerance);
            read.PercentDiscountPrice.Should().BeApproximately(2f, Tolerance);

            // The database agrees with both responses.
            var row = await GetStoreModuleAsync(fx.StoreId, target.Id);
            row.IsActive.Should().BeTrue();
            row.Price.Should().BeApproximately(40f, Tolerance);
            (await GetStoreModuleAsync(fx.StoreId, ManagementModuleId)).IsActive.Should().BeFalse();
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }
}
