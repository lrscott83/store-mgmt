using Application.Abstractions.HttpContext;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Branding.Queries.GetStoreCatalogBranding;
using Domain.Entities.StoreCatalogSettings;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Branding.Queries;

/// <summary>
/// Lectura de la MARCA (F8) en la vista Catálogo Web. Contrato:
///
///   1. Es una lectura EN SESIÓN (`GetByStoreIdAsync`), no la pública: el filtro global por tenant
///      del `ApplicationDbContext` es justo lo que confina la gestión a la tienda del contexto. Una
///      tienda no configurada NO es un error: se devuelven los valores por defecto.
///   2. Devuelve CLAVES, no URLs. La clave es lo que se persiste; la URL pública la compone el
///      config anónimo (F1) con el slug. Que aquí se publicara una ruta de almacenamiento sería
///      filtrarla.
///   3. `PaletteId` cae a la paleta por defecto si la fila lo tiene en blanco, por el mismo motivo
///      que en el config público: el storefront siempre tiene que pintar algo.
/// </summary>
public class GetStoreCatalogBrandingQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public GetStoreCatalogBrandingQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
    }

    private GetStoreCatalogBrandingQueryHandler Handler() => new(
        _httpContextService.Object,
        _settingsRepository.Object,
        _localizer.Object);

    #region Happy Path

    /// <summary>
    /// Tienda recién sincronizada: tiene catálogo y todavía no toques la marca. Eso son valores por
    /// defecto, no un 404 — igual que la config de pedidos (F1).
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoRow_ShouldReturnTheDefaults()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.LogoKey.Should().BeNull();
        result.Data.BannerKey.Should().BeNull();
        result.Data.PaletteId.Should().Be(StoreCatalogSettings.DefaultPaletteId);
    }

    [Fact]
    public async Task Handle_WhenTheStoreHasARow_ShouldReturnItsBranding()
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = $"{_tenantId:N}/{_storeId:N}/branding/logo/abc.png";
        settings.BannerKey = $"{_tenantId:N}/{_storeId:N}/branding/banner/def.png";
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        result.Data!.LogoKey.Should().Be(settings.LogoKey);
        result.Data.BannerKey.Should().Be(settings.BannerKey);
    }

    /// <summary>La vista puede tener solo una de las dos: son independientes.</summary>
    [Fact]
    public async Task Handle_WithOnlyALogo_ShouldReturnTheBannerAsNull()
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = $"{_tenantId:N}/{_storeId:N}/branding/logo/abc.png";
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        result.Data!.LogoKey.Should().NotBeNull();
        result.Data.BannerKey.Should().BeNull();
    }

    /// <summary>
    /// Una fila con la paleta en blanco es una fila rota: el storefront tiene que pintar algo, así
    /// que cae a la paleta que el catálogo ya usa hoy en lugar de devolver una cadena vacía.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithABlankPalette_ShouldReportTheDefaultPalette(string paletteId)
    {
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.PaletteId = paletteId;
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        result.Data!.PaletteId.Should().Be(StoreCatalogSettings.DefaultPaletteId);
    }

    #endregion

    #region Integration / Contract

    /// <summary>
    /// Lectura EN SESIÓN a propósito. Es lo que confina la gestión a la tienda del contexto; la
    /// lectura pública existe para el anónimo y aquí no debe usarse.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReadTheSettingsOfTheStoreInContextOnce()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        _settingsRepository.Verify(x => x.GetByStoreIdAsync(_storeId), Times.Once);
        _settingsRepository.Verify(x => x.GetPublicByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.Is<Guid>(id => id != _storeId)), Times.Never);
    }

    /// <summary>Es una lectura: no escribe nada, ni marca ni inserta.</summary>
    [Fact]
    public async Task Handle_ShouldNeverWrite()
    {
        _settingsRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
        _settingsRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    /// <summary>
    /// El DTO de gestión lleva CLAVES, no URLs construidas a mano: la ruta pública la compone el
    /// config anónimo (F1) con el slug, y aquí una URL sería una ruta de almacenamiento expuesta.
    /// </summary>
    [Fact]
    public void StoreCatalogBrandingDto_ShouldCarryKeysAndNoServerUrls()
    {
        string[] properties = typeof(StoreCatalogBrandingDto).GetProperties().Select(p => p.Name).ToArray();

        properties.Should().Contain(["LogoKey", "BannerKey", "PaletteId"]);
        properties.Should().NotContain(["LogoUrl", "BannerUrl", "AbsolutePath"]);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Sin tienda en el contexto no hay fila que leer: no se adivina la tienda ni se lee la de
    /// otro. Se rechaza antes de tocar el repositorio.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new GetStoreCatalogBrandingQuery(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    #endregion
}