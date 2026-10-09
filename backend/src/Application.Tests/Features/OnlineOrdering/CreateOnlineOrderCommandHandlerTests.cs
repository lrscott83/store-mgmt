using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using Application.UnitOfWorks;
using System.Text.Json;
using Domain.Common.Enums;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering.CreateOnlineOrder;

/// <summary>
/// Crear un pedido ONLINE es el ÚNICO camino del backend que escribe en `Order` (D14: el POS
/// escribe en su almacén local). Desde F3 el comando es PÚBLICO: lo llama el storefront sin
/// sesión, por eso resuelve la tienda por SLUG y no por el contexto.
///
/// Lo que esta suite fija:
///
///   * la tienda se resuelve por slug y el tenant sale de ESE store (no de la sesión);
///   * un slug desconocido o sin catálogo publicado es 404 — el mismo que el catálogo público;
///   * la configuración se lee por la vía ANÓNIMA (`GetPublicByStoreIdAsync`), porque con la
///     lectura de sesión el anónimo vería siempre "pedidos cerrados";
///   * el total y la moneda se LEEN del catálogo, nunca se aceptan del cliente;
///   * la modalidad la decide la configuración de ESA tienda;
///   * a domicilio hace falta dirección, y en recogida la dirección NO se persiste;
///   * el total ES el subtotal: el pedido online no tiene costo de envío ni importe mínimo, así que
///     las columnas históricas de la configuración no llegan al cálculo;
///   * la respuesta lleva el SNAPSHOT persistido (subtotal + líneas), que es lo que el resumen de
///     WhatsApp del frontend muestra.
///
/// Y la mitad positiva: se persiste con `Code`, `OrderType = WhatsApp`, `New` y `Pending`, con el
/// snapshot de los items leído en servidor.
/// </summary>
public class CreateOnlineOrderCommandHandlerTests
{
    /// <summary>
    /// Opciones del binding REAL de `POST /api/v1/public/ordering/{slug}/orders`, que recibe
    /// `[FromBody] CreateOnlineOrderCommand`: `JsonSerializerDefaults.Web` es lo que usa
    /// ASP.NET Core, y su `PropertyNameCaseInsensitive` es lo que decide si un `"code"` minúsculo en
    /// el cuerpo llenaría un `Code` del contrato. Serializar/deserializar con las opciones de la
    /// librería NO reproduciría ese enlace, así que los tests de contrato los usan a propósito.
    /// </summary>
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly string _slug = "tienda-ana";
    private Guid _storeId;
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();

    public CreateOnlineOrderCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        // Producto publicados: precio 100, sin descuentos de catálogo.
        _productRepository
            .Setup(x => x.GetPublishedByIdsAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>()))
            .ReturnsAsync([]);
        _orderRepository
            .Setup(x => x.CodeExistsAsync(It.IsAny<Guid>(), It.IsAny<string>()))
            .ReturnsAsync(false);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
    }

    private CreateOnlineOrderCommandHandler Handler() => new(
        _unitOfWork.Object,
        _storeRepository.Object,
        _productRepository.Object,
        _orderRepository.Object,
        _settingsRepository.Object,
        _localizer.Object);

    /// <summary>
    /// Tienda con catálogo publicado en `<paramref name="slug"/>`: el caso normal del storefront.
    /// Fija `<c>_storeId</c> porque los mocks de los otros repositorios responden al id de la
    /// tienda RESUELTA, no a uno inventado en el test.
    /// </summary>
    private Store PublishedStore(string slug = "tienda-ana")
    {
        Store store = Store.Create("Tienda Ana", Guid.NewGuid(), true, _tenantId, null);
        store.CatalogSlug = slug;
        _storeRepository.Setup(x => x.GetStoreByCatalogSlugAsync(slug)).ReturnsAsync(store);
        _storeId = store.Id;
        return store;
    }

    /// <summary>
    /// Config por defecto: pedidos abiertos, recogida sí, domicilio no. Sin importes que
    /// configurar: el pedido online no tiene costo de envío ni importe mínimo (2026-10-08), así que
    /// la configuración ya no decide ningún número de dinero.
    /// </summary>
    private StoreCatalogSettings EnabledSettings(bool pickup = true, bool delivery = false)
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = pickup;
        settings.DeliveryEnabled = delivery;
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);
        return settings;
    }

    private readonly List<Product> _published = [];

    /// <summary>
    /// Publica un producto del catálogo y devuelve su id. El mock responde a `GetPublishedByIdsAsync`
    /// FILTRANDO por los ids pedidos: así una línea que el catálogo ya no publica sale como
    /// "no encontrada", igual que en producción (donde la consulta trae solo los publicados).
    /// </summary>
    private Guid Publish(string name, decimal price, Currency? currency = null)
    {
        var category = ProductCategory.Create(_storeId, "General", 1, _tenantId, "general");
        Product product = Product.Create(name, _categoryId, price, 1, true, true, "B-1", _tenantId);
        product.Category = category;
        product.Currency = currency ?? Currency.CUP;
        _published.Add(product);

        _productRepository
            .Setup(x => x.GetPublishedByIdsAsync(_storeId, It.IsAny<IReadOnlyCollection<Guid>>()))
            .Returns((Guid _, IReadOnlyCollection<Guid> ids) =>
                Task.FromResult<IList<Product>>([.. _published.Where(p => ids.Contains(p.Id))]));

        return product.Id;
    }

    private static CreateOnlineOrderCommand Command(
        string slug = "tienda-ana",
        OrderDeliveryType deliveryType = OrderDeliveryType.Pickup,
        Guid? productId = null,
        int quantity = 1,
        string? deliveryAddress = null,
        string customerName = "Ana",
        string customerPhone = "+5350000000") => new()
        {
            StoreSlug = slug,
            DeliveryType = (int)deliveryType,
            CustomerName = customerName,
            CustomerPhone = customerPhone,
            DeliveryAddress = deliveryAddress,
            Items = [new CreateOnlineOrderLineRequest { ProductId = productId ?? Guid.NewGuid(), Quantity = quantity }],
        };

    #region Happy Path

    [Fact]
    public async Task Handle_WithAnEnabledStore_ShouldPersistTheOrderAndReturnItsCode()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(productId: productId, quantity: 2);

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Code.Should().NotBeNullOrWhiteSpace();
        result.Data.Id.Should().NotBeEmpty();
        result.Data.Total.Should().Be(200m);
        result.Data.Currency.Should().Be(Currency.CUP);

        _orderRepository.Verify(
            x => x.AddAsync(It.Is<Order>(o =>
                o.OrderType == OrderType.WhatsApp
                && o.Status == OrderStatus.New
                && o.PaymentStatus == OrderPaymentStatus.Pending
                && o.StoreId == _storeId
                && o.TenantId == _tenantId)),
            Times.Once);
    }

    /// <summary>
    /// El snapshot de cada item sale del servidor: nombre y precio LEÍDOS del catálogo. El
    /// `OrderItem` guarda el precio histórico, así que un cambio de precio posterior no altera el
    /// pedido ya hecho.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldSnapshotTheLinesReadFromTheCatalog()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(productId: productId, quantity: 2);

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o => persisted = o)
            .ReturnsAsync((Order o) => o);

        await Handler().Handle(command, CancellationToken.None);

        persisted.Should().NotBeNull();
        persisted!.OrderItems.Should().ContainSingle();
        persisted.OrderItems.Single().Name.Should().Be("Arroz");
        persisted.OrderItems.Single().Price.Should().Be(100m);
        persisted.OrderItems.Single().Quantity.Should().Be(2);
        persisted.OrderItems.Single().Currency.Should().Be(Currency.CUP);
    }

    /// <summary>
    /// F2-R4 — el cliente NO manda total, ni precio de línea, ni moneda: se recalcula desde el
    /// catálogo (2 x 100 = 200). Y no se afirma por reflexión ("la clase no tiene `Total`"), sino
    /// con el cuerpo REAL que manda el cliente: seDeserializean dos cuerpos gemelos —uno con
    /// `total`/`subtotal`/`amount`/`currency`/`price`/`unitPrice` colados en el pedido y en la
    /// línea, otro sin ellos— y se exige que el binding produzca el MISMO comando. Después se
    /// comprueba que lo persistido es el precio del catálogo. Un precio manipulado no cambia nada
    /// porque no hay dónde escribirlo.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldRecalculateTheTotalServerSide_IgnoringAnyClientTotal()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m, currency: Currency.USD);

        // "1" es lo que un cliente intentaría pagar: una unidad y la moneda que le viene bien.
        string tamperedBody = $$"""
            {
              "storeSlug": "{{_slug}}",
              "deliveryType": 0,
              "customerName": "Ana",
              "customerPhone": "+5350000000",
              "total": 1, "subtotal": 1, "amount": 1, "currency": "USD", "price": 1, "unitPrice": 1,
              "items": [
                { "productId": "{{productId}}", "quantity": 2,
                  "price": 1, "unitPrice": 1, "total": 1, "currency": "USD" }
              ]
            }
            """;
        string cleanBody = $$"""
            {
              "storeSlug": "{{_slug}}",
              "deliveryType": 0,
              "customerName": "Ana",
              "customerPhone": "+5350000000",
              "items": [ { "productId": "{{productId}}", "quantity": 2 } ]
            }
            """;

        CreateOnlineOrderCommand bound =
            JsonSerializer.Deserialize<CreateOnlineOrderCommand>(tamperedBody, WebJson)!;
        CreateOnlineOrderCommand clean =
            JsonSerializer.Deserialize<CreateOnlineOrderCommand>(cleanBody, WebJson)!;

        // (1) Ningún precio del cuerpo sobrevive al binding: el comando es el del cuerpo limpio.
        JsonSerializer.Serialize(bound).Should().Be(JsonSerializer.Serialize(clean),
            "el cuerpo no tiene dónde aterrizar un precio, un total ni una moneda");

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o => persisted = o)
            .ReturnsAsync((Order o) => o);

        var result = await Handler().Handle(bound, CancellationToken.None);

        // (2) Y lo que se persiste es lo que dice el CATÁLOGO: 2 x 100, en la moneda del producto.
        result.Succeeded.Should().BeTrue();
        result.Data!.Total.Should().Be(200m);
        result.Data.Subtotal.Should().Be(200m);
        result.Data.Currency.Should().Be(Currency.USD);
        persisted!.Total.Should().Be(200m);
        persisted.Currency.Should().Be(Currency.USD);
        persisted.OrderItems.Single().Price.Should().Be(100m);
    }

    /// <summary>
    /// A domicilio el total sigue siendo la suma de las líneas: el envío es una MODALIDAD, no un
    /// costo. Lo que se entrega a la tienda es el importe de los productos.
    /// </summary>
    [Fact]
    public async Task Handle_WithDelivery_ShouldNotAddAnyFee_TotalEqualsSubtotal()
    {
        PublishedStore();
        EnabledSettings(pickup: false, delivery: true);
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(
            deliveryType: OrderDeliveryType.Delivery, productId: productId, quantity: 2, deliveryAddress: "Calle 23 #45");

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Subtotal.Should().Be(200m);
        result.Data.Total.Should().Be(result.Data.Subtotal, "a domicilio no se suma ningún costo");
    }

    /// <summary>
    /// F4-R3 (option B): la respuesta del alta lleva el SNAPSHOT PERSISTIDO —subtotal y líneas—,
    /// no lo que el navegador tenía en el carrito. Es lo que el frontend usa para armar el resumen
    /// de WhatsApp, así que si estas líneas no son las guardadas, el mensaje a la tienda describe un
    /// pedido que no existe.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnThePersistedLineSnapshot()
    {
        PublishedStore();
        EnabledSettings();
        Guid arroz = Publish("Arroz", 100m);
        Guid azucar = Publish("Azúcar", 50m);
        var command = new CreateOnlineOrderCommand
        {
            StoreSlug = _slug,
            DeliveryType = (int)OrderDeliveryType.Pickup,
            CustomerName = "Ana",
            CustomerPhone = "+5350000000",
            Items =
            [
                new CreateOnlineOrderLineRequest { ProductId = azucar, Quantity = 1 },
                new CreateOnlineOrderLineRequest { ProductId = arroz, Quantity = 2 },
            ],
        };

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o =>
            {
                // Simula el viaje de ida y vuelta. Lo que se devuelve tiene que leerse del pedido
                // que se PERSISTIÓ, no de la lista en memoria que el handler resolvió del
                // catálogo: si alguien construyera `Lines` desde esa lista, este test lo suelta.
                foreach (OrderItem item in o.OrderItems)
                    item.Name = $"{item.Name} persistido";
                persisted = o;
            })
            .ReturnsAsync((Order o) => o);

        var result = await Handler().Handle(command, CancellationToken.None);

        // Lo que se devuelve tiene que ser, línea a línea, lo que quedó en `OrderItem`.
        result.Data!.Lines.Select(line => (line.Name, line.Quantity, line.Price))
            .Should().Equal(persisted!.OrderItems
                .OrderBy(item => item.OrderIndex)
                .Select(item => (item.Name, item.Quantity, item.Price)));
        result.Data.Lines.Should().BeEquivalentTo(new[]
        {
            new OnlineOrderCreatedLineDto("Azúcar persistido", 1, 50m),
            new OnlineOrderCreatedLineDto("Arroz persistido", 2, 100m),
        });

        // El subtotal es el de esas líneas, y el total ya no lleva nada encima.
        decimal snapshotSum = result.Data.Lines.Sum(line => line.Quantity * line.Price);
        snapshotSum.Should().Be(250m);
        result.Data.Subtotal.Should().Be(snapshotSum);
        result.Data.Total.Should().Be(result.Data.Subtotal);
    }

    /// <summary>
    /// El total y la moneda del catálogo: `Product.Currency` decide la moneda del pedido, y con
    /// A3 eliminada no existe moneda configurable en la tienda (ni en `Order`, ni en el payload).
    /// </summary>
    [Fact]
    public async Task Handle_ShouldTakeTheCurrencyFromTheCatalogProduct()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m, currency: Currency.USD);
        CreateOnlineOrderCommand command = Command(productId: productId);

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Data!.Currency.Should().Be(Currency.USD);
    }

    [Fact]
    public async Task Handle_ShouldCarryTheCustomerAndDeliveryDataOntoTheOrder()
    {
        PublishedStore();
        EnabledSettings(pickup: false, delivery: true);
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(
            deliveryType: OrderDeliveryType.Delivery, productId: productId, deliveryAddress: "Calle 23 #45");

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o => persisted = o)
            .ReturnsAsync((Order o) => o);

        await Handler().Handle(command, CancellationToken.None);

        persisted!.CustomerName.Should().Be("Ana");
        persisted.CustomerPhone.Should().Be("+5350000000");
        persisted.DeliveryAddress.Should().Be("Calle 23 #45");
        persisted.DeliveryType.Should().Be(OrderDeliveryType.Delivery);
    }

    #endregion

    #region Resolución por slug (F3: el pedido es ANÓNIMO)

    /// <summary>
    /// El slug es lo único que trae la petición anónima, así que es lo que resuelve la tienda: y
    /// se normaliza (recortado + minúsculas) igual que el catálogo público.
    /// </summary>
    [Theory]
    [InlineData("  TIENDA-ANA  ")]
    [InlineData("tienda-ana")]
    public async Task Handle_ShouldResolveTheStoreByTheTrimmedLowercaseSlug(string slug)
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(slug: slug, productId: productId);

        await Handler().Handle(command, CancellationToken.None);

        _storeRepository.Verify(x => x.GetStoreByCatalogSlugAsync("tienda-ana"), Times.Once);
    }

    /// <summary>
    /// El tenant sale de la TIENDA RESUELTA, no de la sesión: el anónimo no tiene ninguno en el
    /// contexto, así que pedirlo ahí dejaría el pedido sin tenant y sin filtro que lo confine.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldPersistTheTenantOfTheResolvedStore()
    {
        Store store = PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o => persisted = o)
            .ReturnsAsync((Order o) => o);

        await Handler().Handle(Command(productId: productId), CancellationToken.None);

        persisted!.TenantId.Should().Be(store.TenantId);
    }

    /// <summary>
    /// ESTE es el guardián del filtro por tenant. La configuración tiene filtro global
    /// `IsSuperAdmin || TenantId == TenantId`; el anónimo no tiene tenant en el contexto, así que
    /// la lectura DE SESIÓN no puede devolver fila y el cliente vería "pedidos cerrados" para
    /// siempre — sin error y sin aviso. Si alguien "simplifica" esto y vuelve a
    /// `GetByStoreIdAsync`, este test cae.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNeverUseTheSessionScopedSettingsRead()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);

        await Handler().Handle(Command(productId: productId), CancellationToken.None);

        _settingsRepository.Verify(x => x.GetPublicByStoreIdAsync(_storeId), Times.Once);
        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    #endregion

    #region Pickup ignora la dirección

    /// <summary>
    /// En RECOGIDA la dirección no se persiste: la persona viene a la tienda, y guardar la que
    /// mandara el formulario dejaría un dato que además puede ser de otra persona (el carrito es
    /// del cliente anónimo, no del POS). No es un rechazo — el pedido se crea igual — sino que el
    /// campo queda vacío.
    /// </summary>
    [Fact]
    public async Task Handle_WithPickupAndAnAddress_ShouldNotPersistTheAddress()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(
            deliveryType: OrderDeliveryType.Pickup, productId: productId, deliveryAddress: "Calle 23 #45");

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o => persisted = o)
            .ReturnsAsync((Order o) => o);

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        persisted!.DeliveryAddress.Should().BeNull();
    }

    /// <summary>A domicilio la dirección sí se persiste, tal cual vino.</summary>
    [Fact]
    public async Task Handle_WithDelivery_ShouldPersistTheAddress()
    {
        PublishedStore();
        EnabledSettings(pickup: false, delivery: true);
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(
            deliveryType: OrderDeliveryType.Delivery, productId: productId, deliveryAddress: "Calle 23 #45");

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o => persisted = o)
            .ReturnsAsync((Order o) => o);

        await Handler().Handle(command, CancellationToken.None);

        persisted!.DeliveryAddress.Should().Be("Calle 23 #45");
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Slug que no existe → 404 con el mensaje de "no hay catálogo en esa dirección", igual que el
    /// catálogo público. Un slug vacío o en blanco NO es una búsqueda: se responde igual, sin tocar
    /// la base.
    /// </summary>
    [Theory]
    [InlineData("no-existe")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithAnUnknownSlug_ShouldReturnNotFound(string slug)
    {
        Func<Task> act = () => Handler().Handle(Command(slug: slug), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _settingsRepository.Verify(x => x.GetPublicByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
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

        Func<Task> act = () => Handler().Handle(Command(slug: "sin-catalogo"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>
    /// El interruptor maestro manda: sin `Enabled` la tienda NO acepta pedidos, aunque el catálogo
    /// esté publicado. Publicar el catálogo no publica los pedidos.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoSettings_ShouldReject()
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenTheStoreDisabledOrders_ShouldReject()
    {
        PublishedStore();
        StoreCatalogSettings settings = EnabledSettings();
        settings.Enabled = false;

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>La modalidad la elige la TIENDA, no el cliente: recogida cerrada → 400.</summary>
    [Fact]
    public async Task Handle_WithPickupWhenPickupIsDisabled_ShouldReject()
    {
        PublishedStore();
        EnabledSettings(pickup: false);

        Func<Task> act = () => Handler().Handle(
            Command(deliveryType: OrderDeliveryType.Pickup), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>Domicilio cerrado → 400, aunque la tienda tenga recogida abierta.</summary>
    [Fact]
    public async Task Handle_WithDeliveryWhenDeliveryIsDisabled_ShouldReject()
    {
        PublishedStore();
        EnabledSettings(pickup: true, delivery: false);

        Func<Task> act = () => Handler().Handle(
            Command(deliveryType: OrderDeliveryType.Delivery, deliveryAddress: "Calle 23"), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>A domicilio sin dirección no hay a quién entregar: 400.</summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithDeliveryAndNoAddress_ShouldReject(string? address)
    {
        PublishedStore();
        EnabledSettings(pickup: false, delivery: true);

        Func<Task> act = () => Handler().Handle(
            Command(deliveryType: OrderDeliveryType.Delivery, deliveryAddress: address), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>
    /// Un producto que el catálogo ya no publica (desactivado, sin stock, categoría sin slug) no
    /// puede entrar en un pedido: aceptarlo significaría guardar un precio que ya no existe.
    /// </summary>
    [Fact]
    public async Task Handle_WhenAProductIsNotPublished_ShouldReject()
    {
        PublishedStore();
        EnabledSettings();
        var productId = Guid.NewGuid();
        // El catálogo NO devuelve nada: `GetPublishedByIdsAsync` filtra por publicación, así que
        // un id no publicado es indistinguible de uno inexistente.

        Func<Task> act = () => Handler().Handle(Command(productId: productId), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>Un carrito vacío no es un pedido: 400.</summary>
    [Fact]
    public async Task Handle_WithNoLines_ShouldReject()
    {
        PublishedStore();
        EnabledSettings();
        var command = new CreateOnlineOrderCommand
        {
            StoreSlug = _slug,
            DeliveryType = (int)OrderDeliveryType.Pickup,
            CustomerName = "Ana",
            CustomerPhone = "+5350000000",
            Items = [],
        };

        Func<Task> act = () => Handler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    #endregion

    #region F2-R1: las dos ramas que la revisión dejó sin test

    /// <summary>
    /// F2-R1(a) — `EnsureSingleCurrency`: `Order.Currency` es UNA moneda para todo el pedido, y con
    /// A3 eliminada la tienda no puede fijar otra. Un carrito con productos de dos monedas NO se
    /// guarda: se rechaza entero, en vez de elegir una y perder el importe de la otra línea.
    ///
    /// El caso que hace que valga la pena es el negativo de al lado: dos productos de la MISMA moneda
    /// sí entran. Sin él, un `Distinct().Count() > 1` distraído pasaría los dos tests.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheCartMixesTwoCurrencies_ShouldRejectTheWholeOrder()
    {
        PublishedStore();
        EnabledSettings();
        Guid arroz = Publish("Arroz", 100m);
        Guid queso = Publish("Queso", 300m, currency: Currency.USD);

        var command = new CreateOnlineOrderCommand
        {
            StoreSlug = _slug,
            DeliveryType = (int)OrderDeliveryType.Pickup,
            CustomerName = "Ana",
            CustomerPhone = "+5350000000",
            Items =
            [
                new CreateOnlineOrderLineRequest { ProductId = arroz, Quantity = 1 },
                new CreateOnlineOrderLineRequest { ProductId = queso, Quantity = 1 },
            ],
        };

        Func<Task> act = () => Handler().Handle(command, CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        exception.Which.Message.Should().Contain("OnlineOrderMixedCurrencies");

        // Ni una sola escritura: el rechazo es ANTERIOR al alta, no un pedido guardado a medias.
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// Control positivo del anterior: varias líneas de la MISMA moneda no es un carrito mixto. El
    /// handler resuelve las líneas del catálogo y compara sus monedas entre sí.
    /// </summary>
    [Fact]
    public async Task Handle_WithTwoProductsOfTheSameCurrency_ShouldNotTreatItAsMixedCurrency()
    {
        PublishedStore();
        EnabledSettings();
        Guid arroz = Publish("Arroz", 100m);
        Guid frijoles = Publish("Frijoles", 60m);
        var command = new CreateOnlineOrderCommand
        {
            StoreSlug = _slug,
            DeliveryType = (int)OrderDeliveryType.Pickup,
            CustomerName = "Ana",
            CustomerPhone = "+5350000000",
            Items =
            [
                new CreateOnlineOrderLineRequest { ProductId = arroz, Quantity = 1 },
                new CreateOnlineOrderLineRequest { ProductId = frijoles, Quantity = 2 },
            ],
        };

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Currency.Should().Be(Currency.CUP);
        result.Data.Lines.Should().HaveCount(2);
    }

    /// <summary>
    /// F2-R1(b) — `ResolveDeliveryType`: el valor llega como `int` desde el JSON del cliente, así
    /// que puede ser CUALQUIER entero. Un valor fuera de <c>OrderDeliveryType</c> se rechaza con
    /// 400 ANTES de mirar el carrito y antes de tocar la base — un `2` no es "recogida ni envío, lo
    /// veo luego": no es una modalidad.
    ///
    /// El validador deja pasar estos valores a propósito (`Validate_ShouldNotJudgeTheDeliveryType_ThatIsTheHandlersJob`:
    /// su regla es "es un entero"); el cierre de la puerta está aquí, que es donde vive el resto de
    /// las reglas de la tienda.
    /// </summary>
    [Theory]
    [InlineData(-1)]
    [InlineData(2)]
    [InlineData(999)]
    public async Task Handle_WithADeliveryTypeOutsideTheEnum_ShouldRejectBeforeReadingTheCart(int deliveryType)
    {
        PublishedStore();
        EnabledSettings(pickup: true, delivery: true);
        Guid productId = Publish("Arroz", 100m);
        var command = Command(deliveryType: OrderDeliveryType.Pickup, productId: productId);
        command.DeliveryType = deliveryType;

        Func<Task> act = () => Handler().Handle(command, CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        exception.Which.Message.Should().Contain("OnlineOrderDeliveryTypeInvalid");

        // La modalidad se resuelve ANTES que las líneas: ni una consulta al catálogo, ni un alta.
        _productRepository.Verify(
            x => x.GetPublishedByIdsAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>()),
            Times.Never);
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    #endregion

    #region Integration / Dependencies

    /// <summary>
    /// El `Code` se genera contra una tienda concreta y se comprueba que no esté ocupado. Este test
    /// hace que el PRIMER candidato esté ocupado: el handler tiene que reintentar y devolver el
    /// segundo, no guardar el repetido (que rompería el índice único `(StoreId, Code)`).
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheFirstCodeIsTaken_ShouldRetryWithADifferentOne()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);

        var usedCodes = new List<string>();
        _orderRepository
            .Setup(x => x.CodeExistsAsync(_storeId, It.IsAny<string>()))
            .Returns((Guid _, string code) =>
            {
                usedCodes.Add(code);
                return Task.FromResult(usedCodes.Count == 1);
            });

        var result = await Handler().Handle(Command(productId: productId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        usedCodes.Should().HaveCountGreaterThanOrEqualTo(2, "el primer código estaba ocupado");
        usedCodes.Should().OnlyHaveUniqueItems();
        result.Data!.Code.Should().BeOneOf(usedCodes);
    }

    /// <summary>
    /// F2-R4 — el código es un identificador, no un dato: lo genera el servidor y NO viene en el
    /// payload. Antes esto se afirmaba por reflexión ("la clase no tiene propiedad `Code`"), que es
    /// una forma frágil: fija la FORMA del tipo, no lo que el cliente puede hacer con él, y solo
    /// miraba ese nombre — un `OrderCode` colado en el contrato pasaba el test.
    ///
    /// Ahora se afirma por COMPORTAMIENTO sobre el contrato que de verdad llega al handler.
    /// `POST /api/v1/public/ordering/{slug}/orders` recibe `[FromBody] CreateOnlineOrderCommand`, así
    /// que lo que decide si un anónimo puede fijar el código es lo que el binding hace con un
    /// `"code"` en el JSON: se serializa el comando, se le cuela un `code` forjado y se comprueba
    /// que el objeto que sale del binding es IDÉNTICO al que saldría sin él (el campo no existe
    /// donde aterrizar) y que el handler persiste y devuelve su propio código.
    /// </summary>
    [Fact]
    public async Task Handle_WithAForgedCodeInTheRawPayload_ShouldPersistItsOwnGeneratedCode()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);

        CreateOnlineOrderCommand clean = Command(productId: productId);
        string cleanJson = JsonSerializer.Serialize(clean);

        // El mismo cuerpo + un `code` que el cliente querría imponerse. Se repite en minúsculas y en
        // PascalCase porque el binding de ASP.NET Core es case-insensitive: si el contrato tuviera
        // `Code`, cualquiera de las dos formas lo llenaría.
        string tamperedJson = cleanJson[..^1]
            + @",""code"":""FORJADO"",""Code"":""FORJADO""}";

        CreateOnlineOrderCommand bound =
            JsonSerializer.Deserialize<CreateOnlineOrderCommand>(tamperedJson, WebJson)!;

        // (1) El binding descarta el `code`: el comando es el mismo de antes, campo por campo. Si
        // alguien añadiera `Code` al contrato, aquí aparecería el valor forjado y esto cae.
        JsonSerializer.Serialize(bound).Should().Be(cleanJson,
            "un `code` en el cuerpo no tiene dónde aterrizar en el comando");

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o => persisted = o)
            .ReturnsAsync((Order o) => o);

        var result = await Handler().Handle(bound, CancellationToken.None);

        // (2) Y el código que sale es el que el servidor generó y guardó, no el del cuerpo.
        result.Succeeded.Should().BeTrue();
        result.Data!.Code.Should().NotBe("FORJADO");
        result.Data.Code.Should().Be(persisted!.Code);
        result.Data.Code.Should().HaveLength(6, "el alfabeto del código son 6 caracteres");
    }

    /// <summary>
    /// Las notas van a `Order.Notes`, no a `Order.Description`: `Description` es el campo de la
    /// venta del POS y duplicar la nota en las dos columnas haría que dos vistas mostraran el mismo
    /// texto por columnas distintas.
    /// </summary>
    [Fact]
    public async Task Handle_WithNotes_ShouldWriteThemToNotesOnly()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(productId: productId);
        command.Notes = "Tocar el timbre";

        Order? persisted = null;
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(o => persisted = o)
            .ReturnsAsync((Order o) => o);

        await Handler().Handle(command, CancellationToken.None);

        persisted!.Notes.Should().Be("Tocar el timbre");
        persisted.Description.Should().BeEmpty();
    }

    /// <summary>
    /// Los productos del carrito se piden en UNA consulta por tienda, no uno por línea: el
    /// repositorio expone el método bulk precisamente para esto.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReadTheCartProductsInASingleBulkQuery()
    {
        PublishedStore();
        EnabledSettings();
        Guid first = Publish("Arroz", 100m);
        Guid second = Publish("Azúcar", 50m);
        var command = new CreateOnlineOrderCommand
        {
            StoreSlug = _slug,
            DeliveryType = (int)OrderDeliveryType.Pickup,
            CustomerName = "Ana",
            CustomerPhone = "+5350000000",
            Items =
            [
                new CreateOnlineOrderLineRequest { ProductId = first, Quantity = 2 },
                new CreateOnlineOrderLineRequest { ProductId = second, Quantity = 1 },
            ],
        };

        await Handler().Handle(command, CancellationToken.None);

        _productRepository.Verify(
            x => x.GetPublishedByIdsAsync(_storeId, It.IsAny<IReadOnlyCollection<Guid>>()),
            Times.Once);
    }

    /// <summary>El handler NO toca el POS ni sus repositorios: la escritura es un alta nueva.</summary>
    [Fact]
    public async Task Handle_ShouldNotUpdateAnExistingOrder()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);

        await Handler().Handle(Command(productId: productId), CancellationToken.None);

        _orderRepository.Verify(x => x.UpdateAsync(It.IsAny<Order>()), Times.Never);
        _orderRepository.Verify(x => x.GetByIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>
    /// El handler NO depende de la sesión en absoluto —ni `IHttpContextService`, ni tienda del
    /// contexto—. Es lo que hace posible que el alta sea anónima de verdad, y también lo que
    /// impide que alguien introduzca aquí una dependencia que solo existiría en sesión.
    /// </summary>
    [Fact]
    public void CreateOnlineOrderCommandHandler_ShouldNotDependOnTheRequestSession()
    {
        typeof(CreateOnlineOrderCommandHandler).GetConstructors().Single()
            .GetParameters()
            .Select(p => p.ParameterType)
            .Should().NotContain(typeof(Application.Abstractions.HttpContext.IHttpContextService));
    }

    #endregion

    #region F4: el número de WhatsApp viaja SOLO en la respuesta del alta

    /// <summary>
    /// T2: el número de WhatsApp viaja en la RESPUESTA DEL ALTA, no en el config público. El
    /// config lo lee cualquiera que abra el catálogo —publicarlo ahí haría el número rastreable
    /// con una simple petición—; la respuesta solo la recibe quien acaba de dejar sus datos de
    /// contacto para ese pedido, y es justo la que necesita el resumen `wa.me`.
    ///
    /// Sale TAL CUAL lo guardó la tienda, con sus espacios y sus signos: normalizarlo ("solo
    /// dígitos") es tarea del cliente que arma la URL, no de una respuesta que además sirve para
    /// pintar el pedido recién creado.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnTheWhatsappNumberOfTheStore()
    {
        PublishedStore();
        StoreCatalogSettings settings = EnabledSettings();
        settings.WhatsappNumber = "+53 5-000 0000";
        Guid productId = Publish("Arroz", 100m);

        var result = await Handler().Handle(Command(productId: productId), CancellationToken.None);

        result.Data!.WhatsappNumber.Should().Be("+53 5-000 0000");
    }

    /// <summary>
    /// Tienda SIN número NO es un fallo del alta: el pedido se guarda igual (la tienda lo ve en
    /// su panel aunque el mensaje no llegue) y la respuesta lo dice con un `null`. Ese `null` es
    /// lo que el cliente usa para BLOQUEAR el envío, en vez de abrir un chat contra un número
    /// vacío.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoWhatsappNumber_ShouldReturnNullAndKeepTheOrder()
    {
        PublishedStore();
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);

        var result = await Handler().Handle(Command(productId: productId), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.WhatsappNumber.Should().BeNull();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Once);
    }

    /// <summary>
    /// F2-R4 (mismo patrón que el `code`) — el número es de la TIENDA, nunca del cliente. Este test
    /// también era por reflexión y su comentario decía otra cosa ("por comportamiento"), así que
    /// también se pasa al cuerpo real: un `whatsappNumber` forjado en el JSON no llega al comando,
    /// y la respuesta sale con el número que tiene la tienda.
    /// </summary>
    [Fact]
    public async Task Handle_WithAForgedWhatsappNumberInTheRawPayload_ShouldReturnTheStoresOne()
    {
        PublishedStore();
        StoreCatalogSettings settings = EnabledSettings();
        settings.WhatsappNumber = "+53 5-111 2222";
        Guid productId = Publish("Arroz", 100m);

        CreateOnlineOrderCommand clean = Command(productId: productId);
        string tamperedJson = JsonSerializer.Serialize(clean)[..^1]
            + @",""whatsappNumber"":""+1-555-0000"",""WhatsappNumber"":""+1-555-0000""}";

        CreateOnlineOrderCommand bound =
            JsonSerializer.Deserialize<CreateOnlineOrderCommand>(tamperedJson, WebJson)!;

        JsonSerializer.Serialize(bound).Should().Be(JsonSerializer.Serialize(clean),
            "un número de WhatsApp en el cuerpo no tiene dónde aterrizar en el comando");

        var result = await Handler().Handle(bound, CancellationToken.None);

        result.Data!.WhatsappNumber.Should().Be("+53 5-111 2222");
        result.Data.WhatsappNumber.Should().NotBe("+1-555-0000");
    }

    #endregion
}