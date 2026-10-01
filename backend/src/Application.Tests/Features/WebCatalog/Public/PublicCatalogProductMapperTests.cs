using Application.Features.WebCatalog.Public;
using Domain.Entities.Products;
using FluentAssertions;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// La imagen del catálogo público tiene UNA sola fuente: `Product.Image` (decisión del Owner,
/// 2026-10-01). La galería `ProductImage` era la segunda fuente y fue la que dejó vivo el bug de la
/// foto fantasma: la vista Catálogo Web quitaba la imagen principal (`RemoveImage: true`) pero la
/// fila de galería seguía `IsActive`, así que `ImageUrls` seguía publicando la imagen borrada
/// mientras `ImageUrl` ya venía vacío — y el popup del frontend caía a `imageUrls[0]`.
/// </summary>
public class PublicCatalogProductMapperTests
{
    private const string StoreSlug = "mi-tienda";

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();

    private Product MakeProduct(string? image)
        => Product.Create("Camisa", _categoryId, 100m, 1, true, true, "B-1", _tenantId, image: image);

    /// <summary>
    /// Con imagen principal, las DOS URLs públicos sirven la misma clave: el contrato de galería
    /// sigue siendo válido (una imagen subida = una entrada) sin ser una segunda fuente.
    /// </summary>
    [Fact]
    public void ToDto_WithMainImage_ShouldExposeTheSameKeyInImageUrlAndImageUrls()
    {
        var product = MakeProduct("tenant/store/product/main.jpg");

        var dto = PublicCatalogProductMapper.ToDto(product, StoreSlug);

        var expected = $"/api/v1/public/catalog/{StoreSlug}/media/tenant/store/product/main.jpg";
        dto.ImageUrl.Should().Be(expected);
        dto.ImageUrls.Should().ContainSingle().Which.Should().Be(expected);
    }

    /// <summary>
    /// Sin imagen principal NO se publica nada, aunque la galería tenga filas activas: es la
    /// regresión de la foto fantasma.
    /// </summary>
    [Fact]
    public void ToDto_WithoutMainImage_ShouldNotPublishTheActiveGalleryRows()
    {
        var product = MakeProduct(null);
        product.Images.Add(ProductImage.Create(product.Id, "tenant/store/product/ghost.jpg", 0, _tenantId));
        product.Images.Add(ProductImage.Create(product.Id, "tenant/store/product/second.jpg", 1, _tenantId));

        var dto = PublicCatalogProductMapper.ToDto(product, StoreSlug);

        dto.ImageUrl.Should().BeNull();
        dto.ImageUrls.Should().BeEmpty();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ToDto_WithBlankMainImage_ShouldNotPublishAnyUrl(string? image)
    {
        var dto = PublicCatalogProductMapper.ToDto(MakeProduct(image), StoreSlug);

        dto.ImageUrl.Should().BeNull();
        dto.ImageUrls.Should().BeEmpty();
    }

    /// <summary>
    /// La galería sigue existiendo en el DTO (la galería comentada la lee cuando se restaure), pero
    /// sale de `Product.Image`: una imagen principal nueva no se mezcla con las filas viejas.
    /// </summary>
    [Fact]
    public void ToDto_ShouldIgnoreTheGalleryEvenWhenTheMainImageIsSet()
    {
        var product = MakeProduct("tenant/store/product/main.jpg");
        product.Images.Add(ProductImage.Create(product.Id, "tenant/store/product/other.jpg", 0, _tenantId));

        var dto = PublicCatalogProductMapper.ToDto(product, StoreSlug);

        dto.ImageUrls.Should().ContainSingle()
            .Which.Should().Be($"/api/v1/public/catalog/{StoreSlug}/media/tenant/store/product/main.jpg");
    }
}