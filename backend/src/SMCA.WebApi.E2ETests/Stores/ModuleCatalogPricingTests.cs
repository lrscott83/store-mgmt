using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Administration.Modules;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Modules;
using Domain.Entities.StoreRoleFeatures;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// New coverage for the SuperAdmin module CATALOG pricing capability:
/// PUT /api/v1/modules/pricing, verified against GET /api/v1/modules/ToStore.
///
/// The global Module catalog had no write surface before this — only seed migrations could
/// change a price. This suite pins the seven clauses of that new write path, one per test:
/// <para>
///  1. a save PERSISTS the three prices and the catalog read reports them back;
///  2. CurrentPrice is RECALCULATED by the shared formula, clamped at zero;
///  3. ONLY the three pricing fields move — the catalog's structural flags survive, a
///     pricing save can never publish or hide a module, and the returned total sums the
///     BILLABLE rows only (a price-included module contributes 0);
///  4. the action-level SuperAdmin gate TIGHTENS the controller's class-level scope: an
///     OwnerAdmin who may read the catalog is refused 403 on the write;
///  5. validation rejects a negative price and a percent discount above 100, writing nothing;
///  6. an unknown module id aborts the WHOLE save — a valid sibling row is not half-written;
///  7. an empty or duplicated payload is refused, so a save can never be a silent no-op or
///     depend on payload order.
/// </para>
///
/// Modeled on StoreModulePricingTests (same WebAppFixture / real PostgreSQL harness,
/// DbTestHelpers.SeedSuperAdminAsync, AuthzSeed.SeedOwnerAdminAsync,
/// AuthzSeed.CleanupStoreGraphAsync) and shares its discipline: the catalog is read from
/// the database at run time rather than hardcoded, so these tests keep their meaning as the
/// Module/Feature catalog evolves.
/// <para>
/// MUTATION HYGIENE: this suite writes the SHARED seed catalog rows, which
/// DbTestHelpers.ResetDataAsync deliberately preserves. Every test therefore snapshots the
/// pricing of the modules it touches and restores it in a finally block via
/// ExecuteUpdateAsync (NoTracking-safe, and immune to the per-test teardown ordering), so no
/// test can leak catalog prices into the rest of the suite.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class ModuleCatalogPricingTests
{
    private readonly AppTestFactory _f;
    public ModuleCatalogPricingTests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>Float32 vs the JSON round trip: the plan's stated tolerance.</summary>
    private const float Tolerance = 0.001f;

    // Catalog module ids the migration seed provides (verified against smca_test). Each is
    // chosen for what it proves, not for its price.
    private const int StatisticsModuleId = 6;   // in the ToStore universe, NOT PriceIncluded
    private const int ManagementModuleId = 7;   // in the ToStore universe, PriceIncluded (bundled)
    private const int HiddenModuleId = 1;       // IsActive but NOT AvailableToStore -> outside the universe
    private const int UnknownModuleId = 999999; // no such Module row

    // ── Payload / row shapes ──────────────────────────────────────────────

    private sealed record PricingRow(int ModuleId, float Price, float DiscountPrice, float PercentDiscountPrice);

    private sealed record ModuleRow(int Id, string Name, bool IsActive, bool AvailableToStore,
        bool PriceIncluded, float Price, float DiscountPrice, float PercentDiscountPrice);

    private sealed record ModuleSnapshot(int Id, float Price, float DiscountPrice, float PercentDiscountPrice);

    private static object PricingBody(IEnumerable<PricingRow> rows) => new
    {
        Modules = rows.Select(r => new
        {
            r.ModuleId,
            r.Price,
            r.DiscountPrice,
            r.PercentDiscountPrice
        }).ToList()
    };

    // ── HTTP helpers ──────────────────────────────────────────────────────

    private Task<HttpResponseMessage> PutRawAsync(HttpClient client, IEnumerable<PricingRow> rows)
        => client.PutAsJsonAsync("/api/v1/modules/pricing", PricingBody(rows));

    private async Task<ApiResponse<ModuleCatalogPricingResultDto>> PutPricingAsync(
        HttpClient client, IEnumerable<PricingRow> rows)
    {
        var r = await PutRawAsync(client, rows);
        r.StatusCode.Should().Be(HttpStatusCode.OK, "the save must succeed");
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<ModuleCatalogPricingResultDto>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b;
    }

    private async Task<List<ModuleDto>> GetToStoreAsync(HttpClient client)
    {
        var r = await client.GetAsync("/api/v1/modules/ToStore");
        r.StatusCode.Should().Be(HttpStatusCode.OK, "the catalog read must succeed");
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<ModuleDto>>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b.Data!;
    }

    // ── Catalog reads (DB-driven, mirroring the real queries) ─────────────

    /// <summary>
    /// Mirrors ModuleRepository.GetAvailableModulesToStore exactly, filter AND ordering:
    /// IsActive &amp;&amp; AvailableToStore &amp;&amp; at least one active+available feature,
    /// ordered by PriceIncluded descending then Order. Reading the same universe from the
    /// database is what lets these tests assert against the catalog without hardcoding ids.
    /// </summary>
    private async Task<List<ModuleRow>> ToStoreCatalogAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var modules = await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.IsActive && m.AvailableToStore
                && m.Features.Any(f => f.IsActive && f.AvailableToStore))
            .OrderByDescending(m => m.PriceIncluded).ThenBy(m => m.Order)
            .ToListAsync();
        return modules
            .Select(m => new ModuleRow(m.Id, m.Name, m.IsActive, m.AvailableToStore,
                m.PriceIncluded, m.Price, m.DiscountPrice, m.PercentDiscountPrice))
            .ToList();
    }

    /// <summary>
    /// The FULL row, catalog flags included. ModuleDto has no IsActive column, so the only
    /// way to prove a flag survived the save is to read the entity itself.
    /// </summary>
    private async Task<ModuleRow> GetModuleRowAsync(int moduleId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var m = await db.Set<Module>().IgnoreQueryFilters().SingleAsync(x => x.Id == moduleId);
        return new ModuleRow(m.Id, m.Name, m.IsActive, m.AvailableToStore,
            m.PriceIncluded, m.Price, m.DiscountPrice, m.PercentDiscountPrice);
    }

    // ── Mutation hygiene: snapshot and restore the shared seed catalog ────

    private async Task<List<ModuleSnapshot>> SnapshotPricingAsync(params int[] moduleIds)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => moduleIds.Contains(m.Id))
            .Select(m => new ModuleSnapshot(m.Id, m.Price, m.DiscountPrice, m.PercentDiscountPrice))
            .ToListAsync();
    }

    /// <summary>
    /// ExecuteUpdateAsync deliberately: it issues the UPDATE directly, so it neither loads
    /// entities nor falls into the NoTracking trap (ApplicationDbContext sets
    /// QueryTrackingBehavior.NoTracking globally), where a query-then-mutate would write
    /// nothing — silently, with no exception.
    /// </summary>
    private async Task RestorePricingAsync(IEnumerable<ModuleSnapshot> snapshots)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        foreach (var s in snapshots)
        {
            await db.Set<Module>().IgnoreQueryFilters()
                .Where(m => m.Id == s.Id)
                .ExecuteUpdateAsync(set => set
                    .SetProperty(m => m.Price, s.Price)
                    .SetProperty(m => m.DiscountPrice, s.DiscountPrice)
                    .SetProperty(m => m.PercentDiscountPrice, s.PercentDiscountPrice));
        }
    }

    /// <summary>
    /// States, as assertions, the catalog facts the constants above stand for. A drift in
    /// the seed must fail HERE with an explanation, not silently weaken a later assertion
    /// (a test that cannot distinguish "flag preserved" from "flag was already false" pins
    /// nothing).
    /// </summary>
    private async Task AssertCatalogPreconditionsAsync()
    {
        var catalog = await ToStoreCatalogAsync();

        catalog.Should().Contain(m => m.Id == StatisticsModuleId,
            "precondition: the non-bundled target module must be inside the ToStore universe");
        catalog.Should().Contain(m => m.Id == ManagementModuleId,
            "precondition: the bundled module must be inside the ToStore universe");

        catalog.Single(m => m.Id == StatisticsModuleId).PriceIncluded.Should().BeFalse(
            "precondition: the target is NOT bundled, so PriceIncluded=false must be meaningful");
        catalog.Single(m => m.Id == ManagementModuleId).PriceIncluded.Should().BeTrue(
            "precondition: the bundled module must really be bundled");

        var hidden = await GetModuleRowAsync(HiddenModuleId);
        hidden.IsActive.Should().BeTrue("precondition: the hidden module is active...");
        hidden.AvailableToStore.Should().BeFalse("...but NOT available to stores, so it is outside the universe");
        catalog.Should().NotContain(m => m.Id == HiddenModuleId,
            "precondition: an unavailable module must not appear in the ToStore read");
    }

    // ══════════════════════════════════════════════════════════════════════
    // 1. Persisted, and reflected by the catalog read
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_persists_the_three_prices_and_the_catalog_read_reports_them_back()
    {
        var saLogin = $"mcp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var snapshot = await SnapshotPricingAsync(StatisticsModuleId);
        try
        {
            await AssertCatalogPreconditionsAsync();
            var before = await GetModuleRowAsync(StatisticsModuleId);
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            var body = await PutPricingAsync(client, new[]
            {
                new PricingRow(StatisticsModuleId, 42.5f, 7.25f, 12.5f)
            });

            // The save echoes the row it wrote, with the effective price already applied.
            var echoed = body.Data!.Modules.Should().ContainSingle().Subject;
            echoed.ModuleId.Should().Be(StatisticsModuleId);
            echoed.Name.Should().Be(before.Name);
            echoed.Price.Should().BeApproximately(42.5f, Tolerance);
            echoed.DiscountPrice.Should().BeApproximately(7.25f, Tolerance);
            echoed.PercentDiscountPrice.Should().BeApproximately(12.5f, Tolerance);
            // 42.5 - 42.5*0.125 - 7.25 = 42.5 - 5.3125 - 7.25 = 29.9375
            echoed.CurrentPrice.Should().BeApproximately(29.9375f, Tolerance);

            // PERSISTED, not merely echoed: the database agrees.
            var persisted = await GetModuleRowAsync(StatisticsModuleId);
            persisted.Price.Should().BeApproximately(42.5f, Tolerance);
            persisted.DiscountPrice.Should().BeApproximately(7.25f, Tolerance);
            persisted.PercentDiscountPrice.Should().BeApproximately(12.5f, Tolerance);

            // And a SEPARATE read request — GET /v1/modules/ToStore — reports the new values,
            // which is the page's own reload path after a save.
            var read = (await GetToStoreAsync(client)).Single(m => m.Id == StatisticsModuleId);
            read.Price.Should().BeApproximately(42.5f, Tolerance);
            read.DiscountPrice.Should().BeApproximately(7.25f, Tolerance);
            read.PercentDiscountPrice.Should().BeApproximately(12.5f, Tolerance);
            read.CurrentPrice.Should().BeApproximately(29.9375f, Tolerance);
        }
        finally
        {
            await RestorePricingAsync(snapshot);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. The shared formula, and its clamp at zero
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_recalculates_the_current_price_with_the_shared_formula_clamps_at_zero()
    {
        var saLogin = $"mcp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var snapshot = await SnapshotPricingAsync(StatisticsModuleId);
        try
        {
            await AssertCatalogPreconditionsAsync();
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            // CurrentPriceServiceUtils.GetCurrentPrice(100, 10, 5) = 100 - 10 - 5 = 85.
            var first = await PutPricingAsync(client,
                new[] { new PricingRow(StatisticsModuleId, 100f, 5f, 10f) });
            first.Data!.Modules.Should().ContainSingle()
                .Which.CurrentPrice.Should().BeApproximately(85f, Tolerance);
            first.Data!.TotalCurrentPrice.Should().BeApproximately(85d, 0.001d);

            // The catalog read computes the SAME value, from ModuleProfile — so the number
            // the editor shows after a save is the number the read reports.
            var read = (await GetToStoreAsync(client)).Single(m => m.Id == StatisticsModuleId);
            read.CurrentPrice.Should().BeApproximately(85f, Tolerance);

            // GetCurrentPrice(10, 50, 20) = -15, clamped at 0 — an over-discounted module
            // is free, never negative money.
            var second = await PutPricingAsync(client,
                new[] { new PricingRow(StatisticsModuleId, 10f, 20f, 50f) });
            second.Data!.Modules.Should().ContainSingle()
                .Which.CurrentPrice.Should().BeApproximately(0f, Tolerance);
            second.Data!.TotalCurrentPrice.Should().BeApproximately(0d, 0.001d);
            (await GetToStoreAsync(client)).Single(m => m.Id == StatisticsModuleId)
                .CurrentPrice.Should().BeApproximately(0f, Tolerance);
        }
        finally
        {
            await RestorePricingAsync(snapshot);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. Only the three pricing fields move
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_changes_only_the_three_prices_and_leaves_the_catalog_flags_intact()
    {
        var saLogin = $"mcp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var snapshot = await SnapshotPricingAsync(StatisticsModuleId, ManagementModuleId, HiddenModuleId);
        try
        {
            await AssertCatalogPreconditionsAsync();
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var nameBefore = (await GetModuleRowAsync(StatisticsModuleId)).Name;

            // A non-bundled module and a BUNDLED one, priced in the same save.
            var first = await PutPricingAsync(client, new[]
            {
                new PricingRow(StatisticsModuleId, 88f, 1f, 2f),
                new PricingRow(ManagementModuleId, 77f, 3f, 4f)
            });

            // The total is the BILLABLE sum — ModulePriceCalculator.IsBillable = active AND
            // not price-included — so the bundled row, though saved and echoed, charges
            // nothing: only Statistics counts, at GetCurrentPrice(88, 2, 1)
            // = 88 - 1.76 - 1 = 85.24. (Before the rule, this was 85.24 + 70.92 = 156.16.)
            first.Data!.TotalCurrentPrice.Should().BeApproximately(85.24f, Tolerance,
                "a price-included module contributes 0 to the total");
            // The bundled row still REPORTS what it would cost: 77 - 3.08 - 3 = 70.92.
            first.Data!.Modules.Should().ContainSingle(m => m.ModuleId == ManagementModuleId)
                .Which.CurrentPrice.Should().BeApproximately(70.92f, Tolerance,
                    "a non-billable row still reports its effective price");


            var unbundled = await GetModuleRowAsync(StatisticsModuleId);
            var bundled = await GetModuleRowAsync(ManagementModuleId);

            // The three prices moved on both.
            unbundled.Price.Should().BeApproximately(88f, Tolerance);
            unbundled.DiscountPrice.Should().BeApproximately(1f, Tolerance);
            unbundled.PercentDiscountPrice.Should().BeApproximately(2f, Tolerance);
            bundled.Price.Should().BeApproximately(77f, Tolerance);
            bundled.DiscountPrice.Should().BeApproximately(3f, Tolerance);
            bundled.PercentDiscountPrice.Should().BeApproximately(4f, Tolerance);

            // Every structural flag survived — in BOTH directions, so neither "stayed true"
            // nor "stayed false" can be an accident of the seed.
            unbundled.IsActive.Should().BeTrue();
            unbundled.AvailableToStore.Should().BeTrue();
            unbundled.PriceIncluded.Should().BeFalse();
            unbundled.Name.Should().Be(nameBefore, "a pricing save must never rename a module");
            bundled.IsActive.Should().BeTrue();
            bundled.AvailableToStore.Should().BeTrue();
            bundled.PriceIncluded.Should().BeTrue("a pricing save must never un-bundle a module");

            // And a module OUTSIDE the ToStore universe can be priced without being
            // published: the save writes the price, but the catalog's own visibility flag
            // is not this endpoint's to change.
            await PutPricingAsync(client, new[] { new PricingRow(HiddenModuleId, 64f, 0f, 0f) });
            var hidden = await GetModuleRowAsync(HiddenModuleId);
            hidden.Price.Should().BeApproximately(64f, Tolerance, "the price itself is writable");
            hidden.AvailableToStore.Should().BeFalse("a pricing save must never publish a hidden module");
            hidden.IsActive.Should().BeTrue();
            (await GetToStoreAsync(client)).Should().NotContain(m => m.Id == HiddenModuleId,
                "the module must stay out of the catalog read");
        }
        finally
        {
            await RestorePricingAsync(snapshot);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. The action-level SuperAdmin gate tightens the class-level scope
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task An_owner_admin_who_may_read_the_catalog_is_forbidden_on_the_pricing_write()
    {
        var saLogin = $"mcp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        // The OwnerAdmin fixture gives the user the Management module, which is what the
        // controller's CLASS-level [HasPermission(StoreRoleFeatures.StoresAdmin)] requires.
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var snapshot = await SnapshotPricingAsync(StatisticsModuleId);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var before = await GetModuleRowAsync(StatisticsModuleId);

            // Precondition, and the point of the test: this OwnerAdmin IS admitted by the
            // class-level scope. Without it, a 403 on the write would prove nothing about
            // the action-level override.
            (await GetToStoreAsync(client)).Should().NotBeEmpty(
                "the OwnerAdmin must pass the class-level StoresAdmin gate");

            var put = await PutRawAsync(client, new[] { new PricingRow(StatisticsModuleId, 500f, 0f, 0f) });
            put.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            var after = await GetModuleRowAsync(StatisticsModuleId);
            after.Price.Should().BeApproximately(before.Price, Tolerance);
            after.DiscountPrice.Should().BeApproximately(before.DiscountPrice, Tolerance);
            after.PercentDiscountPrice.Should().BeApproximately(before.PercentDiscountPrice, Tolerance);
        }
        finally
        {
            await RestorePricingAsync(snapshot);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. Validation, and validation writes nothing
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_rejects_a_negative_price_and_a_percent_discount_above_one_hundred()
    {
        var saLogin = $"mcp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var snapshot = await SnapshotPricingAsync(StatisticsModuleId);
        try
        {
            await AssertCatalogPreconditionsAsync();
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var before = await GetModuleRowAsync(StatisticsModuleId);

            // A negative price is not a discount.
            var negative = await PutRawAsync(client,
                new[] { new PricingRow(StatisticsModuleId, -1f, 0f, 0f) });
            negative.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            // A percent above 100 is a price INCREASE: GetCurrentPrice subtracts
            // price*percent/100, so 150 hands back a negative amount only the clamp hides.
            var overPercent = await PutRawAsync(client,
                new[] { new PricingRow(StatisticsModuleId, 100f, 0f, 101f) });
            overPercent.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            // The 400s came from the 400 envelope, not from a proxy or a deserialization fault.
            var body = await negative.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().NotBeEmpty();

            // Validation precedes persistence: neither rejected payload touched the catalog.
            var after = await GetModuleRowAsync(StatisticsModuleId);
            after.Price.Should().BeApproximately(before.Price, Tolerance);
            after.DiscountPrice.Should().BeApproximately(before.DiscountPrice, Tolerance);
            after.PercentDiscountPrice.Should().BeApproximately(before.PercentDiscountPrice, Tolerance);
        }
        finally
        {
            await RestorePricingAsync(snapshot);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 6. An unknown module id aborts the WHOLE save
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_rejects_an_unknown_module_id_without_writing_the_valid_row()
    {
        var saLogin = $"mcp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var snapshot = await SnapshotPricingAsync(StatisticsModuleId);
        try
        {
            await AssertCatalogPreconditionsAsync();
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var before = await GetModuleRowAsync(StatisticsModuleId);

            // A stale client sends a whole table; ONE id has since disappeared. The valid
            // row comes FIRST, so a handler that wrote as it iterated would persist it.
            var response = await PutRawAsync(client, new[]
            {
                new PricingRow(StatisticsModuleId, 333f, 0f, 0f),
                new PricingRow(UnknownModuleId, 10f, 0f, 0f)
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "an unknown module id is rejected, not silently skipped");
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().NotBeEmpty();

            // No partial write: the valid row kept its values.
            var after = await GetModuleRowAsync(StatisticsModuleId);
            after.Price.Should().BeApproximately(before.Price, Tolerance,
                "an unknown id must abort the save, never half-apply it");
            after.DiscountPrice.Should().BeApproximately(before.DiscountPrice, Tolerance);
            after.PercentDiscountPrice.Should().BeApproximately(before.PercentDiscountPrice, Tolerance);
        }
        finally
        {
            await RestorePricingAsync(snapshot);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 7. An empty or duplicated payload is refused
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Put_rejects_an_empty_and_a_duplicated_payload()
    {
        var saLogin = $"mcp-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var snapshot = await SnapshotPricingAsync(StatisticsModuleId);
        try
        {
            await AssertCatalogPreconditionsAsync();
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var before = await GetModuleRowAsync(StatisticsModuleId);

            // An empty table is a silent no-op masquerading as a save.
            (await client.PutAsJsonAsync("/api/v1/modules/pricing",
                PricingBody(Array.Empty<PricingRow>()))).StatusCode
                .Should().Be(HttpStatusCode.BadRequest);

            // Two rows for the same module would make the persisted price depend on
            // payload order, so the save fails closed instead of picking a winner.
            (await PutRawAsync(client, new[]
            {
                new PricingRow(StatisticsModuleId, 10f, 0f, 0f),
                new PricingRow(StatisticsModuleId, 20f, 0f, 0f)
            })).StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var after = await GetModuleRowAsync(StatisticsModuleId);
            after.Price.Should().BeApproximately(before.Price, Tolerance,
                "a rejected payload must never reach the catalog");
        }
        finally
        {
            await RestorePricingAsync(snapshot);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }
}
