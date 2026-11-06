using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using Application.UnitOfWorks;
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
using System.Net;

namespace Application.Tests.Features.OnlineOrdering.CreateOnlineOrder;

/// <summary>
/// El servidor COBRA el pedido del catálogo cuando la tienda publica precios mayoristas.
///
/// El comando es escueto a propósito: el cliente manda producto + cantidad y el servidor resuelve
/// todo lo demás. En modo mayorista eso significa que la cantidad se interpreta en UNIDADES, que
/// los paquetes se derivan de la config del producto, que el precio por unidad sale del escalón
/// aplicable (`WholesalePricing`, la MISMA regla que el POS) y que el hecho queda congelado en la
/// línea para que el resumen de WhatsApp diga "12 cajas".
///
/// Lo que esta suite fija:
///
///   * el pedido se guarda con su TIPO real (`Mayorista` en modo mayorista, `Normal` al detal);
///   * el escalón aplicable es el de `MinPacks` más alto que no supere los paquetes pedidos;
///   * una cantidad que no es múltiplo del paquete, un producto sin config y una compra por debajo
///     del primer escalón son 400 con su propio mensaje — nunca una venta al detal silenciosa;
///   * la moneda de la línea es la del escalón cuando difiere de la del producto;
///   * el modo unidad no cambia NADA de lo que ya hacía (`FinalPrice` y snapshot vacío).
/// </summary>
public class CreateOnlineOrderWholesalePricingTests
{
    private const string Slug = "tienda-mayorista";

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IOrderRepository> _orderRepository = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IStoreModuleRepository> _moduleRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Mock<ISalesManagerRepository> _salesManagerRepository = new();
    private readonly Mock<IOrderSalesManagerRepository> _orderSalesManagerRepository = new();
    private readonly Mock<IProductWholesaleTierRepository> _tierRepository = new();

    private Guid _storeId;
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();
    private readonly List<Product> _published = [];
    private readonly Dictionary<Guid, IList<ProductWholesaleTier>> _tiers = [];

    public CreateOnlineOrderWholesalePricingTests()
    {
        // El localizador devuelve "Clave:args": así se puede afirmar QUÉ mensaje se eligió sin
        // depender del texto traducido.
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _productRepository
            .Setup(x => x.GetPublishedByIdsAsync(It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<Guid>>()))
            .ReturnsAsync([]);
        _orderRepository.Setup(x => x.CodeExistsAsync(It.IsAny<Guid>(), It.IsAny<string>())).ReturnsAsync(false);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _moduleRepository
            .Setup(x => x.GetPublicActiveModuleIdsByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync([(int)ModuleType.PedidosWhatsApp]);

        _tierRepository
            .Setup(x => x.GetByProductIdAsync(It.IsAny<Guid>()))
            .Returns((Guid productId) => Task.FromResult<IList<ProductWholesaleTier>>(
                _tiers.TryGetValue(productId, out IList<ProductWholesaleTier>? tiers)
                    ? tiers
                    : []));
    }

    private CreateOnlineOrderCommandHandler Handler() => new(
        _unitOfWork.Object,
        _storeRepository.Object,
        _productRepository.Object,
        _orderRepository.Object,
        _settingsRepository.Object,
        _moduleRepository.Object,
        _localizer.Object,
        _salesManagerRepository.Object,
        _orderSalesManagerRepository.Object,
        _tierRepository.Object);

    #region Scaffolding

    private void OpenStore(CatalogPriceMode priceMode)
    {
        Store store = Store.Create("Mayorista Ana", Guid.NewGuid(), true, _tenantId, null);
        store.CatalogSlug = Slug;
        _storeRepository.Setup(x => x.GetStoreByCatalogSlugAsync(Slug)).ReturnsAsync(store);
        _storeId = store.Id;

        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = true;
        settings.PriceMode = priceMode;
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);
    }

    private Guid PublishProduct(
        decimal price = 100m,
        int packSize = 12,
        string? unitLabel = "caja",
        bool wholesaleEnabled = true,
        Currency currency = Currency.CUP)
    {
        Product product = Product.Create("Cerveza", _categoryId, price, 1, true, true, "B-1", _tenantId);
        product.Category = ProductCategory.Create(_storeId, "General", 1, _tenantId, "general");
        product.Currency = currency;
        product.WholesaleEnabled = wholesaleEnabled;
        product.WholesalePackSize = packSize;
        product.WholesaleUnitLabel = unitLabel;
        _published.Add(product);

        _productRepository
            .Setup(x => x.GetPublishedByIdsAsync(_storeId, It.IsAny<IReadOnlyCollection<Guid>>()))
            .Returns((Guid _, IReadOnlyCollection<Guid> ids) =>
                Task.FromResult<IList<Product>>([.. _published.Where(p => ids.Contains(p.Id))]));

        return product.Id;
    }

    private void WithTiers(Guid productId, (int MinPacks, decimal UnitPrice)[] tiers,
        Currency currency = Currency.CUP)
    {
        _tiers[productId] = [.. tiers.Select(tier => ProductWholesaleTier.Create(
            productId, tier.MinPacks, tier.UnitPrice, currency, _tenantId))];
    }

    private static CreateOnlineOrderCommand Command(Guid productId, int quantity) => new()
    {
        StoreSlug = Slug,
        DeliveryType = (int)OrderDeliveryType.Pickup,
        CustomerName = "Ana",
        CustomerPhone = "+5350000000",
        Items = [new CreateOnlineOrderLineRequest { ProductId = productId, Quantity = quantity }],
    };

    private static CreateOnlineOrderCommand CommandWithLines(params (Guid ProductId, int Quantity)[] lines) => new()
    {
        StoreSlug = Slug,
        DeliveryType = (int)OrderDeliveryType.Pickup,
        CustomerName = "Ana",
        CustomerPhone = "+5350000000",
        Items = [.. lines.Select(line => new CreateOnlineOrderLineRequest
        {
            ProductId = line.ProductId,
            Quantity = line.Quantity,
        })],
    };

    /// <summary>Caja mutable: el pedido se captura cuando el handler lo persiste.</summary>
    private sealed class PersistedOrder
    {
        public Order? Value { get; set; }
    }

    private PersistedOrder CapturePersisted()
    {
        var box = new PersistedOrder();
        _orderRepository
            .Setup(x => x.AddAsync(It.IsAny<Order>()))
            .Callback<Order>(order => box.Value = order)
            .ReturnsAsync((Order order) => order);
        return box;
    }

    #endregion

    #region Tier resolution

    /// <summary>
    /// 144 unidades con paquete de 12 son 12 paquetes, y el escalón que aplica es el de 10 (el más
    /// alto que no supera 12): 70 por unidad. El pedido se guarda como `Mayorista` y la línea
    /// conserva los paquetes y la unidad configurada.
    /// </summary>
    [Fact]
    public async Task Handle_InWholesaleMode_ShouldResolveTheTierOfTheRequestedPacks()
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct(price: 100m, packSize: 12, unitLabel: "caja");
        WithTiers(productId, [(1, 90m), (5, 80m), (10, 70m)]);
        PersistedOrder persisted = CapturePersisted();

        var result = await Handler().Handle(Command(productId, quantity: 144), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Total.Should().Be(10_080m, "144 unidades × 70 por unidad");

        Order order = persisted.Value!;
        order.OrderType.Should().Be(OrderType.Mayorista);
        order.IsOfflineOrder.Should().BeFalse();

        var item = order.OrderItems.Single();
        item.Price.Should().Be(70m, "el precio persistido es el de la UNIDAD del escalón");
        item.Quantity.Should().Be(144);
        item.WholesalePackSize.Should().Be(12);
        item.WholesalePacks.Should().Be(12);
        item.WholesaleTierMinPacks.Should().Be(10);
        item.WholesaleTierUnitPrice.Should().Be(70m);
        item.WholesaleUnitLabel.Should().Be("caja");
    }

    /// <summary>
    /// El escalón aplicable es el de `MinPacks` más alto que NO supere los paquetes: en los bordes
    /// (justo en el mínimo y justo por debajo del siguiente) no se adelanta el descuento.
    /// </summary>
    [Theory]
    [InlineData(1, 90)]
    [InlineData(4, 90)]
    [InlineData(5, 80)]
    [InlineData(9, 80)]
    [InlineData(10, 70)]
    [InlineData(40, 70)]
    public async Task Handle_InWholesaleMode_ShouldPickTheHighestTierAtOrBelowThePacks(int packs, decimal expected)
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct(packSize: 12);
        WithTiers(productId, [(1, 90m), (5, 80m), (10, 70m)]);

        var result = await Handler().Handle(Command(productId, quantity: packs * 12), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Lines.Single().Price.Should().Be(expected);
        result.Data.Total.Should().Be(expected * packs * 12);
    }

    /// <summary>
    /// El cobro se piensa en paquetes pero se guarda en unidades: la cantidad pedida no se reescribe
    /// a paquetes, así que `Price × Quantity` sigue siendo el importe de la línea.
    /// </summary>
    [Fact]
    public async Task Handle_InWholesaleMode_ShouldPersistTheUnitPriceSoPriceTimesQuantityIsTheLineTotal()
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct(packSize: 6);
        WithTiers(productId, [(2, 45.5m)]);
        PersistedOrder persisted = CapturePersisted();

        await Handler().Handle(Command(productId, quantity: 24), CancellationToken.None);

        var item = persisted.Value!.OrderItems.Single();
        item.Price.Should().Be(45.5m);
        item.Quantity.Should().Be(24);
        (item.Price * item.Quantity).Should().Be(1_092m);
    }

    #endregion

    #region Rejections

    /// <summary>13 unidades con paquete de 12 no es una venta: no hay paquete que cobrar.</summary>
    [Fact]
    public async Task Handle_InWholesaleMode_WithANonMultipleQuantity_ShouldReject()
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct(packSize: 12);
        WithTiers(productId, [(1, 90m)]);

        Func<Task> act = () => Handler().Handle(Command(productId, quantity: 13), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().StartWith("OnlineOrderWholesaleQuantityMustBeAPackMultiple");
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>
    /// Un producto sin config mayorista válida no se cobra en modo mayorista —igual que no se
    /// publica en el catálogo mayorista—: aceptarlo guardaría un precio minorista en una venta que
    /// la tienda está vendiendo al por mayor.
    /// </summary>
    [Theory]
    [InlineData(false, 12, 1)]   // desactivado
    [InlineData(true, 0, 1)]     // sin paquete
    [InlineData(true, 12, 0)]    // sin escalones
    public async Task Handle_InWholesaleMode_WithoutAValidConfig_ShouldReject(
        bool enabled, int packSize, int tiersCount)
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct(packSize: packSize, wholesaleEnabled: enabled);
        if (tiersCount > 0)
            WithTiers(productId, [(1, 90m)]);

        Func<Task> act = () => Handler().Handle(Command(productId, quantity: 12), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().StartWith("OnlineOrderWholesaleNotConfigured");
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>
    /// Por debajo del primer escalón no hay precio: el POS saca la línea del carrito, así que el
    /// servidor rechaza el pedido en vez de venderlo al detal por la puerta de atrás.
    /// </summary>
    [Fact]
    public async Task Handle_InWholesaleMode_BelowTheFirstTier_ShouldReject()
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct(packSize: 12);
        WithTiers(productId, [(5, 80m), (10, 70m)]);

        Func<Task> act = () => Handler().Handle(Command(productId, quantity: 12), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().StartWith("OnlineOrderWholesaleBelowMinimumPacks");
        _orderRepository.Verify(x => x.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    /// <summary>
    /// Un producto que el catálogo ya no publica sigue siendo 400 aunque la tienda esté en modo
    /// mayorista: el motivo es la publicación, no la config.
    /// </summary>
    [Fact]
    public async Task Handle_InWholesaleMode_WithAnUnpublishedProduct_ShouldReject()
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct();
        WithTiers(productId, [(1, 90m)]);
        _published.Clear();

        Func<Task> act = () => Handler().Handle(Command(productId, quantity: 12), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().StartWith("OnlineOrderProductNotAvailable");
    }

    #endregion

    #region Currency

    /// <summary>
    /// Cada escalón trae su moneda: si el precio mayorista está en otra moneda que el producto, la
    /// línea se guarda en la DEL ESCALÓN (es la moneda del importe cobrado) y el pedido entero la
    /// hereda.
    /// </summary>
    [Fact]
    public async Task Handle_InWholesaleMode_ShouldUseTheTierCurrencyForTheLine()
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct(currency: Currency.CUP);
        WithTiers(productId, [(1, 3.5m)], currency: Currency.USD);
        PersistedOrder persisted = CapturePersisted();

        var result = await Handler().Handle(Command(productId, quantity: 24), CancellationToken.None);

        result.Data!.Currency.Should().Be(Currency.USD);
        persisted.Value!.Currency.Should().Be(Currency.USD);
        persisted.Value.OrderItems.Single().Currency.Should().Be(Currency.USD);
    }

    /// <summary>Un carrito mayorista con dos monedas sigue siendo imposible de guardar.</summary>
    [Fact]
    public async Task Handle_InWholesaleMode_WithTwoCurrencies_ShouldReject()
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid first = PublishProduct(packSize: 12);
        Guid second = PublishProduct(packSize: 12);
        WithTiers(first, [(1, 90m)], currency: Currency.CUP);
        WithTiers(second, [(1, 5m)], currency: Currency.USD);

        Func<Task> act = () => Handler().Handle(
            CommandWithLines((first, 12), (second, 12)), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().StartWith("OnlineOrderMixedCurrencies");
    }

    #endregion

    #region Unit mode (lo que NO cambia)

    /// <summary>
    /// Modo unidad: el precio es el `FinalPrice` del catálogo (con descuentos), el pedido se guarda
    /// como `Normal` y NO hay hecho mayorista que congelar. Es exactamente lo que hacía antes de
    /// existir el modo mayorista.
    /// </summary>
    [Fact]
    public async Task Handle_InUnitMode_ShouldKeepPricingAsBeforeAndLeaveTheSnapshotEmpty()
    {
        OpenStore(CatalogPriceMode.Unit);
        Guid productId = PublishProduct(price: 100m);
        WithTiers(productId, [(1, 90m)]);
        PersistedOrder persisted = CapturePersisted();

        var result = await Handler().Handle(Command(productId, quantity: 3), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Total.Should().Be(300m);

        Order order = persisted.Value!;
        order.OrderType.Should().Be(OrderType.Normal);
        var item = order.OrderItems.Single();
        item.Price.Should().Be(100m);
        item.WholesalePackSize.Should().Be(0);
        item.WholesalePacks.Should().Be(0);
        item.WholesaleTierMinPacks.Should().BeNull();
        item.WholesaleTierUnitPrice.Should().BeNull();
        item.WholesaleUnitLabel.Should().BeNull();
    }

    /// <summary>
    /// En modo unidad la cantidad NO tiene que ser múltiplo de nada: el paquete es una config que
    /// ese modo no usa, así que un pedido de 13 unidades se sigue aceptando.
    /// </summary>
    [Fact]
    public async Task Handle_InUnitMode_ShouldNotEnforceThePackMultiple()
    {
        OpenStore(CatalogPriceMode.Unit);
        Guid productId = PublishProduct(price: 10m, packSize: 12);

        var result = await Handler().Handle(Command(productId, quantity: 13), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.Total.Should().Be(130m);
        _tierRepository.Verify(x => x.GetByProductIdAsync(It.IsAny<Guid>()), Times.Never,
            "el modo unidad no consulta escalones");
    }

    #endregion

    #region Created DTO

    /// <summary>
    /// Las líneas del DTO salen del SNAPSHOT PERSISTIDO y llevan los paquetes y la unidad: es lo que
    /// el frontend necesita para escribir "12 cajas × Cerveza" en el resumen de WhatsApp.
    /// </summary>
    [Fact]
    public async Task Handle_InWholesaleMode_ShouldReturnThePacksAndUnitLabelOnTheCreatedLines()
    {
        OpenStore(CatalogPriceMode.Wholesale);
        Guid productId = PublishProduct(packSize: 12, unitLabel: "caja");
        WithTiers(productId, [(1, 90m), (10, 70m)]);

        var result = await Handler().Handle(Command(productId, quantity: 144), CancellationToken.None);

        OnlineOrderCreatedLineDto line = result.Data!.Lines.Single();
        line.Name.Should().Be("Cerveza");
        line.Quantity.Should().Be(144);
        line.Price.Should().Be(70m);
        line.Packs.Should().Be(12);
        line.UnitLabel.Should().Be("caja");
    }

    /// <summary>En modo unidad no hay paquete ni unidad que mencionar: el resumen habla en unidades.</summary>
    [Fact]
    public async Task Handle_InUnitMode_ShouldReturnNoPacksOnTheCreatedLines()
    {
        OpenStore(CatalogPriceMode.Unit);
        Guid productId = PublishProduct(packSize: 12, unitLabel: "caja");

        var result = await Handler().Handle(Command(productId, quantity: 2), CancellationToken.None);

        OnlineOrderCreatedLineDto line = result.Data!.Lines.Single();
        line.Packs.Should().BeNull();
        line.UnitLabel.Should().BeNull();
    }

    #endregion
}
