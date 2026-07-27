using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.Features.StoreManagement.StorePayments.Queries.GetReSellerCommissions;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.StorePayments;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.StorePayments.Queries.GetReSellerCommissions;

public class GetReSellerCommissionsQueryHandlerTests
{
    private readonly Guid _resellerUserId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    [Fact]
    public async Task Handle_superAdmin_returnsAllPaymentsGroupedByPeriod()
    {
        // Arrange
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        mocks.HttpContextService.Setup(x => x.IsReSeller).Returns(false);

        var payments = CreateTestPayments();
        mocks.PaymentRepository.Setup(x => x.GetAllPaidWithReSellerAsync())
            .ReturnsAsync(payments);

        var handler = new GetReSellerCommissionsQueryHandler(
            mocks.PaymentRepository.Object,
            mocks.HttpContextService.Object,
            mocks.Localizer.Object);

        // Act
        var result = await handler.Handle(new GetReSellerCommissionsQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(2);

        var first = result.Data.ElementAt(0);
        first.Year.Should().Be(2026);
        first.Month.Should().Be(6);
        first.PaymentCount.Should().Be(1);
        first.TotalCommission.Should().BeApproximately(200f, 0.001f);

        var second = result.Data.ElementAt(1);
        second.Year.Should().Be(2026);
        second.Month.Should().Be(5);
        second.PaymentCount.Should().Be(2);
        second.TotalCommission.Should().BeApproximately(800f, 0.001f);
    }

    [Fact]
    public async Task Handle_reSeller_returnsOnlyOwnPaymentsGroupedByPeriod()
    {
        // Arrange
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        mocks.HttpContextService.Setup(x => x.IsReSeller).Returns(true);
        mocks.HttpContextService.Setup(x => x.UserExternalId).Returns(_resellerUserId.ToString());

        var payments = CreateTestPayments().Take(2).ToList(); // reseller only sees 2 payments in May
        mocks.PaymentRepository.Setup(x => x.GetPaidWithReSellerByReSellerUserAsync(_resellerUserId))
            .ReturnsAsync(payments);

        var handler = new GetReSellerCommissionsQueryHandler(
            mocks.PaymentRepository.Object,
            mocks.HttpContextService.Object,
            mocks.Localizer.Object);

        // Act
        var result = await handler.Handle(new GetReSellerCommissionsQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);

        var first = result.Data.ElementAt(0);
        first.Year.Should().Be(2026);
        first.Month.Should().Be(5);
        first.PaymentCount.Should().Be(2);
        first.TotalCommission.Should().BeApproximately(800f, 0.001f);
    }

    [Fact]
    public async Task Handle_unauthorizedUser_throwsApiException()
    {
        // Arrange
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        mocks.HttpContextService.Setup(x => x.IsReSeller).Returns(false);

        var handler = new GetReSellerCommissionsQueryHandler(
            mocks.PaymentRepository.Object,
            mocks.HttpContextService.Object,
            mocks.Localizer.Object);

        // Act
        var act = () => handler.Handle(new GetReSellerCommissionsQuery(), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_noPayments_returnsEmptyList()
    {
        // Arrange
        var mocks = CreateMocks();
        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        mocks.HttpContextService.Setup(x => x.IsReSeller).Returns(false);
        mocks.PaymentRepository.Setup(x => x.GetAllPaidWithReSellerAsync())
            .ReturnsAsync(Enumerable.Empty<StorePayment>());

        var handler = new GetReSellerCommissionsQueryHandler(
            mocks.PaymentRepository.Object,
            mocks.HttpContextService.Object,
            mocks.Localizer.Object);

        // Act
        var result = await handler.Handle(new GetReSellerCommissionsQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeEmpty();
    }

    #region Helpers

    private TestMocks CreateMocks()
    {
        var localizer = new Mock<IStringLocalizer<I18n>>();
        localizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));

        return new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            PaymentRepository = new Mock<IStorePaymentRepository>(),
            Localizer = localizer,
        };
    }

    private List<StorePayment> CreateTestPayments()
    {
        var now = DateTimeOffset.UtcNow;
        return
        [
            StorePayment.Create(
                storeId: Guid.NewGuid(),
                storePaymentStatusId: (int)StorePaymentStatusType.Paid,
                price: 2000f,
                paymentBeforeDate: now,
                year: 2026,
                month: 5,
                tenantId: _tenantId,
                reSellerId: Guid.NewGuid(),
                reSellerPercentDiscountPrice: 25f,
                reSellerDiscountPrice: 0f,
                reSellerAmount: 500f,
                byReSeller: true),

            StorePayment.Create(
                storeId: Guid.NewGuid(),
                storePaymentStatusId: (int)StorePaymentStatusType.Paid,
                price: 1500f,
                paymentBeforeDate: now,
                year: 2026,
                month: 5,
                tenantId: _tenantId,
                reSellerId: Guid.NewGuid(),
                reSellerPercentDiscountPrice: 20f,
                reSellerDiscountPrice: 0f,
                reSellerAmount: 300f,
                byReSeller: true),

            StorePayment.Create(
                storeId: Guid.NewGuid(),
                storePaymentStatusId: (int)StorePaymentStatusType.Paid,
                price: 1000f,
                paymentBeforeDate: now,
                year: 2026,
                month: 6,
                tenantId: _tenantId,
                reSellerId: Guid.NewGuid(),
                reSellerPercentDiscountPrice: 20f,
                reSellerDiscountPrice: 0f,
                reSellerAmount: 200f,
                byReSeller: true),
        ];
    }

    private sealed class TestMocks
    {
        public Mock<IHttpContextService> HttpContextService { get; set; } = null!;
        public Mock<IStorePaymentRepository> PaymentRepository { get; set; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; set; } = null!;
    }

    #endregion
}