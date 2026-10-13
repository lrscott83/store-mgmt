using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E coverage for the CARD PRICE RULE the product owner stated verbatim:
/// "the price a store must pay is the sum of all the modules it has assigned and that
/// are ACTIVE in its configuration".
///
/// The store cards on both sides read the same two fields —
/// GET /v1/stores/my-stores (OwnerStoreDto.PlanPrice/PlanCurrentPrice) and
/// GET /v1/stores/by-current-user (StoreDto.PlanPrice/PlanCurrentPrice) — so the rule
/// is pinned on BOTH views at once. The seeded store deliberately carries a
/// <see cref="StoreModule"/> snapshot that does NOT match its Superior plan catalog:
/// a subset of the plan's paid modules, explicit snapshot prices that differ from the
/// live catalog, one bundled (price-included) row and one dead (IsActive=false) row.
///
/// Asserted:
///   SNAP-1  the card totals are Σ over the store's OWN active, not-price-included rows
///           (base = Σ Price, effective = Σ GetCurrentPrice) — both views;
///   SNAP-2  the bundled row and the dead row contribute NOTHING;
///   SNAP-3  the same number is what GET /v1/stores/to-collect reports as the amount
///           to charge — the card price and the billed amount are one number;
///   SNAP-4  the card does NOT show the plan catalog's total.
/// </summary>
[Collection("e2e")]
public sealed class StoreModuleSnapshotCardPriceTests
{
    private readonly AppTestFactory _f;
    public StoreModuleSnapshotCardPriceTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Only the fields the rule touches.
    private sealed record CardDto(
        Guid Id, string Name, bool Approved, string PlanType,
        float? PlanPrice, float? PlanCurrentPrice);

    private sealed record PlanShape(int Id, string PlanType, float Price);

    private sealed record CollectDto(Guid StoreId, string StoreName, float Amount);

    // ── The seeded snapshot, deliberately NOT the Superior catalog ──────────────
    //   module  7 (Management)   bundled / price-included → contributes nothing
    //   module  6 (Statistics)   321 with 25% discount   → 240.75
    //   module 13 (Warehouses)   577 with 50 fixed off   → 527
    //   module 14 (MultiStores)  913 with 10% discount   → 821.70
    //   module 12 (Wholesale)    DEAD row (IsActive=false) priced 4000 → nothing
    private const int WarehousesModuleId = 13;
    private const int MultiStoresModuleId = 14;
    private const int DeadModuleId = 12;

    private const float StatisticsPrice = 321f;
    private const float StatisticsPercentDiscount = 25f;
    private const float WarehousesPrice = 577f;
    private const float WarehousesFixedDiscount = 50f;
    private const float MultiStoresPrice = 913f;
    private const float MultiStoresPercentDiscount = 10f;
    private const float DeadRowPrice = 4000f;

    /// <summary>base total = Σ Price over the billable rows = 321 + 577 + 913 = 1811.</summary>
    private static readonly float ExpectedBase = StatisticsPrice + WarehousesPrice + MultiStoresPrice;

    /// <summary>effective total = Σ GetCurrentPrice over the SAME rows = 1589.45.</summary>
    private static readonly float ExpectedCurrent =
        Current(StatisticsPrice, StatisticsPercentDiscount, 0f)
        + Current(WarehousesPrice, 0f, WarehousesFixedDiscount)
        + Current(MultiStoresPrice, MultiStoresPercentDiscount, 0f);

    // Independent restatement of the effective-price formula (price − pct% − fixed, floored at 0)
    // so the expectation is readable from the test instead of being a copy of production code.
    private static float Current(float price, float percentDiscount, float discount)
        => price - price * percentDiscount / 100f - discount;

    // Independent sums may accumulate in a different order than the handler's.
    private const float Tolerance = 0.01f;

    private sealed record Seeded(Guid StoreId, Guid OwnerId, Guid UserId, string Login, Guid TenantId);

    // ═══ SNAP-1 + SNAP-2 — the owner view (GET /v1/stores/my-stores) ═══════════

    [Fact]
    public async Task SNAP1_my_stores_card_price_sums_the_stores_own_active_billable_modules()
    {
        var seeded = await SeedSnapshotStoreAsync();
        try
        {
            var mine = await ListMyStoresAsync(DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login));

            var card = mine.Single(s => s.Id == seeded.StoreId);
            card.Approved.Should().BeTrue();
            card.PlanType.Should().Be("Superior");

            card.PlanPrice.Should().NotBeNull();
            card.PlanCurrentPrice.Should().NotBeNull();

            card.PlanPrice!.Value.Should().BeApproximately(ExpectedBase, Tolerance,
                "PlanPrice is Σ Price over the store's own ACTIVE, not-price-included StoreModule rows");
            card.PlanCurrentPrice!.Value.Should().BeApproximately(ExpectedCurrent, Tolerance,
                "PlanCurrentPrice is Σ GetCurrentPrice over the SAME rows the billing formula charges");

            // SNAP-2: neither the bundled row nor the dead (IsActive=false) row contributes.
            card.PlanCurrentPrice!.Value.Should().NotBeApproximately(ExpectedCurrent + DeadRowPrice, Tolerance,
                "a soft-deleted leftover row must never leak into the card price");
            card.PlanPrice!.Value.Should().NotBeApproximately(ExpectedBase + DeadRowPrice, Tolerance,
                "the bundled module (price-included) and the dead row are outside the base total too");
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, seeded);
        }
    }

    // ═══ SNAP-1 — the SuperAdmin view (GET /v1/stores/by-current-user) ═════════

    [Fact]
    public async Task SNAP2_by_current_user_card_price_sums_the_stores_own_active_billable_modules()
    {
        var seeded = await SeedSnapshotStoreAsync();
        var superLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, superLogin, "Password123");
        try
        {
            var list = await ListSuperStoresAsync(DbTestHelpers.AuthedClient(_f, superAdminId, superLogin));

            var card = list.Single(s => s.Id == seeded.StoreId);
            card.PlanType.Should().Be("Superior");

            card.PlanPrice.Should().NotBeNull();
            card.PlanCurrentPrice.Should().NotBeNull();

            card.PlanPrice!.Value.Should().BeApproximately(ExpectedBase, Tolerance,
                "the superadmin listing sums the store's own ACTIVE, not-price-included rows");
            card.PlanCurrentPrice!.Value.Should().BeApproximately(ExpectedCurrent, Tolerance,
                "both store views expose the same number — one rule, one total");
            card.PlanCurrentPrice!.Value.Should().NotBeApproximately(ExpectedCurrent + DeadRowPrice, Tolerance,
                "a soft-deleted leftover row must never leak into the listing price");
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, seeded);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    // ═══ SNAP-3 + SNAP-4 — the card price IS the amount to collect ═════════════

    [Fact]
    public async Task SNAP3_card_price_equals_the_to_collect_amount_and_is_not_the_plan_catalog_total()
    {
        var seeded = await SeedSnapshotStoreAsync();
        var superLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, superLogin, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, superAdminId, superLogin);

            // The plan catalog total, straight from the plans endpoint — the WRONG answer
            // for a store whose snapshot differs (the bug this file exists to pin).
            var plansRes = await client.GetAsync("/api/v1/plans");
            plansRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var plans = (await plansRes.Content.ReadFromJsonAsync<ApiResponse<List<PlanShape>>>(ApiResponse.Json))!.Data;
            var superiorCatalogPrice = plans.Single(p => p.PlanType == "Superior").Price;

            var card = (await ListSuperStoresAsync(client)).Single(s => s.Id == seeded.StoreId);

            // SNAP-4 — the card must NOT show the whole Superior catalog total.
            card.PlanCurrentPrice.Should().NotBeNull();
            card.PlanCurrentPrice!.Value.Should().NotBeApproximately(superiorCatalogPrice, Tolerance,
                "the card price is the store's own module sum, never the plan catalog's total");

            // SNAP-3 — and the number it shows is exactly what gets charged.
            var collectRes = await client.GetAsync("/api/v1/stores/to-collect");
            collectRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var collect = (await collectRes.Content.ReadFromJsonAsync<ApiResponse<List<CollectDto>>>(ApiResponse.Json))!.Data;

            var row = collect.SingleOrDefault(s => s.StoreId == seeded.StoreId);
            row.Should().NotBeNull("the seeded store is approved, paid and due within the due-soon window");
            row!.Amount.Should().BeApproximately(ExpectedCurrent, Tolerance,
                "to-collect charges the billing formula over the store's own rows");
            row.Amount.Should().BeApproximately(card.PlanCurrentPrice!.Value, Tolerance,
                "the card price and the billed amount must be the same number");
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, seeded);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    // ─── seeding ──────────────────────────────────────────────────────────────

    private async Task<Seeded> SeedSnapshotStoreAsync()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var tenantId = owner.TenantId;
        Guid storeId;

        // Billing anchor: nextDue = paymentStart + trial(1) + 1 month = today + 3d,
        // which is PorVencer — the window GET /v1/stores/to-collect actually reports.
        // Same arithmetic BillingConfigSeed's TrialMonths=1 and GetStoresToCollectTests use.
        var paymentStart = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-2).AddDays(3);

        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = Store.Create($"SNAP-{Guid.NewGuid():N}", owner.OwnerId, true, tenantId,
                paymentStart, storePlanId: (int)StorePlanType.Superior);
            db.Set<Store>().Add(store);
            await db.SaveChangesAsync();

            // Bundled / price-included row → outside both totals.
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, BillingSeed.ManagementModuleId, 0f, true, 0f, 0f, 0f, tenantId));

            // The three billable rows. Explicit snapshot prices — never read from the
            // catalog — so the expectation cannot move with catalog edits.
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, BillingSeed.StatisticsModuleId,
                StatisticsPrice, false, StatisticsPrice, 0f, StatisticsPercentDiscount, tenantId));
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, WarehousesModuleId,
                WarehousesPrice, false, WarehousesPrice, WarehousesFixedDiscount, 0f, tenantId));
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, MultiStoresModuleId,
                MultiStoresPrice, false, MultiStoresPrice, 0f, MultiStoresPercentDiscount, tenantId));

            // A DEAD leftover row (soft-deleted) that must never leak a price.
            var dead = StoreModule.Create(
                store.Id, DeadModuleId, DeadRowPrice, false, DeadRowPrice, 0f, 0f, tenantId);
            dead.IsActive = false;
            db.Set<StoreModule>().Add(dead);

            await db.SaveChangesAsync();
            storeId = store.Id;
        }

        return new Seeded(storeId, owner.OwnerId, owner.UserId, owner.Login, tenantId);
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private static async Task<List<CardDto>> ListMyStoresAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/v1/stores/my-stores");
        res.StatusCode.Should().Be(HttpStatusCode.OK, "the seeded owner-admin must pass the StoresAdmin gate");
        return (await res.Content.ReadFromJsonAsync<ApiResponse<List<CardDto>>>(ApiResponse.Json))!.Data;
    }

    private static async Task<List<CardDto>> ListSuperStoresAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/v1/stores/by-current-user");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await res.Content.ReadFromJsonAsync<ApiResponse<List<CardDto>>>(ApiResponse.Json))!.Data;
    }

    /// <summary>
    /// Owner-wide cleanup in FK order: every store of the owner (each with its
    /// StoreRoleFeature / StoreUser / StoreModule children) — AuthzSeed also creates a
    /// default store for the owner, so a single-store delete would leave that one behind
    /// and the Owner delete would fail on FK_Store_Owner_OwnerId — then Owner, UserRole, User.
    /// </summary>
    private static async Task CleanupOwnerGraphAsync(AppTestFactory factory, Seeded seeded)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var storeIds = await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.OwnerId == seeded.OwnerId).Select(s => s.Id).ToListAsync();
        foreach (var storeId in storeIds)
        {
            await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
            await db.Set<StoreUser>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
            await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
        }
        await db.Set<Store>().IgnoreQueryFilters().Where(s => s.OwnerId == seeded.OwnerId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters().Where(o => o.Id == seeded.OwnerId).ExecuteDeleteAsync();
        await db.Set<UserRole>().IgnoreQueryFilters().Where(r => r.UserId == seeded.UserId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters().Where(u => u.Id == seeded.UserId).ExecuteDeleteAsync();
    }
}
