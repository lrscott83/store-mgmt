using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Plans;

/// <summary>
/// E2E matrix for <c>POST /api/v1/stores/{id}/change-plan</c> covering every REAL
/// plan transition (from ≠ to) that lacked an EXACT assertion of the target-plan
/// universe. Second audit 2026-09-24: same-plan no-ops (Gratis → Gratis, Pago → Pago,
/// Superior → Superior, VIP → VIP) are NOT plan changes and are deliberately excluded
/// (user decision 2026-09-24). Transitions already covered exactly stay in their own
/// files (Pago → Gratis and Pago → Superior / Superior → Gratis: MeAfterOwnerPlanChangeTests
/// B3/B1 assert the exact target StoreModuleIds + features). This file holds the other 9:
/// <list type="bullet">
/// <item>Gratis → VIP, Pago → VIP, Superior → VIP, VIP → Gratis, VIP → Pago, VIP → Superior;</item>
/// <item>Gratis → Superior (previously only StorePlanId was asserted);</item>
/// <item>Gratis → Pago (existing B3 is StoreUser-view Contain only — no exact Pago universe);</item>
/// <item>Superior → Pago (existing EM4/MM4 only strip Elaboration/MultiMonedas — no positive Pago universe).</item>
/// </list>
/// <para>
/// Every case seeds the store on the FROM plan with its FULL module + feature universe,
/// then asserts after the change: StorePlanId, active <c>StoreModule</c>s == the TO
/// universe EXACTLY (old-plan extras retired), active <c>StoreRoleFeature</c>s == the
/// TO mapped features EXACTLY, and — with the SAME owner token, no relogin — /me
/// returns the TO universe in StoreModuleIds, PlanType, FeatureIds and Roles.
/// </para>
/// <para>
/// Caller matrix (billing/spec.md, 2026-09-18): targets Superior/VIP are
/// SuperAdmin-reserved and require a SuperAdmin caller; every other target
/// (Gratis/Pago) is owner-callable.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class PlanChangeMatrixTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public PlanChangeMatrixTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    // ── Plan universes exactly as change-plan materialises them ────────────────
    // universe = catalog PriceIncluded modules (Sales/Inventory/Synchronization/
    // Management, see ModuleEntityTypeConfiguration) ∪ StorePlanModule members
    // (StorePlanModuleEntityTypeConfiguration) — both verified by StorePlanCatalogTests.

    private static readonly int[] GratisUniverse =
    [
        (int)ModuleType.Sales, (int)ModuleType.Inventory, (int)ModuleType.Synchronization,
        (int)ModuleType.Reports, (int)ModuleType.Management,
    ];

    private static readonly int[] PagoUniverse =
    [
        (int)ModuleType.Sales, (int)ModuleType.Inventory, (int)ModuleType.Synchronization,
        (int)ModuleType.Reports, (int)ModuleType.Statistics, (int)ModuleType.Management,
        (int)ModuleType.Expenses, (int)ModuleType.Billing, (int)ModuleType.Histories,
        (int)ModuleType.Credits,
    ];

    private static readonly int[] SuperiorUniverse =
    [
        (int)ModuleType.Sales, (int)ModuleType.Inventory, (int)ModuleType.Synchronization,
        (int)ModuleType.Reports, (int)ModuleType.Statistics, (int)ModuleType.Management,
        (int)ModuleType.WholesaleSales, (int)ModuleType.Expenses, (int)ModuleType.Billing,
        (int)ModuleType.Histories, (int)ModuleType.Credits, (int)ModuleType.Warehouses,
        (int)ModuleType.MultiStores, (int)ModuleType.MultiMonedas, (int)ModuleType.Elaboration,
    ];

    private static readonly int[] VipUniverse =
    [
        (int)ModuleType.Sales, (int)ModuleType.Inventory, (int)ModuleType.Synchronization,
        (int)ModuleType.Reports, (int)ModuleType.Statistics, (int)ModuleType.Management,
        (int)ModuleType.WholesaleSales, (int)ModuleType.Expenses, (int)ModuleType.Billing,
        (int)ModuleType.Histories, (int)ModuleType.Credits, (int)ModuleType.Warehouses,
        (int)ModuleType.MultiStores, (int)ModuleType.MultiMonedas, (int)ModuleType.MultiPayments,
        (int)ModuleType.Elaboration,
    ];

    // ── Module → features the LIVE Feature table exposes as AvailableToStore ──
    // Calibrated against the corrected catalog (backfill 2026-09-25): both local DBs now
    // carry all 42 features, including Egress(33), StorePayment(91) and MultiPayments(44).
    // The map mirrors what StoreRoleFeatureGenerator materialises for the OWNER's /me:
    // every listed feature includes OwnerAdmin in [HasRoles]. StorePayment(91) is
    // SuperAdmin/ReSeller-only — the owner never receives it, so it is deliberately
    // absent here (the change-plan still creates its rows when Billing is inserted; the
    // DB assertion below filters OwnerAdmin rows to match /me).

    private static readonly Dictionary<int, int[]> FeaturesByModule = new()
    {
        [(int)ModuleType.Sales] = [(int)FeatureType.Products, (int)FeatureType.Sale, (int)FeatureType.TodayOrders, (int)FeatureType.TodayOrdersStats],
        [(int)ModuleType.Inventory] = [(int)FeatureType.Available, (int)FeatureType.Entries, (int)FeatureType.TodayInventoryStats, (int)FeatureType.Egress, (int)FeatureType.InventoryTodayQuantities, (int)FeatureType.InventoryTodaySaleProfit],
        [(int)ModuleType.Synchronization] = [(int)FeatureType.Send, (int)FeatureType.Download, (int)FeatureType.Receive],
        [(int)ModuleType.Reports] = [(int)FeatureType.TodayReports],
        [(int)ModuleType.Statistics] = [(int)FeatureType.Dashboard],
        [(int)ModuleType.Management] = [(int)FeatureType.Profile, (int)FeatureType.Users, (int)FeatureType.Stores, (int)FeatureType.Configurations],
        [(int)ModuleType.Expenses] = [(int)FeatureType.TodayExpenses],
        [(int)ModuleType.Billing] = [(int)FeatureType.Billing],
        [(int)ModuleType.Histories] = [(int)FeatureType.SalesHistory, (int)FeatureType.EntriesHistory, (int)FeatureType.ExpensesHistory, (int)FeatureType.CreditsHistory],
        [(int)ModuleType.Credits] = [(int)FeatureType.CreditSale],
        [(int)ModuleType.WholesaleSales] = [(int)FeatureType.WholesaleSales],
        [(int)ModuleType.Warehouses] = [(int)FeatureType.Warehouses, (int)FeatureType.WarehouseStockMovements],
        [(int)ModuleType.MultiStores] = [(int)FeatureType.OwnerStores],
        [(int)ModuleType.MultiMonedas] = [(int)FeatureType.MultiMonedas],
        [(int)ModuleType.MultiPayments] = [(int)FeatureType.MultiPayments],
        [(int)ModuleType.Elaboration] = [(int)FeatureType.Recipes, (int)FeatureType.Elaborations],
    };

    // ── The 9 real transitions lacking exact target-universe coverage ──────────

    [Fact]
    public async Task SuperAdmin_upgrades_gratis_to_vip_store_keeps_vip_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.Gratis, StorePlanType.VIP, callerIsSuperAdmin: true);

    [Fact]
    public async Task SuperAdmin_upgrades_pago_to_vip_store_keeps_vip_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.Pago, StorePlanType.VIP, callerIsSuperAdmin: true);

    [Fact]
    public async Task SuperAdmin_upgrades_superior_to_vip_store_keeps_vip_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.Superior, StorePlanType.VIP, callerIsSuperAdmin: true);

    [Fact]
    public async Task Owner_downgrades_vip_to_gratis_store_keeps_gratis_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.VIP, StorePlanType.Gratis, callerIsSuperAdmin: false);

    [Fact]
    public async Task Owner_downgrades_vip_to_pago_store_keeps_pago_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.VIP, StorePlanType.Pago, callerIsSuperAdmin: false);

    [Fact]
    public async Task SuperAdmin_downgrades_vip_to_superior_store_keeps_superior_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.VIP, StorePlanType.Superior, callerIsSuperAdmin: true);

    [Fact]
    public async Task SuperAdmin_upgrades_gratis_to_superior_store_keeps_superior_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.Gratis, StorePlanType.Superior, callerIsSuperAdmin: true);

    [Fact]
    public async Task Owner_upgrades_gratis_to_pago_store_keeps_pago_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.Gratis, StorePlanType.Pago, callerIsSuperAdmin: false);

    [Fact]
    public async Task Owner_downgrades_superior_to_pago_store_keeps_pago_modules_and_features() =>
        await AssertChangeKeepsTargetUniverseAsync(StorePlanType.Superior, StorePlanType.Pago, callerIsSuperAdmin: false);

    // ── Shared runner ───────────────────────────────────────────────────────────

    /// <summary>
    /// Seeds an owner + approved store on the FROM plan with the FULL FROM universe
    /// (modules + OwnerAdmin features) — proving the change REPLACES the old set, it is
    /// not an accumulation — performs the change with the allowed caller, then asserts
    /// on DB and on /me (same owner token, no relogin) that the store keeps exactly the
    /// TARGET plan's modules and features.
    /// </summary>
    private async Task AssertChangeKeepsTargetUniverseAsync(StorePlanType from, StorePlanType to, bool callerIsSuperAdmin)
    {
        var seeded = await SeedOwnerStoreAsync(from);

        Guid? saId = null;
        string? saLogin = null;
        if (callerIsSuperAdmin)
        {
            saLogin = $"pmx-sa-{Guid.NewGuid():N}@test.com";
            saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        }

        try
        {
            // ── act ──
            var caller = callerIsSuperAdmin
                ? DbTestHelpers.AuthedClient(_f, saId!.Value, saLogin!)
                : DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login);
            var r = await caller.PostAsJsonAsync(
                $"/api/v1/stores/{seeded.StoreId}/change-plan", new { storePlanId = (int)to });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            // ── DB: plan + exact module universe + exact mapped features ──
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);
            store.StorePlanId.Should().Be((int)to);

            var activeModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            activeModuleIds.Should().BeEquivalentTo(
                UniverseOf(to),
                "the change must leave EXACTLY the target plan universe — old-plan extras retired");

            // OwnerAdmin-scoped read: the change-plan materialises rows for every role a
            // feature's enum entry declares. StorePayment(91) is SuperAdmin/ReSeller-only,
            // so its rows exist after Billing is inserted but the OWNER's /me never sees
            // them — the DB expectation must match the owner's /me, not the raw table.
            var activeFeatureIds = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == seeded.StoreId && srf.IsActive
                    && srf.RoleId == (int)RoleType.OwnerAdmin)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();
            activeFeatureIds.Should().BeEquivalentTo(
                MappedFeaturesOf(UniverseOf(to)),
                "StoreRoleFeatures must match the target plan's mapped features exactly");

            // ── /me read-back, SAME owner token (no relogin) ──
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login));

            me.StoreModuleIds.Should().BeEquivalentTo(UniverseOf(to));
            me.PlanType.Should().Be(to == StorePlanType.Gratis ? "Free" : "Paid");

            var retiredModuleIds = UniverseOf(from).Except(UniverseOf(to)).ToArray();
            var retiredFeatureIds = MappedFeaturesOf(retiredModuleIds);

            me.FeatureIds.Should().Contain(
                MappedFeaturesOf(UniverseOf(to)),
                "the owner sees the target plan's features via /me");
            if (retiredFeatureIds.Length > 0)
            {
                me.FeatureIds.Should().NotContain(
                    retiredFeatureIds,
                    "features of retired modules vanish from /me");
            }

            // Roles aggregate over StoreRoleFeature rows (NoTracking shape: one entry per
            // row, module repeats) — aggregate with Distinct before comparing.
            var roleModuleIds = me.Roles.Select(r => r.ModuleId).Distinct().ToList();
            roleModuleIds.Should().Contain(
                UniverseOf(to).Where(m => MappedFeaturesOf([m]).Length > 0),
                "every target module that carries features appears in roles");
            if (retiredModuleIds.Length > 0)
                roleModuleIds.Should().NotContain(retiredModuleIds);

            var roleFeatureIds = me.Roles.SelectMany(r => r.FeatureIds).Distinct().ToList();
            roleFeatureIds.Should().Contain(MappedFeaturesOf(UniverseOf(to)));
            if (retiredFeatureIds.Length > 0)
                roleFeatureIds.Should().NotContain(retiredFeatureIds);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
            if (saId.HasValue)
                await DbTestHelpers.CleanupUserAsync(_f, saId.Value);
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private sealed record SeededOwnerStore(Guid UserId, string Login, Guid OwnerId, Guid StoreId);

    private static int[] UniverseOf(StorePlanType plan) => plan switch
    {
        StorePlanType.Gratis => GratisUniverse,
        StorePlanType.Pago => PagoUniverse,
        StorePlanType.Superior => SuperiorUniverse,
        StorePlanType.VIP => VipUniverse,
        _ => throw new ArgumentOutOfRangeException(nameof(plan), plan, null),
    };

    private static int[] MappedFeaturesOf(IEnumerable<int> moduleIds) =>
        moduleIds
            .SelectMany(m => FeaturesByModule.TryGetValue(m, out var features) ? features : Array.Empty<int>())
            .Distinct()
            .ToArray();

    /// <summary>
    /// LOCAL seed helper (never touches shared Infrastructure seeds — E2E-untouchable rule):
    /// owner + approved store on the given plan, NULL billing anchor (billing status
    /// NoAplica → FilterForBilling is a no-op), FULL FROM-plan universe rows + OwnerAdmin
    /// feature rows, plus the Stores(73) grant the change-plan endpoint needs.
    /// </summary>
    private async Task<SeededOwnerStore> SeedOwnerStoreAsync(StorePlanType plan)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"pmx-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Plan Matrix", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Plan Matrix owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"PMX-Store-{Guid.NewGuid():N}", owner.Id, approved: true, tenantId,
            paymentStartDate: null, storePlanId: (int)plan);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        foreach (var moduleId in UniverseOf(plan))
        {
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, moduleId, price: 0, modulePriceIncluded: true,
                modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));
        }
        foreach (var featureId in MappedFeaturesOf(UniverseOf(plan)))
        {
            db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                store.Id, (int)RoleType.OwnerAdmin, featureId, tenantId));
        }

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return new SeededOwnerStore(user.Id, login, owner.Id, store.Id);
    }

    private static async Task<CurrentUserDto> MeAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }
}