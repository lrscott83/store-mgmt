using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

/// <summary>
/// store-payment-exchange-rate: registering a payment now accepts an OPTIONAL body with the
/// CUP-per-USD exchange rate and the total paid, persists both on the StorePayment (the charged
/// `Price` is unchanged), and uses the total paid as the reseller commission base when present.
/// A request with NO body keeps the previous shape, and the commissions read splits its monthly
/// total into USD and CUP.
/// </summary>
[Collection("e2e")]
public sealed class StorePaymentExchangeRateTests
{
    private readonly AppTestFactory _f;
    public StorePaymentExchangeRateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record ReSellerStoreFixture(
        Guid UserId, string Login, Guid ReSellerId, Guid StoreId, Guid OwnerId, Guid TenantId);

    private static string HashPassword(string password)
        => Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(password)));

    private async Task<ReSellerStoreFixture> SeedReSellerWithStoreAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"reseller-xr-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, HashPassword("Password123"), "E2E ReSeller XR", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = ReSeller.Create(user.Id, true, 0, 25, tenantId, "E2E ReSeller XR");
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();

        var owner = Owner.Create(user.Id, false, tenantId, "E2E ReSeller XR Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        db.Set<ReSellerOwner>().Add(ReSellerOwner.Create(reSeller.Id, owner.Id, 0, 25, tenantId));
        await db.SaveChangesAsync();

        var store = Store.Create($"XR-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        // A paid (not price-included) module of 2000 with NO discount, so the charged amount
        // and the USD-based commission are deterministic.
        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, 2, 2000, false, 2000, 0, 0, tenantId));
        await db.SaveChangesAsync();

        return new ReSellerStoreFixture(user.Id, login, reSeller.Id, store.Id, owner.Id, tenantId);
    }

    private async Task<StorePayment> PaymentForStoreAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.SetTenantContext(tenantId: DataUtils.DefaultTenant.Id);
        return await db.Set<StorePayment>()
            .Where(sp => sp.StoreId == storeId)
            .OrderByDescending(sp => sp.PaymentBeforeDate)
            .FirstAsync();
    }

    private async Task CleanupAsync(ReSellerStoreFixture f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        db.Set<StorePayment>().RemoveRange(db.Set<StorePayment>().IgnoreQueryFilters().Where(sp => sp.StoreId == f.StoreId));
        db.Set<StoreModule>().RemoveRange(db.Set<StoreModule>().IgnoreQueryFilters().Where(sm => sm.StoreId == f.StoreId));
        db.Set<Store>().RemoveRange(db.Set<Store>().IgnoreQueryFilters().Where(s => s.Id == f.StoreId));
        db.Set<ReSellerOwner>().RemoveRange(db.Set<ReSellerOwner>().IgnoreQueryFilters().Where(rso => rso.OwnerId == f.OwnerId));
        db.Set<Owner>().RemoveRange(db.Set<Owner>().IgnoreQueryFilters().Where(o => o.Id == f.OwnerId));
        db.Set<ReSeller>().RemoveRange(db.Set<ReSeller>().IgnoreQueryFilters().Where(r => r.Id == f.ReSellerId));
        db.Set<UserRole>().RemoveRange(db.Set<UserRole>().IgnoreQueryFilters().Where(ur => ur.UserId == f.UserId));
        db.Set<User>().RemoveRange(db.Set<User>().IgnoreQueryFilters().Where(u => u.Id == f.UserId));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Register_with_body_persists_rate_and_total_and_bases_the_commission_on_the_total()
    {
        var fixture = await SeedReSellerWithStoreAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var response = await client.PostAsJsonAsync(
                $"/api/v1/stores/{fixture.StoreId}/payments",
                new { exchangeRate = 400m, amountPaid = 10000m });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var payment = await PaymentForStoreAsync(fixture.StoreId);
            payment.Price.Should().Be(2000f, "the charged amount does not change");
            payment.ExchangeRate.Should().Be(400m);
            payment.AmountPaid.Should().Be(10000m);
            // Commission over the total paid: 10000 - GetCurrentPrice(10000, 25, 0) = 2500 (CUP).
            payment.ReSellerAmount.Should().Be(2500f,
                "the total paid is the commission base when it has a value");
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Register_without_body_keeps_the_previous_shape()
    {
        var fixture = await SeedReSellerWithStoreAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var response = await client.PostAsync($"/api/v1/stores/{fixture.StoreId}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var payment = await PaymentForStoreAsync(fixture.StoreId);
            payment.Price.Should().Be(2000f);
            payment.ExchangeRate.Should().BeNull();
            payment.AmountPaid.Should().BeNull();
            // Commission over the charged amount: 2000 - GetCurrentPrice(2000, 25, 0) = 500 (USD).
            payment.ReSellerAmount.Should().Be(500f);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Commissions_read_splits_the_monthly_total_into_usd_and_cup()
    {
        var fixture = await SeedReSellerWithStoreAsync();
        // A far month keeps these rows isolated from every other reseller payment in the run.
        var year = 2033;
        var month = 4;
        var due = new DateTimeOffset(new DateOnly(year, month, 1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        try
        {
            // Two payments in the SAME month for this store: one USD-based, one CUP-based.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StorePayment>().Add(StorePayment.Create(
                    fixture.StoreId, (int)StorePaymentStatusType.Paid, 2000f, due, year, month, fixture.TenantId,
                    reSellerId: fixture.ReSellerId, reSellerPercentDiscountPrice: 25f, reSellerDiscountPrice: 0f,
                    reSellerAmount: 500f, byReSeller: true, exchangeRate: null, amountPaid: null));
                db.Set<StorePayment>().Add(StorePayment.Create(
                    fixture.StoreId, (int)StorePaymentStatusType.Paid, 2000f, due, year, month, fixture.TenantId,
                    reSellerId: fixture.ReSellerId, reSellerPercentDiscountPrice: 25f, reSellerDiscountPrice: 0f,
                    reSellerAmount: 2500f, byReSeller: true, exchangeRate: 400m, amountPaid: 10000m));
                await db.SaveChangesAsync();
            }

            var login = $"admin-xr-{Guid.NewGuid():N}@test.com";
            var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
            try
            {
                var client = DbTestHelpers.AuthedClient(_f, saId, login);
                var res = await client.GetAsync("/api/v1/stores/reseller-commissions");
                res.StatusCode.Should().Be(HttpStatusCode.OK);
                var body = (await res.Content.ReadFromJsonAsync<ApiResponse<List<CommissionRow>>>(
                    ApiResponse.Json))!;
                body.Succeeded.Should().BeTrue();

                var row = body.Data!.Single(r => r.Year == year && r.Month == month);
                row.PaymentCount.Should().Be(2);
                row.TotalCommission.Should().Be(500f, "the USD-based payment");
                row.TotalCommissionCup.Should().Be(2500f, "the CUP-based payment");
            }
            finally
            {
                await DbTestHelpers.CleanupUserAsync(_f, saId);
            }
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    private sealed class CommissionRow
    {
        public int Year { get; set; }
        public int Month { get; set; }
        public int PaymentCount { get; set; }
        public float TotalCommission { get; set; }
        public float TotalCommissionCup { get; set; }
    }
}
