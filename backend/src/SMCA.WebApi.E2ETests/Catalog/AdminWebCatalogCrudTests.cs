using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// CRUD completo del catálogo desde el SuperAdmin (2026-10-23): cada endpoint store-scoped con un
/// camino feliz REAL, no solo el 403. Cubre campos de producto, imágenes de producto, marca y
/// showcase — lo que <see cref="AdminWebCatalogTests"/> (lecturas) y
/// <see cref="AdminWebCatalogScopeProbes"/> (autorización) no ejercitan.
/// </summary>
[Collection("e2e")]
public sealed class AdminWebCatalogCrudTests
{
    private static readonly byte[] TinyJpeg =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    private readonly AppTestFactory _f;

    public AdminWebCatalogCrudTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record AdminProductDto(Guid Id, string Name, string Description,
        int PercentDiscountPrice, int DiscountPrice, bool IsNew, string? Image, List<string> Images);

    private sealed record BrandingDto(string? LogoKey, int MobileColumns);

    /// <summary>`Kind` viaja como NÚMERO (0 = carrusel, 1 = imágenes del día).</summary>
    private sealed record ShowcaseImageDto(Guid Id, int Kind, string Key, int OrderIndex, string? Caption);

    private sealed record ShowcaseImagesDto(List<ShowcaseImageDto> Carousel, List<ShowcaseImageDto> Daily);

    private async Task CleanupAsync(WebCatalogSeed.StoreFixture store, Guid saId)
    {
        // El seed no borra estas dos tablas y la FK impide borrar la tienda si se escribieron.
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Domain.Entities.StoreCatalogImages.StoreCatalogImage>().IgnoreQueryFilters()
                .Where(image => image.StoreId == store.StoreId).ExecuteDeleteAsync();
            await db.Set<Domain.Entities.StoreCatalogSettings.StoreCatalogSettings>().IgnoreQueryFilters()
                .Where(settings => settings.StoreId == store.StoreId).ExecuteDeleteAsync();
        }

        await WebCatalogSeed.CleanupAsync(_f, store);
        await DbTestHelpers.CleanupUserAsync(_f, saId);
    }

    private static MultipartFormDataContent ImageForm(string partName, string fileName = "foto.jpg")
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(TinyJpeg);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        content.Add(file, partName, fileName);
        return content;
    }

    [Fact]
    public async Task SuperAdmin_updates_the_catalog_fields_of_a_product()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-crud-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, store, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, store, category.Id, "Camisa", 100m);
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            var response = await sa.PutAsJsonAsync(
                $"/api/v1/stores/{store.StoreId}/catalog/products/{product.Id}",
                new { description = "Camisa de lino", percentDiscountPrice = 1250, isNew = true });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var products = await sa.GetFromJsonAsync<ApiResponse<List<AdminProductDto>>>(
                $"/api/v1/stores/{store.StoreId}/catalog/products", ApiResponse.Json);
            var updated = products!.Data!.Single();
            updated.Description.Should().Be("Camisa de lino");
            updated.PercentDiscountPrice.Should().Be(1250);
            updated.IsNew.Should().BeTrue();
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    [Fact]
    public async Task SuperAdmin_uploads_reorders_and_removes_product_images()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-crud-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, store, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, store, category.Id, "Camisa", 100m);
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            async Task<string> UploadAsync(string fileName)
            {
                using var content = ImageForm("file", fileName);
                var response = await sa.PostAsync(
                    $"/api/v1/stores/{store.StoreId}/catalog/products/{product.Id}/images", content);
                response.StatusCode.Should().Be(HttpStatusCode.OK);
                var body = await response.Content.ReadFromJsonAsync<ApiResponse<string>>(ApiResponse.Json);
                return body!.Data!;
            }

            string first = await UploadAsync("uno.jpg");
            string second = await UploadAsync("dos.jpg");

            var reorder = await sa.PutAsJsonAsync(
                $"/api/v1/stores/{store.StoreId}/catalog/products/{product.Id}/images/order",
                new { paths = new[] { second, first } });
            reorder.StatusCode.Should().Be(HttpStatusCode.OK);

            var afterReorder = await ReadProductAsync(sa, store.StoreId, product.Id);
            afterReorder.Images.Should().Equal(second, first);

            var remove = await sa.DeleteAsync(
                $"/api/v1/stores/{store.StoreId}/catalog/products/{product.Id}/images?path={Uri.EscapeDataString(second)}");
            remove.StatusCode.Should().Be(HttpStatusCode.OK);

            var afterRemove = await ReadProductAsync(sa, store.StoreId, product.Id);
            afterRemove.Images.Should().Equal(first);
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    [Fact]
    public async Task SuperAdmin_reads_and_updates_the_store_branding()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-crud-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            var initial = await sa.GetFromJsonAsync<ApiResponse<BrandingDto>>(
                $"/api/v1/stores/{store.StoreId}/catalog/branding", ApiResponse.Json);
            initial!.Succeeded.Should().BeTrue();
            initial.Data!.LogoKey.Should().BeNull();
            initial.Data.MobileColumns.Should().Be(2);

            using var form = ImageForm("logo", "logo.jpg");
            form.Add(new StringContent("1"), "mobileColumns");
            var update = await sa.PutAsync($"/api/v1/stores/{store.StoreId}/catalog/branding", form);
            update.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await update.Content.ReadFromJsonAsync<ApiResponse<BrandingDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.LogoKey.Should().NotBeNullOrWhiteSpace();

            var reread = await sa.GetFromJsonAsync<ApiResponse<BrandingDto>>(
                $"/api/v1/stores/{store.StoreId}/catalog/branding", ApiResponse.Json);
            reread!.Data!.LogoKey.Should().Be(body.Data.LogoKey);
            reread.Data.MobileColumns.Should().Be(1);
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    [Fact]
    public async Task SuperAdmin_uploads_reorders_and_removes_showcase_images()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-crud-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);
            var url = $"/api/v1/stores/{store.StoreId}/catalog/showcase";

            var empty = await sa.GetFromJsonAsync<ApiResponse<ShowcaseImagesDto>>(url, ApiResponse.Json);
            empty!.Data!.Carousel.Should().BeEmpty();

            async Task<ShowcaseImageDto> UploadAsync(string caption)
            {
                using var form = ImageForm("file", "portada.jpg");
                form.Add(new StringContent("0"), "kind");
                form.Add(new StringContent(caption), "caption");
                var response = await sa.PostAsync(url, form);
                response.StatusCode.Should().Be(HttpStatusCode.OK);
                var body = await response.Content.ReadFromJsonAsync<ApiResponse<ShowcaseImageDto>>(ApiResponse.Json);
                return body!.Data!;
            }

            var first = await UploadAsync("Primera");
            var second = await UploadAsync("Segunda");

            var reorder = await sa.PutAsJsonAsync($"{url}/order",
                new { kind = 0, orderedIds = new[] { second.Id, first.Id } });
            reorder.StatusCode.Should().Be(HttpStatusCode.OK);

            var reordered = await sa.GetFromJsonAsync<ApiResponse<ShowcaseImagesDto>>(url, ApiResponse.Json);
            reordered!.Data!.Carousel.Select(image => image.Id).Should().Equal(second.Id, first.Id);

            var remove = await sa.DeleteAsync($"{url}/{second.Id}");
            remove.StatusCode.Should().Be(HttpStatusCode.OK);

            var afterRemove = await sa.GetFromJsonAsync<ApiResponse<ShowcaseImagesDto>>(url, ApiResponse.Json);
            afterRemove!.Data!.Carousel.Should().ContainSingle()
                .Which.Id.Should().Be(first.Id);
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    private static async Task<AdminProductDto> ReadProductAsync(HttpClient client, Guid storeId, Guid productId)
    {
        var products = await client.GetFromJsonAsync<ApiResponse<List<AdminProductDto>>>(
            $"/api/v1/stores/{storeId}/catalog/products", ApiResponse.Json);
        return products!.Data!.Single(product => product.Id == productId);
    }
}
