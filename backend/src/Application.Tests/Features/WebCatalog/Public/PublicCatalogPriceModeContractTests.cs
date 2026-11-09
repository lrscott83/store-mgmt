using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Public.Queries.GetPublicCatalog;
using Application.Features.WebCatalog.Public.Queries.GetPublicCatalogProduct;
using Application.Features.WebCatalog.Public.Queries.GetPublicCatalogProducts;
using Domain.Common.Enums;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// El modo de precio tal como lo ve el cliente final en el contrato HTTP: `priceMode` en la
/// cabecera y en cada producto.
///
/// Los handlers no deciden el modo —eso es del repositorio, que es quien decide qué se publica—,
/// solo lo etiquetan. Eso es exactamente lo que fija este archivo: que la etiqueta de la cabecera Y
/// la de cada producto salgan del MISMO dato, y que una tienda sin configuración (el repositorio
/// responde `Unit`) se publique como unidad en vez de dejar el campo en el valor por defecto del
/// enum, que no es ninguno de los dos modos.
/// </summary>
public class PublicCatalogPriceModeContractTests
{
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Store _store;

    public PublicCatalogPriceModeContractTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns((string name) => new LocalizedString(name, name));
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) => new LocalizedString(name, name));

        _store = Store.Create("Tienda Pública", Guid.NewGuid(), true, _tenantId);
        _store.CatalogSlug = "tienda-publica";

        _storeRepository
            .Setup(x => x.GetStoreByCatalogSlugAsync(It.IsAny<string>()))
            .ReturnsAsync(_store);

        _productRepository
            .Setup(x => x.GetPublishedCategoryCountsAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
        _productRepository
            .Setup(x => x.CountPublishedAsync(It.IsAny<Guid>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _productRepository
            .Setup(x => x.GetPublishedPageAsync(It.IsAny<Guid>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([MakeProduct()]);
        _productRepository
            .Setup(x => x.GetPublicPriceModeAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(CatalogPriceMode.Wholesale);
    }

    private Product MakeProduct()
    {
        var product = Product.Create("Camisa", Guid.NewGuid(), 100m, 1, true, true, "B-1", _tenantId);
        product.Category = ProductCategory.Create(_store.Id, "Ropa", 1, _tenantId, slug: "ropa");
        product.WholesaleEnabled = true;
        product.WholesalePackSize = 12;
        product.WholesaleTiers.Add(
            ProductWholesaleTier.Create(product.Id, 1, 50m, Currency.CUP, _tenantId));
        return product;
    }

    [Fact]
    public async Task Header_WithWholesaleMode_ShouldLabelTheHeaderAndTheProductItems()
    {
        var header = new GetPublicCatalogQueryHandler(
            _storeRepository.Object, _productRepository.Object, _localizer.Object);

        var result = await header.Handle(new GetPublicCatalogQuery("tienda-publica"), CancellationToken.None);

        result.Data.PriceMode.Should().Be("Wholesale");

        var pageHandler = new GetPublicCatalogProductsQueryHandler(
            _storeRepository.Object, _productRepository.Object, _localizer.Object);

        var page = await pageHandler.Handle(
            new GetPublicCatalogProductsQuery("tienda-publica"), CancellationToken.None);

        page.Data.Items.Should().ContainSingle();
        page.Data.Items[0].PriceMode.Should().Be("Wholesale");
    }

    /// <summary>Una tienda sin fila de configuración: el repositorio responde `Unit` y el contrato
    /// lo dice con el nombre del modo, nunca con un número ni con el valor por defecto del enum.</summary>
    [Fact]
    public async Task Header_WithoutASettingsRow_ShouldPublishUnitMode()
    {
        _productRepository
            .Setup(x => x.GetPublicPriceModeAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(CatalogPriceMode.Unit);

        var header = new GetPublicCatalogQueryHandler(
            _storeRepository.Object, _productRepository.Object, _localizer.Object);

        var result = await header.Handle(new GetPublicCatalogQuery("tienda-publica"), CancellationToken.None);

        result.Data.PriceMode.Should().Be("Unit");
    }

    /// <summary>
    /// El detalle publica la config completa: el cliente que abre la tarjeta tiene que poder elegir
    /// paquetes y saber el mínimo sin pedir otra cosa.
    /// </summary>
    [Fact]
    public async Task Detail_WithWholesaleMode_ShouldExposeTheWholesaleConfig()
    {
        Product product = MakeProduct();
        _productRepository
            .Setup(x => x.GetPublishedByIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>()))
            .ReturnsAsync(product);

        var handler = new GetPublicCatalogProductQueryHandler(
            _storeRepository.Object, _productRepository.Object, _localizer.Object);

        var result = await handler.Handle(
            new GetPublicCatalogProductQuery("tienda-publica", product.Id), CancellationToken.None);

        result.Data.PriceMode.Should().Be("Wholesale");
        result.Data.WholesalePackSize.Should().Be(12);
        result.Data.WholesaleMinPacks.Should().Be(1);
        result.Data.WholesaleUnitPrice.Should().Be(50m);
        result.Data.WholesalePackPrice.Should().Be(600m);
        result.Data.WholesaleTiers.Should().ContainSingle()
            .Which.PackPrice.Should().Be(600m);
    }
}
