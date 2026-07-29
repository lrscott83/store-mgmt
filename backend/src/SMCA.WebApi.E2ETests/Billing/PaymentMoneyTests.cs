using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.StorePayments;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class PaymentMoneyTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public PaymentMoneyTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    [Fact]
    public async Task Payment_amount_equals_module_sum()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // Seed a store with a paid module (Statistics, id=6) priced at 1500
        var store = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2026, 6, 1), paidModulePrice: 1500f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.PostAsync(
                $"/api/v1/stores/{store.StoreId}/payments", null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            // Verify StorePayment.Price = sum of paid modules (Statistics=1500)
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.SetTenantContext(store.TenantId);
            var payment = await db.Set<StorePayment>()
                .Where(sp => sp.StoreId == store.StoreId)
                .OrderByDescending(sp => sp.PaymentBeforeDate)
                .FirstOrDefaultAsync();

            payment.Should().NotBeNull();
            payment!.Price.Should().Be(1500f);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Reseller_commission_is_persisted()
    {
        // Seed a ReSeller with 25% commission on a 2000 module
        var fx = await BillingSeed.SeedPaidStoreWithReSellerAsync(
            _f, new DateOnly(2026, 6, 1), paidModulePrice: 2000f,
            paidModulePercentDiscount: 0f, reSellerPercentDiscount: 25f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fx.UserId, fx.Login);
            var response = await client.PostAsync(
                $"/api/v1/stores/{fx.StoreId}/payments", null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            // Verify ReSellerAmount = 2000 × 25% = 500
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.SetTenantContext(fx.TenantId);
            var payment = await db.Set<StorePayment>()
                .Where(sp => sp.StoreId == fx.StoreId)
                .OrderByDescending(sp => sp.PaymentBeforeDate)
                .FirstOrDefaultAsync();

            payment.Should().NotBeNull();
            payment!.ReSellerId.Should().Be(fx.ReSellerId);
            payment.ReSellerAmount.Should().Be(500f);
            payment.ByReSeller.Should().BeTrue();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
        }
    }

    [Fact]
    public async Task Payment_due_date_advances_one_month()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // PaymentStartDate = Apr 1 → currentDue = Apr 1 + 2mo(trial) = Jun 1 → pay → newDue = Jul 1
        var store = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2026, 4, 1), paidModulePrice: 1000f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.PostAsync(
                $"/api/v1/stores/{store.StoreId}/payments", null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.SetTenantContext(store.TenantId);
            var payment = await db.Set<StorePayment>()
                .Where(sp => sp.StoreId == store.StoreId)
                .OrderByDescending(sp => sp.PaymentBeforeDate)
                .FirstOrDefaultAsync();

            payment.Should().NotBeNull();
            // PaymentBeforeDate should be July 2026
            payment!.PaymentBeforeDate.Year.Should().Be(2026);
            payment.PaymentBeforeDate.Month.Should().Be(7);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task Two_consecutive_payments_advance_two_months()
    {
        using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));

        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        // PaymentStartDate = Apr 1 → currentDue = Jun 1 → pay → Jul 1 → pay → Aug 1
        var store = await BillingSeed.SeedPaidStoreAsync(
            _f, new DateOnly(2026, 4, 1), paidModulePrice: 1000f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            // First payment
            var r1 = await client.PostAsync(
                $"/api/v1/stores/{store.StoreId}/payments", null);
            r1.StatusCode.Should().Be(HttpStatusCode.OK);

            // Second payment
            var r2 = await client.PostAsync(
                $"/api/v1/stores/{store.StoreId}/payments", null);
            r2.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.SetTenantContext(store.TenantId);
            var payments = await db.Set<StorePayment>()
                .Where(sp => sp.StoreId == store.StoreId)
                .OrderBy(sp => sp.PaymentBeforeDate)
                .ToListAsync();

            payments.Should().HaveCount(2);
            // First payment: July, second payment: August
            payments[0].PaymentBeforeDate.Month.Should().Be(7);
            payments[1].PaymentBeforeDate.Month.Should().Be(8);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
