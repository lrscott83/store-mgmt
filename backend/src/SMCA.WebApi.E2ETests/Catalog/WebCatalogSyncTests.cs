using System.Net;
using System.Net.Http.Json;
using Domain.Entities.Products;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Sincronización del catálogo web (módulo 18, plan 2026-09-27; publicación DIRECTA, decisión del
/// Owner 2026-09-28): el botón "Sincronizar Catálogo" trae los hechos del catálogo LOCAL del POS a
/// las tablas normales (`Product`/`ProductCategory`), ACTUALIZA por el id del dispositivo (nunca
/// duplica) y DESACTIVA — jamás borra — lo que dejó de estar en el dispositivo (decisión D6).
/// No existe una copia publicada: el catálogo público lee estas mismas tablas.
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
    public async Task Sync_without_a_snapshot_stamps_the_slug_and_the_sync_date()
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

            var store = await QueryAsync(db => db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters()
                .FirstAsync(s => s.Id == fixture.StoreId));
            store.CatalogSlug.Should().Be(fixture.Slug);
            store.CatalogSyncedAt.Should().NotBeNull();

            // La fila del producto NO se tocó: el catálogo ya vive en la tabla normal.
            var product = await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .Include(p => p.Images)
                .FirstAsync(p => p.Category.StoreId == fixture.StoreId));
            product.Name.Should().Be("Camisa azul");
            product.Description.Should().Be("Camisa de algodón");
            product.PercentDiscountPrice.Should().Be(1250);
            product.DiscountPrice.Should().Be(500);
            product.IsNew.Should().BeTrue();
            product.Image.Should().Be("k/main.jpg");
            product.Images.Select(i => i.Path).Should().BeEquivalentTo(new[] { "k/1.jpg", "k/2.jpg" });
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task The_snapshot_updates_the_source_rows_and_never_duplicates()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var categoryId = Guid.NewGuid();
            var productId = Guid.NewGuid();
            var categories = new[] { new SnapshotCategory(categoryId, "Ropa", 1) };
            var client = ClientFor(fixture);

            await ReadSummaryAsync(await SyncAsync(client, new
            {
                categories,
                products = new[] { new PosProduct(productId, categoryId, "Camisa", 100m) },
            }));

            // El dueño renombra y le cambia el precio en el dispositivo: el snapshot lo trae.
            var second = await ReadSummaryAsync(await SyncAsync(client, new
            {
                categories,
                products = new[] { new PosProduct(productId, categoryId, "Camisa premium", 150m) },
            }));

            second.CategoriesCreated.Should().Be(0);
            second.CategoriesUpdated.Should().Be(1);
            second.ProductsCreated.Should().Be(0);
            second.ProductsUpdated.Should().Be(1);
            second.ProductsDeactivated.Should().Be(0);

            (await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .CountAsync(p => p.Id == productId))).Should().Be(1,
                "el espejo es 1:1 por id del dispositivo: re-sincronizar nunca duplica");
            var row = await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .FirstAsync(p => p.Id == productId));
            row.Name.Should().Be("Camisa premium");
            row.Price.Should().Be(150m);
            row.Currency.Should().Be(Domain.Common.Enums.Currency.CUP, "el snapshot sin moneda cae a CUP");
            row.CategoryId.Should().Be(categoryId);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task A_product_that_disappeared_from_the_device_is_deactivated_and_never_deleted()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var categoryId = Guid.NewGuid();
            var keptId = Guid.NewGuid();
            var removedId = Guid.NewGuid();
            var categories = new[] { new SnapshotCategory(categoryId, "Ropa", 1) };
            var kept = new PosProduct(keptId, categoryId, "Camisa", 100m);
            var client = ClientFor(fixture);

            await ReadSummaryAsync(await SyncAsync(client, new
            {
                categories,
                products = new[] { kept, new PosProduct(removedId, categoryId, "Gorra", 50m, Order: 2) },
            }));

            // El dispositivo borró «Gorra»: el siguiente snapshot solo trae «Camisa».
            var summary = await ReadSummaryAsync(await SyncAsync(client, new
            {
                categories,
                products = new[] { kept },
            }));

            summary.ProductsDeactivated.Should().Be(1);
            var removed = await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .FirstAsync(p => p.Id == removedId));
            removed.IsActive.Should().BeFalse("lo que ya no está en el dispositivo se desactiva (D6)");
            removed.AvailableToSale.Should().BeFalse("y tampoco queda en venta");
            (await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .CountAsync(p => p.Id == removedId))).Should().Be(1, "nunca se borra");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Null_gallery_leaves_the_photos_alone_and_an_empty_list_clears_them()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            // Las fotos se subieron desde la vista Catálogo Web: viven en el servidor, no en el POS.
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m,
                image: "k/main.jpg", gallery: new[] { "k/main.jpg", "k/2.jpg" });
            var client = ClientFor(fixture);
            var categories = new[] { new SnapshotCategory(category.Id, "Ropa", 1) };

            // `null` = "el snapshot no habla de la galería": no se toca.
            await ReadSummaryAsync(await SyncAsync(client, new
            {
                categories,
                products = new[] { new SnapshotProduct(product.Id, category.Id, "Camisa", 100m, Images: null) },
            }));

            (await QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
                .CountAsync(image => image.ProductId == product.Id))).Should().Be(2,
                "las fotos subidas desde la vista siguen ahí");

            // Lista vacía = el dispositivo dice que no hay fotos: la galería se limpia.
            await ReadSummaryAsync(await SyncAsync(client, new
            {
                categories,
                products = new[]
                {
                    new SnapshotProduct(product.Id, category.Id, "Camisa", 100m, Images: new List<string>()),
                },
            }));

            (await QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
                .CountAsync(image => image.ProductId == product.Id))).Should().Be(0);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task A_snapshot_with_a_dangling_category_is_rejected()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var response = await SyncAsync(ClientFor(fixture), new
            {
                categories = Array.Empty<SnapshotCategory>(),
                products = new[] { new PosProduct(Guid.NewGuid(), Guid.NewGuid(), "Camisa", 100m) },
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "un producto no puede apuntar a una categoría que no viene en el mismo snapshot");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task A_snapshot_over_the_configured_limits_is_rejected()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = ClientFor(fixture);
            var categoryId = Guid.NewGuid();

            var tooManyCategories = Enumerable.Range(0, 501)
                .Select(index => new SnapshotCategory(Guid.NewGuid(), $"Categoría {index}", index)).ToArray();
            (await SyncAsync(client, new { categories = tooManyCategories, products = Array.Empty<PosProduct>() }))
                .StatusCode.Should().Be(HttpStatusCode.BadRequest, "el tope del snapshot son 500 categorías");

            var tooManyProducts = Enumerable.Range(0, 5001)
                .Select(index => new PosProduct(Guid.NewGuid(), categoryId, $"Producto {index}", 10m, Order: index))
                .ToArray();
            (await SyncAsync(client, new
            {
                categories = new[] { new SnapshotCategory(categoryId, "Ropa", 1) },
                products = tooManyProducts,
            })).StatusCode.Should().Be(HttpStatusCode.BadRequest, "el tope del snapshot son 5000 productos");

            // Nada de eso se escribió: el snapshot inválido se rechaza antes de tocar la base.
            (await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .CountAsync(p => p.Category.StoreId == fixture.StoreId))).Should().Be(0);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task An_id_that_belongs_to_another_store_is_rejected()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        var other = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var theirCategory = await WebCatalogSeed.AddCategoryAsync(_f, other, "Ajena");

            var response = await SyncAsync(ClientFor(fixture), new
            {
                // La clave primaria es global: recrear el id de otra tienda reventaría la base.
                categories = new[] { new SnapshotCategory(theirCategory.Id, "Robada", 1) },
                products = Array.Empty<PosProduct>(),
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            (await QueryAsync(db => db.Set<Domain.Entities.ProductCategories.ProductCategory>().IgnoreQueryFilters()
                .FirstAsync(c => c.Id == theirCategory.Id))).StoreId.Should().Be(other.StoreId,
                "la categoría ajena no se toca");
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
            var outOfSale = await WebCatalogSeed.AddProductAsync(_f, fixture, withImage.Id, "Retirado", 50m, order: 2);

            var client = ClientFor(fixture);

            var beforeSync = await client.GetFromJsonAsync<ApiResponse<CatalogStatusDto>>("/api/v1/catalog/status", ApiResponse.Json);
            beforeSync!.Data!.SourceCategoriesCount.Should().Be(1);
            beforeSync.Data.SourceProductsCount.Should().Be(2);
            beforeSync.Data.ProductsWithoutMainImageCount.Should().Be(1);
            beforeSync.Data.PublishedProductsCount.Should().Be(2, "ambos nacen activos y en venta");

            // Fuera de venta => deja de contar como publicado (es lo que el público ve).
            await QueryAsync(async db =>
            {
                outOfSale.AvailableToSale = false;
                db.Set<Product>().Update(outOfSale);
                return await db.SaveChangesAsync();
            });

            var after = await client.GetFromJsonAsync<ApiResponse<CatalogStatusDto>>("/api/v1/catalog/status", ApiResponse.Json);
            after!.Data!.PublishedProductsCount.Should().Be(1);

            await ReadSummaryAsync(await client.PostAsJsonAsync("/api/v1/catalog/sync", new { }));

            var afterSync = await client.GetFromJsonAsync<ApiResponse<CatalogStatusDto>>("/api/v1/catalog/status", ApiResponse.Json);
            afterSync!.Data!.StoreSlug.Should().Be(fixture.Slug);
            afterSync.Data.CatalogUrl.Should().Be($"/catalog/{fixture.Slug}");
            afterSync.Data.CatalogSyncedAt.Should().NotBeNull();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    private static Task<HttpResponseMessage> SyncAsync(HttpClient client, object snapshot)
        => client.PostAsJsonAsync("/api/v1/catalog/sync", new { snapshot });

    // --- Formas del snapshot (compartidas por los tests de este archivo). ---

    private sealed record SnapshotCategory(Guid Id, string Name, int Order, bool IsActive = true);

    private sealed record SnapshotProduct(Guid Id, Guid CategoryId, string Name, decimal Price,
        int? Currency = null, int Order = 0, bool AvailableToSale = true, bool IsActive = true,
        string? BusinessId = null, bool DiscountFromInventory = true, List<string>? Images = null);

    /// <summary>Producto tal como lo envía el POS: la galería no existe en el dispositivo.</summary>
    private sealed record PosProduct(Guid Id, Guid CategoryId, string Name, decimal Price,
        int? Currency = null, int Order = 0, bool AvailableToSale = true, bool IsActive = true,
        string? BusinessId = null, bool DiscountFromInventory = true);
}
