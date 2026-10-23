using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// SuperAdmin per-store catalog configuration (`/api/v1/stores/{storeId}/catalog/...`, 2026-10-22).
/// A SuperAdmin has NO selected store, so these endpoints must take the store from the ROUTE and
/// publish it as the request's store context — the same context every catalog handler already reads.
/// These tests pin the three things that can go wrong: the store not being taken from the route, a
/// non-SuperAdmin reaching the admin surface, and a store from one route leaking into another.
/// </summary>
[Collection("e2e")]
public sealed class AdminWebCatalogTests
{
    private readonly AppTestFactory _f;

    public AdminWebCatalogTests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>Subconjunto de `CatalogStatusDto` que el test necesita.</summary>
    private sealed record AdminCatalogStatusDto(string StoreSlug, int SourceProductsCount, int PublishedProductsCount);

    /// <summary>Subconjunto de `CatalogProductViewDto` que el test necesita.</summary>
    private sealed record AdminCatalogProductDto(Guid Id, string Name, string CategoryName);

    private static async Task SeedPublishedProductAsync(
        AppTestFactory factory, WebCatalogSeed.StoreFixture store, string categoryName, string productName)
    {
        var category = await WebCatalogSeed.AddCategoryAsync(factory, store, categoryName);
        await WebCatalogSeed.AddProductAsync(factory, store, category.Id, productName, 2.5m);
        (await DbTestHelpers.AuthedClient(factory, store.UserId, store.Login)
            .PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task SuperAdmin_reads_the_status_of_the_store_in_the_route()
    {
        var saLogin = $"sa-wcat-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SeedPublishedProductAsync(_f, store, "Bebidas", "Café con leche");

            var response = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .GetAsync($"/api/v1/stores/{store.StoreId}/catalog/status");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AdminCatalogStatusDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            // El slug es el de LA TIENDA DE LA RUTA: un SuperAdmin sin tienda seleccionada nunca
            // tendría uno propio, así que este valor solo puede venir del contexto de la ruta.
            body.Data!.StoreSlug.Should().Be(store.Slug);
            body.Data.SourceProductsCount.Should().Be(1);
            body.Data.PublishedProductsCount.Should().Be(1);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task SuperAdmin_reads_the_products_of_the_store_in_the_route_and_not_of_another()
    {
        var saLogin = $"sa-wcat-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var storeA = await WebCatalogSeed.SeedOwnerAsync(_f);
        var storeB = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SeedPublishedProductAsync(_f, storeA, "Categoría A", "Producto A");
            await SeedPublishedProductAsync(_f, storeB, "Categoría B", "Producto B");

            var response = await DbTestHelpers.AuthedClient(_f, saId, saLogin)
                .GetAsync($"/api/v1/stores/{storeA.StoreId}/catalog/products");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<AdminCatalogProductDto>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Should().ContainSingle().Which.Name.Should().Be("Producto A");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, storeA);
            await WebCatalogSeed.CleanupAsync(_f, storeB);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_cannot_use_the_superadmin_catalog_route()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, store.UserId, store.Login);

            (await client.GetAsync($"/api/v1/stores/{store.StoreId}/catalog/status")).StatusCode
                .Should().Be(HttpStatusCode.Forbidden);
            (await client.GetAsync($"/api/v1/stores/{store.StoreId}/catalog/branding")).StatusCode
                .Should().Be(HttpStatusCode.Forbidden);
            (await client.GetAsync($"/api/v1/stores/{store.StoreId}/catalog/showcase")).StatusCode
                .Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
        }
    }

    [Fact]
    public async Task Anonymous_cannot_use_the_superadmin_catalog_route()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            (await _f.CreateClient().GetAsync($"/api/v1/stores/{store.StoreId}/catalog/status")).StatusCode
                .Should().Be(HttpStatusCode.Unauthorized);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, store);
        }
    }
}
