using System.Net;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Authentication;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.StoreUsages;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

/// <summary>
/// E2E tests for DELETE /api/v1/Owners/{id} — documents which references the handler
/// cleans up and which it leaves behind (StorePayments, RefreshTokens, InventoryEntries,
/// Orders). Happy-path tests assert full cleanup; edge tests assert documented current
/// behavior (FK Restrict failures, orphan rows).
/// Plan 2026-09-08-e2e-plan-gated-modules-auth-roster (Lote 4, E6).
/// </summary>
[Collection("e2e")]
public sealed class OwnersDeleteReferencesTests
{
    private readonly AppTestFactory _f;
    public OwnersDeleteReferencesTests(WebAppFixture fixture) => _f = fixture.Factory;

    // ── Happy Path ────────────────────────────────────────────────────────

    [Fact]
    public async Task Delete_owner_removes_all_store_references()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var graph = await SeedFullGraphAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{graph.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            (await db.Set<Store>().IgnoreQueryFilters()
                .Where(s => s.OwnerId == graph.OwnerId).CountAsync()).Should().Be(0);
            (await db.Set<StoreUser>().IgnoreQueryFilters()
                .Where(su => su.StoreId == graph.StoreId).CountAsync()).Should().Be(0);
            (await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == graph.StoreId).CountAsync()).Should().Be(0);
            (await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
                .Where(srf => srf.StoreId == graph.StoreId).CountAsync()).Should().Be(0);
            (await db.Set<StoreUsage>().IgnoreQueryFilters()
                .Where(su => su.UserId == graph.OwnerUserId || su.StoreId == graph.StoreId)
                .CountAsync()).Should().Be(0);
            (await db.Set<ReSellerOwner>().IgnoreQueryFilters()
                .Where(rso => rso.OwnerId == graph.OwnerId).CountAsync()).Should().Be(0);
            (await db.Set<UserRole>().IgnoreQueryFilters()
                .Where(ur => ur.UserId == graph.OwnerUserId).CountAsync()).Should().Be(0);
            (await db.Set<Owner>().IgnoreQueryFilters()
                .Where(o => o.Id == graph.OwnerId).CountAsync()).Should().Be(0);
            (await db.Set<User>().IgnoreQueryFilters()
                .Where(u => u.Id == graph.OwnerUserId).CountAsync()).Should().Be(0);
        }
        finally
        {
            // Handler already removed the graph on success; reseller user U2 survives by
            // design and must be cleaned regardless. Cleanup is idempotent (no-op rows).
            await CleanupEdgeCaseAsync(graph.StoreId, graph.OwnerId, graph.OwnerUserId,
                reSellerUserId: graph.ReSellerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Delete_owner_removes_non_default_tenant()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var graph = await SeedFullGraphAsync();
        Guid tenantId = Guid.Empty;
        try
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var tenant = Tenant.Create($"TN-{Guid.NewGuid():N}", "test tenant", DateTimeOffset.UtcNow);
                db.Set<Tenant>().Add(tenant);
                await db.SaveChangesAsync();
                tenantId = tenant.Id;
            }

            await SetOwnerTenantAsync(graph.OwnerUserId, tenantId);
            await SetOwnerTenantAsync(graph.OwnerId, tenantId, isOwner: true);
            await SetStoreTenantAsync(graph.StoreId, tenantId);

            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{graph.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var assertScope = _f.Services.CreateScope();
            var assertDb = assertScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await assertDb.Set<Tenant>().IgnoreQueryFilters()
                .Where(t => t.Id == tenantId).CountAsync()).Should().Be(0);
        }
        finally
        {
            await CleanupEdgeCaseAsync(graph.StoreId, graph.OwnerId, graph.OwnerUserId,
                reSellerUserId: graph.ReSellerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
            if (tenantId != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
        }
    }

    [Fact]
    public async Task Delete_owner_default_tenant_survives()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var graph = await SeedFullGraphAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{graph.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Tenant>().IgnoreQueryFilters()
                .Where(t => t.Id == DataUtils.DefaultTenant.Id).CountAsync()).Should().Be(1);
        }
        finally
        {
            await CleanupEdgeCaseAsync(graph.StoreId, graph.OwnerId, graph.OwnerUserId,
                reSellerUserId: graph.ReSellerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── Edge Cases (documented current behavior) ──────────────────────────

    [Fact]
    public async Task Delete_owner_with_own_reseller_links_returns_500()
    {
        // Reseller-of-self shape (the same user owns a store AND is its own ReSeller via
        // ReSellerOwner): the handler deletes ReSellerOwner but never the ReSeller entity,
        // whose UserId FK (Restrict) blocks the final User delete → documented 500.
        // No production change in this iteration (same decision as StorePayments/Orders).
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var store = await SeedSelfResellerGraphAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{store.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally
        {
            await CleanupEdgeCaseAsync(store.StoreId, store.OwnerId, store.OwnerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Delete_owner_with_store_payments_does_not_cascade()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var store = await SeedPaidStoreWithPaymentAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{store.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<StorePayment>().IgnoreQueryFilters()
                .Where(sp => sp.StoreId == store.StoreId).CountAsync()).Should().BeGreaterThan(0);
        }
        finally
        {
            await CleanupEdgeCaseAsync(store.StoreId, store.OwnerId, store.OwnerUserId,
                removeStorePayments: true);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Delete_owner_with_refresh_tokens_cleans_or_leaves_orphans()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var graph = await SeedFullGraphAsync();
        try
        {
            Guid refreshTokenId;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var token = new RefreshToken(graph.OwnerUserId, "test-refresh-token",
                    DateTimeOffset.UtcNow.AddDays(30));
                db.Set<RefreshToken>().Add(token);
                await db.SaveChangesAsync();
                refreshTokenId = token.Id;
            }

            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{graph.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var assertScope = _f.Services.CreateScope();
            var assertDb = assertScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await assertDb.Set<RefreshToken>().IgnoreQueryFilters()
                .Where(rt => rt.Id == refreshTokenId).CountAsync()).Should().Be(1,
                "RefreshToken has no FK to User — tokens are orphans after user deletion");
        }
        finally
        {
            await CleanupEdgeCaseAsync(graph.StoreId, graph.OwnerId, graph.OwnerUserId,
                removeRefreshTokens: true, reSellerUserId: graph.ReSellerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Delete_owner_with_inventory_entries_fails_with_fk_error()
    {
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var store = await SeedStoreWithInventoryEntryAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .DeleteAsync($"/api/v1/Owners/{store.OwnerId}");
            r.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        }
        finally
        {
            await CleanupEdgeCaseAsync(store.StoreId, store.OwnerId, store.OwnerUserId,
                removeInventoryEntries: true);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ── Seed Helpers ──────────────────────────────────────────────────────

    private async Task<(Guid StoreId, Guid OwnerId, Guid OwnerUserId, Guid ReSellerUserId)> SeedFullGraphAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        // Owner user U1: the owner-of-record whose full graph the handler must delete.
        var login = $"delowner-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Delete Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Delete Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        // Separate ReSeller user U2 (realistic shape: the owner is a reseller's client).
        // The handler deletes ReSellerOwner (step 1) but never the ReSeller entity, which
        // belongs to U2 — so U2 and its ReSeller must survive the delete (asserted via cleanup).
        var rsLogin = $"delreseller-{Guid.NewGuid():N}@test.com";
        var rsUser = User.Create(rsLogin, DbTestHelpers.HashPassword("Password123"),
            "E2E Delete ReSeller", "0000000000", rsLogin, tenantId);
        db.Set<User>().Add(rsUser);
        await db.SaveChangesAsync();
        db.Set<UserRole>().Add(UserRole.Create(rsUser.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = Domain.Entities.ReSellers.ReSeller.Create(
            rsUser.Id, true, 0, 0, tenantId, "E2E Delete ReSeller");
        db.Set<Domain.Entities.ReSellers.ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();
        db.Set<ReSellerOwner>().Add(ReSellerOwner.Create(reSeller.Id, owner.Id, 0, 0, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create($"DEL-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, 7, 0, true, 0, 0, 0, tenantId));
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, store.Id, tenantId));
        db.Set<StoreRoleFeature>().Add(
            StoreRoleFeature.Create(store.Id, (int)RoleType.OwnerAdmin, 73, tenantId));
        db.Set<StoreRoleFeature>().Add(
            StoreRoleFeature.Create(store.Id, (int)RoleType.StoreUser, 73, tenantId));
        db.Set<StoreUsage>().Add(StoreUsage.Create(
            store.Id, user.Id, DateTime.UtcNow, "127.0.0.1", "test", "id", "sid"));
        db.Set<StoreUsage>().Add(StoreUsage.Create(
            store.Id, user.Id, DateTime.UtcNow, "127.0.0.1", "test2", "id2", "sid2"));
        await db.SaveChangesAsync();

        return (store.Id, owner.Id, user.Id, rsUser.Id);
    }

    private async Task<(Guid StoreId, Guid OwnerId, Guid OwnerUserId)> SeedPaidStoreWithPaymentAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"payowner-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Payment Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Payment Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create($"PAY-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, 7, 0, true, 0, 0, 0, tenantId));
        db.Set<StorePayment>().Add(StorePayment.Create(
            store.Id, (int)StorePaymentStatusType.Paid, 1000f,
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.Year, DateTimeOffset.UtcNow.Month,
            tenantId, null, 0f, 0f, 0f, false));
        await db.SaveChangesAsync();

        return (store.Id, owner.Id, user.Id);
    }

    private async Task<(Guid StoreId, Guid OwnerId, Guid OwnerUserId)> SeedStoreWithInventoryEntryAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"ientry-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E InventoryEntry Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E InventoryEntry Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create($"IENTRY-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, 7, 0, true, 0, 0, 0, tenantId));
        var category = Domain.Entities.ProductCategories.ProductCategory.Create(
            store.Id, "Test Category", 1, tenantId);
        db.Set<Domain.Entities.ProductCategories.ProductCategory>().Add(category);
        await db.SaveChangesAsync();

        var product = Domain.Entities.Products.Product.Create(
            "Test Product", category.Id, 10m, 1, true, true, "TP-001", tenantId);
        db.Set<Domain.Entities.Products.Product>().Add(product);
        await db.SaveChangesAsync();

        db.Set<Domain.Entities.InventoryEntries.InventoryEntry>().Add(
            Domain.Entities.InventoryEntries.InventoryEntry.Create(
                store.Id, product.Id, 10, 10, 5m, DateTime.UtcNow, tenantId));
        await db.SaveChangesAsync();

        return (store.Id, owner.Id, user.Id);
    }

    private async Task CleanupEdgeCaseAsync(
        Guid storeId, Guid ownerId, Guid ownerUserId,
        bool removeStorePayments = false,
        bool removeRefreshTokens = false,
        bool removeInventoryEntries = false,
        Guid? reSellerUserId = null)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        if (removeRefreshTokens)
            await db.Set<RefreshToken>().IgnoreQueryFilters()
                .Where(rt => rt.UserId == ownerUserId).ExecuteDeleteAsync();
        if (removeStorePayments)
            await db.Set<StorePayment>().IgnoreQueryFilters()
                .Where(sp => sp.StoreId == storeId).ExecuteDeleteAsync();
        if (removeInventoryEntries)
        {
            await db.Set<Domain.Entities.InventoryEntries.InventoryEntry>().IgnoreQueryFilters()
                .Where(ie => ie.StoreId == storeId).ExecuteDeleteAsync();
            var catIds = await db.Set<Domain.Entities.ProductCategories.ProductCategory>()
                .IgnoreQueryFilters().Where(pc => pc.StoreId == storeId)
                .Select(pc => pc.Id).ToListAsync();
            await db.Set<Domain.Entities.Products.Product>().IgnoreQueryFilters()
                .Where(p => catIds.Contains(p.CategoryId)).ExecuteDeleteAsync();
            await db.Set<Domain.Entities.ProductCategories.ProductCategory>().IgnoreQueryFilters()
                .Where(pc => pc.StoreId == storeId).ExecuteDeleteAsync();
        }

        await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(srf => srf.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(sm => sm.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<StoreUsage>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId || su.UserId == ownerUserId)
            .ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == storeId).ExecuteDeleteAsync();
        await db.Set<ReSellerOwner>().IgnoreQueryFilters()
            .Where(rso => rso.OwnerId == ownerId).ExecuteDeleteAsync();
        // Self-reseller shape: the ReSeller referencing the owner's user must go
        // before the User delete (FK Restrict) — this cleanup also runs on the
        // documented-500 test where the handler persisted nothing.
        await db.Set<Domain.Entities.ReSellers.ReSeller>().IgnoreQueryFilters()
            .Where(r => r.UserId == ownerUserId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(o => o.Id == ownerId).ExecuteDeleteAsync();
        await db.Set<UserRole>().IgnoreQueryFilters()
            .Where(ur => ur.UserId == ownerUserId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == ownerUserId).ExecuteDeleteAsync();

        // A separate ReSeller user survives the handler delete and must be cleaned here.
        if (reSellerUserId is Guid rsId)
        {
            await db.Set<UserRole>().IgnoreQueryFilters()
                .Where(ur => ur.UserId == rsId).ExecuteDeleteAsync();
            await db.Set<Domain.Entities.ReSellers.ReSeller>().IgnoreQueryFilters()
                .Where(r => r.UserId == rsId).ExecuteDeleteAsync();
            await db.Set<User>().IgnoreQueryFilters()
                .Where(u => u.Id == rsId).ExecuteDeleteAsync();
        }
    }

    /// <summary>Reseller-of-self shape (mirrors BillingSeed.SeedPaidStoreWithReSellerAsync):
    /// the same user owns a store and is its own ReSeller via ReSellerOwner.</summary>
    private async Task<(Guid StoreId, Guid OwnerId, Guid OwnerUserId)> SeedSelfResellerGraphAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"selfrs-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Self ReSeller Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Self ReSeller Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = Domain.Entities.ReSellers.ReSeller.Create(
            user.Id, true, 0, 0, tenantId, "E2E Self ReSeller");
        db.Set<Domain.Entities.ReSellers.ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();
        db.Set<ReSellerOwner>().Add(ReSellerOwner.Create(reSeller.Id, owner.Id, 0, 0, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create($"SELFRS-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, 7, 0, true, 0, 0, 0, tenantId));
        await db.SaveChangesAsync();

        return (store.Id, owner.Id, user.Id);
    }

    private async Task SetOwnerTenantAsync(Guid entityId, Guid tenantId, bool isOwner = false)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        if (isOwner)
        {
            await db.Set<Owner>().IgnoreQueryFilters()
                .Where(o => o.Id == entityId)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.TenantId, tenantId));
        }
        else
        {
            await db.Set<User>().IgnoreQueryFilters()
                .Where(u => u.Id == entityId)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.TenantId, tenantId));
        }
    }

    private async Task SetStoreTenantAsync(Guid storeId, Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == storeId)
            .ExecuteUpdateAsync(s => s.SetProperty(store => store.TenantId, tenantId));
    }
}
