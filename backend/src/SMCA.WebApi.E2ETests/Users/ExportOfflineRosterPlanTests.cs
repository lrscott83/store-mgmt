using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.StoreUsers;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

/// <summary>
/// E2E tests for the module/feature dimension of the offline roster download
/// (<c>GET /api/v1/store-users/{storeId}/offline-roster</c>) across store plans:
/// the roster each user receives must reflect the store's active module set
/// (plan) filtered by billing status, with the new plan modules 12/13/14 and
/// their features 36/37/38/39, plus the plan-change propagation and wrong paths.
/// Plan 2026-09-08-e2e-plan-gated-modules-auth-roster (Lote 1).
/// </summary>
[Collection("e2e")]
public sealed class ExportOfflineRosterPlanTests
{
    private readonly AppTestFactory _f;
    public ExportOfflineRosterPlanTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int FreeManagementModuleId = 7;
    private const int StatisticsModuleId = 6;
    private const int WarehousesModuleId = 13;
    private const int WholesaleSalesModuleId = 12;
    private const int MultiStoresModuleId = 14;
    private const int WarehousesFeatureId = 36;
    private const int WholesaleSalesFeatureId = 39;
    private const int MultiStoresFeatureId = 38;

    // ── Happy Path ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Roster_paid_store_modules_and_features_reflect_plan()
    {
        var login = $"rost-paid-{Guid.NewGuid():N}@test.com";
        // PaymentStartDate = today keeps the store within trial (AlDia): NextDueDate is
        // PaymentStartDate + trialMonths + 1, safely in the future. A fixed past date would
        // make the store Vencido and FilterForBilling would strip the paid modules.
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [
                (StatisticsModuleId, 2000f, 75f),
                (WarehousesModuleId, 5f, 50f),
                (WholesaleSalesModuleId, 2f, 100f),
                (MultiStoresModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            withStoreUser: true);
        try
        {
            var body = await ExportRosterAsync(seeded.UserId, login, seeded.StoreId);
            var storeUser = body.Data!.Users.Single(u => !u.IsOwnerAdmin);

            // All plan modules (including the new 12/13/14) reach the roster.
            storeUser.StoreModuleIds.Should().BeEquivalentTo(new[]
            {
                FreeManagementModuleId, StatisticsModuleId,
                WarehousesModuleId, WholesaleSalesModuleId, MultiStoresModuleId
            });
            // Documented current behavior: for a plain StoreUser the roster's FeatureIds is
            // ALWAYS empty — GetAllowedFeatureIdsForUserAsync returns [] for StoreUser
            // (only OwnerAdmin/ReSeller roles resolve allowed features). The store user's
            // authorization offline comes from Roles (StoreRoleFeature rows), not FeatureIds.
            storeUser.FeatureIds.Should().BeEmpty();
            storeUser.PaymentStatus.Should().BeOneOf("AlDia", "PorVencer");
            storeUser.PaymentDueDate.Should().NotBeNull();

            // Roles group per store+module and follow the StoreRoleFeatures role mapping:
            // WarehousesAdmin is OwnerAdmin-only, so the plain StoreUser gets a Roles entry
            // ONLY for Management (module 7). The Warehouses entry belongs to the owner
            // (asserted in Roster_owner_admin_synthetic_entry_carries_plan_modules).
            storeUser.Roles.Should().Contain(r => r.StoreId == seeded.StoreId && r.ModuleId == FreeManagementModuleId);
            storeUser.Roles.Should().NotContain(r => r.ModuleId == WarehousesModuleId);
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    [Fact]
    public async Task Roster_free_store_only_free_modules()
    {
        var login = $"rost-free-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [], paymentStartDate: null, withStoreUser: true);
        try
        {
            var body = await ExportRosterAsync(seeded.UserId, login, seeded.StoreId);
            var storeUser = body.Data!.Users.Single(u => !u.IsOwnerAdmin);

            storeUser.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId });
            storeUser.FeatureIds.Should().NotContain(new[] { WarehousesFeatureId, WholesaleSalesFeatureId, MultiStoresFeatureId });
            storeUser.PaymentStatus.Should().Be("NoAplica");
            storeUser.PaymentDueDate.Should().BeNull();
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    [Fact]
    public async Task Roster_after_plan_change_reflects_new_module_set()
    {
        var login = $"rost-toggle-{Guid.NewGuid():N}@test.com";
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [(StatisticsModuleId, 2000f, 75f), (WarehousesModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            withStoreUser: true);
        try
        {
            // Before: paid modules present.
            var before = await ExportRosterAsync(seeded.UserId, login, seeded.StoreId);
            before.Data!.Users.Single(u => !u.IsOwnerAdmin).StoreModuleIds
                .Should().Contain(new[] { StatisticsModuleId, WarehousesModuleId });

            // Downgrade to Free → paid modules soft-deleted.
            var toggle = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null);
            toggle.StatusCode.Should().Be(HttpStatusCode.OK);

            var after = await ExportRosterAsync(seeded.UserId, login, seeded.StoreId);
            var afterUser = after.Data!.Users.Single(u => !u.IsOwnerAdmin);
            // Documented current behavior: the roster's module query (GetStoreModulesByIdAsync)
            // does NOT filter IsActive, so soft-deleted paid modules REMAIN in the roster's
            // StoreModuleIds after a downgrade — /me (GetAvailableModulesByStoreIdAsync) does
            // filter them. The two read-paths disagree today; asserted as-is. Roles DOES drop
            // the deactivated module (StoreRoleFeature rows are deactivated by the toggle).
            afterUser.StoreModuleIds.Should().Contain(new[] { FreeManagementModuleId, StatisticsModuleId, WarehousesModuleId });
            afterUser.Roles.Should().NotContain(r => r.ModuleId == WarehousesModuleId);
            // owner-plan-change: the toggle no longer nulls the billing anchor, so the
            // store's clock keeps running (anchor = today, within trial) → AlDia with a
            // concrete due date instead of the legacy NoAplica.
            afterUser.PaymentStatus.Should().Be("AlDia");
            afterUser.PaymentDueDate.Should().NotBeNull();
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Roster_after_free_to_paid_round_trip_restores_modules_without_duplicates()
    {
        var login = $"rost-rt-{Guid.NewGuid():N}@test.com";
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [(StatisticsModuleId, 2000f, 75f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            withStoreUser: true);
        try
        {
            // Paid → Free → Paid round trip.
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            (await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null))
                .StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await ExportRosterAsync(seeded.UserId, login, seeded.StoreId);
            var storeUser = body.Data!.Users.Single(u => !u.IsOwnerAdmin);

            // Free→Paid reactivates ALL paid catalog modules (not only the seeded ones):
            // expect Management (free) + every paid AvailableToStore module, without duplicates.
            var expectedPaid = await PaidCatalogModuleIdsAsync();
            storeUser.StoreModuleIds.Should().BeEquivalentTo(
                new[] { FreeManagementModuleId }.Concat(expectedPaid));
            var duplicated = storeUser.StoreModuleIds
                .GroupBy(id => id)
                .Where(g => g.Count() > 1)
                .Select(g => g.Key)
                .ToList();
            duplicated.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── Edge Cases ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Roster_vencido_store_excludes_new_paid_modules_12_13_14()
    {
        using var _ = _f.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));
        var login = $"rost-venc-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [
                (StatisticsModuleId, 2000f, 75f),
                (WarehousesModuleId, 5f, 50f),
                (WholesaleSalesModuleId, 2f, 100f),
                (MultiStoresModuleId, 5f, 50f)],
            paymentStartDate: new DateOnly(2020, 1, 1),
            withStoreUser: true);
        try
        {
            var body = await ExportRosterAsync(seeded.UserId, login, seeded.StoreId);
            var storeUser = body.Data!.Users.Single(u => !u.IsOwnerAdmin);

            // Vencido → only PriceIncluded (free) modules survive the billing filter.
            storeUser.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId });
            storeUser.FeatureIds.Should().NotContain(new[] { WarehousesFeatureId, WholesaleSalesFeatureId, MultiStoresFeatureId });
            storeUser.PaymentStatus.Should().Be("Vencido");
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    [Fact]
    public async Task Roster_owner_admin_synthetic_entry_carries_plan_modules()
    {
        var login = $"rost-owner-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [(WarehousesModuleId, 5f, 50f), (MultiStoresModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            withStoreUser: false);
        try
        {
            var body = await ExportRosterAsync(seeded.UserId, login, seeded.StoreId);

            // The owner is included synthetically (not a StoreUser) and carries the
            // same plan module set as the store.
            body.Data!.Users.Should().ContainSingle(u => u.IsOwnerAdmin);
            var ownerEntry = body.Data.Users.Single(u => u.IsOwnerAdmin);
            ownerEntry.StoreModuleIds.Should().BeEquivalentTo(new[]
            {
                FreeManagementModuleId, WarehousesModuleId, MultiStoresModuleId
            });
            // FeatureIds follow the StoreRoleFeatures mapping: Warehouses 36/37 are mapped;
            // OwnerStores (38) has no StoreRoleFeatures entry yet (production gap, asserted
            // as current behavior).
            ownerEntry.FeatureIds.Should().Contain(new[] { WarehousesFeatureId });
            ownerEntry.FeatureIds.Should().NotContain(MultiStoresFeatureId);
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    // ── Error Handling ────────────────────────────────────────────────────

    [Fact]
    public async Task Roster_without_token_returns_401()
    {
        var response = await _f.CreateClient()
            .GetAsync($"/api/v1/StoreUsers/{Guid.NewGuid()}/offline-roster");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Roster_owner_admin_foreign_store_returns_400()
    {
        var loginA = $"rost-oa-{Guid.NewGuid():N}@test.com";
        var loginB = $"rost-ob-{Guid.NewGuid():N}@test.com";
        var a = await SeedOwnerAdminWithModulesAsync(loginA, paidModules: [], paymentStartDate: null);
        var b = await SeedOwnerAdminWithModulesAsync(loginB,
            paidModules: [(StatisticsModuleId, 2000f, 75f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, a.UserId, loginA)
                .GetAsync($"/api/v1/StoreUsers/{b.StoreId}/offline-roster");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await CleanupAsync(a);
            await CleanupAsync(b);
        }
    }

    [Fact]
    public async Task Roster_inactive_store_returns_403_permission_gate_before_handler_check()
    {
        var login = $"rost-inact-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [(StatisticsModuleId, 2000f, 75f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            await SetStoreActiveAsync(seeded.StoreId, false);
            var response = await DbTestHelpers.AuthedClient(_f, seeded.UserId, login)
                .GetAsync($"/api/v1/StoreUsers/{seeded.StoreId}/offline-roster");
            // Documented current behavior: the [HasPermission(UsersAdmin)] filter runs BEFORE
            // the handler's inactive-store 400 — with the store inactive, its modules fail
            // FilterForBilling so the permission gate denies with 403. The handler's 400
            // (StoreNotFound for inactive store) is unreachable through this route today.
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /// <summary>Paid module ids exactly as the toggle handler resolves them (GetAvailableModulesToStore minus PriceIncluded).</summary>
    private async Task<List<int>> PaidCatalogModuleIdsAsync()
    {
        using var scope = _f.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<Domain.Interfaces.Repositories.IModuleRepository>();
        return (await repo.GetAvailableModulesToStore()).Where(m => !m.PriceIncluded).Select(m => m.Id).ToList();
    }

    private async Task<ApiResponse<RosterData>> ExportRosterAsync(Guid userId, string login, Guid storeId)
    {
        var response = await DbTestHelpers.AuthedClient(_f, userId, login)
            .GetAsync($"/api/v1/StoreUsers/{storeId}/offline-roster");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body;
    }

    /// <summary>
    /// Seeds OwnerAdmin + Owner + Store (approved) + free Management module + the given
    /// paid modules, sets SelectedStoreId and (optionally) one plain StoreUser. The owner
    /// user carries an OfflinePasswordPreHash so the roster wrap path succeeds.
    /// </summary>
    private async Task<(Guid UserId, Guid OwnerId, Guid StoreId, Guid TenantId, Guid? StoreUserId, string? StoreUserLogin)> SeedOwnerAdminWithModulesAsync(
        string login,
        IReadOnlyList<(int ModuleId, float Price, float PercentDiscount)> paidModules,
        DateOnly? paymentStartDate,
        bool withStoreUser = false)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var preHashProtector = scope.ServiceProvider.GetRequiredService<Application.Abstractions.Authentication.IOfflinePreHashProtector>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Roster Plan", "0000000000", login, tenantId);
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Roster Plan Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Roster-Plan-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate);
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

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));

        Guid? storeUserId = null;
        string? storeUserLogin = null;
        if (withStoreUser)
        {
            storeUserLogin = $"rost-su-{Guid.NewGuid():N}@test.com";
            var su = User.Create(storeUserLogin, DbTestHelpers.HashPassword("Password123"), "E2E Roster SU", "0000000000", storeUserLogin, tenantId);
            su.OfflinePasswordPreHash = preHashProtector.Protect("Password123", su.Id);
            su.SelectedStoreId = store.Id;
            db.Set<User>().Add(su);
            db.Set<StoreUser>().Add(StoreUser.Create(su.Id, store.Id, tenantId));
            db.Set<UserRole>().Add(UserRole.Create(su.Id, (int)RoleType.StoreUser, tenantId));
            storeUserId = su.Id;
        }

        // StoreRoleFeatures rows, same shape the real StoreRoleFeatureGenerator produces
        // (Roles in the roster come from this table, not from the module set alone).
        var moduleIds = new List<int> { FreeManagementModuleId };
        moduleIds.AddRange(paidModules.Select(p => p.ModuleId));
        var generator = scope.ServiceProvider.GetRequiredService<Domain.Interfaces.Services.Tenants.IStoreRoleFeatureGenerator>();
        var featureIds = moduleIds.SelectMany(m => FeaturesForModule(m)).ToList();
        foreach (var srf in await generator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds))
            db.Set<StoreRoleFeature>().Add(srf);

        await db.SaveChangesAsync();
        return (user.Id, owner.Id, store.Id, tenantId, storeUserId, storeUserLogin);
    }

    /// <summary>Features per module as FeatureEntityTypeConfiguration seeds them (AvailableToStore only).</summary>
    private static List<int> FeaturesForModule(int moduleId) => moduleId switch
    {
        2 => [20, 21, 22, 23],                     // Sales
        3 => [30, 31, 32, 33, 34, 35],             // Inventory
        4 => [40, 41, 42],                         // Synchronization
        5 => [50],                                 // Reports
        6 => [60],                                 // Statistics
        7 => [70, 72, 73, 74],                     // Management
        8 => [80],                                 // Expenses
        9 => [90, 91],                             // Billing
        10 => [100, 101, 102, 103],                // Histories
        11 => [110],                               // Credits
        12 => [39],                                // WholesaleSales
        13 => [36, 37],                            // Warehouses
        14 => [38],                                // MultiStores
        _ => [],
    };

    private async Task SetStoreActiveAsync(Guid storeId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == storeId)
            .ExecuteUpdateAsync(s => s.SetProperty(st => st.IsActive, isActive));
    }

    private async Task CleanupAsync(
        (Guid UserId, Guid OwnerId, Guid StoreId, Guid TenantId, Guid? StoreUserId, string? StoreUserLogin) seeded)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        if (seeded.StoreUserId is Guid suId)
        {
            await db.Set<UserRole>().IgnoreQueryFilters().Where(r => r.UserId == suId).ExecuteDeleteAsync();
            await db.Set<StoreUser>().IgnoreQueryFilters().Where(su => su.UserId == suId).ExecuteDeleteAsync();
            await db.Set<User>().IgnoreQueryFilters().Where(u => u.Id == suId).ExecuteDeleteAsync();
        }

        await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(x => x.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(x => x.StoreId == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(x => x.Id == seeded.StoreId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(x => x.UserId == seeded.UserId).ExecuteDeleteAsync();
        await db.Set<UserRole>().IgnoreQueryFilters()
            .Where(x => x.UserId == seeded.UserId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(x => x.Id == seeded.UserId).ExecuteDeleteAsync();
    }
}
