using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Plans;
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

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// store-birth-superior (2026-10-11, REPLACES store-birth-pago-only) — strict birth invariant:
/// EVERY store created through ANY path lands on plan Superior (3) with EXACTLY the active
/// Superior plan catalog filtered by <c>Module.IsActive &amp;&amp; Module.AvailableToStore</c>.
/// The caller names no modules: <c>POST /v1/stores</c> has no <c>ModuleIds</c> any more.
///
///   BS1  Admin POST /v1/stores births a Superior store whose StoreModule set EQUALS the filtered
///        catalog in DB (exact, both directions) and whose /me exposes the same universe.
///   BS2  The VIP-only module 16 (Múltiples pagos) NEVER appears — it is not a Superior member.
///   BS3  OwnerAdmin creation from a Superior selected store {7, 14, 15}: the child inherits
///        NOTHING — it gets the Superior catalog, which INCLUDES 14 and 15.
/// </summary>
[Collection("e2e")]
public sealed class StoreBirthSuperiorTests
{
    private readonly AppTestFactory _f;
    public StoreBirthSuperiorTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int SuperiorPlanId = (int)StorePlanType.Superior;
    private const int ManagementModuleId = 7;
    private const int StatisticsModuleId = 6;
    private const int MultiStoresModuleId = 14;
    private const int MultiMonedasModuleId = 15;
    private const int MultiPaymentsModuleId = 16; // VIP-only
    private const int MultiStoresFeatureId = 38;
    private const int MultiMonedasFeatureId = 43;

    [Fact]
    public async Task BS1_admin_create_births_superior_with_exactly_the_filtered_catalog_and_me_matches()
    {
        var saLogin = $"sa-bs1-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await SeedOwnerUserAsync();
        Guid created = Guid.Empty;
        try
        {
            // The catalog, read from the SAME tables CreateStoreService derives it from — so the
            // pin stays honest if the catalog ever changes.
            var expectedCatalog = await SuperiorBirthCatalogAsync();
            expectedCatalog.Should().NotBeEmpty("an empty expectation would make set equality vacuous");
            expectedCatalog.Should().NotContain(MultiPaymentsModuleId,
                "precondition: 16 is not a Superior member — BS2 pins that, this keeps BS1 honest");

            // No ModuleIds in the body: the server owns the module set.
            var response = await DbTestHelpers.AuthedClient(_f, adminId, saLogin)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"BS1-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
                store.StorePlanId.Should().Be(SuperiorPlanId);
                store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));

                var activeModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(sm => sm.StoreId == created && sm.IsActive)
                    .Select(sm => sm.ModuleId).ToListAsync();
                activeModuleIds.Should().BeEquivalentTo(expectedCatalog,
                    "the birth module set equals the active Superior catalog (IsActive && AvailableToStore) EXACTLY — " +
                    "nothing extra, nothing missing");
            }

            // Point the owner at the born store, then /me must expose the same universe.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<User>().IgnoreQueryFilters()
                    .Where(u => u.Id == owner.UserId)
                    .ExecuteUpdateAsync(s => s.SetProperty(u => u.SelectedStoreId, (Guid?)created));
            }

            var me = await MeAsync(owner.UserId, owner.Login);
            me.Data!.StoreModuleIds.Should().BeEquivalentTo(expectedCatalog,
                "/me exposes exactly the same universe the store was born with");
            me.Data.PlanType.Should().Be("Paid");
            me.Data.IsInTrial.Should().BeTrue();
            me.Data.Roles.Should().Contain(r => r.StoreId == created && r.ModuleId == StatisticsModuleId);
        }
        finally
        {
            if (created != Guid.Empty)
                await AuthzSeed.CleanupStoreGraphAsync(_f, created, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task BS2_the_vip_only_module_16_is_never_granted_at_birth()
    {
        // Explicit, by id: "16 is not in Superior" asserted on the CREATED store, not on the
        // catalog. A catalog-only assertion would pass vacuously if 16 were ever renamed away.
        var saLogin = $"sa-bs2-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        Guid created = Guid.Empty;
        try
        {
            // Precondition: 16 IS an AvailableToStore catalog member — so its absence below is
            // the PLAN's doing, not the module having been retired from the catalog.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var m16 = await db.Set<Domain.Entities.Modules.Module>().IgnoreQueryFilters()
                    .SingleAsync(m => m.Id == MultiPaymentsModuleId);
                m16.IsActive.Should().BeTrue();
                m16.AvailableToStore.Should().BeTrue();
            }

            var response = await DbTestHelpers.AuthedClient(_f, adminId, saLogin)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"BS2-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                (await db.Set<StoreModule>().IgnoreQueryFilters()
                    .CountAsync(sm => sm.StoreId == created && sm.ModuleId == MultiPaymentsModuleId))
                    .Should().Be(0, "Múltiples pagos (16) is VIP-only — a Superior-born store must never carry it");
                (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                    .CountAsync(srf => srf.StoreId == created
                        && srf.FeatureId != 0
                        && db.Set<Domain.Entities.Features.Feature>().Any(f => f.Id == srf.FeatureId && f.ModuleId == MultiPaymentsModuleId)))
                    .Should().Be(0, "no feature of module 16 may reach the store either");
            }
        }
        finally
        {
            if (created != Guid.Empty)
                await AuthzSeed.CleanupStoreGraphAsync(_f, created, owner.UserId);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task BS3_owner_create_inherits_nothing_and_gets_the_superior_catalog()
    {
        // store-birth-superior: the old clamp-to-Pago inheritance is GONE. A Superior selected
        // store carrying {7, 14, 15} produces a child with the WHOLE Superior catalog — 14 and
        // 15 included, plus every other Superior member the parent never had.
        var seeded = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        Guid created = Guid.Empty;
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                // Elevate the selected store and seed 14 + 15 (MM1 pattern) so the MultiStores
                // gate passes on something that is NOT a Pago member.
                await db.Set<Store>().IgnoreQueryFilters()
                    .Where(s => s.Id == seeded.StoreId)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.StorePlanId, SuperiorPlanId));
                db.Set<StoreModule>().Add(StoreModule.Create(
                    seeded.StoreId, MultiStoresModuleId, price: 5, modulePriceIncluded: false,
                    modulePrice: 5, moduleDiscountPrice: 0, modulePercentDiscountPrice: 50, seeded.TenantId));
                db.Set<StoreModule>().Add(StoreModule.Create(
                    seeded.StoreId, MultiMonedasModuleId, price: 3, modulePriceIncluded: false,
                    modulePrice: 3, moduleDiscountPrice: 0, modulePercentDiscountPrice: 100, seeded.TenantId));
                await db.SaveChangesAsync();
            }

            var create = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync("/api/v1/stores", new
                {
                    OwnerId = Guid.Empty,
                    Name = $"BS3-{Guid.NewGuid():N}",
                    Address = "",
                    Description = "",
                    Approved = true,
                });
            create.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await create.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            var expectedCatalog = await SuperiorBirthCatalogAsync();

            using var scope2 = _f.Services.CreateScope();
            var db2 = scope2.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db2.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
            store.StorePlanId.Should().Be(SuperiorPlanId);

            var childModuleIds = await db2.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == created && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            childModuleIds.Should().BeEquivalentTo(expectedCatalog,
                "the owner branch no longer clamps or inherits: the child is born on the Superior catalog, " +
                "so 14 and 15 DO reach it — that is the whole point of the change");

            (await db2.Set<StoreRoleFeature>().IgnoreQueryFilters().CountAsync(srf =>
                srf.StoreId == created &&
                (srf.FeatureId == MultiStoresFeatureId || srf.FeatureId == MultiMonedasFeatureId)))
                .Should().BeGreaterThan(0, "features 38/43 now flow with the modules they belong to");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /// <summary>
    /// The birth catalog, derived EXACTLY like CreateStoreService derives it: the Superior plan's
    /// members whose Module row is both active and available to stores.
    /// </summary>
    private async Task<List<int>> SuperiorBirthCatalogAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StorePlanModule>().IgnoreQueryFilters()
            .Where(spm => spm.PlanId == SuperiorPlanId
                && spm.Module.IsActive && spm.Module.AvailableToStore)
            .Select(spm => spm.ModuleId)
            .OrderBy(id => id)
            .ToListAsync();
    }

    private sealed record OwnerUserSeed(Guid UserId, string Login, Guid OwnerId);

    private async Task<OwnerUserSeed> SeedOwnerUserAsync()
    {
        // user + owner + OwnerAdmin role, NO store — the store is born via POST /v1/stores.
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"sbs-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E BirthSuperior", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E BirthSuperior owner");
        db.Set<Owner>().Add(owner);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();
        return new OwnerUserSeed(user.Id, login, owner.Id);
    }

    /// <summary>
    /// The POST body as it now exists: store-birth-superior removed <c>ModuleIds</c>, so there is
    /// nothing module-shaped left to send.
    /// </summary>
    private static object Body(Guid ownerId, string name) => new
    {
        OwnerId = ownerId,
        Name = name,
        Address = (string?)null,
        Description = (string?)null,
        Approved = true,
    };

    private async Task<ApiResponse<CurrentUserDto>> MeAsync(Guid userId, string login)
    {
        var response = await DbTestHelpers.AuthedClient(_f, userId, login).GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body;
    }
}