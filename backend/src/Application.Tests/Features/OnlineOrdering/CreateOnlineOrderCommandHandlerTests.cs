using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering.CreateOnlineOrder;

/// <summary>
/// Crear un pedido ONLINE es el ÚNICO camino del backend que escribe en `Order` (D14: el POS
/// escribe en su almacén local). Por eso este test suite es el que fija la mitad defensiva del
/// comando —lo que el cliente NO puede decidir—:
///
///   * el total y la moneda se LEEN del catálogo, nunca se aceptan del cliente;
///   * la tienda tiene que haber habilitado los pedidos;
///   * la modalidad tiene que estar permitida por la configuración de ESA tienda;
///   * a domicilio hace falta dirección;
///   * el importe mínimo se compara contra el total ya recalculado + costo de envío.
///
/// Y la mitad positiva: se persiste con `Code`, `OrderType = WhatsApp`, `New` y `Pending`, con el
/// snapshot de los items leído en servidor.
/// </summary>
public class CreateOnlineOrderCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();

    public CreateOnlineOrderCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());

        // Producto publicados: precio 100, sin descuentos de catálogo.
        _productRepository
            .Setup(x => x.GetPublishedByIdsAsync(_storeId, It.IsAny<IReadOnlyCollection<Guid>>()))
            .ReturnsAsync([]);
        _orderRepository
            .Setup(x => x.CodeExistsAsync(It.IsAny<Guid>(), It.IsAny<string>()))
            .ReturnsAsync(false);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
    }

    private CreateOnlineOrderCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _productRepository.Object,
        _orderRepository.Object,
        _settingsRepository.Object,
        _localizer.Object);

    /// <summary>Config por defecto: pedidos abiertos, recogida sí, domicilio no, sin mínimos.</summary>
    private StoreCatalogSettings EnabledSettings(
        bool pickup = true,
        bool delivery = false,
        decimal deliveryFee = 0m,
        decimal minimumOrderAmount = 0m)
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = pickup;
        settings.DeliveryEnabled = delivery;
        settings.DeliveryFee = deliveryFee;
        settings.MinimumOrderAmount = minimumOrderAmount;
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);
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

    /// <summary>Producto ya publicado, para las aserciones sobre nombre/precio.</summary>
    private Product PublishedProduct => _published[^1];

    private static CreateOnlineOrderCommand Command(
        OrderDeliveryType deliveryType = OrderDeliveryType.Pickup,
        Guid? productId = null,
        int quantity = 1,
        string? deliveryAddress = null,
        string customerName = "Ana",
        string customerPhone = "+5350000000") => new()
        {
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

    /// <summary>El cliente NO manda total: se recalcula desde el catálogo (2 x 100 = 200).</summary>
    [Fact]
    public async Task Handle_ShouldRecalculateTheTotalServerSide_IgnoringAnyClientTotal()
    {
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(productId: productId, quantity: 2);
        // Aunque el payload trajera un total manipulado, el comando no lo acepta: no existe campo
        // para él. Este test fija esa ausencia por comportamiento, no por reflexión.
        command.Items.Should().ContainSingle();

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Data!.Total.Should().Be(200m);
    }

    /// <summary>A domicilio se suma el costo de envío de la configuración de la tienda.</summary>
    [Fact]
    public async Task Handle_WithDelivery_ShouldAddTheConfiguredDeliveryFee()
    {
        EnabledSettings(pickup: false, delivery: true, deliveryFee: 50m);
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(
            OrderDeliveryType.Delivery, productId, 2, deliveryAddress: "Calle 23 #45");

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Data!.Total.Should().Be(250m, "200 de productos + 50 de envío");
    }

    /// <summary>
    /// El total y la moneda del catálogo: `Product.Currency` decide la moneda del pedido, y con
    /// A3 eliminada no existe moneda configurable en la tienda (ni en `Order`, ni en el payload).
    /// </summary>
    [Fact]
    public async Task Handle_ShouldTakeTheCurrencyFromTheCatalogProduct()
    {
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m, currency: Currency.USD);
        CreateOnlineOrderCommand command = Command(productId: productId);

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Data!.Currency.Should().Be(Currency.USD);
    }

    /// <summary>El mínimo se compara contra el total YA recalculado, no contra lo que dice el cliente.</summary>
    [Fact]
    public async Task Handle_WhenTheRecalculatedTotalReachesTheMinimum_ShouldCreateTheOrder()
    {
        EnabledSettings(minimumOrderAmount: 200m);
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(productId: productId, quantity: 2);

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Total.Should().Be(200m);
    }

    [Fact]
    public async Task Handle_ShouldCarryTheCustomerAndDeliveryDataOntoTheOrder()
    {
        EnabledSettings(pickup: false, delivery: true);
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(
            OrderDeliveryType.Delivery, productId, deliveryAddress: "Calle 23 #45");

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

    #region Error Handling

    /// <summary>
    /// El interruptor maestro manda: sin `Enabled` la tienda NO acepta pedidos, aunque el catálogo
    /// esté publicado. Publicar el catálogo no publica los pedidos.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoSettings_ShouldReject()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenTheStoreDisabledOrders_ShouldReject()
    {
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
        EnabledSettings(pickup: false);

        Func<Task> act = () => Handler().Handle(
            Command(OrderDeliveryType.Pickup), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>Domicilio cerrado → 400, aunque la tienda tenga recogida abierta.</summary>
    [Fact]
    public async Task Handle_WithDeliveryWhenDeliveryIsDisabled_ShouldReject()
    {
        EnabledSettings(pickup: true, delivery: false);

        Func<Task> act = () => Handler().Handle(
            Command(OrderDeliveryType.Delivery, deliveryAddress: "Calle 23"), CancellationToken.None);

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
        EnabledSettings(pickup: false, delivery: true);

        Func<Task> act = () => Handler().Handle(
            Command(OrderDeliveryType.Delivery, deliveryAddress: address), CancellationToken.None);

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
        EnabledSettings();
        var command = new CreateOnlineOrderCommand
        {
            DeliveryType = (int)OrderDeliveryType.Pickup,
            CustomerName = "Ana",
            CustomerPhone = "+5350000000",
            Items = [],
        };

        Func<Task> act = () => Handler().Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>
    /// El mínimo se evalúa contra el total del servidor + envío. Aquí 100 + 0 = 100 < 150 → 400.
    /// Si el mínimo se comprobara contra el total que "dice" el cliente, esto sería un agujero.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheRecalculatedTotalIsBelowTheMinimum_ShouldReject()
    {
        EnabledSettings(minimumOrderAmount: 150m);
        Guid productId = Publish("Arroz", 100m);

        Func<Task> act = () => Handler().Handle(Command(productId: productId), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>
    /// El mínimo se mide SOBRE el total con envío: si se midiera solo sobre los productos,
    /// wouldn't it'd 100 < 150 con envío 100 → 200, un pedido que SÍ se debería aceptar y se
    /// rechazaría. Este test fija que el envío cuenta para el mínimo.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheDeliveryFeePushesTheTotalOverTheMinimum_ShouldAccept()
    {
        EnabledSettings(pickup: false, delivery: true, deliveryFee: 100m, minimumOrderAmount: 150m);
        Guid productId = Publish("Arroz", 100m);
        CreateOnlineOrderCommand command = Command(
            OrderDeliveryType.Delivery, productId, deliveryAddress: "Calle 23 #45");

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Total.Should().Be(200m);
    }

    /// <summary>
    /// Sin tienda en el contexto no se puede ni resolver la configuración ni escribir el pedido:
    /// se rechaza antes de tocar nada.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReject()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
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
    /// El código es un identificador, no un dato: se genera aquí y NO viene en el payload. Si
    /// alguien añadiera un campo `Code` al comando, el cliente podría fijar el código del pedido.
    /// </summary>
    [Fact]
    public void CreateOnlineOrderCommand_ShouldCarryNoCodeField()
    {
        typeof(CreateOnlineOrderCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("Code");
    }

    /// <summary>
    /// Las notas van a `Order.Notes`, no a `Order.Description`: `Description` es el campo de la
    /// venta del POS y duplicar la nota en las dos columnas haría que dos vistas mostraran el mismo
    /// texto por columnas distintas.
    /// </summary>
    [Fact]
    public async Task Handle_WithNotes_ShouldWriteThemToNotesOnly()
    {
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
        EnabledSettings();
        Guid first = Publish("Arroz", 100m);
        Guid second = Publish("Azúcar", 50m);
        var command = new CreateOnlineOrderCommand
        {
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
        EnabledSettings();
        Guid productId = Publish("Arroz", 100m);

        await Handler().Handle(Command(productId: productId), CancellationToken.None);

        _orderRepository.Verify(x => x.UpdateAsync(It.IsAny<Order>()), Times.Never);
        _orderRepository.Verify(x => x.GetByIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    #endregion
}