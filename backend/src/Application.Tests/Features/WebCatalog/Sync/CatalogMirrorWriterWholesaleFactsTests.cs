using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Sync;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Sync;

/// <summary>
/// Fase 1 del espejo: los HECHOS mayoristas del producto. Cada campo es nulable para distinguir
/// "el snapshot no habla de él" (bundle viejo del POS) de "vale esto": `null` deja el valor
/// guardado intacto, un valor presente se escribe. Escribir el default de .NET cuando el campo
/// falta borraría la configuración del dueño en cada sincronización de un cliente viejo.
/// </summary>
public class CatalogMirrorWriterWholesaleFactsTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly Guid StoreId = Guid.NewGuid();

    private readonly Mock<IProductCategoryRepository> _categoryRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public CatalogMirrorWriterWholesaleFactsTests()
    {
        _categoryRepository
            .Setup(repository => repository.GetByStoreIdAsync(StoreId))
            .ReturnsAsync(new List<ProductCategory>());
        _productRepository
            .Setup(repository => repository.UpdateAsync(It.IsAny<Product>()))
            .ReturnsAsync(true);
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns<string>(name => new LocalizedString(name, name));
    }

    /// <summary>Un snapshot que no habla de la config mayorista no pisa lo guardado.</summary>
    [Fact]
    public async Task MirrorCatalogAsync_WhenWholesaleFactsAreNull_LeavesStoredValuesUntouched()
    {
        Product product = StoredProduct();
        ProductWithCatalog(product);

        var snapshot = new CatalogSnapshotDto
        {
            Products =
            {
                new CatalogSnapshotProductDto
                {
                    Id = product.Id,
                    CategoryId = product.CategoryId,
                    Name = "Cerveza",
                    Price = 100m,
                    WholesaleEnabled = null,
                    WholesalePackSize = null,
                    WholesaleUnitLabel = null,
                },
            },
        };

        await CatalogMirrorWriter.MirrorCatalogAsync(snapshot, StoreId, TenantId,
            _categoryRepository.Object, _productRepository.Object, _localizer.Object);

        product.WholesaleEnabled.Should().BeTrue("el snapshot no habla del flag");
        product.WholesalePackSize.Should().Be(12, "el snapshot no habla del tamaño");
        product.WholesaleUnitLabel.Should().Be("caja", "el snapshot no habla de la unidad");
    }

    /// <summary>Los valores presentes se escriben; una unidad en blanco limpia la unidad guardada.</summary>
    [Fact]
    public async Task MirrorCatalogAsync_WhenWholesaleFactsPresent_WritesThemAndBlanksTheUnitLabel()
    {
        Product product = StoredProduct();
        ProductWithCatalog(product);

        var snapshot = new CatalogSnapshotDto
        {
            Products =
            {
                new CatalogSnapshotProductDto
                {
                    Id = product.Id,
                    CategoryId = product.CategoryId,
                    Name = "Cerveza",
                    Price = 100m,
                    WholesaleEnabled = false,
                    WholesalePackSize = 6,
                    WholesaleUnitLabel = "   ",
                },
            },
        };

        await CatalogMirrorWriter.MirrorCatalogAsync(snapshot, StoreId, TenantId,
            _categoryRepository.Object, _productRepository.Object, _localizer.Object);

        product.WholesaleEnabled.Should().BeFalse();
        product.WholesalePackSize.Should().Be(6);
        product.WholesaleUnitLabel.Should().BeNull("una unidad en blanco es 'sin unidad', no 'no la toques'");
    }

    private void ProductWithCatalog(Product product)
        => _productRepository
            .Setup(repository => repository.GetProductsForCatalogSyncAsync(StoreId))
            .ReturnsAsync(new List<Product> { product });

    private static Product StoredProduct()
    {
        Product product = Product.Create(Guid.NewGuid(), "Cerveza", Guid.NewGuid(), 100m, 0, true, true, "B1", TenantId);
        product.WholesaleEnabled = true;
        product.WholesalePackSize = 12;
        product.WholesaleUnitLabel = "caja";
        return product;
    }
}
