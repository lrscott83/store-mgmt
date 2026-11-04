using System.Net;
using System.Net.Http.Json;
using Domain.Common.Limits;
using Domain.Entities.Products;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Reglas de la galería del catálogo web por las rutas del SuperAdmin
/// (<c>/api/v1/stores/{storeId}/catalog/products/{productId}/images...</c>): cap de 6 imágenes,
/// 2 MB por archivo, solo jpg/png/webp, el reorden exige una BIYECCIÓN de la galería actual y el
/// borrado de una ruta que no está en la galería responde 404.
/// <see cref="AdminWebCatalogCrudTests"/> cubre el camino feliz de esos mismos endpoints; aquí van
/// los rechazos, verificados contra PostgreSQL (fila escrita o no escrita).
/// </summary>
[Collection("e2e")]
public sealed class AdminCatalogImageRulesE2ETests
{
    private static readonly byte[] TinyJpeg =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    private readonly AppTestFactory _f;

    public AdminCatalogImageRulesE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record SeedContext(WebCatalogSeed.StoreFixture Store, Guid SuperAdminId, HttpClient Client);

    private static string ImagesUrl(Guid storeId, Guid productId)
        => $"/api/v1/stores/{storeId}/catalog/products/{productId}/images";

    private static string ReorderUrl(Guid storeId, Guid productId)
        => $"/api/v1/stores/{storeId}/catalog/products/{productId}/images/order";

    private async Task<T> QueryAsync<T>(Func<ApplicationDbContext, Task<T>> query)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await query(db);
    }

    private Task<int> GalleryCountAsync(Guid productId)
        => QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
            .CountAsync(image => image.ProductId == productId));

    private Task<List<ProductImage>> GalleryAsync(Guid productId)
        => QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
            .Where(image => image.ProductId == productId).OrderBy(image => image.Order).ToListAsync());

    /// <summary>Tienda con categoría y producto listos para recibir imágenes, más un SuperAdmin autenticado.</summary>
    private async Task<SeedContext> SeedAsync()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        string login = $"sa-imgrules-{Guid.NewGuid():N}@test.com";
        Guid superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var client = DbTestHelpers.AuthedClient(_f, superAdminId, login);
        return new SeedContext(store, superAdminId, client);
    }

    private async Task<Guid> SeedProductAsync(SeedContext seed, string name = "Camisa")
    {
        var category = await WebCatalogSeed.AddCategoryAsync(_f, seed.Store, "Ropa");
        var product = await WebCatalogSeed.AddProductAsync(_f, seed.Store, category.Id, name, 100m);
        return product.Id;
    }

    private async Task CleanupAsync(SeedContext seed)
    {
        await WebCatalogSeed.CleanupAsync(_f, seed.Store);
        await DbTestHelpers.CleanupUserAsync(_f, seed.SuperAdminId);
    }

    private static async Task<string> UploadAsync(HttpClient client, Guid storeId, Guid productId,
        byte[] bytes, string fileName, string contentType)
    {
        using var content = WebCatalogSeed.BuildImageUpload(bytes, fileName, contentType);
        var response = await client.PostAsync(ImagesUrl(storeId, productId), content);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<string>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    [Fact]
    public async Task A_seventh_image_is_rejected_and_the_gallery_stays_at_six()
    {
        var seed = await SeedAsync();
        try
        {
            Guid productId = await SeedProductAsync(seed);
            for (int index = 0; index < ProductEntityLimits.MaxImagesPerProduct; index++)
                await UploadAsync(seed.Client, seed.Store.StoreId, productId, TinyJpeg, $"foto{index}.jpg", "image/jpeg");

            using var extra = WebCatalogSeed.BuildImageUpload(TinyJpeg, "extra.jpg", "image/jpeg");
            var response = await seed.Client.PostAsync(ImagesUrl(seed.Store.StoreId, productId), extra);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            (await GalleryCountAsync(productId)).Should().Be(ProductEntityLimits.MaxImagesPerProduct);
        }
        finally
        {
            await CleanupAsync(seed);
        }
    }

    [Fact]
    public async Task An_image_bigger_than_two_megabytes_is_rejected_while_the_small_one_is_accepted()
    {
        var seed = await SeedAsync();
        try
        {
            Guid productId = await SeedProductAsync(seed);

            // Control positivo: MISMO nombre y MISMO tipo que el archivo rechazado, solo cambia el
            // tamaño. Sin él, un handler que rechazara toda subida pasaría esta prueba sin que la
            // regla de 2 MB hubiera hecho nada.
            await UploadAsync(seed.Client, seed.Store.StoreId, productId, TinyJpeg, "grande.jpg", "image/jpeg");

            byte[] tooBig = new byte[ProductEntityLimits.MaxImageSizeInBytes + 1];
            using var content = WebCatalogSeed.BuildImageUpload(tooBig, "grande.jpg", "image/jpeg");
            var response = await seed.Client.PostAsync(ImagesUrl(seed.Store.StoreId, productId), content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            // Solo queda la fila del control positivo: el archivo grande no escribió nada.
            (await GalleryCountAsync(productId)).Should().Be(1);
        }
        finally
        {
            await CleanupAsync(seed);
        }
    }

    [Fact]
    public async Task A_file_that_is_not_an_allowed_image_is_rejected_and_no_row_is_written()
    {
        var seed = await SeedAsync();
        try
        {
            Guid productId = await SeedProductAsync(seed);

            using var content = WebCatalogSeed.BuildImageUpload("no soy una imagen"u8.ToArray(), "nota.txt", "text/plain");
            var response = await seed.Client.PostAsync(ImagesUrl(seed.Store.StoreId, productId), content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await GalleryCountAsync(productId)).Should().Be(0);
        }
        finally
        {
            await CleanupAsync(seed);
        }
    }

    [Fact]
    public async Task Reorder_with_a_subset_of_the_gallery_is_rejected_and_the_order_is_unchanged()
    {
        var seed = await SeedAsync();
        try
        {
            Guid productId = await SeedProductAsync(seed);
            string first = await UploadAsync(seed.Client, seed.Store.StoreId, productId, TinyJpeg, "a.jpg", "image/jpeg");
            string second = await UploadAsync(seed.Client, seed.Store.StoreId, productId, TinyJpeg, "b.jpg", "image/jpeg");

            var response = await seed.Client.PutAsJsonAsync(ReorderUrl(seed.Store.StoreId, productId),
                new { paths = new[] { second } });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await GalleryAsync(productId)).Select(image => image.Path).Should().Equal(first, second);
        }
        finally
        {
            await CleanupAsync(seed);
        }
    }

    [Fact]
    public async Task Reorder_with_a_duplicated_path_is_rejected_and_the_order_is_unchanged()
    {
        var seed = await SeedAsync();
        try
        {
            Guid productId = await SeedProductAsync(seed);
            string first = await UploadAsync(seed.Client, seed.Store.StoreId, productId, TinyJpeg, "a.jpg", "image/jpeg");
            string second = await UploadAsync(seed.Client, seed.Store.StoreId, productId, TinyJpeg, "b.jpg", "image/jpeg");

            // Mismo conteo que la galería y ambas rutas existentes: solo el duplicado delata que
            // no es una biyección.
            var response = await seed.Client.PutAsJsonAsync(ReorderUrl(seed.Store.StoreId, productId),
                new { paths = new[] { first, first } });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await GalleryAsync(productId)).Select(image => image.Path).Should().Equal(first, second);
        }
        finally
        {
            await CleanupAsync(seed);
        }
    }

    [Fact]
    public async Task Deleting_a_path_that_is_not_in_the_gallery_returns_404_and_keeps_the_row()
    {
        var seed = await SeedAsync();
        try
        {
            Guid productId = await SeedProductAsync(seed);
            string key = await UploadAsync(seed.Client, seed.Store.StoreId, productId, TinyJpeg, "a.jpg", "image/jpeg");

            var response = await seed.Client.DeleteAsync(
                $"{ImagesUrl(seed.Store.StoreId, productId)}?path={Uri.EscapeDataString("no/existe/fantasma.jpg")}");

            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
            (await GalleryAsync(productId)).Select(image => image.Path).Should().Equal(key);
        }
        finally
        {
            await CleanupAsync(seed);
        }
    }
}
