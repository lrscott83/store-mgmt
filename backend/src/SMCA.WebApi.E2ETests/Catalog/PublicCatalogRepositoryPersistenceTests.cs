using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Los 3 métodos SQL nuevos del catálogo público (Controller 4, `255ade42`) probados contra
/// PostgreSQL REAL. Cierran los advisories R3-1 y R3-3 de la revisión del Controller 4: hasta ahora
/// solo tenían mocks, y lo que estos métodos hacen —`LIMIT`/`OFFSET`, `GROUP BY` y la normalización
/// del filtro— es SQL, así que un doble con repositorio mockeado no prueba nada de eso.
///
///   * <c>GetPublishedPageAsync</c>: pagina y filtra en SQL, ordenado por (categoría, producto).
///   * <c>CountPublishedAsync</c>: cuenta el MISMO universo/filtro.
///   * <c>GetPublishedCategoryCountsAsync</c>: agrupa por categoría con su conteo (`GROUP BY`).
///   * La normalización del filtro (`Trim().ToLowerInvariant()` + `ToLower()` en SQL): slug y
///     búsqueda llegan tal cual del cliente y la comparación es insensible a mayúsculas/espacios.
/// </summary>
[Collection("e2e")]
public sealed class PublicCatalogRepositoryPersistenceTests
{
    private readonly AppTestFactory _f;

    public PublicCatalogRepositoryPersistenceTests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task<Guid> SeedCategoryAsync(Guid storeId, Guid tenantId, string name, string slug,
        int order, bool isActive = true)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var category = ProductCategory.Create(storeId, name, order, tenantId, slug);
        category.IsActive = isActive;
        db.Set<ProductCategory>().Add(category);
        await db.SaveChangesAsync();
        return category.Id;
    }

    private async Task<Guid> SeedProductAsync(Guid categoryId, Guid tenantId, string name, int order,
        bool availableToSale = true, bool isActive = true)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var product = Product.Create(Guid.NewGuid(), name, categoryId, 100m, order, availableToSale,
            discountFromInventory: false, businessId: $"B-{Guid.NewGuid():N}", tenantId);
        product.IsActive = isActive;
        db.Set<Product>().Add(product);
        await db.SaveChangesAsync();
        return product.Id;
    }

    private async Task<IList<Product>> PageAsync(Guid storeId, string? categorySlug, string? search,
        int skip, int take)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await new ProductRepository(db)
            .GetPublishedPageAsync(storeId, categorySlug, search, skip, take, CancellationToken.None);
    }

    private async Task<int> CountAsync(Guid storeId, string? categorySlug, string? search)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await new ProductRepository(db)
            .CountPublishedAsync(storeId, categorySlug, search, CancellationToken.None);
    }

    private async Task<IList<Domain.Interfaces.Repositories.PublishedCategoryCount>> CountsAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await new ProductRepository(db)
            .GetPublishedCategoryCountsAsync(storeId, CancellationToken.None);
    }

    [Fact]
    public async Task GetPublishedPageAsync_ShouldPaginateInSql_OrderedByCategoryThenProduct()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            Guid ropa = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Ropa", "ropa", order: 1);
            Guid calzado = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Calzado", "calzado", order: 2);
            await SeedProductAsync(ropa, fixture.TenantId, "Camisa", order: 1);
            await SeedProductAsync(ropa, fixture.TenantId, "Pantalón", order: 2);
            await SeedProductAsync(ropa, fixture.TenantId, "Bufanda", order: 3);
            await SeedProductAsync(calzado, fixture.TenantId, "Zapato", order: 1);

            var firstPage = await PageAsync(fixture.StoreId, null, null, skip: 0, take: 2);
            var secondPage = await PageAsync(fixture.StoreId, null, null, skip: 2, take: 2);

            // El orden es el de la publicación: categoría por `Order`, y dentro el producto por `Order`.
            firstPage.Select(p => p.Name).Should().Equal("Camisa", "Pantalón");
            secondPage.Select(p => p.Name).Should().Equal("Bufanda", "Zapato");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// R3-3: el slug llega tal cual del cliente (mayúsculas, espacios) y el filtro lo normaliza;
    /// contra Postgres esto ejerce el `ToLower()` del SQL, no una comparación en memoria.
    /// </summary>
    [Theory]
    [InlineData("ropa")]
    [InlineData("ROPA")]
    [InlineData("  Ropa  ")]
    public async Task GetPublishedPageAsync_ShouldFilterByCategorySlug_CaseAndSpaceInsensitive(string slug)
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            Guid ropa = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Ropa", "ropa", order: 1);
            Guid calzado = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Calzado", "calzado", order: 2);
            await SeedProductAsync(ropa, fixture.TenantId, "Camisa", order: 1);
            await SeedProductAsync(calzado, fixture.TenantId, "Zapato", order: 1);

            var page = await PageAsync(fixture.StoreId, slug, null, skip: 0, take: 10);

            page.Select(p => p.Name).Should().Equal("Camisa");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Theory]
    [InlineData("camisa")]
    [InlineData("CAMISA")]
    [InlineData("  Camisa  ")]
    public async Task GetPublishedPageAsync_ShouldFilterBySearch_CaseAndSpaceInsensitive(string search)
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            Guid ropa = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Ropa", "ropa", order: 1);
            await SeedProductAsync(ropa, fixture.TenantId, "Camisa azul", order: 1);
            await SeedProductAsync(ropa, fixture.TenantId, "Pantalón", order: 2);

            var page = await PageAsync(fixture.StoreId, null, search, skip: 0, take: 10);

            page.Select(p => p.Name).Should().Equal("Camisa azul");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>El conteo del pie de página tiene que contar EXACTAMENTE el mismo universo/filtro.</summary>
    [Fact]
    public async Task CountPublishedAsync_ShouldMatchTheSameFilterAsThePage()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            Guid ropa = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Ropa", "ropa", order: 1);
            Guid calzado = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Calzado", "calzado", order: 2);
            await SeedProductAsync(ropa, fixture.TenantId, "Camisa azul", order: 1);
            await SeedProductAsync(ropa, fixture.TenantId, "Pantalón", order: 2);
            await SeedProductAsync(calzado, fixture.TenantId, "Zapato", order: 1);

            (await CountAsync(fixture.StoreId, null, null)).Should().Be(3);
            (await CountAsync(fixture.StoreId, "ropa", null)).Should().Be(2);
            (await CountAsync(fixture.StoreId, null, "za")).Should().Be(1, "solo 'Zapato' contiene 'za'");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task GetPublishedCategoryCountsAsync_ShouldGroupByCategoryInSql()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            Guid ropa = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Ropa", "ropa", order: 1);
            Guid calzado = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Calzado", "calzado", order: 2);
            await SeedProductAsync(ropa, fixture.TenantId, "Camisa", order: 1);
            await SeedProductAsync(ropa, fixture.TenantId, "Pantalón", order: 2);
            await SeedProductAsync(calzado, fixture.TenantId, "Zapato", order: 1);

            var counts = await CountsAsync(fixture.StoreId);

            counts.Should().HaveCount(2);
            var ropaCount = counts.Single(c => c.CategoryId == ropa);
            ropaCount.Slug.Should().Be("ropa");
            ropaCount.Name.Should().Be("Ropa");
            ropaCount.ProductsCount.Should().Be(2);
            counts.Single(c => c.CategoryId == calzado).ProductsCount.Should().Be(1);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// El universo publicable: producto inactivo, fuera de venta o de una categoría inactiva NO entra,
    /// ni en la página ni en el conteo.
    /// </summary>
    [Fact]
    public async Task PublishedReads_ShouldExcludeInactiveOrUnavailableProducts()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            Guid ropa = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Ropa", "ropa", order: 1);
            Guid oculta = await SeedCategoryAsync(fixture.StoreId, fixture.TenantId, "Oculta", "oculta", order: 2,
                isActive: false);
            await SeedProductAsync(ropa, fixture.TenantId, "Publicado", order: 1);
            await SeedProductAsync(ropa, fixture.TenantId, "Inactivo", order: 2, isActive: false);
            await SeedProductAsync(ropa, fixture.TenantId, "SinVenta", order: 3, availableToSale: false);
            await SeedProductAsync(oculta, fixture.TenantId, "DeCategoriaOculta", order: 1);

            var page = await PageAsync(fixture.StoreId, null, null, skip: 0, take: 10);

            page.Select(p => p.Name).Should().Equal("Publicado");
            (await CountAsync(fixture.StoreId, null, null)).Should().Be(1);
            (await CountsAsync(fixture.StoreId)).Select(c => c.Slug).Should().Equal("ropa");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }
}
