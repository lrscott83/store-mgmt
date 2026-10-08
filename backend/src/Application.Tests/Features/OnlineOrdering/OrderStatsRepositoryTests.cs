using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// La AGREGA de las métricas (F6, T1) contra el <see cref="OrderRepository"/> REAL sobre
/// <c>InMemory</c>, no contra un mock.
///
/// Existe esta clase separada de la del handler porque elAggregado es lo ÚNICO de F6 que puede
/// estar mal sin que ningún test de C# se entere: un `Mock&lt;IOrderRepository&gt;` devuelve el
/// `OrderAggregateStats` que el test le dio, así que "sumar en memoria" y "excluir cancelados"
///_from the mock's point of view_ dan el mismo resultado — el mock devuelve un agregado ya
/// correcto y no puede equivocarse. Lo que se equivoca de verdad es el `Sum`/`Count`/`GroupBy` que
/// se ejecutan contra la base, y eso solo se ejecuta con el repositorio de verdad.
///
/// Nota de alcance: `InMemory` prueba la aritmética LINQ y el aislamiento por tienda. No prueba
/// el SQL que genera Npgsql para los agregados condicionales —lo que demuestra el SQL real es la
/// suite E2E, fuera del alcance de esta unidad.
/// </summary>
public class OrderStatsRepositoryTests
{
    private static readonly Guid StoreId = Guid.NewGuid();
    private static readonly Guid OtherStoreId = Guid.NewGuid();

    private static readonly DateTime Day1 = new(2026, 10, 1, 9, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Day2 = new(2026, 10, 2, 9, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Day3 = new(2026, 10, 3, 9, 0, 0, DateTimeKind.Utc);

    /// <summary>
    /// Contexto <c>InMemory</c> con la SESIÓN de un tenant (el filtro global de <c>Order</c> es
    /// <c>IsSuperAdmin || TenantId == contexto.TenantId</c>), sembrado con los pedidos dados.
    /// </summary>
    private static (ApplicationDbContext Db, IOrderRepository Repository) RepositoryOver(
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

    private static Order OrderOf(
        Guid storeId,
        Guid tenantId,
        decimal total,
        OrderStatus status,
        OrderPaymentStatus paymentStatus,
        OrderDeliveryType deliveryType,
        DateTime date,
        Currency currency = Currency.CUP)
    {
        Order order = Domain.Entities.Orders.Order.Create(
            storeId, OrderType.WhatsApp, string.Empty, total, 1, date, tenantId);
        order.Status = status;
        order.PaymentStatus = paymentStatus;
        order.DeliveryType = deliveryType;
        order.Currency = currency;
        return order;
    }

    /// <summary>Atajo para el caso base: un pedido vendido de esta tienda.</summary>
    private static Order OrderOf(Guid tenantId, decimal total, DateTime date) => OrderOf(
        StoreId, tenantId, total,
        OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, date);

    #region Store Isolation

    /// <summary>
    /// Criterio 7 en su forma más dura: el pedido AJENO no existe desde aquí, ni para contar ni
    /// para sumar. Un pedido de otra tienda vale más que todos los de esta, así que si el
    /// aislamiento fallara el <c>TotalSales</c> lo delataría de sobra.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_ShouldOnlySeeTheOrdersOfThatStore()
    {
        Guid tenantId = Guid.NewGuid();
        Order mine = OrderOf(tenantId, 100m, Day1);
        Order theirs = OrderOf(OtherStoreId, tenantId, 5_000m,
            OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day1);

        var (db, repository) = RepositoryOver(tenantId, mine, theirs);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.OrdersCount.Should().Be(1);
        stats.TotalSales.Should().Be(100m);
        db.Dispose();
    }

    /// <summary>
    /// Y por el otro lado: el `storeId` que se pasa ES el que se filtra. Pedir las métricas de otra
    /// tienda devuelve las suyas, no un error y no un cero — por eso el handler tiene que ser el que
    /// pone el `storeId` de la sesión, y este test comprueba que el repositorio lo respeta.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_WithTheOtherStoreId_ShouldReturnItsOwnNumbers()
    {
        Guid tenantId = Guid.NewGuid();
        Order mine = OrderOf(tenantId, 100m, Day1);
        Order theirs = OrderOf(OtherStoreId, tenantId, 5_000m,
            OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day1);

        var (db, repository) = RepositoryOver(tenantId, mine, theirs);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(OtherStoreId, new OrderStatsFilter());

        stats.OrdersCount.Should().Be(1);
        stats.TotalSales.Should().Be(5_000m);
        db.Dispose();
    }

    #endregion

    #region Cancelled Exclusion

    /// <summary>
    /// LA REGLA de F6, y la razón de que este archivo exista: <c>TotalSales</c> EXCLUYE los
    /// cancelados, pero <c>OrdersCount</c> NO —los cuenta todos.
    ///
    /// Los dos números son de conjuntos distintos a propósito: "cuántos pedidos entraron" y "cuánto
    /// se vendió" no son la misma pregunta, y un panel que mezclara los dos diría que se vendieron
    /// 1 399 que el dueño canceló. El desglose por estado es lo que deja ver el cancelado, así que
    /// ningún dato se pierde por excluirlo de la venta.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_WithCancelledOrders_ShouldExcludeThemFromSalesButCountThem()
    {
        Guid tenantId = Guid.NewGuid();
        Order delivered = OrderOf(StoreId, tenantId, 100m,
            OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day1);
        Order pending = OrderOf(StoreId, tenantId, 200m,
            OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day2);
        Order cancelled = OrderOf(StoreId, tenantId, 999m,
            OrderStatus.Cancelled, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day3, Currency.USD);

        var (db, repository) = RepositoryOver(tenantId, delivered, pending, cancelled);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.OrdersCount.Should().Be(3, "los tres pedidos entraron en el rango");
        stats.NonCancelledCount.Should().Be(2);
        stats.TotalSales.Should().Be(300m, "los 999 del cancelado NO son venta");
        db.Dispose();
    }

    /// <summary>
    /// El cancelado tampoco es DEUDA ni COBRO. Si sus 999 Sumaran en <c>PendingAmount</c>, el panel
    /// diría "te deben 1 199" por un pedido que el propio dueño canceló, y la tienda iría a
    /// perseguir un cobro inexistente.
    ///
    /// Y los RECUENTOS se excluyen igual que los importes, porque <c>PaidCount</c> tiene que
    /// describir exactamente el mismo conjunto que <c>PaidAmount</c>: si uno contara el cancelado y
    /// el otro no, <c>PaidAmount / PaidCount</c> —el ticket medio de lo pagado— saldría mal.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_ShouldSplitPaidAndPendingExcludingCancelledFromBoth()
    {
        Guid tenantId = Guid.NewGuid();
        Order paid = OrderOf(StoreId, tenantId, 100m,
            OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day1);
        Order unpaid = OrderOf(StoreId, tenantId, 200m,
            OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day2);
        Order cancelledUnpaid = OrderOf(StoreId, tenantId, 999m,
            OrderStatus.Cancelled, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day3);
        Order cancelledPaid = OrderOf(StoreId, tenantId, 777m,
            OrderStatus.Cancelled, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day3);

        var (db, repository) = RepositoryOver(tenantId, paid, unpaid, cancelledUnpaid, cancelledPaid);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.PaidCount.Should().Be(1);
        stats.PaidAmount.Should().Be(100m);
        stats.PendingCount.Should().Be(1);
        stats.PendingAmount.Should().Be(200m);
        db.Dispose();
    }

    /// <summary>
    /// Un rango donde TODO está cancelado es un rango sin venta: los tres sumatorios tienen que
    /// salir en cero y no en <c>null</c> ni en una excepción por dividir un conjunto vacío.
    /// <c>NonCancelledCount = 0</c> es la señal que usa el handler para no hacer la división.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_WithOnlyCancelledOrders_ShouldReportZeroSalesInsteadOfFailing()
    {
        Guid tenantId = Guid.NewGuid();
        Order cancelled = OrderOf(StoreId, tenantId, 500m,
            OrderStatus.Cancelled, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day1);

        var (db, repository) = RepositoryOver(tenantId, cancelled);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.OrdersCount.Should().Be(1);
        stats.NonCancelledCount.Should().Be(0);
        stats.TotalSales.Should().Be(0m);
        stats.PaidCount.Should().Be(0);
        stats.PaidAmount.Should().Be(0m);
        stats.PendingCount.Should().Be(0);
        stats.PendingAmount.Should().Be(0m);
        db.Dispose();
    }

    #endregion

    #region Breakdowns

    /// <summary>
    /// El desglose por estado CUENTA cancelados: es el único sitio donde se ven, y es lo que
    /// explica por qué <c>OrdersCount</c> no cuadra con <c>NonCancelledCount</c>.
    ///
    /// Solo trae los estados que existen en el rango. Rellenar los que faltan con 0 es tarea del
    /// handler, que es quien conoce la lista completa de la D11.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_ShouldCountEveryStatusIncludingCancelled()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders =
        {
            OrderOf(StoreId, tenantId, 10m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day1),
            OrderOf(StoreId, tenantId, 20m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day2),
            OrderOf(StoreId, tenantId, 30m, OrderStatus.Preparing, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day2),
            OrderOf(StoreId, tenantId, 40m, OrderStatus.Cancelled, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day3),
        };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.ByStatus.Should().HaveCount(3, "solo hay tres estados presentes en el rango");
        stats.ByStatus[OrderStatus.New].Should().Be(2);
        stats.ByStatus[OrderStatus.Preparing].Should().Be(1);
        stats.ByStatus[OrderStatus.Cancelled].Should().Be(1);
        stats.ByStatus.Should().NotContainKey(OrderStatus.Delivered);
        db.Dispose();
    }

    [Fact]
    public async Task GetStatsByStoreIdAsync_ShouldCountEveryDeliveryType()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders =
        {
            OrderOf(StoreId, tenantId, 10m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day1),
            OrderOf(StoreId, tenantId, 20m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day2),
            OrderOf(StoreId, tenantId, 30m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day3),
            OrderOf(StoreId, tenantId, 40m, OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Delivery, Day3),
        };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.ByDeliveryType.Should().HaveCount(2);
        stats.ByDeliveryType[OrderDeliveryType.Pickup].Should().Be(3);
        stats.ByDeliveryType[OrderDeliveryType.Delivery].Should().Be(1);
        db.Dispose();
    }

    /// <summary>
    /// Los dos desgloses suman lo mismo que <c>OrdersCount</c>: si no, el panel mostraría un total y
    /// unas tarjetas que no lo cuadran, y la persona leería "falta un pedido" sin poder saber cuál.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_ShouldMakeBothBreakdownsAddUpToTheOrderCount()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders =
        {
            OrderOf(StoreId, tenantId, 10m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day1),
            OrderOf(StoreId, tenantId, 20m, OrderStatus.Cancelled, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day2),
            OrderOf(StoreId, tenantId, 30m, OrderStatus.Ready, OrderPaymentStatus.Paid, OrderDeliveryType.Delivery, Day3),
        };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.ByStatus.Values.Sum().Should().Be(stats.OrdersCount);
        stats.ByDeliveryType.Values.Sum().Should().Be(stats.OrdersCount);
        db.Dispose();
    }

    #endregion

    #region Filters

    [Fact]
    public async Task GetStatsByStoreIdAsync_WithoutFilters_ShouldTakeEveryOrderOfTheStore()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders = { OrderOf(tenantId, 10m, Day1), OrderOf(tenantId, 20m, Day2) };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.OrdersCount.Should().Be(2);
        stats.TotalSales.Should().Be(30m);
        db.Dispose();
    }

    [Fact]
    public async Task GetStatsByStoreIdAsync_WithAStatus_ShouldOnlyTakeThatStatus()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders =
        {
            OrderOf(StoreId, tenantId, 100m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day1),
            OrderOf(StoreId, tenantId, 200m, OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Delivery, Day2),
        };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(
            StoreId, new OrderStatsFilter(Status: OrderStatus.New));

        stats.OrdersCount.Should().Be(1);
        stats.TotalSales.Should().Be(100m);
        stats.ByStatus.Should().ContainKey(OrderStatus.New);
        stats.ByStatus.Should().NotContainKey(OrderStatus.Delivered);
        db.Dispose();
    }

    /// <summary>
    /// Filtrar por pago PONE A CERO el otro lado, y sigue siendo coherente: con el filtro
    /// <c>Pending</c>, <c>PaidCount</c> es 0 porque no hay ninguno en el rango, no porque el
    /// filtro se ignorara. Sin esto, el panel "pendiente" mostraría a la vez el filtro aplicado y
    /// una tarjeta de "pagado" con datos.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_WithAPaymentStatus_ShouldZeroTheOtherSide()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders =
        {
            OrderOf(StoreId, tenantId, 100m, OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day1),
            OrderOf(StoreId, tenantId, 200m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day2),
        };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(
            StoreId, new OrderStatsFilter(PaymentStatus: OrderPaymentStatus.Pending));

        stats.OrdersCount.Should().Be(1);
        stats.PendingCount.Should().Be(1);
        stats.PendingAmount.Should().Be(200m);
        stats.PaidCount.Should().Be(0);
        stats.PaidAmount.Should().Be(0m);
        db.Dispose();
    }

    [Fact]
    public async Task GetStatsByStoreIdAsync_WithADeliveryType_ShouldOnlyTakeThatModality()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders =
        {
            OrderOf(StoreId, tenantId, 100m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day1),
            OrderOf(StoreId, tenantId, 200m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day2),
            OrderOf(StoreId, tenantId, 300m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day3),
        };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(
            StoreId, new OrderStatsFilter(DeliveryType: OrderDeliveryType.Delivery));

        stats.OrdersCount.Should().Be(1);
        stats.TotalSales.Should().Be(300m);
        stats.ByDeliveryType.Should().ContainKey(OrderDeliveryType.Delivery);
        stats.ByDeliveryType.Should().NotContainKey(OrderDeliveryType.Pickup);
        db.Dispose();
    }

    /// <summary>
    /// Los filtros se combinan con Y, que es el caso real de la vista ("los envíos de esta
    /// semana sin pagar"). De los cuatro pedidos solo entra el que cumple los TRES: el segundo se
    /// queda fuera por la modalidad y el cuarto por el pago, así que un filtro que se ignorara
    /// (o que se aplicara solo) también rompería esto.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_WithSeveralFilters_ShouldCombineThemAll()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders =
        {
            OrderOf(StoreId, tenantId, 100m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day2),
            OrderOf(StoreId, tenantId, 200m, OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day2),
            OrderOf(StoreId, tenantId, 300m, OrderStatus.Delivered, OrderPaymentStatus.Pending, OrderDeliveryType.Delivery, Day2),
            OrderOf(StoreId, tenantId, 400m, OrderStatus.New, OrderPaymentStatus.Paid, OrderDeliveryType.Delivery, Day3),
        };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(
            StoreId,
            new OrderStatsFilter(
                Status: OrderStatus.New,
                PaymentStatus: OrderPaymentStatus.Pending,
                DeliveryType: OrderDeliveryType.Delivery));

        stats.OrdersCount.Should().Be(1);
        stats.TotalSales.Should().Be(100m);
        db.Dispose();
    }

    /// <summary>
    /// El rango se aplica a los EXTREMOS INCLUSIVOS que el handler ya normalizó. Un pedido del día
    /// 2 entra en un rango que acaba el 2 a las 23:59:59,9999999, y uno del día 3 no.
    ///
    /// Se afirma el resultado y no el predicado porque lo que se arregla (D2 de F5) es la aritmética
    /// del handler, que tiene su propio test; aquí lo que se comprueba es que el repositorio USA
    /// los dos extremos como límites.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_ShouldOnlyTakeTheOrdersInsideTheRange()
    {
        Guid tenantId = Guid.NewGuid();
        Order[] orders =
        {
            OrderOf(tenantId, 10m, new DateTime(2026, 9, 30, 23, 59, 59, DateTimeKind.Utc)),
            OrderOf(tenantId, 20m, Day1),
            OrderOf(tenantId, 30m, new DateTime(2026, 10, 2, 22, 30, 0, DateTimeKind.Utc)),
            OrderOf(tenantId, 40m, new DateTime(2026, 10, 3, 0, 0, 0, DateTimeKind.Utc)),
        };

        var (db, repository) = RepositoryOver(tenantId, orders);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(
            StoreId,
            new OrderStatsFilter(
                From: new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
                To: new DateTime(2026, 10, 2, 23, 59, 59, DateTimeKind.Utc).AddTicks(TimeSpan.TicksPerSecond - 1)));

        stats.OrdersCount.Should().Be(2);
        stats.TotalSales.Should().Be(50m);
        db.Dispose();
    }

    /// <summary>
    /// Un rango VIEJO no es "cero" por accidente: es el mismo cero que devuelve una tienda sin
    /// pedidos. La vista tiene que poder pintar "no vendiste en ese periodo" sin tratar el caso
    /// aparte, así que los agregados no pueden romperse con un <c>From</c> antiguo.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_WithARangeThatMatchesNothing_ShouldReturnZeroes()
    {
        Guid tenantId = Guid.NewGuid();
        Order order = OrderOf(tenantId, 10m, Day1);

        var (db, repository) = RepositoryOver(tenantId, order);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(
            StoreId,
            new OrderStatsFilter(
                From: new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                To: new DateTime(2020, 1, 31, 23, 59, 59, DateTimeKind.Utc)));

        stats.OrdersCount.Should().Be(0);
        stats.NonCancelledCount.Should().Be(0);
        stats.TotalSales.Should().Be(0m);
        stats.ByStatus.Should().BeEmpty();
        stats.ByDeliveryType.Should().BeEmpty();
        db.Dispose();
    }

    #endregion

    #region Currency

    /// <summary>
    /// La moneda sale de los PEDIDOS, no de una configuración (A3 eliminada): no hay campo de
    /// moneda en el que leerla. Se toma la del pedido no cancelado MÁS RECIENTE del rango, con
    /// desempate por id para que dos pedidos del mismo instante no dejen la moneda al azar.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_ShouldReportTheCurrencyOfTheLatestNonCancelledOrder()
    {
        Guid tenantId = Guid.NewGuid();
        Order older = OrderOf(StoreId, tenantId, 10m,
            OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day1, Currency.CUP);
        Order newer = OrderOf(StoreId, tenantId, 20m,
            OrderStatus.New, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day2, Currency.USD);

        var (db, repository) = RepositoryOver(tenantId, older, newer);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.Currency.Should().Be(Currency.USD);
        db.Dispose();
    }

    /// <summary>
    /// La moneda de un pedido CANCELADO no cuenta: el mismo criterio que los importes. Si se
    /// aceptara, un cancelado suelto en USD cambiaría la moneda de todo el panel y los totales se
    /// mostrarían con un símbolo que no es el de la venta.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_ShouldNotTakeTheCurrencyOfACancelledOrder()
    {
        Guid tenantId = Guid.NewGuid();
        Order sold = OrderOf(StoreId, tenantId, 10m,
            OrderStatus.Delivered, OrderPaymentStatus.Paid, OrderDeliveryType.Pickup, Day1, Currency.CUP);
        Order cancelled = OrderOf(StoreId, tenantId, 20m,
            OrderStatus.Cancelled, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day3, Currency.USD);

        var (db, repository) = RepositoryOver(tenantId, sold, cancelled);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.Currency.Should().Be(Currency.CUP);
        db.Dispose();
    }

    /// <summary>
    /// Sin pedidos no cancelados NO hay moneda que leer, y el DTO la quiere siempre (es `Currency`,
    /// no `Currency?`): sale el DEFAULT DEL DOMINIO, <see cref="Currency.CUP"/> — el mismo valor
    /// que <c>Order.Currency</c> nace con y el primero del enum. Es un default SEGURO —un símbolo
    /// más de la lista de monedas, no un importe— y además es el que la mayoría de las tiendas ve,
    /// así que el caso vacío no se ve raro.
    ///
    /// Documentar el default es la mitad del contrato: un `default(Currency)` sin nombre es un 0
    /// que nadie sabe leer, y mañana alguien lo lee como "CUP" por casualidad y no por decisión.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_WithNothingSold_ShouldFallBackToTheDomainDefaultCurrency()
    {
        Guid tenantId = Guid.NewGuid();
        Order cancelled = OrderOf(StoreId, tenantId, 20m,
            OrderStatus.Cancelled, OrderPaymentStatus.Pending, OrderDeliveryType.Pickup, Day1, Currency.EUR);

        var (db, repository) = RepositoryOver(tenantId, cancelled);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.Currency.Should().Be(Currency.CUP);
        db.Dispose();
    }

    /// <summary>
    /// Una tienda SIN ningún pedido en absoluto es el otro caso vacío, y llega por el mismo camino:
    /// el mismo default, no una excepción ni un `null` que obligue al frontend a ramificar.
    /// </summary>
    [Fact]
    public async Task GetStatsByStoreIdAsync_OverAnEmptyTable_ShouldReturnZeroesAndTheDefaultCurrency()
    {
        Guid tenantId = Guid.NewGuid();

        var (db, repository) = RepositoryOver(tenantId);

        OrderAggregateStats stats = await repository.GetStatsByStoreIdAsync(StoreId, new OrderStatsFilter());

        stats.OrdersCount.Should().Be(0);
        stats.NonCancelledCount.Should().Be(0);
        stats.TotalSales.Should().Be(0m);
        stats.PaidCount.Should().Be(0);
        stats.PaidAmount.Should().Be(0m);
        stats.PendingCount.Should().Be(0);
        stats.PendingAmount.Should().Be(0m);
        stats.ByStatus.Should().BeEmpty();
        stats.ByDeliveryType.Should().BeEmpty();
        stats.Currency.Should().Be(Currency.CUP);
        db.Dispose();
    }

    #endregion
}