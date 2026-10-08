using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrderStats;
using Application.Services.Tenants;
using Domain.Common.Enums;
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
/// Las MÉTRICAS de la vista "Ventas" (F6, T1). Dos reglas que no son negociables y que se
/// comprueban en la capa donde se pueden romper:
///
///   * AISLAMIENTO: la tienda es la de la sesión y no llega en la URL. Sin ella, un dueño leería
///     las ventas de cualquier tienda escribiendo un id.
///   * COHERENCIA DE LOS NÚMEROS: <c>TotalSales</c> excluye los cancelados, así que
///     <c>AverageTicket</c> tiene que dividir por los NO cancelados. Un
///     <c>TotalSales / OrdersCount</c> daría un ticket medio más bajo del real en cuanto hubiera un
///     cancelado, y ese número es justo el que se pinta grande en el panel.
///
/// La aritmética que se ejecuta contra la base tiene su propio archivo
/// (<see cref="OrderStatsRepositoryTests"/>) con el repositorio REAL: un mock devuelve el agregado
/// que el test le dio y no puede equivocarse, así que aquí solo se prueba lo que el HANDLER decide.
/// </summary>
public class GetOnlineOrderStatsQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();

    public GetOnlineOrderStatsQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        Returns(Zero());
    }

    private GetOnlineOrderStatsQueryHandler Handler() => new(
        _httpContextService.Object,
        _orderRepository.Object,
        _localizer.Object);

    private void Returns(OrderAggregateStats stats)
        => _orderRepository
            .Setup(x => x.GetStatsByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderStatsFilter>()))
            .ReturnsAsync(stats);

    /// <summary>El agregado de una tienda que no vendió nada: todo en cero, moneda por defecto.</summary>
    private static OrderAggregateStats Zero() => new();

    #region Happy Path

    [Fact]
    public async Task Handle_WithoutOrders_ShouldReturnZeroedStatsInsteadOfFailing()
    {
        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.OrdersCount.Should().Be(0);
        result.Data.NonCancelledCount.Should().Be(0);
        result.Data.TotalSales.Should().Be(0m);
        result.Data.AverageTicket.Should().Be(0m);
        result.Data.PaidCount.Should().Be(0);
        result.Data.PaidAmount.Should().Be(0m);
        result.Data.PendingCount.Should().Be(0);
        result.Data.PendingAmount.Should().Be(0m);
    }

    /// <summary>
    /// El camino normal: el agregado que da la base se copia tal cual, sin reinterpretarlo. Una
    /// suma que el handler volviera a hacer (o que "arreglara") sería una segunda verdad sobre los
    /// mismos números, y las dos dejarían de cuadrar en cuanto una cambiara.
    /// </summary>
    [Fact]
    public async Task Handle_WithSales_ShouldCopyTheAggregatedNumbersVerbatim()
    {
        Returns(new OrderAggregateStats
        {
            OrdersCount = 5,
            NonCancelledCount = 4,
            TotalSales = 1000m,
            PaidCount = 3,
            PaidAmount = 700m,
            PendingCount = 1,
            PendingAmount = 300m,
            Currency = Currency.USD,
            ByStatus = new Dictionary<OrderStatus, int> { [OrderStatus.Delivered] = 3, [OrderStatus.Cancelled] = 1 },
            ByDeliveryType = new Dictionary<OrderDeliveryType, int> { [OrderDeliveryType.Pickup] = 2, [OrderDeliveryType.Delivery] = 2 },
        });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        OnlineOrderStatsDto data = result.Data!;
        data.OrdersCount.Should().Be(5);
        data.NonCancelledCount.Should().Be(4);
        data.TotalSales.Should().Be(1000m);
        data.PaidCount.Should().Be(3);
        data.PaidAmount.Should().Be(700m);
        data.PendingCount.Should().Be(1);
        data.PendingAmount.Should().Be(300m);
        data.Currency.Should().Be(Currency.USD);
    }

    #endregion

    #region Store Isolation

    [Fact]
    public async Task Handle_ShouldQueryTheStoreOfTheSessionAndNotAnythingElse()
    {
        await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetStatsByStoreIdAsync(_storeId, It.IsAny<OrderStatsFilter>()),
            Times.Once);
    }

    /// <summary>
    /// Sin tienda en el contexto no hay métricas de "todas": el handler para con un 400 en vez de
    /// llamar al repositorio con <c>Guid.Empty</c>, que devolvería el agregado de la tienda vacía
    /// sin decir por qué.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInTheContext_ShouldRejectAndNotQuery()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(Guid.Empty.ToString());

        Func<Task> act = async () => await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(ex => ex.StatusCode == HttpStatusCode.BadRequest);
        _orderRepository.Verify(
            x => x.GetStatsByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderStatsFilter>()),
            Times.Never);
    }

    #endregion

    #region Filters

    /// <summary>
    /// Sin filtros, el filtro que sale hacia la base tiene TODO a null. Rellenar con valores
    /// neutros sería peor que no filtrar: <c>OrderStatus.New</c> o <c>OrderPaymentStatus.Pending</c>
    /// son valores REALES del enum y esconderían los pedidos ya avanzado de estado.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutFilters_ShouldNotFilterByAnything()
    {
        await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetStatsByStoreIdAsync(
                _storeId,
                It.Is<OrderStatsFilter>(f => f.Status == null
                    && f.PaymentStatus == null
                    && f.DeliveryType == null
                    && f.From == null
                    && f.To == null)),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithAStatus_ShouldForwardIt()
    {
        await Handler().Handle(new GetOnlineOrderStatsQuery(Status: OrderStatus.Ready), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetStatsByStoreIdAsync(
                _storeId, It.Is<OrderStatsFilter>(f => f.Status == OrderStatus.Ready)),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithAPaymentStatus_ShouldForwardIt()
    {
        await Handler().Handle(
            new GetOnlineOrderStatsQuery(PaymentStatus: OrderPaymentStatus.Paid), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetStatsByStoreIdAsync(
                _storeId, It.Is<OrderStatsFilter>(f => f.PaymentStatus == OrderPaymentStatus.Paid)),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithADeliveryType_ShouldForwardIt()
    {
        await Handler().Handle(
            new GetOnlineOrderStatsQuery(DeliveryType: OrderDeliveryType.Delivery), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetStatsByStoreIdAsync(
                _storeId, It.Is<OrderStatsFilter>(f => f.DeliveryType == OrderDeliveryType.Delivery)),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WithSeveralFilters_ShouldCombineThemAll()
    {
        await Handler().Handle(new GetOnlineOrderStatsQuery(
            From: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
            To: new DateTime(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc),
            Status: OrderStatus.Ready,
            PaymentStatus: OrderPaymentStatus.Pending,
            DeliveryType: OrderDeliveryType.Pickup), CancellationToken.None);

        _orderRepository.Verify(
            x => x.GetStatsByStoreIdAsync(
                _storeId,
                It.Is<OrderStatsFilter>(f => f.Status == OrderStatus.Ready
                    && f.PaymentStatus == OrderPaymentStatus.Pending
                    && f.DeliveryType == OrderDeliveryType.Pickup
                    && f.From == new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
                    && f.To == EndOfDay(2026, 10, 7))),
            Times.Once);
    }

    /// <summary>
    /// El rango es el eje de la vista ("hoy", "esta semana"), así que los dos extremos se
    /// normalizan a DÍAS COMPLETOS antes de llegar a la base — el mismo D2 de F5.
    ///
    /// `From` a las 00:00 de su día y `To` al último tick del suyo: si el extremo superior se
    /// quedara en la medianoche que ARRANCA el día elegido, "los pedidos del 7" saldría vacío salvo
    /// el pedido exacto de medianoche, y el ticket medio de la semana aparecería a cero.
    /// </summary>
    [Fact]
    public async Task Handle_WithADateRange_ShouldForwardBothEndsAsWholeDays()
    {
        OrderStatsFilter filter = await CaptureFilter(new GetOnlineOrderStatsQuery(
            From: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
            To: new DateTime(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc)));

        filter.From.Should().Be(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc));
        filter.To.Should().Be(EndOfDay(2026, 10, 7));
    }

    /// <summary>
    /// El caso que fallaba: `from = to` sobre el MISMO día, que es lo que produce la vista al
    /// elegir "hoy" en los dos campos. Sin normalizar, el rango valía
    /// <c>[00:00:00, 00:00:00]</c> — una ventana de cero ticks sin ningún pedido posterior a la
    /// medianoche.
    /// </summary>
    [Fact]
    public async Task Handle_WithFromAndToOnTheSameDay_ShouldCoverThatWholeDay()
    {
        OrderStatsFilter filter = await CaptureFilter(new GetOnlineOrderStatsQuery(
            From: new DateTime(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc),
            To: new DateTime(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc)));

        filter.From.Should().Be(new DateTime(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc));
        filter.To.Should().Be(EndOfDay(2026, 10, 7));
        (new DateTime(2026, 10, 7, 22, 30, 0, DateTimeKind.Utc) <= filter.To).Should().BeTrue(
            "un pedido de las 22:30 del día pedido tiene que entrar en el rango de ese día");
    }

    /// <summary>
    /// El extremo INFERIOR se clava a las 00:00 aunque venga con hora: "desde el 1" es el día 1
    /// entero, no el día 1 a partir del reloj del navegador.
    /// </summary>
    [Fact]
    public async Task Handle_WithAClockTimeOnTheFromBound_ShouldClampItToTheStartOfThatDay()
    {
        OrderStatsFilter filter = await CaptureFilter(new GetOnlineOrderStatsQuery(
            From: new DateTime(2026, 10, 1, 14, 30, 0, DateTimeKind.Utc)));

        filter.From.Should().Be(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc));
    }

    /// <summary>
    /// Normalizar NO es rellenar. Un <c>?from=</c> sin <c>?to=</c> significa "sin límite superior",
    /// y no "hasta el final del tiempo": un extremo inventado convertiría "este mes" en "histórico
    /// entero", que es justo la lectura completa del histórico que el agregado evita.
    /// </summary>
    [Fact]
    public async Task Handle_WithOnlyAFromBound_ShouldNotInventAnUpperBound()
    {
        OrderStatsFilter filter = await CaptureFilter(new GetOnlineOrderStatsQuery(
            From: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)));

        filter.To.Should().BeNull();
    }

    /// <summary>El otro lado: "hasta el 7" no es "desde el 1 de enero del año 1".</summary>
    [Fact]
    public async Task Handle_WithOnlyAToBound_ShouldNotInventALowerBound()
    {
        OrderStatsFilter filter = await CaptureFilter(new GetOnlineOrderStatsQuery(
            To: new DateTime(2026, 10, 7, 0, 0, 0, DateTimeKind.Utc)));

        filter.From.Should().BeNull();
    }

    /// <summary>
    /// <c>9999-12-31</c> no tiene "día siguiente" y <c>AddDays(1)</c> lanza
    /// <see cref="ArgumentOutOfRangeException"/>, así que un <c>?to=9999-12-31</c> —una URL
    /// perfectamente válida— devolvería un 500 por la aritmética de un día. Se queda en el último
    /// tick en vez de reventar.
    /// </summary>
    [Fact]
    public async Task Handle_WithTheLastRepresentableDayAsTo_ShouldNotOverflowPastDateTimeMaxValue()
    {
        OrderStatsFilter? captured = null;
        _orderRepository
            .Setup(x => x.GetStatsByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderStatsFilter>()))
            .Callback<Guid, OrderStatsFilter>((storeId, filter) => captured = filter)
            .ReturnsAsync(Zero());

        var result = await Handler().Handle(
            new GetOnlineOrderStatsQuery(To: DateTime.MaxValue), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        captured.Should().NotBeNull();
        captured!.To.Should().Be(DateTime.MaxValue);
    }

    #endregion

    #region The Cancelled Rule

    /// <summary>
    /// `TotalSales` excluye los cancelados; `OrdersCount` NO. Los dos números responden a dos
    /// preguntas distintas —"cuántos pedidos entraron" y "cuánto se vendió"— y un panel que los
    /// igualara diría que se vendieron 999 que el dueño canceló. El cancelado sigue siendo visible
    /// en `ByStatus`, así que ningún dato se pierde.
    /// </summary>
    [Fact]
    public async Task Handle_WithCancelledOrders_ShouldKeepThemInTheOrderCountButOutOfTheSales()
    {
        Returns(new OrderAggregateStats
        {
            OrdersCount = 3,
            NonCancelledCount = 2,
            TotalSales = 300m,
            ByStatus = new Dictionary<OrderStatus, int> { [OrderStatus.Cancelled] = 1 },
        });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.OrdersCount.Should().Be(3);
        result.Data.NonCancelledCount.Should().Be(2);
        result.Data.TotalSales.Should().Be(300m);
        result.Data.ByStatus.Should().ContainSingle(
            entry => entry.Status == OrderStatus.Cancelled && entry.Count == 1);
    }

    /// <summary>
    /// LA coherencia del ticket medio: se divide por los NO cancelados. Con 300 vendidos en 3
    /// pedidos (uno cancelado), <c>300 / 3 = 100</c> publicaría un ticket medio 33 % más bajo del
    /// real, y es el número más grande de la vista.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldAverageOverTheNonCancelledOrdersOnly()
    {
        Returns(new OrderAggregateStats
        {
            OrdersCount = 3,
            NonCancelledCount = 2,
            TotalSales = 300m,
        });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.AverageTicket.Should().Be(150m);
        result.Data!.AverageTicket.Should().NotBe(100m,
            "dividir por OrdersCount metería el cancelado en el denominador");
    }

    /// <summary>
    /// Un rango donde TODO está cancelado NO tiene ticket medio: el denominador es cero y dividir
    /// da <c>DivideByZeroException</c>, que saldría como un 500 por un panel que solo quería
    /// pintar un 0. <c>NonCancelledCount</c> es la guarda, y es la razón de que ese número viaje en
    /// el agregado.
    /// </summary>
    [Fact]
    public async Task Handle_WhenEveryOrderIsCancelled_ShouldReportZeroAverageTicketInsteadOfDividingByZero()
    {
        Returns(new OrderAggregateStats
        {
            OrdersCount = 2,
            NonCancelledCount = 0,
            TotalSales = 0m,
            ByStatus = new Dictionary<OrderStatus, int> { [OrderStatus.Cancelled] = 2 },
        });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.AverageTicket.Should().Be(0m);
    }

    /// <summary>
    /// El ticket medio sale REDONDEADO a dos decimales — la unidad mínima de la moneda. Sin eso,
    /// 100 entre 3 saldría como <c>33.33333333333333333333333333</c> en el JSON: 28 dígitos que el
    /// frontend tendría que recortar y que nadie lee.
    /// </summary>
    [Fact]
    public async Task Handle_WithANonTerminatingAverage_ShouldRoundItToCents()
    {
        Returns(new OrderAggregateStats
        {
            OrdersCount = 3,
            NonCancelledCount = 3,
            TotalSales = 100m,
        });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.AverageTicket.Should().Be(33.33m);
    }

    /// <summary>
    /// Los importes de pago NO se redondean: son sumas de `Order.Total`, que ya viene con la
    /// precisión con que se guardó. Redondear una suma cambiaría el dinero que dice el panel.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNotRoundTheAmounts()
    {
        Returns(new OrderAggregateStats
        {
            OrdersCount = 1,
            NonCancelledCount = 1,
            TotalSales = 1234.5678m,
            PaidAmount = 1234.5678m,
        });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.TotalSales.Should().Be(1234.5678m);
        result.Data!.PaidAmount.Should().Be(1234.5678m);
    }

    #endregion

    #region Breakdowns And Currency

    /// <summary>
    /// Los dos desgloses salen COMPLETOS, con un 0 para cada estado y modalidad sin pedidos en el
    /// rango. Es lo que permite pintar un eje estable: si el DTO trajera solo los presentes, la
    /// tarjeta "por estado" cambiaría de altura y saltaría de sitio cada vez que cambiara el filtro.
    ///
    /// Se incluyen TODOS —también los cancelados y los estados terminales que no ocurrieron— porque
    /// la lista completa de la D11 es información de dominio, no del rango, y el cliente es quien
    /// decide qué pintar.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldListEveryStatusAndDeliveryTypeEvenWhenTheRangeHasNone()
    {
        Returns(new OrderAggregateStats { OrdersCount = 0 });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.ByStatus.Should().HaveCount(Enum.GetValues<OrderStatus>().Length);
        result.Data!.ByStatus.Should().OnlyContain(entry => entry.Count == 0);
        result.Data!.ByStatus.Select(entry => entry.Status)
            .Should().Contain([OrderStatus.New, OrderStatus.Cancelled]);
        result.Data!.ByDeliveryType.Should().HaveCount(Enum.GetValues<OrderDeliveryType>().Length);
        result.Data!.ByDeliveryType.Should().OnlyContain(entry => entry.Count == 0);
    }

    /// <summary>
    /// Y el orden de los desgloses es el del enum, no el que devuelva la base: el eje del gráfico
    /// tiene que ser el mismo con los mismos datos, se filtren como se filtren.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldOrderTheBreakdownsByEnumValue()
    {
        Returns(new OrderAggregateStats
        {
            OrdersCount = 2,
            ByStatus = new Dictionary<OrderStatus, int> { [OrderStatus.Delivered] = 1, [OrderStatus.New] = 1 },
            ByDeliveryType = new Dictionary<OrderDeliveryType, int> { [OrderDeliveryType.Delivery] = 1, [OrderDeliveryType.Pickup] = 1 },
        });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.ByStatus.Select(entry => entry.Status).Should().Equal(Enum.GetValues<OrderStatus>());
        result.Data!.ByDeliveryType.Select(entry => entry.DeliveryType).Should().Equal(Enum.GetValues<OrderDeliveryType>());
    }

    [Fact]
    public async Task Handle_WithOrdersInSeveralStatuses_ShouldCountEachOne()
    {
        Returns(new OrderAggregateStats
        {
            OrdersCount = 3,
            ByStatus = new Dictionary<OrderStatus, int> { [OrderStatus.New] = 2, [OrderStatus.Delivered] = 1 },
        });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.ByStatus.Should().ContainSingle(entry => entry.Status == OrderStatus.New && entry.Count == 2);
        result.Data!.ByStatus.Should().ContainSingle(entry => entry.Status == OrderStatus.Delivered && entry.Count == 1);
        result.Data!.ByStatus.Should().ContainSingle(entry => entry.Status == OrderStatus.Cancelled && entry.Count == 0);
    }

    /// <summary>
    /// La moneda sale de los pedidos; cuando el rango no tiene ninguno, la que trae el agregado
    /// —el default del dominio, CUP— viaja igual. El DTO la declara `Currency` y no `Currency?` a
    /// propósito: el cliente siempre formatea importes, y un `null` lo obligaría a ramificar en
    /// cada tarjeta.
    /// </summary>
    [Fact]
    public async Task Handle_WithNoOrders_ShouldReturnTheDomainDefaultCurrency()
    {
        Returns(new OrderAggregateStats { OrdersCount = 0, Currency = Currency.CUP });

        var result = await Handler().Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.Currency.Should().Be(Currency.CUP);
    }

    #endregion

    #region Over The Real Repository

    /// <summary>
    /// <c>OrderRepository</c> REAL sobre <c>InMemory</c> con la sesión de la tienda. Es el control
    /// que une las dos capas: si el handler pidiera el agregado de otra tienda, o si el filtro
    /// saliera mal construido, aparecería en las métricas de una tienda la venta de otra, y ningún
    /// test con mocks puede verlo porque el mock devuelve lo que el test le dio.
    /// </summary>
    [Fact]
    public async Task Handle_OverTheRealRepository_ShouldNotCountOrdersFromAnotherStore()
    {
        Guid tenantId = Guid.NewGuid();
        Guid otherStoreId = Guid.NewGuid();

        Order mine = Order(status: OrderStatus.Delivered, paymentStatus: OrderPaymentStatus.Paid, tenantId: tenantId);
        Order theirs = Order(storeId: otherStoreId, tenantId: tenantId,
            total: 5_000m, status: OrderStatus.Delivered, paymentStatus: OrderPaymentStatus.Paid);

        var (db, repository) = RepositoryOver(tenantId, mine, theirs);

        var result = await new GetOnlineOrderStatsQueryHandler(
            _httpContextService.Object, repository, _localizer.Object)
            .Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.OrdersCount.Should().Be(1);
        result.Data!.TotalSales.Should().Be(mine.Total);
        db.Dispose();
    }

    /// <summary>
    /// El mismo camino, pero con el detalle del por qué: la fila cancelada existe en la base, el
    /// desglose la cuenta, y el total NO la suma. Es el criterio 2 de aceptación de F6 comprobado
    /// de punta a punta, con el agregador de verdad detrás.
    /// </summary>
    [Fact]
    public async Task Handle_OverTheRealRepository_WithACancelledOrder_ShouldNotAddItToTheSales()
    {
        Guid tenantId = Guid.NewGuid();

        Order sold = Order(total: 100m, status: OrderStatus.Delivered, paymentStatus: OrderPaymentStatus.Paid, tenantId: tenantId);
        Order cancelled = Order(total: 999m, status: OrderStatus.Cancelled, paymentStatus: OrderPaymentStatus.Pending, tenantId: tenantId);

        var (db, repository) = RepositoryOver(tenantId, sold, cancelled);

        var result = await new GetOnlineOrderStatsQueryHandler(
            _httpContextService.Object, repository, _localizer.Object)
            .Handle(new GetOnlineOrderStatsQuery(), CancellationToken.None);

        result.Data!.OrdersCount.Should().Be(2);
        result.Data!.TotalSales.Should().Be(100m);
        result.Data!.AverageTicket.Should().Be(100m);
        db.Dispose();
    }

    private static (ApplicationDbContext Db, OrderRepository Repository) RepositoryOver(
        Guid tenantId, params Order[] orders)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var session = new Mock<IHttpContextService>();
        session.Setup(x => x.TenantId).Returns(tenantId.ToString());
        session.Setup(x => x.IsSuperAdmin).Returns(false);
        session.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        var db = new ApplicationDbContext(
            options, new TenantIdProvider(new HttpContextAccessor()), session.Object);

        db.Set<Order>().AddRange(orders);
        db.SaveChanges();

        return (db, new OrderRepository(db));
    }

    /// <summary>
    /// Pedido online de una tienda. Los parámetros con nombre son opcionales para que cada test
    /// declare solo lo que le importa y el resto salga en el default de la entidad
    /// (<c>New</c> + <c>Pending</c>), que es como nace un pedido real.
    /// </summary>
    private Order Order(
        decimal total = 100m,
        OrderStatus status = OrderStatus.New,
        OrderPaymentStatus paymentStatus = OrderPaymentStatus.Pending,
        Guid? storeId = null,
        Guid? tenantId = null)
    {
        Order order = Domain.Entities.Orders.Order.Create(
            storeId ?? _storeId,
            OrderType.WhatsApp,
            string.Empty,
            total,
            1,
            new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc),
            tenantId ?? Guid.NewGuid());
        order.Status = status;
        order.PaymentStatus = paymentStatus;
        return order;
    }

    #endregion

    /// <summary>
    /// Ejecuta el handler y devuelve el filtro que salió REALMENTE hacia el repositorio. Los
    /// filtros de fecha se comprueban sobre el filtro capturado y no sobre la respuesta porque el
    /// DTO no los devuelve: lo que se arregla (D2) es el predicado que se ejecuta.
    /// </summary>
    private async Task<OrderStatsFilter> CaptureFilter(GetOnlineOrderStatsQuery query)
    {
        OrderStatsFilter? captured = null;
        _orderRepository
            .Setup(x => x.GetStatsByStoreIdAsync(It.IsAny<Guid>(), It.IsAny<OrderStatsFilter>()))
            .Callback<Guid, OrderStatsFilter>((storeId, filter) => captured = filter)
            .ReturnsAsync(Zero());

        await Handler().Handle(query, CancellationToken.None);

        captured.Should().NotBeNull("el handler tiene que llamar al repositorio");
        return captured!;
    }

    /// <summary>El último instante representable de un día: <c>23:59:59.9999999</c>.</summary>
    private static DateTime EndOfDay(int year, int month, int day)
        => new DateTime(year, month, day, 23, 59, 59, DateTimeKind.Utc).AddTicks(TimeSpan.TicksPerSecond - 1);
}
