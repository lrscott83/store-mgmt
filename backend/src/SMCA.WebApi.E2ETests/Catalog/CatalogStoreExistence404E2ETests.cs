using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// T14 / S7.3 — las dos lecturas SuperAdmin del catálogo tienen que distinguir "la tienda no existe"
/// de "la tienda existe y todavía no configuró nada".
///
/// Las dos mitades van juntas a propósito. Hoy las dos lecturas responden 200 SIEMPRE, porque
/// <c>AdminStoreScopeFilter</c> valida el GUID de la ruta pero no la existencia de la tienda
/// (<c>AdminStoreScopeAttribute.cs:54-58</c>) y los handlers solo consultan su propia tabla
/// (<c>GetStoreCatalogBrandingQuery.cs:54</c>, <c>GetStoreCatalogImagesQuery.cs:57</c>). El 404 de
/// tienda inexistente lo produce únicamente <c>PUT branding</c>
/// (<c>UpdateStoreCatalogBrandingCommand.cs:102-104</c>), y esa asimetría es el defecto que este
/// archivo fija.
///
/// El 200 con defaults para una tienda EXISTENTE sin fila es una decisión documentada en los dos
/// handlers (<c>GetStoreCatalogBrandingQuery.cs:18-22</c>, <c>GetStoreCatalogImagesQuery.cs:20-23</c>):
/// un frontend no puede modelar "sin configurar" como un error. Esos dos casos están aquí para que el
/// arreglo del 404 no se lleve por delante el contrato que debe sobrevivir.
/// </summary>
[Collection("e2e")]
public sealed class CatalogStoreExistence404E2ETests
{
    private readonly AppTestFactory _f;

    public CatalogStoreExistence404E2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record BrandingDto(string? LogoKey, string? BannerKey, string? PaletteId, int MobileColumns);

    private sealed record ShowcaseImageDto(Guid Id, int Kind, string Key, int OrderIndex, string? Caption);

    private sealed record ShowcaseImagesDto(List<ShowcaseImageDto> Carousel, List<ShowcaseImageDto> Daily);

    private static string BrandingUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog/branding";

    private static string ShowcaseUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog/showcase";

    private async Task<(Guid SuperAdminId, HttpClient Client)> SeedAsync()
    {
        string login = $"sa-existence-{Guid.NewGuid():N}@test.com";
        Guid superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        return (superAdminId, DbTestHelpers.AuthedClient(_f, superAdminId, login));
    }

    /// <summary>
    /// Las imágenes de showcase tienen FK `Restrict` a `Store` y el seed de catálogo no las borra:
    /// hay que quitarlas (y `StoreCatalogSettings`) ANTES del grafo de la tienda.
    /// </summary>
    private async Task CleanupStoreAsync(WebCatalogSeed.StoreFixture store)
    {
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Domain.Entities.StoreCatalogImages.StoreCatalogImage>().IgnoreQueryFilters()
                .Where(image => image.StoreId == store.StoreId).ExecuteDeleteAsync();
            await db.Set<Domain.Entities.StoreCatalogSettings.StoreCatalogSettings>().IgnoreQueryFilters()
                .Where(settings => settings.StoreId == store.StoreId).ExecuteDeleteAsync();
        }

        await WebCatalogSeed.CleanupAsync(_f, store);
    }

    /// <summary>
    /// S7.3 — un <c>storeId</c> que no existe no puede devolver "la tienda sin marca": esos defaults
    /// describen una tienda REAL que aún no configuró nada, y devolverlos para un id inventado
    /// esconde el error del cliente detrás de un 200.
    /// </summary>
    [Fact]
    public async Task Get_branding_of_a_store_that_does_not_exist_is_rejected_with_404()
    {
        var (superAdminId, client) = await SeedAsync();
        try
        {
            Guid unknownStore = Guid.NewGuid();

            var response = await client.GetAsync(BrandingUrl(unknownStore));

            response.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "la marca de una tienda inexistente no son los valores por defecto: es un 404");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    /// <summary>
    /// S7.3 — el mismo contrato para el escaparate: dos listas vacías significan "esta tienda no ha
    /// subido nada", no "este id no corresponde a ninguna tienda".
    /// </summary>
    [Fact]
    public async Task Get_showcase_of_a_store_that_does_not_exist_is_rejected_with_404()
    {
        var (superAdminId, client) = await SeedAsync();
        try
        {
            Guid unknownStore = Guid.NewGuid();

            var response = await client.GetAsync(ShowcaseUrl(unknownStore));

            response.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "el escaparate de una tienda inexistente no son dos listas vacías: es un 404");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    /// <summary>
    /// DECISIÓN QUE SOBREVIVE AL ARREGLO — una tienda que EXISTE y no tiene fila de marca devuelve
    /// 200 con los defaults (<c>GetStoreCatalogBrandingQuery.cs:63-69</c>): sin logo, sin banner y la
    /// paleta/columnas por defecto. Es el caso que un 404 demasiado celoso rompería.
    /// </summary>
    [Fact]
    public async Task Get_branding_of_an_existing_store_without_a_branding_row_returns_the_defaults()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var (superAdminId, client) = await SeedAsync();
        try
        {
            var response = await client.GetAsync(BrandingUrl(store.StoreId));

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "sin fila de marca la tienda no está rota: simplemente no configuró nada");

            var body = await response.Content.ReadFromJsonAsync<ApiResponse<BrandingDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.LogoKey.Should().BeNull();
            body.Data.BannerKey.Should().BeNull();
            body.Data.MobileColumns.Should().Be(2, "2 es el default documentado de columnas en móvil");
        }
        finally
        {
            await CleanupStoreAsync(store);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    /// <summary>
    /// DECISIÓN QUE SOBREVIVE AL ARREGLO — una tienda que EXISTE sin imágenes devuelve 200 con los
    /// DOS conjuntos vacíos (<c>GetStoreCatalogImagesQuery.cs:20-23</c>), no un 404 ni una lista
    /// ausente: el frontend publica dos bloques y los dos tienen que venir.
    /// </summary>
    [Fact]
    public async Task Get_showcase_of_an_existing_store_without_images_returns_both_empty_sets()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var (superAdminId, client) = await SeedAsync();
        try
        {
            var response = await client.GetAsync(ShowcaseUrl(store.StoreId));

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "una tienda sin imágenes no está rota: simplemente no subió nada");

            var body = await response.Content.ReadFromJsonAsync<ApiResponse<ShowcaseImagesDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Carousel.Should().NotBeNull().And.BeEmpty();
            body.Data.Daily.Should().NotBeNull().And.BeEmpty();
        }
        finally
        {
            await CleanupStoreAsync(store);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }
}
