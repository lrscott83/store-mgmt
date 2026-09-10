using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
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
/// E2E tests for plan changes through both mutation paths, focused on the module-set
/// correctness after each change: <c>POST /api/v1/stores/{id}/toggle-plan</c> (Free↔Paid)
/// and <c>PUT /api/v1/stores/{id}</c> with <c>moduleIds</c> (module-set replacement) —
/// including the new plan modules 12/13/14, soft-delete semantics, feature
/// deactivation/reactivation without duplicates, and the DG-7 plan lock.
/// Plan 2026-09-08-e2e-plan-gated-modules-auth-roster (Lote 3).
/// </summary>
[Collection("e2e")]
public sealed class StorePlanChangeTests
{
    private readonly AppTestFactory _f;
    public StorePlanChangeTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int FreeManagementModuleId = 7;
    private const int StatisticsModuleId = 6;
    private const int WarehousesModuleId = 13;
    private const int WholesaleSalesModuleId = 12;
    private const int MultiStoresModuleId = 14;

    private static object Body(Guid bodyId, string name, IEnumerable<int> moduleIds) => new
    {
        Id = bodyId, Name = name, Address = "a", Description = "d", Approved = false,
        ModuleIds = moduleIds, IsActive = true
    };

    // ── Happy Path: toggle-plan ────────────────────────────────────────────

    [Fact]
    public async Task Toggle_free_to_paid_activates_new_modules_12_13_14_with_catalog_prices()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedStoreAsync(paidModules: [], paymentStartDate: null, storePlanId: (int)StorePlanType.Gratis);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);
            // owner-plan-change: the anchor is sacred — a Free→Paid toggle never writes it.
            // Direction derives from StorePlanId; overdue stores pin NextDueDateOverride.
            store.PaymentStartDate.Should().BeNull();
            store.StorePlanId.Should().Be((int)StorePlanType.Pago);
            store.NextDueDateOverride.Should().BeNull("null anchor → no clock → no pin");

            var activeModules = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.IsActive).ToListAsync();

            // ALL paid catalog modules activate, including the new 12/13/14.
            activeModules.Select(sm => sm.ModuleId).Should().Contain(new[]
            {
                StatisticsModuleId, WarehousesModuleId, WholesaleSalesModuleId, MultiStoresModuleId
            });

            // Warehouses snapshot carries the CURRENT catalog price (5 / 50%), not the
            // legacy 2 / 100% from before Update-Warehouses-Price.
            var warehouses = activeModules.Single(sm => sm.ModuleId == WarehousesModuleId);
            warehouses.Price.Should().Be(5f);
            warehouses.ModulePercentDiscountPrice.Should().Be(50f);

            // StoreRoleFeatures rows exist for the mapped features of the new modules.
            var srfFeatureIds = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == seeded.StoreId && srf.IsActive)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();
            srfFeatureIds.Should().Contain(new[] { 36, 37, 60 }); // Warehouses + Statistics mapped
            srfFeatureIds.Should().NotContain(new[] { 38, 39 });  // not mapped (production gap)
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Toggle_paid_to_free_softdeletes_paid_modules_and_deactivates_features()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedStoreAsync(
            paidModules: [(StatisticsModuleId, 2000f, 75f), (WarehousesModuleId, 5f, 50f), (MultiStoresModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            seedRoleFeatures: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);
            // owner-plan-change: Paid→Free keeps the anchor (never nulled), flips
            // StorePlanId to Gratis and clears any override.
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
            store.StorePlanId.Should().Be((int)StorePlanType.Gratis);
            store.NextDueDateOverride.Should().BeNull();

            // Free module stays active; paid modules (incl. new 13/14) are soft-deleted.
            var active = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.IsActive).Select(sm => sm.ModuleId).ToListAsync();
            active.Should().BeEquivalentTo(new[] { FreeManagementModuleId });

            var inactive = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && !sm.IsActive).Select(sm => sm.ModuleId).ToListAsync();
            inactive.Should().BeEquivalentTo(new[] { StatisticsModuleId, WarehousesModuleId, MultiStoresModuleId });

            // Their mapped StoreRoleFeatures are deactivated too.
            var activeSrfModules = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == seeded.StoreId && srf.IsActive)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();
            activeSrfModules.Should().NotContain(new[] { 36, 37, 60 });
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Toggle_round_trip_reactivates_without_duplicate_rows()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedStoreAsync(
            paidModules: [(StatisticsModuleId, 2000f, 75f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            (await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null))
                .StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Reactivation reuses the existing row — no duplicates (PK would reject an
            // INSERT anyway; the handler updates the soft-deleted row back to active).
            var modules = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId).ToListAsync();
            modules.Where(sm => sm.ModuleId == StatisticsModuleId).Should().ContainSingle();
            modules.Should().OnlyContain(sm => sm.IsActive);

            var srf = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == seeded.StoreId && srf.FeatureId == 60).ToListAsync();
            srf.Should().NotBeEmpty();
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── Happy Path: module-set replacement via PUT ────────────────────────

    [Fact]
    public async Task Update_module_set_downgrade_keeps_correct_modules_and_features()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedStoreAsync(
            paidModules: [(StatisticsModuleId, 2000f, 75f), (WarehousesModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            seedRoleFeatures: true);
        try
        {
            // Downgrade the module set: drop Warehouses (13), keep Management + Statistics.
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .PutAsJsonAsync($"/api/v1/stores/{seeded.StoreId}",
                    Body(seeded.StoreId, $"Store-{Guid.NewGuid():N}", new[] { FreeManagementModuleId, StatisticsModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var active = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.IsActive).Select(sm => sm.ModuleId).ToListAsync();
            active.Should().BeEquivalentTo(new[] { FreeManagementModuleId, StatisticsModuleId });

            var warehouses = await db.Set<StoreModule>().IgnoreQueryFilters()
                .SingleAsync(sm => sm.StoreId == seeded.StoreId && sm.ModuleId == WarehousesModuleId);
            warehouses.IsActive.Should().BeFalse(); // soft-deleted, row preserved

            // PaymentStartDate is untouched by module-set changes (billing clock keeps running).
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);
            store.PaymentStartDate.Should().NotBeNull();

            // Warehouses features deactivated with the module.
            var activeSrf = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == seeded.StoreId && srf.IsActive)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();
            activeSrf.Should().NotContain(new[] { 36, 37 });
            activeSrf.Should().Contain(60); // Statistics survives
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Update_module_set_upgrade_adds_new_modules_with_features()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedStoreAsync(paidModules: [], paymentStartDate: null);
        try
        {
            // Upgrade: add Warehouses (13) + WholesaleSales (12) to the free set.
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .PutAsJsonAsync($"/api/v1/stores/{seeded.StoreId}",
                    Body(seeded.StoreId, $"Store-{Guid.NewGuid():N}",
                        new[] { FreeManagementModuleId, WarehousesModuleId, WholesaleSalesModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);
            // owner-plan-change: activation-on-first-paid is REMOVED — adding paid modules
            // via PUT never fabricates the billing anchor; only the dedicated SuperAdmin
            // payment-date path writes it.
            store.PaymentStartDate.Should().BeNull();

            var active = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.IsActive).Select(sm => sm.ModuleId).ToListAsync();
            active.Should().BeEquivalentTo(new[] { FreeManagementModuleId, WarehousesModuleId, WholesaleSalesModuleId });

            var srfFeatureIds = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == seeded.StoreId && srf.IsActive)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();
            srfFeatureIds.Should().Contain(new[] { 36, 37 });
            srfFeatureIds.Should().NotContain(39); // WholesaleSales feature not mapped (production gap)
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Update_reactivate_softdeleted_module_no_duplicates()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedStoreAsync(
            paidModules: [(StatisticsModuleId, 2000f, 75f), (WarehousesModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            seedRoleFeatures: true);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);

            // Remove Warehouses, then re-add it.
            (await client.PutAsJsonAsync($"/api/v1/stores/{seeded.StoreId}",
                Body(seeded.StoreId, $"Store-{Guid.NewGuid():N}", new[] { FreeManagementModuleId, StatisticsModuleId })))
                .StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PutAsJsonAsync($"/api/v1/stores/{seeded.StoreId}",
                Body(seeded.StoreId, $"Store-{Guid.NewGuid():N}",
                    new[] { FreeManagementModuleId, StatisticsModuleId, WarehousesModuleId })))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // The soft-deleted row is REACTIVATED (updated), not duplicated — and its
            // price snapshot is refreshed from the catalog (5 / 50%).
            var warehouses = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.ModuleId == WarehousesModuleId).ToListAsync();
            warehouses.Should().ContainSingle().Which.IsActive.Should().BeTrue();

            var srf = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == seeded.StoreId && srf.FeatureId == 36).ToListAsync();
            srf.Should().NotBeEmpty();
            srf.GroupBy(x => new { x.StoreId, x.RoleId, x.FeatureId })
               .Where(g => g.Count() > 1).Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── Edge Cases ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Update_same_module_set_by_owner_admin_on_paid_store_allowed()
    {
        // DG-7: same-set updates never fire the plan lock — the requested ids match the
        // target store's current modules exactly. Pattern from StorePlanLockTests: the
        // actor OwnerAdmin needs its own store (SelectedStoreId) so [HasPermission]
        // resolves; the TARGET paid store (with new plan modules 12/13/14) is separate.
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var seeded = await SeedStoreAsync(
            paidModules: [(StatisticsModuleId, 2000f, 75f), (WarehousesModuleId, 5f, 50f), (MultiStoresModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/stores/{seeded.StoreId}",
                    Body(seeded.StoreId, $"Store-{Guid.NewGuid():N}",
                        new[] { FreeManagementModuleId, StatisticsModuleId, WarehousesModuleId, MultiStoresModuleId }));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await CleanupAsync(seeded);
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /// <summary>Seeds a store owned by the given owner with the given module sets, optional StoreRoleFeatures.</summary>
    private async Task<(Guid StoreId, Guid OwnerId, Guid OwnerUserId)> SeedStoreAsync(
        IReadOnlyList<(int ModuleId, float Price, float PercentDiscount)> paidModules,
        DateOnly? paymentStartDate,
        bool seedRoleFeatures = false,
        Guid? ownerId = null,
        int? storePlanId = null)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        Guid ownerUserId;
        Guid owner;
        if (ownerId is Guid oid)
        {
            owner = oid;
            ownerUserId = await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters()
                .Where(o => o.Id == oid).Select(o => o.UserId).SingleAsync();
        }
        else
        {
            var (uid, oid2) = await SeedOwnerAdminInternalAsync(db, tenantId);
            ownerUserId = uid;
            owner = oid2;
        }

        var store = Store.Create($"SPC-Store-{Guid.NewGuid():N}", owner, true, tenantId, paymentStartDate,
            storePlanId: storePlanId ?? (int)StorePlanType.Pago);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeManagementModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));
        foreach (var (moduleId, price, percentDiscount) in paidModules)
        {
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, moduleId, price, modulePriceIncluded: false,
                modulePrice: price, moduleDiscountPrice: 0, modulePercentDiscountPrice: percentDiscount, tenantId));
        }

        if (seedRoleFeatures)
        {
            var generator = scope.ServiceProvider.GetRequiredService<Domain.Interfaces.Services.Tenants.IStoreRoleFeatureGenerator>();
            var moduleIds = new List<int> { FreeManagementModuleId };
            moduleIds.AddRange(paidModules.Select(p => p.ModuleId));
            var featureIds = moduleIds.SelectMany(FeaturesForModule).ToList();
            foreach (var srf in await generator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds))
                db.Set<StoreRoleFeature>().Add(srf);
        }

        await db.SaveChangesAsync();
        return (store.Id, owner, ownerUserId);
    }

    /// <summary>Overload seeding its own owner user (no explicit owner passed).</summary>
    private async Task<(Guid StoreId, Guid OwnerId, Guid OwnerUserId)> SeedStoreAsync(
        IReadOnlyList<(int ModuleId, float Price, float PercentDiscount)> paidModules,
        DateOnly? paymentStartDate,
        bool seedRoleFeatures) =>
        await SeedStoreAsync(paidModules, paymentStartDate, seedRoleFeatures, ownerId: null);

    private async Task<(Guid UserId, Guid OwnerId)> SeedOwnerAdminUserAsync(string login)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await SeedOwnerAdminInternalAsync(db, DataUtils.DefaultTenant.Id, login);
    }

    private async Task<(Guid UserId, Guid OwnerId)> SeedOwnerAdminInternalAsync(
        ApplicationDbContext db, Guid tenantId, string? login = null)
    {
        var userLogin = login ?? $"spc-oa-{Guid.NewGuid():N}@test.com";
        var user = Domain.Entities.Users.User.Create(userLogin, DbTestHelpers.HashPassword("Password123"),
            "E2E SPC", "0000000000", userLogin, tenantId);
        db.Set<Domain.Entities.Users.User>().Add(user);
        var owner = Domain.Entities.Owners.Owner.Create(user.Id, false, tenantId, "E2E SPC Owner");
        db.Set<Domain.Entities.Owners.Owner>().Add(owner);
        await db.SaveChangesAsync();
        db.Set<Domain.Entities.UserRoles.UserRole>().Add(
            Domain.Entities.UserRoles.UserRole.Create(user.Id, (int)Domain.Common.Enums.RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();
        return (user.Id, owner.Id);
    }

    /// <summary>Features per module as FeatureEntityTypeConfiguration seeds them (AvailableToStore only).</summary>
    private static List<int> FeaturesForModule(int moduleId) => moduleId switch
    {
        2 => [20, 21, 22, 23],
        3 => [30, 31, 32, 33, 34, 35],
        4 => [40, 41, 42],
        5 => [50],
        6 => [60],
        7 => [70, 72, 73, 74],
        8 => [80],
        9 => [90, 91],
        10 => [100, 101, 102, 103],
        11 => [110],
        12 => [39],
        13 => [36, 37],
        14 => [38],
        _ => [],
    };

    private async Task CleanupAsync((Guid StoreId, Guid OwnerId, Guid OwnerUserId) seeded)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(x => x.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(x => x.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(x => x.Id == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters()
            .Where(x => x.Id == seeded.OwnerId).ExecuteDeleteAsync();
        await db.Set<Domain.Entities.UserRoles.UserRole>().IgnoreQueryFilters()
            .Where(x => x.UserId == seeded.OwnerUserId).ExecuteDeleteAsync();
        await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters()
            .Where(x => x.Id == seeded.OwnerUserId).ExecuteDeleteAsync();
    }
}
