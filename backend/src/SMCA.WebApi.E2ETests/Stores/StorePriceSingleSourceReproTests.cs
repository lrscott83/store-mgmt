using System.Net;
using System.Net.Http.Json;
using Application.Dtos.StoreManagement;
using Domain.Common.Constants;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// Owner report (2026-10-14): for the SAME store, the per-store modules popup and the store
/// card showed DIFFERENT totals — "the store's modules view says 10, the store card
/// (SuperAdmin and Owner) says 12.5".
///
/// Root cause (pinned by this file): the two totals did NOT read the same row set.
///   • Card  – GET /v1/stores/by-current-user (StoreDto.PlanCurrentPrice) and
///             GET /v1/stores/my-stores (OwnerStoreDto.PlanCurrentPrice)
///             = ModulePriceCalculator.CalculateTotal over EVERY active, not-price-included
///               row of the store's OWN snapshot (its configuration).
///   • Popup – GET /v1/stores/{id}/module-pricing (TotalCurrentPrice)
///             = the SAME formula, but previously ONLY over rows whose Module was inside
///               ModuleRepository.GetAvailableModulesToStore() (globally active + available
///               to store + at least one active, available feature).
///
/// Owner decision (2026-10-14): the store's OWN configuration is the source of truth — a row
/// that is ACTIVE and BILLABLE counts even when its Module is no longer in the catalog. So
/// the popup must LIST that row (so it can be seen and deactivated) and COUNT it. Both views
/// must report the SAME number.
///
/// The owner's numbers: Pago modules at price 2 / 50% off (5 x 1 = 5) plus two Superior
/// modules at price 5 / 50% off (2 x 2.5 = 5) => 10; plus one active out-of-catalog row of
/// 2.5 (price 5 / 50%) => the card's 12.5, which is the store's true configuration.
/// </summary>
[Collection("e2e")]
public sealed class StorePriceSingleSourceReproTests
{
    private readonly AppTestFactory _f;
    public StorePriceSingleSourceReproTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const float Tolerance = 0.01f;

    private const float PagoUnitPrice = 2f;        // "Pago" rows: price 2, 50% off -> 1 each
    private const float PagoPercent = 50f;
    private const float SuperiorUnitPrice = 5f;    // "Superior" rows: price 5, 50% off -> 2.5 each
    private const float SuperiorPercent = 50f;

    /// <summary>Σ over the configuration the popup can see: 5x1 + 2x2.5 = 10.</summary>
    private const float PopupVisibleTotal = 5f * 1f + 2f * 2.5f;

    /// <summary>The store's FULL configuration when the hidden 2.5 row exists: 12.5.</summary>
    private const float FullStoreConfigTotal = PopupVisibleTotal + 2.5f;

    private sealed record CardDto(Guid Id, string Name, bool Approved, string PlanType,
        float? PlanPrice, float? PlanCurrentPrice);

    private sealed record CatalogModule(int Id, string Name, float Price, bool PriceIncluded);

    /// <summary>One row of the pricing save payload (mirrors the endpoint's request shape).</summary>
    private sealed record PricingRowInput(int ModuleId, bool IsSelected, float Price,
        float DiscountPrice, float PercentDiscountPrice);

    // ── DB helpers ─────────────────────────────────────────────────────────────

    /// <summary>Mirrors ModuleRepository.GetAvailableModulesToStore exactly (the popup universe).</summary>
    private async Task<List<CatalogModule>> AvailableCatalogAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var modules = await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.IsActive && m.AvailableToStore
                && m.Features.Any(f => f.IsActive && f.AvailableToStore))
            .OrderByDescending(m => m.PriceIncluded).ThenBy(m => m.Order)
            .ToListAsync();
        return modules.Select(m => new CatalogModule(m.Id, m.Name, m.Price, m.PriceIncluded)).ToList();
    }

    private async Task<List<int>> AllModuleIdsAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.IsActive)
            .OrderBy(m => m.Id)
            .Select(m => m.Id)
            .ToListAsync();
    }

    private async Task SeedStoreModuleAsync(Guid storeId, int moduleId, float price, float percent, float discount)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreModule>().Add(StoreModule.Create(storeId, moduleId, price, false, price, discount, percent,
            DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
    }

    // ── HTTP helpers ───────────────────────────────────────────────────────────

    private async Task<List<CardDto>> ListSuperStoresAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/v1/stores/by-current-user");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await res.Content.ReadFromJsonAsync<ApiResponse<List<CardDto>>>(ApiResponse.Json))!.Data!;
    }

    private async Task<StoreModulePricingReadResultDto> GetPricingAsync(HttpClient client, Guid storeId)
    {
        var res = await client.GetAsync($"/api/v1/stores/{storeId}/module-pricing");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await res.Content.ReadFromJsonAsync<ApiResponse<StoreModulePricingReadResultDto>>(ApiResponse.Json))!.Data!;
    }

    private async Task<StoreModulePricingResultDto> PutPricingAsync(HttpClient client, Guid storeId,
        IEnumerable<PricingRowInput> rows)
    {
        var body = new
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
        var res = await client.PutAsJsonAsync($"/api/v1/stores/{storeId}/module-pricing", body);
        res.StatusCode.Should().Be(HttpStatusCode.OK, "the save must succeed");
        return (await res.Content.ReadFromJsonAsync<ApiResponse<StoreModulePricingResultDto>>(ApiResponse.Json))!.Data!;
    }

    // ── Seed: the owner's store configuration ──────────────────────────────────

    /// <summary>
    /// Seeds a store whose configuration is: 5 "Pago" rows (price 2 / 50%) + 2 "Superior"
    /// rows (price 5 / 50%), and optionally ONE extra active billable row whose Module is
    /// outside the popup universe (the hidden 2.5). All prices are explicit snapshot values,
    /// never read from the catalog, so the expectation cannot drift with catalog edits.
    /// </summary>
    private async Task<(StoreSeed.StoreFixture Fx, int OutsideModuleId)> SeedConfigAsync(bool withHiddenRow)
    {
        var fx = await StoreSeed.SeedStoreAsync(_f, $"REPRO-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { StoreSeed.ManagementModuleId });

        var catalog = await AvailableCatalogAsync();
        var inUniverse = catalog
            .Where(m => m.Id != StoreSeed.ManagementModuleId && !m.PriceIncluded)
            .Take(7).ToList();
        inUniverse.Should().HaveCount(7, "precondition: the catalog must offer 7 in-universe billable modules");

        foreach (var m in inUniverse.Take(5))
            await SeedStoreModuleAsync(fx.StoreId, m.Id, PagoUnitPrice, PagoPercent, 0f);
        foreach (var m in inUniverse.Skip(5))
            await SeedStoreModuleAsync(fx.StoreId, m.Id, SuperiorUnitPrice, SuperiorPercent, 0f);

        var inUniverseIds = catalog.Select(m => m.Id).ToHashSet();
        var outside = (await AllModuleIdsAsync()).First(id => !inUniverseIds.Contains(id));

        if (withHiddenRow)
            await SeedStoreModuleAsync(fx.StoreId, outside, SuperiorUnitPrice, SuperiorPercent, 0f);

        return (fx, outside);
    }

    // ═══ Control: every active row is inside the popup universe → the two agree ═══

    [Fact]
    public async Task Store_popup_and_card_agree_when_every_active_row_is_in_the_catalog_universe()
    {
        var (fx, _) = await SeedConfigAsync(withHiddenRow: false);
        var saLogin = $"repro-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var card = (await ListSuperStoresAsync(client)).Single(s => s.Id == fx.StoreId);
            var popup = await GetPricingAsync(client, fx.StoreId);

            card.Approved.Should().BeTrue();
            card.PlanCurrentPrice.Should().BeApproximately(PopupVisibleTotal, Tolerance);
            popup.TotalCurrentPrice.Should().BeApproximately(PopupVisibleTotal, 0.0001d);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ═══ FIX: a store row outside the catalog is LISTED and COUNTED by both views ═══

    [Fact]
    public async Task Active_store_row_outside_the_catalog_universe_is_listed_and_counted_by_both_views()
    {
        var (fx, outsideModuleId) = await SeedConfigAsync(withHiddenRow: true);
        var saLogin = $"repro-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var card = (await ListSuperStoresAsync(client)).Single(s => s.Id == fx.StoreId);
            var popup = await GetPricingAsync(client, fx.StoreId);

            // The store's FULL configuration, out-of-catalog row included: 12.5 in BOTH views.
            card.PlanCurrentPrice.Should().BeApproximately(FullStoreConfigTotal, Tolerance,
                "the card sums every active, billable row of the store's own snapshot");

            // The out-of-catalog row is now LISTED, so the operator can see and deactivate it...
            popup.Modules.Select(m => m.ModuleId).Should().Contain(outsideModuleId,
                "a row the store holds must be visible even when its module left the catalog");

            // ...and COUNTED, so the per-store view and the card report ONE number.
            popup.TotalCurrentPrice.Should().BeApproximately(FullStoreConfigTotal, 0.0001d,
                "the per-store view sums the store's OWN rows, not the catalog universe");
            popup.TotalCurrentPrice.Should().BeApproximately((double)card.PlanCurrentPrice!.Value, 0.0001d,
                "the per-store view and the card must report the same total for the same store");
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ═══ FIX: the save echo reports the same total the card charges ═══

    [Fact]
    public async Task Saving_the_per_store_view_echoes_the_same_total_the_card_charges()
    {
        var (fx, outsideModuleId) = await SeedConfigAsync(withHiddenRow: true);
        var saLogin = $"repro-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var cardBefore = (await ListSuperStoresAsync(client)).Single(s => s.Id == fx.StoreId);
            var popup = await GetPricingAsync(client, fx.StoreId);

            // The client sends back the WHOLE list it was shown, ticked exactly as-is.
            var payload = popup.Modules.Select(m => new PricingRowInput(
                m.ModuleId, m.IsActive, m.Price, m.DiscountPrice, m.PercentDiscountPrice));

            var saved = await PutPricingAsync(client, fx.StoreId, payload);

            saved.Modules.Select(m => m.ModuleId).Should().Contain(outsideModuleId,
                "the out-of-catalog row must survive the save so it stays visible and deactivatable");
            saved.TotalCurrentPrice.Should().BeApproximately(FullStoreConfigTotal, 0.0001d,
                "the save echo sums the store's own rows, not the catalog universe");
            saved.TotalCurrentPrice.Should().BeApproximately((double)cardBefore.PlanCurrentPrice!.Value, 0.0001d,
                "the number the view saves and the number the card charges are ONE number");

            // And a fresh card read agrees after the save.
            var cardAfter = (await ListSuperStoresAsync(client)).Single(s => s.Id == fx.StoreId);
            cardAfter.PlanCurrentPrice.Should().BeApproximately(FullStoreConfigTotal, Tolerance);
        }
        finally
        {
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }
}
