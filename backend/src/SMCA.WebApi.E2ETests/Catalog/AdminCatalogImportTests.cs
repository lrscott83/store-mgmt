using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Import CSV del catálogo web por el SuperAdmin (`POST /api/v1/stores/{storeId}/catalog/import`,
/// 2026-10-22): categoría, producto, precio de venta y moneda. Es un UPSERT por (categoría +
/// producto) —crea lo que falta y actualiza SOLO precio y moneda— y el catálogo publica
/// directamente esas filas, así que lo importado tiene que quedar visible en el endpoint público
/// (slug de tienda y de categoría generados en el propio import).
/// </summary>
[Collection("e2e")]
public sealed class AdminCatalogImportTests
{
    private readonly AppTestFactory _f;

    public AdminCatalogImportTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record CsvRow(string CategoryName, string ProductName, decimal Price, int? Currency);

    private sealed record ImportSummaryDto(int CategoriesCreated, int ProductsCreated, int ProductsUpdated,
        int RowsProcessed);

    /// <summary>La API serializa los enums como CADENA (`"USD"`), no como número.</summary>
    private sealed record AdminProductDto(Guid Id, string Name, decimal Price, string Currency, string CategoryName);

    private sealed record AdminStatusDto(int SourceProductsCount);

    private static string AdminLogin() => $"sa-import-{Guid.NewGuid():N}@test.com";

    private static Task<HttpResponseMessage> ImportAsync(HttpClient client, Guid storeId,
        IEnumerable<CsvRow> rows)
        => client.PostAsJsonAsync($"/api/v1/stores/{storeId}/catalog/import", new { rows });

    [Fact]
    public async Task SuperAdmin_import_creates_categories_and_products_and_publishes_them()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var response = await ImportAsync(DbTestHelpers.AuthedClient(_f, saId, login), store.StoreId, [
                new CsvRow("Bebidas", "Café", 2.50m, null),
                new CsvRow("Postres", "Flan", 3.00m, 1),
            ]);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<ImportSummaryDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().Be(new ImportSummaryDto(2, 2, 0, 2));

            // La tienda nace sin catálogo: el import tiene que haber generado su slug público.
            var publicCatalog = await _f.CreateClient().GetFromJsonAsync<ApiResponse<PublicCatalogDto>>(
                $"/api/v1/public/catalog/{store.Slug}", ApiResponse.Json);
            publicCatalog!.Succeeded.Should().BeTrue();
            publicCatalog.Data!.Categories.Should().HaveCount(2);
            publicCatalog.Data.Categories.Select(category => category.Name)
                .Should().BeEquivalentTo(["Bebidas", "Postres"]);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Reimport_updates_price_and_currency_without_duplicating()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, login);
            (await ImportAsync(client, store.StoreId, [new CsvRow("Bebidas", "Café", 2.50m, 0)]))
                .EnsureSuccessStatusCode();

            var second = await ImportAsync(client, store.StoreId, [new CsvRow("bebidas", "café", 9.99m, 1)]);

            second.StatusCode.Should().Be(HttpStatusCode.OK);
            var summary = await second.Content.ReadFromJsonAsync<ApiResponse<ImportSummaryDto>>(ApiResponse.Json);
            summary!.Data.Should().Be(new ImportSummaryDto(0, 0, 1, 1));

            var products = await client.GetFromJsonAsync<ApiResponse<List<AdminProductDto>>>(
                $"/api/v1/stores/{store.StoreId}/catalog/products", ApiResponse.Json);
            products!.Data!.Should().ContainSingle();
            products.Data![0].Name.Should().Be("Café");
            products.Data[0].Price.Should().Be(9.99m);
            products.Data[0].Currency.Should().Be("USD");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task An_invalid_row_rejects_the_whole_import()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, login);

            var response = await ImportAsync(client, store.StoreId, [
                new CsvRow("Bebidas", "Café", 2.50m, null),
                new CsvRow("Bebidas", "Producto con precio inválido", -1m, null),
            ]);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            // Nada se escribió: ni la fila válida ni la categoría.
            var status = await client.GetFromJsonAsync<ApiResponse<AdminStatusDto>>(
                $"/api/v1/stores/{store.StoreId}/catalog/status", ApiResponse.Json);
            status!.Data!.SourceProductsCount.Should().Be(0);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task An_empty_rows_list_is_rejected_with_400()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var response = await ImportAsync(DbTestHelpers.AuthedClient(_f, saId, login), store.StoreId, []);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task A_currency_outside_the_enum_is_rejected_with_400()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var response = await ImportAsync(DbTestHelpers.AuthedClient(_f, saId, login), store.StoreId,
                [new CsvRow("Bebidas", "Café", 2.50m, 99)]);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task Duplicate_rows_in_one_file_are_processed_once_with_the_last_value()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, login);

            var response = await ImportAsync(client, store.StoreId, [
                new CsvRow("Bebidas", "Café", 2.50m, null),
                new CsvRow("bebidas", "café", 5.00m, 1),
            ]);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var summary = await response.Content.ReadFromJsonAsync<ApiResponse<ImportSummaryDto>>(ApiResponse.Json);
            // Una sola fila efectiva: se crea UNA vez (no se "actualiza" lo que se acaba de crear) y
            // gana el último valor del archivo.
            summary!.Data.Should().Be(new ImportSummaryDto(1, 1, 0, 1));

            var products = await client.GetFromJsonAsync<ApiResponse<List<AdminProductDto>>>(
                $"/api/v1/stores/{store.StoreId}/catalog/products", ApiResponse.Json);
            products!.Data!.Should().ContainSingle();
            products.Data![0].Price.Should().Be(5.00m);
            products.Data[0].Currency.Should().Be("USD");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task An_existing_category_without_a_slug_is_published_after_the_import()
    {
        var login = AdminLogin();
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            // Categoría preexistente SIN slug (nunca sincronizada): el import debe rellenarlo o el
            // catálogo público la filtra fuera y lo importado quedaría invisible.
            await WebCatalogSeed.AddCategoryAsync(_f, store, "Bebidas");

            var response = await ImportAsync(DbTestHelpers.AuthedClient(_f, saId, login), store.StoreId,
                [new CsvRow("Bebidas", "Café", 2.50m, null)]);
            response.EnsureSuccessStatusCode();

            var publicCatalog = await _f.CreateClient().GetFromJsonAsync<ApiResponse<PublicCatalogDto>>(
                $"/api/v1/public/catalog/{store.Slug}", ApiResponse.Json);
            publicCatalog!.Data!.Categories.Should().ContainSingle()
                .Which.Name.Should().Be("Bebidas");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_cannot_import_returns_403()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var response = await ImportAsync(
                DbTestHelpers.AuthedClient(_f, store.UserId, store.Login), store.StoreId,
                [new CsvRow("Bebidas", "Café", 2.50m, null)]);

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
        }
    }
}
