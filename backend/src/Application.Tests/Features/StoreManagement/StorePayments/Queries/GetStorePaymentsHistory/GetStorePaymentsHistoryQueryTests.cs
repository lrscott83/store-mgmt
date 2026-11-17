using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.Features.StoreManagement.StorePayments.Queries.GetStorePaymentsHistory;
using Domain.Common.Enums;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.StorePayments.Queries.GetStorePaymentsHistory;

public class GetStorePaymentsHistoryQueryTests
{
    private const string NotAuthorizedMessage = "No autorizado";
    private const string ApiRequestInvalidMessage = "La petición no es válida";

    private readonly Guid _reSellerUserId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();

    // ---------------------------------------------------------------------
    // Role guard (S2)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Handle_neitherSuperAdminNorReSeller_throwsForbiddenNotAuthorized()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage());

        var handler = CreateHandler(mocks);

        // Act
        var act = () => handler.Handle(new GetStorePaymentsHistoryQuery(), CancellationToken.None);

        // Assert: the denial says what actually happened. A 400 "UserNotFound" names a cause that
        // cannot be the cause here (the caller is authenticated; it is the role that is wrong).
        var exception = (await act.Should().ThrowAsync<ApiException>()).Which;
        exception.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        exception.Message.Should().Be(NotAuthorizedMessage);

        mocks.PaymentRepository.Verify(
            x => x.GetHistoryPageAsync(It.IsAny<StorePaymentHistoryFilter>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_superAdmin_queriesWithoutReSellerScope()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage(total: 1, usdCount: 1));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(new GetStorePaymentsHistoryQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        mocks.CapturedFilter!.ReSellerUserId.Should().BeNull();
    }

    [Fact]
    public async Task Handle_reSeller_scopesTheQueryToTheCaller()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage(total: 1, usdCount: 1));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        mocks.HttpContextService.Setup(x => x.IsReSeller).Returns(true);
        mocks.HttpContextService.Setup(x => x.UserExternalId).Returns(_reSellerUserId.ToString());

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(new GetStorePaymentsHistoryQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        mocks.CapturedFilter!.ReSellerUserId.Should().Be(_reSellerUserId);
    }

    // ---------------------------------------------------------------------
    // Currency filter and per-tab money mapping (S4, S7, S10)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Handle_defaultQuery_asksForTheUsdTab()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage());
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(new GetStorePaymentsHistoryQuery(), CancellationToken.None);

        // Assert
        mocks.CapturedFilter!.Currency.Should().Be(StorePaymentCurrency.Usd);
        result.Data!.Currency.Should().Be("USD");
    }

    [Fact]
    public async Task Handle_usdTab_mapsTheRepositoryAmountAndLeavesRateAndUsdOwedNull()
    {
        // Arrange: the repository already chose the money per currency. The handler copies it and
        // never re-derives a value from Price (which travels only for the CUP row's USD reference).
        var mocks = CreateMocks(BuildPage(
            items: [Row(amount: 25m, price: 25m, commission: 3m, exchangeRate: null)],
            total: 1, usdCount: 1));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentCurrency.Usd),
            CancellationToken.None);

        // Assert
        mocks.CapturedFilter!.Currency.Should().Be(StorePaymentCurrency.Usd);

        var item = result.Data!.Items.Single();
        item.Amount.Should().Be(25m);
        item.Commission.Should().Be(3m);
        item.Currency.Should().Be("USD");
        item.ExchangeRate.Should().BeNull();
        item.AmountOwedUsd.Should().BeNull();
    }

    [Fact]
    public async Task Handle_mapsTheRowAmountVerbatim_withoutAnyCurrencyBranch()
    {
        // The row carries the amount the repository selected for this currency. A mismatch between
        // Amount and Price must NOT be "fixed" here: that is exactly the fabrication this design
        // removed (a broken invariant has to surface, not turn into a plausible number).
        var mocks = CreateMocks(BuildPage(
            items: [Row(amount: 41.5m, price: 25m, commission: 3m)],
            total: 1, usdCount: 1));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentCurrency.Usd),
            CancellationToken.None);

        // Assert
        result.Data!.Items.Single().Amount.Should().Be(41.5m);
    }

    [Fact]
    public async Task Handle_cupTab_mapsTheRepositoryAmountAndExposesRateAndUsdOwed()
    {
        // Arrange: a CUP payment is ONE charge — Amount is the CUP total, Price stays the USD amount.
        var mocks = CreateMocks(BuildPage(
            items: [Row(amount: 12_500m, price: 25m, commission: 3_125m, exchangeRate: 500m)],
            total: 1, cupCount: 1));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentCurrency.Cup),
            CancellationToken.None);

        // Assert
        mocks.CapturedFilter!.Currency.Should().Be(StorePaymentCurrency.Cup);

        var item = result.Data!.Items.Single();
        item.Amount.Should().Be(12_500m);
        item.Commission.Should().Be(3_125m);
        item.Currency.Should().Be("CUP");
        item.ExchangeRate.Should().Be(500m);
        item.AmountOwedUsd.Should().Be(25m);
        result.Data.Currency.Should().Be("CUP");
    }

    [Fact]
    public async Task Handle_cupTab_neverMixesUsdAmountIntoTheCupAmount()
    {
        // S10: the CUP row's amount is the CUP total only. Price is exposed exclusively as
        // the USD reference (AmountOwedUsd), never added into Amount or the totals.
        var mocks = CreateMocks(BuildPage(
            items: [Row(amount: 12_500m, price: 25m, commission: 3_125m, exchangeRate: 500m)],
            total: 1, cupCount: 1, totalAmount: 12_500m, totalCommission: 3_125m));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentCurrency.Cup),
            CancellationToken.None);

        // Assert
        result.Data!.TotalAmount.Should().Be(12_500m);
        result.Data.TotalCommission.Should().Be(3_125m);
        result.Data.Items.Single().Amount.Should().NotBe(25m + 12_500m);
    }

    // ---------------------------------------------------------------------
    // Undefined currency values (R3-currency-numeric-coercion)
    // ---------------------------------------------------------------------

    /// <summary>
    /// ASP.NET Core binds ANY numeric string into an enum: <c>?currency=7</c> reaches the query as
    /// <c>(StorePaymentCurrency)7</c> instead of being rejected by model binding. Without a guard the
    /// repository's <c>== Cup</c> test reads it as USD and the endpoint answers 200 on the USD tab —
    /// the silent coercion this feature removed. The guard must answer 400 and never query.
    /// </summary>
    [Theory]
    [InlineData(2)]   // the first value past the defined range
    [InlineData(7)]   // the exact case reported by review
    [InlineData(-1)]
    public async Task Handle_undefinedCurrencyValue_throwsBadRequestAndNeverQueries(int rawCurrency)
    {
        // Arrange
        var mocks = CreateMocks(BuildPage(total: 1, usdCount: 1));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var act = () => handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: (StorePaymentCurrency)rawCurrency),
            CancellationToken.None);

        // Assert: the house shape (ApiException + localizer key), and NOT a USD tab.
        var exception = (await act.Should().ThrowAsync<ApiException>()).Which;
        exception.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Message.Should().Be(ApiRequestInvalidMessage);

        mocks.PaymentRepository.Verify(
            x => x.GetHistoryPageAsync(It.IsAny<StorePaymentHistoryFilter>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ---------------------------------------------------------------------
    // Wire value mapping (S13, R2-wire-value-implicit-default)
    // ---------------------------------------------------------------------

    /// <summary>Every DEFINED member has its own arm; no member falls through to a default.</summary>
    [Theory]
    [InlineData(StorePaymentCurrency.Usd, "USD")]
    [InlineData(StorePaymentCurrency.Cup, "CUP")]
    public void ToWireValue_maps_every_definedMember(StorePaymentCurrency currency, string expected)
        => currency.ToWireValue().Should().Be(expected);

    /// <summary>
    /// The enum is the single source of truth, so this test derives its rows FROM the enum instead
    /// of restating them. A hand-written theory cannot notice a member added later: the exhaustive
    /// switch would throw from <c>ToWireValue</c> and the guard would answer 400, while every
    /// explicitly listed case stayed green. Here a new currency must gain a wire value and remain
    /// served, or the suite goes red on the day it is written.
    /// </summary>
    [Fact]
    public void EveryEnumMember_hasAWireValue_andIsServed()
    {
        foreach (var currency in Enum.GetValues<StorePaymentCurrency>())
        {
            currency.IsDefinedCurrency().Should().BeTrue($"{currency} must be a served currency");
            currency.ToWireValue().Should().BeOneOf("USD", "CUP");
        }

        ((StorePaymentCurrency)7).IsDefinedCurrency().Should().BeFalse();
    }

    /// <summary>
    /// An out-of-range cast must not render as USD. The mapping is exhaustive per member, so an
    /// unmapped value throws instead of quietly becoming the USD wire string.
    /// </summary>
    [Theory]
    [InlineData(2)]
    [InlineData(7)]
    [InlineData(-1)]
    public void ToWireValue_throwsForAnUndefinedMember(int rawCurrency)
    {
        var act = () => ((StorePaymentCurrency)rawCurrency).ToWireValue();

        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    // ---------------------------------------------------------------------
    // Totals and counts (S6, S9)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Handle_totalsComeFromTheWholeFilter_notFromTheVisiblePage()
    {
        // The repository page holds 2 rows; the filter-wide totals and count come from the repo
        // aggregate. The handler must forward them untouched — never re-add the page rows.
        var mocks = CreateMocks(BuildPage(
            items: [Row(amount: 25m, price: 25m), Row(amount: 40m, price: 40m)],
            total: 37, usdCount: 37, cupCount: 88,
            totalAmount: 12_345m, totalCommission: 678m));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(new GetStorePaymentsHistoryQuery(), CancellationToken.None);

        // Assert
        result.Data!.Items.Should().HaveCount(2);
        result.Data.Total.Should().Be(37);
        result.Data.TotalAmount.Should().Be(12_345m);
        result.Data.TotalCommission.Should().Be(678m);
    }

    [Fact]
    public async Task Handle_bothTabCountsAreAlwaysReturned_regardlessOfSelectedCurrency()
    {
        // S6: the tab labels need both counts under the current filters, whatever tab is selected.
        var mocks = CreateMocks(BuildPage(total: 12, usdCount: 12, cupCount: 88));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var usd = await handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentCurrency.Usd),
            CancellationToken.None);

        // Assert
        usd.Data!.UsdCount.Should().Be(12);
        usd.Data.CupCount.Should().Be(88);
    }

    // ---------------------------------------------------------------------
    // Filters and pagination (S5)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Handle_dateAndStoreFilters_areForwardedToTheRepository()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage());
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var from = new DateOnly(2026, 11, 1);
        var to = new DateOnly(2026, 11, 30);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(
            new GetStorePaymentsHistoryQuery(
                Currency: StorePaymentCurrency.Cup,
                From: from,
                To: to,
                StoreId: _storeId,
                Page: 3),
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();

        var filter = mocks.CapturedFilter!;
        filter.Currency.Should().Be(StorePaymentCurrency.Cup);
        filter.From.Should().Be(from);
        filter.To.Should().Be(to);
        filter.StoreId.Should().Be(_storeId);
        filter.Page.Should().Be(3);
    }

    [Fact]
    public async Task Handle_doesNotClampThePage_andEchoesTheRepositoryResult()
    {
        // S5: the clamp lives in the repository, ONCE. The handler forwards the requested page
        // untouched and reports the effective page the repository used — never its own arithmetic.
        var mocks = CreateMocks(BuildPage(page: 1, pageSize: 50));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(new GetStorePaymentsHistoryQuery(Page: 0), CancellationToken.None);

        // Assert
        mocks.CapturedFilter!.Page.Should().Be(0);
        result.Data!.Page.Should().Be(1);
        result.Data.PageSize.Should().Be(50);
    }

    [Fact]
    public async Task Handle_pageSizeIsFixedAtFifty()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage(page: 2, pageSize: 50));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(new GetStorePaymentsHistoryQuery(Page: 2), CancellationToken.None);

        // Assert
        mocks.CapturedFilter!.PageSize.Should().Be(50);
        result.Data!.PageSize.Should().Be(50);
        result.Data.Page.Should().Be(2);
    }

    // ---------------------------------------------------------------------
    // Empty result (S12 backend side)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Handle_emptyResult_returnsEmptyItemsAndZeroTotals()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage());
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(new GetStorePaymentsHistoryQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.Items.Should().BeEmpty();
        result.Data.Total.Should().Be(0);
        result.Data.TotalAmount.Should().Be(0m);
        result.Data.TotalCommission.Should().Be(0m);
        result.Data.UsdCount.Should().Be(0);
        result.Data.CupCount.Should().Be(0);
    }

    #region Helpers

    private static GetStorePaymentsHistoryQueryHandler CreateHandler(TestMocks mocks)
        => new(mocks.PaymentRepository.Object, mocks.HttpContextService.Object, mocks.Localizer.Object);

    private TestMocks CreateMocks(StorePaymentHistoryPage page)
    {
        var localizer = new Mock<IStringLocalizer<I18n>>();
        // The two resource keys are wired through the SAME constants the assertions use, so the stub
        // and the expected text cannot drift apart (the real resource values are pinned end-to-end
        // by the E2E suite, which resolves the live IStringLocalizer instead of a mock).
        localizer.Setup(x => x["NotAuthorized"])
            .Returns(new LocalizedString("NotAuthorized", NotAuthorizedMessage));
        localizer.Setup(x => x["ApiRequestInvalid"])
            .Returns(new LocalizedString("ApiRequestInvalid", ApiRequestInvalidMessage));

        var mocks = new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            PaymentRepository = new Mock<IStorePaymentRepository>(),
            Localizer = localizer,
        };

        mocks.PaymentRepository
            .Setup(x => x.GetHistoryPageAsync(It.IsAny<StorePaymentHistoryFilter>(), It.IsAny<CancellationToken>()))
            .Callback<StorePaymentHistoryFilter, CancellationToken>((filter, _) => mocks.CapturedFilter = filter)
            .ReturnsAsync(page);

        return mocks;
    }

    /// <summary>
    /// Parameter order mirrors <see cref="StorePaymentHistoryPage"/> exactly, and the page is
    /// constructed with NAMED arguments, so a reshuffle cannot silently swap two values.
    /// </summary>
    private static StorePaymentHistoryPage BuildPage(
        IReadOnlyList<StorePaymentHistoryRow>? items = null,
        int total = 0,
        decimal totalAmount = 0m,
        decimal totalCommission = 0m,
        int usdCount = 0,
        int cupCount = 0,
        int page = 1,
        int pageSize = GetStorePaymentsHistoryQuery.PageSize)
        => new(
            Items: items ?? Array.Empty<StorePaymentHistoryRow>(),
            Total: total,
            TotalAmount: totalAmount,
            TotalCommission: totalCommission,
            UsdCount: usdCount,
            CupCount: cupCount,
            Page: page,
            PageSize: pageSize);

    private static StorePaymentHistoryRow Row(
        decimal amount = 25m,
        decimal price = 25m,
        decimal commission = 3m,
        decimal? exchangeRate = null)
        => new(
            StoreId: Guid.NewGuid(),
            StoreName: "Tienda Historia",
            OwnerName: "Propietario Historia",
            PaidDate: new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero),
            PaymentBeforeDate: new DateTimeOffset(2026, 12, 1, 0, 0, 0, TimeSpan.Zero),
            Amount: amount,
            Commission: commission,
            ExchangeRate: exchangeRate,
            Price: price);

    private sealed class TestMocks
    {
        public required Mock<IHttpContextService> HttpContextService { get; init; }
        public required Mock<IStorePaymentRepository> PaymentRepository { get; init; }
        public required Mock<IStringLocalizer<I18n>> Localizer { get; init; }
        public StorePaymentHistoryFilter? CapturedFilter { get; set; }
    }

    #endregion
}
