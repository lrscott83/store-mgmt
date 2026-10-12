using Application.Exceptions;
using Application.Features.WebCatalog.Public.Queries.GetPublicCatalog;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Public.Queries;

/// <summary>
/// Cabecera del catálogo público. Los conteos por categoría salen de un GROUP BY en SQL
/// (`GetPublishedCategoryCountsAsync`), no de contar en memoria dentro de un bucle por categoría
/// (que era O(categorías × productos)).
/// </summary>
public class GetPublicCatalogQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Store _store;
    private readonly Guid _tenantId = Guid.NewGuid();

    public GetPublicCatalogQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns((string name) => new LocalizedString(name, name));
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) => new LocalizedString(name, name));

        _store = Store.Create("Tienda Pública", Guid.NewGuid(), true, _tenantId);
        _store.CatalogSlug = "tienda-publica";

        _storeRepository
            .Setup(x => x.GetStoreByCatalogSlugAsync(It.IsAny<string>()))
            .ReturnsAsync(_store);
        _productRepository
            .Setup(x => x.GetPublishedCategoryCountsAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
    }

    private GetPublicCatalogQueryHandler Handler() => new(
        _storeRepository.Object,
        _productRepository.Object,
        _localizer.Object);

    [Fact]
    public async Task Handle_ShouldExposeTheCategoriesOrderedByOrderThenName()
    {
        Guid ropa = Guid.NewGuid();
        Guid calzado = Guid.NewGuid();
        _productRepository
            .Setup(x => x.GetPublishedCategoryCountsAsync(_store.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(
            [
                new PublishedCategoryCount(calzado, "Zapatos", "zapatos", 2, 3),
                new PublishedCategoryCount(ropa, "Ropa", "ropa", 1, 5),
            ]);

        var result = await Handler().Handle(new GetPublicCatalogQuery("tienda-publica"), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.StoreSlug.Should().Be("tienda-publica");
        result.Data.Categories.Select(category => category.Slug).Should().Equal("ropa", "zapatos");
        result.Data.Categories.Select(category => category.ProductsCount).Should().Equal(5, 3);
    }

    [Fact]
    public async Task Handle_WithAnUnknownSlug_ShouldReportNotFound()
    {
        _storeRepository
            .Setup(x => x.GetStoreByCatalogSlugAsync(It.IsAny<string>()))
            .ReturnsAsync((Store?)null);

        Func<Task> act = () => Handler().Handle(new GetPublicCatalogQuery("no-existe"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }
}
