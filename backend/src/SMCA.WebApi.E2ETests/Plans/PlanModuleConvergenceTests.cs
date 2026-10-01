using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.Plans;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Migrations;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Plans;

/// <summary>
/// Verifies the shared convergence SQL (<see cref="PlanModuleConvergenceSql.UpSql"/>) run by
/// the EF migration 20260930090000_PlanModuleConvergence and by the VPS script
/// backend/scripts/27-20260930-Plan-Module-Convergence.sql: every store's active
/// <c>StoreModule</c> set becomes EXACTLY the cumulative module universe of its own plan, and
/// its active <c>StoreRoleFeature</c> rows become exactly the (feature, role) pairs those
/// modules imply.
/// <para>
/// Three properties are under test:
/// <list type="number">
/// <item>Convergence is exact — a store seeded with drift (missing modules, an extra module no
/// plan includes, soft-deleted rows that must come back) lands on set equality with the plan,
/// never on a superset and never on a silent rewrite.</item>
/// <item>Convergence is idempotent — the second run moves no column, not even
/// <c>UpdatedDate</c>/<c>CreatedDate</c>. A rewrite that happens to reach the same values would
/// pass a value-only comparison; only the audit columns can tell the two apart.</item>
/// <item>Convergence never over-grants — after the run, no store in the database holds an active
/// module its plan does not include, and Administración (module 1,
/// <c>AvailableToStore = false</c>) belongs to no plan at all.</item>
/// </list>
/// </para>
/// <para>
/// <c>UpSql</c> is a DATABASE-WIDE convergence: it rewrites the rows of every store, not just the
/// ones a test seeds. Each test therefore captures the whole <c>StoreModule</c> /
/// <c>StoreRoleFeature</c> content up front and puts it back afterwards
/// (<see cref="ConvergenceSnapshot"/>), so running this file leaves <c>smca_test</c> exactly as
/// it found it.
/// </para>
/// <para>
/// Expectations are DERIVED, never transcribed: the module universe comes from the
/// (module, first-plan) table below — the same pairs <c>PlanModuleConvergenceSql.SpecCte</c>
/// encodes — and the feature set comes from the live <c>Feature</c> table intersected with the
/// (feature, role) map, so a catalog change surfaces as a failure instead of a stale constant.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class PlanModuleConvergenceTests
{
    private readonly AppTestFactory _f;

    public PlanModuleConvergenceTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static readonly int[] AllPlanIds =
    [
        PlanModuleConvergenceSql.GratisPlanId,
        PlanModuleConvergenceSql.PagoPlanId,
        PlanModuleConvergenceSql.SuperiorPlanId,
        PlanModuleConvergenceSql.VIPPlanId
    ];

    private const int OwnerAdminRole = (int)RoleType.OwnerAdmin;  // 2
    private const int StoreUserRole = (int)RoleType.StoreUser;    // 3
    private const int ReSellerRole = (int)RoleType.ReSeller;      // 4

    /// <summary>
    /// The specification exactly as <c>PlanModuleConvergenceSql.SpecCte</c> states it: every
    /// module paired with the plan that FIRST grants it. Plan P includes module m when
    /// <c>m.FirstPlan &lt;= P</c>, so the cumulative universe is derived here instead of being
    /// hand-listed four times over. Gratis 5 modules, Pago 10, Superior 16, VIP 17.
    /// </summary>
    private static readonly (int ModuleId, int FirstPlanId)[] SpecModules =
    [
        // Gratis (1)
        ((int)ModuleType.Sales, PlanModuleConvergenceSql.GratisPlanId),
        ((int)ModuleType.Inventory, PlanModuleConvergenceSql.GratisPlanId),
        ((int)ModuleType.Synchronization, PlanModuleConvergenceSql.GratisPlanId),
        ((int)ModuleType.Reports, PlanModuleConvergenceSql.GratisPlanId),
        ((int)ModuleType.Management, PlanModuleConvergenceSql.GratisPlanId),
        // Pago (2) — Gratis plus
        ((int)ModuleType.Statistics, PlanModuleConvergenceSql.PagoPlanId),
        ((int)ModuleType.Expenses, PlanModuleConvergenceSql.PagoPlanId),
        ((int)ModuleType.Billing, PlanModuleConvergenceSql.PagoPlanId),
        ((int)ModuleType.Histories, PlanModuleConvergenceSql.PagoPlanId),
        ((int)ModuleType.Credits, PlanModuleConvergenceSql.PagoPlanId),
        // Superior (3) — Pago plus
        ((int)ModuleType.WholesaleSales, PlanModuleConvergenceSql.SuperiorPlanId),
        ((int)ModuleType.Warehouses, PlanModuleConvergenceSql.SuperiorPlanId),
        ((int)ModuleType.MultiStores, PlanModuleConvergenceSql.SuperiorPlanId),
        ((int)ModuleType.MultiMonedas, PlanModuleConvergenceSql.SuperiorPlanId),
        ((int)ModuleType.Elaboration, PlanModuleConvergenceSql.SuperiorPlanId),
        ((int)ModuleType.WebCatalog, PlanModuleConvergenceSql.SuperiorPlanId),
        // VIP (4) — Superior plus
        ((int)ModuleType.MultiPayments, PlanModuleConvergenceSql.VIPPlanId)
    ];

    /// <summary>
    /// The (feature, role) pairs <c>PlanModuleConvergenceSql.FeatureRoleCte</c> grants, entry
    /// for entry — the same pairs <c>StoreRoleFeatureGenerator</c> materialises. ReSeller (4)
    /// appears once, for Perfil (70); everything else is OwnerAdmin (2) or OwnerAdmin +
    /// StoreUser (3). StorePayment (91) is deliberately absent: the catalog marks it
    /// <c>AvailableToStore = false</c>, so it is never granted to a store.
    /// </summary>
    private static readonly (int FeatureId, int RoleId)[] FeatureRoles =
    [
        // Ventas (2)
        ((int)FeatureType.Products, OwnerAdminRole), ((int)FeatureType.Products, StoreUserRole),
        ((int)FeatureType.Sale, OwnerAdminRole), ((int)FeatureType.Sale, StoreUserRole),
        ((int)FeatureType.TodayOrders, OwnerAdminRole), ((int)FeatureType.TodayOrders, StoreUserRole),
        ((int)FeatureType.TodayOrdersStats, OwnerAdminRole), ((int)FeatureType.TodayOrdersStats, StoreUserRole),
        // Inventario (3)
        ((int)FeatureType.Available, OwnerAdminRole),
        ((int)FeatureType.Entries, OwnerAdminRole),
        ((int)FeatureType.TodayInventoryStats, OwnerAdminRole), ((int)FeatureType.TodayInventoryStats, StoreUserRole),
        ((int)FeatureType.Egress, OwnerAdminRole),
        ((int)FeatureType.InventoryTodayQuantities, OwnerAdminRole), ((int)FeatureType.InventoryTodayQuantities, StoreUserRole),
        ((int)FeatureType.InventoryTodaySaleProfit, OwnerAdminRole),
        // Sincronización (4)
        ((int)FeatureType.Send, OwnerAdminRole), ((int)FeatureType.Send, StoreUserRole),
        ((int)FeatureType.Download, OwnerAdminRole), ((int)FeatureType.Download, StoreUserRole),
        ((int)FeatureType.Receive, OwnerAdminRole), ((int)FeatureType.Receive, StoreUserRole),
        // Reportes (5) / Estadísticas (6)
        ((int)FeatureType.TodayReports, OwnerAdminRole),
        ((int)FeatureType.Dashboard, OwnerAdminRole),
        // Gestión (7)
        ((int)FeatureType.Profile, OwnerAdminRole), ((int)FeatureType.Profile, StoreUserRole),
        ((int)FeatureType.Profile, ReSellerRole),
        ((int)FeatureType.Users, OwnerAdminRole),
        ((int)FeatureType.Stores, OwnerAdminRole),
        ((int)FeatureType.Configurations, OwnerAdminRole),
        // Gastos (8) / Facturación (9)
        ((int)FeatureType.TodayExpenses, OwnerAdminRole),
        ((int)FeatureType.Billing, OwnerAdminRole), ((int)FeatureType.Billing, StoreUserRole),
        // Historiales (10)
        ((int)FeatureType.SalesHistory, OwnerAdminRole), ((int)FeatureType.SalesHistory, StoreUserRole),
        ((int)FeatureType.EntriesHistory, OwnerAdminRole),
        ((int)FeatureType.ExpensesHistory, OwnerAdminRole),
        ((int)FeatureType.CreditsHistory, OwnerAdminRole), ((int)FeatureType.CreditsHistory, StoreUserRole),
        // Créditos (11)
        ((int)FeatureType.CreditSale, OwnerAdminRole), ((int)FeatureType.CreditSale, StoreUserRole),
        // Ventas Mayoristas (12) / Almacenes (13) / Múltiples tiendas (14)
        ((int)FeatureType.WholesaleSales, OwnerAdminRole), ((int)FeatureType.WholesaleSales, StoreUserRole),
        ((int)FeatureType.Warehouses, OwnerAdminRole),
        ((int)FeatureType.WarehouseStockMovements, OwnerAdminRole),
        ((int)FeatureType.OwnerStores, OwnerAdminRole),
        // Múltiples monedas (15) / Múltiples pagos (16)
        ((int)FeatureType.MultiMonedas, OwnerAdminRole), ((int)FeatureType.MultiMonedas, StoreUserRole),
        ((int)FeatureType.MultiPayments, OwnerAdminRole), ((int)FeatureType.MultiPayments, StoreUserRole),
        // Elaboración (17) / Catálogo web (18)
        ((int)FeatureType.Recipes, OwnerAdminRole),
        ((int)FeatureType.Elaborations, OwnerAdminRole),
        ((int)FeatureType.WebCatalog, OwnerAdminRole)
    ];

    /// <summary>Distinctive negotiated per-store prices, seeded on the row that gets reactivated.</summary>
    private const float NegotiatedPrice = 111f;
    private const float NegotiatedModulePrice = 222f;
    private const float NegotiatedDiscountPrice = 333f;
    private const float NegotiatedPercentPrice = 444f;

    // ── T1 ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// A store on ANY plan, deliberately drifted away from that plan, is moved by
    /// <c>UpSql</c> onto exactly the plan's cumulative module universe and exactly the
    /// (feature, role) pairs those modules imply — the extras are retired by soft delete (never
    /// hard-deleted) and the reactivated row keeps its negotiated pricing.
    /// </summary>
    [Fact]
    public async Task Convergence_moves_a_seeded_store_exactly_onto_its_plan_modules()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var catalog = await LoadCatalogAsync(db);

        var snapshot = await ConvergenceSnapshot.CaptureAsync(_f);
        try
        {
            foreach (var planId in AllPlanIds)
            {
                EveryStoreFeatureOfThePlanIsMapped(planId, catalog,
                    $"plan {planId} has a store-available feature the migration never grants, so this test's feature expectation would silently under-count");

                var drift = await SeedStoreWithDriftAsync(db, planId, catalog);
                try
                {
                    await db.Database.ExecuteSqlRawAsync(PlanModuleConvergenceSql.UpSql);

                    var expectedModules = drift.TargetModules.OrderBy(id => id).ToArray();
                    var activeModuleIds = await ActiveModuleIdsAsync(db, drift.StoreId);
                    activeModuleIds.Should().BeEquivalentTo(expectedModules,
                        $"a store on plan {planId} must hold EXACTLY the plan's cumulative module universe");

                    // Administración belongs to no plan: an active row for it is drift, and the
                    // migration must retire it by soft delete rather than by deleting the row.
                    activeModuleIds.Should().NotContain(PlanModuleConvergenceSql.AdministrationModuleId,
                        "Administración (1) is AvailableToStore = false and belongs to NO plan");

                    var allModules = await db.Set<StoreModule>().IgnoreQueryFilters()
                        .Where(sm => sm.StoreId == drift.StoreId)
                        .ToListAsync();

                    foreach (var extraModuleId in drift.ExtraModuleIds)
                    {
                        var row = allModules.Should().ContainSingle(sm => sm.ModuleId == extraModuleId).Subject;
                        row.IsActive.Should().BeFalse(
                            $"module {extraModuleId} is outside plan {planId} and must be soft-deleted");
                    }

                    // Reactivation must not rewrite negotiated per-store pricing: the conflict
                    // action of StoreModuleGrantSql touches IsActive/UpdatedDate only.
                    var reactivated = allModules.Should()
                        .ContainSingle(sm => sm.ModuleId == drift.ReactivatedModuleId).Subject;
                    reactivated.IsActive.Should().BeTrue(
                        $"module {drift.ReactivatedModuleId} IS part of plan {planId}, so the soft-deleted row must be reactivated");
                    reactivated.Price.Should().Be(NegotiatedPrice, "the migration must not overwrite Price on reactivation");
                    reactivated.ModulePrice.Should().Be(NegotiatedModulePrice, "the migration must not overwrite ModulePrice on reactivation");
                    reactivated.ModuleDiscountPrice.Should().Be(NegotiatedDiscountPrice, "the migration must not overwrite ModuleDiscountPrice on reactivation");
                    reactivated.ModulePercentDiscountPrice.Should().Be(NegotiatedPercentPrice, "the migration must not overwrite ModulePercentDiscountPrice on reactivation");
                    reactivated.ModulePriceIncluded.Should().BeFalse("the migration must not overwrite ModulePriceIncluded on reactivation");

                    foreach (var insertedModuleId in drift.MissingModuleIds)
                    {
                        var row = allModules.Should().ContainSingle(sm => sm.ModuleId == insertedModuleId).Subject;
                        row.IsActive.Should().BeTrue(
                            $"module {insertedModuleId} is part of plan {planId} and had NO row — the migration must grant it");
                        row.CreatedBy.Should().Be(Guid.Parse(PlanModuleConvergenceSql.SystemActorGuid),
                            $"granted rows are audited under the migration's system actor; plan {planId} module dump = "
                            + string.Join(" | ", allModules.Select(m => $"m{m.ModuleId}:{m.IsActive}:by={m.CreatedBy}:at={m.CreatedDate:O}")));
                    }

                    var activeRoleFeatures = await ActiveRoleFeatureKeysAsync(db, drift.StoreId);
                    activeRoleFeatures.Should().BeEquivalentTo(drift.ExpectedRoleFeatureKeys,
                        $"the StoreRoleFeature rows of a plan {planId} store must match the mapped (feature, role) pairs exactly");

                    var allRoleFeatures = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                        .Where(srf => srf.StoreId == drift.StoreId)
                        .ToListAsync();
                    foreach (var orphan in drift.OrphanRoleFeatureKeys)
                    {
                        var (roleId, featureId) = ParseRoleFeatureKey(orphan);
                        var row = allRoleFeatures.Should()
                            .ContainSingle(srf => srf.RoleId == roleId && srf.FeatureId == featureId).Subject;
                        row.IsActive.Should().BeFalse(
                            $"{orphan} is not a pair plan {planId} grants and must be soft-deleted, never hard-deleted");
                    }

                    var reactivatedRoleFeature = allRoleFeatures.Should().ContainSingle(
                        srf => srf.RoleId == ParseRoleFeatureKey(drift.ReactivatedRoleFeatureKey).RoleId
                            && srf.FeatureId == ParseRoleFeatureKey(drift.ReactivatedRoleFeatureKey).FeatureId).Subject;
                    reactivatedRoleFeature.IsActive.Should().BeTrue(
                        $"{drift.ReactivatedRoleFeatureKey} IS a pair plan {planId} grants, so the soft-deleted row must be reactivated");
                }
                finally
                {
                    await AuthzSeed.CleanupStoreGraphAsync(_f, drift.StoreId, drift.UserId);
                }
            }
        }
        finally
        {
            await ConvergenceSnapshot.RestoreAsync(_f, snapshot);
        }
    }

    // ── T2 ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// The second <c>UpSql</c> run moves NOTHING — not a single value and not a single audit
    /// column — which is what distinguishes real idempotency from a rewrite that happens to
    /// reproduce the same state.
    /// </summary>
    [Fact]
    public async Task Convergence_is_idempotent()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var catalog = await LoadCatalogAsync(db);

        // Any plan with deliberate drift; Pago is the middle of the matrix and has modules on
        // both sides of it, so both the grant and the retire half are in play.
        const int planId = PlanModuleConvergenceSql.PagoPlanId;
        var drift = await SeedStoreWithDriftAsync(db, planId, catalog);

        var snapshot = await ConvergenceSnapshot.CaptureAsync(_f);
        try
        {
            // Pin the precondition first: a store that already matched its plan would make the
            // second-run comparison below prove nothing. Nothing from the target universe may be
            // active yet — not even the rest of it — so the first run really does insert, reactivate
            // and retire, and the only seeded active module is the extraneous one.
            var before = await SnapshotStoreGraphAsync(db, drift.StoreId);
            var beforeActiveModules = before.Modules.Where(m => m.IsActive).Select(m => m.ModuleId).OrderBy(id => id).ToArray();
            beforeActiveModules.Should().BeEquivalentTo(
                drift.ExtraModuleIds.OrderBy(id => id),
                "the seeded drift must start with NO target module active — only the extraneous module");
            before.Modules.Should().ContainSingle(m => m.ModuleId == drift.ReactivatedModuleId && !m.IsActive,
                "the reactivation fixture row must start soft-deleted");
            before.Modules.Select(m => m.ModuleId).Should().NotContain(
                drift.MissingModuleIds,
                "those modules must have no row at all before the run, so the migration inserts them");

            // ── first run: converge ──
            await db.Database.ExecuteSqlRawAsync(PlanModuleConvergenceSql.UpSql);
            var afterFirst = await SnapshotStoreGraphAsync(db, drift.StoreId);

            afterFirst.Modules.Where(m => m.IsActive).Select(m => m.ModuleId).OrderBy(id => id).ToArray()
                .Should().BeEquivalentTo(drift.TargetModules.OrderBy(id => id),
                    "the first run must land the store exactly on its plan universe");
            (await ActiveRoleFeatureKeysAsync(db, drift.StoreId))
                .Should().BeEquivalentTo(drift.ExpectedRoleFeatureKeys,
                    "the first run must land the store exactly on its plan's (feature, role) pairs");

            // ── second run: no-op ──
            await db.Database.ExecuteSqlRawAsync(PlanModuleConvergenceSql.UpSql);
            var afterSecond = await SnapshotStoreGraphAsync(db, drift.StoreId);

            afterSecond.Should().BeEquivalentTo(afterFirst,
                "every column of every StoreModule and StoreRoleFeature row must be byte-identical after a second run");

            afterSecond.Modules.Select(m => (m.ModuleId, m.CreatedDate, m.CreatedBy))
                .Should().BeEquivalentTo(afterFirst.Modules.Select(m => (m.ModuleId, m.CreatedDate, m.CreatedBy)),
                    "CreatedDate/CreatedBy must not move on the second run — a rewrite would stamp NOW() here");
            afterSecond.Modules.Select(m => (m.ModuleId, m.UpdatedDate, m.UpdatedBy))
                .Should().BeEquivalentTo(afterFirst.Modules.Select(m => (m.ModuleId, m.UpdatedDate, m.UpdatedBy)),
                    "UpdatedDate/UpdatedBy must not move on the second run — re-running the UPDATE statements would stamp NOW() here");
            afterSecond.RoleFeatures.Select(r => (r.RoleId, r.FeatureId, r.CreatedDate, r.CreatedBy))
                .Should().BeEquivalentTo(afterFirst.RoleFeatures.Select(r => (r.RoleId, r.FeatureId, r.CreatedDate, r.CreatedBy)),
                    "CreatedDate/CreatedBy must not move on the second run");
            afterSecond.RoleFeatures.Select(r => (r.RoleId, r.FeatureId, r.UpdatedDate, r.UpdatedBy))
                .Should().BeEquivalentTo(afterFirst.RoleFeatures.Select(r => (r.RoleId, r.FeatureId, r.UpdatedDate, r.UpdatedBy)),
                    "UpdatedDate/UpdatedBy must not move on the second run");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, drift.StoreId, drift.UserId);
            await ConvergenceSnapshot.RestoreAsync(_f, snapshot);
        }
    }

    // ── T3 ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Across EVERY store in the database, the convergence leaves no over-grant behind: each
    /// store holds exactly its own plan's universe, no store holds an active module the catalog
    /// does not offer to stores, and no plan/module row points at one either.
    /// </summary>
    [Fact]
    public async Task Convergence_never_grants_a_module_the_plan_does_not_include()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var catalog = await LoadCatalogAsync(db);

        // The fixture's ResetDataAsync deletes every Store right after migrating, so the
        // database legitimately holds ZERO stores when this test runs alone. Seed one store per
        // plan — each deliberately drifted — so the invariant is asserted over real data. Any
        // store left behind by a previously executed test is included too, which is the point of
        // asserting over "every store in the database" rather than over a seeded subset.
        var seeded = new List<(Guid StoreId, Guid UserId)>();
        foreach (var planId in AllPlanIds)
        {
            var drift = await SeedStoreWithDriftAsync(db, planId, catalog);
            seeded.Add((drift.StoreId, drift.UserId));
        }

        var snapshot = await ConvergenceSnapshot.CaptureAsync(_f);
        try
        {
            await db.Database.ExecuteSqlRawAsync(PlanModuleConvergenceSql.UpSql);

            var stores = await db.Set<Store>().IgnoreQueryFilters()
                .Select(s => new { s.Id, s.Name, s.StorePlanId })
                .ToListAsync();

            stores.Should().NotBeEmpty(
                "an invariant asserted over an empty table proves nothing — pin the precondition before trusting the result");
            stores.Select(s => s.Id).Should().Contain(seeded.Select(x => x.StoreId).ToArray(),
                "the seeded stores must be part of the population the invariant is asserted over");

            var activeModuleIdsByStore = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.IsActive)
                .Select(sm => new { sm.StoreId, sm.ModuleId })
                .ToListAsync();

            foreach (var store in stores)
            {
                var actual = activeModuleIdsByStore.Where(x => x.StoreId == store.Id)
                    .Select(x => x.ModuleId).OrderBy(id => id).ToArray();

                actual.Should().BeEquivalentTo(ModulesOf(store.StorePlanId),
                    $"store '{store.Name}' ({store.Id}) on plan {store.StorePlanId} must hold exactly that plan's cumulative module universe");
            }

            // Nothing in the spec grants Administración (1); it is AvailableToStore = false, so
            // no store may hold it as an ACTIVE module after the convergence.
            var activeNonStoreAvailableModules = await (
                from sm in db.Set<StoreModule>().IgnoreQueryFilters()
                join m in db.Set<Module>().IgnoreQueryFilters() on sm.ModuleId equals m.Id
                join s in db.Set<Store>().IgnoreQueryFilters() on sm.StoreId equals s.Id
                where sm.IsActive && !m.AvailableToStore
                select new { StoreId = s.Id, StoreName = s.Name, ModuleId = m.Id, ModuleName = m.Name })
                .ToListAsync();

            activeNonStoreAvailableModules.Should().BeEmpty(
                "no store may hold an active module whose AvailableToStore is false");

            var planModulesOnNonStoreAvailableModules = await (
                from spm in db.Set<StorePlanModule>().IgnoreQueryFilters()
                join m in db.Set<Module>().IgnoreQueryFilters() on spm.ModuleId equals m.Id
                where !m.AvailableToStore
                select new { spm.PlanId, ModuleId = m.Id, ModuleName = m.Name })
                .ToListAsync();

            planModulesOnNonStoreAvailableModules.Should().BeEmpty(
                "no StorePlanModule row may reference a module the catalog does not offer to stores");

            // The catalog half of the convergence: every plan/module pair the spec requires is
            // present, so the per-store universe above has something to converge onto.
            foreach (var planId in AllPlanIds)
            {
                var catalogModuleIds = await db.Set<StorePlanModule>().IgnoreQueryFilters()
                    .Where(spm => spm.PlanId == planId)
                    .Select(spm => spm.ModuleId)
                    .ToListAsync();
                catalogModuleIds.Should().BeEquivalentTo(ModulesOf(planId),
                    $"plan {planId} must list exactly the modules the specification grants it");
            }

            catalog.NonStoreAvailableModuleIds.Should().Contain(PlanModuleConvergenceSql.AdministrationModuleId,
                "Administración (1) is the module the specification excludes from every plan");
        }
        finally
        {
            await ConvergenceSnapshot.RestoreAsync(_f, snapshot);
            foreach (var s in seeded)
                await AuthzSeed.CleanupStoreGraphAsync(_f, s.StoreId, s.UserId);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// <summary>The cumulative universe of a plan, derived from the (module, first plan) table.</summary>
    private static int[] ModulesOf(int planId) =>
        SpecModules.Where(s => s.FirstPlanId <= planId).Select(s => s.ModuleId).OrderBy(id => id).ToArray();

    private static string RoleFeatureKey(int roleId, int featureId) => $"{roleId}:{featureId}";

    private static (int RoleId, int FeatureId) ParseRoleFeatureKey(string key)
    {
        var parts = key.Split(':');
        return (int.Parse(parts[0]), int.Parse(parts[1]));
    }

    /// <summary>
    /// Reads the live catalog: which modules are store-available, and which features of those
    /// modules are active and store-available. Derived at run time so a catalog change fails the
    /// test instead of silently drifting away from a hand-typed constant.
    /// </summary>
    private static async Task<Catalog> LoadCatalogAsync(ApplicationDbContext db)
    {
        var features = await db.Set<Feature>().IgnoreQueryFilters()
            .Where(f => f.IsActive && f.AvailableToStore)
            .Select(f => new { f.Id, f.ModuleId })
            .ToListAsync();

        var modules = await db.Set<Module>().IgnoreQueryFilters()
            .Select(m => new { m.Id, m.IsActive, m.AvailableToStore })
            .ToListAsync();

        return new Catalog(
            features.Select(f => (Id: f.Id, ModuleId: f.ModuleId)).ToArray(),
            modules.Where(m => !m.AvailableToStore).Select(m => m.Id).OrderBy(id => id).ToArray());
    }

    /// <summary>
    /// The (feature, role) pairs a plan grants: the map above, restricted to the features the
    /// live catalog exposes as store-available AND belonging to a module of that plan.
    /// </summary>
    private static string[] ExpectedRoleFeaturesOf(int planId, Catalog catalog)
    {
        var modules = ModulesOf(planId);
        var featuresInPlan = catalog.StoreAvailableActiveFeatures
            .Where(f => modules.Contains(f.ModuleId))
            .Select(f => f.Id)
            .ToHashSet();

        return FeatureRoles
            .Where(p => featuresInPlan.Contains(p.FeatureId))
            .Select(p => RoleFeatureKey(p.RoleId, p.FeatureId))
            .OrderBy(k => k, StringComparer.Ordinal)
            .ToArray();
    }

    /// <summary>
    /// Guards the expectation itself: if the catalog grew a store-available feature that the
    /// (feature, role) map does not cover, both the migration and this test would silently skip
    /// it and the set-equality assertion would pass on a lie.
    /// </summary>
    private static void EveryStoreFeatureOfThePlanIsMapped(int planId, Catalog catalog, string because)
    {
        var modules = ModulesOf(planId);
        var mapped = FeatureRoles.Select(p => p.FeatureId).ToHashSet();

        var unmapped = catalog.StoreAvailableActiveFeatures
            .Where(f => modules.Contains(f.ModuleId) && !mapped.Contains(f.Id))
            .Select(f => f.Id)
            .OrderBy(id => id)
            .ToArray();

        unmapped.Should().BeEmpty(because);
    }

    /// <summary>
    /// Seeds an approved store on <paramref name="planId"/> whose granted set is deliberately NOT
    /// the plan's universe, exercising all three migration paths at once:
    /// <list type="bullet">
    /// <item>a strict subset of the universe is active → the missing modules must be GRANTED;</item>
    /// <item>one extra module no plan includes is active → it must be soft-deleted (never
    /// hard-deleted); Administración is used because it is the module the spec excludes
    /// everywhere;</item>
    /// <item>one row of the universe is soft-deleted with negotiated prices → it must be
    /// REACTIVATED without its pricing being rewritten.</item>
    /// </list>
    /// The same three shapes are seeded on the StoreRoleFeature side, plus one orphan pair whose
    /// only role (ReSeller) the map never grants for that feature, so role granularity is
    /// asserted too.
    /// </summary>
    private async Task<StoreWithDrift> SeedStoreWithDriftAsync(ApplicationDbContext db, int planId, Catalog catalog)
    {
        var tenantId = DataUtils.DefaultTenant.Id;
        var target = ModulesOf(planId);

        var login = $"pmc-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Plan Convergence", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Plan Convergence owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"PMC-Store-{Guid.NewGuid():N}", owner.Id, approved: true, tenantId,
            paymentStartDate: null, storePlanId: planId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Soft-deleted row inside the universe: must come back active, pricing untouched.
        var reactivatedModuleId = target[0];
        var reactivated = StoreModule.Create(store.Id, reactivatedModuleId, NegotiatedPrice,
            modulePriceIncluded: false, NegotiatedModulePrice, NegotiatedDiscountPrice,
            NegotiatedPercentPrice, tenantId);
        reactivated.IsActive = false;
        db.Set<StoreModule>().Add(reactivated);

        // Rest of the universe: NO row at all, so the migration must INSERT it and the granted
        // row carries the migration's system actor in CreatedBy. Seeding them here instead would
        // leave the grant path unexercised and this seeder self-contradictory — the row would keep
        // the seeding's empty actor and the audit assertion in T1 could never hold.
        // Mirrors how the StoreRoleFeature drift below is seeded: only the row to reactivate and
        // the orphans exist; the migration creates everything else.
        var missingModuleIds = target.Skip(1).ToArray();

        // Extraneous active row: Administración belongs to no plan, so it must be retired.
        var extraModuleIds = new[] { PlanModuleConvergenceSql.AdministrationModuleId };
        foreach (var moduleId in extraModuleIds)
            db.Set<StoreModule>().Add(StoreModule.Create(store.Id, moduleId, 0, true, 0, 0, 0, tenantId));

        var expectedRoleFeatures = ExpectedRoleFeaturesOf(planId, catalog);

        // Soft-deleted pair inside the universe: must be reactivated.
        var reactivatedRoleFeatureKey = expectedRoleFeatures[0];

        // Active pairs the plan does not grant.
        var orphans = new List<string>
        {
            // MultiPayments (44) is mapped to OwnerAdmin + StoreUser only; the ReSeller role the
            // map grants for Perfil (70) never extends to it — so this pair is drift for EVERY
            // plan, VIP included, which makes it a plan-independent orphan.
            RoleFeatureKey(ReSellerRole, (int)FeatureType.MultiPayments)
        };

        var featuresOutsidePlan = catalog.StoreAvailableActiveFeatures
            .Where(f => !target.Contains(f.ModuleId))
            .OrderBy(f => f.ModuleId).ThenBy(f => f.Id)
            .ToArray();
        if (featuresOutsidePlan.Length > 0)
        {
            // VIP's universe is the whole store-available catalog, so for VIP there is no
            // store-available feature outside the plan — the ReSeller pair above is the whole
            // orphan case there.
            orphans.Add(RoleFeatureKey(OwnerAdminRole, featuresOutsidePlan[0].Id));
        }

        var (reactivatedRoleId, reactivatedFeatureId) = ParseRoleFeatureKey(reactivatedRoleFeatureKey);
        var reactivatedRoleFeature = StoreRoleFeature.Create(store.Id, reactivatedRoleId, reactivatedFeatureId, tenantId);
        reactivatedRoleFeature.IsActive = false;
        db.Set<StoreRoleFeature>().Add(reactivatedRoleFeature);

        foreach (var orphan in orphans)
        {
            var (roleId, featureId) = ParseRoleFeatureKey(orphan);
            db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(store.Id, roleId, featureId, tenantId));
        }

        await db.SaveChangesAsync();

        return new StoreWithDrift(
            user.Id, store.Id, planId, target, reactivatedModuleId, extraModuleIds, missingModuleIds,
            expectedRoleFeatures, orphans.ToArray(), reactivatedRoleFeatureKey);
    }

    private static async Task<int[]> ActiveModuleIdsAsync(ApplicationDbContext db, Guid storeId) =>
        (await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(sm => sm.StoreId == storeId && sm.IsActive)
            .Select(sm => sm.ModuleId)
            .OrderBy(id => id)
            .ToListAsync())
        .ToArray();

    // The key is composed in memory, not in SQL — a local method call inside a LINQ projection
    // is not translatable.
    private static async Task<string[]> ActiveRoleFeatureKeysAsync(ApplicationDbContext db, Guid storeId) =>
        (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(srf => srf.StoreId == storeId && srf.IsActive)
            .Select(srf => new { srf.RoleId, srf.FeatureId })
            .ToListAsync())
        .Select(x => RoleFeatureKey(x.RoleId, x.FeatureId))
        .OrderBy(k => k, StringComparer.Ordinal)
        .ToArray();

    private static async Task<(StoreModuleRow[] Modules, StoreRoleFeatureRow[] RoleFeatures)>
        SnapshotStoreGraphAsync(ApplicationDbContext db, Guid storeId)
    {
        var modules = await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(sm => sm.StoreId == storeId)
            .Select(sm => new StoreModuleRow(
                sm.StoreId, sm.ModuleId, sm.ModulePriceIncluded, sm.Price, sm.ModulePrice,
                sm.ModuleDiscountPrice, sm.ModulePercentDiscountPrice, sm.TenantId, sm.IsActive,
                sm.CreatedDate, sm.CreatedBy, sm.UpdatedDate, sm.UpdatedBy))
            .ToListAsync();

        var roleFeatures = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(srf => srf.StoreId == storeId)
            .Select(srf => new StoreRoleFeatureRow(
                srf.StoreId, srf.RoleId, srf.FeatureId, srf.TenantId, srf.IsActive,
                srf.CreatedDate, srf.CreatedBy, srf.UpdatedDate, srf.UpdatedBy))
            .ToListAsync();

        return (modules.OrderBy(m => m.ModuleId).ToArray(), roleFeatures
            .OrderBy(r => r.RoleId).ThenBy(r => r.FeatureId).ToArray());
    }

    // ── Records ────────────────────────────────────────────────────────────────

    private sealed record Catalog(
        (int Id, int ModuleId)[] StoreAvailableActiveFeatures,
        int[] NonStoreAvailableModuleIds);

    private sealed record StoreWithDrift(
        Guid UserId,
        Guid StoreId,
        int PlanId,
        int[] TargetModules,
        int ReactivatedModuleId,
        int[] ExtraModuleIds,
        int[] MissingModuleIds,
        string[] ExpectedRoleFeatureKeys,
        string[] OrphanRoleFeatureKeys,
        string ReactivatedRoleFeatureKey);

    private sealed record StoreModuleRow(
        Guid StoreId, int ModuleId, bool ModulePriceIncluded, float Price, float ModulePrice,
        float ModuleDiscountPrice, float ModulePercentDiscountPrice, Guid TenantId, bool IsActive,
        DateTimeOffset CreatedDate, Guid CreatedBy, DateTimeOffset? UpdatedDate, Guid? UpdatedBy);

    private sealed record StoreRoleFeatureRow(
        Guid StoreId, int RoleId, int FeatureId, Guid TenantId, bool IsActive,
        DateTimeOffset CreatedDate, Guid CreatedBy, DateTimeOffset? UpdatedDate, Guid? UpdatedBy);

    // ── Global-state capture/restore ───────────────────────────────────────────

    /// <summary>
    /// <c>UpSql</c> converges the WHOLE database, not just the store a test seeds — it
    /// soft-deletes extras and grants missing modules for every store it can see. Running it
    /// would therefore hand modules to stores another test deliberately seeded in a partial
    /// state (<c>AuthzSeed.SeedOwnerAdminAsync(withManagementModule: false)</c>) and change
    /// their outcome for reasons unrelated to that test. Each test captures both tables before
    /// touching anything and puts them back here.
    /// <para>
    /// The restore is exact because <c>UpSql</c> never hard-deletes: every captured row still
    /// exists, so restoring is an UPDATE of the only columns <c>UpSql</c> can move on an
    /// existing row (IsActive, UpdatedDate, UpdatedBy); the rows it INSERTed did not exist
    /// before and are deleted. <c>ExecuteUpdateAsync</c>/<c>ExecuteDeleteAsync</c> are used
    /// deliberately — they bypass the NoTracking trap
    /// (<c>ApplicationDbContext</c> sets <c>QueryTrackingBehavior.NoTracking</c> globally, so a
    /// query-then-mutate-then-SaveChanges would write nothing, silently) and the audit
    /// interceptor, which would otherwise restamp CreatedDate/CreatedBy on the restore.
    /// </para>
    /// </summary>
    private sealed class ConvergenceSnapshot
    {
        private readonly List<StoreModuleRow> _modules;
        private readonly List<StoreRoleFeatureRow> _roleFeatures;

        private ConvergenceSnapshot(List<StoreModuleRow> modules, List<StoreRoleFeatureRow> roleFeatures)
        {
            _modules = modules;
            _roleFeatures = roleFeatures;
        }

        public static async Task<ConvergenceSnapshot> CaptureAsync(AppTestFactory factory)
        {
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var modules = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Select(sm => new StoreModuleRow(
                    sm.StoreId, sm.ModuleId, sm.ModulePriceIncluded, sm.Price, sm.ModulePrice,
                    sm.ModuleDiscountPrice, sm.ModulePercentDiscountPrice, sm.TenantId, sm.IsActive,
                    sm.CreatedDate, sm.CreatedBy, sm.UpdatedDate, sm.UpdatedBy))
                .ToListAsync();

            var roleFeatures = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Select(srf => new StoreRoleFeatureRow(
                    srf.StoreId, srf.RoleId, srf.FeatureId, srf.TenantId, srf.IsActive,
                    srf.CreatedDate, srf.CreatedBy, srf.UpdatedDate, srf.UpdatedBy))
                .ToListAsync();

            return new ConvergenceSnapshot(modules, roleFeatures);
        }

        public static async Task RestoreAsync(AppTestFactory factory, ConvergenceSnapshot snapshot)
        {
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            foreach (var row in snapshot._modules)
            {
                await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(sm => sm.StoreId == row.StoreId && sm.ModuleId == row.ModuleId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(sm => sm.IsActive, row.IsActive)
                        .SetProperty(sm => sm.UpdatedDate, row.UpdatedDate)
                        .SetProperty(sm => sm.UpdatedBy, row.UpdatedBy));
            }

            foreach (var row in snapshot._roleFeatures)
            {
                await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                    .Where(srf => srf.StoreId == row.StoreId && srf.RoleId == row.RoleId
                        && srf.FeatureId == row.FeatureId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(srf => srf.IsActive, row.IsActive)
                        .SetProperty(srf => srf.UpdatedDate, row.UpdatedDate)
                        .SetProperty(srf => srf.UpdatedBy, row.UpdatedBy));
            }

            var capturedModuleKeys = snapshot._modules.Select(m => (m.StoreId, m.ModuleId)).ToHashSet();
            foreach (var extra in await db.Set<StoreModule>().IgnoreQueryFilters()
                         .Select(sm => new { sm.StoreId, sm.ModuleId }).ToListAsync())
            {
                if (!capturedModuleKeys.Contains((extra.StoreId, extra.ModuleId)))
                {
                    await db.Set<StoreModule>().IgnoreQueryFilters()
                        .Where(sm => sm.StoreId == extra.StoreId && sm.ModuleId == extra.ModuleId)
                        .ExecuteDeleteAsync();
                }
            }

            var capturedRoleFeatureKeys = snapshot._roleFeatures
                .Select(r => (r.StoreId, r.RoleId, r.FeatureId)).ToHashSet();
            foreach (var extra in await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                         .Select(srf => new { srf.StoreId, srf.RoleId, srf.FeatureId }).ToListAsync())
            {
                if (!capturedRoleFeatureKeys.Contains((extra.StoreId, extra.RoleId, extra.FeatureId)))
                {
                    await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                        .Where(srf => srf.StoreId == extra.StoreId && srf.RoleId == extra.RoleId
                            && srf.FeatureId == extra.FeatureId)
                        .ExecuteDeleteAsync();
                }
            }
        }
    }
}
