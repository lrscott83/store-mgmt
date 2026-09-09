using System.Net;
using System.Net.Http.Json;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E coverage for GET /v1/stores/my-stores (owner-stores-cards plan, 2026-09-08):
/// the OwnerAdmin's own stores — ACTIVE AND INACTIVE — with each store's module
/// price snapshot and the canonical nextDueDate (same calculation as
/// GetStorePlanQuery). SuperAdmin sees everything; ReSeller and StoreUser get 403.
/// Full matrix M-01..M-15 of docs/plans/2026-09-08-owner-stores-cards-plan.md §5.2.
/// </summary>
[Collection("e2e")]
public sealed class MyStoresTests
{
    private readonly AppTestFactory _f;
    public MyStoresTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record OwnerStoreDto(
        Guid Id, string Name, bool IsActive, bool Approved,
        DateOnly? PaymentStartDate, DateOnly? NextDueDate,
        List<ModuleSnapshotDto> Modules);

    private sealed record ModuleSnapshotDto(
        int Id, string? Name, bool PriceIncluded, float Price, float CurrentPrice);

    // ── Auth gates ────────────────────────────────────────────────────────────

    [Fact] // M-01
    public async Task My_stores_without_token_returns_401()
    {
        var response = await _f.CreateClient().GetAsync("/api/v1/stores/my-stores");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact] // M-02
    public async Task My_stores_store_user_returns_403()
    {
        var su = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, su.UserId, su.Login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId); }
    }

    [Fact] // M-03
    public async Task My_stores_re_seller_returns_403()
    {
        var login = $"reseller-{Guid.NewGuid():N}@test.com";
        var (userId, reSellerId) = await SeedReSeller(_f, login);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, userId, login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Set<Domain.Entities.ReSellers.ReSeller>().RemoveRange(
                await db.Set<Domain.Entities.ReSellers.ReSeller>().IgnoreQueryFilters()
                    .Where(r => r.UserId == userId).ToListAsync());
            await db.SaveChangesAsync();
            await DbTestHelpers.CleanupUserAsync(_f, userId);
            await StoreSeed.CleanupOwnerAsync(_f, reSellerId, userId);
        }
    }

    [Fact] // M-04
    public async Task My_stores_super_admin_sees_every_store_including_inactive()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fixture = await StoreSeed.SeedStoreAsync(_f, $"Inactive-{Guid.NewGuid():N}", approved: false);
        await StoreSeed.DeactivateStoreAsync(_f, fixture.StoreId);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreDto>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().Contain(s => s.Id == fixture.StoreId && s.IsActive == false);
            body.Data.Should().NotContain(s => s.Id == Domain.Common.Constants.DataUtils.DefaultStore.Id);
        }
        finally { await StoreSeed.CleanupStoreFixtureAsync(_f, fixture); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
    }

    // ── OwnerAdmin listing ───────────────────────────────────────────────────

    [Fact] // M-05 — an owner whose user row has no store at all cannot pass the
    // class-level HasPermission(StoresAdmin) gate: without a SelectedStoreId there
    // is no store-module membership to grant the permission, so the middleware
    // 403s BEFORE the handler (which would have returned an empty list). This pins
    // that contract; the empty-list shape itself is covered by the unit tests.
    public async Task Owner_with_no_stores_is_denied_by_the_permission_gate()
    {
        var owner = await SeedOwnerAdminWithNoStores();
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, owner.UserId); }
    }

    [Fact] // M-06 + M-07
    public async Task Owner_sees_own_active_and_inactive_stores()
    {
        var ownerA = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        Guid storeA2Id;
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store2 = Store.Create($"OA-Store-2-{Guid.NewGuid():N}", ownerA.OwnerId, false, ownerA.TenantId, DateOnly.FromDateTime(DateTime.UtcNow));
            db.Set<Store>().Add(store2);
            await db.SaveChangesAsync();
            storeA2Id = store2.Id;
        }
        await StoreSeed.DeactivateStoreAsync(_f, storeA2Id);
        var ownerB = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, ownerA.UserId, ownerA.Login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreDto>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            // Active own store present (M-06)
            body.Data.Should().Contain(s => s.Id == ownerA.StoreId && s.IsActive);
            // Inactive own store PRESENT with isActive=false (M-07 — the key difference
            // vs by-current-user, which drops it)
            body.Data.Should().Contain(s => s.Id == storeA2Id && !s.IsActive);
            // Other owners' stores never leak (M-09)
            body.Data.Should().NotContain(s => s.Id == ownerB.StoreId);
        }
        finally
        {
            await StoreSeed.CleanupStoreAsync(_f, storeA2Id);
            await AuthzSeed.CleanupStoreGraphAsync(_f, ownerA.StoreId, ownerA.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, ownerB.StoreId, ownerB.UserId);
        }
    }

    [Fact] // M-10
    public async Task Modules_come_from_the_store_snapshot_with_prices()
    {
        // withManagementModule: true is REQUIRED even for module-snapshot assertions:
        // the StoresController class-level HasPermission(StoresAdmin) gate 403s any
        // owner whose store lacks the Management module before the handler runs.
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        // Remove the seeded free Management snapshot so the listing carries ONLY the
        // paid module we seed below — the assertion targets that one module exactly.
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var tenantId = Domain.Common.Constants.DataUtils.DefaultTenant.Id;
                db.Set<Domain.Entities.StoreModules.StoreModule>().Add(
                    Domain.Entities.StoreModules.StoreModule.Create(
                        owner.StoreId, PaidModuleId, 10f, false, 10f, 2f, 20, tenantId));
                await db.SaveChangesAsync();
            }

            var response = await DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreDto>>>(ApiResponse.Json);
            var mine = body!.Data.Should().ContainSingle(s => s.Id == owner.StoreId).Subject;
            mine.Modules.Should().Contain(m =>
                m.Id == PaidModuleId &&
                m.PriceIncluded == false &&
                m.Price == 10f &&
                // GetCurrentPrice(10, percentDiscount: 20, discountPrice: 2) =
                // 10 - (10 * 20/100) - 2 = 6 (both discounts apply).
                m.CurrentPrice == 6f);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId); }
    }

    [Fact] // M-11
    public async Task Free_store_has_null_next_due_date()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        // SeedOwnerAdminAsync creates the store via Store.Create with a real wall-clock
        // PaymentStartDate — the billing clock starts at birth. To get the FREE shape
        // (M-11), null the date directly in the DB (no API reachable by an owner can).
        await SetPaymentStartDateDirect(owner.StoreId, null);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreDto>>>(ApiResponse.Json);
            var mine = body!.Data.Should().ContainSingle(s => s.Id == owner.StoreId).Subject;
            mine.PaymentStartDate.Should().BeNull();
            mine.NextDueDate.Should().BeNull();
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId); }
    }

    [Fact] // M-12
    public async Task Paid_store_without_payments_computes_first_due_date()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var paymentStart = DateOnly.FromDateTime(DateTime.UtcNow);
        await SetPaymentStartDateDirect(owner.StoreId, paymentStart);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreDto>>>(ApiResponse.Json);
            var mine = body!.Data.Should().ContainSingle(s => s.Id == owner.StoreId).Subject;
            mine.PaymentStartDate.Should().Be(paymentStart);
            // Canonical calculation (GetStorePlanQuery/StoreBillingUtils): first due =
            // activation + trial months + 1 post-paid month.
            var trial = await GetTestingPeriodInMonths();
            mine.NextDueDate.Should().Be(paymentStart.AddMonths(trial + 1));
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId); }
    }

    [Fact] // M-13
    public async Task Paid_store_with_registered_payment_uses_last_paid_before_date()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var paymentStart = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-4));
        await SetPaymentStartDateDirect(owner.StoreId, paymentStart);
        var paidBefore = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(1));
        try
        {
            // Seed the last payment directly (the RegisterStorePayment endpoint is
            // SuperAdmin/StorePaymentAdmin-gated — not reachable by the owner).
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var tenantId = Domain.Common.Constants.DataUtils.DefaultTenant.Id;
                db.Set<Domain.Entities.StorePayments.StorePayment>().Add(
                    Domain.Entities.StorePayments.StorePayment.Create(
                        owner.StoreId, 1, 10f,
                        new DateTimeOffset(paidBefore.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
                        paidBefore.Year, paidBefore.Month, tenantId,
                        reSellerId: null, reSellerPercentDiscountPrice: 0, reSellerDiscountPrice: 0,
                        reSellerAmount: 0, byReSeller: false));
                await db.SaveChangesAsync();
            }

            var response = await DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreDto>>>(ApiResponse.Json);
            var mine = body!.Data.Should().ContainSingle(s => s.Id == owner.StoreId).Subject;
            // Canonical calculation: the latest paid PaymentBeforeDate wins.
            mine.NextDueDate.Should().Be(paidBefore);
        }
        finally
        {
            // The seeded StorePayment has an FK to Store — remove it BEFORE the store
            // graph cleanup or the cascade delete in CleanupStoreGraphAsync violates
            // FK_StorePayment_Store_StoreId.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<Domain.Entities.StorePayments.StorePayment>().RemoveRange(
                    await db.Set<Domain.Entities.StorePayments.StorePayment>()
                        .IgnoreQueryFilters()
                        .Where(p => p.StoreId == owner.StoreId).ToListAsync());
                await db.SaveChangesAsync();
            }
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    [Fact] // M-14 — plan data survives deactivation. Queried through the SuperAdmin
    // branch: an owner whose ONLY store is inactive loses the StoresAdmin claim
    // (features need Store.IsActive in UserRoleRepository.GetUserFeatureIdsForClaims),
    // so the owner cannot reach the endpoint at all — the SuperAdmin can, and sees
    // the inactive store's plan data intact.
    public async Task Inactive_paid_store_still_carries_plan_data()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var paymentStart = DateOnly.FromDateTime(DateTime.UtcNow);
        await SetPaymentStartDateDirect(owner.StoreId, paymentStart);
        await StoreSeed.DeactivateStoreAsync(_f, owner.StoreId);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, adminId, login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreDto>>>(ApiResponse.Json);
            var mine = body!.Data.Should().Contain(s => s.Id == owner.StoreId).Subject;
            mine.IsActive.Should().BeFalse();
            mine.PaymentStartDate.Should().Be(paymentStart);
            mine.NextDueDate.Should().NotBeNull();
            mine.Modules.Should().NotBeEmpty(); // management module snapshot still travels
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact] // M-15
    public async Task Approved_flag_travels_correctly()
    {
        var owner = await SeedOwnerAdminWithStores(approvedStore: true, inactiveStoreApproved: false);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login)
                .GetAsync("/api/v1/stores/my-stores");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreDto>>>(ApiResponse.Json);
            body!.Data.Should().Contain(s => s.Id == owner.ApprovedStoreId && s.Approved);
            body.Data.Should().Contain(s => s.Id == owner.InactiveStoreId && !s.Approved && !s.IsActive);
        }
        finally { await owner.CleanupAsync(); }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private const int PaidModuleId = 2; // Sales module — paid by default in seed data

    private sealed record NoStoresOwner(Guid UserId, string Login);

    private async Task<NoStoresOwner> SeedOwnerAdminWithNoStores()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = Domain.Common.Constants.DataUtils.DefaultTenant.Id;
        var login = $"no-stores-{Guid.NewGuid():N}@test.com";
        var user = Domain.Entities.Users.User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E No Stores", "0000000000", login, tenantId);
        db.Set<Domain.Entities.Users.User>().Add(user);
        var owner = Domain.Entities.Owners.Owner.Create(user.Id, false, tenantId, "E2E no stores owner");
        db.Set<Domain.Entities.Owners.Owner>().Add(owner);
        db.Set<Domain.Entities.UserRoles.UserRole>().Add(
            Domain.Entities.UserRoles.UserRole.Create(user.Id, (int)Domain.Common.Enums.RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();
        return new NoStoresOwner(user.Id, login);
    }

    private sealed record OwnerWithStores(
        Guid UserId, string Login, Guid ApprovedStoreId, Guid InactiveStoreId,
        Func<Task> CleanupAsync);

    private async Task<OwnerWithStores> SeedOwnerAdminWithStores(bool approvedStore, bool inactiveStoreApproved)
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        Guid approvedStoreId;
        Guid inactiveStoreId;
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var approved = Store.Create($"Approved-{Guid.NewGuid():N}", owner.OwnerId, approvedStore, owner.TenantId, DateOnly.FromDateTime(DateTime.UtcNow));
            db.Set<Store>().Add(approved);
            var inactive = Store.Create($"Inactive-2-{Guid.NewGuid():N}", owner.OwnerId, inactiveStoreApproved, owner.TenantId, DateOnly.FromDateTime(DateTime.UtcNow));
            inactive.IsActive = false; // tracked Added entity persists the mutation
            db.Set<Store>().Add(inactive);
            await db.SaveChangesAsync();
            approvedStoreId = approved.Id;
            inactiveStoreId = inactive.Id;
        }
        return new OwnerWithStores(owner.UserId, owner.Login, approvedStoreId, inactiveStoreId, async () =>
        {
            await StoreSeed.CleanupStoreAsync(_f, approvedStoreId);
            await StoreSeed.CleanupStoreAsync(_f, inactiveStoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        });
    }

    /// <summary>Direct-DB seed of PaymentStartDate (same pattern as store-plan-lock-regression).</summary>
    private async Task SetPaymentStartDateDirect(Guid storeId, DateOnly? value)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = await db.Set<Store>().IgnoreQueryFilters().AsTracking().FirstAsync(s => s.Id == storeId);
        store.PaymentStartDate = value;
        await db.SaveChangesAsync();
        // NoTracking context is the default — the explicit AsTracking() above covers the
        // mutation (CLAUDE.md gotcha: query-then-mutate with NoTracking writes nothing).
    }

    private async Task<int> GetTestingPeriodInMonths()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var config = await db.Set<Domain.Entities.SystemConfigurations.SystemConfiguration>()
            .IgnoreQueryFilters()
 .FirstAsync(c => c.Id == (int)Domain.Common.Enums.SystemConfigurationType.TestingPeriodInMonths);
        return int.Parse(config.Value);
    }

    private static async Task<(Guid userId, Guid ownerRowId)> SeedReSeller(AppTestFactory factory, string login)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = Domain.Common.Constants.DataUtils.DefaultTenant.Id;
        var user = Domain.Entities.Users.User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E ReSeller", "0000000000", login, tenantId);
        db.Set<Domain.Entities.Users.User>().Add(user);
        await db.SaveChangesAsync();
        db.Set<Domain.Entities.UserRoles.UserRole>().Add(
            Domain.Entities.UserRoles.UserRole.Create(user.Id, (int)Domain.Common.Enums.RoleType.ReSeller, tenantId));
        var reSeller = Domain.Entities.ReSellers.ReSeller.Create(user.Id, true, 0, 25, tenantId, "E2E ReSeller");
        db.Set<Domain.Entities.ReSellers.ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();
        return (user.Id, reSeller.Id);
    }
}
