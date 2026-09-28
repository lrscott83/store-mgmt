using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
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
/// El snapshot del catálogo LOCAL del POS (decisión D11, plan 2026-09-27 §10.1): el POS es
/// offline-first y el servidor no conoce sus productos, así que "Sincronizar Catálogo" viaja con
/// esa foto y el backend la espeja antes de publicar.
///
/// Lo que se cubre aquí es el camino REAL del botón: los ids son los Guid del dispositivo, los
/// hechos son los del POS (nombre, precio, categoría, orden, disponibilidad, moneda) y la galería
/// NO viaja — el POS no tiene fotos, las sube la vista Catálogo Web.
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogSnapshotTests
{
    private readonly AppTestFactory _f;

    public WebCatalogSnapshotTests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientFor(WebCatalogSeed.StoreFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    private async Task<T> QueryAsync<T>(Func<ApplicationDbContext, Task<T>> query)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await query(db);
    }

    private static Task<HttpResponseMessage> SyncAsync(HttpClient client, object snapshot)
        => client.PostAsJsonAsync("/api/v1/catalog/sync", new { snapshot });

    private static async Task<SyncSummaryDto> ReadSummaryAsync(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SyncSummaryDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    // --- Formas del snapshot. `PosProduct` es EXACTAMENTE lo que manda el POS: sin `Images`. ---

    private sealed record SnapshotCategory(Guid Id, string Name, int Order, bool IsActive = true);

    private sealed record SnapshotProduct(Guid Id, Guid CategoryId, string Name, decimal Price,
        int? Currency = null, int Order = 0, bool AvailableToSale = true, bool IsActive = true,
        string? BusinessId = null, bool DiscountFromInventory = true, List<string>? Images = null);

    /// <summary>Producto tal como lo envía el POS: la galería no existe en el dispositivo.</summary>
    private sealed record PosProduct(Guid Id, Guid CategoryId, string Name, decimal Price,
        int? Currency = null, int Order = 0, bool AvailableToSale = true, bool IsActive = true,
        string? BusinessId = null, bool DiscountFromInventory = true);

    [Fact]
    public async Task The_snapshot_of_the_device_is_mirrored_and_published()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            // La tienda nace vacía en el servidor: el catálogo entero viene del dispositivo.
            var categoryId = Guid.NewGuid();
            var productId = Guid.NewGuid();

            var summary = await ReadSummaryAsync(await SyncAsync(ClientFor(fixture), new
            {
                categories = new[] { new SnapshotCategory(categoryId, "Ropa", 1) },
                products = new[] { new PosProduct(productId, categoryId, "Camisa del POS", 120m, (int)Currency.USD) },
            }));

            summary.StoreSlug.Should().Be(fixture.Slug);
            summary.CategoriesCreated.Should().Be(1);
            summary.ProductsCreated.Should().Be(1);

            // El espejo respeta los ids del dispositivo (la copia publicada queda 1:1 con el origen).
            var category = await QueryAsync(db => db.Set<ProductCategory>().IgnoreQueryFilters()
                .FirstAsync(c => c.Id == categoryId));
            category.StoreId.Should().Be(fixture.StoreId);
            category.Name.Should().Be("Ropa");

            var mirror = await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .FirstAsync(p => p.Id == productId));
            mirror.Name.Should().Be("Camisa del POS");
            mirror.Price.Should().Be(120m);
            mirror.Currency.Should().Be(Currency.USD, "la moneda viaja por VALOR del enum");
            mirror.CategoryId.Should().Be(categoryId);
            (await QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
                .CountAsync(image => image.ProductId == productId))).Should().Be(0,
                "el POS no tiene galería: el snapshot no la menciona");

            // Y el catálogo público ya muestra el producto, con los campos editables vacíos.
            var page = await _f.CreateClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products", ApiResponse.Json);
            page!.Data!.Total.Should().Be(1);
            page.Data.Items.Single().Name.Should().Be("Camisa del POS");
            page.Data.Items.Single().Price.Should().Be(120m);
            page.Data.Items.Single().Description.Should().BeEmpty();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Re_sending_the_same_snapshot_only_updates()
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
                "el espejo es 1:1 por id de origen: re-sincronizar nunca duplica");
            (await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .FirstAsync(p => p.Id == productId))).Name.Should().Be("Camisa premium");
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
            (await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .FirstAsync(p => p.Id == removedId))).IsActive.Should().BeFalse(
                "lo que ya no está en el dispositivo se desactiva en el espejo (D6)");
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

            (await QueryAsync(db => db.Set<ProductCategory>().IgnoreQueryFilters()
                .FirstAsync(c => c.Id == theirCategory.Id))).StoreId.Should().Be(other.StoreId,
                "la categoría ajena no se toca");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
            await WebCatalogSeed.CleanupAsync(_f, other);
        }
    }
}
