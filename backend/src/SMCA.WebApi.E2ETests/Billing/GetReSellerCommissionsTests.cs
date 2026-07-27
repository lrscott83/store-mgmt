using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class GetReSellerCommissionsTests
{
    private readonly AppTestFactory _f;
    public GetReSellerCommissionsTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record ResellerWithPaymentsFixture(
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
    /// Seed a ReSeller user + ReSeller entity + Owner (with ReSellerOwner) + Store with a paid module,
    /// plus two StorePayment records with ByReSeller=true for May and June 2026.
    /// </summary>
    private async Task<ResellerWithPaymentsFixture> SeedResellerWithPaymentsAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"reseller-comm-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, HashPassword("Password123"), "E2E Commissions", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = ReSeller.Create(user.Id, true, 0, 25, tenantId, "E2E Commissions ReSeller");
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Commissions Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var reSellerOwner = ReSellerOwner.Create(reSeller.Id, owner.Id, 0, 25, tenantId);
        db.Set<ReSellerOwner>().Add(reSellerOwner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Comm-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            new DateOnly(2026, 1, 1));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // Create 2 StorePayments: one in May, one in June 2026
        var mayPayment = StorePayment.Create(
            storeId: store.Id,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: 2000f,
            paymentBeforeDate: new DateTimeOffset(2026, 5, 15, 0, 0, 0, TimeSpan.Zero),
            year: 2026,
            month: 5,
            tenantId: tenantId,
            reSellerId: reSeller.Id,
            reSellerPercentDiscountPrice: 25f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: 500f,
            byReSeller: true);
        db.Set<StorePayment>().Add(mayPayment);

        var junePayment = StorePayment.Create(
            storeId: store.Id,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: 1000f,
            paymentBeforeDate: new DateTimeOffset(2026, 6, 15, 0, 0, 0, TimeSpan.Zero),
            year: 2026,
            month: 6,
            tenantId: tenantId,
            reSellerId: reSeller.Id,
            reSellerPercentDiscountPrice: 20f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: 200f,
            byReSeller: true);
        db.Set<StorePayment>().Add(junePayment);

        await db.SaveChangesAsync();

        return new ResellerWithPaymentsFixture(user.Id, login, reSeller.Id, store.Id, owner.Id, tenantId);
    }

    private async Task CleanupAsync(ResellerWithPaymentsFixture f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var payments = db.Set<StorePayment>().Where(sp => sp.StoreId == f.StoreId);
        db.Set<StorePayment>().RemoveRange(payments);

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
    public async Task ReSeller_gets_own_commissions_grouped_by_period()
    {
        // Arrange
        var fixture = await SeedResellerWithPaymentsAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            // Act
            var response = await client.GetAsync("/api/v1/stores/reseller-commissions");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<ReSellerCommissionDto>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().HaveCount(2);

            // First: 2026-06, count 1, total 200
            body.Data[0].Year.Should().Be(2026);
            body.Data[0].Month.Should().Be(6);
            body.Data[0].PaymentCount.Should().Be(1);
            body.Data[0].TotalCommission.Should().BeApproximately(200f, 0.001f);

            // Second: 2026-05, count 1, total 500
            body.Data[1].Year.Should().Be(2026);
            body.Data[1].Month.Should().Be(5);
            body.Data[1].PaymentCount.Should().Be(1);
            body.Data[1].TotalCommission.Should().BeApproximately(500f, 0.001f);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    private sealed record ReSellerCommissionDto
    {
        public int Year { get; set; }
        public int Month { get; set; }
        public int PaymentCount { get; set; }
        public float TotalCommission { get; set; }
    }
}