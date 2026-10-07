using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El filtro global por tenant de <c>Order</c> y su lectura PÚBLICA por código.
///
/// Esta suite es la del bloqueante que F3 encontró al montar la consulta pública del estado del
/// pedido: <c>Order</c> tiene filtro global <c>IsSuperAdmin || TenantId == TenantId</c>, y una
/// petición ANÓNIMA no tiene tenant en el contexto, así que la lectura de sesión
/// (<c>GetByCodeAsync</c>) no puede devolver fila. El cliente habría recibido 404 para SIEMPRE,
/// con el pedido_created correctamente en la base — el peor tipo de fallo: sin error, sin aviso.
///
/// Lo que fija, y por qué son cuatro tests y no uno:
///   * la lectura PÚBLICA ve el pedido sin tenant en el contexto (el caso que fallaba);
///   * la lectura de SESIÓN NO lo ve sin tenant — si esto no se cumpliera, el filtro no existiría y
///     la prueba de al lado no valdría nada;
///   * con el tenant correcto, la de sesión SÍ lo ve (control positivo: el filtro no oculta todo);
///   * la pública sigue acotada por `StoreId` Y por código: salta el filtro, no el criterio.
///
/// El montaje es un `ApplicationDbContext` real sobre `InMemory` con la sesión simulada, el mismo
/// patrón que `StoreCatalogSettingsRepositoryTenantFilterTests`.
///
/// Nota de alcance: esto prueba la EFECTIVIDAD del bypass en el proveedor de tests, no en
/// PostgreSQL. Lo que lo demuestra en la base real es la suite E2E (fuera del alcance de esta
/// feature, y que aquí no se toca). Por eso el test se apoya en el filtro GLOBAL DEL MODELO —que es
/// el mismo objeto que PostgreSQL evalúa— y no en una simulación del filtro.
/// </summary>
public class OrderRepositoryPublicReadTests
{
    private const string _code = "AB12CD";

    /// <summary>
    /// Contexto con un pedido de `<paramref name="storeId"/>`/`<paramref name="tenantId"/>` y su
    /// línea. `<paramref name="anonymous"/>` simula la petición pública: sin claims, así que
    /// <c>IsSuperAdmin = false</c> y <c>TenantId</c> vacío — que en el <c>DbContext</c> es null.
    /// </summary>
    private static (ApplicationDbContext Context, OrderRepository Repository)
        CreateContextWithSeededOrder(Guid storeId, Guid tenantId, bool anonymous)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(!anonymous);
        httpContextMock.Setup(x => x.TenantId).Returns(anonymous ? string.Empty : tenantId.ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(anonymous ? string.Empty : Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.StoreId).Returns(anonymous ? string.Empty : storeId.ToString());

        var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
        var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);

        Order order = Order.CreateOnline(
            storeId,
            tenantId,
            _code,
            OrderDeliveryType.Delivery,
            "Ana",
            "+5350000000",
            200m,
            Currency.CUP,
            [new OrderLine(Guid.NewGuid(), "Arroz", 2, 100m, Currency.CUP)],
            deliveryAddress: "Calle 23 #45");
        context.Set<Order>().Add(order);
        context.SaveChanges();

        return (context, new OrderRepository(context));
    }

    /// <summary>
    /// El caso que fallaba: sin tenant en el contexto, la lectura PÚBLICA encuentra el pedido y sus
    /// líneas, así que el cliente puede seguir su pedido.
    /// </summary>
    [Fact]
    public async Task GetPublicByCodeAsync_WithoutATenantInContext_ShouldReturnTheOrder()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededOrder(storeId, Guid.NewGuid(), anonymous: true);

        Order? found = await repository.GetPublicByCodeAsync(storeId, _code);

        found.Should().NotBeNull();
        found!.Code.Should().Be(_code);
        found.CustomerPhone.Should().Be("+5350000000");

        context.Dispose();
    }

    /// <summary>
    /// Las líneas vienen cargadas: el DTO público las publica y sin `Include` el cliente vería un
    /// pedido sin artículos. `OrderItem` tiene su PROPIO filtro por tenant, así que este test
    /// comprueba también que el bypass llega a las líneas y no solo al pedido.
    /// </summary>
    [Fact]
    public async Task GetPublicByCodeAsync_WithoutATenantInContext_ShouldReturnTheOrderLines()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededOrder(storeId, Guid.NewGuid(), anonymous: true);

        Order? found = await repository.GetPublicByCodeAsync(storeId, _code);

        found!.OrderItems.Should().ContainSingle();
        found.OrderItems.Single().Name.Should().Be("Arroz");
        found.OrderItems.Single().Quantity.Should().Be(2);
        found.OrderItems.Single().Price.Should().Be(100m);

        context.Dispose();
    }

    /// <summary>
    /// El otro lado de la moneda: la lectura DE SESIÓN no ve ese mismo pedido sin tenant. Es lo que
    /// la mantiene acotada al carrito, y la razón de que no lleve `IgnoreQueryFilters`.
    /// </summary>
    [Fact]
    public async Task GetByCodeAsync_WithoutATenantInContext_ShouldNotReturnTheOrder()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededOrder(storeId, Guid.NewGuid(), anonymous: true);

        Order? found = await repository.GetByCodeAsync(storeId, _code);

        found.Should().BeNull();

        context.Dispose();
    }

    /// <summary>
    /// Control positivo: con el tenant de ESA tienda en el contexto, la lectura de sesión lo ve.
    /// Sin esto, el test anterior pasaría también con un filtro que lo ocultara todo.
    /// </summary>
    [Fact]
    public async Task GetByCodeAsync_WithTheTenantInContext_ShouldReturnTheOrder()
    {
        Guid storeId = Guid.NewGuid();
        Guid tenantId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededOrder(storeId, tenantId, anonymous: false);

        Order? found = await repository.GetByCodeAsync(storeId, _code);

        found.Should().NotBeNull();
        found!.Code.Should().Be(_code);

        context.Dispose();
    }

    /// <summary>
    /// Salta el filtro, no el criterio: la lectura pública sigue acotada por `StoreId` y por código,
    /// así que no devuelve el pedido de otra tienda ni un código que no existe.
    /// </summary>
    [Fact]
    public async Task GetPublicByCodeAsync_ForAnotherStoreOrCode_ShouldNotReturnTheOrder()
    {
        Guid storeId = Guid.NewGuid();
        var (context, repository) = CreateContextWithSeededOrder(storeId, Guid.NewGuid(), anonymous: true);

        (await repository.GetPublicByCodeAsync(Guid.NewGuid(), _code)).Should().BeNull();
        (await repository.GetPublicByCodeAsync(storeId, "ZZ99ZZ")).Should().BeNull();

        context.Dispose();
    }
}