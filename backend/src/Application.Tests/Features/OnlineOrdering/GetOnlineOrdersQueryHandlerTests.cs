using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrders;
using Application.Services.Tenants;
using Domain.Common.Enums;
using Domain.Entities.DeliveryDrivers;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
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

    /// <summary>
    /// Ejecuta el handler y devuelve el filtro que salió REALMENTE hacia el repositorio.
    ///
    /// Los filtros de fecha se comprueban sobre el filtro capturado y no sobre la respuesta del
    /// handler porque el DTO no los devuelve: lo que se arregla (D2) es exactamente el predicado
    /// que se ejecuta en la base, y un `Verify` con `It.Is` sobre un filtro normalizado ya no
    /// documentaría el valor concreto al que se llega.
    /// </summary>
    private async Task<OrderListFilter> CaptureFilter(GetOnlineOrdersQuery query)
    {
        OrderListFilter? captured = null;
        _orderRepository
            .Setup(x => x.GetPagedByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>()))
            .Callback<Guid, OrderListFilter, int, int>((storeId, filter, skip, take) => captured = filter)
            .ReturnsAsync(new PagedOrders(new List<Order>(), 0));

        await Handler().Handle(query, CancellationToken.None);

        captured.Should().NotBeNull("el handler tiene que llamar al repositorio");
        return captured!;
    }

    /// <summary>
    /// El último instante representable de un día: <c>23:59:59.9999999</c>.
    ///
    /// Se escribe como "el último tick del segundo 59" y NO como <c>day.Date.AddDays(1).AddTicks(-1)</c>
    /// a propósito: repetir aquí la fórmula del handler haría que el test pasara aunque la fórmula
    /// cambiara, que es justo lo que un test de normalización no puede permitirse.
    /// </summary>
    private static DateTime EndOfDay(int year, int month, int day)
        => new DateTime(year, month, day, 23, 59, 59, DateTimeKind.Utc).AddTicks(TimeSpan.TicksPerSecond - 1);

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

    /// <summary>
    /// Un rango con los dos extremos puestos se reenvía NORMALIZADO a los días que representan (D2).
    /// Antes se comparaba contra el `to` literal; ese `23:59:59` era un accidente del dato de test,
    /// no un contrato: el navegador manda `"2026-10-07"` y esa hora nunca llega.
    /// </summary>
    [Fact]
    public async Task Handle_WithADateRange_ShouldForwardBothEndsAsWholeDays()
    {
        DateTime from = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
        DateTime to = new(2026, 10, 7, 23, 59, 59, DateTimeKind.Utc);

        OrderListFilter filter = await CaptureFilter(new GetOnlineOrdersQuery(From: from, To: to));

        filter.From.Should().Be(from);
        filter.To.Should().Be(EndOfDay(2026, 10, 7));
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
                    && f.To == EndOfDay(2026, 10, 7)
                    && f.Search == "+34611"),
                It.IsAny<int>(), It.IsAny<int>()),
            Times.Once);
    }

    /// <summary>
    /// El caso que fallaba: `from = to` sobre el MISMO día. Es lo que produce la vista cuando se
    /// eligen "hoy" en los dos campos, y sin normalizar el rango valía `[00:00:00, 00:00:00]` — una
    /// ventana de cero ticks que no contiene ni un pedido hecho después de medianoche.
    ///
    /// Se afirma el extremo exacto Y que un pedido de las 22:30 de ese día cabe, porque el
    /// predicado del repositorio es un `<=` sobre ese valor: es la única forma de que el test
    /// falle si el extremo superior vuelve a ser la medianoche.
    /// </summary>
    [Fact]
    public async Task Handle_WithFromAndToOnTheSameDay_ShouldCoverThatWholeDay()
    {
        DateTime day = new(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc);

        OrderListFilter filter = await CaptureFilter(new GetOnlineOrdersQuery(From: day, To: day));

        filter.From.Should().Be(day);
        filter.To.Should().Be(EndOfDay(2026, 10, 7));

        DateTime orderPlacedLateInTheDay = new(2026, 10, 7, 22, 30, 0, DateTimeKind.Utc);
        (orderPlacedLateInTheDay <= filter.To).Should().BeTrue(
            "un pedido de las 22:30 del día pedido tiene que entrar en el rango de ese día");
    }

    /// <summary>
    /// Un rango de días DISTINTOS no se estrecha: el último día entra entero y el día siguiente
    /// sigue fuera. Es el control que distingue "normalizar" de "cambiar el filtro": si el extremo
    /// superior se normalizara al día siguiente entero, aparecería un día de pedidos que nadie
    /// pidió.
    /// </summary>
    [Fact]
    public async Task Handle_WithARangeAcrossDifferentDays_ShouldStopAtTheEndOfTheLastOne()
    {
        OrderListFilter filter = await CaptureFilter(new GetOnlineOrdersQuery(
            From: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
            To: new DateTime(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc)));

        filter.From.Should().Be(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc));
        filter.To.Should().Be(EndOfDay(2026, 10, 7));

        // Los cuatro lados del rango, con los dos predicados del repositorio (`>=` y `<=`).
        (new DateTime(2026, 10, 1, 9, 0, 0, DateTimeKind.Utc) >= filter.From).Should().BeTrue();
        (new DateTime(2026, 10, 4, 12, 0, 0, DateTimeKind.Utc) >= filter.From).Should().BeTrue();
        (new DateTime(2026, 10, 7, 23, 30, 0, DateTimeKind.Utc) <= filter.To).Should().BeTrue();
        (new DateTime(2026, 10, 8, 0, 0, 0, DateTimeKind.Utc) <= filter.To).Should().BeFalse();
        (new DateTime(2026, 9, 30, 23, 59, 59, DateTimeKind.Utc) >= filter.From).Should().BeFalse();
    }

    /// <summary>
    /// El extremo INFERIOR se clava a las 00:00 de su día aunque venga con hora: "desde el 1" es el
    /// día 1 entero, no el día 1 a partir de la hora que marcara el reloj del navegador. Con la
    /// hora a medias, el primer día del rango perdía los pedidos de la mañana sin que nada lo
    /// pidiera.
    /// </summary>
    [Fact]
    public async Task Handle_WithAClockTimeOnTheFromBound_ShouldClampItToTheStartOfThatDay()
    {
        OrderListFilter filter = await CaptureFilter(new GetOnlineOrdersQuery(
            From: new DateTime(2026, 10, 1, 14, 30, 0, DateTimeKind.Utc)));

        filter.From.Should().Be(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc));
        (new DateTime(2026, 10, 1, 9, 0, 0, DateTimeKind.Utc) >= filter.From).Should().BeTrue(
            "el primer día del rango entra desde su medianoche");
    }

    /// <summary>
    /// El extremo SUPERIOR también se ensancha: "hasta el 7" incluye el 7 entero. Normalizar solo el
    /// inferior dejaría la mitad del bug —el día elegido saldría a medias— y una aserción que solo
    /// mirara `From` no lo vería.
    /// </summary>
    [Fact]
    public async Task Handle_WithAClockTimeOnTheToBound_ShouldWidenItToTheEndOfThatDay()
    {
        OrderListFilter filter = await CaptureFilter(new GetOnlineOrdersQuery(
            To: new DateTime(2026, 10, 7, 9, 15, 0, DateTimeKind.Utc)));

        filter.To.Should().Be(EndOfDay(2026, 10, 7));
        (new DateTime(2026, 10, 7, 20, 0, 0, DateTimeKind.Utc) <= filter.To).Should().BeTrue();
    }

    /// <summary>
    /// Normalizar NO es rellenar: un filtro sin usar sigue sin usarse. Si el handler fabricara un
    /// extremo para el lado que no se pidió, "pedidos de este mes" se volvería "pedidos hasta el
    /// principio de la eternidad" — o, peor, "pedidos desde el año 1", que para PostgreSQL es un
    /// rango que ni se puede indexar.
    /// </summary>
    [Fact]
    public async Task Handle_WithOnlyAFromBound_ShouldNotInventAnUpperBound()
    {
        OrderListFilter filter = await CaptureFilter(new GetOnlineOrdersQuery(
            From: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)));

        filter.To.Should().BeNull();
    }

    /// El otro lado: normalizar el extremo superior no autoriza a fabricar el inferior. Un
    /// `?to=` sin `?from=` significa "hasta el 7", no "desde el 1 de enero del año 1".
    /// </summary>
    [Fact]
    public async Task Handle_WithOnlyAToBound_ShouldNotInventALowerBound()
    {
        OrderListFilter filter = await CaptureFilter(new GetOnlineOrdersQuery(
            To: new DateTime(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc)));

        filter.From.Should().BeNull();
    }

    /// <summary>
    /// El último día representable no se puede "pasar al día siguiente": <c>9999-12-31</c>.Date
    /// <c>AddDays(1)</c> lanza <see cref="ArgumentOutOfRangeException"/>, así que un
    /// <c>?to=9999-12-31</c> —una URL perfectamente válida— devolvería un 500 por la aritmética de
    /// un día. Se queda en el último tick del rango en vez de reventar.
    ///
    /// Contexto propio (no usa <see cref="CaptureFilter"/>) porque además del filtro filtrado hace
    /// falta comprobar que el handler no lanzó: el fallo sería una excepción, no un valor.
    /// </summary>
    [Fact]
    public async Task Handle_WithTheLastRepresentableDayAsTo_ShouldNotOverflowPastDateTimeMaxValue()
    {
        OrderListFilter? captured = null;
        _orderRepository
            .Setup(x => x.GetPagedByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderListFilter>(), It.IsAny<int>(), It.IsAny<int>()))
            .Callback<Guid, OrderListFilter, int, int>((storeId, filter, skip, take) => captured = filter)
            .ReturnsAsync(new PagedOrders(new List<Order>(), 0));

        var result = await Handler().Handle(
            new GetOnlineOrdersQuery(To: DateTime.MaxValue), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        captured.Should().NotBeNull();
        captured!.To.Should().Be(DateTime.MaxValue);
    }

    #endregion

    #region The List Query Has To Load The Driver (D1)

    /// <summary>
    /// <c>OrderRepository</c> REAL sobre <c>InMemory</c> con la sesión de la tienda, sembrado con
    /// los pedidos dados. Es lo que separa "el mapeo funciona" de "el dato llega cargado".
    ///
    /// El resto de esta clase mete un `Mock<IOrderRepository>` que devuelve pedidos con `Driver` ya
    /// puesto: eso ENSEÑA un mundo que la base nunca produce. <see cref="ApplicationDbContext"/> es
    /// `NoTracking` global y el modelo no tiene ningún `AutoInclude`, así que la navegación llega
    /// null salvo que la consulta la pida — y `DriverName` sale null para TODOS los pedidos aunque el
    /// selector de la vista tenga repartidor elegido. Ningún test con mocks puede ver eso.
    ///
    /// Nota de alcance: `InMemory` prueba que el `Include` está en la consulta, no el `LEFT JOIN`
    /// que genera Npgsql. Lo que demuestra el SQL real es la suite E2E, fuera del alcance de esta
    /// feature.
    /// </summary>
    private static (ApplicationDbContext Db, OrderRepository Repository) RepositoryOver(
        Guid tenantId, params Order[] orders)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var session = new Mock<IHttpContextService>();
        session.Setup(x => x.TenantId).Returns(tenantId.ToString());
        session.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        var db = new ApplicationDbContext(
            options, new TenantIdProvider(new HttpContextAccessor()), session.Object);

        db.Set<DeliveryDriver>().AddRange(orders.Select(o => o.Driver).OfType<DeliveryDriver>());
        db.Set<Order>().AddRange(orders);
        db.SaveChanges();

        return (db, new OrderRepository(db));
    }

    /// <summary>Un pedido de esta tienda y de este tenant: los dos los pone el filtro global.</summary>
    private Order OrderOfThisStore(Guid tenantId)
    {
        Order order = Order();
        order.StoreId = _storeId;
        order.TenantId = tenantId;
        return order;
    }

    private GetOnlineOrdersQueryHandler HandlerOver(OrderRepository repository)
        => new(_httpContextService.Object, repository, _localizer.Object);

    /// <summary>
    /// El defecto D1 de punta a punta: la fila SÍ tiene repartidor en la base, el repositorio la
    /// devuelve, y el nombre tiene que llegar al DTO. Si la lista no carga la navegación, esto falla
    /// con <c>DriverName</c> null mientras <c>DriverId</c> sí trae el id — el desajuste exacto que ve
    /// la vista.
    /// </summary>
    [Fact]
    public async Task Handle_OverTheRealRepository_ShouldCarryTheDriverNameLoadedByTheQuery()
    {
        Guid tenantId = Guid.NewGuid();
        DeliveryDriver driver = DeliveryDriver.Create(_storeId, "Ana", "+34600000000", tenantId);
        Order order = OrderOfThisStore(tenantId);
        order.DriverId = driver.Id;
        order.Driver = driver;

        var (db, repository) = RepositoryOver(tenantId, order);

        var result = await HandlerOver(repository).Handle(new GetOnlineOrdersQuery(), CancellationToken.None);

        OnlineOrderListItemDto item = result.Data!.Items.Should().ContainSingle().Which;
        item.DriverId.Should().Be(driver.Id);
        item.DriverName.Should().Be("Ana");

        db.Dispose();
    }

    /// <summary>
    /// El otro lado de la navegación opcional: un pedido SIN repartidor tiene que salir con el
    /// nombre null y sin que la consulta se caiga. Si el `Include` se escribiera como si la
    /// relación fuera obligatoria, este test lo delata.
    /// </summary>
    [Fact]
    public async Task Handle_OverTheRealRepository_WithNoDriverAssigned_ShouldLeaveTheDriverNameNull()
    {
        Guid tenantId = Guid.NewGuid();
        Order order = OrderOfThisStore(tenantId);

        var (db, repository) = RepositoryOver(tenantId, order);

        var result = await HandlerOver(repository).Handle(new GetOnlineOrdersQuery(), CancellationToken.None);

        OnlineOrderListItemDto item = result.Data!.Items.Should().ContainSingle().Which;
        item.DriverId.Should().BeNull();
        item.DriverName.Should().BeNull();

        db.Dispose();
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