using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Services.Tenants;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// A module switched off in the GLOBAL catalog (<c>Module.IsActive == false</c>) is gone for
/// every store: it is not priced, its features do not reach the session, and its
/// <c>StoreModule</c> rows are switched off in cascade when it is deactivated through the
/// catalog editor (owner decision 2026-10-14).
/// </summary>
[Collection("e2e")]
public sealed class StoreModuleGlobalActiveEnforcementTests
{
    private readonly AppTestFactory _f;
    public StoreModuleGlobalActiveEnforcementTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const float Tolerance = 0.01f;

    private sealed record CatalogRow(int Id, string Name, bool IsActive, float Price,
        float DiscountPrice, float PercentDiscountPrice);

    private sealed record CardDto(Guid Id, string Name, bool Approved, string PlanType,
        float? PlanPrice, float? PlanCurrentPrice);

    // ── DB helpers (IgnoreQueryFilters: a non-request scope hides rows via the tenant filter) ──

    private async Task SetModuleActiveAsync(int moduleId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var module = await db.Set<Module>().IgnoreQueryFilters().FirstAsync(m => m.Id == moduleId);
        module.IsActive = isActive;
        db.Set<Module>().Update(module);
        await db.SaveChangesAsync();
    }

    private async Task<bool?> GetStoreModuleActiveAsync(Guid storeId, int moduleId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var row = await db.Set<StoreModule>().IgnoreQueryFilters()
            .FirstOrDefaultAsync(sm => sm.StoreId == storeId && sm.ModuleId == moduleId);
        return row?.IsActive;
    }

    private async Task SeedStoreModuleAsync(Guid storeId, int moduleId, float price, float percent)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreModule>().Add(StoreModule.Create(storeId, moduleId, price, false, price, 0f, percent,
            DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
    }

    private async Task<List<CardDto>> ListSuperStoresAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/v1/stores/by-current-user");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await res.Content.ReadFromJsonAsync<ApiResponse<List<CardDto>>>(ApiResponse.Json))!.Data!;
    }

    private async Task<List<CatalogRow>> ReadCatalogAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/v1/modules/catalog");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await res.Content.ReadFromJsonAsync<ApiResponse<List<CatalogRow>>>(ApiResponse.Json))!.Data!;
    }

    /// <summary>Writes the WHOLE catalog back (the endpoint is fail-closed), flipping one row.</summary>
    private async Task PutCatalogPricingAsync(HttpClient client, List<CatalogRow> catalog, int flipModuleId, bool isActive)
    {
        var body = new
        {
            Modules = catalog.Select(r => new
            {
                ModuleId = r.Id,
                r.Price,
                r.DiscountPrice,
                r.PercentDiscountPrice,
                IsActive = r.Id == flipModuleId ? isActive : r.IsActive
            }).ToList()
        };
        var res = await client.PutAsJsonAsync("/api/v1/modules/pricing", body);
        res.StatusCode.Should().Be(HttpStatusCode.OK, "the catalog save must succeed");
    }

    // ═══ S3 — cascade: deactivating a module switches off its store rows ═══

    [Fact]
    public async Task Deactivating_a_module_in_the_catalog_switches_off_its_store_rows_in_cascade()
    {
        const int TargetModuleId = 6;

        var saLogin = $"gact-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"GACT-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { TargetModuleId });
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            (await GetStoreModuleActiveAsync(fx.StoreId, TargetModuleId)).Should().BeTrue(
                "precondition: the store holds this module active");

            var catalog = await ReadCatalogAsync(client);
            await PutCatalogPricingAsync(client, catalog, TargetModuleId, isActive: false);

            (await GetStoreModuleActiveAsync(fx.StoreId, TargetModuleId)).Should().BeFalse(
                "a module switched off globally is switched off in every store");

            // Reactivating globally does NOT bring the store's row back (owner decision).
            await PutCatalogPricingAsync(client, catalog, TargetModuleId, isActive: true);
            (await GetStoreModuleActiveAsync(fx.StoreId, TargetModuleId)).Should().BeFalse(
                "reactivating a module globally does nothing more");
        }
        finally
        {
            await SetModuleActiveAsync(TargetModuleId, true);
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ═══ S1 — price: a globally-inactive module contributes nothing ═══

    [Fact]
    public async Task The_store_card_does_not_price_a_module_that_is_globally_inactive()
    {
        var saLogin = $"gact-sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var fx = await StoreSeed.SeedStoreAsync(_f, $"GACT-{Guid.NewGuid():N}", approved: true,
            moduleIds: new[] { StoreSeed.ManagementModuleId });
        // module A: globally active -> 2 with 50% off = 1
        // module B: globally INACTIVE, but the store still holds it ACTIVE -> must not count
        const int ModuleA = 8;
        const int ModuleB = 9;
        try
        {
            await SeedStoreModuleAsync(fx.StoreId, ModuleA, 2f, 50f);
            await SeedStoreModuleAsync(fx.StoreId, ModuleB, 5f, 50f);
            await SetModuleActiveAsync(ModuleB, false);

            var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var card = (await ListSuperStoresAsync(client)).Single(s => s.Id == fx.StoreId);

            card.PlanCurrentPrice.Should().BeApproximately(1f, Tolerance,
                "only the globally-active module contributes (2 with 50% off = 1); the inactive one is gone");
        }
        finally
        {
            await SetModuleActiveAsync(ModuleB, true);
            await StoreSeed.CleanupStoreFixtureAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ═══ S2 — /me: features of a globally-inactive module do not reach the session ═══

    [Fact]
    public async Task Me_feature_ids_exclude_features_of_a_globally_inactive_module()
    {
        const int ModuleId = 7; // Management: grants store features to the OwnerAdmin

        var login = $"gact-owner-{Guid.NewGuid():N}@test.com";
        Guid userId;
        Guid storeId;
        Guid tenantId = DataUtils.DefaultTenant.Id;
        List<int> moduleFeatures;

        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
                "GACT Owner", "0000000000", login, tenantId);
            db.Set<User>().Add(user);
            var owner = Owner.Create(user.Id, false, tenantId, "GACT owner");
            db.Set<Owner>().Add(owner);
            await db.SaveChangesAsync();

            var store = Store.Create($"GACT-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate: null);
            db.Set<Store>().Add(store);
            await db.SaveChangesAsync();
            db.Set<StoreModule>().Add(StoreModule.Create(store.Id, ModuleId, 0, true, 0, 0, 0, tenantId));

            moduleFeatures = await db.Set<Feature>().IgnoreQueryFilters()
                .Where(f => f.ModuleId == ModuleId && f.IsActive && f.AvailableToStore)
                .Select(f => f.Id).ToListAsync();
            moduleFeatures.Should().NotBeEmpty("precondition: this module grants available features");

            var generator = scope.ServiceProvider.GetRequiredService<IStoreRoleFeatureGenerator>();
            foreach (var srf in await generator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, moduleFeatures))
                db.Set<StoreRoleFeature>().Add(srf);

            user.SelectedStoreId = store.Id;
            db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
            await db.SaveChangesAsync();

            userId = user.Id;
            storeId = store.Id;
        }

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, userId, login);

            var meBeforeRes = await client.GetAsync("/api/v1/auth/me");
            meBeforeRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var meBefore = (await meBeforeRes.Content
                .ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json))!.Data!;
            meBefore.FeatureIds.Should().Contain(moduleFeatures,
                "precondition: while the module is active its features reach the session");

            await SetModuleActiveAsync(ModuleId, false);

            var meAfter = (await (await client.GetAsync("/api/v1/auth/me"))
                .Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json))!.Data!;
            meAfter.FeatureIds.Should().NotContain(moduleFeatures,
                "a module switched off globally stops granting its features");
        }
        finally
        {
            await SetModuleActiveAsync(ModuleId, true);
            await StoreSeed.CleanupStoreAsync(_f, storeId);
            await DbTestHelpers.CleanupUserAsync(_f, userId);
        }
    }
}
