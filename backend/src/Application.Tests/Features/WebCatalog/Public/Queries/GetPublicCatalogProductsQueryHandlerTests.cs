using Application.Exceptions;
using Application.Features.WebCatalog.Public.Queries.GetPublicCatalogProducts;
using Domain.Entities.Products;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Public.Queries;

/// <summary>
/// Listado público paginado. Los dos comportamientos que esta suite fija son los que rompían:
///
///   1. El filtro y la paginación van al REPOSITORIO (SQL), no a memoria. Antes se traía TODO el
///      catálogo y se filtraba/paginaba después, así que la "paginación" no acotaba nada.
///   2. `page` desbordaba `int`: `(page - 1) * pageSize` con `?page=2147483647` daba un offset
///      negativo y `Skip` lanzaba -> 500 anónimo. El offset se calcula en `long` y se acota al total.
/// </summary>
public class GetPublicCatalogProductsQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _storeId;

    public GetPublicCatalogProductsQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>()])
            .Returns((string name) => new LocalizedString(name, name));
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) => new LocalizedString(name, name));

        Store store = Store.Create("Tienda Pública", Guid.NewGuid(), true, _tenantId);
        store.CatalogSlug = "tienda-publica";
        _storeId = store.Id;

        _storeRepository
            .Setup(x => x.GetStoreByCatalogSlugAsync(It.IsAny<string>()))
            .ReturnsAsync(store);

        _productRepository
            .Setup(x => x.CountPublishedAsync(It.IsAny<Guid>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        _productRepository
            .Setup(x => x.GetPublishedPageAsync(It.IsAny<Guid>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);
    }

    private GetPublicCatalogProductsQueryHandler Handler() => new(
        _storeRepository.Object,
        _productRepository.Object,
        _localizer.Object);

    /// <summary>
    /// El caso que rompía: una página enorme no debe desbordar ni tirar 500. El offset se calcula en
    /// `long` y se acota al total, así que la página sale vacía con su `Total` correcto.
    /// </summary>
    [Fact]
    public async Task Handle_WithAHugePage_ShouldNotOverflowAndShouldReturnAnEmptyPage()
    {
        _productRepository
            .Setup(x => x.CountPublishedAsync(_storeId, It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(5);

        var result = await Handler().Handle(
            new GetPublicCatalogProductsQuery("tienda-publica", Page: int.MaxValue), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Items.Should().BeEmpty();
        result.Data.Total.Should().Be(5);
        result.Data.Page.Should().Be(int.MaxValue);

        _productRepository.Verify(x => x.GetPublishedPageAsync(
            _storeId, It.IsAny<string?>(), It.IsAny<string?>(), 5, 24, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>La página 2 empieza en 24 (pageSize por defecto): el offset lo calcula el handler.</summary>
    [Fact]
    public async Task Handle_WithPageTwo_ShouldAskTheRepositoryForTheSecondPage()
    {
        _productRepository
            .Setup(x => x.CountPublishedAsync(_storeId, It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(100);

        await Handler().Handle(new GetPublicCatalogProductsQuery("tienda-publica", Page: 2), CancellationToken.None);

        _productRepository.Verify(x => x.GetPublishedPageAsync(
            _storeId, It.IsAny<string?>(), It.IsAny<string?>(), 24, 24, It.IsAny<CancellationToken>()), Times.Once);
    }

    /// <summary>El filtro por categoría/búsqueda viaja al repositorio, no se aplica en memoria.</summary>
    [Fact]
    public async Task Handle_ShouldPassTheCategoryAndSearchFiltersToTheRepository()
    {
        await Handler().Handle(
            new GetPublicCatalogProductsQuery("tienda-publica", "ropa", "camisa"), CancellationToken.None);

        _productRepository.Verify(x => x.CountPublishedAsync(_storeId, "ropa", "camisa", It.IsAny<CancellationToken>()), Times.Once);
        _productRepository.Verify(x => x.GetPublishedPageAsync(
            _storeId, "ropa", "camisa", It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WithPageLessThanOne_ShouldFallBackToPageOne()
    {
        await Handler().Handle(new GetPublicCatalogProductsQuery("tienda-publica", Page: 0), CancellationToken.None);

        _productRepository.Verify(x => x.GetPublishedPageAsync(
            _storeId, It.IsAny<string?>(), It.IsAny<string?>(), 0, 24, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WithAnUnknownSlug_ShouldReportNotFound()
    {
        _storeRepository
            .Setup(x => x.GetStoreByCatalogSlugAsync(It.IsAny<string>()))
            .ReturnsAsync((Store?)null);

        Func<Task> act = () => Handler().Handle(new GetPublicCatalogProductsQuery("no-existe"), CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ApiException>();
        exception.Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
        _productRepository.Verify(
            x => x.GetPublishedPageAsync(It.IsAny<Guid>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
