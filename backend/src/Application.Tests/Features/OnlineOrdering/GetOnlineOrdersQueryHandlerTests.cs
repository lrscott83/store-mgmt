using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrders;
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
/// El listado de pedidos (F5, T1) tiene una sola regla que no es negociable: NUNCA devuelve un
/// pedido de otra tienda. Se comprueba en las dos capas en las que se podría romper —el `storeId`
/// que se le pasa al repositorio y el `storeId` con el que se filtra el resultado— porque un
/// repositorio mal escrito que devolviera de más convertiría el "no filtres" del handler en una
/// promesa vacía.
///
/// El resto de lo que se prueba aquí es la honestidad de los números: `Page`/`PageSize` que se
/// devuelven son los YA normalizados (la vista los usa para pedir la siguiente página) y el `skip`
/// que sale hacia la base sale de esos mismos números normalizados, no de los crudos. Un
/// `Page = 0` sin normalizar daría un `skip` negativo, que es un error en la base, no un 0.
/// </summary>
public class GetOnlineOrdersQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public GetOnlineOrdersQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _orderRepository
            .Setup(x => x.GetPagedByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new PagedOrders(new List<Order>(), 0));
    }

    private GetOnlineOrdersQueryHandler Handler() => new(
        _httpContextService.Object,
        _orderRepository.Object,
        _localizer.Object);

    private void Returns(params Order[] orders)
        => _orderRepository
            .Setup(x => x.GetPagedByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new PagedOrders(orders, orders.Length));

    private static Order Order(DateTime? date = null, string? code = "A-1")
    {
        Order order = Domain.Entities.Orders.Order.Create(
            Guid.NewGuid(), OrderType.WhatsApp, string.Empty, 0m, 0,
            date ?? new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc), Guid.NewGuid());
        order.Code = code;
        return order;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_WithNoFilters_ShouldReturnAnEmptyPageInsteadOfFailing()
    {
        var result = await Handler().Handle(new GetOnlineOrdersQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Items.Should().BeEmpty();
        result.Data.Total.Should().Be(0);
    }

    [Fact]
    public async Task Handle_WithOrders_ShouldMapThemToListItems()
    {
        DeliveryDriver driver = DeliveryDriver.Create(_storeId, "Ana", "+34600000000", Guid.NewGuid());
        Order order = Order();
        order.CustomerName = "Marta";
        order.CustomerPhone = "+34611111111";
        order.DeliveryType = OrderDeliveryType.Delivery;
        order.Total = 1500m;
        order.Currency = Currency.USD;
        order.Status = OrderStatus.Preparing;
        order.PaymentStatus = OrderPaymentStatus.Paid;
        order.DriverId = driver.Id;
        order.Driver = driver;
        Returns(order);

        var result = await Handler().Handle(new GetOnlineOrdersQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        OnlineOrderListItemDto item = result.Data!.Items.Should().ContainSingle().Which;
        item.Id.Should().Be(order.Id);
        item.Code.Should().Be("A-1");
        item.CustomerName.Should().Be("Marta");
        item.CustomerPhone.Should().Be("+34611111111");
        item.DeliveryType.Should().Be(OrderDeliveryType.Delivery);
        item.Total.Should().Be(1500m);
        item.Currency.Should().Be(Currency.USD);
        item.Status.Should().Be(OrderStatus.Preparing);
        item.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
        item.DriverId.Should().Be(driver.Id);
        item.DriverName.Should().Be("Ana");
        item.Date.Should().Be(order.Date);
    }

    /// <summary>
    /// Un pedido SIN repartidor asignado tiene que salir con `DriverName` null, no con una cadena
    /// vacía: la columna muestra un guion y el filtro de la vista distingue "sin repartidor" de
    /// "con repartidor llamado así".
    /// </summary>
    [Fact]
    public async Task Handle_WithAnUnassignedOrder_ShouldLeaveTheDriverNameNull()
    {
        Returns(Order());

        var result = await Handler().Handle(new GetOnlineOrdersQuery(), CancellationToken.None);

        result.Data!.Items.Should().ContainSingle()
            .Which.DriverName.Should().BeNull();
    }

    /// <summary>
    /// `Total` es el total FILTRADO que dice el repositorio, no `Items.Count`: la vista lo usa para
    /// pintar cuántas páginas hay. Si el handler lo recalculara sobre la página, con dos pedidos y
    /// página de 20 la vista mostraría "1 de 1" y no dejaría ir a la segunda.
    /// </summary>
    [Fact]
    public async Task Handle_WithAFullPage_ShouldReturnTheRepositoryTotalNotTheItemCount()
    {
        _orderRepository
            .Setup(x => x.GetPagedByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>()))
            .ReturnsAsync(new PagedOrders(new List<Order> { Order(), Order() }, 57));

        var result = await Handler().Handle(new GetOnlineOrdersQuery(Page: 1, PageSize: 2), CancellationToken.None);

        result.Data!.Items.Should().HaveCount(2);
        result.Data.Total.Should().Be(57);
    }

    #endregion

    #region Store Isolation

    [Fact]
    public async Task Handle_ShouldQueryTheStoreOfTheSessionAndNotAnythingElse()
    {
        await Handler().Handle(new GetOnlineOrdersQuery(), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(_storeId, It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    /// <summary>
    /// Sin tienda en el contexto no hay lista que sea "de todas": el handler para con un 400 en vez
    /// de llamar al repositorio con `Guid.Empty`, que devolvería los pedidos de la tienda vacía
    /// (o ninguno, según el filtro global) sin decir por qué.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInTheContext_ShouldRejectAndNotQuery()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(Guid.Empty.ToString());

        Func<Task> act = async () => await Handler().Handle(new GetOnlineOrdersQuery(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(ex => ex.StatusCode == HttpStatusCode.BadRequest);
        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>()),
            Times.Never);
    }

    #endregion

    #region Filters

    /// <summary>
    /// Sin filtros, el filtro que sale hacia la base tiene TODO a null: el handler no rellena con
    /// valores neutros (`OrderStatus.New` sería un filtro de verdad que escondería los pedidos ya
    /// aceptados) ni manda un objeto "vacío" que el repositorio tendría que interpretar.
    ///
    /// Se comparan con `== null` y no con `is null` porque `It.Is` recibe un árbol de expresión, y
    /// el operador `is` de patrón no se puede meter ahí (`CS8122`).
    /// </summary>
    [Fact]
    public async Task Handle_WithoutFilters_ShouldNotFilterByAnything()
    {
        await Handler().Handle(new GetOnlineOrdersQuery(), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId,
                It.Is<OrderListFilter>(f => f.Status == null
                    && f.PaymentStatus == null
                    && f.DeliveryType == null
                    && f.DriverId == null
                    && f.From == null
                    && f.To == null
                    && f.Search == null),
                It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithAStatus_ShouldFilterByIt()
    {
        await Handler().Handle(new GetOnlineOrdersQuery(Status: OrderStatus.Accepted), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId, It.Is<OrderListFilter>(f => f.Status == OrderStatus.Accepted), It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithAPaymentStatus_ShouldFilterByIt()
    {
        await Handler().Handle(new GetOnlineOrdersQuery(PaymentStatus: OrderPaymentStatus.Paid), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId, It.Is<OrderListFilter>(f => f.PaymentStatus == OrderPaymentStatus.Paid), It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithADeliveryType_ShouldFilterByIt()
    {
        await Handler().Handle(new GetOnlineOrdersQuery(DeliveryType: OrderDeliveryType.Pickup), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId, It.Is<OrderListFilter>(f => f.DeliveryType == OrderDeliveryType.Pickup), It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithADriver_ShouldFilterByIt()
    {
        Guid driverId = Guid.NewGuid();

        await Handler().Handle(new GetOnlineOrdersQuery(DriverId: driverId), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId, It.Is<OrderListFilter>(f => f.DriverId == driverId), It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithADateRange_ShouldForwardBothEnds()
    {
        DateTime from = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
        DateTime to = new(2026, 10, 7, 23, 59, 59, DateTimeKind.Utc);

        await Handler().Handle(new GetOnlineOrdersQuery(From: from, To: to), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId, It.Is<OrderListFilter>(f => f.From == from && f.To == to), It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    /// <summary>
    /// La búsqueda llega con los bordes que puso el usuario ("  A-1  ") y se pasa limpia. No
    /// "recortada" en el handler y "recortada" en el repositorio: si el recorte viviera solo en la
    /// base, el filtro que se registra y se compara en un test sería distinto del que se ejecuta.
    /// </summary>
    [Fact]
    public async Task Handle_WithASearch_ShouldForwardItTrimmed()
    {
        await Handler().Handle(new GetOnlineOrdersQuery(Search: "  A-1  "), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId, It.Is<OrderListFilter>(f => f.Search == "A-1"), It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    /// <summary>
    /// Un `search` en blanco significa "no filtrar". Si llegara como `""` al SQL, PostgreSQL lo
    /// traduciría a un `Contains('')` que coincide con todas las filas: la vista mostraría la lista
    /// completa creyendo que filtró, y cada tecla de la barra costaría una búsqueda sobre el
    /// histórico entero.
    /// </summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithABlankSearch_ShouldNotSearchAtAll(string? search)
    {
        await Handler().Handle(new GetOnlineOrdersQuery(Search: search), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId, It.Is<OrderListFilter>(f => f.Search == null), It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    /// <summary>
    /// Varios filtros a la vez llegan TODOS en un mismo filtro, no solo el primero: combinarlos es
    /// el caso real de la vista ("los pedidos de Ana sin pagar de esta semana").
    /// </summary>
    [Fact]
    public async Task Handle_WithSeveralFilters_ShouldCombineThemAll()
    {
        Guid driverId = Guid.NewGuid();

        await Handler().Handle(
            new GetOnlineOrdersQuery(
                Status: OrderStatus.Ready,
                PaymentStatus: OrderPaymentStatus.Pending,
                DeliveryType: OrderDeliveryType.Delivery,
                DriverId: driverId,
                From: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
                To: new DateTime(2026, 10, 7, 23, 59, 59, DateTimeKind.Utc),
                Search: "+34611"),
            CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(
                _storeId,
                It.Is<OrderListFilter>(f => f.Status == OrderStatus.Ready
                    && f.PaymentStatus == OrderPaymentStatus.Pending
                    && f.DeliveryType == OrderDeliveryType.Delivery
                    && f.DriverId == driverId
                    && f.From == new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
                    && f.To == new DateTime(2026, 10, 7, 23, 59, 59, DateTimeKind.Utc)
                    && f.Search == "+34611"),
                It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    #endregion

    #region Pagination

    [Fact]
    public async Task Handle_OnTheSecondPage_ShouldSkipOneWholePage()
    {
        await Handler().Handle(new GetOnlineOrdersQuery(Page: 3, PageSize: 10), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(_storeId, It.IsAny<OrderListFilter>(), 20, 10),
            Times.Once);
    }

    /// <summary>
    /// `Page = 0` (o negativo) no es "la primera página": es un número que no existe, y sin
    /// normalizar daría un `skip` negativo — un error en la base. Sale `skip = 0` y la respuesta
    /// dice `Page = 1`, que es lo que la vista necesita para seguir pidiendo páginas coherentes.
    /// </summary>
    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task Handle_WithAPageBelowOne_ShouldNormalizeToTheFirstPage(int page)
    {
        var result = await Handler().Handle(new GetOnlineOrdersQuery(Page: page), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(_storeId, It.IsAny<OrderListFilter>(), 0, It.IsAny<int>()),
            Times.Once);
        result.Data!.Page.Should().Be(1);
    }

    /// <summary>
    /// El `skip` se calcula con el tamaño YA normalizado. Pedir 200 filas y acabar saltando
    /// `(page-1) * 200` mientras la base solo devuelve 100 solaparía páginas al recorrerlas.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnOversizedPage_ShouldClampItAndRecomputeTheSkipFromIt()
    {
        var result = await Handler().Handle(new GetOnlineOrdersQuery(Page: 2, PageSize: 5000), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(_storeId, It.IsAny<OrderListFilter>(), 100, 100),
            Times.Once);
        result.Data!.PageSize.Should().Be(100);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-20)]
    public async Task Handle_WithANonPositivePageSize_ShouldFallBackToTheDefault(int pageSize)
    {
        var result = await Handler().Handle(new GetOnlineOrdersQuery(PageSize: pageSize), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.PageSize.Should().Be(20);
        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(_storeId, It.IsAny<OrderListFilter>(), 0, 20),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithAPageSizeInsideTheBounds_ShouldUseItVerbatim()
    {
        var result = await Handler().Handle(new GetOnlineOrdersQuery(PageSize: 50), CancellationToken.None);

        result.Data!.PageSize.Should().Be(50);
        _orderRepository.Verify(
            x => x.GetPagedByStoreIdAsync(_storeId, It.IsAny<OrderListFilter>(), 0, 50),
            Times.Once);
    }

    #endregion
}