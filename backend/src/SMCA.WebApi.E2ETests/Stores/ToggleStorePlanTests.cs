using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E tests for the atomic plan toggle (<c>POST /api/v1/stores/{id}/toggle-plan</c>):
/// both directions mutate PaymentStartDate + paid StoreModules + their StoreRoleFeatures
/// against real PostgreSQL; ReSeller may toggle owned stores, OwnerAdmin is denied;
/// preconditions (store active, owner user active) return 400. Also proves billing
/// delta R8/R12 through the GET DTOs (null PaymentStartDate after Paid→Free, today's
/// date after Free→Paid).
/// </summary>
[Collection("e2e")]
public sealed class ToggleStorePlanTests
{
    private readonly AppTestFactory _f;
    public ToggleStorePlanTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed class StoreData
    {
        public DateOnly? PaymentStartDate { get; set; }
    }

    private sealed class PlanData
    {
        public Guid StoreId { get; set; }
        public DateOnly? PaymentStartDate { get; set; }
        public List<ModuleData> Modules { get; set; } = new();
    }

    private sealed class ModuleData
    {
        public int Id { get; set; }
    }

    private static DateOnly Today() => DateOnly.FromDateTime(DateTime.UtcNow);

    /// <summary>Paid module ids exactly as the handler resolves them (GetAvailableModulesToStore minus PriceIncluded).</summary>
    private async Task<List<int>> PaidCatalogModuleIdsAsync()
    {
        using var scope = _f.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IModuleRepository>();
        return (await repo.GetAvailableModulesToStore()).Where(m => !m.PriceIncluded).Select(m => m.Id).ToList();
    }

    /// <summary>Feature ids of the paid catalog modules, same resolution the handler uses (GetAvailableFeatureIdsByModuleIdsAsync).</summary>
    private async Task<List<int>> PaidCatalogFeatureIdsAsync(List<int> paidModuleIds)
    {
        using var scope = _f.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IFeatureRepository>();
        return await repo.GetAvailableFeatureIdsByModuleIdsAsync(paidModuleIds);
    }

    private async Task<Store> LoadStoreAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Store>().IgnoreQueryFilters().FirstAsync(s => s.Id == storeId);
    }

    private async Task<List<StoreModule>> LoadStoreModulesAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreModule>().IgnoreQueryFilters().Where(sm => sm.StoreId == storeId).ToListAsync();
    }

    private async Task<int> CountActiveRoleFeaturesAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .CountAsync(srf => srf.StoreId == storeId && srf.IsActive);
    }

    private async Task DeactivateUserAsync(Guid userId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        // ExecuteUpdateAsync bypasses the NoTracking trap (CLAUDE.md gotcha) — same
        // approach DbTestHelpers.DeactivateOwnerByUserIdAsync documents.
        await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false));
    }

    // ── Free → Paid ─────────────────────────────────────────────────────────

    [Fact]
    public async Task SuperAdmin_toggles_free_store_to_paid()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsync($"/api/v1/stores/{fx.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();

            // PaymentStartDate set to today; ALL paid catalog modules activated;
            // the free Management module stays active.
            var store = await LoadStoreAsync(fx.StoreId);
            store.PaymentStartDate.Should().Be(Today());

            var paidCatalogIds = await PaidCatalogModuleIdsAsync();
            paidCatalogIds.Should().NotBeEmpty("the seed catalog must contain paid modules");

            var storeModules = await LoadStoreModulesAsync(fx.StoreId);
            storeModules.Where(sm => paidCatalogIds.Contains(sm.ModuleId))
                .Should().OnlyContain(sm => sm.IsActive);
            storeModules.Count(sm => paidCatalogIds.Contains(sm.ModuleId))
                .Should().Be(paidCatalogIds.Count);
            storeModules.Single(sm => sm.ModuleId == BillingSeed.ManagementModuleId).IsActive.Should().BeTrue();

            // R12 (Free→Paid): the store DTO reflects today.
            var dto = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetFromJsonAsync<ApiResponse<StoreData>>($"/api/v1/stores/{fx.StoreId}", ApiResponse.Json);
            dto!.Data!.PaymentStartDate.Should().Be(Today());
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    // ── Paid → Free (R8/R12) ────────────────────────────────────────────────

    [Fact]
    public async Task SuperAdmin_toggles_paid_store_to_free()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedPaidStoreAsync(_f, new DateOnly(2026, 3, 10));
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsync($"/api/v1/stores/{fx.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();

            // R8: PaymentStartDate nullified; paid module soft-deleted; free module untouched.
            var store = await LoadStoreAsync(fx.StoreId);
            store.PaymentStartDate.Should().BeNull();

            var storeModules = await LoadStoreModulesAsync(fx.StoreId);
            storeModules.Single(sm => sm.ModuleId == BillingSeed.StatisticsModuleId).IsActive.Should().BeFalse();
            storeModules.Single(sm => sm.ModuleId == BillingSeed.ManagementModuleId).IsActive.Should().BeTrue();

            // R12 (Paid→Free): store DTO shows null; the plan GET shows null + free module only.
            var dto = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetFromJsonAsync<ApiResponse<StoreData>>($"/api/v1/stores/{fx.StoreId}", ApiResponse.Json);
            dto!.Data!.PaymentStartDate.Should().BeNull();

            var plan = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetFromJsonAsync<ApiResponse<PlanData>>($"/api/v1/stores/{fx.StoreId}/plan", ApiResponse.Json);
            plan!.Data!.PaymentStartDate.Should().BeNull();
            plan.Data.Modules.Select(m => m.Id).Should().Equal(BillingSeed.ManagementModuleId);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    // ── Round trip: reactivation without duplicates ────────────────────────

    [Fact]
    public async Task SuperAdmin_round_trip_reactivates_modules_without_duplicates()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var url = $"/api/v1/stores/{fx.StoreId}/toggle-plan";

            // Leg 1: Free → Paid inserts paid modules + generates their StoreRoleFeatures.
            (await client.PostAsync(url, null)).StatusCode.Should().Be(HttpStatusCode.OK);
            var activeAfterPaid = await CountActiveRoleFeaturesAsync(fx.StoreId);
            activeAfterPaid.Should().BeGreaterThan(0, "Free→Paid must generate StoreRoleFeatures for paid modules");

            // Leg 2: Paid → Free soft-deletes modules and deactivates their features.
            (await client.PostAsync(url, null)).StatusCode.Should().Be(HttpStatusCode.OK);
            (await LoadStoreAsync(fx.StoreId)).PaymentStartDate.Should().BeNull();
            (await CountActiveRoleFeaturesAsync(fx.StoreId)).Should().Be(0);

            // Leg 3: Free → Paid reactivates the SAME rows (no duplicates) and their features.
            (await client.PostAsync(url, null)).StatusCode.Should().Be(HttpStatusCode.OK);
            (await LoadStoreAsync(fx.StoreId)).PaymentStartDate.Should().Be(Today());

            var paidCatalogIds = await PaidCatalogModuleIdsAsync();
            var storeModules = await LoadStoreModulesAsync(fx.StoreId);
            storeModules.Where(sm => paidCatalogIds.Contains(sm.ModuleId))
                .Should().OnlyContain(sm => sm.IsActive);
            storeModules.Where(sm => paidCatalogIds.Contains(sm.ModuleId))
                .GroupBy(sm => sm.ModuleId)
                .Should().OnlyContain(g => g.Count() == 1, "reactivation must not duplicate StoreModule rows");

            // Module-level SRF contract after reactivation: exactly one active row per
            // paid feature (same restore-one-row-per-feature pattern UpdateStoreCommand
            // establishes). The role-granularity gap — re-activation restores only the
            // first role row per feature, so StoreUser rows stay soft-deleted after a
            // Paid→Free→Paid round trip — is documented as a finding in verify-report.md.
            var activeSrfCount = await CountActiveRoleFeaturesAsync(fx.StoreId);
            var paidFeatureIds = await PaidCatalogFeatureIdsAsync(paidCatalogIds);
            activeSrfCount.Should().Be(paidFeatureIds.Count, "each paid feature must be restored exactly once");

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var activeSrfFeatureIds = await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == fx.StoreId && srf.IsActive)
                .Select(srf => srf.FeatureId).ToListAsync();
            activeSrfFeatureIds.Should().BeEquivalentTo(paidFeatureIds,
                "every paid feature must regain at least one active StoreRoleFeature");
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    // ── ReSeller authorization ──────────────────────────────────────────────

    [Fact]
    public async Task ReSeller_toggles_owned_store_returns_200()
    {
        var fx = await BillingSeed.SeedPaidStoreWithReSellerAsync(_f, new DateOnly(2026, 3, 10), 1000f, 0f, 25f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, fx.UserId, fx.Login)
                .PostAsync($"/api/v1/stores/{fx.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();
            (await LoadStoreAsync(fx.StoreId)).PaymentStartDate.Should().BeNull();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
        }
    }

    [Fact]
    public async Task ReSeller_toggles_unowned_store_returns_400()
    {
        var reseller = await BillingSeed.SeedPaidStoreWithReSellerAsync(_f, new DateOnly(2026, 3, 10), 1000f, 0f, 25f);
        var other = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, reseller.UserId, reseller.Login)
                .PostAsync($"/api/v1/stores/{other.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "App.Unexpected" && e.Description!.Contains("Tienda no encontrada"));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, reseller);
            await BillingSeed.CleanupAsync(_f, other);
        }
    }

    [Fact]
    public async Task OwnerAdmin_toggle_returns_403()
    {
        // Action-level [HasPermission(SuperAdmin, StorePaymentAdmin)] — OwnerAdmin holds
        // no StorePayment feature, so the authorization filter must forbid before the handler.
        var actor = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsync($"/api/v1/stores/{actor.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId);
        }
    }

    // ── Preconditions ───────────────────────────────────────────────────────

    [Fact]
    public async Task Toggle_inactive_store_returns_400()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            await StoreSeed.DeactivateStoreAsync(_f, fx.StoreId);
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsync($"/api/v1/stores/{fx.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "App.Unexpected" && e.Description!.Contains("inactive"));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Toggle_with_inactive_owner_user_returns_400()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        try
        {
            await DeactivateUserAsync(fx.UserId);
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsync($"/api/v1/stores/{fx.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "App.Unexpected" && e.Description!.Contains("inactive"));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Toggle_unknown_store_returns_400()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .PostAsync($"/api/v1/stores/{Guid.NewGuid()}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "App.Unexpected" && e.Description!.Contains("Tienda no encontrada"));
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Toggle_without_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsync($"/api/v1/stores/{Guid.NewGuid()}/toggle-plan", null);
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}