using Application.Abstractions.HttpContext;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.WebCatalog.Branding;
using Application.Features.WebCatalog.Branding.Commands.UpdateStoreCatalogBranding;
using Application.Features.WebCatalog.Public;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.WebCatalog.Branding.Commands;

/// <summary>
/// El MODO DE PRECIO del catálogo (S1/S7), guardado por la pareja de marca que es la configuración
/// del catálogo web. Lo que este suite fija:
///
///   1. `Unit` se guarda SIEMPRE: es el comportamiento histórico y no puede depender de ningún dato.
///   2. `Wholesale` con CERO productos con precio mayorista se RECHAZA con un 400 localizado, en el
///      servidor. La vista no es la puerta: sin esta regla, cualquiera con el token podría dejar la
///      tienda publicando una página vacía.
///   3. `Wholesale` con al menos un producto válido se guarda y se devuelve tal cual.
///   4. Un CAMBIO de modo regenera la página estática del catálogo (lo publicado cambia); guardar el
///      mismo modo no regenera nada.
///   5. El sistema NUNCA desactiva ni corrige solo la elección del dueño: un guardado de marca sin
///      modo, sobre una tienda ya mayorista y vacía, deja el modo como estaba.
/// </summary>
public class UpdateStoreCatalogBrandingPriceModeTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<ICatalogImageStorage> _catalogImageStorage = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Mock<ILogger<UpdateStoreCatalogBrandingCommandHandler>> _logger = new();
    private readonly Mock<ICatalogStaticPageRegenerator> _catalogPageRegenerator = new();
    private readonly Mock<IProductRepository> _productRepository = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    /// <summary>La fila que realmente se mandó a persistir, para inspeccionarla después.</summary>
    private StoreCatalogSettings? _persisted;

    /// <summary>Las columnas que el handler declaró como suyas en el upsert.</summary>
    private string[]? _persistedColumns;

    public UpdateStoreCatalogBrandingPriceModeTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns<string>(name => new LocalizedString(name, name));

        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        _storeRepository
            .Setup(x => x.GetStoreByIdAsync(_storeId))
            .ReturnsAsync(Store.Create("Tienda Catálogo", Guid.NewGuid(), true, _tenantId));

        _settingsRepository
            .Setup(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>(), It.IsAny<bool?>(), It.IsAny<string[]>()))
            .Returns((StoreCatalogSettings s, bool? _, string[] _) => Task.FromResult(s))
            .Callback((StoreCatalogSettings s, bool? _, string[] columns) =>
            {
                _persisted = s;
                _persistedColumns = columns;
            });
    }

    private UpdateStoreCatalogBrandingCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _storeRepository.Object,
        _settingsRepository.Object,
        _catalogImageStorage.Object,
        _localizer.Object,
        _logger.Object,
        _catalogPageRegenerator.Object,
        _productRepository.Object);

    /// <summary>Fila existente con el modo que el dueño ya tenía guardado.</summary>
    private StoreCatalogSettings ExistingRow(CatalogPriceMode priceMode)
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(Guid.NewGuid(), _storeId, _tenantId);
        settings.LogoKey = "old-logo.png";
        settings.PriceMode = priceMode;
        return settings;
    }

    private void StoreHasWholesalePricedProducts(bool value)
        => _productRepository
            .Setup(x => x.HasWholesalePricedProductsAsync(_storeId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(value);

    [Fact]
    public async Task Handle_WithUnitModeAndNoWholesaleProducts_ShouldStillBeAccepted()
    {
        // El modo histórico no depende de ningún dato: una tienda sin un solo producto mayorista
        // tiene que poder quedarse —y volver— al precio por unidad.
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(ExistingRow(CatalogPriceMode.Wholesale));
        StoreHasWholesalePricedProducts(false);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, false, PriceMode: "Unit"),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.PriceMode.Should().Be("Unit");
        _persisted!.PriceMode.Should().Be(CatalogPriceMode.Unit);
    }

    [Fact]
    public async Task Handle_WithWholesaleAndNoWholesalePricedProducts_ShouldRejectWithTheLocalizedMessage()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(ExistingRow(CatalogPriceMode.Unit));
        StoreHasWholesalePricedProducts(false);

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, false, PriceMode: "Wholesale"),
            CancellationToken.None);

        ApiException exception = (await act.Should().ThrowAsync<ApiException>()).Which;
        exception.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Message.Should().Be("CatalogWholesaleModeWithoutProducts");
        // Rechazar ANTES de escribir: una fila guardada a medias sería un modo mayorista publicado
        // sin ningún producto, que es justo lo que la regla evita.
        _settingsRepository.Verify(
            x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>(), It.IsAny<bool?>(), It.IsAny<string[]>()),
            Times.Never);
        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        _catalogPageRegenerator.Verify(
            x => x.RegenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithWholesaleAndAtLeastOneWholesalePricedProduct_ShouldPersistAndEchoTheMode()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(ExistingRow(CatalogPriceMode.Unit));
        StoreHasWholesalePricedProducts(true);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, false, PriceMode: "Wholesale"),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.PriceMode.Should().Be("Wholesale");
        result.Data.HasWholesalePricedProducts.Should().BeTrue();
        _persisted!.PriceMode.Should().Be(CatalogPriceMode.Wholesale);
        // La columna tiene que estar declarada en el upsert o el UPDATE no la escribiría (NoTracking).
        _persistedColumns.Should().Contain(nameof(StoreCatalogSettings.PriceMode));
    }

    [Fact]
    public async Task Handle_WhenTheModeChanges_ShouldRegenerateTheStaticCatalogPage()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(ExistingRow(CatalogPriceMode.Unit));
        StoreHasWholesalePricedProducts(true);

        await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, false, PriceMode: "Wholesale"),
            CancellationToken.None);

        _catalogPageRegenerator.Verify(
            x => x.RegenerateAsync(_storeId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenTheModeDoesNotChange_ShouldNotRegenerateTheStaticCatalogPage()
    {
        // Guardar el modo que ya estaba no cambia lo que el catálogo publica: regenerar la página
        // sería trabajo (y una escritura en disco) por nada.
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(ExistingRow(CatalogPriceMode.Wholesale));
        StoreHasWholesalePricedProducts(true);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, false, PriceMode: "Wholesale"),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _catalogPageRegenerator.Verify(
            x => x.RegenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithoutAPriceMode_ShouldKeepTheStoredModeEvenWhenNoWholesaleProductsRemain()
    {
        // S7: un sync posterior puede vaciar la config mayorista. El sistema NO corrige ni desactiva
        // la elección del dueño: guardar la marca (o las columnas) no puede tocar el modo.
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(ExistingRow(CatalogPriceMode.Wholesale));
        StoreHasWholesalePricedProducts(false);

        var result = await Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, false, MobileColumns: 1),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data!.PriceMode.Should().Be("Wholesale");
        result.Data.HasWholesalePricedProducts.Should().BeFalse();
        _persisted!.PriceMode.Should().Be(CatalogPriceMode.Wholesale);
    }

    [Fact]
    public async Task Handle_WithAnUnparsablePriceMode_ShouldRejectInsteadOfStoringGarbage()
    {
        // El validador ya lo rechaza; el handler no confía en esa capa para un valor que persiste en
        // la configuración del catálogo (el número del enum es almacenamiento, no contrato).
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(ExistingRow(CatalogPriceMode.Unit));
        StoreHasWholesalePricedProducts(true);

        Func<Task> act = () => Handler().Handle(
            new UpdateStoreCatalogBrandingCommand(null, false, null, false, PriceMode: "2"),
            CancellationToken.None);

        ApiException exception = (await act.Should().ThrowAsync<ApiException>()).Which;
        exception.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Message.Should().Be("BrandingPriceModeInvalid:PriceMode");
        _settingsRepository.Verify(
            x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>(), It.IsAny<bool?>(), It.IsAny<string[]>()),
            Times.Never);
    }
}
