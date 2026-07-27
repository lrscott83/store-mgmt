using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class RegisterStorePaymentTests
{
    private readonly AppTestFactory _f;
    public RegisterStorePaymentTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record ReSellerStoreFixture(
        Guid UserId,
        string Login,
        Guid ReSellerId,
        Guid StoreId,
        Guid OwnerId,
        Guid TenantId);

    private static string HashPassword(string password)
        => Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(password)));

    /// <summary>
    /// Seed a ReSeller user + ReSeller entity + Owner (with ReSellerOwner) + Store with a paid module.
    /// </summary>
    private async Task<ReSellerStoreFixture> SeedReSellerWithStoreAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"reseller-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, HashPassword("Password123"), "E2E ReSeller", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = ReSeller.Create(user.Id, true, 0, 25, tenantId, "E2E ReSeller");
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();

        var owner = Owner.Create(user.Id, false, tenantId, "E2E ReSeller Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var reSellerOwner = ReSellerOwner.Create(reSeller.Id, owner.Id, 0, 25, tenantId);
        db.Set<ReSellerOwner>().Add(reSellerOwner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Reseller-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Add a paid module (PriceIncluded = false) with a price
        var paidModule = StoreModule.Create(store.Id, 2, 2000, false, 2000, 0, 25, tenantId);
        db.Set<StoreModule>().Add(paidModule);
        await db.SaveChangesAsync();

        return new ReSellerStoreFixture(user.Id, login, reSeller.Id, store.Id, owner.Id, tenantId);
    }

    /// <summary>
    /// Seed a second store that belongs to a different owner (not linked to the ReSeller).
    /// </summary>
    private async Task<Guid> SeedOtherStoreAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var otherLogin = $"other-{Guid.NewGuid():N}@test.com";
        var otherUser = User.Create(otherLogin, HashPassword("Password123"), "Other Owner", "0000000000", otherLogin, tenantId);
        db.Set<User>().Add(otherUser);
        await db.SaveChangesAsync();

        var owner = Owner.Create(otherUser.Id, false, tenantId, "Other Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Other-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        return store.Id;
    }

    private async Task CleanupReSellerStoreAsync(ReSellerStoreFixture f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var storePayments = db.Set<Domain.Entities.StorePayments.StorePayment>()
            .Where(sp => sp.StoreId == f.StoreId);
        db.Set<Domain.Entities.StorePayments.StorePayment>().RemoveRange(storePayments);

        var storeModules = db.Set<StoreModule>().Where(sm => sm.StoreId == f.StoreId);
        db.Set<StoreModule>().RemoveRange(storeModules);

        var stores = db.Set<Store>().Where(s => s.Id == f.StoreId);
        db.Set<Store>().RemoveRange(stores);

        var reSellerOwners = db.Set<ReSellerOwner>().Where(rso => rso.OwnerId == f.OwnerId);
        db.Set<ReSellerOwner>().RemoveRange(reSellerOwners);

        var owners = db.Set<Owner>().Where(o => o.Id == f.OwnerId);
        db.Set<Owner>().RemoveRange(owners);

        var reSellers = db.Set<ReSeller>().Where(r => r.Id == f.ReSellerId);
        db.Set<ReSeller>().RemoveRange(reSellers);

        var userRoles = db.Set<UserRole>().Where(ur => ur.UserId == f.UserId);
        db.Set<UserRole>().RemoveRange(userRoles);

        var users = db.Set<User>().Where(u => u.Id == f.UserId);
        db.Set<User>().RemoveRange(users);

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task ReSeller_pays_own_store_returns_200_and_creates_payment()
    {
        // Arrange
        var fixture = await SeedReSellerWithStoreAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            // Act
            var response = await client.PostAsync($"/api/v1/stores/{fixture.StoreId}/payments", null);

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().BeTrue();

            // Verify StorePayment row was created
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.SetTenantContext(tenantId: DataUtils.DefaultTenant.Id);
            var payment = await db.Set<Domain.Entities.StorePayments.StorePayment>()
                .Where(sp => sp.StoreId == fixture.StoreId)
                .OrderByDescending(sp => sp.PaymentBeforeDate)
                .FirstOrDefaultAsync();

            payment.Should().NotBeNull();
            payment!.ByReSeller.Should().BeTrue();
            payment.ReSellerId.Should().Be(fixture.ReSellerId);
            payment.ReSellerAmount.Should().BeGreaterThan(0);
            payment.StorePaymentStatusId.Should().Be((int)StorePaymentStatusType.Paid);
            payment.PaidDate.Should().NotBeNull();
        }
        finally
        {
            await CleanupReSellerStoreAsync(fixture);
        }
    }

    [Fact]
    public async Task ReSeller_pays_store_not_owned_returns_400()
    {
        // Arrange
        var fixture = await SeedReSellerWithStoreAsync();
        var otherStoreId = await SeedOtherStoreAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            // Act
            var response = await client.PostAsync($"/api/v1/stores/{otherStoreId}/payments", null);

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Set<Store>().RemoveRange(db.Set<Store>().Where(s => s.Id == otherStoreId));
            await db.SaveChangesAsync();
            await CleanupReSellerStoreAsync(fixture);
        }
    }
}
