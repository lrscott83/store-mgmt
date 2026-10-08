using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.UpdateOrderPaymentStatus;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// Marcar el pago a mano (F5, T4, D3/D12). Lo que este suite fija, y que es la diferencia entre
/// esta feature y la de estado:
///
///   1. El pago NO es un estado del pedido: es un eje INDEPENDIENTE. Un pedido `New` puede estar
///      pagado (transferencia por adelantado) y uno `Delivered` puede estar pendiente (aún sin
///      cobrar en la puerta). Por eso este comando NO pasa por la máquina de `ChangeStatus` y por
///      eso el handler no le pregunta al dominio nada.
///   2. Solo hay dos valores, y en los dos sentidos: `Pending ⇄ Paid`. No hay "Reembolsado".
///   3. El aislamiento por tienda y el `UpdateAsync` explícito son los mismos que en T3 —
///      `ApplicationDbContext` es `NoTracking`, así que sin marcar la entidad no se escribe nada.
/// </summary>
public class UpdateOrderPaymentStatusCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public UpdateOrderPaymentStatusCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _orderRepository.Setup(x => x.UpdateAsync(It.IsAny<Order>())).ReturnsAsync(true);
    }

    private UpdateOrderPaymentStatusCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _orderRepository.Object,
        _localizer.Object);

    private Order OrderWith(OrderPaymentStatus paymentStatus, OrderStatus status = OrderStatus.New)
    {
        Order order = Domain.Entities.Orders.Order.Create(
            _storeId, OrderType.WhatsApp, string.Empty, 0m, 0,
            new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc), Guid.NewGuid());
        order.Code = "PED-42";
        order.PaymentStatus = paymentStatus;
        order.Status = status;
        return order;
    }

    private void Returns(Order? order)
        => _orderRepository
            .Setup(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()))
            .ReturnsAsync(order);

    #region Happy Path

    [Fact]
    public async Task Handle_FromPendingToPaid_ShouldApplyTheNewPaymentStatus()
    {
        Order order = OrderWith(OrderPaymentStatus.Pending);
        Returns(order);

        await Handler().Handle(
            new UpdateOrderPaymentStatusCommand(order.Id, OrderPaymentStatus.Paid), CancellationToken.None);

        order.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
    }

    /// <summary>
    /// Marcar el pago es reversible: una errata se corrige volviendo a `Pending`. Si el handler
    /// tratara `Paid` como terminal, el dueño se quedaría con un pago marcado que no puede deshacer.
    /// </summary>
    [Fact]
    public async Task Handle_FromPaidToPending_ShouldApplyTheNewPaymentStatus()
    {
        Order order = OrderWith(OrderPaymentStatus.Paid);
        Returns(order);

        await Handler().Handle(
            new UpdateOrderPaymentStatusCommand(order.Id, OrderPaymentStatus.Pending), CancellationToken.None);

        order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
    }

    [Fact]
    public async Task Handle_WithAValidPaymentStatus_ShouldReturnSuccess()
    {
        Order order = OrderWith(OrderPaymentStatus.Pending);
        Returns(order);

        var result = await Handler().Handle(
            new UpdateOrderPaymentStatusCommand(order.Id, OrderPaymentStatus.Paid), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
    }

    /// <summary>
    /// El eje del pago es independiente del del estado (D3/D12): marcar el pago NO mueve el pedido.
    /// Un `New` puede estar pagado (se pagó por adelantado) y un `Delivered` puede estar pendiente
    /// (el cobro se hace en la puerta, después de entregar).
    /// </summary>
    [Theory]
    [InlineData(OrderStatus.New)]
    [InlineData(OrderStatus.Delivered)]
    public async Task Handle_ShouldNotMoveTheOrderStatus(OrderStatus status)
    {
        Order order = OrderWith(OrderPaymentStatus.Pending, status);
        Returns(order);

        await Handler().Handle(
            new UpdateOrderPaymentStatusCommand(order.Id, OrderPaymentStatus.Paid), CancellationToken.None);

        order.Status.Should().Be(status);
    }

    #endregion

    #region Integration / Dependencies

    /// <summary>
    /// `ApplicationDbContext` es `NoTracking`: sin `UpdateAsync` el cambio se queda en memoria y
    /// `SaveChanges` no escribe NADA — sin error y sin aviso.
    /// </summary>
    [Fact]
    public async Task Handle_WithAValidPaymentStatus_ShouldMarkTheOrderAsModifiedBeforeSaving()
    {
        Order order = OrderWith(OrderPaymentStatus.Pending);
        Returns(order);

        await Handler().Handle(
            new UpdateOrderPaymentStatusCommand(order.Id, OrderPaymentStatus.Paid), CancellationToken.None);

        _orderRepository.Verify(
            x => x.UpdateAsync(It.Is<Order>(o => o.Id == order.Id && o.PaymentStatus == OrderPaymentStatus.Paid)),
            Times.Once);
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldReadTheOrderInsideTheStoreOfTheSession()
    {
        Order order = OrderWith(OrderPaymentStatus.Pending);
        Returns(order);

        await Handler().Handle(
            new UpdateOrderPaymentStatusCommand(order.Id, OrderPaymentStatus.Paid), CancellationToken.None);

        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(_storeId, order.Id), Times.Once);
        _orderRepository.Verify(
            x => x.GetByIdWithItemsAsync(It.Is<Guid>(id => id != _storeId), It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>La asignación de repartidor es de T5: este comando no la toca.</summary>
    [Fact]
    public async Task Handle_ShouldNotTouchTheAssignedDriver()
    {
        var driverId = Guid.NewGuid();
        Order order = OrderWith(OrderPaymentStatus.Pending);
        order.DriverId = driverId;
        Returns(order);

        await Handler().Handle(
            new UpdateOrderPaymentStatusCommand(order.Id, OrderPaymentStatus.Paid), CancellationToken.None);

        order.DriverId.Should().Be(driverId);
    }

    #endregion

    #region Error Handling

    [Fact]
    public async Task Handle_WhenTheOrderIsNotInTheStore_ShouldReportNotFound()
    {
        Returns(null);

        Func<Task> act = () => Handler().Handle(
            new UpdateOrderPaymentStatusCommand(Guid.NewGuid(), OrderPaymentStatus.Paid), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Handle_WhenTheOrderIsNotInTheStore_ShouldNotWriteAnything()
    {
        Returns(null);

        Func<Task> act = () => Handler().Handle(
            new UpdateOrderPaymentStatusCommand(Guid.NewGuid(), OrderPaymentStatus.Paid), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.UpdateAsync(It.IsAny<Order>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequestAndNotQuery()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(
            new UpdateOrderPaymentStatusCommand(Guid.NewGuid(), OrderPaymentStatus.Paid), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()), Times.Never);
    }

    #endregion

    #region Validation

    [Fact]
    public void Validator_WithAnUndefinedPaymentStatus_ShouldFail()
    {
        UpdateOrderPaymentStatusCommandValidator validator = new(_localizer.Object);

        var result = validator.Validate(
            new UpdateOrderPaymentStatusCommand(Guid.NewGuid(), (OrderPaymentStatus)7));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateOrderPaymentStatusCommand.PaymentStatus));
    }

    [Theory]
    [InlineData(OrderPaymentStatus.Pending)]
    [InlineData(OrderPaymentStatus.Paid)]
    public void Validator_WithADefinedPaymentStatus_ShouldPass(OrderPaymentStatus paymentStatus)
    {
        UpdateOrderPaymentStatusCommandValidator validator = new(_localizer.Object);

        validator.Validate(new UpdateOrderPaymentStatusCommand(Guid.NewGuid(), paymentStatus))
            .IsValid.Should().BeTrue();
    }

    #endregion
}