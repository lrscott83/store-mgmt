using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Application.Dtos.StoreManagement;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Warehouses;

/// <summary>
/// WMA-3b (spec warehouses-module-assignment): module 13 with OwnerAdmin features 36/37.
/// Strict birth invariant (2026-09-25, store-birth-pago-only): the CREATION path can no
/// longer grant 13 (Superior/VIP-only → 400); the module is granted through the SuperAdmin
/// change-plan path to Superior, which assigns it with the catalog price snapshot and
/// generates the owner features through the same runtime chain.
/// </summary>
[Collection("e2e")]
public sealed class WarehousesCreateStoreTests
{
    private static readonly int[] WarehouseFeatureIds = [36, 37];
    private readonly AppTestFactory _f;
    public WarehousesCreateStoreTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Admin_superior_plan_change_assigns_warehouses_module_and_owner_features()
    {
        // Strict birth invariant (2026-09-25, store-birth-pago-only): Warehouses (13) is
        // Superior/VIP-only and can NO LONGER be requested at creation (→ 400). The module is
        // granted on the SuperAdmin change-plan to Superior — the same plan-change runtime
        // chain that MM2/EM2 pin — with the catalog price snapshot and OwnerAdmin features.
        var adminLogin = $"sa-wc-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var owner = await SeedOwnerAsync();
        Guid? storeId = null;
        try
        {
            var name = $"WH-Admin-Store-{Guid.NewGuid():N}";
            var client = DbTestHelpers.AuthedClient(_f, admin, adminLogin);
            // 1) Birth on Pago with a Pago member only — 13 is not requestable.
            var response = await client.PostAsJsonAsync("/api/v1/stores", new
            {
                OwnerId = owner.OwnerId,
                Name = name,
                Address = (string?)null,
                Description = (string?)null,
                Approved = true,
                ModuleIds = new[] { 7 },
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await response.Content.ReadFromJsonAsync<ApiResponse<StoreDto>>(ApiResponse.Json);
            created!.Succeeded.Should().BeTrue();
            storeId = created.Data!.Id;

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                (await db.Set<StoreModule>().IgnoreQueryFilters().AnyAsync(x => x.StoreId == storeId && x.ModuleId == 13))
                    .Should().BeFalse("a Pago-born store has no Warehouses (13) before the plan change");
            }

            // 2) SuperAdmin elevates to Superior: 13 joins the module set with catalog values.
            var flip = await client.PostAsJsonAsync(
                $"/api/v1/stores/{storeId}/change-plan", new { storePlanId = 3 /* Superior */ });
            flip.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope2 = _f.Services.CreateScope();
            var db2 = scope2.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var sm = await db2.Set<StoreModule>().IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(x => x.StoreId == storeId && x.ModuleId == 13);
            sm.Should().NotBeNull("module 13 joins the store with the Superior plan");
            sm!.ModulePrice.Should().Be(5f);
            sm.ModulePercentDiscountPrice.Should().Be(50f);
            sm.ModulePriceIncluded.Should().BeFalse();
            sm.IsActive.Should().BeTrue();

            var srfs = await db2.Set<StoreRoleFeature>().IgnoreQueryFilters().AsNoTracking()
                .Where(x => x.StoreId == storeId && WarehouseFeatureIds.Contains(x.FeatureId)).ToListAsync();
            srfs.Should().HaveCount(2);
            srfs.Should().OnlyContain(s => s.RoleId == 2); // OwnerAdmin
        }
        finally
        {
            if (storeId is Guid sid)
                await AuthzSeed.CleanupStoreGraphAsync(_f, sid, owner.OwnerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    private async Task<(Guid OwnerId, Guid OwnerUserId)> SeedOwnerAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"owc-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E WH Create", "0000000000", login, Domain.Common.Constants.DataUtils.DefaultTenant.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, Domain.Common.Constants.DataUtils.DefaultTenant.Id, "E2E WH Create owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        return (owner.Id, user.Id);
    }
}
