using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.Features.SalesManagers.Commands.MarkSalesCommissionPaid;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using System.Net;

namespace Application.Tests.Features.SalesManagers;

/// <summary>
/// T7: el Owner paga una comisión completa. Cubre el binding del pagador al Owner, el 404 para
/// comisiones de otro Owner, el 409 de una comisión ya pagada, el 403 de un no-Owner y la nota.
/// </summary>
public class MarkSalesCommissionPaidCommandTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOwnerRepository> _ownerRepository = new();
    private readonly Mock<IOrderSalesCommissionRepository> _commissionRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly DateTimeOffset _now = new(2026, 10, 22, 12, 0, 0, TimeSpan.Zero);
    private readonly Owner _owner;

    public MarkSalesCommissionPaidCommandTests()
    {
        _owner = Owner.Create(Guid.NewGuid(), false, _tenantId, "Owner E2E");

        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _httpContextService.Setup(x => x.UserExternalId).Returns(_owner.UserId.ToString());
        _ownerRepository
            .Setup(x => x.GetByUserIdIgnoreQueryFiltersAsync(_owner.UserId))
            .ReturnsAsync(_owner);
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(_now);
        _commissionRepository
            .Setup(x => x.UpdateAsync(It.IsAny<OrderSalesCommission>()))
            .ReturnsAsync(true);
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
    }

    private MarkSalesCommissionPaidCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _ownerRepository.Object,
        _commissionRepository.Object,
        _dateTimeProvider.Object);

    private OrderSalesCommission CommissionFor(Guid ownerId)
        => OrderSalesCommission.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            ownerId,
            Guid.NewGuid(),
            SalesCommissionType.Fixed,
            5m,
            100m,
            2,
            10m,
            Currency.CUP,
            _tenantId);

    [Fact]
    public async Task Owner_pays_a_pending_commission_completely()
    {
        OrderSalesCommission commission = CommissionFor(_owner.Id);
        _commissionRepository.Setup(x => x.GetByIdAsync(commission.Id)).ReturnsAsync(commission);

        var result = await Handler().Handle(
            new MarkSalesCommissionPaidCommand(commission.Id, "  efectivo  "), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        commission.Status.Should().Be(SalesCommissionStatus.Paid);
        commission.PaidAt.Should().Be(_now);
        commission.PaidByUserId.Should().Be(_owner.UserId);
        commission.PaymentNote.Should().Be("efectivo");
        _commissionRepository.Verify(x => x.UpdateAsync(commission), Times.Once);
    }

    [Fact]
    public async Task Another_owners_commission_returns_404_and_stays_pending()
    {
        OrderSalesCommission commission = CommissionFor(Guid.NewGuid());
        _commissionRepository.Setup(x => x.GetByIdAsync(commission.Id)).ReturnsAsync(commission);

        Func<Task> act = () => Handler().Handle(
            new MarkSalesCommissionPaidCommand(commission.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        commission.Status.Should().Be(SalesCommissionStatus.Pending);
    }

    [Fact]
    public async Task Commission_already_paid_returns_conflict()
    {
        OrderSalesCommission commission = CommissionFor(_owner.Id);
        commission.MarkPaid(_owner.UserId, _now, null);
        _commissionRepository.Setup(x => x.GetByIdAsync(commission.Id)).ReturnsAsync(commission);

        Func<Task> act = () => Handler().Handle(
            new MarkSalesCommissionPaidCommand(commission.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Non_owner_returns_forbidden()
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);

        Func<Task> act = () => Handler().Handle(
            new MarkSalesCommissionPaidCommand(Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Note_longer_than_500_returns_bad_request_and_stays_pending()
    {
        OrderSalesCommission commission = CommissionFor(_owner.Id);
        _commissionRepository.Setup(x => x.GetByIdAsync(commission.Id)).ReturnsAsync(commission);

        Func<Task> act = () => Handler().Handle(
            new MarkSalesCommissionPaidCommand(commission.Id, new string('x', 501)),
            CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        commission.Status.Should().Be(SalesCommissionStatus.Pending);
    }
}
