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

namespace SMCA.WebApi.E2ETests.Users;

/// <summary>
/// Gap E2E row of the module/feature dimension of the offline roster download
/// (<c>GET /api/v1/store-users/{storeId}/offline-roster</c>) — plan
/// 2026-09-08-e2e-plan-gated-modules-auth-roster, matrix E2-5:
/// a paid store with the Warehouses (13), WholesaleSales (12) and MultiStores (14)
/// modules active exposes them in the roster's <c>StoreModuleIds</c>.
/// New file (convention <c>*GapTests.cs</c>); existing suites and support files are
/// untouched per the repo's E2E-untouchable rule.
/// </summary>
[Collection("e2e")]
public sealed class ExportOfflineRosterPlanGapTests
{
    private readonly AppTestFactory _f;
    public ExportOfflineRosterPlanGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int FreeManagementModuleId = 7;
    private const int WarehousesModuleId = 13;
    private const int WholesaleSalesModuleId = 12;
    private const int MultiStoresModuleId = 14;
    private const int WarehousesFeatureId = 36;
    private const int WarehouseStockMovementsFeatureId = 37;
    private const int MultiStoresFeatureId = 38;
    private const int WholesaleSalesFeatureId = 39;

    // ── Edge Cases ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Roster_warehouse_wholesale_multistores_in_paid_roster()
    {
        var login = $"rost-gap-{Guid.NewGuid():N}@test.com";
        // PaymentStartDate = today keeps the store within trial (AlDia), so
        // FilterForBilling keeps the paid modules in the roster.
        var seeded = await SeedOwnerAdminWithModulesAsync(login,
            paidModules: [
                (WarehousesModuleId, 5f, 50f),
                (WholesaleSalesModuleId, 2f, 100f),
                (MultiStoresModuleId, 5f, 50f)],
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            var body = await ExportRosterAsync(seeded.UserId, login, seeded.StoreId);

            // The owner is included synthetically (not a StoreUser) and carries the store's
            // full active plan module set, including the new Warehouses/WholesaleSales/
            // MultiStores modules.
            body.Data!.Users.Should().ContainSingle(u => u.IsOwnerAdmin);
            var ownerEntry = body.Data.Users.Single(u => u.IsOwnerAdmin);
            ownerEntry.StoreModuleIds.Should().Contain(new[]
            {
                WarehousesModuleId, WholesaleSalesModuleId, MultiStoresModuleId
            });

            // FeatureIds for the OwnerAdmin resolve through the StoreRoleFeatures enum
            // mapping: Warehouses (36/37), WholesaleSales (39) and MultiStores (38) all
            // have StoreRoleFeatures entries, so every active plan module's features reach
            // FeatureIds (store-role-features-completeness production fix, 2026-09-20).
            ownerEntry.FeatureIds.Should().Contain(new[]
            {
                WarehousesFeatureId, WarehouseStockMovementsFeatureId,
                MultiStoresFeatureId, WholesaleSalesFeatureId
            });

            ownerEntry.PaymentStatus.Should().BeOneOf("AlDia", "PorVencer");
        }
        finally
        {
            await CleanupAsync(seeded);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

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
    /// LOCAL seed helper (mirrors ExportOfflineRosterPlanTests; duplicated because support
    /// files are E2E-untouchable). OwnerAdmin + Owner + approved Store + free Management
    /// module + the given paid modules, with the StoreRoleFeatures rows the real
    /// StoreRoleFeatureGenerator produces. The owner user carries an OfflinePasswordPreHash
    /// so the roster wrap path succeeds.
    /// </summary>
    private async Task<(Guid UserId, Guid OwnerId, Guid StoreId, Guid TenantId)> SeedOwnerAdminWithModulesAsync(
        string login,
        IReadOnlyList<(int ModuleId, float Price, float PercentDiscount)> paidModules,
        DateOnly? paymentStartDate)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var preHashProtector = scope.ServiceProvider.GetRequiredService<Application.Abstractions.Authentication.IOfflinePreHashProtector>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Roster Gap", "0000000000", login, tenantId);
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Roster Gap Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Roster-Gap-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate);
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

        var moduleIds = new List<int> { FreeManagementModuleId };
        moduleIds.AddRange(paidModules.Select(p => p.ModuleId));
        var generator = scope.ServiceProvider.GetRequiredService<Domain.Interfaces.Services.Tenants.IStoreRoleFeatureGenerator>();
        var featureIds = moduleIds.SelectMany(FeaturesForModule).ToList();
        foreach (var srf in await generator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds))
            db.Set<StoreRoleFeature>().Add(srf);

        await db.SaveChangesAsync();
        return (user.Id, owner.Id, store.Id, tenantId);
    }

    /// <summary>Features per module as FeatureEntityTypeConfiguration seeds them (AvailableToStore only).</summary>
    private static List<int> FeaturesForModule(int moduleId) => moduleId switch
    {
        7 => [70, 72, 73, 74],                     // Management
        12 => [39],                                // WholesaleSales
        13 => [36, 37],                            // Warehouses
        14 => [38],                                // MultiStores
        _ => [],
    };

    private async Task CleanupAsync((Guid UserId, Guid OwnerId, Guid StoreId, Guid TenantId) seeded)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

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
