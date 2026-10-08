using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrderById;
using Domain.Common.Enums;
using Domain.Entities.DeliveryDrivers;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El detalle de un pedido (F5, T2) tiene dos responsabilidades que se rompen de forma distinta.
///
/// La primera es el AISLAMIENTO: el handler le pide el pedido al repositorio YA con el `storeId` de
/// la sesión, en el mismo predicado que el id. Comprobar la tienda después de haberlo cargado —o
/// aceptar un `storeId` en la URL— sería una fuga entre tiendas, que es justo el criterio 7.
///
/// La segunda es la FIDELIDAD del pedido: las líneas son el snapshot que el servidor resolvió al
/// crearlo, y salen ORDENADAS por `OrderIndex`. El orden en que el cliente escribió los productos
/// es información (es lo que se confirma leyendo), no un accidente del plan de ejecución: si se
/// pierde, un pedido de "azúcar, huevos, pan" puede mostrarse como "pan, huevos, azúcar".
/// </summary>
public class GetOnlineOrderByIdQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public GetOnlineOrderByIdQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
    }

    private GetOnlineOrderByIdQueryHandler Handler() => new(
        _httpContextService.Object,
        _orderRepository.Object,
        _localizer.Object);

    private static Order Order()
    {
        Order order = Domain.Entities.Orders.Order.Create(
            Guid.NewGuid(), OrderType.WhatsApp, string.Empty, 0m, 0,
            new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc), Guid.NewGuid());
        order.Code = "PED-42";
        return order;
    }

    private static OrderItem Line(Order order, Guid productId, string name, int quantity, decimal price, int orderIndex)
    {
        OrderItem item = OrderItem.Create(order.Id, productId, name, quantity, price, orderIndex, Guid.NewGuid());
        item.Currency = Currency.USD;
        return item;
    }

    private void Returns(Order? order)
        => _orderRepository.Setup(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>())).ReturnsAsync(order);

    #region Happy Path

    [Fact]
    public async Task Handle_WithAnOrder_ShouldMapEveryColumnOfTheDetail()
    {
        DeliveryDriver driver = DeliveryDriver.Create(_storeId, "Ana", "+34600000000", Guid.NewGuid());
        Order order = Order();
        order.CustomerName = "Marta";
        order.CustomerPhone = "+34611111111";
        order.DeliveryType = OrderDeliveryType.Delivery;
        order.Total = 2500m;
        order.Currency = Currency.USD;
        order.Status = OrderStatus.Ready;
        order.PaymentStatus = OrderPaymentStatus.Paid;
        order.DriverId = driver.Id;
        order.Driver = driver;
        order.DeliveryAddress = "Calle 12 #34";
        order.Notes = "Tocar el timbre";
        Returns(order);

        var result = await Handler().Handle(new GetOnlineOrderByIdQuery(order.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        OnlineOrderDetailDto dto = result.Data;
        dto.Id.Should().Be(order.Id);
        dto.Code.Should().Be("PED-42");
        dto.CustomerName.Should().Be("Marta");
        dto.CustomerPhone.Should().Be("+34611111111");
        dto.DeliveryType.Should().Be(OrderDeliveryType.Delivery);
        dto.Total.Should().Be(2500m);
        dto.Currency.Should().Be(Currency.USD);
        dto.Status.Should().Be(OrderStatus.Ready);
        dto.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
        dto.DriverId.Should().Be(driver.Id);
        dto.DriverName.Should().Be("Ana");
        dto.Date.Should().Be(order.Date);
        dto.DeliveryAddress.Should().Be("Calle 12 #34");
        dto.Notes.Should().Be("Tocar el timbre");
    }

    /// <summary>
    /// Un pedido de recogida no tiene domicilio, y un pedido sin repartidor no tiene nombre de
    /// repartidor: ambos salen null en vez de cadena vacía, que es lo que la vista distingue para
    /// no pintar una columna vacía donde no hay nada que pintar.
    /// </summary>
    [Fact]
    public async Task Handle_WithAPickupOrderAndNoDriver_ShouldLeaveTheOptionalFieldsNull()
    {
        Order order = Order();
        Returns(order);

        var result = await Handler().Handle(new GetOnlineOrderByIdQuery(order.Id), CancellationToken.None);

        result.Data.DriverName.Should().BeNull();
        result.Data.DriverId.Should().BeNull();
        result.Data.DeliveryAddress.Should().BeNull();
        result.Data.Notes.Should().BeNull();
    }

    #endregion

    #region Lines

    /// <summary>
    /// Las líneas se entregan en el orden en que se pidieron (`OrderIndex`), no en el que happen
    /// happen a salir del `Include`. Aquí se insertan desordenadas a propósito para que el test
    /// falle si alguien quita el `OrderBy`.
    /// </summary>
    [Fact]
    public async Task Handle_WithLines_ShouldReturnThemInTheOrderTheyWerePlaced()
    {
        Order order = Order();
        order.OrderItems.Add(Line(order, Guid.NewGuid(), "Pan", 1, 20m, 2));
        order.OrderItems.Add(Line(order, Guid.NewGuid(), "Huevos", 2, 30m, 0));
        order.OrderItems.Add(Line(order, Guid.NewGuid(), "Azúcar", 3, 15m, 1));
        Returns(order);

        var result = await Handler().Handle(new GetOnlineOrderByIdQuery(order.Id), CancellationToken.None);

        result.Data.Lines.Select(line => line.Name)
            .Should().ContainInOrder("Huevos", "Azúcar", "Pan");
    }

    [Fact]
    public async Task Handle_WithALine_ShouldMapItsSnapshotAndComputeItsTotal()
    {
        Order order = Order();
        OrderItem line = Line(order, Guid.NewGuid(), "Huevos", 3, 15.5m, 0);
        Guid productId = line.ProductId;
        order.OrderItems.Add(line);
        Returns(order);

        var result = await Handler().Handle(new GetOnlineOrderByIdQuery(order.Id), CancellationToken.None);

        OnlineOrderLineDto dto = result.Data.Lines.Should().ContainSingle().Which;
        dto.ProductId.Should().Be(productId);
        dto.Name.Should().Be("Huevos");
        dto.Quantity.Should().Be(3);
        dto.Price.Should().Be(15.5m);
        dto.Currency.Should().Be(Currency.USD);
        dto.LineTotal.Should().Be(46.5m);
    }

    /// <summary>
    /// Un pedido sin líneas (no debería ocurrir, pero la columna es nullable en la base y el POS
    /// histórico la dejó vacía) devuelve una LISTA vacía. Un null aquí haría que la vista reventara
    /// al mapear, que es peor que mostrar "sin productos".
    /// </summary>
    [Fact]
    public async Task Handle_WithAnOrderWithoutLines_ShouldReturnAnEmptyList()
    {
        Returns(Order());

        var result = await Handler().Handle(new GetOnlineOrderByIdQuery(Guid.NewGuid()), CancellationToken.None);

        result.Data.Lines.Should().NotBeNull().And.BeEmpty();
    }

    #endregion

    #region Store Isolation And Not Found

    [Fact]
    public async Task Handle_ShouldAskTheRepositoryForThatOrderInsideTheSessionStore()
    {
        Order order = Order();
        Returns(order);

        await Handler().Handle(new GetOnlineOrderByIdQuery(order.Id), CancellationToken.None);

        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(_storeId, order.Id), Times.Once);
    }

    /// <summary>
    /// Un id que no es de esta tienda llega al repositorio como un id que no devuelve nada, y el
    /// handler responde 404 — el MISMO 404 que un id inexistente. Distinguirlos ("ese pedido existe
    /// pero es de otra tienda") convierte el endpoint en un oráculo para recorrer tiendas ajenas.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheOrderIsNotInTheStore_ShouldReturnNotFound()
    {
        // El pedido EXISTE y tiene datos de sobra; lo único que lo hace inaccesible es que su
        // `StoreId` no es el de la sesión. El repositorio, al recibir los dos, devuelve null — de
        // eso se encarga el `Where(o => o.StoreId == storeId && o.Id == orderId)` de
        // `OrderRepository`—, y el handler lo traduce a 404.
        Order otherStoresOrder = Order();
        otherStoresOrder.StoreId = Guid.NewGuid();
        Returns(null);

        Func<Task> act = async () =>
            await Handler().Handle(new GetOnlineOrderByIdQuery(otherStoresOrder.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(ex => ex.StatusCode == HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Handle_WithoutAStoreInTheContext_ShouldRejectAndNotQuery()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(Guid.Empty.ToString());

        Func<Task> act = async () =>
            await Handler().Handle(new GetOnlineOrderByIdQuery(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(ex => ex.StatusCode == HttpStatusCode.BadRequest);
        _orderRepository.Verify(x => x.GetByIdWithItemsAsync(It.IsAny<Guid>(), It.IsAny<Guid>()), Times.Never);
    }

    #endregion
}