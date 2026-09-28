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
/// Imágenes del catálogo web (plan 2026-09-27, decisión D10): máximo 2 MB, 6 por producto,
/// jpg/png/webp; el borrado limpia fila y archivo, y el servido público valida que la clave
/// pertenezca a la tienda del slug.
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogImagesTests
{
    private static readonly byte[] TinyJpeg = { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    private readonly AppTestFactory _f;

    public WebCatalogImagesTests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientFor(WebCatalogSeed.StoreFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    private async Task<T> QueryAsync<T>(Func<ApplicationDbContext, Task<T>> query)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await query(db);
    }

    private async Task<string> UploadAsync(HttpClient client, Guid productId, byte[] bytes,
        string fileName = "foto.jpg", string contentType = "image/jpeg")
    {
        using var content = WebCatalogSeed.BuildImageUpload(bytes, fileName, contentType);
        var response = await client.PostAsync($"/api/v1/catalog/products/{productId}/images", content);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<string>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    [Fact]
    public async Task Upload_returns_the_key_and_registers_the_gallery_row()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            string key = await UploadAsync(ClientFor(fixture), product.Id, TinyJpeg);

            key.Should().StartWith(fixture.TenantId.ToString("N") + "/" + fixture.StoreId.ToString("N") + "/" + product.Id.ToString("N") + "/");
            var rows = await QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
                .Where(image => image.ProductId == product.Id).ToListAsync());
            rows.Should().HaveCount(1);
            rows[0].Path.Should().Be(key);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Upload_rejects_a_file_that_is_not_an_allowed_image()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            using var content = WebCatalogSeed.BuildImageUpload("no soy una imagen"u8.ToArray(), "nota.txt", "text/plain");
            var response = await ClientFor(fixture)
                .PostAsync($"/api/v1/catalog/products/{product.Id}/images", content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
                .CountAsync(image => image.ProductId == product.Id))).Should().Be(0);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Upload_rejects_a_file_bigger_than_two_megabytes()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            byte[] tooBig = new byte[ProductEntityLimits.MaxImageSizeInBytes + 1];
            using var content = WebCatalogSeed.BuildImageUpload(tooBig, "grande.jpg", "image/jpeg");
            var response = await ClientFor(fixture)
                .PostAsync($"/api/v1/catalog/products/{product.Id}/images", content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Upload_stops_at_six_images_per_product()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);
            var client = ClientFor(fixture);

            for (int index = 0; index < ProductEntityLimits.MaxImagesPerProduct; index++)
                await UploadAsync(client, product.Id, TinyJpeg, $"foto{index}.jpg");

            using var extra = WebCatalogSeed.BuildImageUpload(TinyJpeg, "extra.jpg", "image/jpeg");
            var response = await client.PostAsync($"/api/v1/catalog/products/{product.Id}/images", extra);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
                .CountAsync(image => image.ProductId == product.Id)))
                .Should().Be(ProductEntityLimits.MaxImagesPerProduct);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Delete_removes_the_row_and_the_file()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);
            var client = ClientFor(fixture);

            string key = await UploadAsync(client, product.Id, TinyJpeg);

            // El catálogo se publica para poder pedir la imagen por su URL pública.
            (await client.PostAsJsonAsync("/api/v1/catalog/sync", new { })).StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.GetAsync($"/api/v1/public/catalog/{fixture.Slug}/media/{key}")).StatusCode
                .Should().Be(HttpStatusCode.OK);

            var delete = await client.DeleteAsync(
                $"/api/v1/catalog/products/{product.Id}/images?path={Uri.EscapeDataString(key)}");
            delete.StatusCode.Should().Be(HttpStatusCode.OK);

            (await QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
                .CountAsync(image => image.ProductId == product.Id))).Should().Be(0);
            (await client.GetAsync($"/api/v1/public/catalog/{fixture.Slug}/media/{key}")).StatusCode
                .Should().Be(HttpStatusCode.NotFound, "el archivo se borró con la fila");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Reorder_applies_the_given_order_and_rejects_a_foreign_list()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);
            var client = ClientFor(fixture);

            string first = await UploadAsync(client, product.Id, TinyJpeg, "a.jpg");
            string second = await UploadAsync(client, product.Id, TinyJpeg, "b.jpg");

            var reorder = await client.PutAsJsonAsync($"/api/v1/catalog/products/{product.Id}/images/order",
                new { paths = new[] { second, first } });
            reorder.StatusCode.Should().Be(HttpStatusCode.OK);

            var rows = await QueryAsync(db => db.Set<ProductImage>().IgnoreQueryFilters()
                .Where(image => image.ProductId == product.Id).OrderBy(image => image.Order).ToListAsync());
            rows[0].Path.Should().Be(second);
            rows[1].Path.Should().Be(first);

            var invalid = await client.PutAsJsonAsync($"/api/v1/catalog/products/{product.Id}/images/order",
                new { paths = new[] { second } });
            invalid.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Public_media_serves_a_published_image_with_cache_and_404s_an_unknown_key()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);
            var client = ClientFor(fixture);

            string key = await UploadAsync(client, product.Id, TinyJpeg, "principal.jpg");
            await client.PostAsJsonAsync("/api/v1/catalog/sync", new { });

            var media = await client.GetAsync($"/api/v1/public/catalog/{fixture.Slug}/media/{key}");
            media.StatusCode.Should().Be(HttpStatusCode.OK);
            media.Content.Headers.ContentType!.MediaType.Should().Be("image/jpeg");
            media.Headers.CacheControl!.Public.Should().BeTrue();
            (await media.Content.ReadAsByteArrayAsync()).Should().Equal(TinyJpeg);

            var unknown = await client.GetAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/media/{fixture.TenantId:N}/00000000000000000000000000000000/00000000000000000000000000000000.jpg");
            unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }
}
