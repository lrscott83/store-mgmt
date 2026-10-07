using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderStatus;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// La consulta pública del estado de un pedido es la vía de autoservicio de la persona que pidió
/// por WhatsApp: sin cuenta y sin login. Eso convierte la SEGURIDAD de esta query en lo único que
/// importa, y por eso la suite fija cuatro cosas:
///
///   1. ANÓNIMA y acotada al slug (mismo 404 uniforme que el catálogo público);
///   2. código Y teléfono: el teléfono es un segundo factor débil, y si falta uno de los dos se
///      responde 404 — IGUAL en ambos casos, para no revelar cuál de los dos falló;
///   3. la lectura salta el filtro global por tenant (`GetPublicByCodeAsync`), porque el anónimo no
///      tiene tenant en el contexto;
///   4. la respuesta está ACOTADA: estado, pago, modalidad, total, moneda y líneas. Ni nombre, ni
///      dirección, ni notas, ni repartidor, ni ids internos.
/// </summary>
public class GetPublicOrderStatusQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private const string _slug = "tienda-ana";
    private const string _code = "AB12CD";
    private const string _phone = "+5350000000";

    private Guid _storeId;
    private readonly Guid _tenantId = Guid.NewGuid();

    public GetPublicOrderStatusQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
    }

    private GetPublicOrderStatusQueryHandler Handler() => new(
        _storeRepository.Object,
        _orderRepository.Object,
        _localizer.Object);

    private Store PublishedStore(string slug = "tienda-ana")
    {
        Store store = Store.Create("Tienda Ana", Guid.NewGuid(), true, _tenantId, null);
        store.CatalogSlug = slug;
        _storeRepository.Setup(x => x.GetStoreByCatalogSlugAsync(slug)).ReturnsAsync(store);
        _storeId = store.Id;
        return store;
    }

    /// <summary>Pedido online de la tienda resuelta, con sus líneas, tal como lo persiste F2.</summary>
    private Order PublishedOrder(
        string code = _code,
        string phone = _phone,
        OrderStatus status = OrderStatus.New,
        OrderPaymentStatus paymentStatus = OrderPaymentStatus.Pending,
        OrderDeliveryType deliveryType = OrderDeliveryType.Delivery,
        decimal total = 250m)
    {
        Order order = Order.CreateOnline(
            _storeId,
            _tenantId,
            code,
            deliveryType,
            "Ana",
            phone,
            total,
            Currency.CUP,
            [new OrderLine(Guid.NewGuid(), "Arroz", 2, 100m, Currency.CUP)],
            deliveryAddress: "Calle 23 #45",
            notes: "Tocar el timbre");
        order.Status = status;
        order.PaymentStatus = paymentStatus;
        return order;
    }

    private void OrderInStore(Order order)
        => _orderRepository
            .Setup(x => x.GetPublicByCodeAsync(_storeId, It.IsAny<string>()))
            .ReturnsAsync(order);

    private static GetPublicOrderStatusQuery Query(
        string slug = _slug,
        string code = _code,
        string phone = _phone) => new(slug, code, phone);

    #region Happy Path

    [Fact]
    public async Task Handle_WithTheRightCodeAndPhone_ShouldReturnTheOrderStatus()
    {
        PublishedStore();
        OrderInStore(PublishedOrder(status: OrderStatus.Preparing, paymentStatus: OrderPaymentStatus.Paid));

        var result = await Handler().Handle(Query(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Code.Should().Be(_code);
        result.Data.Status.Should().Be(OrderStatus.Preparing);
        result.Data.PaymentStatus.Should().Be(OrderPaymentStatus.Paid);
        result.Data.DeliveryType.Should().Be(OrderDeliveryType.Delivery);
        result.Data.Total.Should().Be(250m);
        result.Data.Currency.Should().Be(Currency.CUP);
    }

    /// <summary>
    /// Las líneas viajan con nombre, cantidad y precio: es el snapshot que la persona ve y lo que
    /// le confirma que el pedido es el suyo. El precio es el histórico del `OrderItem`, no el del
    /// catálogo de hoy.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnTheLinesAsNameQuantityAndPrice()
    {
        PublishedStore();
        OrderInStore(PublishedOrder());

        var result = await Handler().Handle(Query(), CancellationToken.None);

        result.Data!.Items.Should().ContainSingle();
        result.Data.Items.Single().Name.Should().Be("Arroz");
        result.Data.Items.Single().Quantity.Should().Be(2);
        result.Data.Items.Single().Price.Should().Be(100m);
    }

    /// <summary>El slug se normaliza como en el resto del módulo público (recortado + minúsculas).</summary>
    [Theory]
    [InlineData("  TIENDA-ANA  ")]
    [InlineData("tienda-ana")]
    public async Task Handle_ShouldResolveTheStoreByTheTrimmedLowercaseSlug(string slug)
    {
        PublishedStore();
        OrderInStore(PublishedOrder());

        await Handler().Handle(Query(slug: slug), CancellationToken.None);

        _storeRepository.Verify(x => x.GetStoreByCatalogSlugAsync("tienda-ana"), Times.Once);
    }

    /// <summary>
    /// ESTE es el guardián del filtro por tenant. `Order` tiene filtro global
    /// `IsSuperAdmin || TenantId == TenantId`; el anónimo no tiene tenant en el contexto, así que la
    /// lectura de SESIÓN (`GetByCodeAsync`) no puede devolver fila. Por eso la consulta pública usa
    /// `GetPublicByCodeAsync`, que salta ese filtro. Si alguien "simplifica" esto y cambia a
    /// `GetByCodeAsync`, este test cae.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNeverUseTheSessionScopedRead()
    {
        PublishedStore();
        OrderInStore(PublishedOrder());

        await Handler().Handle(Query(), CancellationToken.None);

        _orderRepository.Verify(x => x.GetPublicByCodeAsync(_storeId, It.IsAny<string>()), Times.Once);
        _orderRepository.Verify(x => x.GetByCodeAsync(It.IsAny<Guid>(), It.IsAny<string>()), Times.Never);
    }

    /// <summary>
    /// El código se busca con el mismo recorte + mayúsculas con las que se generó: se guarda en
    /// mayúsculas y la persona lo dicta, así que el frontend lo manda como venga. Sin normalizar,
    /// `ab12cd` no encontraría `AB12CD` y el cliente perdería su pedido.
    /// </summary>
    [Theory]
    [InlineData("  ab12cd  ", "AB12CD")]
    [InlineData("AB12CD", "AB12CD")]
    public async Task Handle_ShouldLookUpTheOrderByTheTrimmedUppercaseCode(string code, string expected)
    {
        PublishedStore();
        _orderRepository.Setup(x => x.GetPublicByCodeAsync(_storeId, expected)).ReturnsAsync(PublishedOrder());

        var result = await Handler().Handle(Query(code: code), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _orderRepository.Verify(x => x.GetPublicByCodeAsync(_storeId, expected), Times.Once);
    }

    #endregion

    #region Error Handling — el 404 NO revela cuál de los dos falló

    /// <summary>Un código que no existe en esa tienda es 404.</summary>
    [Fact]
    public async Task Handle_WhenTheCodeDoesNotExist_ShouldReturnNotFound()
    {
        PublishedStore();
        _orderRepository.Setup(x => x.GetPublicByCodeAsync(_storeId, It.IsAny<string>())).ReturnsAsync((Order?)null);

        Func<Task> act = () => Handler().Handle(Query(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    /// <summary>
    /// El código existe pero el teléfono NO es el del pedido → el mismo 404. Sin esto, el endpoint
    /// sería un oráculo de "qué códigos existen": con solo el código se sabría si hay un pedido.
    /// </summary>
    [Fact]
    public async Task Handle_WhenThePhoneDoesNotMatch_ShouldReturnNotFound()
    {
        PublishedStore();
        OrderInStore(PublishedOrder(phone: "+5351111111"));

        Func<Task> act = () => Handler().Handle(Query(phone: "+5350000000"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    /// <summary>
    /// El teléfono es un SEGUNDO factor, no opcional: sin `phone` no hay consulta. Que quede en
    /// blanco tampoco vale —es el mismo camino, no una búsqueda sin protección.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithoutAPhone_ShouldReturnNotFound(string phone)
    {
        PublishedStore();
        OrderInStore(PublishedOrder());

        Func<Task> act = () => Handler().Handle(Query(phone: phone), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    /// <summary>
    /// "Código inexistente" y "teléfono que no coincide" tienen que ser INDISTINGUIBLES: mismo
    /// código de estado y, sobre todo, el mismo mensaje. Distinguirlos confirmaría al anónimo qué
    /// códigos existen.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheCodeIsMissingAndThePhoneIsWrong_ShouldFailExactlyLikeAWrongCode()
    {
        PublishedStore();
        _orderRepository.Setup(x => x.GetPublicByCodeAsync(_storeId, It.IsAny<string>())).ReturnsAsync((Order?)null);

        var missing = await CaptureAsync(() => Handler().Handle(Query(), CancellationToken.None));
        var wrongPhone = await CaptureAsync(() => Handler().Handle(
            Query(code: "ZZ99ZZ", phone: "+5300000000"), CancellationToken.None));

        wrongPhone.StatusCode.Should().Be(missing.StatusCode);
        wrongPhone.Message.Should().Be(missing.Message);
    }

    /// <summary>
    /// Slug inexistente → 404 con el mensaje de "no hay catálogo en esa dirección", igual que el
    /// resto del módulo público. Un slug vacío o en blanco NO es una búsqueda.
    /// </summary>
    [Theory]
    [InlineData("no-existe")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithAnUnknownSlug_ShouldReturnNotFound(string slug)
    {
        Func<Task> act = () => Handler().Handle(Query(slug: slug), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _orderRepository.Verify(x => x.GetPublicByCodeAsync(It.IsAny<Guid>(), It.IsAny<string>()), Times.Never);
    }

    /// <summary>
    /// Tienda sin catálogo publicado: mismo 404 que un slug inexistente. Distinguir los dos
    /// confirmaría a un anónimo que ese nombre existe.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoCatalogSlug_ShouldReturnNotFound()
    {
        Store store = Store.Create("Sin catálogo", Guid.NewGuid(), true, _tenantId, null);
        _storeRepository.Setup(x => x.GetStoreByCatalogSlugAsync("sin-catalogo")).ReturnsAsync(store);

        Func<Task> act = () => Handler().Handle(Query(slug: "sin-catalogo"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    /// <summary>
    /// El código se busca dentro de la TIENDA resuelta por el slug, no globalmente: el mismo código
    /// puede existir en dos tiendas (`Code` es único por tienda) y cada una con su teléfono.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldScopeTheLookupToTheResolvedStore()
    {
        Store first = PublishedStore("tienda-ana");
        _orderRepository.Setup(x => x.GetPublicByCodeAsync(first.Id, It.IsAny<string>())).ReturnsAsync(PublishedOrder());

        await Handler().Handle(Query(slug: "tienda-ana"), CancellationToken.None);

        _orderRepository.Verify(x => x.GetPublicByCodeAsync(first.Id, _code), Times.Once);
    }

    #endregion

    #region Integration / Contract

    /// <summary>
    /// La respuesta pública del pedido está ACOTADA a lo que la persona necesita ver de su pedido.
    /// Este test falla si alguien añade un campo "por comodidad": cada campo nuevo en este DTO es
    /// un dato del pedido y de la tienda que un anónimo puede leer probando códigos.
    /// </summary>
    [Fact]
    public void PublicOrderStatusDto_ShouldCarryNoInternalField()
    {
        typeof(PublicOrderStatusDto).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(new[]
            {
                "Id", "StoreId", "TenantId", "CustomerName", "CustomerPhone",
                "DeliveryAddress", "Notes", "Description", "DriverId", "Driver",
                "Date", "CreatedBy", "ItemsCount", "Percent", "Tax", "Payments",
            });
    }

    /// <summary>La línea pública solo lleva nombre, cantidad y precio — nada de ids ni de moneda propia.</summary>
    [Fact]
    public void PublicOrderItemDto_ShouldCarryNoProductIdNorInternalCurrency()
    {
        typeof(PublicOrderItemDto).GetProperties()
            .Select(p => p.Name)
            .Should().BeEquivalentTo(["Name", "Quantity", "Price"]);
    }

    /// <summary>
    /// El DTO tiene la forma EXACTA del contrato con el storefront. Un campo más o menos rompe al
    /// cliente, así que el conjunto se fija aquí en vez de confiar en la revisión.
    /// </summary>
    [Fact]
    public void PublicOrderStatusDto_ShouldCarryTheAgreedContract()
    {
        typeof(PublicOrderStatusDto).GetProperties()
            .Select(p => p.Name)
            .Should().BeEquivalentTo(
                ["Code", "Status", "PaymentStatus", "DeliveryType", "Total", "Currency", "Items"]);
    }

    /// <summary>
    /// El handler NO depende de la sesión: es lo que hace posible que la consulta sea anónima de
    /// verdad, y lo que impide introducir aquí una dependencia que solo existiría en sesión.
    /// </summary>
    [Fact]
    public void GetPublicOrderStatusQueryHandler_ShouldNotDependOnTheRequestSession()
    {
        typeof(GetPublicOrderStatusQueryHandler).GetConstructors().Single()
            .GetParameters()
            .Select(p => p.ParameterType)
            .Should().NotContain(typeof(Application.Abstractions.HttpContext.IHttpContextService));
    }

    /// <summary>
    /// La query toma el slug de la RUTA, así que su constructor lo expone explícitamente en vez de
    /// esconderlo: si el controller se equivocara al llenarla, la compilación lo delata.
    /// </summary>
    [Fact]
    public void GetPublicOrderStatusQuery_ShouldCarrySlugCodeAndPhone()
    {
        typeof(GetPublicOrderStatusQuery).GetConstructors().Single()
            .GetParameters()
            .Select(p => p.Name)
            .Should().BeEquivalentTo(["StoreSlug", "Code", "Phone"]);
    }

    #endregion

    /// <summary>Ejecuta el handler y devuelve el `ApiException` que lanzó, o falla si no lanzó.</summary>
    private static async Task<(System.Net.HttpStatusCode StatusCode, string Message)> CaptureAsync(Func<Task> act)
    {
        var exception = await act.Should().ThrowAsync<ApiException>();
        return (exception.Which.StatusCode, exception.Which.Message);
    }
}