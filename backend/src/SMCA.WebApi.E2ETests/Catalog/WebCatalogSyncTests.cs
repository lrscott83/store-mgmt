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
/// Sincronización del catálogo web (módulo 18, plan 2026-09-27): el botón "Sincronizar Catálogo"
/// crea lo que falta, ACTUALIZA lo existente por el id de origen (relación 1:1, nunca duplica) y
/// despublica — jamás borra — lo que dejó de estar en venta (decisión D6).
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogSyncTests
{
    private readonly AppTestFactory _f;

    public WebCatalogSyncTests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientFor(WebCatalogSeed.StoreFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    private async Task<T> QueryAsync<T>(Func<ApplicationDbContext, Task<T>> query)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await query(db);
    }

    private static async Task<SyncSummaryDto> ReadSummaryAsync(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SyncSummaryDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    [Fact]
    public async Task Sync_creates_the_published_catalog_and_generates_the_store_slug()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa", 1);
            await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa azul", 100m,
                description: "Camisa de algodón", percentDiscountPrice: 1250, discountPrice: 500,
                isNew: true, image: "k/main.jpg", gallery: new[] { "k/1.jpg", "k/2.jpg" });

            var summary = await ReadSummaryAsync(await ClientFor(fixture).PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            summary.StoreSlug.Should().Be(fixture.Slug);
            summary.CatalogUrl.Should().Be($"/catalog/{fixture.Slug}");
            summary.CategoriesCreated.Should().Be(1);
            summary.ProductsCreated.Should().Be(1);
            summary.ProductsDeactivated.Should().Be(0);

            var published = await QueryAsync(db => db.Set<CatalogProduct>().IgnoreQueryFilters()
                .Include(p => p.Images)
                .FirstAsync(p => p.StoreId == fixture.StoreId));

            published.IsActive.Should().BeTrue();
            published.Name.Should().Be("Camisa azul");
            published.Description.Should().Be("Camisa de algodón");
            published.PercentDiscountPrice.Should().Be(1250);
            published.DiscountPrice.Should().Be(500);
            published.IsNew.Should().BeTrue();
            published.Image.Should().Be("k/main.jpg");
            published.SourceProductId.Should().NotBe(Guid.Empty);
            published.Images.Select(i => i.Path).Should().BeEquivalentTo(new[] { "k/1.jpg", "k/2.jpg" });

            var store = await QueryAsync(db => db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters()
                .FirstAsync(s => s.Id == fixture.StoreId));
            store.CatalogSlug.Should().Be(fixture.Slug);
            store.CatalogSyncedAt.Should().NotBeNull();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Second_sync_updates_the_existing_rows_and_never_duplicates()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa", 1);
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            await ReadSummaryAsync(await ClientFor(fixture).PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            // Cambia el origen: nombre, precio y descuentos.
            await QueryAsync(async db =>
            {
                product.Name = "Camisa premium";
                product.Price = 200m;
                product.Description = "Ahora con descripción";
                product.PercentDiscountPrice = 1000;
                db.Set<Domain.Entities.Products.Product>().Update(product);
                return await db.SaveChangesAsync();
            });

            var second = await ReadSummaryAsync(await ClientFor(fixture).PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            second.CategoriesCreated.Should().Be(0);
            second.ProductsCreated.Should().Be(0);
            second.CategoriesUpdated.Should().Be(1);
            second.ProductsUpdated.Should().Be(1);

            var rows = await QueryAsync(db => db.Set<CatalogProduct>().IgnoreQueryFilters()
                .Where(p => p.StoreId == fixture.StoreId).ToListAsync());
            rows.Should().HaveCount(1, "la relación 1:1 por id de origen hace el sync idempotente");
            rows[0].Name.Should().Be("Camisa premium");
            rows[0].Price.Should().Be(200m);
            rows[0].Description.Should().Be("Ahora con descripción");
            rows[0].PercentDiscountPrice.Should().Be(1000);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Product_out_of_sale_is_published_inactive_and_never_deleted()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            await ReadSummaryAsync(await ClientFor(fixture).PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            await QueryAsync(async db =>
            {
                product.AvailableToSale = false;
                db.Set<Domain.Entities.Products.Product>().Update(product);
                return await db.SaveChangesAsync();
            });

            var summary = await ReadSummaryAsync(await ClientFor(fixture).PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            summary.ProductsDeactivated.Should().Be(1);
            var published = await QueryAsync(db => db.Set<CatalogProduct>().IgnoreQueryFilters()
                .FirstAsync(p => p.StoreId == fixture.StoreId));
            published.IsActive.Should().BeFalse("un producto fuera de venta se despublica, no se borra");

            // Despublicar no borra la fila y una nueva sincronización no crea otra.
            (await QueryAsync(db => db.Set<CatalogProduct>().IgnoreQueryFilters()
                .CountAsync(p => p.StoreId == fixture.StoreId))).Should().Be(1);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Product_deleted_in_the_source_keeps_its_published_row_deactivated()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            await ReadSummaryAsync(await ClientFor(fixture).PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            await QueryAsync(async db =>
            {
                await db.Set<Domain.Entities.Products.Product>().IgnoreQueryFilters()
                    .Where(p => p.Id == product.Id).ExecuteDeleteAsync();
                return 1;
            });

            var summary = await ReadSummaryAsync(await ClientFor(fixture).PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            summary.ProductsDeactivated.Should().Be(1);
            (await QueryAsync(db => db.Set<CatalogProduct>().IgnoreQueryFilters()
                .CountAsync(p => p.StoreId == fixture.StoreId && !p.IsActive))).Should().Be(1);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Category_of_a_product_in_another_store_stays_out_of_the_catalog()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        var other = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var mine = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Mía");
            await WebCatalogSeed.AddProductAsync(_f, fixture, mine.Id, "Camisa", 100m);
            var theirs = await WebCatalogSeed.AddCategoryAsync(_f, other, "Ajena");
            await WebCatalogSeed.AddProductAsync(_f, other, theirs.Id, "Pantalón", 50m);

            var summary = await ReadSummaryAsync(await ClientFor(fixture).PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            summary.ProductsCreated.Should().Be(1, "el catálogo solo publica los productos de la tienda seleccionada");
            (await QueryAsync(db => db.Set<CatalogProduct>().IgnoreQueryFilters()
                .CountAsync(p => p.StoreId == fixture.StoreId))).Should().Be(1);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
            await WebCatalogSeed.CleanupAsync(_f, other);
        }
    }

    [Fact]
    public async Task Status_reports_the_public_url_and_the_source_counters()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var withImage = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            await WebCatalogSeed.AddProductAsync(_f, fixture, withImage.Id, "Camisa", 100m, image: "k/main.jpg");
            await WebCatalogSeed.AddProductAsync(_f, fixture, withImage.Id, "Sin foto", 50m, order: 2);

            var client = ClientFor(fixture);

            var beforeSync = await client.GetFromJsonAsync<ApiResponse<CatalogStatusDto>>("/api/v1/catalog/status", ApiResponse.Json);
            beforeSync!.Data!.SourceCategoriesCount.Should().Be(1);
            beforeSync.Data.SourceProductsCount.Should().Be(2);
            beforeSync.Data.ProductsWithoutMainImageCount.Should().Be(1);
            beforeSync.Data.PublishedProductsCount.Should().Be(0);

            await ReadSummaryAsync(await client.PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            var afterSync = await client.GetFromJsonAsync<ApiResponse<CatalogStatusDto>>("/api/v1/catalog/status", ApiResponse.Json);
            afterSync!.Data!.StoreSlug.Should().Be(fixture.Slug);
            afterSync.Data.CatalogUrl.Should().Be($"/catalog/{fixture.Slug}");
            afterSync.Data.CatalogSyncedAt.Should().NotBeNull();
            afterSync.Data.PublishedProductsCount.Should().Be(2);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }
}
