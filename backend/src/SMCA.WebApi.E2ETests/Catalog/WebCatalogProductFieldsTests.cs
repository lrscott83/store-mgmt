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
/// Campos del catálogo web editables desde la vista "Catálogo Web" (plan 2026-09-27, decisión D8:
/// se editan SOLO ahí): descripción en texto plano (D9), % de descuento, precio rebajado, "Nuevo" e
/// imagen principal. Editar el catálogo no toca el resto del producto (nombre, precio, código de
/// barras, orden) y, con la publicación DIRECTA (decisión del Owner, 2026-09-28), lo guardado es
/// visible en el público al instante.
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogProductFieldsTests
{
    private static readonly byte[] TinyJpeg = { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    private readonly AppTestFactory _f;

    public WebCatalogProductFieldsTests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientFor(WebCatalogSeed.StoreFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    private async Task<T> QueryAsync<T>(Func<ApplicationDbContext, Task<T>> query)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await query(db);
    }

    /// <summary>Producto tal como lo devuelve la lista editable de la vista Catálogo Web.</summary>
    private sealed record CatalogViewDto(Guid Id, Guid CategoryId, string CategoryName, string Name, decimal Price,
        string Currency, int Order, bool AvailableToSale, bool IsActive, string Description,
        int PercentDiscountPrice, int DiscountPrice, bool IsNew, string? Image, List<string> Images,
        decimal FinalPrice, bool HasDiscount);

    private sealed record CatalogFieldsBody(string? Description = null, int? PercentDiscountPrice = null,
        int? DiscountPrice = null, bool? IsNew = null, string? Image = null, bool RemoveImage = false);

    private async Task<CatalogViewDto> ReadViewAsync(HttpClient client, Guid productId)
    {
        var body = await client.GetFromJsonAsync<ApiResponse<IEnumerable<CatalogViewDto>>>(
            "/api/v1/catalog/products", ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!.Single(product => product.Id == productId);
    }

    private static async Task<HttpResponseMessage> SaveFieldsAsync(HttpClient client, Guid productId,
        CatalogFieldsBody payload) => await client.PutAsJsonAsync($"/api/v1/catalog/products/{productId}", payload);

    [Fact]
    public async Task Saving_the_fields_exposes_them_in_the_catalog_view()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);
            var client = ClientFor(fixture);

            var response = await SaveFieldsAsync(client, product.Id, new CatalogFieldsBody(
                Description: "Camisa de algodón\nSegunda línea", PercentDiscountPrice: 1250,
                DiscountPrice: 500, IsNew: true, Image: "k/main.jpg"));

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            (await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json))!.Data.Should().BeTrue();

            var view = await ReadViewAsync(client, product.Id);
            view.Description.Should().Be("Camisa de algodón\nSegunda línea");
            view.PercentDiscountPrice.Should().Be(1250);
            view.DiscountPrice.Should().Be(500);
            view.IsNew.Should().BeTrue();
            view.Image.Should().Be("k/main.jpg");
            view.FinalPrice.Should().Be(82.5m, "el % se aplica primero y el monto rebajado después (D7)");
            view.HasDiscount.Should().BeTrue();
            view.CategoryName.Should().Be("Ropa");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Omitting_a_field_leaves_it_untouched_and_editing_the_catalog_does_not_touch_the_product()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m,
                description: "Descripción original", percentDiscountPrice: 1000, discountPrice: 200, isNew: true,
                image: "k/original.jpg");
            var client = ClientFor(fixture);

            // Solo el precio rebajado: el resto viaja null = "no tocar".
            (await SaveFieldsAsync(client, product.Id, new CatalogFieldsBody(DiscountPrice: 700)))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            var view = await ReadViewAsync(client, product.Id);
            view.Description.Should().Be("Descripción original");
            view.PercentDiscountPrice.Should().Be(1000);
            view.DiscountPrice.Should().Be(700);
            view.IsNew.Should().BeTrue();
            view.Image.Should().Be("k/original.jpg");

            // El resto del producto (lo que esta vista NO edita) sigue intacto.
            var stored = await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .FirstAsync(p => p.Id == product.Id));
            stored.Name.Should().Be("Camisa");
            stored.Price.Should().Be(100m);
            stored.Order.Should().Be(1);
            stored.BusinessId.Should().Be(product.BusinessId);
            stored.AvailableToSale.Should().BeTrue();
            stored.IsActive.Should().BeTrue();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Remove_image_clears_the_main_image_only()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m,
                image: "k/main.jpg", gallery: new[] { "k/main.jpg", "k/2.jpg" });
            var client = ClientFor(fixture);

            (await SaveFieldsAsync(client, product.Id, new CatalogFieldsBody(RemoveImage: true)))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            var view = await ReadViewAsync(client, product.Id);
            view.Image.Should().BeNull("removeImage limpia la principal");
            view.Images.Should().BeEquivalentTo(new[] { "k/main.jpg", "k/2.jpg" },
                "la galería es un dato aparte: limpiar la principal no borra archivos");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Values_out_of_range_are_rejected_without_touching_the_product()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);
            var client = ClientFor(fixture);

            (await SaveFieldsAsync(client, product.Id, new CatalogFieldsBody(PercentDiscountPrice: 10001)))
                .StatusCode.Should().Be(HttpStatusCode.BadRequest, "el % máximo es 100.00 (10000 escalado)");
            (await SaveFieldsAsync(client, product.Id, new CatalogFieldsBody(DiscountPrice: -1)))
                .StatusCode.Should().Be(HttpStatusCode.BadRequest, "un monto rebajado negativo no es un descuento");
            (await SaveFieldsAsync(client, product.Id,
                    new CatalogFieldsBody(Description: new string('x', ProductEntityLimits.DescriptionMaxLength + 1))))
                .StatusCode.Should().Be(HttpStatusCode.BadRequest, "la descripción tiene un tope de 4000 caracteres");
            (await SaveFieldsAsync(client, product.Id,
                    new CatalogFieldsBody(Image: new string('k', ProductEntityLimits.ImagePathMaxLength + 1))))
                .StatusCode.Should().Be(HttpStatusCode.BadRequest, "la clave de imagen tiene un tope de 512 caracteres");

            var view = await ReadViewAsync(client, product.Id);
            view.Description.Should().BeEmpty();
            view.PercentDiscountPrice.Should().Be(0);
            view.DiscountPrice.Should().Be(0);
            view.Image.Should().BeNull();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task A_product_of_another_store_is_not_found_and_never_edited()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        var other = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var otherCategory = await WebCatalogSeed.AddCategoryAsync(_f, other, "Ajena");
            var otherProduct = await WebCatalogSeed.AddProductAsync(_f, other, otherCategory.Id, "Pantalón", 50m);

            var response = await SaveFieldsAsync(ClientFor(fixture), otherProduct.Id,
                new CatalogFieldsBody(Description: "no debería entrar"));

            response.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "el catálogo de una tienda no edita los productos de otra (404 uniforme)");
            (await SaveFieldsAsync(ClientFor(fixture), Guid.NewGuid(), new CatalogFieldsBody(Description: "x")))
                .StatusCode.Should().Be(HttpStatusCode.NotFound);

            (await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .FirstAsync(p => p.Id == otherProduct.Id))).Description.Should().BeEmpty();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
            await WebCatalogSeed.CleanupAsync(_f, other);
        }
    }

    [Fact]
    public async Task Saving_the_fields_requires_the_module()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f, withWebCatalogModule: false);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            var response = await SaveFieldsAsync(ClientFor(fixture), product.Id,
                new CatalogFieldsBody(Description: "x"));

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "sin el módulo 18 el Owner no entra a la vista del catálogo");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task The_public_catalog_shows_exactly_what_the_view_saved()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);
            var client = ClientFor(fixture);

            // La vista guarda los campos y sube la imagen principal.
            (await SaveFieldsAsync(client, product.Id, new CatalogFieldsBody(
                Description: "Primera línea\nSegunda línea con <b>etiquetas</b>", PercentDiscountPrice: 1250,
                DiscountPrice: 500, IsNew: true))).StatusCode.Should().Be(HttpStatusCode.OK);

            using var upload = WebCatalogSeed.BuildImageUpload(TinyJpeg, "main.jpg", "image/jpeg");
            var uploadResponse = await client.PostAsync($"/api/v1/catalog/products/{product.Id}/images", upload);
            uploadResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            string key = (await uploadResponse.Content.ReadFromJsonAsync<ApiResponse<string>>(ApiResponse.Json))!.Data!;
            (await SaveFieldsAsync(client, product.Id, new CatalogFieldsBody(Image: key)))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            (await client.PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();

            var body = await _f.CreateClient().GetFromJsonAsync<ApiResponse<PublicProductDto>>(
                $"/api/v1/public/catalog/{fixture.Slug}/products/{product.Id}", ApiResponse.Json);

            var published = body!.Data!;
            published.Description.Should().Be("Primera línea\nSegunda línea con <b>etiquetas</b>",
                "la descripción llega en texto plano, con sus saltos de línea y sin interpretar HTML (D9)");
            published.PercentDiscount.Should().Be(12.5m);
            published.DiscountAmount.Should().Be(5m);
            published.FinalPrice.Should().Be(82.5m);
            published.IsNew.Should().BeTrue();
            published.ImageUrl.Should().Be($"/api/v1/public/catalog/{fixture.Slug}/media/{key}");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Removing_the_main_image_from_the_gallery_leaves_no_dangling_pointer()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m,
                image: "k/main.jpg", gallery: new[] { "k/main.jpg", "k/2.jpg" });
            var client = ClientFor(fixture);

            var response = await client.DeleteAsync(
                $"/api/v1/catalog/products/{product.Id}/images?path={Uri.EscapeDataString("k/main.jpg")}");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var view = await ReadViewAsync(client, product.Id);
            view.Image.Should().BeNull("la principal no puede apuntar a un archivo borrado");
            view.Images.Should().BeEquivalentTo(new[] { "k/2.jpg" });
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// El POS es offline-first (D11): un producto puede existir SOLO en el dispositivo cuando la
    /// vista guarda sus campos. El comando acepta los hechos y crea el espejo con el id del POS,
    /// así que el producto queda listo para editar en la lista sin haber sincronizado antes.
    /// </summary>
    [Fact]
    public async Task A_product_that_only_exists_on_the_device_is_created_from_the_facts_the_view_sends()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var client = ClientFor(fixture);
            // El id es el que ya generó el POS: el espejo lo respeta para que la copia publicada
            // siga siendo 1:1 con el origen.
            var deviceProductId = Guid.NewGuid();

            var response = await client.PutAsJsonAsync($"/api/v1/catalog/products/{deviceProductId}", new
            {
                categoryId = category.Id,
                name = "Camisa del dispositivo",
                price = 120m,
                order = 3,
                availableToSale = true,
                isActive = true,
                discountFromInventory = false,
                description = "Vino del POS",
                percentDiscountPrice = 1250,
                isNew = true,
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "los hechos del producto son lo que hace falta para crear el espejo");

            var mirror = await QueryAsync(db => db.Set<Product>().IgnoreQueryFilters()
                .FirstAsync(p => p.Id == deviceProductId));
            mirror.CategoryId.Should().Be(category.Id);
            mirror.Name.Should().Be("Camisa del dispositivo");
            mirror.Price.Should().Be(120m);
            mirror.Order.Should().Be(3);
            mirror.DiscountFromInventory.Should().BeFalse();
            mirror.Description.Should().Be("Vino del POS");
            mirror.PercentDiscountPrice.Should().Be(1250);

            var view = await ReadViewAsync(client, deviceProductId);
            view.Name.Should().Be("Camisa del dispositivo");
            view.FinalPrice.Should().Be(105m, "120 menos el 12.50 % de descuento (D7)");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }
}
