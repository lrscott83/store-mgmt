using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Alta directa de categorías y productos desde la vista SuperAdmin del catálogo
/// (2026-10-26): se escriben en las MISMAS tablas del catálogo (`ProductCategory`/`Product`),
/// así que lo creado tiene que aparecer de inmediato en los endpoints de lectura de esa vista,
/// con descripción, moneda y orden, y aceptar la imagen principal con el endpoint existente.
/// </summary>
[Collection("e2e")]
public sealed class AdminCatalogCreateTests
{
    private static readonly byte[] TinyJpeg =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    private readonly AppTestFactory _f;

    public AdminCatalogCreateTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record CategoryDto(Guid Id, string Name, int Order);

    private sealed record CreatedProductDto(Guid Id);

    private sealed record AdminProductDto(Guid Id, Guid CategoryId, string CategoryName, string Name,
        decimal Price, string Currency, int Order, bool AvailableToSale, string Description,
        string? Image, List<string> Images);

    private static string AdminLogin() => $"sa-create-{Guid.NewGuid():N}@test.com";

    private static string CategoriesUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog/categories";

    private static string ProductsUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog/products";

    private static async Task<List<CategoryDto>> ReadCategoriesAsync(HttpClient client, Guid storeId)
    {
        var body = await client.GetFromJsonAsync<ApiResponse<List<CategoryDto>>>(
            CategoriesUrl(storeId), ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private static async Task<List<AdminProductDto>> ReadProductsAsync(HttpClient client, Guid storeId)
    {
        var body = await client.GetFromJsonAsync<ApiResponse<List<AdminProductDto>>>(
            ProductsUrl(storeId), ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private static async Task<CategoryDto> CreateCategoryAsync(HttpClient client, Guid storeId, object body)
    {
        var response = await client.PostAsJsonAsync(CategoriesUrl(storeId), body);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var created = await response.Content.ReadFromJsonAsync<ApiResponse<CategoryDto>>(ApiResponse.Json);
        created!.Succeeded.Should().BeTrue();
        return created.Data!;
    }

    private static async Task<CreatedProductDto> CreateProductAsync(HttpClient client, Guid storeId, object body)
    {
        var response = await client.PostAsJsonAsync(ProductsUrl(storeId), body);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var created = await response.Content.ReadFromJsonAsync<ApiResponse<CreatedProductDto>>(ApiResponse.Json);
        created!.Succeeded.Should().BeTrue();
        return created.Data!;
    }

    /// <summary>
    /// S1/S3: la categoría nueva entra en el listado de la vista con su slug generado y su orden
    /// al final, y aparece como un panel VACÍO (la vista admin arma los paneles con la lista de
    /// categorías, no solo con los productos).
    /// </summary>
    [Fact]
    public async Task SuperAdmin_creates_categories_that_show_as_empty_panels()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            var first = await CreateCategoryAsync(sa, store.StoreId, new { name = "Bebidas" });
            first.Id.Should().NotBe(Guid.Empty);
            first.Name.Should().Be("Bebidas");
            first.Order.Should().Be(1);

            // Sin `order` explícito el alta va al final, y el nombre se recorta.
            var second = await CreateCategoryAsync(sa, store.StoreId, new { name = "  Postres  " });
            second.Name.Should().Be("Postres");
            second.Order.Should().Be(2);

            var categories = await ReadCategoriesAsync(sa, store.StoreId);
            categories.Select(category => category.Name).Should().Equal("Bebidas", "Postres");
            categories.Select(category => category.Order).Should().Equal(1, 2);

            // El panel vacío: la categoría existe pero todavía no tiene ningún producto.
            (await ReadProductsAsync(sa, store.StoreId)).Should().BeEmpty();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>S1: el nombre es único por tienda sin distinguir mayúsculas, y un rechazo no escribe nada.</summary>
    [Fact]
    public async Task A_duplicate_category_name_is_rejected_without_writing_a_second_row()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);
            await CreateCategoryAsync(sa, store.StoreId, new { name = "Bebidas" });

            var duplicate = await sa.PostAsJsonAsync(CategoriesUrl(store.StoreId), new { name = "bebidas" });

            duplicate.StatusCode.Should().Be(HttpStatusCode.Conflict);
            var body = await duplicate.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().ContainSingle();
            body.Errors[0].Description.Should().NotBeNullOrWhiteSpace();

            (await ReadCategoriesAsync(sa, store.StoreId)).Should().ContainSingle();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>
    /// S2/S6: el producto creado es un producto REAL de la tienda (en venta, sin depender de una
    /// sincronización) con descripción y moneda, y su orden va al final dentro de la categoría.
    /// </summary>
    [Fact]
    public async Task SuperAdmin_creates_a_product_with_description_and_currency()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);
            var category = await CreateCategoryAsync(sa, store.StoreId, new { name = "Bebidas" });

            var created = await CreateProductAsync(sa, store.StoreId, new
            {
                categoryId = category.Id,
                name = "  Café  ",
                price = 2.50m,
                currency = 1, // USD
                description = "  Café de altura  ",
            });

            var product = (await ReadProductsAsync(sa, store.StoreId)).Single(item => item.Id == created.Id);
            product.Name.Should().Be("Café");
            product.Price.Should().Be(2.50m);
            product.Currency.Should().Be("USD");
            product.Description.Should().Be("Café de altura");
            product.CategoryId.Should().Be(category.Id);
            product.CategoryName.Should().Be("Bebidas");
            product.Order.Should().Be(1);
            product.AvailableToSale.Should().BeTrue();
            // S2: sin imagen subida, el producto queda SIN imagen principal.
            product.Image.Should().BeNull();
            product.Images.Should().BeEmpty();

            // Segunda alta sin moneda ni orden: CUP por defecto y el orden va al final.
            var second = await CreateProductAsync(sa, store.StoreId, new
            {
                categoryId = category.Id,
                name = "Té",
                price = 3m,
            });
            var secondProduct = (await ReadProductsAsync(sa, store.StoreId)).Single(item => item.Id == second.Id);
            secondProduct.Currency.Should().Be("CUP");
            secondProduct.Order.Should().Be(2);

            // S6: sin pasar por "Sincronizar Catálogo", el producto ya está publicado: el alta
            // generó el slug público de la tienda y el de la categoría.
            var publicCatalog = await _f.CreateClient().GetFromJsonAsync<ApiResponse<PublicCatalogDto>>(
                $"/api/v1/public/catalog/{store.Slug}", ApiResponse.Json);
            publicCatalog!.Succeeded.Should().BeTrue();
            publicCatalog.Data!.Categories.Should().ContainSingle()
                .Which.Name.Should().Be("Bebidas");

            var publicProducts = await _f.CreateClient().GetFromJsonAsync<ApiResponse<PublicPageDto>>(
                $"/api/v1/public/catalog/{store.Slug}/products", ApiResponse.Json);
            publicProducts!.Data!.Items.Select(item => item.Name)
                .Should().BeEquivalentTo(["Café", "Té"]);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>La imagen principal se sube después del alta con el endpoint existente y fija `Product.Image`.</summary>
    [Fact]
    public async Task An_image_uploaded_after_the_create_becomes_the_main_image()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);
            var category = await CreateCategoryAsync(sa, store.StoreId, new { name = "Ropa" });
            var product = await CreateProductAsync(sa, store.StoreId, new
            {
                categoryId = category.Id,
                name = "Camisa",
                price = 10m,
            });

            using var form = WebCatalogSeed.BuildImageUpload(TinyJpeg, "principal.jpg", "image/jpeg");
            var upload = await sa.PostAsync(
                $"/api/v1/stores/{store.StoreId}/catalog/products/{product.Id}/images", form);
            upload.StatusCode.Should().Be(HttpStatusCode.OK);
            var uploadBody = await upload.Content.ReadFromJsonAsync<ApiResponse<string>>(ApiResponse.Json);
            string key = uploadBody!.Data!;
            key.Should().NotBeNullOrWhiteSpace();

            var saved = (await ReadProductsAsync(sa, store.StoreId)).Single(item => item.Id == product.Id);
            saved.Image.Should().Be(key);
            saved.Images.Should().Equal(key);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>
    /// Aislamiento: una categoría de OTRA tienda responde 404 y el producto NO se crea en la
    /// tienda de la ruta (ni en la de la categoría).
    /// </summary>
    [Fact]
    public async Task A_category_from_another_store_is_rejected_and_nothing_is_created()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var storeA = await WebCatalogSeed.SeedOwnerAsync(_f);
        var storeB = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var categoryB = await WebCatalogSeed.AddCategoryAsync(_f, storeB, "Cat B");
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            var response = await sa.PostAsJsonAsync(ProductsUrl(storeA.StoreId), new
            {
                categoryId = categoryB.Id,
                name = "Producto cruzado",
                price = 1m,
            });

            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
            (await ReadProductsAsync(sa, storeA.StoreId)).Should().BeEmpty();
            (await ReadProductsAsync(sa, storeB.StoreId)).Should().BeEmpty();
            (await ReadCategoriesAsync(sa, storeA.StoreId)).Should().BeEmpty();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, storeA);
            await WebCatalogSeed.CleanupAsync(_f, storeB);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>S7: los tres endpoints son exclusivos del SuperAdmin.</summary>
    [Fact]
    public async Task OwnerAdmin_gets_403_on_the_three_create_endpoints()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var owner = DbTestHelpers.AuthedClient(_f, store.UserId, store.Login);

            var checks = new (string Label, Func<Task<HttpResponseMessage>> Call)[]
            {
                ("GET categories", () => owner.GetAsync(CategoriesUrl(store.StoreId))),
                ("POST category", () => owner.PostAsJsonAsync(CategoriesUrl(store.StoreId), new { name = "Bebidas" })),
                ("POST product", () => owner.PostAsJsonAsync(ProductsUrl(store.StoreId),
                    new { categoryId = Guid.NewGuid(), name = "Café", price = 1m })),
            };

            var failures = new List<string>();
            foreach (var (label, call) in checks)
            {
                var response = await call();
                if (response.StatusCode != HttpStatusCode.Forbidden)
                    failures.Add($"{label} -> {(int)response.StatusCode}");
            }

            failures.Should().BeEmpty();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
        }
    }

    /// <summary>S7: sin sesión no se llega ni al handler.</summary>
    [Fact]
    public async Task Anonymous_gets_401_on_the_three_create_endpoints()
    {
        var client = _f.CreateClient();
        Guid store = Guid.NewGuid();

        var checks = new (string Label, Func<Task<HttpResponseMessage>> Call)[]
        {
            ("GET categories", () => client.GetAsync(CategoriesUrl(store))),
            ("POST category", () => client.PostAsJsonAsync(CategoriesUrl(store), new { name = "Bebidas" })),
            ("POST product", () => client.PostAsJsonAsync(ProductsUrl(store),
                new { categoryId = Guid.NewGuid(), name = "Café", price = 1m })),
        };

        var failures = new List<string>();
        foreach (var (label, call) in checks)
        {
            var response = await call();
            if (response.StatusCode != HttpStatusCode.Unauthorized)
                failures.Add($"{label} -> {(int)response.StatusCode}");
        }

        failures.Should().BeEmpty();
    }
}
