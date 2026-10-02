using Application.Abstractions.HttpContext;
using Application.Features.WebCatalog.Commands.UpdateProductCatalogFields;
using Application.UnitOfWorks;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Commands.UpdateProductCatalogFields;

/// <summary>
/// Quitar la imagen principal desde la vista Catálogo Web limpia SOLO `Product.Image`: la galería
/// es un dato aparte y sus filas sobreviven, que es el contrato que fija el E2E
/// `Remove_image_clears_the_main_image_only`.
///
/// Que la foto fantasma haya dejado de aparecer NO depende de esto: la lectura pública se apoya
/// solo en `Product.Image` (PublicCatalogProductMapper), así que aunque las filas se quedaran no
/// podrían publicarse.
///
/// El handler ni siquiera depende de `ICatalogImageStorage`, así que "no borra archivos" está
/// garantizado por el compilador y no necesita un mock que lo afirme.
/// </summary>
public class UpdateProductCatalogFieldsImageTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IProductCategoryRepository> _categoryRepository = new();
    private readonly Mock<IProductImageRepository> _productImageRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();

    private readonly Product _product;

    public UpdateProductCatalogFieldsImageTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _product = Product.Create("Camisa", _categoryId, 100m, 1, true, true, "B-1", _tenantId,
            image: "tenant/store/product/main.jpg");

        var category = ProductCategory.Create(_storeId, "Ropa", 1, _tenantId, "ropa");

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _productRepository.Setup(x => x.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(_product);
        _productRepository.Setup(x => x.UpdateAsync(It.IsAny<Product>())).ReturnsAsync(true);
        _categoryRepository.Setup(x => x.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(category);
        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(3);
    }

    private UpdateProductCatalogFieldsCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _productRepository.Object,
        _categoryRepository.Object,
        _localizer.Object);

    private UpdateProductCatalogFieldsCommand Command() => new() { Id = _product.Id };

    [Fact]
    public async Task Handle_RemoveImage_ShouldClearTheMainImageOnly()
    {
        var command = Command();
        command.RemoveImage = true;

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Data.Should().BeTrue();
        _product.Image.Should().BeNull();
    }

    /// <summary>
    /// La galería no se lee ni se borra: es un dato aparte del que la principal es un puntero.
    /// Este test es el que impide que alguien "arregle" la limpieza y rompa el E2E.
    /// </summary>
    [Fact]
    public async Task Handle_RemoveImage_ShouldNeverTouchTheGallery()
    {
        var command = Command();
        command.RemoveImage = true;

        await Handler().Handle(command, CancellationToken.None);

        _productImageRepository.Verify(x => x.GetByProductIdAsync(It.IsAny<Guid>()), Times.Never);
        _productImageRepository.Verify(x => x.DeleteAsync(It.IsAny<IEnumerable<ProductImage>>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithoutRemoveImage_ShouldSetTheNewMainImage()
    {
        var command = Command();
        command.Image = "tenant/store/product/new.jpg";

        var result = await Handler().Handle(command, CancellationToken.None);

        result.Data.Should().BeTrue();
        _product.Image.Should().Be("tenant/store/product/new.jpg");
        _productImageRepository.Verify(x => x.DeleteAsync(It.IsAny<IEnumerable<ProductImage>>()), Times.Never);
    }
}
