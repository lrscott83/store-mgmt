using System.Net;
using System.Net.Http.Json;
using Domain.Entities.WebCatalog;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Catálogo web público (anónimo) en /catalog/&lt;slug&gt;: cabecera con categorías, listado con
/// filtro/búsqueda/paginación, detalle con descripción y galería, y 404 uniforme cuando el slug no
/// tiene catálogo publicado (plan 2026-09-27).
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogPublicApiTests
{
    private readonly AppTestFactory _f;

    public WebCatalogPublicApiTests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientFor(WebCatalogSeed.StoreFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    private HttpClient AnonClient() => _f.CreateClient();

    private sealed record UpdateProductBody(Guid CategoryId, string Name, decimal Price, bool AvailableToSale,
        bool DiscountFromInventory, string BusinessId, int Order, bool IsActive, string? Description,
        int? PercentDiscountPrice, int? DiscountPrice, bool? IsNew, string? Image, bool RemoveImage = false);

    private async Task<PublicCatalogDto> PublishAndReadCatalogAsync(WebCatalogSeed.StoreFixture fixture)
    {
        var client = ClientFor(fixture);
        (await client.PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();

        var body = await AnonClient().GetFromJsonAsync<ApiResponse<PublicCatalogDto>>(
            $"/api/v1/public/catalog/{fixture.Slug}", ApiResponse.Json);

        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    /// <summary>Id de la fila PUBLICADA (no el del producto del origen) de un producto sincronizado.</summary>
    private async Task<Guid> PublishedProductIdAsync(WebCatalogSeed.StoreFixture fixture, Guid sourceProductId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<CatalogProduct>().IgnoreQueryFilters()
            .Where(product => product.StoreId == fixture.StoreId && product.SourceProductId == sourceProductId)
            .Select(product => product.Id)
            .FirstAsync();
    }

    [Fact]
    public async Task Unknown_slug_returns_the_same_404_for_every_endpoint()
    {
        var slug = $"no-existe-{Guid.NewGuid():N}";
        var client = AnonClient();

        (await client.GetAsync($"/api/v1/public/catalog/{slug}")).StatusCode
            .Should().Be(HttpStatusCode.NotFound);
        (await client.GetAsync($"/api/v1/public/catalog/{slug}/products")).StatusCode
            .Should().Be(HttpStatusCode.NotFound);
        (await client.GetAsync($"/api/v1/public/catalog/{slug}/products/{Guid.NewGuid()}")).StatusCode
            .Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Store_without_a_published_catalog_returns_404()
    {
        // Tienda con el módulo pero SIN sincronizar: todavía no tiene slug público.
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            (await AnonClient().GetAsync($"/api/v1/public/catalog/{fixture.Slug}")).StatusCode
                .Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Catalog_header_lists_the_categories_with_their_product_counts()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var ropa = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa", 1);
            var calzado = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Calzado", 2);
            await WebCatalogSeed.AddProductAsync(_f, fixture, ropa.Id, "Camisa", 100m);
            await WebCatalogSeed.AddProductAsync(_f, fixture, ropa.Id, "Pantalón", 80m, order: 2);
            await WebCatalogSeed.AddProductAsync(_f, fixture, calzado.Id, "Zapato", 60m);

            var catalog = await PublishAndReadCatalogAsync(fixture);

            catalog.StoreName.Should().Be(fixture.StoreName);
            catalog.StoreSlug.Should().Be(fixture.Slug);
            catalog.Categories.Should().HaveCount(2);
            catalog.Categories[0].Name.Should().Be("Ropa");
            catalog.Categories[0].ProductsCount.Should().Be(2);
            catalog.Categories[0].Slug.Should().NotBeNullOrWhiteSpace();
            catalog.Categories[1].ProductsCount.Should().Be(1);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Products_list_combines_the_percent_and_the_discounted_price()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m,
                description: "Algodón", percentDiscountPrice: 1250, discountPrice: 500, isNew: true);

            await PublishAndReadCatalogAsync(fixture);

            var page = await AnonClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products", ApiResponse.Json);

            var product = page!.Data!.Items.Single();
            product.Price.Should().Be(100m);
            product.PercentDiscount.Should().Be(12.5m);
            product.DiscountAmount.Should().Be(5m);
            product.FinalPrice.Should().Be(82.5m, "primero el % y después el monto (decisión D7)");
            product.HasDiscount.Should().BeTrue();
            product.IsNew.Should().BeTrue();
            product.CategorySlug.Should().NotBeNullOrWhiteSpace();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Listing_filters_by_category_searches_by_name_and_paginates()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var ropa = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa", 1);
            var calzado = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Calzado", 2);
            await WebCatalogSeed.AddProductAsync(_f, fixture, ropa.Id, "Camisa azul", 100m);
            await WebCatalogSeed.AddProductAsync(_f, fixture, ropa.Id, "Pantalón azul", 90m, order: 2);
            await WebCatalogSeed.AddProductAsync(_f, fixture, calzado.Id, "Zapato azul", 60m);

            var catalog = await PublishAndReadCatalogAsync(fixture);
            string ropaSlug = catalog.Categories.First(c => c.Name == "Ropa").Slug;

            var byCategory = await AnonClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products?categorySlug={ropaSlug}", ApiResponse.Json);
            byCategory!.Data!.Total.Should().Be(2);

            var bySearch = await AnonClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products?search=camisa", ApiResponse.Json);
            bySearch!.Data!.Items.Should().HaveCount(1);
            bySearch.Data.Items[0].Name.Should().Be("Camisa azul");

            var firstPage = await AnonClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products?page=1&pageSize=2", ApiResponse.Json);
            firstPage!.Data!.Total.Should().Be(3);
            firstPage.Data.Items.Should().HaveCount(2);
            firstPage.Data.PageSize.Should().Be(2);

            var secondPage = await AnonClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products?page=2&pageSize=2", ApiResponse.Json);
            secondPage!.Data!.Items.Should().HaveCount(1);

            var unknownCategory = await AnonClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products?categorySlug=no-existe", ApiResponse.Json);
            unknownCategory!.Data!.Total.Should().Be(0);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Product_out_of_sale_disappears_from_the_public_catalog()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            await PublishAndReadCatalogAsync(fixture);

            var update = await ClientFor(fixture).PutAsJsonAsync($"/api/v1/products/{product.Id}",
                new UpdateProductBody(category.Id, "Camisa", 100m, false, true, $"B-{Guid.NewGuid():N}", 1, true,
                    null, null, null, null, null));
            update.StatusCode.Should().Be(HttpStatusCode.OK);

            var client = ClientFor(fixture);
            await client.PostAsJsonAsync("/api/v1/catalog/sync", new { });

            var page = await AnonClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products", ApiResponse.Json);
            page!.Data!.Total.Should().Be(0, "un producto fuera de venta no se muestra (decisión D6)");

            Guid publishedId = await PublishedProductIdAsync(fixture, product.Id);
            var detail = await AnonClient().GetAsync($"/api/v1/public/catalog/{fixture.Slug}/products/{publishedId}");
            detail.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Product_detail_exposes_the_plain_text_description_and_the_gallery()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            var client = ClientFor(fixture);
            var update = await client.PutAsJsonAsync($"/api/v1/products/{product.Id}",
                new UpdateProductBody(category.Id, "Camisa", 100m, true, true, $"B-{Guid.NewGuid():N}", 1, true,
                    "Primera línea\nSegunda línea con <b>etiquetas</b>", 1250, 500, true, null));
            update.StatusCode.Should().Be(HttpStatusCode.OK);

            using var upload = WebCatalogSeed.BuildImageUpload(new byte[] { 0xFF, 0xD8, 0xFF, 0xD9 }, "g.jpg", "image/jpeg");
            (await client.PostAsync($"/api/v1/catalog/products/{product.Id}/images", upload)).StatusCode
                .Should().Be(HttpStatusCode.OK);

            await PublishAndReadCatalogAsync(fixture);
            Guid publishedId = await PublishedProductIdAsync(fixture, product.Id);

            var body = await AnonClient().GetFromJsonAsync<ApiResponse<PublicProductDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products/{publishedId}", ApiResponse.Json);

            var published = body!.Data!;
            published.Name.Should().Be("Camisa");
            published.Description.Should().Be("Primera línea\nSegunda línea con <b>etiquetas</b>",
                "la descripción es texto plano: los saltos se conservan y nada se interpreta como HTML");
            published.FinalPrice.Should().Be(82.5m);
            published.ImageUrls.Should().HaveCount(1);
            published.ImageUrls[0].Should().StartWith($"/api/v1/public/catalog/{fixture.Slug}/media/");
            (await AnonClient().GetAsync(published.ImageUrls[0])).StatusCode.Should().Be(HttpStatusCode.OK);

            // El detalle de un producto de OTRA tienda tampoco existe en este slug.
            var other = await AnonClient().GetAsync($"/api/v1/public/catalog/{fixture.Slug}/products/{Guid.NewGuid()}");
            other.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }
}
