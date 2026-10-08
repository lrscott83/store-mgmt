using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.UpdateOrderStatus;
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
/// Mover un pedido por la tabla de estados de la D11 (F5, T3). Cuatro responsabilidades, y las
/// dos últimas son las que un handler "rápido" suele saltarse:
///
///   1. La tabla de transiciones la decide el DOMINIO (`Order.ChangeStatus`), no el handler.
///      Un handler que asignara `order.Status = next` aceptaría `Delivered → New`, que es
///      exactamente el estado que no debe existir.
///   2. La excepción de dominio se TRADUCE a un `ApiException` 400. Suelta saldría como 500:
///      una transición inválida es un error del que el cliente, no del servidor.
///   3. El pedido se pide YA con el `storeId` de la sesión. Un id de otra tienda es un 404
///      indistinguible de "no existe" (criterio 7), no una mutación.
///   4. Como `ApplicationDbContext` es `NoTracking`, el guardado exige `UpdateAsync` explícito:
///      mutar la fila cargada y llamar a `SaveChanges` sin marcar no escribiría NADA.
/// </summary>
public class UpdateOrderStatusCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

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
    }

    private UpdateOrderStatusCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _orderRepository.Object,
        _localizer.Object);

    /// <summary>Pedido online de la tienda en un estado concreto de la D11.</summary>
    private Order OrderIn(OrderStatus status)
    {
        Order order = Domain.Entities.Orders.Order.Create(
            _storeId, OrderType.WhatsApp, string.Empty, 0m, 0,
            new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc), Guid.NewGuid());
        order.Code = "PED-42";
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
        Order order = OrderIn(OrderStatus.New);
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Accepted), CancellationToken.None);

        order.Status.Should().Be(OrderStatus.Accepted);
    }

    [Theory]
    [InlineData(OrderStatus.New, OrderStatus.Cancelled)]
    [InlineData(OrderStatus.Accepted, OrderStatus.Preparing)]
    [InlineData(OrderStatus.Preparing, OrderStatus.Ready)]
    [InlineData(OrderStatus.Ready, OrderStatus.Delivered)]
    public async Task Handle_WithEveryTransitionOfTheTable_ShouldApplyIt(OrderStatus from, OrderStatus to)
    {
        Order order = OrderIn(from);
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, to), CancellationToken.None);

        order.Status.Should().Be(to);
    }

    /// <summary>
    /// Cancelar es legal desde cualquier estado no terminal (D11), así que el handler no lo
    /// bloquea: la tabla ya lo dice y duplicar la regla aquí sería una segunda fuente de verdad.
    /// </summary>
    [Fact]
    public async Task Handle_FromAnyNonTerminalState_ShouldAcceptCancelled()
    {
        Order order = OrderIn(OrderStatus.Ready);
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Cancelled), CancellationToken.None);

        order.Status.Should().Be(OrderStatus.Cancelled);
    }

    [Fact]
    public async Task Handle_WithAValidTransition_ShouldReturnSuccess()
    {
        Order order = OrderIn(OrderStatus.New);
        Returns(order);

        var result = await Handler().Handle(
            new UpdateOrderStatusCommand(order.Id, OrderStatus.Accepted), CancellationToken.None);

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
        Order order = OrderIn(OrderStatus.New);
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Accepted), CancellationToken.None);

        _orderRepository.Verify(x => x.UpdateAsync(It.Is<Order>(o => o.Id == order.Id && o.Status == OrderStatus.Accepted)), Times.Once);
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
        Order order = OrderIn(OrderStatus.New);
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Accepted), CancellationToken.None);

        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(_storeId, order.Id), Times.Once);
        _orderRepository.Verify(
            x => x.GetByIdWithItemsAsync(It.Is<Guid>(id => id != _storeId), It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>El cambio de estado NO toca el pago: son ejes independientes (D3/D12).</summary>
    [Fact]
    public async Task Handle_ShouldNotTouchThePaymentStatus()
    {
        Order order = OrderIn(OrderStatus.New);
        order.PaymentStatus = OrderPaymentStatus.Pending;
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Accepted), CancellationToken.None);

        order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
    }

    /// <summary>Ni el repartidor: T5 es el dueño de esa columna.</summary>
    [Fact]
    public async Task Handle_ShouldNotTouchTheAssignedDriver()
    {
        var driverId = Guid.NewGuid();
        Order order = OrderIn(OrderStatus.New);
        order.DriverId = driverId;
        Returns(order);

        await Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Accepted), CancellationToken.None);

        order.DriverId.Should().Be(driverId);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// La máquina de estados del DOMINIO es la única puerta: saltar de `New` a `Delivered` es
    /// imposible aunque el handler lo permita.
    /// </summary>
    [Theory]
    [InlineData(OrderStatus.New, OrderStatus.Preparing)]
    [InlineData(OrderStatus.New, OrderStatus.Delivered)]
    [InlineData(OrderStatus.Accepted, OrderStatus.Delivered)]
    [InlineData(OrderStatus.Ready, OrderStatus.Accepted)]
    public async Task Handle_WithAnInvalidTransition_ShouldReportBadRequest(OrderStatus from, OrderStatus to)
    {
        Order order = OrderIn(from);
        Returns(order);

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(order.Id, to), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Un estado terminal no se mueve: ni hacia atrás ni hacia otro terminal.</summary>
    [Theory]
    [InlineData(OrderStatus.Delivered, OrderStatus.New)]
    [InlineData(OrderStatus.Delivered, OrderStatus.Cancelled)]
    [InlineData(OrderStatus.Cancelled, OrderStatus.New)]
    [InlineData(OrderStatus.Cancelled, OrderStatus.Accepted)]
    public async Task Handle_FromATerminalState_ShouldReportBadRequest(OrderStatus from, OrderStatus to)
    {
        Order order = OrderIn(from);
        Returns(order);

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(order.Id, to), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Una transición rechazada NO toca el estado ni escribe nada.</summary>
    [Fact]
    public async Task Handle_WithAnInvalidTransition_ShouldLeaveTheOrderUntouched()
    {
        Order order = OrderIn(OrderStatus.New);
        Returns(order);

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(order.Id, OrderStatus.Delivered), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        order.Status.Should().Be(OrderStatus.New);
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

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Accepted), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Handle_WhenTheOrderIsNotInTheStore_ShouldNotWriteAnything()
    {
        Returns(null);

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Accepted), CancellationToken.None);

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

        Func<Task> act = () => Handler().Handle(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Accepted), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()), Times.Never);
    }

    #endregion

    #region Validation

    /// <summary>
    /// Un entero que no es un `OrderStatus` no es un estado: sin esta regla llegaría a la tabla de
    /// transiciones y saldría como 400 por la excepción del dominio, con un mensaje de transición
    /// ("from New to 42") en vez de un mensaje de entrada inválida.
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
    [InlineData(OrderStatus.New)]
    [InlineData(OrderStatus.Accepted)]
    [InlineData(OrderStatus.Preparing)]
    [InlineData(OrderStatus.Ready)]
    [InlineData(OrderStatus.Delivered)]
    [InlineData(OrderStatus.Cancelled)]
    public void Validator_WithADefinedStatus_ShouldPass(OrderStatus status)
    {
        UpdateOrderStatusCommandValidator validator = new(_localizer.Object);

        validator.Validate(new UpdateOrderStatusCommand(Guid.NewGuid(), status)).IsValid.Should().BeTrue();
    }

    /// <summary>
    /// El validador NO juzga si la transición es alcanzable: eso depende del estado actual del
    /// pedido, que solo el handler sabe. Rechazar `Cancelled` aquí dejaría al dueño sin poder
    /// cancelar.
    /// </summary>
    [Fact]
    public void Validator_ShouldNotDecideWhetherTheTransitionIsReachable()
    {
        UpdateOrderStatusCommandValidator validator = new(_localizer.Object);

        validator.Validate(new UpdateOrderStatusCommand(Guid.NewGuid(), OrderStatus.Cancelled)).IsValid.Should().BeTrue();
    }

    #endregion
}