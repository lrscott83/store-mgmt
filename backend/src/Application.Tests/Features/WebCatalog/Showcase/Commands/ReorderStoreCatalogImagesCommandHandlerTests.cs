using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.WebCatalog.Showcase.Commands.ReorderStoreCatalogImages;
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
/// Reordenar el showcase es escribir el orden FINAL de UN conjunto, no mover una imagen a una
/// posición: `OrderedIds` es la lista completa y en el orden en que debe verse. Es la misma forma que
/// usa el reordenado de la galería de producto, y por el mismo motivo — mover "de la 2 a la 1"
/// obliga al cliente a calcular el desplazamiento de todo lo demás.
///
/// Lo que este suite fija:
///
///   1. El `OrderIndex` resultante es la POSICIÓN en la lista enviada, empezando en 0. Si se
///      guardara un desplazamiento en lugar de una posición, quitar una imagen dejaría huecos y dos
///      imágenes empatadas.
///   2. Los ids tienen que ser los del CONJUNTO de la tienda del contexto. Un id de otro conjunto o
///      de otra tienda se rechaza: aceptarlo movería una imagen de las imágenes del día dentro del
///      carrusel.
///   3. La lista debe ser el conjunto COMPLETO. Un subconjunto movería esas imágenes y dejaría las
///      demás con un orden que ya nadie eligió; una lista con repetidos crearía dos imágenes en la
///      misma posición.
///   4. Un conjunto vacío no se reordena: no hay nada que mover.
///   5. Un conjunto que no existe en el enum no se reordena.
///
/// Y lo que NO hace: tocar el otro conjunto. Reordenar el carrusel no mueve las imágenes del día.
/// </summary>
public class ReorderStoreCatalogImagesCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreCatalogImageRepository> _imageRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    /// <summary>Las filas tal como quedaron TRAS el handler, para comprobar los `OrderIndex`.</summary>
    private readonly List<StoreCatalogImage> _rows = [];

    public ReorderStoreCatalogImagesCommandHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _imageRepository.Setup(x => x.GetByStoreIdAsync(It.IsAny<Guid>())).ReturnsAsync([]);
        _imageRepository
            .Setup(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()))
            .Returns((StoreCatalogImage i) =>
            {
                if (!_rows.Contains(i))
                    _rows.Add(i);

                return Task.FromResult(true);
            });
    }

    private ReorderStoreCatalogImagesCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _imageRepository.Object,
        _localizer.Object);

    private StoreCatalogImage Image(StoreCatalogImageKind kind, int orderIndex, Guid? storeId = null, Guid? tenantId = null)
        => StoreCatalogImage.Create(storeId ?? _storeId, tenantId ?? _tenantId, kind, $"{_tenantId:N}/{_storeId:N}/catalog/{kind}/{Guid.NewGuid():N}.png", orderIndex, null);

    private void Given(params StoreCatalogImage[] images)
        => _imageRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(images.ToList());

    private int OrderOf(Guid id) => _rows.Single(r => r.Id == id).OrderIndex;

    #region Happy Path

    [Fact]
    public async Task Handle_WithTheFullList_ShouldReassignTheOrderIndexByPosition()
    {
        StoreCatalogImage a = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage b = Image(StoreCatalogImageKind.Carousel, 1);
        StoreCatalogImage c = Image(StoreCatalogImageKind.Carousel, 2);
        Given(a, b, c);

        var result = await Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [c.Id, a.Id, b.Id]),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        OrderOf(c.Id).Should().Be(0);
        OrderOf(a.Id).Should().Be(1);
        OrderOf(b.Id).Should().Be(2);
    }

    /// <summary>
    /// ESTE es el motivo de reescribir TODOS los `OrderIndex` y no solo los que cambian: si solo se
    /// tocara la imagen movida, la que ocupaba su lugar se quedaría con el mismo índice y las dos
    /// quedarían empatadas en el carrusel.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldRewriteEveryOrderIndexOfTheSet()
    {
        StoreCatalogImage a = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage b = Image(StoreCatalogImageKind.Carousel, 1);
        Given(a, b);

        await Handler().Handle(new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [b.Id, a.Id]), CancellationToken.None);

        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Exactly(2));
    }

    /// <summary>El guardado real lo hace el UnitOfWork, una vez, después de reasignar.</summary>
    [Fact]
    public async Task Handle_ShouldPersistThroughTheUnitOfWork()
    {
        StoreCatalogImage a = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage b = Image(StoreCatalogImageKind.Carousel, 1);
        Given(a, b);

        await Handler().Handle(new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [b.Id, a.Id]), CancellationToken.None);

        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// Reordenar el carrusel NO mueve las imágenes del día. Los conjuntos son independientes
    /// (decisión C1), así que el orden del uno no puede cambiar el del otro.
    /// </summary>
    [Fact]
    public async Task Handle_WithTheCarouselSet_ShouldNeverTouchTheDailySet()
    {
        StoreCatalogImage a = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage b = Image(StoreCatalogImageKind.Carousel, 1);
        StoreCatalogImage daily = Image(StoreCatalogImageKind.Daily, 0);
        Given(a, b, daily);

        var result = await Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [b.Id, a.Id]),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Exactly(2));
        _rows.Should().NotContain(daily);
    }

    /// <summary>Una sola imagen del conjunto: reenviarla es un PUT idempotente.</summary>
    [Fact]
    public async Task Handle_WithASingleImage_ShouldKeepItAtZero()
    {
        StoreCatalogImage only = Image(StoreCatalogImageKind.Daily, 0);
        Given(only);

        var result = await Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Daily, [only.Id]), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        OrderOf(only.Id).Should().Be(0);
    }

    #endregion

    #region Reorder validation

    /// <summary>
    /// Una lista incompleta movería esas imágenes y dejaría las demás con un orden que ya nadie
    /// eligió. Se rechaza en vez de aplicarse a medias.
    /// </summary>
    [Fact]
    public async Task Handle_WithAFewerIdThanImagesInTheSet_ShouldReject()
    {
        StoreCatalogImage a = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage b = Image(StoreCatalogImageKind.Carousel, 1);
        Given(a, b);

        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [b.Id]), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    /// <summary>
    /// Una lista más larga que el conjunto incluye ids que no son de la tienda o del conjunto: sin
    /// validación se aceptaría y las imágenes ajenas quedarían desplazadas sin querer.
    /// </summary>
    [Fact]
    public async Task Handle_WithMoreIdsThanImagesInTheSet_ShouldReject()
    {
        StoreCatalogImage a = Image(StoreCatalogImageKind.Carousel, 0);
        Given(a);

        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [a.Id, Guid.NewGuid()]),
            CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    /// <summary>
    /// Un id repetido pondría dos imágenes en la misma posición y dejaría a otra fuera del conjunto.
    /// El conjunto de ids tiene que ser el MISMO conjunto de la lista.
    /// </summary>
    [Fact]
    public async Task Handle_WithADuplicatedId_ShouldReject()
    {
        StoreCatalogImage a = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage b = Image(StoreCatalogImageKind.Carousel, 1);
        Given(a, b);

        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [a.Id, a.Id]), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    /// <summary>
    /// Un id del OTRO conjunto no se reordena aquí: mover una imagen del día dentro del carrusel la
    /// sacaría del bloque de destacadas y la pondría en la cabecera.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnIdOfTheOtherSet_ShouldReject()
    {
        StoreCatalogImage carousel = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage daily = Image(StoreCatalogImageKind.Daily, 0);
        Given(carousel, daily);

        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [daily.Id]), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    /// <summary>
    /// ESTE es el guardián de la pertenencia por tienda. La lista se resuelve contra las imágenes de
    /// la tienda del contexto, así que un id de otra tienda del mismo tenant nunca aparece en ella y
    /// el reordenado se rechaza.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnIdOfAnotherStore_ShouldReject()
    {
        StoreCatalogImage mine = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage foreign = Image(StoreCatalogImageKind.Carousel, 1, storeId: Guid.NewGuid());
        Given(mine);

        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [mine.Id, foreign.Id]),
            CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    /// <summary>Un conjunto vacío no tiene nada que reordenar: no es una petición que hacer.</summary>
    [Fact]
    public async Task Handle_WithAnEmptyList_ShouldReject()
    {
        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, []), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    /// <summary>
    /// Una lista `null` es lo mismo que una vacía desde el JSON. Sin esta guarda, un `null`
    /// deserializado devolvería una excepción que no es un 400 del dominio.
    /// </summary>
    [Fact]
    public async Task Handle_WithANullList_ShouldReject()
    {
        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, null!), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    /// <summary>Un conjunto que no existe en el enum no se reordena: no hay imágenes a las que mover.</summary>
    [Fact]
    public async Task Handle_WithAnUndefinedKind_ShouldReject()
    {
        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand((StoreCatalogImageKind)99, [Guid.NewGuid()]), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _imageRepository.Verify(x => x.UpdateAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    #endregion

    #region Integration / Contract

    /// <summary>
    /// El command NO lleva `StoreId`: la tienda es la del contexto. Aceptarlo en el cuerpo dejaría que
    /// un dueño reordenara el showcase de la tienda de otro.
    /// </summary>
    [Fact]
    public void ReorderStoreCatalogImagesCommand_ShouldCarryNoStoreId()
    {
        typeof(ReorderStoreCatalogImagesCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("StoreId");
    }

    /// <summary>Reordenar no sube ni borra imágenes: solo cambia el orden.</summary>
    [Fact]
    public async Task Handle_ShouldNeverAddOrDelete()
    {
        StoreCatalogImage a = Image(StoreCatalogImageKind.Carousel, 0);
        StoreCatalogImage b = Image(StoreCatalogImageKind.Carousel, 1);
        Given(a, b);

        await Handler().Handle(new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [b.Id, a.Id]), CancellationToken.None);

        _imageRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
        _imageRepository.Verify(x => x.DeleteAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    #endregion

    #region Error Handling

    /// <summary>Sin tienda en el contexto no hay imágenes propias que reordenar.</summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(
            new ReorderStoreCatalogImagesCommand(StoreCatalogImageKind.Carousel, [Guid.NewGuid()]), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _imageRepository.Verify(x => x.GetByStoreIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    #endregion
}