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
using Microsoft.Extensions.Localization;
using Resources;
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
        string? ReSellerLogin = null);

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
        await AddPaymentsAsync(db, storeId, DataUtils.DefaultTenant.Id, reSellerId: null);

        return new SeededStore(storeId, ownerId, ownerUserId);
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

    /// <summary>
    /// Adds the three fixture payments and PERSISTS them, like every sibling seeding helper in this
    /// suite (GetReSellerCommissionsTests, GetStoresToCollectTests): callers never save its entities.
    /// </summary>
    private static async Task AddPaymentsAsync(
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

        await db.SaveChangesAsync();
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

    /// <summary>
    /// Adds one more USD PAID payment that has NO <c>PaidDate</c> — a state the column allows and
    /// production can reach. Used to pin two things: such a row is excluded as soon as a date bound
    /// is applied, and without bounds it sorts LAST, never first.
    /// </summary>
    private async Task<Guid> AddUsdPaymentWithoutPaidDateAsync(Guid storeId, float price = 7f)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var payment = StorePayment.Create(
            storeId: storeId,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: price,
            paymentBeforeDate: new DateTimeOffset(2026, 12, 1, 0, 0, 0, TimeSpan.Zero),
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
        payment.PaidDate = null;
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
            var tiedPrice10Id = await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 3, 10), D(2026, 11, 20), price: 10f);
            var tiedPrice11Id = await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 3, 10), D(2026, 11, 20), price: 11f);
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
            // S11 key 3: the fully tied pair is ordered by Id — WHICH one comes first is asserted,
            // not merely that the order is stable, so an inverted tie-break direction fails here.
            var smallerIdPrice = IdOrdersBefore(tiedPrice10Id, tiedPrice11Id) ? 10m : 11m;
            items[2].Amount.Should().Be(smallerIdPrice);
            items[3].Amount.Should().Be(smallerIdPrice == 10m ? 11m : 10m);
            // S11 key 1 again: the fixture's own USD payment has the oldest PaidDate → last.
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

    /// <summary>
    /// The repository's third ordering key is <c>Id</c>, and PostgreSQL compares a <c>uuid</c>
    /// byte-wise over its 16 stored bytes — which are the BIG-ENDIAN layout (the textual order),
    /// NOT the layout <see cref="Guid.ToByteArray()"/> returns: that overload writes the first
    /// three fields little-endian, so a plain byte comparison predicts the wrong row whenever the
    /// first differing byte lands in one of them (this helper did exactly that and flaked ~50%).
    /// <c>ToByteArray(bigEndian: true)</c> (net8.0) is the layout Npgsql writes, so this predicts
    /// which of two tied rows the server must put first instead of assuming its answer is right.
    /// </summary>
    private static bool IdOrdersBefore(Guid candidate, Guid other)
        => candidate.ToByteArray(bigEndian: true).AsSpan()
            .SequenceCompareTo(other.ToByteArray(bigEndian: true)) < 0;

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

    /// <summary>
    /// S5: `from`/`to` are BOTH inclusive over <c>PaidDate</c>, and a payment with no PaidDate is
    /// excluded the moment a bound is applied (a null can satisfy neither comparison).
    /// </summary>
    [Fact]
    public async Task SuperAdmin_from_and_to_bounds_are_both_inclusive_and_hide_null_paid_dates()
    {
        var seeded = await SeedStoreWithPaymentsAsync("daterange");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            // The fixture's own USD payment sits on 2026-11-01, OUTSIDE the window queried below.
            await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 10, 0), D(2026, 11, 20), price: 10f);   // exactly `from`
            await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 20, 23), D(2026, 11, 20), price: 20f);  // late on the `to` day
            await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 21, 0), D(2026, 11, 20), price: 40f);   // the instant AFTER `to`
            await AddUsdPaymentWithoutPaidDateAsync(seeded.StoreId, price: 80f);                        // undated

            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.GetAsync(
                $"/api/v1/stores/payments?currency=USD&storeId={seeded.StoreId}&from=2026-11-10&to=2026-11-20");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(ApiResponse.Json);
            var data = body!.Data!;

            // Both bounds inclusive: the `from` day and the whole `to` day are in. The day after is
            // out, and so is the fixture payment that predates `from`.
            data.Items.Select(i => i.PaidDate!.Value)
                .Should().BeEquivalentTo(new[] { D(2026, 11, 10, 0), D(2026, 11, 20, 23) });

            // A row with no PaidDate cannot satisfy either bound → excluded.
            data.Items.Should().OnlyContain(i => i.PaidDate != null);

            // Counts and money totals obey the same bounds (the aggregates run on the same filter).
            data.Total.Should().Be(2);
            data.UsdCount.Should().Be(2);
            data.TotalAmount.Should().Be(30m);
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    /// <summary>
    /// R3-empty-filter-sum: a filter that matches no PAID payment still reaches the database, so this
    /// pins that the SQL aggregates over an EMPTY set answer 0 (not null, not a 500) with both counts
    /// at 0 — the zero-row path never short-circuits in memory.
    /// </summary>
    [Fact]
    public async Task SuperAdmin_filter_matching_nothing_returns_zero_totals_from_the_database()
    {
        var seeded = await SeedStoreWithPaymentsAsync("emptyfilter");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            // The store HAS CUP payments, but none in this 2020 window.
            var response = await client.GetAsync(
                $"/api/v1/stores/payments?currency=CUP&storeId={seeded.StoreId}&from=2020-01-01&to=2020-01-31");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var data = body.Data!;

            data.Items.Should().BeEmpty();
            data.Total.Should().Be(0);
            data.TotalAmount.Should().Be(0m);
            data.TotalCommission.Should().Be(0m);
            data.UsdCount.Should().Be(0);
            data.CupCount.Should().Be(0);
            data.Page.Should().Be(1);
            data.PageSize.Should().Be(50);
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    /// <summary>
    /// R3-null-paidate-order: PostgreSQL's DESC default is NULLS FIRST, which would float an undated
    /// payment to the top of a money screen. The endpoint must sort it LAST.
    /// </summary>
    [Fact]
    public async Task SuperAdmin_places_a_payment_with_no_paid_date_after_every_dated_row()
    {
        var seeded = await SeedStoreWithPaymentsAsync("nulldate");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            await AddUsdPaymentWithoutPaidDateAsync(seeded.StoreId, price: 7f);

            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.GetAsync(
                $"/api/v1/stores/payments?currency=USD&storeId={seeded.StoreId}");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(ApiResponse.Json);
            var data = body!.Data!;

            // With no date bound the undated row IS part of the tab — it must be visible, and last.
            data.Items.Should().HaveCount(2);
            data.Items[0].PaidDate.Should().Be(D(2026, 11, 1, 10));
            data.Items[^1].PaidDate.Should().BeNull();
            data.Total.Should().Be(2);
            data.TotalAmount.Should().Be(32m); // 25 (fixture) + 7 (undated)
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    /// <summary>
    /// R2-7/R3-currency-silent-coercion: `currency` is enum-bound, so an unrecognised value is a 400
    /// from model binding — never a silent USD answer for a CUP request.
    /// </summary>
    [Fact]
    public async Task SuperAdmin_unknown_currency_is_rejected_by_model_binding_not_coerced()
    {
        var seeded = await SeedStoreWithPaymentsAsync("badcurrency");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.GetAsync(
                $"/api/v1/stores/payments?currency=EUR&storeId={seeded.StoreId}");

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    /// <summary>
    /// R3-currency-numeric-coercion: a NUMERIC currency must never reach a tab. Observed behaviour of
    /// this app configuration: ASP.NET Core's enum binder refuses an undefined numeric value for a
    /// non-flags enum, so <c>?currency=7</c> is a 400 from model binding, surfaced through the unified
    /// ResponseResult with the offending parameter as the error code. The handler's own guard
    /// (<c>IsDefinedCurrency</c>) is the second line for any path that reaches the query without
    /// going through that binder; the Application test proves it directly. What this test pins is the
    /// part that matters on the wire: a 400 that names the parameter, and NO tab body.
    /// </summary>
    [Fact]
    public async Task SuperAdmin_out_of_range_numeric_currency_is_a_400_not_the_usd_tab()
    {
        var seeded = await SeedStoreWithPaymentsAsync("numericcurrency");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var response = await client.GetAsync(
                $"/api/v1/stores/payments?currency=7&storeId={seeded.StoreId}");

            response.StatusCode.Should().Be(
                HttpStatusCode.BadRequest,
                "an undefined currency is a bad request, not a silent USD tab");

            var body = await response.Content.ReadFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Data.Should().BeNull("no tab may be served for an undefined currency");
            body.ActionCode.Should().Be((int)HttpStatusCode.BadRequest);

            // The unified validation envelope carries one error per invalid parameter, keyed by that
            // parameter — so the client is told WHICH value was wrong instead of receiving a tab.
            var error = body.Errors.Should().ContainSingle().Which;
            error.Code.Should().Be("currency");
            error.Description.Should().NotBeNullOrWhiteSpace();
            error.Description.Should().NotBe("ApiRequestInvalid");
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    /// <summary>
    /// R3-page-clamp-unproved: the ONE page clamp lives in the repository
    /// (<c>page &lt; 1 ? 1 : page</c>) and the handler only echoes the effective value it gets back.
    /// This test is the only place the clamp is proved against real SQL: without it, <c>page=0</c>
    /// would compute <c>Skip(-50)</c> and no test in the change would notice.
    /// </summary>
    [Fact]
    public async Task SuperAdmin_page_below_one_is_clamped_to_first_page_and_page_two_skips_it()
    {
        var seeded = await SeedStoreWithPaymentsAsync("pageclamp");
        var login = $"admin-payments-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            // Two USD PAID rows in total (the fixture's + one extra) — the page size is fixed at 50.
            await AddUsdPaymentAsync(seeded.StoreId, D(2026, 11, 4, 10), D(2026, 11, 20), price: 10f);

            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            var clamped = await client.GetFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(
                $"/api/v1/stores/payments?currency=USD&storeId={seeded.StoreId}&page=0", ApiResponse.Json);

            var clampedData = clamped!.Data!;
            clampedData.Page.Should().Be(1, "the repository clamps page < 1 and reports the effective page");
            clampedData.PageSize.Should().Be(50);
            clampedData.Total.Should().Be(2, "the clamp must not change the filter-wide total");
            clampedData.Items.Should().HaveCount(2, "page 1 is the same first page a caller gets by default");
            clampedData.Items[0].PaidDate.Should().Be(D(2026, 11, 4, 10));

            var second = await client.GetFromJsonAsync<ApiResponse<PaymentsHistoryDto>>(
                $"/api/v1/stores/payments?currency=USD&storeId={seeded.StoreId}&page=2", ApiResponse.Json);

            var secondData = second!.Data!;
            secondData.Page.Should().Be(2, "a valid page is echoed unchanged, not clamped up or down");
            secondData.PageSize.Should().Be(50);
            secondData.Total.Should().Be(2, "the total is filter-wide, never the page");
            secondData.Items.Should().BeEmpty("two rows fit in page 1, so page 2 skips both");
        }
        finally
        {
            await CleanupAsync(seeded);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    /// <summary>
    /// R3-forbidden-contract-mocked-only: the handler's 403 backstop throws
    /// <c>_localizer["NotAuthorized"]</c> and the undefined-currency guard throws
    /// <c>_localizer["ApiRequestInvalid"]</c>. The unit tests prove both only against a MOCK — a mock
    /// answers whatever it is told, so a missing resource entry would ship the raw key text while
    /// every test stayed green. Here the localizer is the REAL one the API registers: no mock, no
    /// stub, so <c>ResourceNotFound</c> is the honest answer to "does the entry exist?".
    /// </summary>
    [Theory]
    [InlineData("NotAuthorized")]
    [InlineData("ApiRequestInvalid")]
    public void Denial_messages_resolve_to_real_resource_entries(string key)
    {
        using var scope = _f.Services.CreateScope();
        var localizer = scope.ServiceProvider.GetRequiredService<IStringLocalizer<I18n>>();

        var localized = localizer[key];

        localized.ResourceNotFound.Should().BeFalse(
            "the message must be a real resource entry, not the key echoed back at the client");
        localized.Value.Should().NotBeNullOrWhiteSpace();
        localized.Value.Should().NotBe(key);
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
