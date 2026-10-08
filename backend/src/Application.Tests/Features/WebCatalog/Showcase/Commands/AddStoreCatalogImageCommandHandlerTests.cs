using Application.Abstractions.HttpContext;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.WebCatalog.Showcase;
using Application.Features.WebCatalog.Showcase.Commands.AddStoreCatalogImage;
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
/// Subir una imagen al showcase tiene seis responsabilidades que este suite fija, y una ausencia que
/// importa más que las seis:
///
///   1. Tope de 10 por CONJUNTO, no 10 en total. Los dos conjuntos son independientes (decisión C1),
///      así que un tope compartido dejaría a una tienda con 10 de carril sin poder destacar nada.
///      Y el tope se cuenta por conjunto: cambiar de conjunto empieza de cero.
///   2. Se valida el archivo con las MISMAS reglas que las imágenes de producto (jpg/jpeg/png/webp y
///      2 MB) y ANTES de subir nada. Un archivo inválido no deja un archivo huérfano en disco.
///   3. La tienda es la del CONTEXTO. El comando no lleva `StoreId`: aceptarlo en el cuerpo dejaría
///      que un dueño escribiera el showcase de la tienda de otro.
///   4. La fila nace con el siguiente `OrderIndex`, no con 0 siempre: subir dos imágenes al carrusel
///      sin tocar el orden tiene que dejarlas en el orden en que se subieron.
///   5. Devuelve la clave que devuelve el almacenamiento, con `kind` de carpeta, y persiste la fila
///      a través del UnitOfWork.
///   6. El `Kind` tiene que ser un valor del enum: un conjunto inventado escribiría una fila que el
///      catálogo público nunca publica y que la vista no puede quitar.
///
/// Y lo que NO hace: decidir el otro conjunto. Subir un destacado no toca el carrusel.
/// </summary>
public class AddStoreCatalogImageCommandHandlerTests
{
    private const string SavedKey = "tenant/store/catalog/carousel/new.png";

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IStoreCatalogImageRepository> _imageRepository = new();
    private readonly Mock<ICatalogImageStorage> _catalogImageStorage = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    /// <summary>Lo que realmente se pasó al repositorio, para inspeccionarlo después.</summary>
    private StoreCatalogImage? _persisted;

    public AddStoreCatalogImageCommandHandlerTests()
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
            .Setup(x => x.AddAsync(It.IsAny<StoreCatalogImage>()))
            .Returns((StoreCatalogImage i) => Task.FromResult(i))
            .Callback<StoreCatalogImage>(i => _persisted = i);

        _catalogImageStorage
            .Setup(x => x.SaveCatalogImageAsync(
                It.IsAny<CatalogImageUpload>(),
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(SavedKey);
    }

    private AddStoreCatalogImageCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _imageRepository.Object,
        _catalogImageStorage.Object,
        _localizer.Object);

    /// <summary>Archivo válido: png de 1 KB. Los bytes no se miran, solo la cabecera.</summary>
    private static Stream ValidContent(int length = 1024) => new MemoryStream(new byte[length]);

    private AddStoreCatalogImageCommand Command(
        StoreCatalogImageKind kind = StoreCatalogImageKind.Carousel,
        string fileName = "carrusel.png",
        string contentType = "image/png",
        long length = 1024,
        string? caption = null)
        => new(kind, ValidContent((int)length), fileName, contentType, length, caption);

    private void Given(params StoreCatalogImage[] images)
        => _imageRepository.Setup(x => x.GetByStoreIdAsync(_storeId)).ReturnsAsync(images.ToList());

    private StoreCatalogImage Existing(StoreCatalogImageKind kind, int orderIndex)
        => StoreCatalogImage.Create(_storeId, _tenantId, kind, $"{_tenantId:N}/{_storeId:N}/catalog/{kind}/{Guid.NewGuid():N}.png", orderIndex, null);

    #region Happy Path

    [Fact]
    public async Task Handle_WithAValidFile_ShouldPersistTheImageForTheStoreInContext()
    {
        var result = await Handler().Handle(Command(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        _persisted.Should().NotBeNull();
        _persisted!.StoreId.Should().Be(_storeId);
        _persisted.TenantId.Should().Be(_tenantId);
        _persisted.Kind.Should().Be(StoreCatalogImageKind.Carousel);
        _persisted.Key.Should().Be(SavedKey);
    }

    /// <summary>
    /// El archivo se guarda en la carpeta del CONJUNTO, no en una genérica: la clave es lo que se
    /// persiste y lo que el endpoint público resuelve, así que tiene que decir de qué imagen se trata.
    /// </summary>
    [Theory]
    [InlineData(StoreCatalogImageKind.Carousel, ShowcaseImageKinds.Carousel)]
    [InlineData(StoreCatalogImageKind.Daily, ShowcaseImageKinds.Daily)]
    public async Task Handle_ShouldSaveTheFileUnderTheFolderOfItsSet(StoreCatalogImageKind kind, string expectedFolder)
    {
        await Handler().Handle(Command(kind), CancellationToken.None);

        _catalogImageStorage.Verify(x => x.SaveCatalogImageAsync(
            It.IsAny<CatalogImageUpload>(), _tenantId, _storeId, expectedFolder, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    /// <summary>La primera imagen del conjunto entra en la posición 0: no hay hueco antes.</summary>
    [Fact]
    public async Task Handle_WhenTheSetIsEmpty_ShouldStartAtOrderZero()
    {
        var result = await Handler().Handle(Command(), CancellationToken.None);

        _persisted!.OrderIndex.Should().Be(0);
        result.Data!.OrderIndex.Should().Be(0);
    }

    /// <summary>
    /// Subir dos imágenes sin tocar el orden tiene que dejarlas en el orden en que se subieron. Un
    /// `OrderIndex` siempre a 0 las dejaría empatadas y el storefront no sabría cuál va primero.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheSetAlreadyHasImages_ShouldAppendAfterTheLastOne()
    {
        Given(Existing(StoreCatalogImageKind.Carousel, 0), Existing(StoreCatalogImageKind.Carousel, 1));

        var result = await Handler().Handle(Command(), CancellationToken.None);

        _persisted!.OrderIndex.Should().Be(2);
        result.Data!.OrderIndex.Should().Be(2);
    }

    /// <summary>
    /// Un hueco en medio (imagen borrada, por ejemplo) no se rellena: se entra al final. Rellenar el
    /// hueco exigiría compactar el resto, y esa operación no existe en esta feature.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheSetHasAGap_ShouldStillAppendAfterTheHighestOrder()
    {
        Given(Existing(StoreCatalogImageKind.Carousel, 0), Existing(StoreCatalogImageKind.Carousel, 5));

        await Handler().Handle(Command(), CancellationToken.None);

        _persisted!.OrderIndex.Should().Be(6);
    }

    /// <summary>El pie de foto es opcional y viaja tal cual.</summary>
    [Fact]
    public async Task Handle_WithACaption_ShouldPersistIt()
    {
        var result = await Handler().Handle(Command(caption: "Menú de la casa"), CancellationToken.None);

        _persisted!.Caption.Should().Be("Menú de la casa");
        result.Data!.Caption.Should().Be("Menú de la casa");
    }

    [Fact]
    public async Task Handle_WithoutACaption_ShouldPersistNull()
    {
        await Handler().Handle(Command(caption: null), CancellationToken.None);

        _persisted!.Caption.Should().BeNull();
    }

    /// <summary>La fila nace ACTIVA: el dueño la subió para que se viera, no para esconderla.</summary>
    [Fact]
    public async Task Handle_ShouldCreateTheRowActive()
    {
        await Handler().Handle(Command(), CancellationToken.None);

        _persisted!.IsActive.Should().BeTrue();
    }

    /// <summary>El id lo genera el dominio, no el cliente: nadie elige la clave de otra tienda.</summary>
    [Fact]
    public async Task Handle_ShouldCreateItsOwnId()
    {
        await Handler().Handle(Command(), CancellationToken.None);

        _persisted!.Id.Should().NotBe(Guid.Empty);
    }

    #endregion

    #region The two sets are independent

    /// <summary>
    /// ESTE es el test de la decisión C1: el tope y el orden son POR CONJUNTO. El carrusel lleno no
    /// bloquea las imágenes del día.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheCarouselIsFull_ShouldStillAcceptADailyImage()
    {
        Given(Enumerable.Range(0, StoreCatalogImage.MaxImagesPerKind)
            .Select(i => Existing(StoreCatalogImageKind.Carousel, i))
            .ToArray());

        var result = await Handler().Handle(Command(StoreCatalogImageKind.Daily), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted!.Kind.Should().Be(StoreCatalogImageKind.Daily);
        _persisted.OrderIndex.Should().Be(0);
    }

    /// <summary>Las imágenes del día tampoco cuentan las del carrusel: cada conjunto llega a su tope.</summary>
    [Fact]
    public async Task Handle_WhenTheDailySetIsFull_ShouldStillAcceptACarouselImage()
    {
        Given(Enumerable.Range(0, StoreCatalogImage.MaxImagesPerKind)
            .Select(i => Existing(StoreCatalogImageKind.Daily, i))
            .ToArray());

        var result = await Handler().Handle(Command(StoreCatalogImageKind.Carousel), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted!.OrderIndex.Should().Be(0);
    }

    /// <summary>
    /// Subir un destacado no toca el carrusel. Los conjuntos son independientes de verdad, no dos
    /// listas de la misma fila.
    /// </summary>
    [Fact]
    public async Task Handle_WithADailyImage_ShouldNeverWriteToTheCarouselSet()
    {
        Given(Existing(StoreCatalogImageKind.Carousel, 0));

        await Handler().Handle(Command(StoreCatalogImageKind.Daily), CancellationToken.None);

        _persisted!.Kind.Should().Be(StoreCatalogImageKind.Daily);
    }

    #endregion

    #region The cap

    /// <summary>
    /// El tope de 10 por conjunto: a partir de ahí el dueño tiene que quitar o reordenar. Sin él, el
    /// carrusel se convertiría en una galería sin fin que el storefront tiene que cargar entero.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheSetIsFull_ShouldRejectWithBadRequest()
    {
        Given(Enumerable.Range(0, StoreCatalogImage.MaxImagesPerKind)
            .Select(i => Existing(StoreCatalogImageKind.Carousel, i))
            .ToArray());

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }

    /// <summary>El tope es de 10, no de 9: la décima imagen entra.</summary>
    [Fact]
    public async Task Handle_WithNineImages_ShouldAcceptTheTenth()
    {
        Given(Enumerable.Range(0, StoreCatalogImage.MaxImagesPerKind - 1)
            .Select(i => Existing(StoreCatalogImageKind.Carousel, i))
            .ToArray());

        var result = await Handler().Handle(Command(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _persisted!.OrderIndex.Should().Be(StoreCatalogImage.MaxImagesPerKind - 1);
    }

    /// <summary>
    /// Al topear NO se sube el archivo. Contar después de guardar dejaría en disco un archivo que
    /// ninguna fila referencia y que nadie va a volver a pedir.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheSetIsFull_ShouldNotSaveTheFile()
    {
        Given(Enumerable.Range(0, StoreCatalogImage.MaxImagesPerKind)
            .Select(i => Existing(StoreCatalogImageKind.Carousel, i))
            .ToArray());

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _catalogImageStorage.Verify(
            x => x.SaveCatalogImageAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _imageRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    #endregion

    #region File validation

    /// <summary>
    /// Un formato que no es imagen se rechaza con 400 y localizado antes de subir NADA: el showcase no
    /// es una puerta distinta al contenido del catálogo.
    /// </summary>
    [Theory]
    [InlineData("carrusel.txt", "text/plain")]
    [InlineData("carrusel.gif", "image/gif")]
    [InlineData("carrusel", "application/octet-stream")]
    public async Task Handle_WithAnInvalidFile_ShouldRejectWithoutSavingAnything(string fileName, string contentType)
    {
        Func<Task> act = () => Handler().Handle(Command(fileName: fileName, contentType: contentType), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _catalogImageStorage.Verify(
            x => x.SaveCatalogImageAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _imageRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    /// <summary>El límite de tamaño es el de las imágenes de producto: 2 MB.</summary>
    [Fact]
    public async Task Handle_WithAFileOverTheSizeLimit_ShouldRejectWithoutSavingAnything()
    {
        Func<Task> act = () => Handler().Handle(
            Command(fileName: "carrusel.png", contentType: "image/png", length: 2 * 1024 * 1024 + 1), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _catalogImageStorage.Verify(
            x => x.SaveCatalogImageAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    /// <summary>
    /// Un archivo de longitud 0 es lo que deja el binding cuando el multipart no trae nada, así que
    /// tiene que ser un 400 y no una fila con una clave que no apunta a ningún archivo.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnEmptyFile_ShouldRejectWithoutSavingAnything()
    {
        Func<Task> act = () => Handler().Handle(Command(length: 0), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>();
        _imageRepository.Verify(x => x.AddAsync(It.IsAny<StoreCatalogImage>()), Times.Never);
    }

    #endregion

    #region Integration / Contract

    /// <summary>El guardado real lo hace el UnitOfWork, una vez, después del alta.</summary>
    [Fact]
    public async Task Handle_ShouldPersistThroughTheUnitOfWork()
    {
        await Handler().Handle(Command(), CancellationToken.None);

        _unitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>
    /// NO lleva `StoreId` en el cuerpo. La tienda es la del contexto; aceptarla dejaría que un dueño
    /// escribiera el showcase de la tienda de otro.
    /// </summary>
    [Fact]
    public void AddStoreCatalogImageCommand_ShouldCarryNoStoreId()
    {
        typeof(AddStoreCatalogImageCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(["StoreId", "Id"]);
    }

    /// <summary>
    /// El command solo valida la FORMA (conjunto, pie de foto, archivo presente). El formato y el
    /// tamaño los comprueba el handler con `CatalogImageUploadRules`, igual que la marca (F8): un
    /// validador que leyera el `Stream` mezclaría dos capas y dejaría dos juegos de reglas que
    /// divergirían.
    /// </summary>
    [Fact]
    public async Task Handle_WithAnInvalidFile_ShouldBeRejectedByTheHandlerRulesNotByTheValidator()
    {
        var validator = new AddStoreCatalogImageCommandValidator(_localizer.Object);

        var validation = validator.Validate(Command(fileName: "carrusel.txt", contentType: "text/plain"));

        validation.IsValid.Should().BeTrue("el formato del archivo no lo decide el validador");
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// Sin tienda en el contexto no hay showcase al que añadir: no se adivina la tienda ni se escribe
    /// en la de otro. Se rechaza antes de subir un solo archivo.
    /// </summary>
    [Fact]
    public async Task Handle_WithoutAStoreInContext_ShouldReportBadRequest()
    {
        _httpContextService.Setup(x => x.StoreId).Returns(string.Empty);

        Func<Task> act = () => Handler().Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        _catalogImageStorage.Verify(
            x => x.SaveCatalogImageAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    #endregion
}