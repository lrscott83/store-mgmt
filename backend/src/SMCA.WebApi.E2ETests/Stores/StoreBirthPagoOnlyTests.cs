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
/// store-birth-pago-only (2026-09-25) — strict birth invariant: EVERY store created through
/// ANY path lands with EXACTLY the active Pago plan catalog modules (2..11); Superior/VIP-only
/// members (12..17) are never born into a new store.
///
///   BP1  Admin POST /v1/stores rejects ANY Superior/VIP-only member (12..17) with 400
///        (ModuleIds / ModuleNotAvailableForPagoPlan) and persists nothing.
///   BP2  Admin POST with the FULL Pago catalog births a store whose active StoreModule set
///        EQUALS the catalog in DB (exact), lands on Pago with the trial clock, and /me as
///        the owner exposes the exact same universe (StoreModuleIds) — no Superior/VIP-only
///        feature, paid plan + trial flags.
///   BP3  OwnerAdmin creation from a Superior selected store {7, 14, 15}: the child inherits
///        ONLY the Pago-catalog member (7) — 14/15 and features 38/43 never reach it.
/// </summary>
[Collection("e2e")]
public sealed class StoreBirthPagoOnlyTests
{
    private readonly AppTestFactory _f;
    public StoreBirthPagoOnlyTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const int PagoPlanId = (int)StorePlanType.Pago;
    private const int SuperiorPlanId = (int)StorePlanType.Superior;
    private const int ManagementModuleId = 7;
    private const int StatisticsModuleId = 6;
    private const int MultiStoresModuleId = 14;
    private const int MultiMonedasModuleId = 15;
    private const int MultiStoresFeatureId = 38;
    private const int MultiMonedasFeatureId = 43;
    private static readonly int[] SuperiorVipOnlyFeatureIds = [36, 37, 38, 39, 43, 120, 121];

    [Theory]
    [InlineData(12)] // WholesaleSales
    [InlineData(13)] // Warehouses
    [InlineData(14)] // MultiStores
    [InlineData(15)] // MultiMonedas
    [InlineData(16)] // Billing (marketing suite)
    [InlineData(17)] // Elaboration
    public async Task BP1_admin_create_store_rejects_superior_vip_only_module(int moduleId)
    {
        var login = $"sa-bp1-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"BP1-{Guid.NewGuid():N}",
                    new[] { ManagementModuleId, moduleId }));
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                $"a Pago-born store can never carry the Superior/VIP-only module {moduleId}");

            var b = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "ModuleIds");

            // No store may be left behind by the rejected request.
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.OwnerId == owner.OwnerId))
                .Should().BeFalse("the rejected create must not persist any store");
        }
        finally
        {
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task BP2_admin_full_pago_catalog_birth_matches_db_and_me()
    {
        var saLogin = $"sa-bp2-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await SeedOwnerUserAsync();
        Guid created = Guid.Empty;
        try
        {
            List<int> pagoPlanModuleIds;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                pagoPlanModuleIds = await db.Set<StorePlanModule>().IgnoreQueryFilters()
                    .Where(spm => spm.PlanId == PagoPlanId)
                    .Select(spm => spm.ModuleId).OrderBy(m => m).ToListAsync();
                pagoPlanModuleIds.Should().HaveCount(10);
            }

            var response = await DbTestHelpers.AuthedClient(_f, adminId, saLogin)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"BP2-{Guid.NewGuid():N}", pagoPlanModuleIds.ToArray()));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == created);
                store.StorePlanId.Should().Be(PagoPlanId);
                store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));

                var activeModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(sm => sm.StoreId == created && sm.IsActive)
                    .Select(sm => sm.ModuleId).ToListAsync();
                activeModuleIds.Should().BeEquivalentTo(pagoPlanModuleIds,
                    "the birth module set equals the active Pago plan catalog exactly");
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
            me.Data!.StoreModuleIds.Should().BeEquivalentTo(pagoPlanModuleIds,
                "/me exposes exactly the Pago catalog on a Pago-born store");
            me.Data.PlanType.Should().Be("Paid");
            me.Data.IsInTrial.Should().BeTrue();
            me.Data.FeatureIds.Should().NotContain(SuperiorVipOnlyFeatureIds);
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
    public async Task BP3_owner_create_clamps_inheritance_to_pago_catalog()
    {
        var seeded = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        Guid created = Guid.Empty;
        try
        {
            // Elevate the selected store to Superior and seed 14 + 15 (MM1 pattern): the
            // owner-branch gate still passes on 14, but the child receives ONLY the Pago member.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
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

            var body = new
            {
                OwnerId = Guid.Empty,
                Name = $"BP3-{Guid.NewGuid():N}",
                Address = "",
                Description = "",
                Approved = true,
                ModuleIds = Array.Empty<int>(), // ignored for OwnerAdmin: modules inherit
            };
            var create = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync("/api/v1/stores", body);
            create.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await create.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            using var scope2 = _f.Services.CreateScope();
            var db2 = scope2.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var childModuleIds = await db2.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == created && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            childModuleIds.Should().BeEquivalentTo(new[] { ManagementModuleId },
                "the child inherits ONLY the Pago-catalog member (7); 14/15 are Superior/VIP-only");
            (await db2.Set<StoreModule>().IgnoreQueryFilters().CountAsync(sm =>
                sm.StoreId == created && (sm.ModuleId == MultiStoresModuleId || sm.ModuleId == MultiMonedasModuleId)))
                .Should().Be(0);
            (await db2.Set<StoreRoleFeature>().IgnoreQueryFilters().CountAsync(srf =>
                srf.StoreId == created &&
                (srf.FeatureId == MultiStoresFeatureId || srf.FeatureId == MultiMonedasFeatureId)))
                .Should().Be(0, "features 38/43 must not be granted to the child");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private sealed record OwnerUserSeed(Guid UserId, string Login, Guid OwnerId);

    private async Task<OwnerUserSeed> SeedOwnerUserAsync()
    {
        // user + owner + OwnerAdmin role, NO store — the store is born via POST /v1/stores.
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"sbp-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E BirthPago", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E BirthPago owner");
        db.Set<Owner>().Add(owner);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();
        return new OwnerUserSeed(user.Id, login, owner.Id);
    }

    private static object Body(Guid ownerId, string name, int[] moduleIds) => new
    {
        OwnerId = ownerId,
        Name = name,
        Address = (string?)null,
        Description = (string?)null,
        Approved = true,
        ModuleIds = moduleIds,
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