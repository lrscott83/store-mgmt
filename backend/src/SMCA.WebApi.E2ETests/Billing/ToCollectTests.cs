using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StorePayments;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class ToCollectTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public ToCollectTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    /// <summary>
    /// Seed a store for a ReSeller scenario: creates a ReSeller-owned store.
    /// </summary>
    private sealed record ReSellerStore(Guid UserId, string Login, Guid StoreId, Guid OwnerId, Guid TenantId);

    private async Task<ReSellerStore> SeedReSellerOwnedStoreAsync(string storeName)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"reseller-tc-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E ReSeller TC", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<Domain.Entities.UserRoles.UserRole>().Add(
            Domain.Entities.UserRoles.UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = Domain.Entities.ReSellers.ReSeller.Create(
            user.Id, true, 0, 25, tenantId, "E2E ReSeller TC");
        db.Set<Domain.Entities.ReSellers.ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();

        var owner = Owner.Create(user.Id, false, tenantId, "E2E ReSeller TC Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>().Add(
            Domain.Entities.ReSellerOwners.ReSellerOwner.Create(
                reSeller.Id, owner.Id, 0, 25, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create(storeName, owner.Id, true, tenantId,
            new DateOnly(2026, 6, 1));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, 2, 2000, false, 2000, 0, 25, tenantId));
        await db.SaveChangesAsync();

        return new ReSellerStore(user.Id, login, store.Id, owner.Id, tenantId);
    }

    private async Task CleanupReSellerStoreAsync(ReSellerStore f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        db.Set<StorePayment>().RemoveRange(
            await db.Set<StorePayment>().Where(sp => sp.StoreId == f.StoreId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(
            await db.Set<StoreModule>().Where(sm => sm.StoreId == f.StoreId).ToListAsync());
        db.Set<Store>().RemoveRange(
            await db.Set<Store>().Where(s => s.Id == f.StoreId).ToListAsync());
        db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>().RemoveRange(
            await db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>()
                .Where(rso => rso.OwnerId == f.OwnerId).ToListAsync());
        db.Set<Owner>().RemoveRange(
            await db.Set<Owner>().Where(o => o.Id == f.OwnerId).ToListAsync());
        db.Set<Domain.Entities.ReSellers.ReSeller>().RemoveRange(
            await db.Set<Domain.Entities.ReSellers.ReSeller>()
                .Where(r => r.UserId == f.UserId).ToListAsync());
        db.Set<Domain.Entities.UserRoles.UserRole>().RemoveRange(
            await db.Set<Domain.Entities.UserRoles.UserRole>()
                .Where(ur => ur.UserId == f.UserId).ToListAsync());
        db.Set<User>().RemoveRange(
            await db.Set<User>().Where(u => u.Id == f.UserId).ToListAsync());
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task ReSeller_sees_own_stores_only()
    {
        // Pin "today" to 2026-07-30 so the store seeded with PaymentStartDate = 2026-06-01
        // resolves to PorVencer (window 2026-07-27..2026-08-01 with trial=1, grace=5, dueSoon=5).
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero));
        // Arrange: seed a ReSeller with a store, and another store not owned by the ReSeller
        var reSeller = await SeedReSellerOwnedStoreAsync($"Own-Store-{Guid.NewGuid():N}");
        var otherStore = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2026, 6, 1), paidModulePrice: 2000f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, reSeller.UserId, reSeller.Login);
            var response = await client.GetAsync("/api/v1/stores/to-collect");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<
                ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // The ReSeller's own store should be visible
            var ownInResult = body.Data!.FirstOrDefault(s => s.StoreId == reSeller.StoreId);
            ownInResult.Should().NotBeNull();

            // The other store (not owned) should NOT be in results
            var otherInResult = body.Data!.FirstOrDefault(s => s.StoreId == otherStore.StoreId);
            otherInResult.Should().BeNull();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, otherStore);
            await CleanupReSellerStoreAsync(reSeller);
        }
    }

    [Fact]
    public async Task AlDia_stores_excluded()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // Seed a store and add a payment with a future due date → AlDia
        var fx = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2026, 6, 1), paidModulePrice: 2000f);
        try
        {
            // Make a payment so the store is up-to-date (paid forward)
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            await client.PostAsync($"/api/v1/stores/{fx.StoreId}/payments", null);

            // Now the store should be AlDia — excluded from to-collect
            var response = await client.GetAsync("/api/v1/stores/to-collect");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<
                ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var storeInResult = body.Data!.FirstOrDefault(s => s.StoreId == fx.StoreId);
            storeInResult.Should().BeNull();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Vencido_stores_excluded()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // Seed a store with PaymentStartDate far in the past (no payments) → Vencido
        var fx = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2020, 1, 1), paidModulePrice: 2000f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.GetAsync("/api/v1/stores/to-collect");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<
                ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var storeInResult = body.Data!.FirstOrDefault(s => s.StoreId == fx.StoreId);
            storeInResult.Should().BeNull();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task PorVencer_and_EnGracia_included()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");

        // PorVencer: start May 18 → NextDueDate = Jul 18 → PorVencer on Jul 15
        var porVencer = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2026, 5, 18), paidModulePrice: 1000f);

        // EnGracia: start May 10 → NextDueDate = Jul 10 → EnGracia on Jul 15
        var enGracia = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2026, 5, 10), paidModulePrice: 1000f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.GetAsync("/api/v1/stores/to-collect");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<
                ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // Both stores should be in the results (they need collection)
            var porVencerInResult = body.Data!.FirstOrDefault(s => s.StoreId == porVencer.StoreId);
            porVencerInResult.Should().NotBeNull();

            var enGraciaInResult = body.Data!.FirstOrDefault(s => s.StoreId == enGracia.StoreId);
            enGraciaInResult.Should().NotBeNull();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, enGracia);
            await BillingSeed.CleanupAsync(_f, porVencer);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task NonSuperAdminNonReSeller_returns_403()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login);
            var response = await client.GetAsync("/api/v1/stores/to-collect");

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await StoreSeed.CleanupStoresAdminAsync(_f, sa);
        }
    }
}
