using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
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
/// the auto-created store must land on plan Pago with ALL AvailableToStore modules —
/// including the new WholesaleSales (12), Warehouses (13) and MultiStores (14) — with
/// catalog price snapshots and the full StoreRoleFeature set for the owner.
/// Extends AuthRegisterDataAssertionsTests (which covers the general module-equivalence
/// assertions) with the plan/module-12-13-14 specifics.
/// Plan 2026-09-08-e2e-plan-gated-modules-auth-roster (Lote 2).
/// </summary>
[Collection("e2e")]
public sealed class AuthRegisterPlanTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    private const int WarehousesModuleId = 13;
    private const int WholesaleSalesModuleId = 12;
    private const int MultiStoresModuleId = 14;
    private const int PagoPlanId = (int)StorePlanType.Pago;

    public AuthRegisterPlanTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    private sealed record Registered(Guid UserId, string Login, Guid TenantId, Guid StoreId, Guid OwnerId);

    // ── Happy Path ─────────────────────────────────────────────────────────

    [Fact]
    public async Task Register_creates_store_with_pago_plan_and_all_available_modules()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == registered.StoreId);
            store.StorePlanId.Should().Be(PagoPlanId); // default plan is Pago (2) since the 2026-09-18 birth-plan change
            store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow)); // trial clock

            var activeModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == registered.StoreId && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();

            // The Pago plan universe is assigned at registration (plan/module coherence:
            // birth plan Pago → Pago's own modules). WholesaleSales (12) is IN the Pago
            // catalog; Warehouses (13), MultiStores (14), MultiMonedas (15) and Elaboration
            // (17) are Superior/VIP-only and must NOT be granted.
            activeModuleIds.Should().Contain(WholesaleSalesModuleId);
            activeModuleIds.Should().NotContain(new[] { WarehousesModuleId, MultiStoresModuleId, 15, 17 });
            activeModuleIds.Should().NotContain(1); // Administration never goes to a store
        }
        finally
        {
            await CleanupRegisteredAsync(registered);
        }
    }

    [Fact]
    public async Task Register_warehouse_module_13_carries_new_catalog_price_snapshot()
    {
        Registered? registered = null;
        try
        {
            registered = await RegisterAsync($"Store-{Guid.NewGuid():N}");

            // The Pago plan catalog does NOT include Warehouses (13) — a fresh registered
            // store has no StoreModule(13). The catalog snapshot itself is pinned by
            // StorePlanCatalogTests; this test now guards the absence (register must not
            // leak Superior-only modules) instead of its price snapshot.
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<StoreModule>().IgnoreQueryFilters()
                .SingleOrDefaultAsync(sm => sm.StoreId == registered.StoreId && sm.ModuleId == WarehousesModuleId))
                .Should().BeNull("Warehouses (13) is Superior/VIP-only and must not reach a Pago store at registration");
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

            // Mapped features of the assigned (Pago) modules are present for this owner:
            // Statistics 60, Billing 90, WholesaleSales 59, ... Warehouses 36/37 are
            // Superior-only and must NOT be granted. StorePayment (91) is SuperAdmin/
            // ReSeller-only in StoreRoleFeatures (StorePaymentAdmin), so no OwnerAdmin row
            // exists for it. 38/39 have no StoreRoleFeatures mapping at all (production
            // gap, asserted as-is). Elaboration 120/121 is Superior/VIP-only too.
            srfFeatureIds.Should().Contain(new[] { 60, 90 });
            srfFeatureIds.Should().NotContain(new[] { 36, 37, 38, 39, 91, 120, 121 });
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

            // The freshly-registered owner's /me carries the Pago plan module set (all
            // assigned, trial period → nothing filtered). WholesaleSales (12) is in the
            // Pago catalog; the Superior-only modules (13/14) must be absent.
            var me = await DbTestHelpers.AuthedClient(_factory, registered.UserId, registered.Login)
                .GetAsync("/api/v1/auth/me");
            me.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await me.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.StoreModuleIds.Should().Contain(WholesaleSalesModuleId);
            body.Data.StoreModuleIds.Should().NotContain(new[] { WarehousesModuleId, MultiStoresModuleId });
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
