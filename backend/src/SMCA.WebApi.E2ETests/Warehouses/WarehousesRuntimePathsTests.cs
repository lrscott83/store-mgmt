using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Application.Dtos.Authentication;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Warehouses;

/// <summary>
/// WM-TE3 (spec warehouses-module-assignment): runtime paths assign the Warehouses module
/// and its OwnerAdmin features with no code change — self-registration and the plan toggle.
/// </summary>
[Collection("e2e")]
public sealed class WarehousesRuntimePathsTests
{
    private static readonly int[] WarehouseFeatureIds = [36, 37];
    private readonly AppTestFactory _f;
    public WarehousesRuntimePathsTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Register_assigns_warehouses_module_and_owner_features()
    {
        // WMA-3a: self-registration assigns ALL available modules — module 13 must land on the store
        // with OwnerAdmin features 36/37.
        var login = $"wh-reg-{Guid.NewGuid():N}@test.com";
        Guid tenantId = Guid.Empty;
        try
        {
            var response = await _f.CreateClient().PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = "E2E WH Register",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = $"WH-Reg-Store-{Guid.NewGuid():N}",
                Code = (string?)null,
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters()
                .AsNoTracking().FirstAsync(s => s.Name.StartsWith("WH-Reg-Store"));
            tenantId = store.TenantId;

            var sm = await db.Set<StoreModule>().IgnoreQueryFilters()
                .AsNoTracking().FirstOrDefaultAsync(x => x.StoreId == store.Id && x.ModuleId == 13);
            sm.Should().NotBeNull("AvailableToStore=true modules are auto-assigned at registration");
            sm!.IsActive.Should().BeTrue();

            var srfs = await db.Set<StoreRoleFeature>().IgnoreQueryFilters().AsNoTracking()
                .Where(x => x.StoreId == store.Id && WarehouseFeatureIds.Contains(x.FeatureId)).ToListAsync();
            srfs.Should().HaveCount(2);
            srfs.Should().OnlyContain(s => s.RoleId == 2); // OwnerAdmin
        }
        finally
        {
            if (tenantId == Guid.Empty)
            {
                var created = await DbTestHelpers.GetUserByLoginAsync(_f, login);
                if (created is not null) tenantId = created.TenantId;
            }
            if (tenantId != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
        }
    }

    [Fact]
    public async Task Toggle_paid_to_free_deactivates_warehouses_module_and_features()
    {
        // WMA-3c: module 13 is PriceIncluded=false, so Paid->Free must deactivate its
        // StoreModule row and OwnerAdmin StoreRoleFeatures, like every other paid module.
        var adminLogin = $"sa-wh-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var seeded = await BillingSeed.SeedPaidStoreAsync(_f, DateOnly.FromDateTime(DateTime.UtcNow));
        try
        {
            // Give the paid store the warehouses module + owner features, mimicking the migration insert.
            await AssignWarehousesModuleAsync(seeded.StoreId, seeded.TenantId);

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var sm = await db.Set<StoreModule>().IgnoreQueryFilters().AsTracking()
                    .FirstAsync(x => x.StoreId == seeded.StoreId && x.ModuleId == 13);
                sm.IsActive.Should().BeTrue("precondition: module 13 active before the toggle");
            }

            var client = DbTestHelpers.AuthedClient(_f, admin, adminLogin);
            var response = await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/toggle-plan", content: null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            using var scope2 = _f.Services.CreateScope();
            var db2 = scope2.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var smAfter = await db2.Set<StoreModule>().IgnoreQueryFilters().AsTracking()
                .FirstAsync(x => x.StoreId == seeded.StoreId && x.ModuleId == 13);
            smAfter.IsActive.Should().BeFalse("Paid->Free deactivates paid modules");

            var srfs = await db2.Set<StoreRoleFeature>().IgnoreQueryFilters().AsTracking()
                .Where(x => x.StoreId == seeded.StoreId && WarehouseFeatureIds.Contains(x.FeatureId)).ToListAsync();
            srfs.Should().NotBeEmpty();
            srfs.Should().OnlyContain(s => !s.IsActive, "features of deactivated modules go inactive");
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, seeded);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    private async Task AssignWarehousesModuleAsync(Guid storeId, Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreModule>().Add(StoreModule.Create(storeId, 13, 2, false, 2, 0, 100, tenantId));
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(storeId, 2, 36, tenantId));
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(storeId, 2, 37, tenantId));
        await db.SaveChangesAsync();
    }
}
