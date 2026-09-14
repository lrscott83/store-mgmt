using Application.Dtos.StoreManagement;
using Application.Features.StoreManagement.Stores.Queries.GetStorePlan;
using Application.Mappings.StoreManagement;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Moq;

namespace Application.Tests.Features.StoreManagement.Stores.Queries.GetStorePlan;

/// <summary>
/// New suite for the dedicated plan view handler. Uses the REAL StoreProfile mapper
/// (unlike the mock-mapper suites) so the Approved plan-name guard (REQ-1) and the
/// handler's Approved due-date guard (REQ-2) are exercised together end-to-end.
/// </summary>
public class GetStorePlanQueryHandlerTests
{
    private readonly Mock<IGetStoreByIdService> _mockStoreByIdService;
    private readonly Mock<IStorePaymentRepository> _mockStorePaymentRepository;
    private readonly Mock<ISystemConfigurationRepository> _mockSystemConfigurationRepository;
    private readonly GetStorePlanQueryHandler _handler;

    public GetStorePlanQueryHandlerTests()
    {
        var config = new MapperConfiguration(cfg => cfg.AddProfile<StoreProfile>());
        var mapper = config.CreateMapper();
        _mockStoreByIdService = new Mock<IGetStoreByIdService>();
        _mockStorePaymentRepository = new Mock<IStorePaymentRepository>();
        _mockSystemConfigurationRepository = new Mock<ISystemConfigurationRepository>();
        _mockSystemConfigurationRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(1);
        _handler = new GetStorePlanQueryHandler(
            mapper,
            _mockStoreByIdService.Object,
            _mockStorePaymentRepository.Object,
            _mockSystemConfigurationRepository.Object);
    }

    [Fact]
    public async Task Handle_disapproved_pago_store_returns_gratis_and_null_next_due_date()
    {
        // REQ-1 + REQ-2: paid plan id + running clock, but Approved=false → Gratis + null date.
        var storeId = Guid.NewGuid();
        var disapproved = Store.Create("Disapproved", Guid.NewGuid(), false, Guid.NewGuid(),
            new DateOnly(2026, 6, 1), storePlanId: (int)StorePlanType.Pago);
        _mockStoreByIdService
            .Setup(x => x.GetStoreByIdIncludingModulesAsync(storeId))
            .ReturnsAsync(disapproved);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(storeId))
            .ReturnsAsync((StorePayment?)null);

        // Act
        var result = await _handler.Handle(new GetStorePlanQuery(storeId), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.PlanType.Should().Be("Gratis");
        result.Data.NextDueDate.Should().BeNull();
    }

    [Fact]
    public async Task Handle_approved_pago_store_keeps_pago_and_computes_due_date()
    {
        // Control — identical shape, Approved=true: plan name + canonical due date.
        var storeId = Guid.NewGuid();
        var approved = Store.Create("Approved", Guid.NewGuid(), true, Guid.NewGuid(),
            new DateOnly(2026, 6, 1), storePlanId: (int)StorePlanType.Pago);
        _mockStoreByIdService
            .Setup(x => x.GetStoreByIdIncludingModulesAsync(storeId))
            .ReturnsAsync(approved);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(storeId))
            .ReturnsAsync((StorePayment?)null);

        // Act
        var result = await _handler.Handle(new GetStorePlanQuery(storeId), CancellationToken.None);

        // Assert — canonical calculation: activation + trial(1) + 1 post-paid month.
        result.Succeeded.Should().BeTrue();
        result.Data!.PlanType.Should().Be("Pago");
        result.Data.NextDueDate.Should().Be(new DateOnly(2026, 8, 1));
    }

    [Fact]
    public async Task Handle_disapproved_store_with_recorded_payment_keeps_null_next_due_date()
    {
        // Triangulation: a recorded payment must NOT resurrect the date on a disapproved store.
        var storeId = Guid.NewGuid();
        var disapproved = Store.Create("DisapprovedPaid", Guid.NewGuid(), false, Guid.NewGuid(),
            new DateOnly(2026, 1, 1), storePlanId: (int)StorePlanType.Pago);
        _mockStoreByIdService
            .Setup(x => x.GetStoreByIdIncludingModulesAsync(storeId))
            .ReturnsAsync(disapproved);
        var lastPaidBefore = new DateOnly(2026, 10, 15);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(storeId))
            .ReturnsAsync(StorePayment.Create(
                storeId, 1, 10f,
                new DateTimeOffset(lastPaidBefore.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
                lastPaidBefore.Year, lastPaidBefore.Month, Guid.NewGuid(),
                reSellerId: null, 0, 0, 0, byReSeller: false));

        // Act
        var result = await _handler.Handle(new GetStorePlanQuery(storeId), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.PlanType.Should().Be("Gratis");
        result.Data.NextDueDate.Should().BeNull();
    }
}