using Application.Abstractions.HttpContext;
using Application.Features.OnlineOrdering.Commands.AssignOrderDriver;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// La validación del repartidor asignable (S4, hallazgo 6.5) es una consulta de EXISTENCIA, no la
/// plantilla completa.
///
/// La diferencia no es estética: materializar la lista trae N filas —con nombre y teléfono— para
/// responder sí o no sobre un id, en un endpoint que se pulsa una vez por pedido. Lo que se fija
/// aquí es que el handler pregunte por ese repartidor y no lea el catálogo, y que la pregunta viaje
/// acotada a la tienda de la sesión y con el `CancellationToken` de la petición.
/// </summary>
public class AssignOrderDriverExistenceLookupTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IDeliveryDriverRepository> _driverRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public AssignOrderDriverExistenceLookupTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _orderRepository
            .Setup(x => x.UpdatePartialAsync(
                It.IsAny<Order>(), It.IsAny<OrderChangedField>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
    }

    private AssignOrderDriverCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _orderRepository.Object,
        _driverRepository.Object,
        _localizer.Object);

    private Order OrderFor()
    {
        Order order = Domain.Entities.Orders.Order.Create(
            _storeId, OrderType.WhatsApp, string.Empty, 0m, 0,
            new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc), Guid.NewGuid());
        order.Code = "PED-42";
        order.DeliveryType = OrderDeliveryType.Delivery;
        order.Status = OrderStatus.Preparado;
        return order;
    }

    private void Returns(Order? order)
        => _orderRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(order);

    [Fact]
    public async Task Handle_WithADriver_ShouldAskWhetherThatDriverExistsAndNotReadTheRoster()
    {
        Guid driverId = Guid.NewGuid();
        _driverRepository
            .Setup(x => x.ExistsActiveAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        Order order = OrderFor();
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, driverId), CancellationToken.None);

        _driverRepository.Verify(
            x => x.ExistsActiveAsync(_storeId, driverId, It.IsAny<CancellationToken>()), Times.Once);
        _driverRepository.Verify(
            x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()), Times.Never,
            "cargar la plantilla entera para responder sí o no es justo lo que S4 quita");
    }

    /// <summary>
    /// La pregunta lleva el token de la petición: una consulta a la base no debe seguir viva cuando
    /// el cliente ya se fue.
    /// </summary>
    [Fact]
    public async Task Handle_WithADriver_ShouldPassTheRequestCancellationTokenToTheExistenceCheck()
    {
        Guid driverId = Guid.NewGuid();
        _driverRepository
            .Setup(x => x.ExistsActiveAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        Order order = OrderFor();
        Returns(order);

        using var cts = new CancellationTokenSource();
        await Handler().Handle(new AssignOrderDriverCommand(order.Id, driverId), cts.Token);

        _driverRepository.Verify(
            x => x.ExistsActiveAsync(
                _storeId, driverId, It.Is<CancellationToken>(token => token == cts.Token)),
            Times.Once);
    }

    /// <summary>
    /// Desasignar no tiene id que validar, así que tampoco pregunta: ni la existencia ni la
    /// plantilla.
    /// </summary>
    [Fact]
    public async Task Handle_Unassigning_ShouldNotAskForAnyDriver()
    {
        Order order = OrderFor();
        Returns(order);

        await Handler().Handle(new AssignOrderDriverCommand(order.Id, null), CancellationToken.None);

        _driverRepository.Verify(
            x => x.ExistsActiveAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _driverRepository.Verify(
            x => x.GetByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<bool>()), Times.Never);
    }
}
