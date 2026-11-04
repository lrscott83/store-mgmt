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
/// Reglas de los 4 endpoints de <c>AdminCatalogShowcaseController</c> por las rutas del SuperAdmin
/// (<c>/api/v1/stores/{storeId}/catalog/showcase...</c>): 401 anónimo, tope de 10 imágenes POR
/// (tienda, conjunto), las tres validaciones de forma del alta (kind, archivo, caption), el tipo de
/// archivo no permitido, el borrado de un id real de OTRA tienda y el reordenado que no cubre el
/// conjunto exacto con el orden persistido intacto.
///
/// <see cref="AdminWebCatalogCrudTests"/> cubre el camino feliz de estos mismos endpoints y
/// <see cref="AdminWebCatalogScopeProbes"/> el 403 del no-SuperAdmin; aquí van los rechazos,
/// verificados contra PostgreSQL (fila escrita o no escrita). Las aserciones son de estado HTTP y
/// de estado OBSERVABLE: nunca del texto localizado del error ni de <c>Errors[0].Code</c>, porque
/// <c>AcctionCode</c> no se rellena y ese código es siempre <c>App.Unexpected</c>.
/// </summary>
[Collection("e2e")]
public sealed class AdminShowcaseEndpointRulesE2ETests
{
    /// <summary>
    /// JPEG mínimo: SOI + segmento APP0/JFIF + EOI. Doce bytes bastan porque el endpoint valida
    /// FORMATO y TAMAÑO (extensión/content-type y tope de 2 MB), no decodifica la imagen.
    /// </summary>
    private static readonly byte[] TinyJpeg =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    /// <summary>`StoreCatalogImageKind`: 0 = carrusel, 1 = imágenes del día.</summary>
    private const int Carousel = 0;
    private const int Daily = 1;

    private readonly AppTestFactory _f;

    public AdminShowcaseEndpointRulesE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>`Kind` viaja como NÚMERO (0 = carrusel, 1 = imágenes del día).</summary>
    private sealed record ShowcaseImageDto(Guid Id, int Kind, string Key, int OrderIndex, string? Caption);

    private sealed record ShowcaseImagesDto(List<ShowcaseImageDto> Carousel, List<ShowcaseImageDto> Daily);

    private static string ShowcaseUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog/showcase";

    private static string OrderUrl(Guid storeId) => $"{ShowcaseUrl(storeId)}/order";

    /// <summary>
    /// Multipart del alta. <paramref name="bytes"/> null es el caso "multipart sin archivo": el
    /// controlador recibe <c>file = null</c> y manda longitud 0, que es la señal REAL que el
    /// validador mira.
    /// </summary>
    private static MultipartFormDataContent UploadForm(int kind, byte[]? bytes = null,
        string fileName = "showcase.jpg", string contentType = "image/jpeg", string? caption = null)
    {
        var content = new MultipartFormDataContent { { new StringContent(kind.ToString()), "kind" } };

        if (bytes is not null)
        {
            var file = new ByteArrayContent(bytes);
            file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
            content.Add(file, "file", fileName);
        }

        if (caption is not null)
            content.Add(new StringContent(caption), "caption");

        return content;
    }

    private static async Task<ShowcaseImageDto> UploadAsync(HttpClient client, Guid storeId, int kind,
        string? caption = null)
    {
        using var content = UploadForm(kind, TinyJpeg, caption: caption);
        var response = await client.PostAsync(ShowcaseUrl(storeId), content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<ShowcaseImageDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
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
        string login = $"sa-showcase-{Guid.NewGuid():N}@test.com";
        Guid superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        return (store, superAdminId, DbTestHelpers.AuthedClient(_f, superAdminId, login));
    }

    /// <summary>
    /// Las imágenes de showcase tienen FK `Restrict` a `Store` y el seed de catálogo no las borra:
    /// hay que quitarlas (y `StoreCatalogSettings`) ANTES del grafo de la tienda, o el borrado
    /// revienta y contamina la corrida siguiente.
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

    private async Task CleanupAsync(WebCatalogSeed.StoreFixture store, Guid superAdminId)
    {
        await CleanupStoreAsync(store);
        await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
    }

    /// <summary>
    /// 10.3/10.4/10.5/10.6 — 401 anónimo en los CUATRO endpoints. Los filtros de autorización corren
    /// antes del binding y del scope de tienda, así que un cuerpo vacío y un id de tienda que no
    /// existe son suficientes: no se siembra nada porque nada se escribe.
    /// </summary>
    [Fact]
    public async Task Anonymous_is_rejected_with_401_on_all_the_showcase_endpoints()
    {
        var client = _f.CreateClient();
        Guid storeId = Guid.NewGuid();

        var get = await client.GetAsync(ShowcaseUrl(storeId));
        get.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var post = await client.PostAsync(ShowcaseUrl(storeId), new MultipartFormDataContent());
        post.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var delete = await client.DeleteAsync($"{ShowcaseUrl(storeId)}/{Guid.NewGuid()}");
        delete.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var reorder = await client.PutAsJsonAsync(OrderUrl(storeId),
            new { kind = Carousel, orderedIds = Array.Empty<Guid>() });
        reorder.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>
    /// 10.4 — el tope es 10 y es POR (tienda, conjunto), no global. La 11ª subida del carrusel la
    /// rechaza el conteo TEMPRANO del handler (`AddStoreCatalogImageCommand.cs:100-107`), que corre
    /// ANTES de validar el archivo — por eso el contenido da igual aquí; y el código es 400, nunca
    /// 429. El conjunto "del día" sigue aceptando con el carrusel lleno.
    /// </summary>
    [Fact]
    public async Task Post_stops_at_ten_images_per_set_but_the_other_set_keeps_accepting()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            for (int index = 0; index < 10; index++)
                await UploadAsync(client, store.StoreId, Carousel, $"carrusel {index}");

            using (var extra = UploadForm(Carousel, TinyJpeg, caption: "una de más"))
            {
                var rejected = await client.PostAsync(ShowcaseUrl(store.StoreId), extra);
                rejected.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            }

            var daily = await UploadAsync(client, store.StoreId, Daily, "del día");
            daily.Kind.Should().Be(Daily);

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().HaveCount(10, "el tope es por conjunto y el carrusel está lleno");
            images.Daily.Should().ContainSingle("el otro conjunto no comparte el tope");
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }

    /// <summary>
    /// 10.4 — `kind` fuera del enum es 400 y no deja fila: un conjunto inventado escribiría una
    /// imagen que el catálogo público nunca publica.
    /// </summary>
    [Fact]
    public async Task Post_with_an_invalid_kind_is_rejected_with_400()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            // El archivo es un JPEG VÁLIDO a propósito: lo único inválido de la petición es el kind.
            using var content = UploadForm(kind: 2, TinyJpeg);

            var response = await client.PostAsync(ShowcaseUrl(store.StoreId), content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().BeEmpty();
            images.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }

    /// <summary>
    /// 10.4 — un multipart sin archivo no es "una imagen vacía": es una petición sin nada que hacer,
    /// y aceptarla devolvería 200 con una clave que no apunta a ningún archivo.
    /// </summary>
    [Fact]
    public async Task Post_without_a_file_is_rejected_with_400()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            using var content = UploadForm(Carousel, bytes: null, caption: "sin archivo");

            var response = await client.PostAsync(ShowcaseUrl(store.StoreId), content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().BeEmpty();
            images.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }

    /// <summary>
    /// 10.4 — el pie de foto vive en una columna y sale en el catálogo público: un carácter por
    /// encima del tope (200) es 400 y no deja fila.
    /// </summary>
    [Fact]
    public async Task Post_with_a_caption_longer_than_200_is_rejected_with_400()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            string caption = new('x', 201);
            using var content = UploadForm(Carousel, TinyJpeg, caption: caption);

            var response = await client.PostAsync(ShowcaseUrl(store.StoreId), content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().BeEmpty();
            images.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }

    /// <summary>
    /// 10.4 — el lado ACEPTADO del borde: 200 caracteres se guardan tal cual. Sin este caso, una
    /// regresión de un carácter (`&gt;= MaxCaptionLength`) en el validador pasaría desapercibida
    /// (advisory R3-caption-boundary del ciclo review-28614dc28ac92ae7).
    /// </summary>
    [Fact]
    public async Task Post_with_a_caption_at_the_limit_is_accepted()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            string caption = new('x', 200);

            var created = await UploadAsync(client, store.StoreId, Carousel, caption);

            created.Caption.Should().Be(caption, "el tope es inclusivo y no trunca");

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().ContainSingle().Which.Caption.Should().Be(caption);
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }

    /// <summary>
    /// 10.4 — el tipo del archivo no permitido es 400 sin fila. `CatalogImageUploadRules` solo
    /// rechaza cuando la EXTENSIÓN y el CONTENT TYPE están los dos fuera de la lista
    /// (`CatalogImageUploadRules.cs:23`), así que este caso manda los dos inválidos — es el único
    /// que la regla, tal como está escrita, rechaza.
    /// </summary>
    [Fact]
    public async Task Post_with_a_disallowed_file_type_is_rejected_with_400_and_writes_no_row()
    {
        var (store, superAdminId, client) = await SeedAsync();
        try
        {
            using var content = UploadForm(Carousel, TinyJpeg, fileName: "nota.txt", contentType: "text/plain");

            var response = await client.PostAsync(ShowcaseUrl(store.StoreId), content);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var images = await ReadAsync(client, store.StoreId);
            images.Carousel.Should().BeEmpty();
            images.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(store, superAdminId);
        }
    }

    /// <summary>
    /// 10.5 — el borrado se decide en el repositorio por `(id, storeId)`
    /// (`RemoveStoreCatalogImageCommand.cs:69-72`): un id REAL de otra tienda responde 404 —nunca
    /// 403 ni 200— y la fila ajena sigue viva.
    /// </summary>
    [Fact]
    public async Task Delete_with_an_image_of_another_store_is_rejected_with_404_and_keeps_the_row()
    {
        var a = await WebCatalogSeed.SeedOwnerAsync(_f);
        var b = await WebCatalogSeed.SeedOwnerAsync(_f);
        string login = $"sa-showcase-{Guid.NewGuid():N}@test.com";
        Guid superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, superAdminId, login);
            var imageOfB = await UploadAsync(client, b.StoreId, Carousel, "de la tienda B");

            var remove = await client.DeleteAsync($"{ShowcaseUrl(a.StoreId)}/{imageOfB.Id}");

            remove.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "la pertenencia es una condición de la consulta, no una comprobación posterior");

            var imagesOfB = await ReadAsync(client, b.StoreId);
            imagesOfB.Carousel.Should().ContainSingle().Which.Id.Should().Be(imageOfB.Id,
                "un borrado rechazado no toca la fila de la otra tienda");

            var imagesOfA = await ReadAsync(client, a.StoreId);
            imagesOfA.Carousel.Should().BeEmpty();
            imagesOfA.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupStoreAsync(a);
            await CleanupStoreAsync(b);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    /// <summary>
    /// 10.6 — el reordenado exige el conjunto EXACTO: mismo conteo, sin repetidos y con todo id
    /// vigente presente (`ReorderStoreCatalogImagesCommand.cs:81-83`). Esa única comprobación cubre
    /// los siete casos, y ninguno se aplica a medias: no se escribe nada antes de pasarla, así que
    /// el orden persistido queda intacto.
    /// </summary>
    [Theory]
    [InlineData("empty")]
    [InlineData("incomplete")]
    [InlineData("duplicate")]
    [InlineData("invented")]
    [InlineData("other-set")]
    [InlineData("foreign-store")]
    [InlineData("invalid-kind")]
    public async Task Reorder_with_an_order_that_does_not_cover_the_set_is_rejected_with_400_and_keeps_the_order(
        string scenario)
    {
        var a = await WebCatalogSeed.SeedOwnerAsync(_f);
        var b = await WebCatalogSeed.SeedOwnerAsync(_f);
        string login = $"sa-showcase-{Guid.NewGuid():N}@test.com";
        Guid superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, superAdminId, login);

            var first = await UploadAsync(client, a.StoreId, Carousel, "primera");
            var second = await UploadAsync(client, a.StoreId, Carousel, "segunda");
            var daily = await UploadAsync(client, a.StoreId, Daily, "del día");
            var foreign = await UploadAsync(client, b.StoreId, Carousel, "de la tienda B");

            // El brazo por defecto LANZA: un `InlineData` mal escrito o renombrado falla en vez de
            // degradar en silencio al caso de otra tienda y dar verde cubriendo el escenario
            // equivocado.
            (int kind, Guid[] orderedIds) = scenario switch
            {
                "empty" => (Carousel, Array.Empty<Guid>()),
                "incomplete" => (Carousel, new[] { first.Id }),
                "duplicate" => (Carousel, new[] { first.Id, first.Id }),
                "invented" => (Carousel, new[] { first.Id, Guid.NewGuid() }),
                "other-set" => (Carousel, new[] { first.Id, daily.Id }),
                "foreign-store" => (Carousel, new[] { first.Id, foreign.Id }),
                "invalid-kind" => (99, new[] { first.Id, second.Id }),
                _ => throw new InvalidOperationException(
                    $"Escenario de reordenado no reconocido: {scenario}"),
            };

            var reorder = await client.PutAsJsonAsync(OrderUrl(a.StoreId), new { kind, orderedIds });

            reorder.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            // Un rechazo no puede dejar el conjunto a medias: si el handler reordenara y luego
            // devolviera 400, este estado ya no coincidiría con el del alta.
            var after = await ReadAsync(client, a.StoreId);
            after.Carousel.Select(image => image.Id).Should().Equal(first.Id, second.Id);
            after.Daily.Select(image => image.Id).Should().Equal(daily.Id);
        }
        finally
        {
            await CleanupStoreAsync(a);
            await CleanupStoreAsync(b);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }
}
