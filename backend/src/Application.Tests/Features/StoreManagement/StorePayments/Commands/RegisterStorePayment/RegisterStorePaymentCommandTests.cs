using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.StoreManagement.StorePayments.Commands.RegisterStorePayment;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.StorePayments.Commands.RegisterStorePayment;

/// <summary>
/// Unit tests for RegisterStorePaymentCommandHandler covering:
/// - SuperAdmin creates paid payment without commission
/// - ReSeller creates paid payment with commission
/// - ReSeller not owning store throws ApiException
/// - Store never activated throws ApiException
/// - Due date advances by one month
/// </summary>
public class RegisterStorePaymentCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IStorePaymentRepository> _mockStorePaymentRepository;
    private readonly Mock<ISystemConfigurationRepository> _mockConfigRepository;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _reSellerUserId = Guid.NewGuid();
    private readonly Guid _reSellerId = Guid.NewGuid();

    public RegisterStorePaymentCommandHandlerTests()
    {
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockStorePaymentRepository = new Mock<IStorePaymentRepository>();
        _mockConfigRepository = new Mock<ISystemConfigurationRepository>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();

        _mockLocalizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));
        _mockLocalizer.Setup(x => x["StoreNotFound"]).Returns(new LocalizedString("StoreNotFound", "Store not found"));
        _mockLocalizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));

        _mockConfigRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(1);

        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
    }

    private RegisterStorePaymentCommandHandler CreateHandler()
        => new(
            _mockUnitOfWork.Object,
            _mockStoreRepository.Object,
            _mockStorePaymentRepository.Object,
            _mockConfigRepository.Object,
            _mockHttpContextService.Object,
            _mockLocalizer.Object);

    private static Store CreateStore(DateOnly? paymentStartDate = null, Owner? owner = null)
    {
        var store = Store.Create("Test Store", Guid.NewGuid(), true, Guid.NewGuid(), paymentStartDate);
        store.StoreModules.Clear();
        if (owner is not null)
            store.Owner = owner;
        return store;
    }

    private static StoreModule CreateStoreModule(int moduleId, float price, bool modulePriceIncluded,
        float modulePercentDiscountPrice = 0, float moduleDiscountPrice = 0)
        => StoreModule.Create(
            Guid.Empty, moduleId, price, modulePriceIncluded,
            price, moduleDiscountPrice, modulePercentDiscountPrice, Guid.Empty);

    #region SuperAdmin Happy Path

    [Fact]
    public async Task Handle_superAdmin_createsPaidPayment_withAmountAndNoCommission_whenNoReseller()
    {
        // Arrange
        var freeModule = CreateStoreModule(1, 0, true);
        var paidModule = CreateStoreModule(2, 2000, false);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var store = CreateStore(paymentStartDate: today);
        store.StoreModules.Add(freeModule);
        store.StoreModules.Add(paidModule);

        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);

        _mockStoreRepository
            .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(It.IsAny<Guid>()))
            .ReturnsAsync(store);

        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);

        StorePayment? capturedPayment = null;
        _mockStorePaymentRepository
            .Setup(x => x.AddAsync(It.IsAny<StorePayment>()))
            .Callback<StorePayment>(sp => capturedPayment = sp);

        var handler = CreateHandler();
        var command = new RegisterStorePaymentCommand(Guid.NewGuid());

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        capturedPayment.Should().NotBeNull();
        capturedPayment!.Price.Should().Be(2000f);
        capturedPayment.ReSellerId.Should().BeNull();
        capturedPayment.ReSellerAmount.Should().Be(0f);
        capturedPayment.ByReSeller.Should().BeFalse();
        capturedPayment.StorePaymentStatusId.Should().Be((int)StorePaymentStatusType.Paid);
    }

    #endregion

    #region ReSeller Happy Path

    [Fact]
    public async Task Handle_reseller_setsByReSellerTrue_andComputesCommission()
    {
        // Arrange
        var ownerId = Guid.NewGuid();

        var paidModule = CreateStoreModule(2, 2000, false);
        var reSellerOwner = ReSellerOwner.Create(_reSellerId, ownerId, 0, 25, _tenantId);

        var owner = Owner.Create(ownerId, _reSellerUserId, false, _tenantId, "Test Owner");
        owner.ReSellerOwner = reSellerOwner;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var store = CreateStore(paymentStartDate: today, owner: owner);
        store.StoreModules.Add(paidModule);

        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(true);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_reSellerUserId.ToString());

        _mockStoreRepository
            .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(It.IsAny<Guid>()))
            .ReturnsAsync(store);

        _mockStoreRepository
            .Setup(x => x.IsStoreOwnedByReSellerUserAsync(It.IsAny<Guid>(), _reSellerUserId))
            .ReturnsAsync(true);

        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);

        StorePayment? capturedPayment = null;
        _mockStorePaymentRepository
            .Setup(x => x.AddAsync(It.IsAny<StorePayment>()))
            .Callback<StorePayment>(sp => capturedPayment = sp);

        var handler = CreateHandler();
        var command = new RegisterStorePaymentCommand(Guid.NewGuid());

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        capturedPayment.Should().NotBeNull();
        capturedPayment!.Price.Should().Be(2000f);
        capturedPayment.ByReSeller.Should().BeTrue();
        capturedPayment.ReSellerId.Should().Be(_reSellerId);
        // Commission: 2000 - GetCurrentPrice(2000, 25, 0) = 2000 - 1500 = 500
        capturedPayment.ReSellerAmount.Should().Be(500f);
        capturedPayment.ReSellerPercentDiscountPrice.Should().Be(25f);
        capturedPayment.ReSellerDiscountPrice.Should().Be(0f);
        capturedPayment.StorePaymentStatusId.Should().Be((int)StorePaymentStatusType.Paid);
    }

    #endregion

    #region Guard: ReSeller not owning store

    [Fact]
    public async Task Handle_reseller_notOwningStore_throwsApiException()
    {
        // Arrange
        var paidModule = CreateStoreModule(2, 2000, false);
        var store = CreateStore(paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow));
        store.StoreModules.Add(paidModule);

        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(true);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_reSellerUserId.ToString());

        _mockStoreRepository
            .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(It.IsAny<Guid>()))
            .ReturnsAsync(store);

        _mockStoreRepository
            .Setup(x => x.IsStoreOwnedByReSellerUserAsync(It.IsAny<Guid>(), _reSellerUserId))
            .ReturnsAsync(false);

        var handler = CreateHandler();
        var command = new RegisterStorePaymentCommand(Guid.NewGuid());

        // Act
        var act = () => handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    #endregion

    #region Guard: Store never activated

    [Fact]
    public async Task Handle_storeNeverActivatedPaid_throwsApiException()
    {
        // Arrange
        var paidModule = CreateStoreModule(2, 2000, false);
        var store = CreateStore(paymentStartDate: null);
        store.StoreModules.Add(paidModule);

        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);

        _mockStoreRepository
            .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(It.IsAny<Guid>()))
            .ReturnsAsync(store);

        var handler = CreateHandler();
        var command = new RegisterStorePaymentCommand(Guid.NewGuid());

        // Act
        var act = () => handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    #endregion

    #region Due Date

    [Fact]
    public async Task Handle_advancesDueDate_byOneMonth()
    {
        // Arrange
        var paymentStartDate = new DateOnly(2026, 1, 10);
        var paidModule = CreateStoreModule(2, 2000, false);
        var store = CreateStore(paymentStartDate: paymentStartDate);
        store.StoreModules.Add(paidModule);

        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);

        _mockStoreRepository
            .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(It.IsAny<Guid>()))
            .ReturnsAsync(store);

        // No previous payments → first due = paymentStartDate + trial(1) + 1 = 2026-03-10
        // New due = 2026-03-10 + 1 month = 2026-04-10
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);

        StorePayment? capturedPayment = null;
        _mockStorePaymentRepository
            .Setup(x => x.AddAsync(It.IsAny<StorePayment>()))
            .Callback<StorePayment>(sp => capturedPayment = sp);

        var handler = CreateHandler();
        var command = new RegisterStorePaymentCommand(Guid.NewGuid());

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        capturedPayment.Should().NotBeNull();
        var expectedDue = new DateOnly(2026, 4, 10);
        var actualDue = DateOnly.FromDateTime(capturedPayment!.PaymentBeforeDate.UtcDateTime);
        actualDue.Should().Be(expectedDue);
        capturedPayment.Year.Should().Be(expectedDue.Year);
        capturedPayment.Month.Should().Be(expectedDue.Month);
    }

    #endregion
}
