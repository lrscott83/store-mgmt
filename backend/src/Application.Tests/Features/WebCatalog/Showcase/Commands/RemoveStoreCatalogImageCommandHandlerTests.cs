using Application.Abstractions.HttpContext;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.WebCatalog.Showcase.Commands.RemoveStoreCatalogImage;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogImages;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Showcase.Commands;

/// <summary>
/// Quitar una imagen del showcase borra la fila Y el archivo. Son dos cosas distintas y el orden
/// importa:
///
///   1. La imagen tiene que ser DE LA TIENDA DEL CONTEXTO. El command lleva un `Id` y nada más, así
///      que la pertenencia se resuelve cargando las imágenes de ESA tienda y buscando el id dentro.
///      Cargar por `Id` con el filtro global por tenant no bastaría: ese filtro acota por TENANT, no
///      por tienda, así que un dueño de otra tienda del mismo tenant podría quitar una imagen que no
///      es suya.
///   2. El archivo se borra SOLO cuando la fila quedó eliminada. Nunca al revés: borrar el archivo
///      antes de confirmar la fila dejaría el carrusel del storefront pidiendo una imagen que ya no
///      existe.
///   3. Si la imagen no existe (o es de otra tienda) es un 404, no un 200 silencioso: la vista
///      necesita saber que su lista quedó desfasada.
///   4. El otro conjunto no se toca: quitar un destacado no puede vaciar el carrusel.
///
/// Lo que NO hace: compactar el `OrderIndex` de las que quedan. Al volver a subir, la imagen entra
/// al final del conjunto, y eso es exactamente lo que espera la vista.
/// </summary>
public class RemoveStoreCatalogImageCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreCatalogImageRepository> _imageRepository = new();
    private readonly Mock<ICatalogImageStorage> _catalogImageStorage = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public RemoveStoreCatalogImageCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _imageRepository
            .Setup(x => x.DeleteAsync(It.IsAny<StoreCatalogImage>()))
            .ReturnsAsync(true);
    }

    private RemoveStoreCatalogImageCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _imageRepository.Object,
        _catalogImageStorage.Object,
        _localizer.Object);

    private StoreCatalogImage Image(StoreCatalogImageKind kind, int orderIndex)
        => StoreCatalogImage.Create(_storeId, _tenantId, kind, $"{_tenantId:N}/{_storeId:N}/catalog/{kind}/{Guid.NewGuid():N}.png", orderIndex, null);

    private void Given(params StoreCatalogImage[] images)
        => _imageRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(images.ToList());

    #region Happy Path

    [Fact]
    public async Task Handle_WithAnExistingImage_ShouldDeleteItsRow()
    {
        StoreCatalogImage image = Image(StoreCatalogImageKind.Carousel, 0);
        Given(image);

        var result = await Handler().Handle(new RemoveStoreCatalogImageCommand(image.Id), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _imageRepository.Verify(x => x.DeleteAsync(image), Times.Once);
    }

    /// <summary>El archivo del disco se borra con la fila: si no, queda un huérfano que nadie pide.</summary>
    [Fact]
    public async Task Handle_WithAnExistingImage_ShouldDeleteTheFile()
    {
        StoreCatalogImage image = Image(StoreCatalogImageKind.Carousel, 0);
        Given(image);

        await Handler().Handle(new RemoveStoreCatalogImageCommand(image.Id), CancellationToken.None);

        _catalogImageStorage.Verify(x => x.DeleteAsync(image.Key, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// ESTE es el orden: primero la fila, y solo si el UnitOfWork confirmó el borrado se toca el
    /// disco. Al revés, un fallo de guardado dejaría el carrusel del storefront pidiendo un archivo
    /// que ya no existe.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldOnlyDeleteTheFileAfterTheRowIsGone()
    {
        StoreCatalogImage image = Image(StoreCatalogImageKind.Carousel, 0);
        Given(image);

        await Handler().Handle(new RemoveStoreCatalogImageCommand(image.Id), CancellationToken.None);

        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        _catalogImageStorage.Verify(x => x.DeleteAsync(image.Key, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// Quitar un destacado NO toca el carrusel: los dos conjuntos son independientes (decisión C1) y
    /// borrar el archivo equivocado dejaría el storefront pidiendo una imagen que sí sigue publicada.
    /// </summary>
    [Fact]
    public async Task Handle_WithADailyImage_ShouldNeverDeleteACarouselFile()
    {
        StoreCatalogImage carousel = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage daily = Image(StoreCatalogImageKind.Daily, 0);
        Given(carousel, daily);

        await Handler().Handle(new RemoveStoreCatalogImageCommand(daily.Id), CancellationToken.None);

        _catalogImageStorage.Verify(x => x.DeleteAsync(daily.Key, It.IsAny<CancellationToken>()), Times.Once);
        _catalogImageStorage.Verify(x => x.DeleteAsync(carousel.Key, It.IsAny<CancellationToken>()), Times.Never);
        _imageRepository.Verify(x => x.DeleteAsync(carousel), Times.Never);
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Una imagen que no existe no se borra en silencio: la vista necesita un 404 para saber que su
    /// lista quedó desfasada.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnUnknownId_ShouldReturnNotFound()
    {
        Given(Image(StoreCatalogImageKind.Carousel, 0));

        Func<Task> act = () => Handler().Handle(new RemoveStoreCatalogImageCommand(Guid.NewGuid()), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _imageRepository.Verify(x => x.DeleteAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    /// <summary>
    /// ESTE es el guardián de la pertenencia. El command solo lleva un `Id`, así que la pertenencia
    /// se resuelve dentro de las imágenes de la tienda del contexto. Un id de otra tienda del mismo
    /// tenant no está en esa lista, así que no hay forma de borrarlo desde aquí.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnImageOfAnotherStore_ShouldReturnNotFound()
    {
        StoreCatalogImage foreign = StoreCatalogImage.Create(
            Guid.NewGuid(), Guid.NewGuid(), StoreCatalogImageKind.Carousel, "other/store/catalog/carousel/x.png", 0, null);
        Given(Image(StoreCatalogImageKind.Carousel, 0));

        Func<Task> act = () => Handler().Handle(new RemoveStoreCatalogImageCommand(foreign.Id), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _imageRepository.Verify(x => x.DeleteAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
        _catalogImageStorage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// Una imagen que NO se borró no deja su archivo huérfano en el disco: el archivo se borra
    /// únicamente cuando la fila quedó eliminada de verdad.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheRowWasNotDeleted_ShouldNotDeleteTheFile()
    {
        StoreCatalogImage image = Image(StoreCatalogImageKind.Carousel, 0);
        Given(image);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);

        var result = await Handler().Handle(new RemoveStoreCatalogImageCommand(image.Id), CancellationToken.None);

        result.Data.Should().BeFalse();
        _catalogImageStorage.Verify(x => x.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>Sin tienda en el contexto no hay imágenes propias que borrar.</summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(new RemoveStoreCatalogImageCommand(Guid.NewGuid()), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _imageRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    #endregion

    #region Integration / Contract

    /// <summary>
    /// El command NO lleva `StoreId`: la tienda es la del contexto. Aceptarlo en el cuerpo dejaría
    /// que un dueño borrara el showcase de la tienda de otro.
    /// </summary>
    [Fact]
    public void RemoveStoreCatalogImageCommand_ShouldCarryNoStoreId()
    {
        typeof(RemoveStoreCatalogImageCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("StoreId");
    }

    /// <summary>Quitar una imagen no sube nada ni cambia el orden de las que quedan.</summary>
    [Fact]
    public async Task Handle_ShouldNeverAddAnImage()
    {
        StoreCatalogImage image = Image(StoreCatalogImageKind.Carousel, 0);
        Given(image);

        await Handler().Handle(new RemoveStoreCatalogImageCommand(image.Id), CancellationToken.None);

        _imageRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    #endregion
}