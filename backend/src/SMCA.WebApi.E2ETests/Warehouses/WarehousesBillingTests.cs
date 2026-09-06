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
/// WM-TE4 (spec testing delta): billing interaction of the Warehouses module — a Free store
/// keeps PlanType "Free" while still seeing module 13 and features 36/37 (100% discount,
/// effective price 0), and getMe exposes them to the store's OwnerAdmin.
/// </summary>
[Collection("e2e")]
public sealed class WarehousesBillingTests
{
    private readonly AppTestFactory _f;
    public WarehousesBillingTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Free_store_keeps_free_plan_and_sees_warehouses_module()
    {
        // WMC-4a / WM-TE4: free store (PaymentStartDate=null) + assigned module 13 →
        // PlanType stays "Free" (BillingService line 58: PaymentStartDate is null wins) and
        // getMe exposes module 13 + features 36/37 to the OwnerAdmin.
        var seeded = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            // Assign ONLY the warehouses module (paid, 100% discount) to the free store,
            // mimicking the migration's per-store insert, and select the store for the user.
            await AssignWarehousesModuleAsync(seeded.StoreId, seeded.TenantId, seeded.UserId);

            var login = await _f.CreateClient().PostAsJsonAsync("/api/v1/auth/login", new
            {
                Login = seeded.Login,
                Password = "Password123",
                StoreId = seeded.StoreId,
            });
            login.StatusCode.Should().Be(HttpStatusCode.OK);
            var auth = await login.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            auth!.Succeeded.Should().BeTrue();

            var me = await MeAsync(AuthTestHelpers.BearerClient(_f, auth.Data!.AuthToken));

            me.Data!.PlanType.Should().Be("Free",
                "PaymentStartDate is null — a paid module row alone does not flip the plan");
            me.Data.StoreModuleIds.Should().Contain(13);
            me.Data.FeatureIds.Should().Contain(36);
            me.Data.FeatureIds.Should().Contain(37);
        }
        finally { await BillingSeed.CleanupAsync(_f, seeded); }
    }

    private async Task AssignWarehousesModuleAsync(Guid storeId, Guid tenantId, Guid userId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<StoreModule>().Add(StoreModule.Create(storeId, 13, 2, false, 2, 0, 100, tenantId));
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(storeId, 2, 36, tenantId));
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(storeId, 2, 37, tenantId));
        // getMe resolves everything from user.SelectedStoreId — set it (SeedFreeStoreAsync does not).
        var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters().AsTracking()
            .FirstAsync(u => u.Id == userId);
        user.SelectedStoreId = storeId;
        await db.SaveChangesAsync();
    }

    private static async Task<ApiResponse<CurrentUserDto>> MeAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body;
    }
}
