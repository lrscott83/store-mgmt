using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.Features.StoreManagement.StorePayments.Queries.GetStorePaymentsHistory;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.StorePayments.Queries.GetStorePaymentsHistory;

public class GetStorePaymentsHistoryQueryTests
{
    private readonly Guid _reSellerUserId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();

    // ---------------------------------------------------------------------
    // Role guard (S2)
    // ---------------------------------------------------------------------

    [Fact]
    public async Task Handle_nonSuperAdmin_nonReSeller_throwsApiException()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage());

        var handler = CreateHandler(mocks);

        // Act
        var act = () => handler.Handle(new GetStorePaymentsHistoryQuery(), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);

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
        mocks.CapturedFilter!.IsCup.Should().BeFalse();
        result.Data!.Currency.Should().Be("USD");
    }

    [Fact]
    public async Task Handle_usdTab_mapsAmountFromPriceAndLeavesRateAndUsdOwedNull()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage(
            items: [Row(price: 25m, amountPaid: null, commission: 3m, exchangeRate: null)],
            total: 1, usdCount: 1));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentHistoryCurrency.Usd),
            CancellationToken.None);

        // Assert
        mocks.CapturedFilter!.IsCup.Should().BeFalse();

        var item = result.Data!.Items.Single();
        item.Amount.Should().Be(25m);
        item.Commission.Should().Be(3m);
        item.Currency.Should().Be("USD");
        item.ExchangeRate.Should().BeNull();
        item.AmountOwedUsd.Should().BeNull();
    }

    [Fact]
    public async Task Handle_cupTab_mapsAmountFromAmountPaidAndExposesRateAndUsdOwed()
    {
        // Arrange: a CUP payment is ONE charge — AmountPaid is the CUP total, Price stays the USD amount.
        var mocks = CreateMocks(BuildPage(
            items: [Row(price: 25m, amountPaid: 12_500m, commission: 3_125m, exchangeRate: 500m)],
            total: 1, cupCount: 1));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentHistoryCurrency.Cup),
            CancellationToken.None);

        // Assert
        mocks.CapturedFilter!.IsCup.Should().BeTrue();

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
            items: [Row(price: 25m, amountPaid: 12_500m, commission: 3_125m, exchangeRate: 500m)],
            total: 1, cupCount: 1, totalAmount: 12_500m, totalCommission: 3_125m));
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentHistoryCurrency.Cup),
            CancellationToken.None);

        // Assert
        result.Data!.TotalAmount.Should().Be(12_500m);
        result.Data.TotalCommission.Should().Be(3_125m);
        result.Data.Items.Single().Amount.Should().NotBe(25m + 12_500m);
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
            items: [Row(price: 25m), Row(price: 40m)],
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
            new GetStorePaymentsHistoryQuery(Currency: StorePaymentHistoryCurrency.Usd),
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
                Currency: StorePaymentHistoryCurrency.Cup,
                From: from,
                To: to,
                StoreId: _storeId,
                Page: 3),
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();

        var filter = mocks.CapturedFilter!;
        filter.IsCup.Should().BeTrue();
        filter.From.Should().Be(from);
        filter.To.Should().Be(to);
        filter.StoreId.Should().Be(_storeId);
        filter.Page.Should().Be(3);
    }

    [Fact]
    public async Task Handle_pageBelowOne_isClampedToOne()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage());
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

        var handler = CreateHandler(mocks);

        // Act
        var result = await handler.Handle(new GetStorePaymentsHistoryQuery(Page: 0), CancellationToken.None);

        // Assert
        mocks.CapturedFilter!.Page.Should().Be(1);
        result.Data!.Page.Should().Be(1);
    }

    [Fact]
    public async Task Handle_pageSizeIsFixedAtFifty()
    {
        // Arrange
        var mocks = CreateMocks(BuildPage());
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
        localizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));

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

    private static StorePaymentHistoryPage BuildPage(
        IReadOnlyList<StorePaymentHistoryRow>? items = null,
        int total = 0,
        int usdCount = 0,
        int cupCount = 0,
        decimal totalAmount = 0m,
        decimal totalCommission = 0m)
        => new(items ?? Array.Empty<StorePaymentHistoryRow>(), total, totalAmount, totalCommission, usdCount, cupCount);

    private static StorePaymentHistoryRow Row(
        decimal price = 25m,
        decimal? amountPaid = null,
        decimal commission = 3m,
        decimal? exchangeRate = null)
        => new(
            StoreId: Guid.NewGuid(),
            StoreName: "Tienda Historia",
            OwnerName: "Propietario Historia",
            PaidDate: new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero),
            PaymentBeforeDate: new DateTimeOffset(2026, 12, 1, 0, 0, 0, TimeSpan.Zero),
            Price: price,
            AmountPaid: amountPaid,
            Commission: commission,
            ExchangeRate: exchangeRate);

    private sealed class TestMocks
    {
        public required Mock<IHttpContextService> HttpContextService { get; init; }
        public required Mock<IStorePaymentRepository> PaymentRepository { get; init; }
        public required Mock<IStringLocalizer<I18n>> Localizer { get; init; }
        public StorePaymentHistoryFilter? CapturedFilter { get; set; }
    }

    #endregion
}
