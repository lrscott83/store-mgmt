using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Features.StoreManagement.Stores.Queries.GetStoresByCurrentUser;
using AutoMapper;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Modules;
using Domain.Entities.Plans;
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
    private readonly Mock<IPlanRepository> _mockPlanRepository;
    private readonly GetStoresByCurrentUserQueryHandler _handler;
    private readonly Guid _userId;

    public GetStoresByCurrentUserQueryHandlerTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockMapper = new Mock<IMapper>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockStorePaymentRepository = new Mock<IStorePaymentRepository>();
        _mockSystemConfigurationRepository = new Mock<ISystemConfigurationRepository>();
        _mockPlanRepository = new Mock<IPlanRepository>();
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
            _mockSystemConfigurationRepository.Object,
            _mockPlanRepository.Object);
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
    public async Task Handle_disapproved_store_with_recorded_payment_returns_null_next_payment_date()
    {
        // REQ-2: a disapproved store's recorded payment must NOT resurrect the date.
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var start = new DateOnly(2026, 1, 1);
        var disapproved = CreateStore("Disapproved", paymentStartDate: start, approved: false);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { disapproved });
        var dto = new StoreDto { Id = disapproved.Id };
        _mockMapper.Setup(x => x.Map<StoreDto>(disapproved)).Returns(dto);
        var lastPaidBefore = new DateOnly(2026, 10, 15);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(disapproved.Id))
            .ReturnsAsync(CreatePayment(disapproved.Id, lastPaidBefore));

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert — Approved guard wraps the whole computation, so even a recorded
        // payment with non-null PaymentStartDate stays hidden.
        result.Data!.Single().NextPaymentDate.Should().BeNull();
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

    [Fact]
    public async Task Handle_stores_sharing_a_plan_get_the_same_canonical_price_regardless_of_snapshot()
    {
        // Plan 2026-09-15: the card price is Σ over the plan's member MODULES (live
        // catalog, PlanProfile's formula) — two stores on the same plan with wildly
        // different StoreModule snapshots must expose identical canonical prices.
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var bloated = CreateStore("Bloated");   // StorePlanId defaults to Pago
        var lean = CreateStore("Lean");         // StorePlanId defaults to Pago
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { bloated, lean });
        _mockMapper.Setup(x => x.Map<StoreDto>(bloated)).Returns(new StoreDto { Id = bloated.Id });
        _mockMapper.Setup(x => x.Map<StoreDto>(lean)).Returns(new StoreDto { Id = lean.Id });
        SetupNoPayments();

        // Pago plan with Statistics @100 and a 50% catalog discount: original 100,
        // current 50 — independent expectations for both fields.
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Pago))
            .ReturnsAsync(CreatePlanWithStatistics((int)StorePlanType.Pago, price: 100f, percentDiscount: 50f));

        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        var dtos = result.Data!.ToList();
        dtos.Should().HaveCount(2);
        dtos[0].PlanPrice.Should().Be(100f);
        dtos[0].PlanCurrentPrice.Should().Be(50f);
        dtos[1].PlanPrice.Should().Be(dtos[0].PlanPrice, "same plan ⇒ same canonical price");
        dtos[1].PlanCurrentPrice.Should().Be(dtos[0].PlanCurrentPrice);
    }

    [Fact]
    public async Task Handle_disapproved_store_returns_null_canonical_prices()
    {
        // Plan 2026-09-15 P6: disapproved stores expose no price — the Approved guard
        // lives in the backend, not in the frontend.
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var disapproved = CreateStore("Disapproved", approved: false);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { disapproved });
        _mockMapper.Setup(x => x.Map<StoreDto>(disapproved)).Returns(new StoreDto { Id = disapproved.Id });
        SetupNoPayments();
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(CreatePlanWithStatistics((int)StorePlanType.Pago, 100f, 0f));

        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        var dto = result.Data!.Single();
        dto.PlanPrice.Should().BeNull();
        dto.PlanCurrentPrice.Should().BeNull();
    }

    [Fact]
    public async Task Handle_plan_prices_are_looked_up_once_per_distinct_plan()
    {
        // Memoization: two Pago stores + one Superior ⇒ exactly two plan lookups.
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var a = CreateStore("A");
        var b = CreateStore("B");
        var c = CreateStore("C");
        c.StorePlanId = (int)StorePlanType.Superior;
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { a, b, c });
        _mockMapper.Setup(x => x.Map<StoreDto>(It.IsAny<Store>()))
            .Returns((Store src) => new StoreDto { Id = src.Id });
        SetupNoPayments();
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync((int planId) => CreatePlanWithStatistics(planId, 100f, 0f));

        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        result.Data!.Should().OnlyContain(s => s.PlanPrice == 100f);
        _mockPlanRepository.Verify(
            x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()),
            Times.Exactly(2), "one lookup per DISTINCT plan id, not per store");
    }

    private static StorePlan CreatePlanWithStatistics(int planId, float price, float percentDiscount)
    {
        var plan = StorePlan.Create(planId, $"Plan-{planId}", 0, true);
        var module = Module.Create(BillingSeedStatisticsId, "Statistics", 6, priceIncluded: false,
            price, discountPrice: 0f, percentDiscountPrice: percentDiscount, availableToStore: true, isActive: true);
        var spm = StorePlanModule.Create(planId, module.Id);
        spm.Module = module;
        plan.StorePlanModules.Add(spm);
        return plan;
    }

    private const int BillingSeedStatisticsId = 6;

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

    private static Store CreateStore(string name, DateOnly? paymentStartDate = null, bool approved = true)
    {
        return Store.Create(name, Guid.NewGuid(), approved, Guid.NewGuid(), paymentStartDate);
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