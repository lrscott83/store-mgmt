using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.WebCatalog.Branding.Queries.GetStoreCatalogBranding;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.WebCatalog.Branding.Queries;

/// <summary>
/// El MODO DE PRECIO en la LECTURA de la configuración del catálogo (S1/S7):
///
///   1. Viaja como NOMBRE del contrato ("Unit" / "Wholesale"), no como el número del enum: el número
///      es almacenamiento y renumerarlo no puede cambiar la API.
///   2. Una tienda sin fila —o con un valor que ningún miembro del enum representa— se lee como
///      `Unit`, que es como el catálogo se publicaba antes de que el modo existiera.
///   3. El aviso de S7 necesita saber si hay productos con precio mayorista, así que viaja en la
///      MISMA respuesta: una segunda petición desde la vista solo añadiría una ventana de error.
/// </summary>
public class GetStoreCatalogBrandingPriceModeTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Mock<IProductRepository> _productRepository = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public GetStoreCatalogBrandingPriceModeTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _storeRepository
            .Setup(x => x.GetStoreByIdIgnoreQueryFiltersAsync(_storeId))
            .ReturnsAsync(Store.Create("Tienda Catálogo", Guid.NewGuid(), true, _tenantId));
    }

    private GetStoreCatalogBrandingQueryHandler Handler() => new(
        _httpContextService.Object,
        _storeRepository.Object,
        _settingsRepository.Object,
        _localizer.Object,
        _productRepository.Object);

    private void StoreHasWholesalePricedProducts(bool value)
        => _productRepository
            .Setup(x => x.HasWholesalePricedProductsAsync(_storeId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(value);

    [Fact]
    public async Task Handle_WhenTheStoreHasNoRow_ShouldReportUnitAndNoWholesaleProducts()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);
        StoreHasWholesalePricedProducts(false);

        var result = await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        result.Data!.PriceMode.Should().Be("Unit");
        result.Data.HasWholesalePricedProducts.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_WithAStoredWholesaleMode_ShouldReportWholesale()
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(Guid.NewGuid(), _storeId, _tenantId);
        settings.PriceMode = CatalogPriceMode.Wholesale;
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);
        StoreHasWholesalePricedProducts(true);

        var result = await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        result.Data!.PriceMode.Should().Be("Wholesale");
        result.Data.HasWholesalePricedProducts.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_WithAStoredValueOutsideTheEnum_ShouldFallBackToUnit()
    {
        // Un dato a mano (o de una migración futura) no puede dejar la vista sin un modo válido.
        StoreCatalogSettings settings = StoreCatalogSettings.Create(Guid.NewGuid(), _storeId, _tenantId);
        settings.PriceMode = (CatalogPriceMode)99;
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);
        StoreHasWholesalePricedProducts(false);

        var result = await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        result.Data!.PriceMode.Should().Be("Unit");
    }

    [Fact]
    public async Task Handle_ShouldReportTheWholesaleProductsFactEvenInUnitMode()
    {
        // En modo unidad el dato se sigue informando: es un hecho de la tienda, no del modo, y la
        // vista no debería tener que deducirlo (ni recibir una mentira al cambiar de modo).
        StoreCatalogSettings settings = StoreCatalogSettings.Create(Guid.NewGuid(), _storeId, _tenantId);
        settings.PriceMode = CatalogPriceMode.Unit;
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);
        StoreHasWholesalePricedProducts(true);

        var result = await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        result.Data!.PriceMode.Should().Be("Unit");
        result.Data.HasWholesalePricedProducts.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldRejectWithoutReadingAnything()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        ApiException exception = (await act.Should().ThrowAsync<ApiException>()).Which;
        exception.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
        _productRepository.Verify(
            x => x.HasWholesalePricedProductsAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
