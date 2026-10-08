using Application.Abstractions.HttpContext;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.Features.WebCatalog.Showcase.Queries.GetStoreCatalogImages;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogImages;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Showcase.Queries;

/// <summary>
/// Listado del SHOWCASE (carrusel e imágenes del día) en la vista Catálogo Web. Contrato:
///
///   1. Es una lectura EN SESIÓN (`GetByStoreIdAsync`), no la pública: el filtro global por tenant
///      del `ApplicationDbContext` es lo que confina la gestión a la tienda del contexto.
///   2. Viene AGRUPADO por conjunto, porque la decisión del Owner (C1) son DOS conjuntos
///      INDEPENDIENTES: puede tener los dos, solo uno, o ninguno. Un array plano obligaría al
///      frontend a particionarlo y a conocer los valores del enum.
///   3. Los dos conjuntos están SIEMPRE presentes, aunque estén vacíos: `null` y `[]` no son lo
///      mismo para una vista que va a renderizar dos secciones.
///   4. Devuelve CLAVES, no URLs, por la misma razón que la marca (F8): la URL pública la compone
///      el config anónimo con el slug, y aquí sería una ruta de almacenamiento expuesta.
///   5. Una tienda sin imágenes NO es un 404: es una tienda recién sincronizada, igual que una sin
///      marca.
/// </summary>
public class GetStoreCatalogImagesQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreCatalogImageRepository> _imageRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public GetStoreCatalogImagesQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _imageRepository.Setup(x => x.GetByStoreIdAsync(It.IsAny<Guid>())).ReturnsAsync([]);
    }

    private GetStoreCatalogImagesQueryHandler Handler() => new(
        _httpContextService.Object,
        _imageRepository.Object,
        _localizer.Object);

    private StoreCatalogImage Image(StoreCatalogImageKind kind, int orderIndex, string? caption = null)
    {
        StoreCatalogImage image = StoreCatalogImage.Create(
            _storeId, _tenantId, kind, $"{_tenantId:N}/{_storeId:N}/catalog/{kind.ToString().ToLowerInvariant()}/{Guid.NewGuid():N}.png", orderIndex, caption);
        return image;
    }

    private void Given(params StoreCatalogImage[] images)
        => _imageRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(images.ToList());

    #region Happy Path

    /// <summary>
    /// Tienda recién sincronizada: tiene catálogo y todavía no tocó el showcase. Son dos listas
    /// vacías, no un 404 — igual que la marca (F8) y la configuración de pedidos (F1).
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheStoreHasNoImages_ShouldReturnTwoEmptySets()
    {
        var result = await Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Carousel.Should().NotBeNull().And.BeEmpty();
        result.Data.Daily.Should().NotBeNull().And.BeEmpty();
    }

    /// <summary>
    /// Los dos conjuntos son independientes (decisión C1): tener los dos es el caso normal de un
    /// restaurante y cada lista sale con lo suyo, sin mezclarse.
    /// </summary>
    [Fact]
    public async Task Handle_WithBothSets_ShouldReturnThemSeparated()
    {
        Given(
            Image(StoreCatalogImageKind.Carousel, 0, "Portada"),
            Image(StoreCatalogImageKind.Daily, 0, "Plato del día"));

        var result = await Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        result.Data!.Carousel.Should().HaveCount(1);
        result.Data.Carousel[0].Caption.Should().Be("Portada");
        result.Data.Daily.Should().HaveCount(1);
        result.Data.Daily[0].Caption.Should().Be("Plato del día");
        result.Data.Carousel.Should().NotContain(i => i.Kind == StoreCatalogImageKind.Daily);
    }

    /// <summary>Puede tener solo uno: el otro conjunto sale vacío, no null.</summary>
    [Fact]
    public async Task Handle_WithOnlyCarousel_ShouldReturnTheDailySetAsEmpty()
    {
        Given(Image(StoreCatalogImageKind.Carousel, 0));

        var result = await Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        result.Data!.Carousel.Should().HaveCount(1);
        result.Data.Daily.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public async Task Handle_WithOnlyDaily_ShouldReturnTheCarouselSetAsEmpty()
    {
        Given(Image(StoreCatalogImageKind.Daily, 0));

        var result = await Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        result.Data!.Carousel.Should().NotBeNull().And.BeEmpty();
        result.Data.Daily.Should().HaveCount(1);
    }

    /// <summary>
    /// El orden que se publica es el que el dueño ve en la vista: dentro de un conjunto, por
    /// `OrderIndex`. El repositorio ya devuelve la lista ordenada; esta vista no la reordena ni la
    /// invierte, así que el "subir/bajar" de la vista y el carrusel del storefront cuentan lo mismo.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnEachSetInTheOrderTheRepositoryGaveIt()
    {
        StoreCatalogImage first = Image(StoreCatalogImageKind.Carousel, 0, "uno");
        StoreCatalogImage second = Image(StoreCatalogImageKind.Carousel, 1, "dos");
        StoreCatalogImage third = Image(StoreCatalogImageKind.Carousel, 2, "tres");
        Given(first, second, third);

        var result = await Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        result.Data!.Carousel.Select(i => i.Caption).Should().Equal("uno", "dos", "tres");
        result.Data.Carousel.Select(i => i.OrderIndex).Should().Equal(0, 1, 2);
    }

    /// <summary>Cada imagen viaja con su id: el quitar y el reordenar de la vista lo necesitan.</summary>
    [Fact]
    public async Task Handle_ShouldReturnTheIdOfEveryImage()
    {
        StoreCatalogImage image = Image(StoreCatalogImageKind.Carousel, 0);
        Given(image);

        var result = await Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        result.Data!.Carousel.Should().ContainSingle().Which.Id.Should().Be(image.Id);
    }

    #endregion

    #region Keys, not URLs

    /// <summary>
    /// La vista de gestión recibe CLAVES. La URL pública la compone el config anónimo (F1) con el
    /// slug, que es el único que sabe resolverlo; devolverla aquí además filtraría la ruta interna de
    /// almacenamiento a la vista del dueño sin ningún beneficio.
    /// </summary>
    [Fact]
    public void StoreCatalogImageDto_ShouldCarryTheKeyAndNoUrl()
    {
        string[] properties = typeof(StoreCatalogImageDto).GetProperties().Select(p => p.Name).ToArray();

        properties.Should().Contain(["Id", "Kind", "Key", "OrderIndex", "Caption", "IsActive"]);
        properties.Should().NotContain(["Url", "MediaUrl", "AbsolutePath"]);
    }

    #endregion

    #region Integration / Contract

    /// <summary>
    /// Lectura EN SESSION a propósito. Es lo que confina la gestión a la tienda del contexto; la
    /// lectura pública existe para el anónimo (el storefront) y aquí no debe usarse.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReadTheImagesOfTheStoreInContextOnce()
    {
        await Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        _imageRepository.Verify(x => x.GetByStoreIdAsync(_storeId), Times.Once);
        _imageRepository.Verify(x => x.GetPublicByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
        _imageRepository.Verify(x => x.GetByStoreIdAsync(It.Is<Guid>(id => id != _storeId)), Times.Never);
    }

    /// <summary>Es una lectura: no escribe ni borra nada.</summary>
    [Fact]
    public async Task Handle_ShouldNeverWrite()
    {
        await Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
        _imageRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
        _imageRepository.Verify(x => x.DeleteAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Sin tienda en el contexto no hay imágenes que leer: no se adivina la tienda ni se leen las de
    /// otra. Se rechaza antes de tocar el repositorio.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new GetStoreCatalogImagesQuery(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _imageRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    #endregion
}
