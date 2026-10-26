using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.UpdateOrderStatus;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.Orders;
using Domain.Entities.ProductSalesCommissions;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// Mover un pedido por la máquina de estados. Cuatro responsabilidades, y las dos últimas son las
/// que un handler "rápido" suele saltarse:
///
///   1. La tabla de transiciones la decide el DOMINIO (`Order.ChangeStatus`), no el handler.
///      Un handler que asignara `order.Status = next` aceptaría `Entregado → Creado`.
///   2. Las excepciones de dominio se TRADUCEN a un `ApiException` 400. Sueltas saldrían como
///      500: una transición inválida es un error del cliente, no del servidor.
///   3. El pedido se pide YA con el `storeId` de la sesión. Un id de otra tienda es un 404
///      indistinguible de "no existe" (criterio 7), no una mutación.
///   4. Como `ApplicationDbContext` es `NoTracking`, el guardado exige `UpdateAsync` explícito:
///      mutar la fila cargada y llamar a `SaveChanges` sin marcar no escribiría NADA.
///
/// El handler además transporta los dos datos que la máquina exige: la razón de la cancelación y
/// el repartidor del reparto.
/// </summary>
public class UpdateOrderStatusCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStoreModuleRepository> _storeModuleRepository = new();
    private readonly Mock<IOrderSalesManagerRepository> _orderSalesManagerRepository = new();
    private readonly Mock<IProductSalesCommissionRepository> _productSalesCommissionRepository = new();
    private readonly Mock<IOrderSalesCommissionRepository> _orderSalesCommissionRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private static readonly Guid DriverId = Guid.NewGuid();
    private const string Reason = "El cliente desistió";

    public UpdateOrderStatusCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _orderRepository.Setup(x => x.UpdateAsync(It.IsAny<Order>())).ReturnsAsync(true);

        // T6 defaults: sin módulo 21 activo y sin atribución no se genera ninguna comisión.
        // Los tests de comisión sobreescriben estos setups.
        _storeModuleRepository
            .Setup(x => x.GetPublicActiveModuleIdsByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync([]);
        _orderSalesManagerRepository
            .Setup(x => x.GetByOrderIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((OrderSalesManager?)null);
        _productSalesCommissionRepository
            .Setup(x => x.GetByProductIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((ProductSalesCommission?)null);
        _orderSalesCommissionRepository
            .Setup(x => x.GetByOrderItemIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((OrderSalesCommission?)null);
    }

    private UpdateOrderStatusCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _orderRepository.Object,
        _localizer.Object,
        _storeModuleRepository.Object,
        _orderSalesManagerRepository.Object,
        _productSalesCommissionRepository.Object,
        _orderSalesCommissionRepository.Object);

    /// <summary>
    /// Pedido online de la tienda en un estado concreto. El estado se fija directo a propósito: es
    /// el ARRANGE del escenario, y la puerta que se prueba es la que se ejecuta después.
    /// </summary>
    private Order OrderIn(OrderStatus status, OrderDeliveryType deliveryType = OrderDeliveryType.Delivery)
    {
        Order order = Domain.Entities.Orders.Order.Create(
            _storeId, OrderType.WhatsApp, string.Empty, 0m, 0,
            new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc), Guid.NewGuid());
        order.Code = "PED-42";
        order.DeliveryType = deliveryType;
        order.Status = status;
        return order;
    }

    /// <summary>
    /// La fila que el repositorio devuelve. Solo devuelve pedidos de ESTA tienda: un id ajeno es
    /// indistinguible de un id inexistente, y por eso el mock no "falla" — devuelve null.
    /// </summary>
    private void Returns(Order? order)
        => _orderRepository
            .Setup(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()))
            .ReturnsAsync(order);

    #region Happy Path

    [Fact]
    public async Task Handle_WithAValidTransition_ShouldApplyTheNewStatus()
    {
        Order order = OrderIn(OrderStatus.Creado);
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Preparado), CancellationToken.None);

        order.Status.Should().Be(OrderStatus.Preparado);
    }

    [Theory]
    [InlineData(OrderDeliveryType.Delivery, OrderStatus.Creado, OrderStatus.Preparado)]
    [InlineData(OrderDeliveryType.Delivery, OrderStatus.Preparado, OrderStatus.Transportando)]
    [InlineData(OrderDeliveryType.Delivery, OrderStatus.Transportando, OrderStatus.Entregado)]
    [InlineData(OrderDeliveryType.Pickup, OrderStatus.Preparado, OrderStatus.Entregado)]
    public async Task Handle_WithEveryTransitionOfTheTable_ShouldApplyIt(
        OrderDeliveryType deliveryType, OrderStatus from, OrderStatus to)
    {
        Order order = OrderIn(from, deliveryType);
        Returns(order);

        var command = new UpdateOrderStatusCommand(
            order.Id, to, to == OrderStatus.Transportando ? DriverId : null);

        await Handler().Handle(command, CancellationToken.None);

        order.Status.Should().Be(to);
    }

    /// <summary>Cancelar es legal desde cualquier estado no terminal, y viaja con su razón.</summary>
    [Fact]
    public async Task Handle_FromAnyNonTerminalState_ShouldAcceptCanceladoWithItsReason()
    {
        Order order = OrderIn(OrderStatus.Preparado);
        Returns(order);

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Cancelado, CancellationReason: Reason),
            CancellationToken.None);

        order.Status.Should().Be(OrderStatus.Cancelado);
        order.CancellationReason.Should().Be(Reason);
    }

    /// <summary>Pasar a reparto asigna el repartidor que viaja en el comando.</summary>
    [Fact]
    public async Task Handle_ToTransportando_ShouldAssignTheDriverFromTheCommand()
    {
        Order order = OrderIn(OrderStatus.Preparado, OrderDeliveryType.Delivery);
        Returns(order);

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Transportando, DriverId),
            CancellationToken.None);

        order.Status.Should().Be(OrderStatus.Transportando);
        order.DriverId.Should().Be(DriverId);
    }

    /// <summary>Entregar deja el pedido pagado: la regla vive en el dominio, no en el handler.</summary>
    [Fact]
    public async Task Handle_ToEntregado_ShouldLeaveTheOrderPaid()
    {
        Order order = OrderIn(OrderStatus.Preparado, OrderDeliveryType.Pickup);
        Returns(order);

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado),
            CancellationToken.None);

        order.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
    }

    /// <summary>
    /// Entregar paga el pedido, y ese pago es el que deja la constancia: la fecha de cobro se
    /// escribe por la MISMA puerta que el pago manual, no por una rama paralela del estado.
    /// </summary>
    [Fact]
    public async Task Handle_ToEntregado_ShouldStampThePaidMoment()
    {
        Order order = OrderIn(OrderStatus.Preparado, OrderDeliveryType.Pickup);
        Returns(order);
        DateTime before = DateTime.UtcNow;

        await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado),
            CancellationToken.None);

        order.PaidAt.Should().NotBeNull();
        order.PaidAt!.Value.Should().BeOnOrAfter(before).And.BeOnOrBefore(DateTime.UtcNow);
    }

    [Fact]
    public async Task Handle_WithAValidTransition_ShouldReturnSuccess()
    {
        Order order = OrderIn(OrderStatus.Creado);
        Returns(order);

        var result = await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Preparado), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
    }

    #endregion

    #region Integration / Dependencies

    /// <summary>
    /// `ApplicationDbContext` es `NoTracking`: sin `UpdateAsync` la fila cargada se muta en memoria
    /// y `SaveChanges` no escribe NADA — sin error y sin aviso. Por eso el `Update` es explícito.
    /// </summary>
    [Fact]
    public async Task Handle_WithAValidTransition_ShouldMarkTheOrderAsModifiedBeforeSaving()
    {
        Order order = OrderIn(OrderStatus.Creado);
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Preparado), CancellationToken.None);

        _orderRepository.Verify(x => x.UpdateAsync(It.Is<Order>(o => o.Id == order.Id && o.Status == OrderStatus.Preparado)), Times.Once);
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// El `storeId` va en el MISMO predicado que el id: pedir el pedido primero y comprobar la
    /// tienda después dejaría una ventana con el pedido ajeno ya cargado.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReadTheOrderInsideTheStoreOfTheSession()
    {
        Order order = OrderIn(OrderStatus.Creado);
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Preparado), CancellationToken.None);

        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(_storeId, order.Id), Times.Once);
        _orderRepository.Verify(
            x => x.GetByIdWithItemsAsync(It.Is<Guid>(id => id != _storeId), It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>Una transición que no entrega NO toca el pago.</summary>
    [Fact]
    public async Task Handle_WithANonDeliveringTransition_ShouldNotTouchThePaymentStatus()
    {
        Order order = OrderIn(OrderStatus.Creado);
        order.PaymentStatus = OrderPaymentStatus.Pending;
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Preparado), CancellationToken.None);

        order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
    }

    /// <summary>Una transición que no es de reparto no toca el repartidor ya asignado.</summary>
    [Fact]
    public async Task Handle_WithANonTransportingTransition_ShouldNotTouchTheAssignedDriver()
    {
        Order order = OrderIn(OrderStatus.Creado);
        order.DriverId = DriverId;
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Preparado), CancellationToken.None);

        order.DriverId.Should().Be(DriverId);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// La máquina de estados del DOMINIO es la única puerta: saltar de `Creado` a `Entregado` es
    /// imposible aunque el handler lo permita.
    /// </summary>
    [Theory]
    [InlineData(OrderDeliveryType.Delivery, OrderStatus.Creado, OrderStatus.Entregado)]
    [InlineData(OrderDeliveryType.Delivery, OrderStatus.Creado, OrderStatus.Transportando)]
    [InlineData(OrderDeliveryType.Pickup, OrderStatus.Creado, OrderStatus.Transportando)]
    [InlineData(OrderDeliveryType.Delivery, OrderStatus.Preparado, OrderStatus.Entregado)]
    public async Task Handle_WithAnInvalidTransition_ShouldReportBadRequest(
        OrderDeliveryType deliveryType, OrderStatus from, OrderStatus to)
    {
        Order order = OrderIn(from, deliveryType);
        Returns(order);

        Func<Task> act = () => Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, to, to == OrderStatus.Transportando ? DriverId : null),
            CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Un estado terminal no se mueve: ni hacia atrás ni hacia otro terminal.</summary>
    [Theory]
    [InlineData(OrderStatus.Entregado, OrderStatus.Creado)]
    [InlineData(OrderStatus.Entregado, OrderStatus.Cancelado)]
    [InlineData(OrderStatus.Cancelado, OrderStatus.Creado)]
    [InlineData(OrderStatus.Cancelado, OrderStatus.Preparado)]
    public async Task Handle_FromATerminalState_ShouldReportBadRequest(OrderStatus from, OrderStatus to)
    {
        Order order = OrderIn(from);
        Returns(order);

        Func<Task> act = () => Handler().Handle(
            new UpdateOrderStatusCommand(
                order.Id, to, CancellationReason: to == OrderStatus.Cancelado ? Reason : null),
            CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Cancelar sin razón es un 400, no un pedido cancelado sin motivo.</summary>
    [Fact]
    public async Task Handle_ToCanceladoWithoutReason_ShouldReportBadRequest()
    {
        Order order = OrderIn(OrderStatus.Preparado);
        Returns(order);

        Func<Task> act = () => Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Cancelado), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        order.Status.Should().Be(OrderStatus.Preparado);
    }

    /// <summary>Pasar a reparto sin repartidor es un 400, no un pedido en la calle sin dueño.</summary>
    [Fact]
    public async Task Handle_ToTransportandoWithoutDriver_ShouldReportBadRequest()
    {
        Order order = OrderIn(OrderStatus.Preparado, OrderDeliveryType.Delivery);
        Returns(order);

        Func<Task> act = () => Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Transportando), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        order.Status.Should().Be(OrderStatus.Preparado);
    }

    /// <summary>Una transición rechazada NO toca el estado ni escribe nada.</summary>
    [Fact]
    public async Task Handle_WithAnInvalidTransition_ShouldLeaveTheOrderUntouched()
    {
        Order order = OrderIn(OrderStatus.Creado);
        Returns(order);

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Entregado), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        order.Status.Should().Be(OrderStatus.Creado);
        _orderRepository.Verify(x => x.UpdateAsync(It.IsAny<Order>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// Un id que no existe en la tienda, y un id que existe en OTRA, son el mismo 404: si el
    /// endpoint los distinguiera bastaría un id para recorrer tiendas ajenas (criterio 7).
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheOrderIsNotInTheStore_ShouldReportNotFound()
    {
        Returns(null);

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Preparado), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Handle_WhenTheOrderIsNotInTheStore_ShouldNotWriteAnything()
    {
        Returns(null);

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Preparado), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.UpdateAsync(It.IsAny<Order>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// Sin tienda en el contexto no hay pedido que mover: se rechaza antes de consultar nada, y
    /// no se adivina la tienda.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequestAndNotQuery()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Preparado), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()), Times.Never);
    }

    #endregion

    #region Validation

    /// <summary>
    /// Un entero que no es un `OrderStatus` no es un estado: sin esta regla llegaría a la tabla de
    /// transiciones y saldría como 400 por la excepción del dominio, con un mensaje de transición
    /// ("from Creado to 42") en vez de un mensaje de entrada inválida.
    /// </summary>
    [Fact]
    public void Validator_WithAnUndefinedStatus_ShouldFail()
    {
        UpdateOrderStatusCommandValidator validator = new(_localizer.Object);

        var result = validator.Validate(new UpdateOrderStatusCommand(Guid.NewGuid(), (OrderStatus)42));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateOrderStatusCommand.Status));
    }

    [Theory]
    [InlineData(OrderStatus.Creado)]
    [InlineData(OrderStatus.Preparado)]
    [InlineData(OrderStatus.Entregado)]
    public void Validator_WithADefinedStatus_ShouldPass(OrderStatus status)
    {
        UpdateOrderStatusCommandValidator validator = new(_localizer.Object);

        validator.Validate(new UpdateOrderStatusCommand(Guid.NewGuid(), status)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_WithCanceladoAndAReason_ShouldPass()
    {
        UpdateOrderStatusCommandValidator validator = new(_localizer.Object);

        validator.Validate(new UpdateOrderStatusCommand(
            Guid.NewGuid(), OrderStatus.Cancelado, CancellationReason: Reason)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_WithCanceladoAndNoReason_ShouldFail()
    {
        UpdateOrderStatusCommandValidator validator = new(_localizer.Object);

        var result = validator.Validate(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Cancelado));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateOrderStatusCommand.CancellationReason));
    }

    [Fact]
    public void Validator_WithTransportandoAndADriver_ShouldPass()
    {
        UpdateOrderStatusCommandValidator validator = new(_localizer.Object);

        validator.Validate(new UpdateOrderStatusCommand(
            Guid.NewGuid(), OrderStatus.Transportando, DriverId)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_WithTransportandoAndNoDriver_ShouldFail()
    {
        UpdateOrderStatusCommandValidator validator = new(_localizer.Object);

        var result = validator.Validate(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Transportando));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateOrderStatusCommand.DriverId));
    }

    #endregion
}
