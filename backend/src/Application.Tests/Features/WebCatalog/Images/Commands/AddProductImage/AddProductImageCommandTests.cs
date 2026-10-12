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

namespace Application.Tests.Features.WebCatalog.Images.Commands.AddProductImage;

/// <summary>
/// La imagen del catálogo tiene UNA sola fuente, `Product.Image` (decisión del Owner, 2026-10-01),
/// y es la que lee el catálogo público. Como la galería comentada sigue siendo un endpoint vivo,
/// la PRIMERA imagen que entra por él tiene que alimentar esa fuente; las siguientes no la pisan.
///
/// La fila `ProductImage` se sigue creando siempre: es lo que lee la galería cuando se restaure.
/// </summary>
public class AddProductImageCommandTests
{
    private const string UploadedKey = "tenant/store/product/uploaded.jpg";

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
    private readonly List<ProductImage> _existingImages = new();

    public AddProductImageCommandTests()
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
        // La categoría del producto es de ESTA tienda: el guard de scope pasa.
        _productCategoryRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(ProductCategory.Create(_categoryId, _storeId, "Ropa", 1, _tenantId));
        _productImageRepository
            .Setup(x => x.GetByProductIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(() => _existingImages);
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
            .ReturnsAsync(UploadedKey);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
    }

    private AddProductImageCommand Command() => new(
        _product.Id,
        new MemoryStream(new byte[1024]),
        "camisa.jpg",
        "image/jpeg",
        1024);

    [Fact]
    public async Task Handle_WhenItIsTheFirstImage_ShouldSetTheMainImageAndKeepTheGalleryRow()
    {
        var result = await new AddProductImageCommandHandler(
                _unitOfWork.Object,
                _httpContextService.Object,
                _productRepository.Object,
                _productImageRepository.Object,
                _productCategoryRepository.Object,
                _catalogImageStorage.Object,
                _localizer.Object)
            .Handle(Command(), CancellationToken.None);

        result.Data.Should().Be(UploadedKey);
        _product.Image.Should().Be(UploadedKey);
        _productRepository.Verify(x => x.UpdateAsync(_product), Times.Once);
        _productImageRepository.Verify(
            x => x.AddAsync(It.Is<ProductImage>(image => image.Path == UploadedKey && image.Order == 0)),
            Times.Once);
    }

    [Fact]
    public async Task Handle_WhenTheProductAlreadyHasGalleryImages_ShouldNotOverwriteTheMainImage()
    {
        _existingImages.Add(ProductImage.Create(_product.Id, "tenant/store/product/first.jpg", 0, _tenantId));

        await new AddProductImageCommandHandler(
                _unitOfWork.Object,
                _httpContextService.Object,
                _productRepository.Object,
                _productImageRepository.Object,
                _productCategoryRepository.Object,
                _catalogImageStorage.Object,
                _localizer.Object)
            .Handle(Command(), CancellationToken.None);

        _product.Image.Should().BeNull();
        _productRepository.Verify(x => x.UpdateAsync(It.IsAny<Product>()), Times.Never);
        // La fila de galería se sigue creando: es la que lee la galería cuando se restaure.
        _productImageRepository.Verify(
            x => x.AddAsync(It.Is<ProductImage>(image => image.Path == UploadedKey && image.Order == 1)),
            Times.Once);
    }

    /// <summary>
    /// El `productId` de la ruta es del cliente. Si el producto es de OTRA tienda del mismo tenant
    /// (el filtro por tenant no lo impide), el guard por tienda responde 404 uniforme —igual que un
    /// producto inexistente— y NADA se escribe en el almacenamiento.
    /// </summary>
    [Fact]
    public async Task Handle_WhenTheProductBelongsToAnotherStore_ShouldReturnNotFoundAndNotSave()
    {
        _productCategoryRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(ProductCategory.Create(Guid.NewGuid(), "Ropa", 1, _tenantId));

        Func<Task> act = () => new AddProductImageCommandHandler(
                _unitOfWork.Object,
                _httpContextService.Object,
                _productRepository.Object,
                _productImageRepository.Object,
                _productCategoryRepository.Object,
                _catalogImageStorage.Object,
                _localizer.Object)
            .Handle(Command(), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _catalogImageStorage.Verify(
            x => x.SaveAsync(
                It.IsAny<CatalogImageUpload>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}