using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.AssignOrderDriver;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.DeliveryDrivers;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// Asignar (o desasignar) el repartidor de un pedido (F5, T5, D5). Las reglas que este suite fija
/// son tres, y las tres son de seguridad de negocio, no de ergonomía:
///
///   1. El repartidor tiene que ser de ESTA tienda. `IDeliveryDriverRepository` solo expone
///      `GetByStoreIdAsync(storeId)`, y el handler lo llama SIN `includeInactive`: un repartidor de
///      otra tienda —o dado de baja— no aparece en esa lista, y por eso el mismo 400 cubre ambos
///      casos. Un `GetByIdAsync` genérico habría abierto un agujero entre tiendas.
///   2. La BAJA de un repartidor es lógica (`IsActive`), no borrado: no se puede asignar a uno que
///      se fue, pero los pedidos que ya entregó conservan la referencia.
///   3. `DriverId = null` es una operación válida —desasignar—, no un dato ausente. Por eso el
///      comando NO tiene validador: no tiene ningún campo escalar que validar, y un
///      `NotNull()` sobre el repartidor habría hecho imposible deshacer una asignación.
public class AssignOrderDriverCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IDeliveryDriverRepository> _driverRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public AssignOrderDriverCommandHandlerTests()
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

    private AssignOrderDriverCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _orderRepository.Object,
        _driverRepository.Object,
        _localizer.Object);

    private Order OrderFor(OrderDeliveryType deliveryType = OrderDeliveryType.Delivery)
    {
        Order order = Domain.Entities.Orders.Order.Create(
            _storeId, OrderType.WhatsApp, string.Empty, 0m, 0,
            new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc), Guid.NewGuid());
        order.Code = "PED-42";
        order.DeliveryType = deliveryType;
        order.Status = OrderStatus.Preparing;
        return order;
    }

    private void Returns(Order? order)
        => _orderRepository
            .Setup(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()))
            .ReturnsAsync(order);

    /// <summary>Repartidor activo de esta tienda, como lo devuelve el repositorio real.</summary>
    private DeliveryDriver ActiveDriver(string name = "Ana")
    {
        DeliveryDriver driver = DeliveryDriver.Create(_storeId, name, "+34600000000", Guid.NewGuid());
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()))
            .ReturnsAsync(new List<DeliveryDriver> { driver });
        return driver;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_WithAnActiveDriverOfTheStore_ShouldAssignIt()
    {
        DeliveryDriver driver = ActiveDriver();
        Order order = OrderFor();
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, driver.Id), CancellationToken.None);

        order.DriverId.Should().Be(driver.Id);
    }

    [Fact]
    public async Task Handle_WithAnActiveDriverOfTheStore_ShouldReturnSuccess()
    {
        DeliveryDriver driver = ActiveDriver();
        Order order = OrderFor();
        Returns(order);

        var result = await Handler().Handle(new AssignOrderDriverCommand(order.Id, driver.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
    }

    /// <summary>
    /// Cambiar de repartidor es una operación normal (el primero se cae, se manda otro), no una
    /// reasignación privilegiada: el handler no exige que el pedido esté libre.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnAlreadyAssignedOrder_ShouldReplaceTheDriver()
    {
        DeliveryDriver previous = DeliveryDriver.Create(_storeId, "Luis", "+34600000001", Guid.NewGuid());
        DeliveryDriver replacement = DeliveryDriver.Create(_storeId, "Ana", "+34600000000", Guid.NewGuid());
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()))
            .ReturnsAsync(new List<DeliveryDriver> { previous, replacement });

        Order order = OrderFor();
        order.DriverId = previous.Id;
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, replacement.Id), CancellationToken.None);

        order.DriverId.Should().Be(replacement.Id);
    }

    /// <summary>
    /// Desasignar es una operación real —el dueño se equivocó al asignar, o el repartidor se
    /// retiró— y por eso `null` es una entrada VÁLIDA: el pedido vuelve a quedar sin repartidor
    /// sin tocar su estado ni su pago.
    /// </summary>
    [Fact]
    public async Task Handle_WithNullDriver_ShouldUnassignTheOrder()
    {
        DeliveryDriver driver = DeliveryDriver.Create(_storeId, "Ana", "+34600000000", Guid.NewGuid());
        Order order = OrderFor();
        order.DriverId = driver.Id;
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, null), CancellationToken.None);

        order.DriverId.Should().BeNull();
    }

    /// <summary>Desasignar un pedido que ya estaba sin repartidor es un no-op, no un error.</summary>
    [Fact]
    public async Task Handle_WithNullDriverOnAnUnassignedOrder_ShouldSucceed()
    {
        Order order = OrderFor();
        order.DriverId = null;
        Returns(order);

        var result = await Handler().Handle(new AssignOrderDriverCommand(order.Id, null), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        order.DriverId.Should().BeNull();
    }

    /// <summary>Desasignar NO consulta repartidores: si no hay id, no hay nada que validar.</summary>
    [Fact]
    public async Task Handle_WithNullDriver_ShouldNotQueryTheDrivers()
    {
        Order order = OrderFor();
        order.DriverId = null;
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, null), CancellationToken.None);

        _driverRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    #endregion

    #region Integration / Dependencies

    /// <summary>
    /// La lista se pide SIN `includeInactive`: la baja de un repartidor es lógica, así que el
    /// repositorio es quien los filtra, y el handler no tiene que reimplementar ese filtro ni
    /// acabar aceptando a uno dado de baja.
    /// </summary>
    [Fact]
    public async Task Handle_WithADriver_ShouldReadTheActiveDriversOfTheStoreOnly()
    {
        DeliveryDriver driver = ActiveDriver();
        Order order = OrderFor();
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, driver.Id), CancellationToken.None);

        _driverRepository.Verify(x => x.GetByStoreIdAsync(_storeId, false), Times.Once);
        _driverRepository.Verify(
            x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()), Times.Once);
        _driverRepository.Verify(
            x => x.GetByStoreIdAsync(It.Is<Guid>(id => id != _storeId), It.IsAny<bool>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithAnActiveDriver_ShouldMarkTheOrderAsModifiedBeforeSaving()
    {
        DeliveryDriver driver = ActiveDriver();
        Order order = OrderFor();
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, driver.Id), CancellationToken.None);

        _orderRepository.Verify(
            x => x.UpdateAsync(It.Is<Order>(o => o.Id == order.Id && o.DriverId == driver.Id)), Times.Once);
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldReadTheOrderInsideTheStoreOfTheSession()
    {
        DeliveryDriver driver = ActiveDriver();
        Order order = OrderFor();
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, driver.Id), CancellationToken.None);

        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(_storeId, order.Id), Times.Once);
        _orderRepository.Verify(
            x => x.GetByIdWithItemsAsync(It.Is<Guid>(id => id != _storeId), It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>El reparto NO mueve el estado del pedido (D18): el flujo no tiene "En camino".</summary>
    [Fact]
    public async Task Handle_ShouldNotMoveTheOrderStatus()
    {
        DeliveryDriver driver = ActiveDriver();
        Order order = OrderFor(OrderDeliveryType.Delivery);
        order.Status = OrderStatus.Preparing;
        order.PaymentStatus = OrderPaymentStatus.Pending;
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, driver.Id), CancellationToken.None);

        order.Status.Should().Be(OrderStatus.Preparing);
        order.PaymentStatus.Should().Be(OrderPaymentStatus.Pending);
    }

    /// <summary>
    /// La asignación no consulta el pedido del otro ni escribe en él: el id ajeno es un 404 y nada
    /// más.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNotReadAnyOtherOrder()
    {
        DeliveryDriver driver = ActiveDriver();
        Order order = OrderFor();
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, driver.Id), CancellationToken.None);

        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()), Times.Once);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Un repartidor de OTRA tienda no sale de `GetByStoreIdAsync(storeId)`, así que la respuesta
    /// es el mismo 400 que para uno inexistente: no se le dice al cliente que ese id existe en
    /// alguna otra tienda (criterio 7).
    /// </summary>
    [Fact]
    public async Task Handle_WithADriverFromAnotherStore_ShouldReportBadRequest()
    {
        DeliveryDriver ownStore = DeliveryDriver.Create(_storeId, "Ana", "+34600000000", Guid.NewGuid());
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()))
            .ReturnsAsync(new List<DeliveryDriver> { ownStore });

        Order order = OrderFor();
        Returns(order);

        Func<Task> act = () => Handler().Handle(
            new AssignOrderDriverCommand(order.Id, Guid.NewGuid()), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>
    /// Un repartidor DADO DE BAJA (`IsActive = false`) no sale de la lista que el handler pide, así
    /// que el mismo 400 lo rechaza: la baja es lógica y el pedido conserva la referencia de los
    /// repartidores que ya entregaron, pero no se le asigna uno nuevo.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnInactiveDriver_ShouldReportBadRequest()
    {
        DeliveryDriver active = DeliveryDriver.Create(_storeId, "Ana", "+34600000000", Guid.NewGuid());
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()))
            .ReturnsAsync(new List<DeliveryDriver> { active });

        var inactive = DeliveryDriver.Create(_storeId, "Luis", "+34600000001", Guid.NewGuid());
        inactive.IsActive = false;
        Order order = OrderFor();
        Returns(order);

        Func<Task> act = () => Handler().Handle(new AssignOrderDriverCommand(order.Id, inactive.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_WithAnUnknownDriver_ShouldNotWriteAnything()
    {
        DeliveryDriver driver = ActiveDriver();
        Order order = OrderFor();
        Returns(order);

        Func<Task> act = () => Handler().Handle(
            new AssignOrderDriverCommand(order.Id, Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.UpdateAsync(It.IsAny<Order>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>La tienda sin repartidores tampoco es un 404 de repartidor: es el mismo 400.</summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoDrivers_ShouldReportBadRequest()
    {
        _driverRepository
            .Setup(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()))
            .ReturnsAsync(new List<DeliveryDriver>());
        Order order = OrderFor();
        Returns(order);

        Func<Task> act = () => Handler().Handle(
            new AssignOrderDriverCommand(order.Id, Guid.NewGuid()), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_WhenTheOrderIsNotInTheStore_ShouldReportNotFound()
    {
        ActiveDriver();
        Returns(null);

        Func<Task> act = () => Handler().Handle(
            new AssignOrderDriverCommand(Guid.NewGuid(), Guid.NewGuid()), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Handle_WhenTheOrderIsNotInTheStore_ShouldNotQueryTheDrivers()
    {
        Returns(null);

        Func<Task> act = () => Handler().Handle(
            new AssignOrderDriverCommand(Guid.NewGuid(), Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _driverRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequestAndNotQuery()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(
            new AssignOrderDriverCommand(Guid.NewGuid(), null), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()), Times.Never);
    }

    #endregion
}