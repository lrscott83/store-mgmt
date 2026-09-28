using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// El módulo WebCatalog (18) es la puerta del catálogo: sin el módulo activo en la tienda
/// seleccionada, ni el estado ni la sincronización ni las imágenes responden (403). El módulo es
/// POR TIENDA: tenerlo en otra tienda del mismo Owner no habilita nada (plan 2026-09-27, D5).
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogModuleGatingTests
{
    private readonly AppTestFactory _f;

    public WebCatalogModuleGatingTests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientFor(WebCatalogSeed.StoreFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    [Theory]
    [InlineData("GET", "/api/v1/catalog/status")]
    [InlineData("POST", "/api/v1/catalog/sync")]
    public async Task Catalog_endpoints_forbid_a_store_without_the_module(string method, string url)
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f, withWebCatalogModule: false);
        try
        {
            var client = ClientFor(fixture);
            var response = method == "GET"
                ? await client.GetAsync(url)
                : await client.PostAsJsonAsync(url, new { });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "sin el módulo 18 el Owner no ve el catálogo web");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Image_upload_is_forbidden_without_the_module()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f, withWebCatalogModule: false);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            using var content = WebCatalogSeed.BuildImageUpload(new byte[] { 0xFF, 0xD8, 0xFF, 0xD9 }, "f.jpg", "image/jpeg");
            var response = await ClientFor(fixture)
                .PostAsync($"/api/v1/catalog/products/{product.Id}/images", content);

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Catalog_endpoints_allow_a_store_with_the_module()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = ClientFor(fixture);

            (await client.GetAsync("/api/v1/catalog/status")).StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PostAsJsonAsync("/api/v1/catalog/sync", new { })).StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task An_owner_with_the_module_in_another_store_gets_nothing_here()
    {
        // Dos tiendas del mismo Owner: el módulo está en la primera y la sesión apunta a la
        // segunda, así que el catálogo debe seguir cerrado (el gating es por tienda, no por Owner).
        var withModule = await WebCatalogSeed.SeedOwnerAsync(_f);
        var withoutModule = await WebCatalogSeed.SeedOwnerAsync(_f, withWebCatalogModule: false);
        try
        {
            var response = await ClientFor(withoutModule).GetAsync("/api/v1/catalog/status");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            var allowed = await ClientFor(withModule).GetAsync("/api/v1/catalog/status");
            allowed.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, withModule);
            await WebCatalogSeed.CleanupAsync(_f, withoutModule);
        }
    }
}
