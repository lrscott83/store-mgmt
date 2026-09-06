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
/// WMA-3b (spec warehouses-module-assignment): the admin store-creation path
/// (POST /api/v1/stores -> CreateStoreService) assigns module 13 and generates
/// OwnerAdmin features 36/37 when the module is requested.
/// </summary>
[Collection("e2e")]
public sealed class WarehousesCreateStoreTests
{
    private static readonly int[] WarehouseFeatureIds = [36, 37];
    private readonly AppTestFactory _f;
    public WarehousesCreateStoreTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Admin_create_store_with_warehouses_module_assigns_owner_features()
    {
        var adminLogin = $"sa-wc-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var owner = await SeedOwnerAsync();
        Guid? storeId = null;
        try
        {
            var name = $"WH-Admin-Store-{Guid.NewGuid():N}";
            var response = await DbTestHelpers.AuthedClient(_f, admin, adminLogin).PostAsJsonAsync("/api/v1/stores", new
            {
                OwnerId = owner.OwnerId,
                Name = name,
                Address = (string?)null,
                Description = (string?)null,
                Approved = true,
                ModuleIds = new[] { 13 },
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await response.Content.ReadFromJsonAsync<ApiResponse<StoreDto>>(ApiResponse.Json);
            created!.Succeeded.Should().BeTrue();
            storeId = created.Data!.Id;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var sm = await db.Set<StoreModule>().IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(x => x.StoreId == storeId && x.ModuleId == 13);
            sm.Should().NotBeNull("module 13 was explicitly requested at creation");
            sm!.ModulePrice.Should().Be(2f);
            sm.ModulePercentDiscountPrice.Should().Be(100f);
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
