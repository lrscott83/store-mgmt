using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
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
/// E2E tests for the owner-driven plan change (<c>POST /api/v1/stores/{id}/change-plan</c>,
/// body <c>{ "storePlanId": N }</c>) against real PostgreSQL — the full HTTP matrix from
/// owner-plan-change T5.1:
/// - owner of the store switches plan (Gratis → Pago/Superior/VIP): module set becomes
///   the target plan universe, StorePlanId written, anchor NEVER touched;
/// - overdue paid target pins NextDueDateOverride = today (visible via /plan);
/// - non-owner (another OwnerAdmin) → 403; SuperAdmin may change any store;
/// - inactive store / inactive owner user / unknown plan → 400;
/// - same-plan request is an idempotent no-op returning true.
/// </summary>
[Collection("e2e")]
public sealed class ChangeStorePlanTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    private const int FreeManagementModuleId = 7;
    private const int StatisticsModuleId = 6;
    private const int WarehousesModuleId = 13;
    private const int MultiStoresModuleId = 14;

    public ChangeStorePlanTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    private static object PlanBody(int storePlanId) => new { storePlanId };

    private static DateOnly Today() => DateOnly.FromDateTime(DateTime.UtcNow);

    // ── Happy path: owner switches to a paid plan ─────────────────────────────

    [Fact]
    public async Task Owner_changes_free_store_to_pago_gets_plan_universe_and_keeps_anchor()
    {
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Gratis,
            paymentStartDate: null);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Pago));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);

            // Anchor is sacred — never fabricated by a plan change.
            store.PaymentStartDate.Should().BeNull("the anchor is never written by a plan change");
            store.StorePlanId.Should().Be((int)StorePlanType.Pago);

            // Pago universe: free Management stays active; paid catalog modules activate.
            var active = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            active.Should().Contain(FreeManagementModuleId);
            active.Should().Contain(StatisticsModuleId, "Statistics belongs to the Pago plan");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Owner_overdue_anchor_paid_target_pins_nextDueDateOverride_to_today()
    {
        // Anchor 2026-01-10 with no payments → natural next due = anchor+trial+1 (past):
        // the plan change to a paid target must pin NextDueDateOverride = today.
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Gratis,
            paymentStartDate: new DateOnly(2026, 1, 10));
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Superior));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);

            store.PaymentStartDate.Should().Be(new DateOnly(2026, 1, 10), "anchor untouched");
            store.StorePlanId.Should().Be((int)StorePlanType.Superior);
            store.NextDueDateOverride.Should().Be(Today(),
                "overdue store + paid target → next due pinned to today (grace covers the payment)");

            // The owner's plan view (GET /plan) surfaces the pinned date, not the stale chain.
            var plan = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .GetFromJsonAsync<ApiResponse<PlanData>>($"/api/v1/stores/{seeded.StoreId}/plan", ApiResponse.Json);
            plan!.Data!.NextDueDate.Should().Be(Today(), "the plan view reads the override");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Owner_changes_paid_store_to_vip_activates_full_universe()
    {
        // VIP stays out of the public catalog but is a valid change target.
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Pago,
            paymentStartDate: new DateOnly(2026, 3, 10));
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.VIP));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);

            store.StorePlanId.Should().Be((int)StorePlanType.VIP);
            store.PaymentStartDate.Should().Be(new DateOnly(2026, 3, 10), "anchor never modified");

            // VIP universe = all AvailableToStore modules: contains the Superior-only ones.
            var active = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            active.Should().Contain(new[] { WarehousesModuleId, MultiStoresModuleId });
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Owner_downgrades_paid_store_to_gratis_clears_override_and_paid_modules()
    {
        // Paid store, overdue (anchor in the past) → change to Gratis must clear any
        // override and leave only the free universe.
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Pago,
            paymentStartDate: new DateOnly(2026, 1, 10));
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Gratis));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);

            store.PaymentStartDate.Should().Be(new DateOnly(2026, 1, 10), "anchor kept on downgrade");
            store.StorePlanId.Should().Be((int)StorePlanType.Gratis);
            store.NextDueDateOverride.Should().BeNull("Gratis target clears any pinned override");

            var active = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == seeded.StoreId && sm.IsActive)
                .Select(sm => sm.ModuleId).ToListAsync();
            active.Should().NotContain(StatisticsModuleId, "paid modules deactivate on Gratis");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    // ── Idempotence ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Owner_requests_current_plan_no_op_returns_true()
    {
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Pago,
            paymentStartDate: new DateOnly(2026, 3, 10));
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Pago));
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data.Should().BeTrue();

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);
            store.PaymentStartDate.Should().Be(new DateOnly(2026, 3, 10));
            store.NextDueDateOverride.Should().BeNull("no-op never pins an override");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    // ── Ownership guard ─────────────────────────────────────────────────────

    [Fact]
    public async Task Other_owner_admin_cannot_change_someone_elses_store_403()
    {
        var owner = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Gratis,
            paymentStartDate: null);
        var stranger = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Gratis,
            paymentStartDate: null);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, stranger.UserId, stranger.Login)
                .PostAsJsonAsync($"/api/v1/stores/{owner.StoreId}/change-plan", PlanBody((int)StorePlanType.Pago));
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, stranger.StoreId, stranger.UserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_changes_any_store()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Gratis,
            paymentStartDate: null);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Superior));
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.Set<Store>().IgnoreQueryFilters().SingleAsync(s => s.Id == seeded.StoreId);
            store.StorePlanId.Should().Be((int)StorePlanType.Superior);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    // ── Preconditions → 400 ──────────────────────────────────────────────────

    [Fact]
    public async Task Inactive_store_returns_400()
    {
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Gratis,
            paymentStartDate: null, storeActive: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Pago));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Inactive_owner_user_returns_400()
    {
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Gratis,
            paymentStartDate: null, ownerUserActive: false);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody((int)StorePlanType.Pago));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    [Fact]
    public async Task Unknown_plan_returns_400()
    {
        var seeded = await SeedOwnerAdminStoreAsync(planId: (int)StorePlanType.Gratis,
            paymentStartDate: null);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, seeded.UserId, seeded.Login)
                .PostAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/change-plan", PlanBody(999));
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, seeded.StoreId, seeded.UserId);
        }
    }

    // ── Seed helper ──────────────────────────────────────────────────────────

    private sealed record SeededOwnerStore(Guid UserId, string Login, Guid OwnerId, Guid StoreId);

    /// <summary>
    /// Seeds an active OwnerAdmin user owning one store on the given plan. The user gets
    /// the Stores feature grant (id 73, StoresAdmin) so the endpoint permission passes and
    /// the ownership guard is the axis under test. Free Management module is always seeded.
    /// </summary>
    private async Task<SeededOwnerStore> SeedOwnerAdminStoreAsync(
        int planId,
        DateOnly? paymentStartDate,
        bool storeActive = true,
        bool ownerUserActive = true)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"csp-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E CSP", "0000000000", login, tenantId);
        if (!ownerUserActive)
            user.IsActive = false;
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E CSP Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"CSP-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate,
            storePlanId: planId);
        // Create's 3rd arg is `approved`, not `IsActive` — deactivate explicitly.
        if (!storeActive)
            store.IsActive = false;
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeManagementModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        // StoresAdmin needs the Stores feature on the Management module for OwnerAdmin.
        db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(
            store.Id, (int)RoleType.OwnerAdmin, AuthzSeed.StoresFeatureId, tenantId));

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return new SeededOwnerStore(user.Id, login, owner.Id, store.Id);
    }

    private sealed record PlanData(Guid StoreId, string StoreName, DateOnly? PaymentStartDate, DateOnly? NextDueDate, string PlanType);
}
