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
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// E2E tests for the plan dimension of self-registration (<c>POST /api/v1/auth/register</c>):
/// the auto-created store must land on plan Superior with the Superior catalog modules (filtered
/// by <c>Module.IsActive &amp;&amp; Module.AvailableToStore</c>), their catalog price snapshots, plus the
/// mapped StoreRoleFeatures (store-birth-superior, 2026-10-11 — replaces the Pago default).
/// A Superior-born store therefore DOES carry WholesaleSales (12), Warehouses (13), MultiStores
/// (14), MultiMonedas (15) and Elaboration (17); it never carries the VIP-only MultiPayments (16),
/// nor Administration (1), which is not AvailableToStore.
/// Extends AuthRegisterDataAssertionsTests (which covers the general module-equivalence
/// assertions).
/// </summary>
[Collection("e2e")]
public sealed class AuthRegisterPlanTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    private const int WarehousesModuleId = 13;
    private const int WholesaleSalesModuleId = 12;
    private const int MultiStoresModuleId = 14;
    private const int MultiPaymentsModuleId = 16; // VIP-only
    private const int AdministrationModuleId = 1; // not AvailableToStore
    private const int SuperiorPlanId = (int)StorePlanType.Superior;

    public AuthRegisterPlanTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    private sealed record Registered(Guid UserId, string Login, Guid TenantId, Guid StoreId, Guid OwnerId);

    // ── Happy Path ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Register_creates_store_with_superior_plan_and_all_available_modules()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == registered.StoreId);
            store.StorePlanId.Should().Be(SuperiorPlanId); // store-birth-superior (2026-10-11)
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow)); // trial clock

            // The birth catalog, derived EXACTLY like CreateStoreService derives it.
            var expectedModuleIds = await db.Set<StorePlanModule>().AsNoTracking()
                .Where(spm => spm.PlanId == SuperiorPlanId && spm.Module.IsActive && spm.Module.AvailableToStore)
                .Select(spm => spm.ModuleId)
                .ToListAsync();
            expectedModuleIds.Should().NotBeEmpty();

            var activeModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == registered.StoreId && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();

            activeModuleIds.Should().BeEquivalentTo(expectedModuleIds);
            // Superior members now DO reach a fresh store; the exclusions are the VIP-only
            // module 16 and Administration (1), which is not AvailableToStore.
            activeModuleIds.Should().Contain(new[] { WholesaleSalesModuleId, WarehousesModuleId, MultiStoresModuleId, 15, 17 });
            activeModuleIds.Should().NotContain(new[] { AdministrationModuleId, MultiPaymentsModuleId });
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_warehouse_module_13_carries_catalog_price_snapshot()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            // Warehouses (13) is a Superior member: a fresh registered store carries it with the
            // catalog price snapshot CreateStoreService writes (Price/ModulePrice from Module.Price,
            // ModuleDiscountPrice/ModulePercentDiscountPrice from the Module discount columns).
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var birthModule = await db.Set<StoreModule>().IgnoreQueryFilters().AsNoTracking()
                .SingleOrDefaultAsync(sm => sm.StoreId == registered.StoreId && sm.ModuleId == WarehousesModuleId);
            birthModule.Should().NotBeNull("Warehouses (13) is a Superior member");

            var catalog = await db.Set<Domain.Entities.Modules.Module>().IgnoreQueryFilters().AsNoTracking()
                .SingleAsync(m => m.Id == WarehousesModuleId);
            birthModule!.Price.Should().Be(catalog.Price);
            birthModule.ModulePrice.Should().Be(catalog.Price);
            birthModule.ModulePriceIncluded.Should().Be(catalog.PriceIncluded);
            birthModule.ModuleDiscountPrice.Should().Be(catalog.DiscountPrice);
            birthModule.ModulePercentDiscountPrice.Should().Be(catalog.PercentDiscountPrice);
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_generates_store_role_features_for_mapped_plan_features()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var srfFeatureIds = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == registered.StoreId && srf.IsActive)
                .Select(srf => srf.FeatureId).Distinct().ToListAsync();

            // Mapped features of the assigned (Superior) modules are present for this owner:
            // Statistics 60, Billing 90, plus the features of the Superior-only members now
            // granted — Warehouses 36/37, MultiStores 38, WholesaleSales 39, Elaboration
            // 120/121. StorePayment (91) is SuperAdmin/ReSeller-only in StoreRoleFeatures
            // (StorePaymentAdmin), so no OwnerAdmin row exists for it.
            srfFeatureIds.Should().Contain(new[] { 36, 37, 38, 39, 60, 90, 120, 121 });
            srfFeatureIds.Should().NotContain(91);
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_owner_me_shows_full_plan_module_set()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            // The freshly-registered owner's /me carries the Superior plan module set (all
            // assigned, trial period → nothing filtered). The Superior-only modules (12/13/14)
            // are present; the VIP-only module 16 and Administration (1) are never present.
            var me = await DbTestHelpers.AuthedClient(_factory, registered.UserId, registered.Login)
                .GetAsync("/api/v1/auth/me");
            me.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await me.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.StoreModuleIds.Should().Contain(new[] { WholesaleSalesModuleId, WarehousesModuleId, MultiStoresModuleId });
            body.Data.StoreModuleIds.Should().NotContain(new[] { AdministrationModuleId, MultiPaymentsModuleId });
            body.Data.PlanType.Should().Be("Paid");
            body.Data.IsInTrial.Should().BeTrue(); // billable amount > 0 (paid modules at catalog price)
            body.Data.PaymentStatus.Should().Be("AlDia");
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private async Task<Registered> RegisterAsync(string storeName)
    {
        var login = $"regplan-{Guid.NewGuid():N}@test.com";
        var response = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Login = login,
            Password = "Password123",
            FullName = "E2E Owner",
            CellPhone = "0000000000",
            Email = (string?)null,
            StoreName = storeName,
            Code = (string?)null
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();

        var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
        user.Should().NotBeNull();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var owner = await db.Set<Owner>().IgnoreQueryFilters()
            .SingleOrDefaultAsync(o => o.UserId == user!.Id);
        owner.Should().NotBeNull();
        var store = await db.Set<Store>().IgnoreQueryFilters()
            .SingleOrDefaultAsync(s => s.TenantId == user!.TenantId);
        store.Should().NotBeNull();

        return new Registered(user!.Id, login, user!.TenantId, store!.Id, owner!.Id);
    }

    private async Task CleanupRegisteredAsync(Registered? registered)
    {
        if (registered is null) return;
        if (registered.TenantId != Guid.Empty)
            await DbTestHelpers.CleanupTenantCascadeAsync(_factory, registered.TenantId);
    }
}
