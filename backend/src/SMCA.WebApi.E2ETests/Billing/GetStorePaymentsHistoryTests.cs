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
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

/// <summary>
/// store-payments-history (T1): GET /api/v1/stores/payments against real PostgreSQL.
/// A payment is ONE charge in ONE currency — USD when AmountPaid is null, CUP when it has a value —
/// so the currency tab is the discriminator and a row never shows both currencies as money.
/// </summary>
[Collection("e2e")]
public sealed class GetStorePaymentsHistoryTests
{
    private readonly AppTestFactory _f;
    public GetStorePaymentsHistoryTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const float UsdPrice = 25f;
    private const float UsdCommission = 3.75f;
    private const decimal CupAmountPaid = 12_500m;
    private const float CupCommission = 3_125f;
    private const decimal CupExchangeRate = 500m;

    private sealed record SeededStore(
        Guid StoreId,
        Guid OwnerId,
        Guid OwnerUserId,
        Guid? ReSellerId = null,
        Guid? ReSellerUserId = null,
        string? ReSellerLogin = null,
        Guid? UsdPaymentId = null);

    // ------------------------------------------------------------------
    // Seeding
    // ------------------------------------------------------------------

    /// <summary>Owner user + Owner + Store (nothing else). Returns the three ids for cleanup.</summary>
    private async Task<(Guid OwnerUserId, Guid OwnerId, Guid StoreId)> SeedOwnerStoreAsync(string label)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"owner-payments-{label}-{Guid.NewGuid():N}@test.com";

        var ownerUser = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            $"Owner Payments {label}", "0000000000", login, tenantId);
        db.Set<User>().Add(ownerUser);
        await db.SaveChangesAsync();

        var owner = Owner.Create(ownerUser.Id, false, tenantId, $"Owner Payments {label}");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Payments-{label}-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            new DateOnly(2026, 1, 1));
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        return (ownerUser.Id, owner.Id, store.Id);
    }

    /// <summary>
    /// Three payments on the store: one USD (AmountPaid null), one CUP (AmountPaid + ExchangeRate)
    /// and one NOT PAID (status Notified, USD shaped) that must never be returned (S3).
    /// </summary>
    private async Task<SeededStore> SeedStoreWithPaymentsAsync(string label)
    {
        var (ownerUserId, ownerId, storeId) = await SeedOwnerStoreAsync(label);

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var payments = await AddPaymentsAsync(db, storeId, DataUtils.DefaultTenant.Id, reSellerId: null);
        await db.SaveChangesAsync();

        return new SeededStore(storeId, ownerId, ownerUserId, UsdPaymentId: payments.UsdPaymentId);
    }

    /// <summary>A store owned by an owner who belongs to a ReSeller, plus the same three payments.</summary>
    private async Task<SeededStore> SeedReSellerStoreWithPaymentsAsync(string label)
    {
        var (ownerUserId, ownerId, storeId) = await SeedOwnerStoreAsync(label);

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var reSellerLogin = $"reseller-payments-{Guid.NewGuid():N}@test.com";

        var reSellerUser = User.Create(reSellerLogin, DbTestHelpers.HashPassword("Password123"),
            $"ReSeller Payments {label}", "0000000000", reSellerLogin, tenantId);
        db.Set<User>().Add(reSellerUser);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(reSellerUser.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = ReSeller.Create(reSellerUser.Id, true, 0, 25, tenantId, $"E2E Payments ReSeller {label}");
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();

        db.Set<ReSellerOwner>().Add(ReSellerOwner.Create(reSeller.Id, ownerId, 0, 25, tenantId));
        await db.SaveChangesAsync();

        await AddPaymentsAsync(db, storeId, tenantId, reSeller.Id);
        await db.SaveChangesAsync();

        return new SeededStore(storeId, ownerId, ownerUserId, reSeller.Id, reSellerUser.Id, reSellerLogin);
    }

    /// <summary>An unrelated store (no ReSeller) whose payments a ReSeller must never see (S2).</summary>
    private async Task<SeededStore> SeedForeignStoreWithPaymentAsync(string label)
    {
        var (ownerUserId, ownerId, storeId) = await SeedOwnerStoreAsync(label);

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var payment = StorePayment.Create(
            storeId: storeId,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: 99f,
            paymentBeforeDate: new DateTimeOffset(2026, 12, 1, 0, 0, 0, TimeSpan.Zero),
            year: 2026,
            month: 11,
            tenantId: DataUtils.DefaultTenant.Id,
            reSellerId: null,
            reSellerPercentDiscountPrice: 0f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: 9f,
            byReSeller: false,
            exchangeRate: null,
            amountPaid: null);
        payment.PaidDate = new DateTimeOffset(2026, 11, 2, 10, 0, 0, TimeSpan.Zero);
        db.Set<StorePayment>().Add(payment);
        await db.SaveChangesAsync();

        return new SeededStore(storeId, ownerId, ownerUserId);
    }

    private static async Task<(Guid UsdPaymentId, Guid CupPaymentId)> AddPaymentsAsync(
        ApplicationDbContext db, Guid storeId, Guid tenantId, Guid? reSellerId)
    {
        var usdPayment = StorePayment.Create(
            storeId: storeId,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: UsdPrice,
            paymentBeforeDate: new DateTimeOffset(2026, 12, 1, 0, 0, 0, TimeSpan.Zero),
            year: 2026,
            month: 11,
            tenantId: tenantId,
            reSellerId: reSellerId,
            reSellerPercentDiscountPrice: 25f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: UsdCommission,
            byReSeller: reSellerId is not null,
            exchangeRate: null,
            amountPaid: null);
        usdPayment.PaidDate = new DateTimeOffset(2026, 11, 1, 10, 0, 0, TimeSpan.Zero);
        db.Set<StorePayment>().Add(usdPayment);

        var cupPayment = StorePayment.Create(
            storeId: storeId,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: UsdPrice,
            paymentBeforeDate: new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero),
            year: 2026,
            month: 10,
            tenantId: tenantId,
            reSellerId: reSellerId,
            reSellerPercentDiscountPrice: 25f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: CupCommission,
            byReSeller: reSellerId is not null,
            exchangeRate: CupExchangeRate,
            amountPaid: CupAmountPaid);
        cupPayment.PaidDate = new DateTimeOffset(2026, 10, 1, 10, 0, 0, TimeSpan.Zero);
        db.Set<StorePayment>().Add(cupPayment);

        // S3: a payment that is NOT Paid must never appear in "cobros realizados".
        var notifiedPayment = StorePayment.Create(
            storeId: storeId,
            storePaymentStatusId: (int)StorePaymentStatusType.Notified,
            price: UsdPrice,
            paymentBeforeDate: new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero),
            year: 2026,
            month: 9,
            tenantId: tenantId,
            reSellerId: reSellerId,
            reSellerPercentDiscountPrice: 25f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: UsdCommission,
            byReSeller: reSellerId is not null,
            exchangeRate: null,
            amountPaid: null);
        notifiedPayment.PaidDate = new DateTimeOffset(2026, 9, 1, 10, 0, 0, TimeSpan.Zero);
        db.Set<StorePayment>().Add(notifiedPayment);

        await Task.CompletedTask;

        return (usdPayment.Id, cupPayment.Id);
    }

    /// <summary>Adds one extra USD PAID payment (AmountPaid null) and returns its id.</summary>
    private async Task<Guid> AddUsdPaymentAsync(
        Guid storeId, DateTimeOffset paidDate, DateTimeOffset paymentBeforeDate, float price = 10f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var payment = StorePayment.Create(
            storeId: storeId,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: price,
            paymentBeforeDate: paymentBeforeDate,
            year: 2026,
            month: 11,
            tenantId: DataUtils.DefaultTenant.Id,
            reSellerId: null,
            reSellerPercentDiscountPrice: 0f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: 1f,
            byReSeller: false,
            exchangeRate: null,
            amountPaid: null);
        payment.PaidDate = paidDate;
        db.Set<StorePayment>().Add(payment);
        await db.SaveChangesAsync();

        return payment.Id;
    }

    private async Task CleanupAsync(params SeededStore[] seeds)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storeIds = seeds.Select(s => s.StoreId).ToArray();
        var ownerIds = seeds.Select(s => s.OwnerId).ToArray();
        var userIds = seeds.Select(s => s.OwnerUserId)
            .Concat(seeds.Where(s => s.ReSellerUserId is not null).Select(s => s.ReSellerUserId!.Value))
            .ToArray();
        var reSellerIds = seeds.Where(s => s.ReSellerId is not null)
            .Select(s => s.ReSellerId!.Value).ToArray();

        var payments = db.Set<StorePayment>().IgnoreQueryFilters()
            .Where(sp => storeIds.Contains(sp.StoreId));
        db.Set<StorePayment>().RemoveRange(payments);
        await db.SaveChangesAsync();

        var stores = db.Set<Store>().IgnoreQueryFilters().Where(s => storeIds.Contains(s.Id));
        db.Set<Store>().RemoveRange(stores);
        await db.SaveChangesAsync();

        var reSellerOwners = db.Set<ReSellerOwner>().IgnoreQueryFilters()
            .Where(rso => ownerIds.Contains(rso.OwnerId));
        db.Set<ReSellerOwner>().RemoveRange(reSellerOwners);
        await db.SaveChangesAsync();

        var owners = db.Set<Owner>().IgnoreQueryFilters().Where(o => ownerIds.Contains(o.Id));
        db.Set<Owner>().RemoveRange(owners);
        await db.SaveChangesAsync();

        var reSellers = db.Set<ReSeller>().IgnoreQueryFilters().Where(r => reSellerIds.Contains(r.Id));
        db.Set<ReSeller>().RemoveRange(reSellers);
        await db.SaveChangesAsync();

        var userRoles = db.Set<UserRole>().IgnoreQueryFilters().Where(ur => userIds.Contains(ur.UserId));
        db.Set<UserRole>().RemoveRange(userRoles);
        await db.SaveChangesAsync();

        var users = db.Set<User>().IgnoreQueryFilters().Where(u => userIds.Contains(u.Id));
        db.Set<User>().RemoveRange(users);
        await db.SaveChangesAsync();
    }

    // ------------------------------------------------------------------
    // Tests
    // ------------------------------------------------------------------
    [Fact]
    public async Task SuperAdmin_orders_newest_first_and_keeps_a_stable_tie_break()
    {
        var seeded = await SeedStoreWithPaymentsAsync("order");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            // Two extra USD rows that tie on BOTH date keys, with different amounts so the Id
            // tie-break is observable, plus one newest row and one later-period row on the tie date.
            await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 3, 10), D(2026, 11, 20), price: 10f);
            await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 3, 10), D(2026, 11, 20), price: 11f);
            await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 5, 10), D(2026, 12, 1), price: 20f);
            await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 3, 10), D(2026, 12, 15), price: 30f);

            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var url = $"/api/v1/stores/payments?currency=USD&storeId={seeded.StoreId}";

            var first = await client.GetFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(url, ApiResponse.Json);
            var second = await client.GetFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(url, ApiResponse.Json);

            var items = first!.Data!.Items;
            items.Should().HaveCount(5); // 4 extra USD rows + the one seeded by the fixture

            // S11 key 1: PaidDate DESC.
            items[0].PaidDate.Should().Be(D(2026, 11, 5, 10));
            // S11 key 2: the 2026-11-03 tie is broken by PaymentBeforeDate DESC.
            items[1].PaymentBeforeDate.Should().Be(D(2026, 12, 15));
            items[2].PaymentBeforeDate.Should().Be(D(2026, 11, 20));
            items[3].PaymentBeforeDate.Should().Be(D(2026, 11, 20));
            // S11 key 3: the fixture's own USD payment has the oldest PaidDate → last.
            items[4].PaidDate.Should().Be(D(2026, 11, 1, 10));

            // Stable tie-break: the tied pair keeps its relative order across identical requests.
            first.Data.Items.Select(i => (i.PaidDate, i.PaymentBeforeDate, i.Amount))
                .Should().Equal(second!.Data!.Items.Select(i => (i.PaidDate, i.PaymentBeforeDate, i.Amount)));
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    private static DateTimeOffset D(int year, int month, int day, int hour = 0)
        => new(year, month, day, hour, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SuperAdmin_USD_tab_returns_usd_payments_with_both_tab_counts()
    {
        var seeded = await SeedStoreWithPaymentsAsync("usd");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            var response = await client.GetAsync(
                $"/api/v1/stores/payments?currency=USD&storeId={seeded.StoreId}");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var data = body.Data!;

            data.Currency.Should().Be("USD");
            data.Page.Should().Be(1);
            data.PageSize.Should().Be(50);

            // S3: the Notified payment is excluded — only the two Paid rows exist at all.
            data.Total.Should().Be(1);
            data.UsdCount.Should().Be(1);
            // S6: the CUP count is present even though the USD tab is selected.
            data.CupCount.Should().Be(1);

            data.Items.Should().HaveCount(1);
            var item = data.Items[0];
            item.StoreId.Should().Be(seeded.StoreId);
            item.StoreName.Should().NotBeNullOrWhiteSpace();
            item.OwnerName.Should().NotBeNullOrWhiteSpace();
            item.Currency.Should().Be("USD");
            item.Amount.Should().Be(25m);
            item.Commission.Should().Be(3.75m);
            // The USD row has nothing to explain: no rate, no USD-owed reference.
            item.ExchangeRate.Should().BeNull();
            item.AmountOwedUsd.Should().BeNull();

            // S9: totals come from the backend over the whole filter.
            data.TotalAmount.Should().Be(25m);
            data.TotalCommission.Should().Be(3.75m);
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task SuperAdmin_CUP_tab_returns_cup_amount_with_exchange_rate_and_usd_owed()
    {
        var seeded = await SeedStoreWithPaymentsAsync("cup");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            var response = await client.GetAsync(
                $"/api/v1/stores/payments?currency=CUP&storeId={seeded.StoreId}");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var data = body.Data!;

            data.Currency.Should().Be("CUP");
            data.Total.Should().Be(1);
            data.UsdCount.Should().Be(1);
            data.CupCount.Should().Be(1);

            data.Items.Should().HaveCount(1);
            var item = data.Items[0];
            item.Currency.Should().Be("CUP");
            // S7: Monto = AmountPaid (CUP); Comisión = ReSellerAmount (CUP).
            item.Amount.Should().Be(12_500m);
            item.Commission.Should().Be(3_125m);
            // S8 backend side: the CUP row carries the rate and what was owed in USD.
            item.ExchangeRate.Should().Be(500m);
            item.AmountOwedUsd.Should().Be(25m);

            // S10: the CUP totals are CUP-only — the USD Price is never added into them.
            data.TotalAmount.Should().Be(12_500m);
            data.TotalCommission.Should().Be(3_125m);
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    [Fact]
    public async Task ReSeller_sees_only_payments_of_its_own_stores()
    {
        var own = await SeedReSellerStoreWithPaymentsAsync("reseller");
        var foreign = await SeedForeignStoreWithPaymentAsync("reseller");

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, own.ReSellerUserId!.Value, own.ReSellerLogin!);

            var response = await client.GetAsync("/api/v1/stores/payments?currency=USD");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var data = body.Data!;

            // S2: the ReSeller scope lives in the query — the foreign store never appears and
            // never inflates the counts.
            data.Items.Should().OnlyContain(i => i.StoreId == own.StoreId);
            data.Items.Should().NotContain(i => i.StoreId == foreign.StoreId);
            data.Total.Should().Be(1);
            data.UsdCount.Should().Be(1);
            data.CupCount.Should().Be(1);
        }
        finally
        {
            await CleanupAsync(own, foreign);
        }
    }

    // ------------------------------------------------------------------
    // Response DTOs (test-local, mirroring S13)
    // ------------------------------------------------------------------

    private sealed class PaymentsHistoryDto
    {
        public string Currency { get; set; } = string.Empty;
        public List<PaymentItemDto> Items { get; set; } = new();
        public int Total { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal TotalCommission { get; set; }
        public int UsdCount { get; set; }
        public int CupCount { get; set; }
    }

    private sealed class PaymentItemDto
    {
        public Guid StoreId { get; set; }
        public string StoreName { get; set; } = string.Empty;
        public string OwnerName { get; set; } = string.Empty;
        public DateTimeOffset? PaidDate { get; set; }
        public DateTimeOffset PaymentBeforeDate { get; set; }
        public decimal Amount { get; set; }
        public decimal Commission { get; set; }
        public string Currency { get; set; } = string.Empty;
        public decimal? ExchangeRate { get; set; }
        public decimal? AmountOwedUsd { get; set; }
    }
}
