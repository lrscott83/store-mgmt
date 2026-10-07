using System.Net;
using System.Net.Http.Json;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Filtros de <c>IsActive</c> del catálogo público anónimo (odd/tasks/webcatalog-active-filters.md).
/// El endpoint público nunca lee Owner ni User, así que desactivar cualquiera de los dos NO apagaba
/// el catálogo web de sus tiendas: seguía servido completo para cualquiera con el slug.
/// <para>
/// Estos tests fijan el comportamiento buscado: Owner o User inactivos apagan el catálogo COMPLETO y
/// los tres endpoints públicos responden el MISMO 404 que un slug desconocido — igual que ya hace
/// una tienda inactiva y que ya fija <c>Unknown_slug_returns_the_same_404_for_every_endpoint</c>.
/// El header sí devuelve 404 (no una cabecera vacía): el catálogo de una tienda desactivada deja de
/// existir, no se vacía.
/// </para>
/// Precedente: <c>AuthMeInactiveStoreOwnerTests</c> afirma lo mismo para <c>/api/v1/auth/me</c>.
/// </summary>
[Collection("e2e")]
public sealed class WebCatalogPublicInactiveOwnerTests
{
    private readonly AppTestFactory _f;
    private readonly HttpClient _client;

    public WebCatalogPublicInactiveOwnerTests(WebAppFixture fixture)
    {
        _f = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Inactive_owner_hides_the_whole_public_catalog()
    {
        var published = await SeedPublishedCatalogAsync();
        try
        {
            // Precondición: con Owner y User activos el catálogo se sirve en los tres endpoints.
            await AssertPublicCatalogIsServedAsync(published);

            await SetIsActiveAsync<Owner>(published.Fixture.OwnerId, false);

            await AssertPublicCatalogIsNotServedAsync(published);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, published.Fixture);
        }
    }

    [Fact]
    public async Task Inactive_owner_user_hides_the_whole_public_catalog()
    {
        var published = await SeedPublishedCatalogAsync();
        try
        {
            // Precondición: con Owner y User activos el catálogo se sirve en los tres endpoints.
            await AssertPublicCatalogIsServedAsync(published);

            await SetIsActiveAsync<User>(published.Fixture.UserId, false);

            await AssertPublicCatalogIsNotServedAsync(published);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, published.Fixture);
        }
    }

    [Fact]
    public async Task Inactive_store_keeps_hiding_the_whole_public_catalog()
    {
        // Guarda del filtro Store.IsActive que ya existía: el cambio de Owner/User no debe relajarlo.
        var published = await SeedPublishedCatalogAsync();
        try
        {
            await AssertPublicCatalogIsServedAsync(published);

            await SetIsActiveAsync<Store>(published.Fixture.StoreId, false);

            await AssertPublicCatalogIsNotServedAsync(published);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, published.Fixture);
        }
    }

    private sealed record Published(WebCatalogSeed.StoreFixture Fixture, Guid ProductId);

    /// <summary>
    /// Tienda con el módulo de catálogo, una categoría y un producto, ya sincronizada (o sea, con
    /// <c>CatalogSlug</c> asignado). La sincronización va con la sesión del dueño porque TODAVÍA está
    /// activo: es el estado desde el que se desactiva a continuación.
    /// </summary>
    private async Task<Published> SeedPublishedCatalogAsync()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
        var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

        var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
        (await ownerClient.PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();

        return new Published(fixture, product.Id);
    }

    /// <summary>
    /// ExecuteUpdateAsync porque <c>ApplicationDbContext</c> es NoTracking por defecto; e
    /// IgnoreQueryFilters porque Owner y User filtran por tenant y no hay sesión en este scope.
    /// </summary>
    private async Task SetIsActiveAsync<TEntity>(Guid id, bool isActive) where TEntity : class
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<TEntity>().IgnoreQueryFilters()
            .Where(entity => EF.Property<Guid>(entity, "Id") == id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(entity => EF.Property<bool>(entity, "IsActive"), isActive));
    }

    private async Task AssertPublicCatalogIsServedAsync(Published published)
    {
        string slug = published.Fixture.Slug;

        var header = await _client.GetFromJsonAsync<ApiResponse<PublicCatalogDto>>(
            $"/api/v1/public/catalog/{slug}", ApiResponse.Json);
        header!.Succeeded.Should().BeTrue("el catálogo de una tienda activa con Owner y User activos se sirve");
        header.Data!.Categories.Should().ContainSingle("la categoría sembrada es visible en la cabecera");

        var page = await _client.GetFromJsonAsync<ApiResponse<PublicPageDto>>(
            $"/api/v1/public/catalog/{slug}/products", ApiResponse.Json);
        page!.Data!.Items.Should().ContainSingle("el producto sembrado es visible en el listado");

        var detail = await _client.GetFromJsonAsync<ApiResponse<PublicProductDto>>(
            $"/api/v1/public/catalog/{slug}/products/{published.ProductId}", ApiResponse.Json);
        detail!.Succeeded.Should().BeTrue("el producto sembrado tiene detalle público");
    }

    private async Task AssertPublicCatalogIsNotServedAsync(Published published)
    {
        string slug = published.Fixture.Slug;

        var header = await _client.GetAsync($"/api/v1/public/catalog/{slug}");
        header.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "la cabecera del catálogo público no se sirve cuando Owner, User o Store están inactivos");

        var listing = await _client.GetAsync($"/api/v1/public/catalog/{slug}/products");
        listing.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "el listado responde el mismo 404 que la cabecera: el catálogo deja de existir, no se vacía");

        var detail = await _client.GetAsync($"/api/v1/public/catalog/{slug}/products/{published.ProductId}");
        detail.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "el detalle responde el mismo 404 que la cabecera");

        var body = await header.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.ActionCode.Should().Be(404);
    }
}
