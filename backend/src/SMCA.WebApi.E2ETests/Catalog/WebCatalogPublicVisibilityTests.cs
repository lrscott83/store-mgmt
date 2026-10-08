using System.Net.Http.Json;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Visibilidad del catálogo público según <c>IsActive</c> de productos y categorías. Fija TRES
/// reglas que hoy se cumplen por construcción y que ningún test protegía:
///
///   1. Un producto inactivo no se publica.
///   2. Una categoría inactiva no se publica, y NINGUNO de sus productos tampoco.
///   3. Una categoría sin productos activos no aparece en la cabecera.
///
/// Por qué merece tests propios: la regla 3 no sale de un filtro escrito en <c>ProductCategory</c>
/// sino de que la cabecera DERIVA las categorías agrupando los productos ya filtrados
/// (<c>GetPublicCatalogQueryHandler</c>: <c>products.GroupBy(p => p.CategoryId)</c>). Quien lea ese
/// handler con la intención de "leer las categorías de la tienda" cambiaría el origen de datos a
/// <c>ProductCategory</c> — que es lo natural — y el caso 3 se rompería en silencio mientras los
/// casos 1 y 2 seguirían pasando, porque viven en otro archivo
/// (<c>ProductRepository.GetPublishedByStoreIdAsync</c>). Ese es exactamente el cambio que estos
/// tests convierten en rojo.
///
/// La categoría "sin productos activos" se siembra con un producto al que luego se le quita
/// <c>IsActive</c>: así la categoría nace con contenido y se vacía, que es el escenario real.
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogPublicVisibilityTests
{
    private readonly AppTestFactory _f;
    private readonly HttpClient _client;

    public WebCatalogPublicVisibilityTests(WebAppFixture fixture)
    {
        _f = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Inactive_product_and_category_hide_their_products_and_empty_categories_disappear()
    {
        WebCatalogSeed.StoreFixture fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            // --- Siembra: tres categorías activas, cada una con su producto activo (control). ---
            ProductCategory visible = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Bebidas", order: 1);
            ProductCategory emptied = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Postres", order: 2);
            ProductCategory hidden = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Comidas", order: 3);

            Product visibleProduct = await WebCatalogSeed.AddProductAsync(_f, fixture, visible.Id, "Agua", 10m);
            Product inactiveProduct = await WebCatalogSeed.AddProductAsync(_f, fixture, visible.Id, "Refresco retirado", 20m);
            Product orphanedProduct = await WebCatalogSeed.AddProductAsync(_f, fixture, emptied.Id, "Torta retirada", 30m);
            Product hiddenCategoryProduct = await WebCatalogSeed.AddProductAsync(_f, fixture, hidden.Id, "Almuerzo", 40m);

            // Publicar: sin snapshot solo se asegura el slug y la fecha, no se espeja ni se desactiva.
            HttpClient ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            (await ownerClient.PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();

            // Precondición: con todo activo las tres categorías y los cuatro productos se publican.
            // Sin esta comprobación, un fallo de siembra se confundiría con el filtro funcionando.
            PublicCatalogDto before = await GetHeaderAsync(fixture.Slug);
            before.Categories.Select(c => c.Id).Should().BeEquivalentTo(
                new[] { visible.Id, emptied.Id, hidden.Id },
                "las tres categorías nacen activas y con producto: si no aparecen, la siembra falló");

            PublicPageDto beforePage = await GetProductsAsync(fixture.Slug);
            beforePage.Total.Should().Be(4, "los cuatro productos nacen activos");

            // --- Los tres escenarios, cada uno aislado del otro. ---
            await SetIsActiveAsync<Product>(inactiveProduct.Id, false);       // (1) producto inactivo
            await SetIsActiveAsync<ProductCategory>(hidden.Id, false);        // (2) categoría inactiva
            await SetIsActiveAsync<Product>(orphanedProduct.Id, false);       // (3) categoría sin activos

            // --- Cabecera pública. ---
            PublicCatalogDto header = await GetHeaderAsync(fixture.Slug);

            header.Categories.Select(c => c.Id).Should().BeEquivalentTo(
                new[] { visible.Id },
                "solo sobrevive la categoría activa con al menos un producto activo");

            header.Categories.Should().NotContain(c => c.Id == hidden.Id,
                "una categoría inactiva no se publica aunque tenga productos activos");
            header.Categories.Should().NotContain(c => c.Id == emptied.Id,
                "una categoría cuyos productos quedaron todos inactivos desaparece de la cabecera");

            // El contador no debe incluir el producto inactivo de la categoría visible.
            header.Categories.Single(c => c.Id == visible.Id).ProductsCount.Should().Be(1,
                "el producto inactivo no cuenta: la cabecera y la lista deben coincidir");

            // --- Lista de productos. ---
            PublicPageDto page = await GetProductsAsync(fixture.Slug);

            page.Total.Should().Be(1);
            page.Items.Select(p => p.Id).Should().BeEquivalentTo(new[] { visibleProduct.Id });

            page.Items.Should().NotContain(p => p.Id == inactiveProduct.Id, "regla 1: producto inactivo");
            page.Items.Should().NotContain(p => p.Id == hiddenCategoryProduct.Id,
                "regla 2: la categoría está inactiva, así que su producto tampoco se publica");
            page.Items.Should().NotContain(p => p.Id == orphanedProduct.Id, "regla 3: producto inactivo");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>Cabecera del catálogo público (anónima, por slug).</summary>
    private async Task<PublicCatalogDto> GetHeaderAsync(string slug)
    {
        var response = await _client.GetFromJsonAsync<ApiResponse<PublicCatalogDto>>(
            $"/api/v1/public/catalog/{slug}", ApiResponse.Json);
        response!.Succeeded.Should().BeTrue();
        return response.Data!;
    }

    private async Task<PublicPageDto> GetProductsAsync(string slug)
    {
        var response = await _client.GetFromJsonAsync<ApiResponse<PublicPageDto>>(
            $"/api/v1/public/catalog/{slug}/products", ApiResponse.Json);
        response!.Succeeded.Should().BeTrue();
        return response.Data!;
    }

    /// <summary>
    /// <c>ExecuteUpdateAsync</c> porque <c>ApplicationDbContext</c> es NoTracking por defecto: cargar,
    /// mutar y guardar escribiría NADA, sin error. <c>IgnoreQueryFilters</c> porque las entidades
    /// filtran por tenant y aquí no hay sesión.
    /// </summary>
    private async Task SetIsActiveAsync<TEntity>(Guid id, bool isActive) where TEntity : class
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<TEntity>().IgnoreQueryFilters()
            .Where(entity => EF.Property<Guid>(entity, "Id") == id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(entity => EF.Property<bool>(entity, "IsActive"), isActive));
    }
}
