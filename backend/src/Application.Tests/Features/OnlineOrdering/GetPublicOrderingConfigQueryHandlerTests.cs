using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderingConfig;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El config público es lo único que el storefront lee antes de ofrecer el carrito, y son cuatro
/// propiedades las que importan:
///
///   1. ANÓNIMO y acotado al slug: sin sesión, y el slug (único global) es lo que resuelve la
///      tienda. Mismo 404 uniforme que el catálogo público para que el anónimo no distinga entre
///      "no existe" y "no hay catálogo".
///   2. `Enabled = false` cuando la tienda no tiene fila: publicar el catálogo NO publica los
///      pedidos (dos interruptores distintos), y por defecto el segundo está apagado.
///   3. NO expone el número de WhatsApp. El enlace `wa.me` se arma en el endpoint del pedido (F4),
///      no en un config que cualquier visitante puede leer.
///
/// La paleta viene porque el storefront la pinta; el logo y el banner también, como URLs públicas
/// del endpoint de media construidas con el slug de la tienda.
/// </summary>
public class GetPublicOrderingConfigQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStoreCatalogSettingsRepository> _settingsRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    /// <summary>
    /// Id de la tienda resuelta por el slug. Lo fija <see cref="PublishedStore"/> porque es el
    /// handler quien resuelve la tienda y luego pide SU configuración: un id inventado en el test
    /// haría que el mock respondiera siempre "sin fila".
    /// </summary>
    private Guid _storeId;
    private readonly Guid _tenantId = Guid.NewGuid();

    public GetPublicOrderingConfigQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
    }

    private GetPublicOrderingConfigQueryHandler Handler() => new(
        _storeRepository.Object,
        _settingsRepository.Object,
        _localizer.Object);

    /// <summary>Tienda con catálogo publicado: el caso normal del storefront.</summary>
    private Store PublishedStore(string slug = "tienda-ana")
    {
        Store store = Store.Create("Tienda Ana", Guid.NewGuid(), true, _tenantId, null);
        store.CatalogSlug = slug;
        _storeRepository
            .Setup(x => x.GetStoreByCatalogSlugAsync(slug))
            .ReturnsAsync(store);

        // El handler resuelve la tienda y pide la configuración de ESE id, no de uno inventado.
        _storeId = store.Id;
        return store;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_WhenTheStoreHasNoSettings_ShouldReportOrdersDisabled()
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Enabled.Should().BeFalse();
        result.Data.PickupEnabled.Should().BeFalse();
        result.Data.DeliveryEnabled.Should().BeFalse();
        result.Data.DeliveryFee.Should().Be(0m);
        result.Data.MinimumOrderAmount.Should().Be(0m);
        result.Data.BusinessHours.Should().BeNull();
        result.Data.DeliveryZones.Should().BeNull();
    }

    /// <summary>
    /// Sin fila la paleta es la que el catálogo ya usa hoy: el storefront tiene que pintar algo, y
    /// una fila recién creada no debe romper el estilo.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoSettings_ShouldReportTheDefaultPalette()
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.PaletteId.Should().Be(StoreCatalogSettings.DefaultPaletteId);
    }

    [Fact]
    public async Task Handle_WhenTheStoreHasSettings_ShouldPublishTheOrderingRules()
    {
        PublishedStore();
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = true;
        settings.DeliveryEnabled = true;
        settings.DeliveryFee = 50m;
        settings.MinimumOrderAmount = 200m;
        settings.BusinessHours = "Lun-Vie 8:00-18:00";
        settings.DeliveryZones = "Centro, Vedado";
        settings.PaletteId = "sunset";
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.Enabled.Should().BeTrue();
        result.Data.PickupEnabled.Should().BeTrue();
        result.Data.DeliveryEnabled.Should().BeTrue();
        result.Data.DeliveryFee.Should().Be(50m);
        result.Data.MinimumOrderAmount.Should().Be(200m);
        result.Data.BusinessHours.Should().Be("Lun-Vie 8:00-18:00");
        result.Data.DeliveryZones.Should().Be("Centro, Vedado");
        result.Data.PaletteId.Should().Be("sunset");
    }

    #region Branding (F8)

    /// <summary>
    /// La marca viaja como URL del endpoint PÚBLICO de media, construida con el slug de la tienda:
    /// es lo que el storefront pone en el `src` y lo que lo sirve sin sesión. Reutilizar el mismo
    /// builder que las imágenes de producto es lo que evita un endpoint de marca paralelo.
    /// </summary>
    [Fact]
    public async Task Handle_WithALogoAndABanner_ShouldPublishTheirPublicMediaUrls()
    {
        PublishedStore("tienda-ana");
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = $"{_tenantId:N}/{_storeId:N}/branding/logo/logo.png";
        settings.BannerKey = $"{_tenantId:N}/{_storeId:N}/branding/banner/banner.png";
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.LogoUrl.Should().Be($"/api/v1/public/catalog/tienda-ana/media/{settings.LogoKey}");
        result.Data.BannerUrl.Should().Be($"/api/v1/public/catalog/tienda-ana/media/{settings.BannerKey}");
    }

    /// <summary>
    /// Sin clave la URL es null, no una cadena vacía ni una ruta rota: el storefront no pinta nada.
    /// Sin fila también (una tienda recién sincronizada no tiene marca todavía).
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoSettings_ShouldPublishNoMediaUrls()
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.LogoUrl.Should().BeNull();
        result.Data.BannerUrl.Should().BeNull();
    }

    /// <summary>Logo y banner son independientes: puede tener uno solo.</summary>
    [Fact]
    public async Task Handle_WithOnlyALogo_ShouldPublishTheBannerUrlAsNull()
    {
        PublishedStore();
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = $"{_tenantId:N}/{_storeId:N}/branding/logo/logo.png";
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.LogoUrl.Should().NotBeNull();
        result.Data.BannerUrl.Should().BeNull();
    }

    /// <summary>
    /// Una key en blanco es una key que no existe: hay que filtrarla ANTES de construir la URL, o el
    /// storefront recibiría `/media/` y pediría el índice de un directorio.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithABlankMediaKey_ShouldPublishNoUrl(string blank)
    {
        PublishedStore();
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = blank;
        settings.BannerKey = blank;
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.LogoUrl.Should().BeNull();
        result.Data.BannerUrl.Should().BeNull();
    }

    /// <summary>
    /// La URL es del endpoint PÚBLICO y lleva el slug de la tienda RESUELTA, no el que vino en la
    /// petición: si se publicara el slug crudo, dos consultas con distinta capitalización darían dos
    /// URLs distintas para la misma imagen y la caché inmutable del navegador serviría la vieja.
    /// </summary>
    [Fact]
    public async Task Handle_WithABrandingKey_ShouldBuildTheUrlFromTheResolvedSlug()
    {
        PublishedStore("tienda-ana");
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = "tenant/store/branding/logo/logo.png";
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("  TIENDA-ANA  "), CancellationToken.None);

        result.Data!.LogoUrl.Should().Be("/api/v1/public/catalog/tienda-ana/media/tenant/store/branding/logo/logo.png");
        result.Data.LogoUrl.Should().NotContain("TIENDA-ANA");
    }

    /// <summary>
    /// Nunca una ruta del servidor. La URL es relativa al endpoint público, sin host ni ruta del
    /// almacenamiento: el config lo lee un anónimo y no puede usarse para localizar archivos en
    /// disco.
    /// </summary>
    [Fact]
    public async Task Handle_WithABrandingKey_ShouldPublishNoServerPath()
    {
        PublishedStore();
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = $"{_tenantId:N}/{_storeId:N}/branding/logo/logo.png";
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.LogoUrl.Should().StartWith("/api/v1/public/catalog/");
        result.Data.LogoUrl.Should().NotContain(@":\");
        result.Data.LogoUrl.Should().NotContain("storage");
    }

    #endregion

    /// <summary>
    /// Solo recogida: el storefront ofrece pasar a recoger y NO ofrece domicilio con envío, aunque
    /// la columna de envío tenga un costo guardado de cuando lo cerró.
    /// </summary>
    [Fact]
    public async Task Handle_WithPickupOnly_ShouldPublishTheOpenDeliveryTypeOnly()
    {
        PublishedStore();
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = true;
        settings.DeliveryEnabled = false;
        settings.DeliveryFee = 50m;
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.PickupEnabled.Should().BeTrue();
        result.Data.DeliveryEnabled.Should().BeFalse();
        result.Data.DeliveryFee.Should().Be(50m);
    }

    /// <summary>El slug se normaliza como en el catálogo público: el que llega puede venir con espacios o mayúsculas.</summary>
    [Theory]
    [InlineData("  TIENDA-ANA  ")]
    [InlineData("tienda-ana")]
    public async Task Handle_ShouldResolveTheStoreByTheTrimmedLowercaseSlug(string slug)
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery(slug), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _storeRepository.Verify(x => x.GetStoreByCatalogSlugAsync("tienda-ana"), Times.Once);
    }

    #endregion

    #region Integration / Contract

    /// <summary>
    /// El config público NO lleva el número de WhatsApp: el enlace `wa.me` se arma en el endpoint
    /// del pedido (F4). Este test falla si alguien lo añade porque resulta más fácil.
    /// </summary>
    [Fact]
    public void PublicOrderingConfigDto_ShouldCarryNoWhatsappNumber()
    {
        typeof(PublicOrderingConfigDto).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(new[] { "WhatsappNumber", "Phone", "Contact" });
    }

    /// <summary>
    /// F8: el storefront necesita la URL del logo y del banner para pintarlos, así que el DTO las
    /// lleva. Lo que NO puede llevar son las CLAVES: `LogoKey`/`BannerKey` son rutas internas de
    /// almacenamiento y este config lo lee cualquiera que abra el catálogo. Publicarlas sería
    /// filtrar la estructura del disco.
    /// </summary>
    [Fact]
    public void PublicOrderingConfigDto_ShouldCarryTheMediaUrlsButNeverTheKeys()
    {
        string[] properties = typeof(PublicOrderingConfigDto).GetProperties().Select(p => p.Name).ToArray();

        properties.Should().Contain(["LogoUrl", "BannerUrl"]);
        properties.Should().NotContain(new[] { "LogoKey", "BannerKey" });
    }

    /// <summary>A3: no hay moneda configurable. El precio y la moneda los pone el catálogo.</summary>
    [Fact]
    public void PublicOrderingConfigDto_ShouldCarryNoCurrencyField()
    {
        typeof(PublicOrderingConfigDto).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("Currency");
    }

    /// <summary>
    /// El sello `SyncedAt` es de diagnóstico del POS, no del storefront: no se publica para que el
    /// anónimo no vea cuándo sincronizó el dueño.
    /// </summary>
    [Fact]
    public void PublicOrderingConfigDto_ShouldCarryNoSyncedAt()
    {
        typeof(PublicOrderingConfigDto).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("SyncedAt");
    }

    /// <summary>
    /// El config es del slug pedido: se lee la configuración de ESA tienda, una sola vez, y no se
    /// escribe nada (es una lectura anónima).
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReadTheSettingsOfTheStoreResolvedFromTheSlugOnce()
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        _settingsRepository.Verify(x => x.GetPublicByStoreIdAsync(_storeId), Times.Once);
        _settingsRepository.Verify(x => x.UpsertAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
        _settingsRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogSettings>()), Times.Never);
    }

    /// <summary>
    /// ESTE es el guardián del filtro por tenant. La configuración tiene filtro global
    /// `IsSuperAdmin || TenantId == TenantId`; el anónimo no tiene tenant en el contexto, así que
    /// la lectura DE SESIÓN no puede devolver fila y el storefront vería `Enabled = false` para
    /// siempre — sin error y sin aviso. Por eso la query pública usa la lectura que salta el
    /// filtro. Si alguien "simplifica" esto y vuelve a `GetByStoreIdAsync`, este test cae.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNeverUseTheSessionScopedRead()
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        _settingsRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>
    /// La prueba de que el camino anónimo funciona: la fila que devuelve la lectura PÚBLICA se
    /// publica tal cual, con `Enabled = true`. Junto con el guardián de arriba, fija el contrato
    /// completo — la query pública lee la fila que el repositorio sí es capaz de traer sin sesión.
    /// </summary>
    [Fact]
    public async Task Handle_WithAPubliclyReadableRow_ShouldReportOrdersEnabled()
    {
        PublishedStore();
        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.Enabled = true;
        settings.PickupEnabled = true;
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(settings);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.Enabled.Should().BeTrue();
        result.Data.PickupEnabled.Should().BeTrue();
    }

    /// <summary>
    /// El handler NO depende de la sesión en absoluto —ni `IHttpContextService`, ni tienda del
    /// contexto—. Es lo que hace posible que la lectura sea anónima de verdad, y también lo que
    /// impide que alguien introduzca aquí una dependencia que solo existiría en sesión.
    /// </summary>
    [Fact]
    public void GetPublicOrderingConfigQueryHandler_ShouldNotDependOnTheRequestSession()
    {
        typeof(GetPublicOrderingConfigQueryHandler).GetConstructors().Single()
            .GetParameters()
            .Select(p => p.ParameterType)
            .Should().NotContain(typeof(IHttpContextService));
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Slug inexistente → 404 con el mensaje de "no hay catálogo en esa dirección". Un slug vacío o
    /// en blanco NO es una búsqueda: se responde igual de rápido, sin tocar la base.
    /// </summary>
    [Theory]
    [InlineData("no-existe")]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithAnUnknownSlug_ShouldReturnNotFound(string slug)
    {
        Func<Task> act = () => Handler().Handle(new GetPublicOrderingConfigQuery(slug), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _settingsRepository.Verify(x => x.GetPublicByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>
    /// Tienda sin catálogo publicado: mismo 404 que un slug que no existe. Distinguir los dos
    /// confirmaría a un anónimo que ese nombre existe.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoCatalogSlug_ShouldReturnNotFound()
    {
        Store store = Store.Create("Sin catálogo", Guid.NewGuid(), true, _tenantId, null);
        _storeRepository.Setup(x => x.GetStoreByCatalogSlugAsync("sin-catalogo")).ReturnsAsync(store);

        Func<Task> act = () => Handler().Handle(new GetPublicOrderingConfigQuery("sin-catalogo"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    /// <summary>
    /// Sin fila de configuración NO es un error: una tienda recién sincronizada tiene catálogo y
    /// todavía no abrió pedidos.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreExistsWithoutSettings_ShouldNotThrow()
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);

        Func<Task> act = () => Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        await act.Should().NotThrowAsync();
    }

    #endregion
}