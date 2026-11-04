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
/// T12 / S7.1 — la allowlist de imágenes del catálogo web tiene DOS señales (extensión del nombre y
/// content type) y el contrato es que basta con que UNA de ellas esté fuera para rechazar el archivo.
///
/// La regla vive en <c>CatalogImageUploadRules.EnsureValid</c> y es compartida por las tres puertas
/// del catálogo (imágenes de producto, marca y showcase), así que el defecto se fija por UNA de
/// ellas —la ruta SuperAdmin del showcase— en lugar de repetirlo tres veces.
///
/// El par de casos de rechazo son simétricos a propósito: cada uno deja la OTRA señal dentro de la
/// allowlist, de modo que un arreglo que solo mirara una de las dos señales seguiría fallando el
/// otro. El tercer caso es el control positivo: las dos señales permitidas siguen aceptándose, así
/// que los dos rechazos no pueden ser el resultado de una negativa en bloque.
///
/// Las aserciones son de estado HTTP y de estado OBSERVABLE (las dos listas del showcase vacías):
/// nunca del texto localizado del error ni de <c>Errors[0].Code</c>.
/// </summary>
[Collection("e2e")]
public sealed class CatalogImageAllowlistE2ETests
{
    /// <summary>
    /// JPEG mínimo: SOI + segmento APP0/JFIF + EOI. Doce bytes bastan porque el endpoint valida
    /// FORMATO y TAMAÑO (extensión/content-type y tope de 2 MB), no decodifica la imagen.
    /// </summary>
    private static readonly byte[] TinyJpeg =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    /// <summary>`StoreCatalogImageKind`: 0 = carrusel, 1 = imágenes del día.</summary>
    private const int Carousel = 0;

    private readonly AppTestFactory _f;

    public CatalogImageAllowlistE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>`Kind` viaja como NÚMERO (0 = carrusel, 1 = imágenes del día).</summary>
    private sealed record ShowcaseImageDto(Guid Id, int Kind, string Key, int OrderIndex, string? Caption);

    private sealed record ShowcaseImagesDto(List<ShowcaseImageDto> Carousel, List<ShowcaseImageDto> Daily);

    private static string ShowcaseUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog/showcase";

    /// <summary>
    /// Multipart del alta con las DOS señales elegidas por el test: el nombre del archivo lleva la
    /// extensión y el header del contenido lleva el content type.
    /// </summary>
    private static MultipartFormDataContent UploadForm(string fileName, string contentType, int kind = Carousel)
    {
        var file = new ByteArrayContent(TinyJpeg);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);

        return new MultipartFormDataContent
        {
            { new StringContent(kind.ToString()), "kind" },
            { file, "file", fileName },
        };
    }

    private static async Task<ShowcaseImagesDto> ReadAsync(HttpClient client, Guid storeId)
    {
        var response = await client.GetAsync(ShowcaseUrl(storeId));
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<ShowcaseImagesDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private async Task<(WebCatalogSeed.StoreFixture Store, Guid SuperAdminId, HttpClient Client)> SeedAsync()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        string login = $"sa-allowlist-{Guid.NewGuid():N}@test.com";
        Guid superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        return (store, superAdminId, DbTestHelpers.AuthedClient(_f, superAdminId, login));
    }

    /// <summary>
    /// Las imágenes de showcase tienen FK `Restrict` a `Store` y el seed de catálogo no las borra:
    /// hay que quitarlas (y `StoreCatalogSettings`) ANTES del grafo de la tienda.
    /// </summary>
    private async Task CleanupAsync(WebCatalogSeed.StoreFixture store, Guid superAdminId)
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
        await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
    }

    /// <summary>
    /// S7.1 — la EXTENSIÓN está dentro de la allowlist (`showcase.jpg`) y el CONTENT TYPE no
    /// (`text/plain`): el archivo se rechaza igual, porque el content type declara que lo que se
    /// sirve no es una imagen.
    /// </summary>
    [Fact]
    public async Task Post_showcase_with_an_allowed_extension_and_a_disallowed_content_type_is_rejected_with_400()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            using var content = UploadForm("showcase.jpg", "text/plain");

            var response = await client.PostAsync(ShowcaseUrl(store.StoreId), content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "la extensión permitida no puede rescatar un content type fuera de la allowlist");

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().BeEmpty("un archivo rechazado no deja fila en el conjunto");
            images.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }

    /// <summary>
    /// S7.1 — el caso espejo: el CONTENT TYPE está dentro de la allowlist (`image/jpeg`) y la
    /// EXTENSIÓN no (`showcase.txt`). Un arreglo que solo mirara el content type pasaría este caso y
    /// fallaría el anterior, por eso los dos están.
    /// </summary>
    [Fact]
    public async Task Post_showcase_with_a_disallowed_extension_and_an_allowed_content_type_is_rejected_with_400()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            using var content = UploadForm("showcase.txt", "image/jpeg");

            var response = await client.PostAsync(ShowcaseUrl(store.StoreId), content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "el content type permitido no puede rescatar una extensión fuera de la allowlist");

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().BeEmpty("un archivo rechazado no deja fila en el conjunto");
            images.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }

    /// <summary>
    /// CONTROL POSITIVO — con las dos señales dentro de la allowlist el alta sigue siendo 200 y deja
    /// exactamente una fila. Sin este caso, dos rechazos vacíos podrían pasar por un arreglo correcto
    /// cuando en realidad el endpoint no acepta nada.
    /// </summary>
    [Fact]
    public async Task Post_showcase_with_both_signals_allowed_is_accepted()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            using var content = UploadForm("showcase.jpg", "image/jpeg");

            var response = await client.PostAsync(ShowcaseUrl(store.StoreId), content);

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "las dos señales permitidas son la forma válida de subir una imagen");

            var body = await response.Content.ReadFromJsonAsync<ApiResponse<ShowcaseImageDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Kind.Should().Be(Carousel);

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().ContainSingle("el alta aceptada escribe exactamente una fila");
            images.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }
}
