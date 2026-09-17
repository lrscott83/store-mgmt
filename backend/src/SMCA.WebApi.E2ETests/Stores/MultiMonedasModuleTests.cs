using System.Net;
using System.Net.Http.Json;
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
using Domain.Common.Constants;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// multimonedas-module — NEW coverage (2026-09-17), purely additive:
/// NO existing E2E file is modified (E2E-untouchable rule).
///
/// The MultiMonedas module (15, feature 43) is included ONLY in the Superior (3)
/// and VIP (4) plans. This suite pins the FULL chain a user experiences:
///
///   MM1  Registering a store with the plan catalog (Superior) grants module 15
///        + feature 43: visible in DB (StoreModule + StoreRoleFeature) and in
///        /me (StoreModuleIds contains 15, FeatureIds contains 43).
///   MM2  Changing the plan to Superior activates 15/43 through the SAME
///        runtime chain (change-plan → StoreModules → /me).
///   MM3  Changing the plan to VIP activates 15/43 too.
///   MM4  Changing back Superior → Pago STRIPS 15 (and its 43 grant) — the
///        module must follow the plan in both directions.
///   MM5  Backfill parity: a pre-existing Superior store seeded exactly like
///        the migration/backfill writes it (StoreModule 15 + StoreRoleFeature 43
///        for OwnerAdmin and StoreUser) exposes 15/43 on /me with NO re-register.
///   MM6  Billing gate: the same store over its due date (Vencido) loses 15
///        from /me (FilterForBilling keeps only PriceIncluded modules) —
///        unpaid stores must not keep the premium module.
/// </summary>
[Collection("e2e")]
public sealed class MultiMonedasModuleTests
{
    private readonly AppTestFactory _f;
    public MultiMonedasModuleTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int MultiMonedasModuleId = (int)ModuleType.MultiMonedas;      // 15
    private const int MultiMonedasFeatureId = (int)FeatureType.MultiMonedas;    // 43
    private const int ManagementModuleId = (int)ModuleType.Management;          // 7 (free)

    private sealed record SeededOwner(Guid UserId, string Login, Guid OwnerId, Guid StoreId, Guid TenantId);

    private static object PlanBody(int storePlanId) => new { storePlanId };

    /// <summary>
    /// LOCAL seed helper — does NOT modify the shared StoreSeed/AuthzSeed classes
    /// (E2E-untouchable rule). Same shape as ChangeStorePlanTests.SeedOwnerAdminStoreAsync:
    /// active OwnerAdmin user owning one active store on the given plan, free Management
    /// module, Stores feature grant (endpoint permission) and SelectedStoreId set.
    /// paymentStartDate=null keeps billing NoAplica so FilterForBilling is a no-op and
    /// the PLAN is the only variable under test (MM6 overrides it explicitly).
    /// </summary>
    private async Task<SeededOwner> SeedOwnerAdminStoreAsync(
        int planId,
        DateOnly? paymentStartDate = null)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"mm-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E MM Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E MM Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"MM-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate,
            storePlanId: planId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, ManagementModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        // StoresAdmin needs the Stores feature on the Management module for OwnerAdmin.
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
            store.Id, (int)RoleType.OwnerAdmin, AuthzSeed.StoresFeatureId, tenantId));

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return new SeededOwner(user.Id, login, owner.Id, store.Id, tenantId);
    }

    private static async Task<MeData> MeAsync(HttpClient client)
    {
        var r = await client.GetAsync("/api/v1/auth/me");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b.Data!;
    }

    private static HttpClient OwnerClient(AppTestFactory f, SeededOwner s)
        => DbTestHelpers.AuthedClient(f, s.UserId, s.Login);

    [Fact]
    public async Task MM1_created_store_inherits_multimonedas_from_selected_store()
    {
        // OwnerAdmin creation contract (OwnerCreateStoreTests): the body ModuleIds are
        // IGNORED — the new store INHERITS the selected store's module set, and the
        // handler gates on MultiStores (14) being active on the selected store. Seed the
        // selected store with {7, 14, 15}: creating then propagates 15 + feature 43.
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Superior);
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreModule>().Add(StoreModule.Create(
                    seeded.StoreId, (int)ModuleType.MultiStores, price: 5, modulePriceIncluded: false,
                    modulePrice: 5, moduleDiscountPrice: 0, modulePercentDiscountPrice: 50, seeded.TenantId));
                db.Set<StoreModule>().Add(StoreModule.Create(
                    seeded.StoreId, MultiMonedasModuleId, price: 3, modulePriceIncluded: false,
                    modulePrice: 3, moduleDiscountPrice: 0, modulePercentDiscountPrice: 100, seeded.TenantId));
                await db.SaveChangesAsync();
            }

            var body = new
            {
                OwnerId = Guid.Empty,
                Name = $"MM-Reg-{Guid.NewGuid():N}",
                Address = "",
                Description = "",
                Approved = true,
                ModuleIds = Array.Empty<int>(), // ignored for OwnerAdmin: modules inherit
            };
            var create = await OwnerClient(_f, seeded).PostAsJsonAsync("/api/v1/stores", body);
            create.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await create.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            var newStoreId = created!.Data!.Id;

            try
            {
                using var scope = _f.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                (await db.Set<StoreModule>().IgnoreQueryFilters().CountAsync(sm =>
                    sm.StoreId == newStoreId && sm.ModuleId == MultiMonedasModuleId && sm.IsActive))
                    .Should().Be(1, "the inherited module set must contain MultiMonedas");
                (await db.Set<StoreRoleFeature>().IgnoreQueryFilters().CountAsync(srf =>
                    srf.StoreId == newStoreId && srf.FeatureId == MultiMonedasFeatureId))
                    .Should().BeGreaterThan(0, "feature 43 must be granted to the registered roles");
            }
            finally
            {
                await StoreSeed.CleanupStoreAsync(_f, newStoreId);
            }
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task MM2_change_plan_to_superior_activates_multimonedas_on_me()
    {
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Pago);
        try
        {
            var client = OwnerClient(_f, seeded);
            var r = await client.PostAsJsonAsync(
                $"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Superior));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var me = await MeAsync(client);
            me.StoreModuleIds.Should().Contain(MultiMonedasModuleId,
                "Superior includes the MultiMonedas module");
            me.FeatureIds.Should().Contain(MultiMonedasFeatureId,
                "feature 43 flows with the module");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task MM3_change_plan_to_vip_activates_multimonedas_on_me()
    {
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Pago);
        try
        {
            var client = OwnerClient(_f, seeded);
            var r = await client.PostAsJsonAsync(
                $"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.VIP));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var me = await MeAsync(client);
            me.StoreModuleIds.Should().Contain(MultiMonedasModuleId,
                "VIP includes the MultiMonedas module");
            me.FeatureIds.Should().Contain(MultiMonedasFeatureId);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task MM4_downgrade_superior_to_pago_strips_multimonedas()
    {
        // Seed the Superior store with its module + feature grant (what a real Superior
        // store has after register/backfill), then verify the downgrade strips BOTH.
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Superior);
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreModule>().Add(StoreModule.Create(
                    seeded.StoreId, MultiMonedasModuleId, price: 3, modulePriceIncluded: false,
                    modulePrice: 3, moduleDiscountPrice: 0, modulePercentDiscountPrice: 100, seeded.TenantId));
                db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                    seeded.StoreId, (int)RoleType.OwnerAdmin, MultiMonedasFeatureId, seeded.TenantId));
                await db.SaveChangesAsync();
            }

            var client = OwnerClient(_f, seeded);
            (await MeAsync(client)).StoreModuleIds.Should().Contain(MultiMonedasModuleId,
                "precondition: the Superior store has the module");

            var r = await client.PostAsJsonAsync(
                $"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Pago));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var me = await MeAsync(client);
            me.StoreModuleIds.Should().NotContain(MultiMonedasModuleId,
                "Pago does not include MultiMonedas — the downgrade must strip it");
            me.FeatureIds.Should().NotContain(MultiMonedasFeatureId);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task MM5_backfilled_superior_store_exposes_module_and_feature_on_me()
    {
        // Mirror EXACTLY what the EF migration / VPS script 17 backfill writes for an
        // existing ACTIVE Superior store: StoreModule(15) with the catalog pricing
        // (price 3, 100% discount) + StoreRoleFeature(43) for OwnerAdmin and StoreUser.
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Superior);
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreModule>().Add(StoreModule.Create(
                    seeded.StoreId, MultiMonedasModuleId, price: 3, modulePriceIncluded: false,
                    modulePrice: 3, moduleDiscountPrice: 0, modulePercentDiscountPrice: 100, seeded.TenantId));
                db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                    seeded.StoreId, (int)RoleType.OwnerAdmin, MultiMonedasFeatureId, seeded.TenantId));
                db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                    seeded.StoreId, (int)RoleType.StoreUser, MultiMonedasFeatureId, seeded.TenantId));
                await db.SaveChangesAsync();
            }

            var me = await MeAsync(OwnerClient(_f, seeded));
            me.StoreModuleIds.Should().Contain(MultiMonedasModuleId,
                "the backfilled rows must surface without any re-registration");
            me.FeatureIds.Should().Contain(MultiMonedasFeatureId);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task MM6_overdue_store_loses_multimonedas_from_me()
    {
        // PaymentStartDate 2 years ago ⇒ billing Vencido ⇒ FilterForBilling keeps only
        // PriceIncluded modules. MultiMonedas is paid (PriceIncluded=false), so even with
        // the StoreModule row present it must disappear from /me.
        var seeded = await SeedOwnerAdminStoreAsync(
            planId: (int)StorePlanType.Pago,
            paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-2)));
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreModule>().Add(StoreModule.Create(
                    seeded.StoreId, MultiMonedasModuleId, price: 3, modulePriceIncluded: false,
                    modulePrice: 3, moduleDiscountPrice: 0, modulePercentDiscountPrice: 100, seeded.TenantId));
                db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
                    seeded.StoreId, (int)RoleType.OwnerAdmin, MultiMonedasFeatureId, seeded.TenantId));
                await db.SaveChangesAsync();
            }

            var me = await MeAsync(OwnerClient(_f, seeded));
            me.StoreModuleIds.Should().NotContain(MultiMonedasModuleId,
                "an overdue store must lose the paid module (billing gate)");
            me.FeatureIds.Should().NotContain(MultiMonedasFeatureId);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }
}
