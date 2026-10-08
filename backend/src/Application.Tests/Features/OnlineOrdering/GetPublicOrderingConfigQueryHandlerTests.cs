using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderingConfig;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogImages;
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
    private readonly Mock<IStoreCatalogImageRepository> _imageRepository = new();
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

        // Por defecto la tienda no tiene imágenes de showcase: cada test monta las suyas si quiere
        // mirarlas. Es el caso normal de una tienda recién sincronizada.
        _imageRepository.Setup(x => x.GetPublicByStoreIdAsync(It.IsAny<Guid>())).ReturnsAsync([]);
    }

    private GetPublicOrderingConfigQueryHandler Handler() => new(
        _storeRepository.Object,
        _settingsRepository.Object,
        _imageRepository.Object,
        _localizer.Object);

    /// <summary>Imagen de showcase ya persistida: la fila solo aporta la clave y el pie de foto.</summary>
    private StoreCatalogImage ShowcaseImage(StoreCatalogImageKind kind, int orderIndex, string? caption = null)
        => StoreCatalogImage.Create(
            _storeId, _tenantId, kind, $"{_tenantId:N}/{_storeId:N}/catalog/{kind.ToString().ToLowerInvariant()}/{Guid.NewGuid():N}.png", orderIndex, caption);

    private void GivenShowcase(params StoreCatalogImage[] images)
        => _imageRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync(images.ToList());

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
    /// F8-R5: un slug EN BLANCO tampoco puede producir una URL. El handler solo rechaza `CatalogSlug
    /// == null` con 404, así que una fila con el slug vacío o en blanco llega viva hasta `MediaUrl`, que
    /// es quien tiene que frenarla: sin esa guarda el storefront recibiría
    /// `/api/v1/public/catalog//media/{key}` — una ruta con el slug vacío, que no corresponde a
    /// ninguna tienda y se pediría como si fuera un archivo. Null es la respuesta correcta.
    ///
    /// El slug se monta en blanco a propósito aunque la búsqueda llegue por otro valor: así lo que se
    /// fija es el contrato de `MediaUrl` (la guarda), no el `store == null` del resolutor.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WhenTheStoreHasABlankCatalogSlug_ShouldPublishNoMediaUrls(string blankSlug)
    {
        Store store = Store.Create("Sin slug publicado", Guid.NewGuid(), true, _tenantId, null);
        store.CatalogSlug = blankSlug;
        _storeRepository.Setup(x => x.GetStoreByCatalogSlugAsync(It.IsAny<string>())).ReturnsAsync(store);
        _storeId = store.Id;

        StoreCatalogSettings settings = StoreCatalogSettings.Create(_storeId, _tenantId);
        settings.LogoKey = $"{_tenantId:N}/{_storeId:N}/branding/logo/logo.png";
        settings.BannerKey = $"{_tenantId:N}/{_storeId:N}/branding/banner/banner.png";
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

    #region Showcase (carrusel e imágenes del día)

    /// <summary>
    /// Sin imágenes, las dos listas vienen VACÍAS y no `null`. La página pública tiene que poder
    /// preguntar "¿hay carrusel?" con `length > 0` sin comprobar antes que la lista existe: una
    /// tienda recién sincronizada no tiene ninguna y su catálogo debe funcionar exactamente igual que
    /// hoy.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoShowcaseImages_ShouldPublishTwoEmptyLists()
    {
        PublishedStore();
        _settingsRepository.Setup(x => x.GetPublicByStoreIdAsync(_storeId)).ReturnsAsync((StoreCatalogSettings?)null);
        GivenShowcase();

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Should().NotBeNull().And.BeEmpty();
        result.Data.DailyImages.Should().NotBeNull().And.BeEmpty();
    }

    /// <summary>
    /// Las imágenes viajan como URL PÚBLICA del endpoint de media, construida con el slug de la
    /// tienda: es lo que el storefront pone en el `src` y lo que lo sirve sin sesión. La clave cruda
    /// es una ruta interna de almacenamiento y este config lo lee cualquiera que abra el catálogo.
    /// </summary>
    [Fact]
    public async Task Handle_WithACarouselImage_ShouldPublishItsPublicMediaUrlAndCaption()
    {
        PublishedStore("tienda-ana");
        StoreCatalogImage image = ShowcaseImage(StoreCatalogImageKind.Carousel, 0, "Portada");
        GivenShowcase(image);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Should().ContainSingle().Which.Url
            .Should().Be($"/api/v1/public/catalog/tienda-ana/media/{image.Key}");
        result.Data.CarouselImages[0].Caption.Should().Be("Portada");
    }

    [Fact]
    public async Task Handle_WithADailyImage_ShouldPublishItsPublicMediaUrl()
    {
        PublishedStore();
        StoreCatalogImage image = ShowcaseImage(StoreCatalogImageKind.Daily, 0, "Plato del día");
        GivenShowcase(image);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.DailyImages.Should().ContainSingle().Which.Url
            .Should().Be($"/api/v1/public/catalog/tienda-ana/media/{image.Key}");
        result.Data.DailyImages[0].Caption.Should().Be("Plato del día");
    }

    /// <summary>
    /// Los dos conjuntos son independientes (decisión C1): puede tener los dos, solo uno, o ninguno.
    /// Una lista nunca se rellena con lo del otro conjunto.
    /// </summary>
    [Fact]
    public async Task Handle_WithBothSets_ShouldKeepThemSeparated()
    {
        PublishedStore();
        GivenShowcase(
            ShowcaseImage(StoreCatalogImageKind.Carousel, 0),
            ShowcaseImage(StoreCatalogImageKind.Daily, 0));

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Should().ContainSingle();
        result.Data.DailyImages.Should().ContainSingle();
    }

    /// <summary>Puede tener solo un conjunto: el otro sale vacío, no `null` ni con contenido ajeno.</summary>
    [Fact]
    public async Task Handle_WithOnlyCarousel_ShouldPublishTheDailyListAsEmpty()
    {
        PublishedStore();
        GivenShowcase(ShowcaseImage(StoreCatalogImageKind.Carousel, 0));

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Should().ContainSingle();
        result.Data.DailyImages.Should().NotBeNull().And.BeEmpty();
    }

    /// <summary>
    /// El orden que se publica es el que el dueño puso en la vista: el repositorio ya devuelve cada
    /// conjunto ordenado por `OrderIndex` y el config no lo reordena ni lo invierte, así que la
    /// primera imagen del carrusel es la que el dueño puso primera.
    /// </summary>
    [Fact]
    public async Task Handle_WithSeveralCarouselImages_ShouldPublishThemInTheStoredOrder()
    {
        PublishedStore();
        StoreCatalogImage first = ShowcaseImage(StoreCatalogImageKind.Carousel, 0, "uno");
        StoreCatalogImage second = ShowcaseImage(StoreCatalogImageKind.Carousel, 1, "dos");
        GivenShowcase(first, second);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Select(i => i.Url).Should().Equal(
            $"/api/v1/public/catalog/tienda-ana/media/{first.Key}",
            $"/api/v1/public/catalog/tienda-ana/media/{second.Key}");
    }

    /// <summary>El pie de foto es opcional: sin él la imagen se publica igual, con caption null.</summary>
    [Fact]
    public async Task Handle_WithAnImageWithoutCaption_ShouldPublishTheUrlWithANullCaption()
    {
        PublishedStore();
        GivenShowcase(ShowcaseImage(StoreCatalogImageKind.Carousel, 0));

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Should().ContainSingle().Which.Caption.Should().BeNull();
    }

    /// <summary>
    /// Una key en blanco es una key que no existe: se filtra ANTES de construir la URL, o el
    /// storefront recibiría `/media/` y pediría el índice de un directorio.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_WithABlankShowcaseKey_ShouldNotPublishThatImage(string blank)
    {
        PublishedStore();
        StoreCatalogImage image = ShowcaseImage(StoreCatalogImageKind.Carousel, 0);
        typeof(StoreCatalogImage).GetProperty(nameof(StoreCatalogImage.Key))!.SetValue(image, blank);
        GivenShowcase(image);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Should().BeEmpty();
    }

    /// <summary>
    /// Una imagen DESACTIVADA no se publica. Desactivar es "dejar de mostrarla sin perder el
    /// archivo", así que la fila existe y el archivo se queda — pero el catálogo público no la pinta.
    ///
    /// El repositorio ya devuelve solo las activas, así que esta fila no llegaría por HTTP; se monta
    /// a propósito para fijar el CONTRATO del método: que no dependa de un detalle interno de la
    /// lectura. Si esa lectura cambia y empieza a traer inactivas, este test cae.
    /// </summary>
    [Theory]
    [InlineData(StoreCatalogImageKind.Carousel)]
    [InlineData(StoreCatalogImageKind.Daily)]
    public async Task Handle_WithAnInactiveShowcaseImage_ShouldNotPublishIt(StoreCatalogImageKind kind)
    {
        PublishedStore();
        StoreCatalogImage inactive = ShowcaseImage(kind, 0, "apagada");
        inactive.IsActive = false;
        GivenShowcase(inactive);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Should().BeEmpty();
        result.Data.DailyImages.Should().BeEmpty();
    }

    /// <summary>
    /// Desactivar UNA imagen no esconde el resto: solo cae la fila desactivada. Un filtro demasiado
    /// amplio dejaría el carrusel entero vacío y el dueño no sabría por qué.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnInactiveCarouselImage_ShouldStillPublishTheActiveOne()
    {
        PublishedStore();
        StoreCatalogImage active = ShowcaseImage(StoreCatalogImageKind.Carousel, 0, "visible");
        StoreCatalogImage inactive = ShowcaseImage(StoreCatalogImageKind.Carousel, 1, "apagada");
        inactive.IsActive = false;
        GivenShowcase(active, inactive);

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Should().ContainSingle().Which.Url
            .Should().Be($"/api/v1/public/catalog/tienda-ana/media/{active.Key}");
    }

    /// <summary>
    /// Nunca una ruta del servidor. La URL es relativa al endpoint público, sin host ni ruta del
    /// almacenamiento: el config lo lee un anónimo y no puede usarse para localizar archivos en disco.
    /// </summary>
    [Fact]
    public async Task Handle_WithShowcaseImages_ShouldPublishNoServerPath()
    {
        PublishedStore();
        GivenShowcase(ShowcaseImage(StoreCatalogImageKind.Carousel, 0), ShowcaseImage(StoreCatalogImageKind.Daily, 0));

        var result = await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        result.Data!.CarouselImages.Concat(result.Data.DailyImages).Should().OnlyContain(i =>
            i.Url.StartsWith("/api/v1/public/catalog/")
            && !i.Url.Contains(@":\")
            && !i.Url.Contains("storage"));
    }

    /// <summary>
    /// ESTE es el guardián del filtro por tenant, el mismo de la configuración. Las imágenes tienen
    /// filtro global `IsSuperAdmin || TenantId == TenantId`; el anónimo no tiene tenant en el
    /// contexto, así que la lectura DE SESIÓN devolvería VACÍA — sin error ni aviso — y el storefront
    /// nunca vería un carrusel. Si alguien "simplifica" esto y vuelve a `GetByStoreIdAsync`, este test
    /// cae.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldNeverUseTheSessionScopedReadForShowcaseImages()
    {
        PublishedStore();
        GivenShowcase(ShowcaseImage(StoreCatalogImageKind.Carousel, 0));

        await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        _imageRepository.Verify(x => x.GetPublicByStoreIdAsync(_storeId), Times.Once);
        _imageRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>El showcase se lee de la tienda resuelta por el slug, y no se escribe nada.</summary>
    [Fact]
    public async Task Handle_ShouldReadTheShowcaseOfTheStoreResolvedFromTheSlugOnce()
    {
        PublishedStore();
        GivenShowcase();

        await Handler().Handle(new GetPublicOrderingConfigQuery("tienda-ana"), CancellationToken.None);

        _imageRepository.Verify(x => x.GetPublicByStoreIdAsync(_storeId), Times.Once);
        _imageRepository.Verify(x => x.GetPublicByStoreIdAsync(It.Is<Guid>(id => id != _storeId)), Times.Never);
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
        _imageRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    /// <summary>
    /// Un slug inexistente NO lee imágenes: se responde el 404 uniforme antes de tocar nada, para que
    /// el anónimo no pueda usar el endpoint para averiguar qué tiendas tienen catálogo.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnUnknownSlug_ShouldNotReadAnyShowcaseImage()
    {
        Func<Task> act = () => Handler().Handle(new GetPublicOrderingConfigQuery("no-existe"), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _imageRepository.Verify(x => x.GetPublicByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    /// <summary>
    /// El DTO público lleva URL y pie de foto, y NUNCA la clave cruda: `PublicShowcaseImageDto` es lo
    /// que viaja al storefront y una `Key` ahí sería filtrar la estructura del disco.
    /// </summary>
    [Fact]
    public void PublicShowcaseImageDto_ShouldCarryTheUrlAndNeverTheKey()
    {
        string[] properties = typeof(PublicShowcaseImageDto).GetProperties().Select(p => p.Name).ToArray();

        properties.Should().Equal("Url", "Caption");
        properties.Should().NotContain(["Key", "Path", "AbsolutePath"]);
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
