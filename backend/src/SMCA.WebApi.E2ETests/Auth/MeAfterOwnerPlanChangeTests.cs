using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
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

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// E2E coverage for <c>GET /api/v1/auth/me</c> after the OWNER-driven plan change
/// (<c>POST /api/v1/stores/{id}/change-plan</c>) — always read back with THE SAME Bearer token,
/// i.e. no relogin (a plan change never reissues a token, so the token is not the carrier of
/// the plan: /me recomputes it per request).
/// <para>
/// Since the 2026-09-18 caller matrix, Superior/VIP are SuperAdmin-reserved: the B1 upgrade
/// leg below is therefore driven by a SuperAdmin client, while the OWNER token still proves
/// the same-token read-back; B3 stays fully owner-driven on the legal Gratis/Pago targets.
/// </para>
/// <para>
/// Gaps closed (docs/plans/2026-09-15-store-plan-change-permission-refresh-plan.md, §7.1 B1/B3):
/// the only existing plan × /me pair (AuthMePlanModulesTests) drives the change through
/// SuperAdmin's toggle-plan, never asserts FeatureIds on the way UP, never asserts
/// <c>roles[].featureIds</c> after a plan change, and never observes a non-owner /me.
/// </para>
/// <para>
/// Runtime chain under test: change-plan writes StorePlanId + StoreModules + StoreRoleFeatures →
/// /me recomputes per request (active StoreModules → FilterForBilling(billing.Status) →
/// StoreModuleIds → FeatureIds (enum-derived) / Roles (row-derived)).
/// Every seeded store carries a NULL billing anchor, so billing status is NoAplica and
/// FilterForBilling is a no-op: what the assertions observe is the PLAN effect alone, never a
/// billing downgrade.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class MeAfterOwnerPlanChangeTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    // Modules (ModuleType).
    private const int SalesModuleId = (int)ModuleType.Sales;                       // 2
    private const int InventoryModuleId = (int)ModuleType.Inventory;               // 3
    private const int SynchronizationModuleId = (int)ModuleType.Synchronization;   // 4
    private const int ReportsModuleId = (int)ModuleType.Reports;                   // 5
    private const int StatisticsModuleId = (int)ModuleType.Statistics;             // 6
    private const int FreeManagementModuleId = (int)ModuleType.Management;         // 7
    private const int BillingModuleId = (int)ModuleType.Billing;                   // 9
    private const int HistoriesModuleId = (int)ModuleType.Histories;               // 10
    private const int CreditsModuleId = (int)ModuleType.Credits;                   // 11
    private const int WarehousesModuleId = (int)ModuleType.Warehouses;             // 13

    // Features (FeatureType).
    private const int WarehousesFeatureId = (int)FeatureType.Warehouses;                       // 36
    private const int WarehouseStockMovementsFeatureId = (int)FeatureType.WarehouseStockMovements; // 37
    private const int DashboardFeatureId = (int)FeatureType.Dashboard;                         // 60
    private const int ProfileFeatureId = (int)FeatureType.Profile;                             // 70
    private const int BillingFeatureId = (int)FeatureType.Billing;                             // 90
    private const int SalesHistoryFeatureId = (int)FeatureType.SalesHistory;                   // 100
    private const int CreditsHistoryFeatureId = (int)FeatureType.CreditsHistory;               // 103
    private const int CreditSaleFeatureId = (int)FeatureType.CreditSale;                       // 110

    // Plan universes as change-plan materialises them (StorePlanCatalogTests + the
    // priceIncluded catalog: Sales/Inventory/Synchronization/Management).
    private static readonly int[] GratisUniverse =
        [SalesModuleId, InventoryModuleId, SynchronizationModuleId, ReportsModuleId, FreeManagementModuleId];

    private static readonly int[] SuperiorUniverse =
        [SalesModuleId, InventoryModuleId, SynchronizationModuleId, ReportsModuleId, StatisticsModuleId,
         FreeManagementModuleId, (int)ModuleType.Expenses, BillingModuleId, HistoriesModuleId,
         (int)ModuleType.Credits, (int)ModuleType.WholesaleSales, WarehousesModuleId, (int)ModuleType.MultiStores,
         (int)ModuleType.MultiMonedas];

    public MeAfterOwnerPlanChangeTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    // ── B1: owner change-plan → /me, same token, both directions ─────────────

    [Fact]
    public async Task Me_follows_the_plan_across_superadmin_flips_with_same_owner_token()
    {
        var g = await SeedOwnerStoreAsync(planId: (int)StorePlanType.Pago, withStoreUser: false);
        var saLogin = $"sa-mepc-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            // ONE owner client, ONE token for the whole test: /me must follow the plan with
            // NO relogin (a plan change never reissues the token — /me recomputes per request).
            // Since 2026-09-18 the caller matrix reserves Superior/VIP to SuperAdmin, so the
            // flips here are SA-driven; the OWNER token still proves the same-token read-back.
            var client = DbTestHelpers.AuthedClient(_f, g.OwnerUserId, g.OwnerLogin);

            // New-rule pin: the owner targeting Superior gets 403 (SuperAdmin-reserved plan).
            var denied = await client.PostAsJsonAsync(
                $"/api/v1/stores/{g.StoreId}/change-plan", new { storePlanId = (int)StorePlanType.Superior });
            denied.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "Superior/VIP are SuperAdmin-reserved (caller matrix)");

            var saClient = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            // ── Upgrade Pago → Superior (SA): the plan adds Statistics (6) and Warehouses (13). ──
            await ChangePlanAsync(saClient, g.StoreId, StorePlanType.Superior);
            var upgraded = await MeAsync(client);

            upgraded.StoreModuleIds.Should().BeEquivalentTo(SuperiorUniverse,
                "the owner's plan change materialises the Superior universe");
            upgraded.PlanType.Should().Be("Paid");

            // Positive FeatureIds assertion (the documented gap: the existing coverage only
            // asserted StoreModuleIds on an upgrade). 36/37 come from Warehouses, 60 from Statistics.
            upgraded.FeatureIds.Should().Contain(new[]
            {
                WarehousesFeatureId, WarehouseStockMovementsFeatureId, DashboardFeatureId
            });

            // roles[].featureIds must follow too (never asserted after a plan change anywhere).
            // NOTE on shape: /me groups by (Store, Feature.Module) ENTITY IDENTITY and the context
            // is NoTracking, so EF materialises a Module instance per row and the grouping degrades
            // to one entry per StoreRoleFeature row — the same ModuleId repeats, one feature each
            // (observed here as two ModuleId 13 entries, one holding 36 and the other 37). The
            // assertions below therefore aggregate over the module's entries instead of assuming
            // a single one.
            var warehousesFeatures = upgraded.Roles
                .Where(r => r.ModuleId == WarehousesModuleId)
                .SelectMany(r => r.FeatureIds)
                .Distinct()
                .ToList();
            warehousesFeatures.Should().BeEquivalentTo(
                new[] { WarehousesFeatureId, WarehouseStockMovementsFeatureId },
                "the Warehouses module was inserted by the plan change and generated its two OwnerAdmin features");
            upgraded.Roles.SelectMany(r => r.FeatureIds).Should().Contain(DashboardFeatureId);
            upgraded.Roles.Select(r => r.ModuleId).Should().Contain(StatisticsModuleId);

            // ── Downgrade Superior → Gratis (SA), SAME owner token. ──
            await ChangePlanAsync(saClient, g.StoreId, StorePlanType.Gratis);
            var downgraded = await MeAsync(client);

            downgraded.StoreModuleIds.Should().BeEquivalentTo(GratisUniverse,
                "Gratis retires every paid module from the universe");
            downgraded.PlanType.Should().Be("Free");

            // The retired modules' features vanish from BOTH places the menu/permission code reads.
            downgraded.FeatureIds.Should().NotContain(new[]
            {
                WarehousesFeatureId, WarehouseStockMovementsFeatureId, DashboardFeatureId, BillingFeatureId
            });
            downgraded.Roles.Select(r => r.ModuleId).Should()
                .NotContain(new[] { WarehousesModuleId, StatisticsModuleId, BillingModuleId, HistoriesModuleId, CreditsModuleId });
            downgraded.Roles.SelectMany(r => r.FeatureIds).Should().NotContain(new[]
            {
                WarehousesFeatureId, WarehouseStockMovementsFeatureId, DashboardFeatureId,
                BillingFeatureId, SalesHistoryFeatureId, CreditsHistoryFeatureId, CreditSaleFeatureId
            });

            // The free universe survived the round trip — only the retired plan members disappeared.
            downgraded.Roles.Where(r => r.ModuleId == ReportsModuleId).SelectMany(r => r.FeatureIds)
                .Should().Contain((int)FeatureType.TodayReports, "Reports stays in the Gratis plan");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, g.StoreId, g.OwnerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── B3: a StoreUser (non-owner) sees the same plan effect in /me ─────────

    [Fact]
    public async Task StoreUser_me_after_owner_change_plan_upgrade_then_downgrade_follows_the_plan()
    {
        var g = await SeedOwnerStoreAsync(planId: (int)StorePlanType.Gratis, withStoreUser: true);
        try
        {
            var ownerClient = DbTestHelpers.AuthedClient(_f, g.OwnerUserId, g.OwnerLogin);
            var storeUserClient = DbTestHelpers.AuthedClient(_f, g.StoreUserId!.Value, g.StoreUserLogin!);

            // Gratis: only Management is on the store, so the StoreUser holds the single
            // StoreUser-granted Management feature (Profile 70).
            var before = await MeAsync(storeUserClient);
            before.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId });
            before.FeatureIds.Should().BeEmpty(
                "FeatureIds is OwnerAdmin/ReSeller-only (AllowedFeaturesService returns [] for a StoreUser); " +
                "a StoreUser's permissions live in roles[].featureIds, which is what the frontend evaluates");
            before.Roles.Select(r => r.ModuleId).Distinct().Should().BeEquivalentTo(new[] { FreeManagementModuleId });

            // Owner upgrades Gratis → Pago: Billing (9), Histories (10) and Credits (11) are the
            // paid modules that grant features to StoreUser (Warehouses/Statistics are OwnerAdmin-only).
            await ChangePlanAsync(ownerClient, g.StoreId, StorePlanType.Pago);

            var upgraded = await MeAsync(storeUserClient); // same StoreUser token, no relogin
            upgraded.StoreModuleIds.Should().Contain(new[] { BillingModuleId, HistoriesModuleId, CreditsModuleId });
            upgraded.StoreModuleIds.Should().NotContain(new[] { WarehousesModuleId },
                "Pago(2) does not include Warehouses(13)");
            upgraded.PlanType.Should().Be("Paid");
            upgraded.FeatureIds.Should().BeEmpty("still a StoreUser");
            upgraded.Roles.SelectMany(r => r.FeatureIds).Should().Contain(new[]
            {
                BillingFeatureId, SalesHistoryFeatureId, CreditsHistoryFeatureId, CreditSaleFeatureId
            });
            upgraded.Roles.Select(r => r.ModuleId).Should()
                .Contain(new[] { BillingModuleId, HistoriesModuleId, CreditsModuleId });

            // Owner downgrades Pago → Gratis.
            await ChangePlanAsync(ownerClient, g.StoreId, StorePlanType.Gratis);

            var downgraded = await MeAsync(storeUserClient);
            downgraded.StoreModuleIds.Should().BeEquivalentTo(GratisUniverse);
            downgraded.PlanType.Should().Be("Free");
            downgraded.Roles.Select(r => r.ModuleId).Should()
                .NotContain(new[] { BillingModuleId, HistoriesModuleId, CreditsModuleId });
            downgraded.Roles.SelectMany(r => r.FeatureIds).Should().NotContain(new[]
            {
                BillingFeatureId, SalesHistoryFeatureId, CreditsHistoryFeatureId, CreditSaleFeatureId
            });
            // The free modules' StoreUser grants stay active (module 7 was never retired).
            // Distinct(): one roles[] entry exists per StoreRoleFeature row (see the note in the
            // owner test above), so the module list repeats.
            downgraded.Roles.Select(r => r.ModuleId).Distinct().Should()
                .BeEquivalentTo(new[] { SalesModuleId, InventoryModuleId, SynchronizationModuleId, FreeManagementModuleId });
            downgraded.Roles.SelectMany(r => r.FeatureIds).Should().Contain(ProfileFeatureId);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, g.StoreId, g.OwnerUserId, g.StoreUserId!.Value);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private sealed record SeededGraph(
        Guid OwnerUserId,
        string OwnerLogin,
        Guid OwnerId,
        Guid StoreId,
        Guid? StoreUserId,
        string? StoreUserLogin);

    /// <summary>
    /// LOCAL seed helper (does not touch the shared Infrastructure seeds — E2E-untouchable rule).
    /// Owner + approved store on the given plan with a NULL billing anchor (status NoAplica) and
    /// only the free Management module row: the plan change under test is what materialises the
    /// plan universe. With <paramref name="withStoreUser"/> it also adds a StoreUser of that store
    /// plus the StoreUser Management grant the real StoreRoleFeatureGenerator writes.
    /// </summary>
    private async Task<SeededGraph> SeedOwnerStoreAsync(int planId, bool withStoreUser)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var ownerLogin = $"mepc-owner-{Guid.NewGuid():N}@test.com";
        var ownerUser = User.Create(ownerLogin, DbTestHelpers.HashPassword("Password123"),
            "E2E Me Plan Change Owner", "0000000000", ownerLogin, tenantId);
        db.Set<User>().Add(ownerUser);
        var owner = Owner.Create(ownerUser.Id, false, tenantId, "E2E Me Plan Change owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"MEPC-Store-{Guid.NewGuid():N}", owner.Id, approved: true, tenantId,
            paymentStartDate: null, storePlanId: planId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeManagementModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        ownerUser.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(ownerUser.Id, (int)RoleType.OwnerAdmin, tenantId));

        Guid? storeUserId = null;
        string? storeUserLogin = null;
        if (withStoreUser)
        {
            storeUserLogin = $"mepc-suser-{Guid.NewGuid():N}@test.com";
            var storeUser = User.Create(storeUserLogin, DbTestHelpers.HashPassword("Password123"),
                "E2E Me Plan Change StoreUser", "0000000000", storeUserLogin, tenantId);
            db.Set<User>().Add(storeUser);
            db.Set<UserRole>().Add(UserRole.Create(storeUser.Id, (int)RoleType.StoreUser, tenantId));
            db.Set<StoreUser>().Add(StoreUser.Create(storeUser.Id, store.Id, tenantId));
            // Profile (70) is the only Management feature granted to StoreUser — same row shape
            // the StoreRoleFeatureGenerator produces at registration.
            db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                store.Id, (int)RoleType.StoreUser, ProfileFeatureId, tenantId));
            storeUser.SelectedStoreId = store.Id;
            storeUserId = storeUser.Id;
        }

        await db.SaveChangesAsync();
        return new SeededGraph(ownerUser.Id, ownerLogin, owner.Id, store.Id, storeUserId, storeUserLogin);
    }

    private async Task<CurrentUserDto> MeAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private static async Task ChangePlanAsync(HttpClient client, Guid storeId, StorePlanType plan)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/v1/stores/{storeId}/change-plan", new { storePlanId = (int)plan });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
