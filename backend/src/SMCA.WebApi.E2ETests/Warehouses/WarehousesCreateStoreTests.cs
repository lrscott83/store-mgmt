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
///
/// store-birth-superior (2026-10-11, replaces store-birth-pago-only): Warehouses (13) IS a
/// Superior member, so a store born through POST /v1/stores already carries it — with the catalog
/// price snapshot and the OwnerAdmin features, through the SAME runtime chain the plan-change path
/// used (no cherry-picking). The old "create on Pago, then flip to Superior to obtain 13" sequence
/// no longer has a first step: the birth ALREADY is the Superior plan.
/// </summary>
[Collection("e2e")]
public sealed class WarehousesCreateStoreTests
{
    private static readonly int[] WarehouseFeatureIds = [36, 37];
    private readonly AppTestFactory _f;
    public WarehousesCreateStoreTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Admin_created_store_is_born_with_the_warehouses_module_and_owner_features()
    {
        var adminLogin = $"sa-wc-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var owner = await SeedOwnerAsync();
        Guid? storeId = null;
        try
        {
            var name = $"WH-Admin-Store-{Guid.NewGuid():N}";
            var client = DbTestHelpers.AuthedClient(_f, admin, adminLogin);
            // No ModuleIds: the birth module set is the Superior plan catalog.
            var response = await client.PostAsJsonAsync("/api/v1/stores", new
            {
                OwnerId = owner.OwnerId,
                Name = name,
                Address = (string?)null,
                Description = (string?)null,
                Approved = true,
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await response.Content.ReadFromJsonAsync<ApiResponse<StoreDto>>(ApiResponse.Json);
            created!.Succeeded.Should().BeTrue();
            storeId = created.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var sm = await db.Set<StoreModule>().IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(x => x.StoreId == storeId && x.ModuleId == 13);
            sm.Should().NotBeNull("module 13 is a Superior member and is granted at birth");
            sm!.ModulePrice.Should().Be(5f);
            sm.ModulePercentDiscountPrice.Should().Be(50f);
            sm.ModulePriceIncluded.Should().BeFalse();
            sm.IsActive.Should().BeTrue();

            var srfs = await db.Set<StoreRoleFeature>().IgnoreQueryFilters().AsNoTracking()
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