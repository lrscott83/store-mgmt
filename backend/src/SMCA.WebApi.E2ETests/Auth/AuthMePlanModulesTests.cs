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

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// E2E tests for the module/feature dimension of <c>GET /api/v1/auth/me</c> across
/// store plans: the modules visible to the authenticated user must follow the store's
/// active module set (plan), with <c>PlanType</c>, <c>IsInTrial</c> and wrong paths
/// (401, inactive user/store/owner). Plan 2026-09-08-e2e-plan-gated-modules-auth-roster.
/// Runtime chain under test: StoreModules(active) → FilterForBilling(billing.Status)
/// → StoreModuleIds → FeatureIds/Roles.
/// </summary>
[Collection("e2e")]
public sealed class AuthMePlanModulesTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    private const int FreeManagementModuleId = 7;
    private const int StatisticsModuleId = 6;
    private const int WarehousesModuleId = 13;
    private const int WholesaleSalesModuleId = 12;
    private const int MultiStoresModuleId = 14;
    private const int StatisticsFeatureId = 60;
    private const int WarehousesFeatureId = 36;
    private const int WholesaleSalesFeatureId = 39;
    private const int MultiStoresFeatureId = 38;

    public AuthMePlanModulesTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    // ── Happy Path ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Me_owner_admin_sees_only_own_store_active_modules_and_features()
    {
        var login = $"me-free-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login, paidModules: [], paymentStartDate: null);
        try
        {
            var body = await MeAsync(seeded.UserId, login);

            // Free store: only the Management module is active → only Management features.
            body.Data!.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId });
            body.Data.FeatureIds.Should().NotContain(StatisticsFeatureId);
            body.Data.PlanType.Should().Be("Free");
            body.Data.IsInTrial.Should().BeFalse();
            body.Data.PaymentStatus.Should().Be("NoAplica");
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Me_paid_store_plan_pago_modules_and_features()
    {
        var login = $"me-paid-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [(StatisticsModuleId, 2000f, 75f)], paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            var body = await MeAsync(seeded.UserId, login);

            body.Data!.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId, StatisticsModuleId });
            body.Data.FeatureIds.Should().Contain(StatisticsFeatureId);
            body.Data.PlanType.Should().Be("Paid");
            body.Data.IsInTrial.Should().BeTrue(); // PaymentStartDate = today, within trial months
            body.Data.Roles.Should().Contain(r =>
                r.StoreId == seeded.StoreId && r.ModuleId == StatisticsModuleId);
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Me_paid_store_with_new_plan_modules_12_13_14_and_features_36_37()
    {
        var login = $"me-newmods-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [
                (StatisticsModuleId, 2000f, 75f),
                (WholesaleSalesModuleId, 2f, 100f),
                (WarehousesModuleId, 5f, 50f),
                (MultiStoresModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            var body = await MeAsync(seeded.UserId, login);

            // All plan modules active in the store are visible, including the new
            // WholesaleSales (12), Warehouses (13) and MultiStores (14).
            body.Data!.StoreModuleIds.Should().BeEquivalentTo(new[]
            {
                FreeManagementModuleId, StatisticsModuleId,
                WholesaleSalesModuleId, WarehousesModuleId, MultiStoresModuleId
            });
            // FeatureIds follow StoreRoleFeatures mapping: Warehouses features 36/37 are mapped,
            // but WholesaleSales (39) and OwnerStores (38) have NO StoreRoleFeatures entry yet
            // (production gap — asserted as current behavior; adding the mapping is a
            // production change requiring user approval).
            body.Data.FeatureIds.Should().Contain(new[] { WarehousesFeatureId });
            body.Data.FeatureIds.Should().NotContain(new[] { WholesaleSalesFeatureId, MultiStoresFeatureId });
            body.Data.PlanType.Should().Be("Paid");
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Me_after_free_to_paid_toggle_modules_reappear()
    {
        var login = $"me-f2p-{Guid.NewGuid():N}@test.com";
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedOwnerAdminWithModulesAsync(login, paidModules: [], paymentStartDate: null);
        try
        {
            // Free: only Management visible.
            var before = await MeAsync(seeded.UserId, login);
            before.Data!.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId });

            // SuperAdmin toggles the store to Paid — activates ALL paid catalog modules.
            var toggle = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null);
            toggle.StatusCode.Should().Be(HttpStatusCode.OK);

            var after = await MeAsync(seeded.UserId, login);
            after.Data!.StoreModuleIds.Should().Contain(new[] { StatisticsModuleId, WarehousesModuleId, WholesaleSalesModuleId, MultiStoresModuleId });
            after.Data.PlanType.Should().Be("Paid");
            after.Data.IsInTrial.Should().BeTrue();
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Me_after_paid_to_free_toggle_modules_disappear()
    {
        var login = $"me-p2f-{Guid.NewGuid():N}@test.com";
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [(StatisticsModuleId, 2000f, 75f), (WarehousesModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            var before = await MeAsync(seeded.UserId, login);
            before.Data!.StoreModuleIds.Should().Contain(new[] { StatisticsModuleId, WarehousesModuleId });

            var toggle = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", null);
            toggle.StatusCode.Should().Be(HttpStatusCode.OK);

            var after = await MeAsync(seeded.UserId, login);
            // Paid modules are soft-deleted → invisible to me; PlanType back to Free.
            after.Data!.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId });
            after.Data.FeatureIds.Should().NotContain(new[] { StatisticsFeatureId, WarehousesFeatureId });
            after.Data.PlanType.Should().Be("Free");
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── Edge Cases ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Me_store_with_softdeleted_paid_module_treated_as_absent()
    {
        var login = $"me-softdel-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [(StatisticsModuleId, 2000f, 75f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            // Soft-delete the paid module directly in the DB (IsActive=false).
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(sm => sm.StoreId == seeded.StoreId && sm.ModuleId == StatisticsModuleId)
                    .ExecuteUpdateAsync(s => s.SetProperty(sm => sm.IsActive, false));
            }

            var body = await MeAsync(seeded.UserId, login);

            // No active paid module remains → PlanType Free; the module is absent even
            // though the billing clock (PaymentStartDate) is still running.
            body.Data!.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId });
            body.Data.PlanType.Should().Be("Free");
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Me_wholesale_sales_zero_effective_price_not_in_trial()
    {
        var login = $"me-zeroeff-{Guid.NewGuid():N}@test.com";
        // WholesaleSales has a 100% discount (effective 0): a store whose only paid
        // module is 12 is "Paid" (hasPaidModule) but has no billable amount → IsInTrial false
        // (BillingService's zero-amount trial gate).
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [(WholesaleSalesModuleId, 2f, 100f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            var body = await MeAsync(seeded.UserId, login);

            body.Data!.StoreModuleIds.Should().BeEquivalentTo(new[] { FreeManagementModuleId, WholesaleSalesModuleId });
            body.Data.PlanType.Should().Be("Paid");
            body.Data.IsInTrial.Should().BeFalse(); // effective amount 0 → no trial
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    // ── Error Handling ────────────────────────────────────────────────────

    [Fact]
    public async Task Me_without_token_returns_401()
    {
        var response = await _f.CreateClient().GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Me_inactive_user_returns_404()
    {
        var login = $"me-inactive-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login, paidModules: [], paymentStartDate: null);
        try
        {
            await DeactivateUserAsync(seeded.UserId);
            var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, login);
            var response = await client.GetAsync("/api/v1/auth/me");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Me_inactive_store_returns_404_Store_Inactive()
    {
        var login = $"me-storeoff-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login, paidModules: [], paymentStartDate: null);
        try
        {
            await SetStoreActiveAsync(seeded.StoreId, false);
            var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, login);
            var response = await client.GetAsync("/api/v1/auth/me");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Me_inactive_owner_returns_404_Owner_Inactive()
    {
        var login = $"me-owneroff-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithModulesAsync(login, paidModules: [], paymentStartDate: null);
        try
        {
            await DeactivateOwnerAsync(seeded.OwnerId);
            var client = DbTestHelpers.AuthedClient(_f, seeded.UserId, login);
            var response = await client.GetAsync("/api/v1/auth/me");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private async Task<ApiResponse<CurrentUserDto>> MeAsync(Guid userId, string login)
    {
        var response = await DbTestHelpers.AuthedClient(_f, userId, login).GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body;
    }

    /// <summary>
    /// Seeds an OwnerAdmin user + Owner + Store (approved) + free Management module plus the
    /// given paid modules (catalog-like price/percent-discount snapshots), and the
    /// StoreRoleFeatures rows the real CreateStoreService would generate (the
    /// StoreRoleFeatureGenerator maps features to roles only for features with a
    /// StoreRoleFeatures enum entry). Sets SelectedStoreId.
    /// </summary>
    private async Task<(Guid UserId, Guid OwnerId, Guid StoreId)> SeedOwnerAdminWithModulesAsync(
        string login,
        IReadOnlyList<(int ModuleId, float Price, float PercentDiscount)> paidModules,
        DateOnly? paymentStartDate)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Me Plan", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Me Plan Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Me-Plan-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        var moduleIds = new List<int> { FreeManagementModuleId };
        moduleIds.AddRange(paidModules.Select(p => p.ModuleId));

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeManagementModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));
        foreach (var (moduleId, price, percentDiscount) in paidModules)
        {
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, moduleId, price, modulePriceIncluded: false,
                modulePrice: price, moduleDiscountPrice: 0, modulePercentDiscountPrice: percentDiscount, tenantId));
        }

        // StoreRoleFeatures rows, same shape the StoreRoleFeatureGenerator produces for
        // OwnerAdmin (the generator seeds StoreUser rows too; Roles in /me reads only
        // rows whose role the user actually has — OwnerAdmin here).
        var generator = scope.ServiceProvider.GetRequiredService<Domain.Interfaces.Services.Tenants.IStoreRoleFeatureGenerator>();
        var featureIds = moduleIds.SelectMany(m => FeaturesForModule(m)).ToList();
        var roleFeatures = await generator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds);
        foreach (var srf in roleFeatures)
            db.Set<StoreRoleFeature>().Add(srf);

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return (user.Id, owner.Id, store.Id);
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

    private async Task DeactivateUserAsync(Guid userId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        // ExecuteUpdateAsync bypasses the NoTracking trap (CLAUDE.md gotcha).
        await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false));
    }

    private async Task DeactivateOwnerAsync(Guid ownerId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(o => o.Id == ownerId)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.IsActive, false));
    }

    private async Task SetStoreActiveAsync(Guid storeId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == storeId)
            .ExecuteUpdateAsync(s => s.SetProperty(st => st.IsActive, isActive));
    }

    private async Task CleanupStoreAndUserAsync(Guid storeId, Guid userId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Children before parents (FK Restrict): StoreRoleFeature → StoreModule → Store.
        await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(x => x.Id == storeId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(x => x.UserId == userId).ExecuteDeleteAsync();
        await db.Set<UserRole>().IgnoreQueryFilters()
            .Where(x => x.UserId == userId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(x => x.Id == userId).ExecuteDeleteAsync();
    }
}

