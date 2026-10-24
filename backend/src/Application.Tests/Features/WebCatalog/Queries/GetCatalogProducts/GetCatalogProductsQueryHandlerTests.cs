using Application.Abstractions.HttpContext;
using Application.Features.WebCatalog.Queries.GetCatalogProducts;
using Domain.Common.Enums;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Queries.GetCatalogProducts;

/// <summary>
/// Lectura de la vista Catálogo Web. El orden del producto ya viajaba en la respuesta; el de la
/// CATEGORÍA se expone en `CategoryOrder` para que el POS pueda importar ambos órdenes
/// (S5 del feature `web-catalog-to-pos-import`).
/// </summary>
public class GetCatalogProductsQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public GetCatalogProductsQueryHandlerTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.UserExternalId).Returns("owner@example.test");
        _productRepository
            .Setup(x => x.GetProductsForCatalogSyncAsync(It.IsAny<Guid>()))
            .ReturnsAsync([]);
    }

    private GetCatalogProductsQueryHandler Handler() => new(
        _httpContextService.Object,
        _productRepository.Object,
        _localizer.Object);

    private void Given(params Product[] products)
        => _productRepository.Setup(x => x.GetProductsForCatalogSyncAsync(_storeId)).ReturnsAsync(products.ToList());

    private ProductCategory Category(string name, int order)
        => ProductCategory.Create(_storeId, name, order, _tenantId);

    private Product ProductIn(ProductCategory category, string name = "Producto", decimal price = 10m, int order = 0)
    {
        Product product = Product.Create(
            name: name,
            categoryId: category.Id,
            price: price,
            order: order,
            availableToSale: true,
            discountFromInventory: true,
            businessId: "b-1",
            tenantId: _tenantId);
        product.Category = category;
        return product;
    }

    [Fact]
    public async Task Handle_WithTheCategoryLoaded_MapsTheCategoryOrder()
    {
        ProductCategory category = Category("Bebidas", 7);
        Given(ProductIn(category, order: 3));

        var result = await Handler().Handle(new GetCatalogProductsQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().ContainSingle();
        var product = result.Data.Single();
        product.CategoryOrder.Should().Be(7);
        product.CategoryName.Should().Be("Bebidas");
        product.Order.Should().Be(3);
    }

    [Fact]
    public async Task Handle_WithoutTheCategoryLoaded_SetsCategoryOrderToZero()
    {
        Product productWithoutCategory = Product.Create(
            name: "Suelto",
            categoryId: Guid.NewGuid(),
            price: 5m,
            order: 1,
            availableToSale: true,
            discountFromInventory: true,
            businessId: "b-2",
            tenantId: _tenantId);
        Given(productWithoutCategory);

        var result = await Handler().Handle(new GetCatalogProductsQuery(), CancellationToken.None);

        result.Data.Should().ContainSingle();
        var product = result.Data.Single();
        product.CategoryOrder.Should().Be(0);
        product.CategoryName.Should().BeEmpty();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Handle_KeepsTheExistingMappedFields(bool availableToSale)
    {
        ProductCategory category = Category("Abarrotes", 2);
        Product product = ProductIn(category, name: "Arroz", price: 125.50m, order: 4);
        product.Currency = Currency.USD;
        product.AvailableToSale = availableToSale;
        Given(product);

        var result = await Handler().Handle(new GetCatalogProductsQuery(), CancellationToken.None);

        result.Data.Should().ContainSingle();
        var mapped = result.Data.Single();
        mapped.Id.Should().Be(product.Id);
        mapped.Name.Should().Be("Arroz");
        mapped.Price.Should().Be(125.50m);
        mapped.Currency.Should().Be("USD");
        mapped.AvailableToSale.Should().Be(availableToSale);
    }
}
