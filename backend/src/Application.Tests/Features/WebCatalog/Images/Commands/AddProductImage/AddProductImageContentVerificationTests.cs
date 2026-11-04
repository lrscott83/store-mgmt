using Application.Abstractions.HttpContext;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.Features.WebCatalog.Images.Commands.AddProductImage;
using Application.UnitOfWorks;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.WebCatalog.Images.Commands.AddProductImage;

/// <summary>
/// Una imagen del catálogo se acepta por lo que ES, no por lo que dice ser.
///
/// La extensión y el `Content-Type` los elige quien sube: renombrar cualquier archivo a `.png` y
/// declararlo `image/png` bastaba para entrar. Estas pruebas fijan las dos mitades de la regla:
///
///   1. La extensión sigue siendo obligatoria —un PNG de verdad llamado `.txt` sigue siendo 400—,
///      porque es lo que el almacenamiento usa para servir el archivo después.
///   2. Y además la CABECERA tiene que ser la de un JPEG, un PNG o un WebP. Un archivo de texto
///      llamado `.png` es 400, y el 400 llega ANTES de escribir nada: ni fila, ni archivo en disco.
///
/// Lo que NO se prueba aquí: el tope de 2 MB ni el de 6 imágenes por producto. Ya están fijados en
/// las pruebas del handler y este archivo no los toca.
/// </summary>
public class AddProductImageContentVerificationTests
{
    private const string SavedKey = "tenant/store/product/subida.png";

    /// <summary>Cabecera JPEG mínima: SOI + inicio de segmento.</summary>
    private static readonly byte[] JpegHead =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01 };

    /// <summary>Cabecera PNG mínima: los 8 bytes fijos + inicio del chunk IHDR.</summary>
    private static readonly byte[] PngHead =
        { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D };

    /// <summary>Cabecera WebP mínima: "RIFF", tamaño y "WEBP".</summary>
    private static readonly byte[] WebpHead =
        { 0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50 };

    /// <summary>Texto plano: no es la cabecera de ningún formato aceptado.</summary>
    private static readonly byte[] NotAnImage = "no soy una imagen"u8.ToArray();

    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IProductImageRepository> _productImageRepository = new();
    private readonly Mock<IProductCategoryRepository> _productCategoryRepository = new();
    private readonly Mock<ICatalogImageStorage> _catalogImageStorage = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();

    private readonly Product _product;

    public AddProductImageContentVerificationTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _product = Product.Create("Camisa", _categoryId, 100m, 1, true, true, "B-1", _tenantId);

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _productRepository.Setup(x => x.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(_product);
        _productRepository.Setup(x => x.UpdateAsync(It.IsAny<Product>())).ReturnsAsync(true);
        _productCategoryRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(ProductCategory.Create(_categoryId, _storeId, "Ropa", 1, _tenantId));
        _productImageRepository
            .Setup(x => x.GetByProductIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(new List<ProductImage>());
        _productImageRepository
            .Setup(x => x.AddAsync(It.IsAny<ProductImage>()))
            .ReturnsAsync((ProductImage image) => image);
        _catalogImageStorage
            .Setup(x => x.SaveAsync(
                It.IsAny<CatalogImageUpload>(),
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(SavedKey);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
    }

    private AddProductImageCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _productRepository.Object,
        _productImageRepository.Object,
        _productCategoryRepository.Object,
        _catalogImageStorage.Object,
        _localizer.Object);

    private static AddProductImageCommand Command(byte[] bytes, string fileName, string contentType)
        => new(Guid.Empty, new MemoryStream(bytes), fileName, contentType, bytes.Length);

    #region Formato real aceptado

    /// <summary>Un JPEG, un PNG y un WebP de verdad entran: el archivo se guarda y la fila se crea.</summary>
    [Theory]
    [InlineData("foto.jpg", "image/jpeg")]
    [InlineData("foto.png", "image/png")]
    [InlineData("foto.webp", "image/webp")]
    public async Task Handle_WithARealImage_ShouldStoreIt(string fileName, string contentType)
    {
        byte[] bytes = fileName.EndsWith(".png", StringComparison.Ordinal) ? PngHead
            : fileName.EndsWith(".webp", StringComparison.Ordinal) ? WebpHead
            : JpegHead;

        var result = await Handler().Handle(Command(bytes, fileName, contentType), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().Be(SavedKey);
        _catalogImageStorage.Verify(x => x.SaveAsync(
            It.IsAny<CatalogImageUpload>(), _tenantId, _storeId, It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Once);
        _productImageRepository.Verify(x => x.AddAsync(It.IsAny<ProductImage>()), Times.Once);
    }

    /// <summary>
    /// La cabecera se mira SIN comerse los bytes: lo que se guarda es el archivo entero, no lo que
    /// quedó después de leer los primeros 12.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheImageIsValid_ShouldStoreTheWholeFileFromTheFirstByte()
    {
        byte[] bytes = PngHead.Concat(new byte[] { 0x01, 0x02, 0x03 }).ToArray();
        CatalogImageUpload? stored = null;
        _catalogImageStorage
            .Setup(x => x.SaveAsync(It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
                It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Callback<CatalogImageUpload, Guid, Guid, Guid, CancellationToken>((upload, _, _, _, _) => stored = upload)
            .ReturnsAsync(SavedKey);

        await Handler().Handle(Command(bytes, "foto.png", "image/png"), CancellationToken.None);

        stored.Should().NotBeNull();
        stored!.Content.Read(new byte[bytes.Length], 0, bytes.Length).Should().Be(bytes.Length);
        stored.Content.Position.Should().Be(bytes.Length);
    }

    #endregion

    #region Formato real rechazado

    /// <summary>
    /// El caso que abrió esto: un archivo cualquiera renombrado a `.png`. La extensión y el
    /// `Content-Type` dicen "PNG"; los bytes dicen que no. 400 y NADA se escribe.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheBytesAreNotAnImage_ShouldRejectTheUploadBeforeStoringAnything()
    {
        Func<Task> act = () => Handler().Handle(
            Command(NotAnImage, "foto.png", "image/png"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().Be("CatalogImageTypeNotAllowed:jpg, png o webp");
        _catalogImageStorage.Verify(x => x.SaveAsync(
            It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _productImageRepository.Verify(x => x.AddAsync(It.IsAny<ProductImage>()), Times.Never);
    }

    /// <summary>
    /// Un archivo de 3 bytes no puede ser ninguna de las tres cabeceras: se rechaza por corto, no
    /// por "quizá es otra cosa". Con una firma de 12 bytes, "no llega" es "no es".
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheFileIsTooShortToBeAnImage_ShouldRejectIt()
    {
        Func<Task> act = () => Handler().Handle(
            Command(new byte[] { 0x89, 0x50, 0x4E }, "foto.png", "image/png"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().Be("CatalogImageTypeNotAllowed:jpg, png o webp");
        _catalogImageStorage.Verify(x => x.SaveAsync(
            It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>Un archivo vacío no es "una imagen vacía": es una petición sin archivo. 400.</summary>
    [Fact]
    public async Task Handle_WithAnEmptyFile_ShouldRejectIt()
    {
        Func<Task> act = () => Handler().Handle(
            Command(Array.Empty<byte>(), "foto.png", "image/png"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        _catalogImageStorage.Verify(x => x.SaveAsync(
            It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// La otra mitad de la regla: la cabecera correcta NO sustituye a la extensión. El archivo se
    /// sirve después por su extensión, así que un PNG llamado `.txt` sigue siendo 400.
    /// </summary>
    [Fact]
    public async Task Handle_WhenARealImageHasANonImageExtension_ShouldStillRejectIt()
    {
        Func<Task> act = () => Handler().Handle(
            Command(PngHead, "foto.txt", "image/png"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        exception.Which.Message.Should().Be("CatalogImageTypeNotAllowed:jpg, png o webp");
    }

    #endregion
}
