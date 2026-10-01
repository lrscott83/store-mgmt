using System.Net;
using System.Net.Http.Json;
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
/// Reproduces the defect in <c>ChangeStorePlanCommand.ApplyPlanModules</c>: its two
/// module-granting paths disagree about WHICH ROLES receive a module's features.
/// <list type="bullet">
/// <item>INSERT path (insertedModuleIds) calls
/// <c>StoreRoleFeatureGenerator.GenerateStoreRoleFeaturesAsync</c>, which walks the
/// <c>StoreRoleFeatures</c> enum and emits one row per (feature, role) the enum declares.</item>
/// <item>REACTIVATION path (updatedModuleIds) looks the feature up and, when no row exists,
/// creates it with a hardcoded <c>(int)RoleType.StoreUser</c> — the enum is never consulted.</item>
/// </list>
/// <para>
/// The reactivation branch is reached whenever a store holds an active-or-soft-deleted
/// <c>StoreModule</c> row whose <c>StoreRoleFeature</c> rows are missing — the same drift
/// <c>PlanModuleConvergence</c> converges. Note the repo lookup is NOT filtered by
/// <c>IsActive</c>, so an existing-but-soft-deleted row is merely reactivated and keeps its
/// original role: the wrong role is written only when the row is absent.
/// </para>
/// <para>
/// The plan used is Pago, reachable in both directions by the store OWNER (no SuperAdmin
/// needed): Pago ∖ Gratis = {Statistics 6, Expenses 8, Billing 9, Histories 10, Credits 11},
/// so Statistics is soft-deleted on the way down and restored on the way up.
/// </para>
/// <para>
/// Expected role mapping (docs/contrains/plan-modulos-tiendas.md §4): Dashboard(60),
/// TodayExpenses(80), EntriesHistory(101) and ExpensesHistory(102) belong to
/// <b>OwnerAdmin alone</b>. Roles: OwnerAdmin = 2, StoreUser = 3.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class PlanChangeRoleReactivationTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public PlanChangeRoleReactivationTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    // ── Plan universes, mirroring PlanChangeMatrixTests ─────────────────────────

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
    };

    /// <summary>Owner-only permissions whose module Pago restores and Gratis drops.</summary>
    private static readonly int[] OwnerOnlyPagoFeatures =
    [
        (int)FeatureType.Dashboard,          // 60,  module 6  Statistics
        (int)FeatureType.TodayExpenses,      // 80,  module 8  Expenses
        (int)FeatureType.EntriesHistory,     // 101, module 10 Histories
        (int)FeatureType.ExpensesHistory,    // 102, module 10 Histories
    ];

    // ── 1. CONTROL: the INSERT path already honours the enum ───────────────────

    /// <summary>
    /// A Gratis store has no Statistics module and no Dashboard role-feature row, so
    /// upgrading to Pago takes the INSERT path. This pins the EXPECTED role mapping, so a
    /// failure in the sibling tests can only mean the reactivation path diverges — never that
    /// the expectation itself is wrong.
    /// </summary>
    [Fact]
    public async Task Upgrading_directly_from_gratis_to_pago_grants_owner_only_features_to_the_owner()
    {
        var seeded = await SeedOwnerStoreAsync(StorePlanType.Gratis);

        try
        {
            await ChangePlanAsync(seeded, StorePlanType.Pago);

            var activePairs = await ActiveRoleFeaturePairsAsync(seeded.StoreId);

            foreach (var featureId in OwnerOnlyPagoFeatures)
            {
                activePairs.Should().Contain(
                    ((int)RoleType.OwnerAdmin, featureId),
                    $"feature {featureId} is OwnerAdmin-only and was INSERTED, so the enum mapping must apply");
            }
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    // ── 2. REPRODUCTION: the reactivation path grants the wrong role ───────────

    /// <summary>
    /// Same target plan, same expected roles — but Statistics is restored rather than
    /// inserted, and the store carries no Dashboard row to reactivate. Today the reactivation
    /// path writes (StoreUser, Dashboard) and the owner receives nothing.
    /// </summary>
    [Fact]
    public async Task Restoring_pago_after_a_downgrade_grants_owner_only_features_to_the_owner()
    {
        var seeded = await SeedOwnerStoreAsync(StorePlanType.Pago, omitRoleFeatures: OwnerOnlyPagoFeatures);

        try
        {
            await ChangePlanAsync(seeded, StorePlanType.Gratis);
            await ChangePlanAsync(seeded, StorePlanType.Pago);

            var activePairs = await ActiveRoleFeaturePairsAsync(seeded.StoreId);

            foreach (var featureId in OwnerOnlyPagoFeatures)
            {
                RolesOf(activePairs, featureId).Should().Contain((int)RoleType.OwnerAdmin,
                    $"feature {featureId} is OwnerAdmin-only; restoring its module must grant it to the owner exactly as inserting it does");
            }
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    // ── 3. REPRODUCTION: the owner's permission leaks to employees ─────────────

    /// <summary>
    /// The mirror of the previous failure: an OwnerAdmin-only permission must never end up
    /// on a StoreUser. OwnerAdmin has no StoreUser row, so this is how the owner silently
    /// loses access while an employee gains it.
    /// </summary>
    [Fact]
    public async Task Restoring_pago_after_a_downgrade_never_grants_owner_only_features_to_employees()
    {
        var seeded = await SeedOwnerStoreAsync(StorePlanType.Pago, omitRoleFeatures: OwnerOnlyPagoFeatures);

        try
        {
            await ChangePlanAsync(seeded, StorePlanType.Gratis);
            await ChangePlanAsync(seeded, StorePlanType.Pago);

            var activePairs = await ActiveRoleFeaturePairsAsync(seeded.StoreId);

            foreach (var featureId in OwnerOnlyPagoFeatures)
            {
                RolesOf(activePairs, featureId).Should().NotContain((int)RoleType.StoreUser,
                    $"feature {featureId} belongs to OwnerAdmin alone and must never be granted to a StoreUser");
            }
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    // ── 4. REPRODUCTION: both routes to Pago must agree ────────────────────────

    /// <summary>
    /// Two stores end on the SAME plan, so they must end with the SAME permissions. One
    /// reaches Pago by inserting its modules, the other by restoring them. Today they diverge,
    /// which is the user-visible symptom: the same paid plan behaves differently depending on
    /// the store's history.
    /// </summary>
    [Fact]
    public async Task A_store_that_restored_pago_ends_with_the_same_roles_as_one_that_upgraded_to_it()
    {
        var upgraded = await SeedOwnerStoreAsync(StorePlanType.Gratis);
        var restored = await SeedOwnerStoreAsync(StorePlanType.Pago, omitRoleFeatures: OwnerOnlyPagoFeatures);

        try
        {
            await ChangePlanAsync(upgraded, StorePlanType.Pago);

            await ChangePlanAsync(restored, StorePlanType.Gratis);
            await ChangePlanAsync(restored, StorePlanType.Pago);

            var upgradedPairs = await ActiveRoleFeaturePairsAsync(upgraded.StoreId);
            var restoredPairs = await ActiveRoleFeaturePairsAsync(restored.StoreId);

            // Assert the DIFFERENCE rather than dumping both sets: the failing message must
            // name the exact (role, feature) pairs, not truncate a 30-item comparison.
            var missing = upgradedPairs.Except(restoredPairs).Select(Describe).OrderBy(x => x).ToArray();
            var extra = restoredPairs.Except(upgradedPairs).Select(Describe).OrderBy(x => x).ToArray();

            (missing, extra).Should().Be((Array.Empty<string>(), Array.Empty<string>()),
                "both stores sit on Pago, so the granted (role, feature) pairs must be identical regardless of how they got there. " +
                $"missing on the restored store: [{string.Join(", ", missing)}]; unexpected extra: [{string.Join(", ", extra)}]");
        }
        finally
        {
            await CleanupAsync(upgraded);
            await CleanupAsync(restored);
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private sealed record SeededOwnerStore(Guid UserId, string Login, Guid OwnerId, Guid StoreId);

    private static int[] RolesOf(HashSet<(int RoleId, int FeatureId)> pairs, int featureId) =>
        pairs.Where(p => p.FeatureId == featureId).Select(p => p.RoleId).OrderBy(r => r).ToArray();

    /// <summary>Renders a pair as <c>StoreUser:60</c> so failures name it readably.</summary>
    private static string Describe((int RoleId, int FeatureId) pair) => $"{RoleName(pair.RoleId)}:{pair.FeatureId}";

    private static string RoleName(int roleId) => roleId switch
    {
        (int)RoleType.OwnerAdmin => "OwnerAdmin",
        (int)RoleType.StoreUser => "StoreUser",
        (int)RoleType.ReSeller => "ReSeller",
        _ => $"Role{roleId}",
    };

    private static int[] UniverseOf(StorePlanType plan) => plan switch
    {
        StorePlanType.Gratis => GratisUniverse,
        StorePlanType.Pago => PagoUniverse,
        _ => throw new ArgumentOutOfRangeException(nameof(plan), plan, null),
    };

    private static int[] MappedFeaturesOf(IEnumerable<int> moduleIds) =>
        moduleIds
            .SelectMany(m => FeaturesByModule.TryGetValue(m, out var features) ? features : Array.Empty<int>())
            .Distinct()
            .ToArray();

    /// <summary>
    /// LOCAL seed helper (never touches shared Infrastructure seeds — E2E-untouchable rule):
    /// owner + approved store on the given plan, NULL billing anchor, the FULL plan module
    /// universe, and OwnerAdmin feature rows for every mapped feature EXCEPT
    /// <paramref name="omitRoleFeatures"/> — reproducing the drift the convergence migration
    /// repairs. Plus the Stores(73) grant the change-plan endpoint needs.
    /// </summary>
    private async Task<SeededOwnerStore> SeedOwnerStoreAsync(StorePlanType plan, int[]? omitRoleFeatures = null)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"prr-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Plan Role Reactivation", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Plan Role Reactivation owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"PRR-Store-{Guid.NewGuid():N}", owner.Id, approved: true, tenantId,
            paymentStartDate: null, storePlanId: (int)plan);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        foreach (var moduleId in UniverseOf(plan))
        {
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, moduleId, price: 0, modulePriceIncluded: true,
                modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));
        }

        var omitted = omitRoleFeatures?.ToHashSet() ?? [];
        foreach (var featureId in MappedFeaturesOf(UniverseOf(plan)))
        {
            if (omitted.Contains(featureId))
                continue;
            db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                store.Id, (int)RoleType.OwnerAdmin, featureId, tenantId));
        }

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return new SeededOwnerStore(user.Id, login, owner.Id, store.Id);
    }

    /// <summary>
    /// Drives the real endpoint as the store OWNER. Gratis and Pago are both
    /// owner-callable targets, so no SuperAdmin is involved and the failure cannot be an
    /// artefact of the caller matrix.
    /// </summary>
    private async Task ChangePlanAsync(SeededOwnerStore seeded, StorePlanType to)
    {
        var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login);
        var response = await client.PostAsJsonAsync(
            $"/api/v1/stores/{seeded.StoreId}/change-plan", new { storePlanId = (int)to });
        response.StatusCode.Should().Be(HttpStatusCode.OK,
            $"change-plan to {to} must succeed for the seeded owner");
    }

    private async Task<HashSet<(int RoleId, int FeatureId)>> ActiveRoleFeaturePairsAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var rows = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(srf => srf.StoreId == storeId && srf.IsActive)
            .Select(srf => new { srf.RoleId, srf.FeatureId })
            .ToListAsync();
        return rows.Select(r => (r.RoleId, r.FeatureId)).ToHashSet();
    }

    private async Task CleanupAsync(SeededOwnerStore seeded) =>
        await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
}
