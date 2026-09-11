using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Features.StoreManagement.Stores.Queries.GetStoresByCurrentUser;
using AutoMapper;
using Domain.Common.Constants;
using Domain.Entities.Stores;
using Domain.Entities.StorePayments;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;

namespace Application.Tests.Features.StoreManagement.Stores.Queries.GetStoresByCurrentUser;

public class GetStoresByCurrentUserQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IMapper> _mockMapper;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStorePaymentRepository> _mockStorePaymentRepository;
    private readonly Mock<ISystemConfigurationRepository> _mockSystemConfigurationRepository;
    private readonly GetStoresByCurrentUserQueryHandler _handler;
    private readonly Guid _userId;

    public GetStoresByCurrentUserQueryHandlerTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockMapper = new Mock<IMapper>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockStorePaymentRepository = new Mock<IStorePaymentRepository>();
        _mockSystemConfigurationRepository = new Mock<ISystemConfigurationRepository>();
        _userId = Guid.NewGuid();
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_userId.ToString());
        _mockSystemConfigurationRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(1);
        _handler = new GetStoresByCurrentUserQueryHandler(
            _mockStoreRepository.Object,
            _mockMapper.Object,
            _mockHttpContextService.Object,
            _mockStorePaymentRepository.Object,
            _mockSystemConfigurationRepository.Object);
    }

    [Fact]
    public async Task Handle_asSuperAdmin_uses_GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var stores = new List<Store> { CreateStore("Store 1") };
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(stores);
        SetupMapperPassThrough();
        SetupNoPayments();

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(DataUtils.DefaultStore.Id),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByReSellerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_asReSeller_uses_GetActiveStoresByReSellerUserIdAsync_with_currentUserId()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: false, isReSeller: true);
        var stores = new List<Store> { CreateStore("Store 1") };
        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByReSellerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(stores);
        SetupMapperPassThrough();
        SetupNoPayments();

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByReSellerUserIdAsync(_userId, DataUtils.DefaultStore.Id),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()),
            Times.Never);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_asRegularUser_uses_GetActiveStoresByUserIdAsync_with_currentUserId()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: false, isReSeller: false);
        var stores = new List<Store> { CreateStore("Store 1") };
        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(stores);
        SetupMapperPassThrough();
        SetupNoPayments();

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(_userId, DataUtils.DefaultStore.Id),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()),
            Times.Never);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByReSellerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_noStores_returns_empty_success()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: false, isReSeller: true);
        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByReSellerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store>());

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_free_store_has_null_next_payment_date()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var free = CreateStore("Free", paymentStartDate: null);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { free });
        var dto = new StoreDto { Id = free.Id };
        _mockMapper.Setup(x => x.Map<StoreDto>(free)).Returns(dto);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(free.Id))
            .ReturnsAsync((StorePayment?)null);

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert — null when the billing clock never started, never a 0001-01-01 sentinel.
        result.Data!.Single().NextPaymentDate.Should().BeNull();
    }

    [Fact]
    public async Task Handle_paid_store_without_payments_computes_first_due_date()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var start = new DateOnly(2026, 6, 1);
        var paid = CreateStore("Paid", paymentStartDate: start);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { paid });
        var dto = new StoreDto { Id = paid.Id };
        _mockMapper.Setup(x => x.Map<StoreDto>(paid)).Returns(dto);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(paid.Id))
            .ReturnsAsync((StorePayment?)null);

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert — canonical calculation: activation + trial(1) + 1 post-paid month.
        result.Data!.Single().NextPaymentDate.Should().Be(new DateOnly(2026, 8, 1));
    }

    [Fact]
    public async Task Handle_paid_store_with_payment_uses_last_paid_before_date()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var start = new DateOnly(2026, 1, 1);
        var paid = CreateStore("Paid", paymentStartDate: start);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { paid });
        var dto = new StoreDto { Id = paid.Id };
        _mockMapper.Setup(x => x.Map<StoreDto>(paid)).Returns(dto);
        var lastPaidBefore = new DateOnly(2026, 10, 15);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(paid.Id))
            .ReturnsAsync(CreatePayment(paid.Id, lastPaidBefore));

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Data!.Single().NextPaymentDate.Should().Be(lastPaidBefore);
    }

    [Fact]
    public async Task Handle_reads_the_trial_length_once_up_front()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { CreateStore("A"), CreateStore("B"), CreateStore("C") });
        _mockMapper
            .Setup(x => x.Map<StoreDto>(It.IsAny<Store>()))
            .Returns(new StoreDto());
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);

        // Act
        await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert — one trial read shared by every store (same shape as GetMyStoresQuery).
        _mockSystemConfigurationRepository.Verify(
            x => x.GetTestingPeriodInMonthsAsync(),
            Times.Once);
    }

    private void ArrangeRoles(bool isSuperAdmin, bool isReSeller)
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(isSuperAdmin);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(isReSeller);
    }

    /// <summary>
    /// The handler maps store-by-store (it must set NextPaymentDate on each mapped DTO
    /// afterwards), so every mapper mock uses the single-object overload.
    /// </summary>
    private void SetupMapperPassThrough()
    {
        _mockMapper
            .Setup(x => x.Map<StoreDto>(It.IsAny<Store>()))
            .Returns((Store src) => new StoreDto { Id = src.Id, Name = src.Name });
    }

    private void SetupNoPayments()
    {
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);
    }

    private static Store CreateStore(string name, DateOnly? paymentStartDate = null)
    {
        return Store.Create(name, Guid.NewGuid(), true, Guid.NewGuid(), paymentStartDate);
    }

    private static StorePayment CreatePayment(Guid storeId, DateOnly paidBefore)
    {
        return StorePayment.Create(
            storeId, 1, 10f,
            new DateTimeOffset(paidBefore.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            paidBefore.Year, paidBefore.Month, Guid.NewGuid(),
            reSellerId: null, 0, 0, 0, byReSeller: false);
    }
}