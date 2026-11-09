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
/// El CANAL de la orden decide qué cuenta como pedido del catálogo web.
///
/// Antes la conversión del catálogo contaba las filas con <c>OrderType.WhatsApp</c>, un valor que
/// en realidad marcaba el canal. Ese valor se retiró y el tipo pasó a decir lo que de verdad es
/// (Normal/Mayorista), así que la métrica pregunta por <c>!IsOfflineOrder</c>: la MISMA pregunta
/// —"no lo escribió el POS"— sin confundirla con el tipo de venta.
///
/// Se prueba contra el <see cref="OrderRepository"/> REAL sobre <c>InMemory</c>, porque lo que puede
/// estar mal es el predicado que se ejecuta en la consulta, no un mock.
/// </summary>
public class OrderConversionMetricChannelTests
{
    private static readonly Guid StoreId = Guid.NewGuid();
    private static readonly DateTime Day = new(2026, 11, 1, 9, 0, 0, DateTimeKind.Utc);

    private static (ApplicationDbContext Db, IOrderRepository Repository) RepositoryOver(params Order[] orders)
    {
        Guid tenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
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

    private static Order OrderOf(OrderType type, bool isOffline)
    {
        Order order = Domain.Entities.Orders.Order.Create(
            StoreId, type, string.Empty, 50m, 1, Day, Guid.Parse("11111111-1111-1111-1111-111111111111"));
        order.IsOfflineOrder = isOffline;
        return order;
    }

    /// <summary>
    /// Los pedidos del servidor cuentan sin importar su tipo: una venta mayorista del catálogo es
    /// una conversión igual que una al detal.
    /// </summary>
    [Fact]
    public async Task CountOnlineOrdersAsync_ShouldCountEveryOrderTheServerCreated()
    {
        var (db, repository) = RepositoryOver(
            OrderOf(OrderType.Normal, isOffline: false),
            OrderOf(OrderType.Mayorista, isOffline: false));
        using (db)
        {
            (await repository.CountOnlineOrdersAsync(StoreId, Day.AddHours(-1), Day.AddHours(1)))
                .Should().Be(2);
        }
    }

    /// <summary>La venta que escribió el POS no es una conversión del catálogo, sea del tipo que sea.</summary>
    [Theory]
    [InlineData(OrderType.Normal)]
    [InlineData(OrderType.Mayorista)]
    public async Task CountOnlineOrdersAsync_ShouldExcludeThePosChannel(OrderType posType)
    {
        var (db, repository) = RepositoryOver(
            OrderOf(posType, isOffline: true),
            OrderOf(OrderType.Normal, isOffline: false));
        using (db)
        {
            (await repository.CountOnlineOrdersAsync(StoreId, Day.AddHours(-1), Day.AddHours(1)))
                .Should().Be(1, "solo el pedido del servidor es una conversión");
        }
    }
}
