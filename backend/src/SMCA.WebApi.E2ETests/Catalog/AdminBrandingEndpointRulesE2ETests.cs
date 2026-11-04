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
/// Matriz de las REGLAS del branding SuperAdmin (filas 10.1 y 10.2 de la matriz T10,
/// 2026-11-04). <see cref="AdminWebCatalogCrudTests"/> fija el camino feliz suelto y
/// <see cref="AdminWebCatalogScopeProbes"/> el 403 y la escritura cruzada; aquí se fijan la
/// guarda de sesión, los cuatro rechazos del validador, las reglas de archivo y el 404 de tienda
/// inexistente, siempre con el estado persistido observado.
///
/// No se afirma el texto localizado del error ni <c>Errors[0].Code</c>: para un
/// <c>ApiException</c> ese código es siempre <c>App.Unexpected</c> (el <c>AcctionCode</c> nunca
/// se rellena), así que fijarlo ataría la prueba a un detalle accidental del middleware.
///
/// Asimetrías documentadas como NO cubiertas a propósito: el <c>GET</c> sobre una tienda
/// inexistente responde 200 con defaults (<c>AdminStoreScopeFilter</c> valida el GUID, no la
/// existencia de la tienda) y la diferencia de origen del <c>TenantId</c> entre marca y showcase.
/// </summary>
[Collection("e2e")]
public sealed class AdminBrandingEndpointRulesE2ETests
{
    private static readonly byte[] TinyJpeg =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    private readonly AppTestFactory _f;

    public AdminBrandingEndpointRulesE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record BrandingDto(string? LogoKey, string? BannerKey, string? PaletteId, int MobileColumns);

    private static string BrandingUrl(Guid storeId) => $"/api/v1/stores/{storeId}/catalog/branding";

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

    /// <summary>Filas de <c>StoreCatalogSettings</c> de la tienda — el "no escribió nada" observable.</summary>
    private async Task<int> CountSettingsRowsAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Domain.Entities.StoreCatalogSettings.StoreCatalogSettings>().IgnoreQueryFilters()
            .CountAsync(settings => settings.StoreId == storeId);
    }

    private static ByteArrayContent Jpeg(byte[]? bytes = null, string contentType = "image/jpeg")
    {
        var file = new ByteArrayContent(bytes ?? TinyJpeg);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return file;
    }

    private static MultipartFormDataContent ImageForm(string partName, string fileName = "logo.jpg",
        byte[]? bytes = null, string contentType = "image/jpeg")
        => new() { { Jpeg(bytes, contentType), partName, fileName } };

    /// <summary>
    /// Fila 10.1/10.2 — guarda de sesión. Los filtros de autorización corren ANTES del binding,
    /// así que un cuerpo multipart vacío basta: el 401 no depende de lo que viaje.
    /// </summary>
    [Fact]
    public async Task Anonymous_is_rejected_with_401_on_both_branding_endpoints()
    {
        var anonymous = _f.CreateClient();
        var url = BrandingUrl(Guid.NewGuid());

        (await anonymous.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        using var form = new MultipartFormDataContent();
        (await anonymous.PutAsync(url, form)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    /// <summary>
    /// Fila 10.2 — "nada que actualizar" es 400, no un 200 que encubriría al cliente que olvidó
    /// adjuntar el archivo. Y sobre todo: no escribe fila.
    /// </summary>
    [Fact]
    public async Task Put_with_nothing_to_update_is_rejected_with_400_and_writes_no_row()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-brand-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            using var form = new MultipartFormDataContent
            {
                { new StringContent("false"), "removeLogo" },
                { new StringContent("false"), "removeBanner" },
            };
            var response = await sa.PutAsync(BrandingUrl(store.StoreId), form);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await CountSettingsRowsAsync(store.StoreId)).Should().Be(0);
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    /// <summary>Fila 10.2 — <c>mobileColumns</c> solo admite 1 o 2; fuera de rango es 400 y sin fila.</summary>
    [Theory]
    [InlineData(0)]
    [InlineData(3)]
    public async Task Put_with_mobile_columns_out_of_range_is_rejected_with_400(int mobileColumns)
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-brand-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            using var form = new MultipartFormDataContent
            {
                { new StringContent(mobileColumns.ToString()), "mobileColumns" },
            };
            var response = await sa.PutAsync(BrandingUrl(store.StoreId), form);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await CountSettingsRowsAsync(store.StoreId)).Should().Be(0);
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    /// <summary>
    /// Fila 10.2 — subir y quitar el MISMO lado son dos instrucciones opuestas sobre la misma
    /// columna; el validador las rechaza antes de que ninguna llegue al disco.
    /// </summary>
    [Fact]
    public async Task Put_with_a_logo_file_and_remove_logo_is_rejected_with_400()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-brand-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            using var form = ImageForm("logo", "logo.jpg");
            form.Add(new StringContent("true"), "removeLogo");
            var response = await sa.PutAsync(BrandingUrl(store.StoreId), form);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await CountSettingsRowsAsync(store.StoreId)).Should().Be(0);
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    /// <summary>
    /// Fila 10.2 — las reglas de archivo son las mismas que las imágenes de producto: ni la
    /// extensión ni el content type de un gif están permitidos, y el rechazo no deja fila.
    /// </summary>
    [Fact]
    public async Task Put_with_a_disallowed_image_type_is_rejected_with_400_and_writes_no_row()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-brand-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            using var form = ImageForm("logo", "logo.gif", contentType: "image/gif");
            var response = await sa.PutAsync(BrandingUrl(store.StoreId), form);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await CountSettingsRowsAsync(store.StoreId)).Should().Be(0);
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    /// <summary>
    /// Fila 10.2 — el tope de 2 MB. El JPEG pequeño va primero como CONTROL POSITIVO con el mismo
    /// nombre y content type, así que la única diferencia entre el 200 y el 400 es el tamaño.
    ///
    /// En producción el <c>RequestSizeLimit</c> del controlador (~4.3 MB) deja llegar el archivo al
    /// validador, por eso la respuesta es 400 y no 413; en el TestServer de este harness ese límite
    /// ni siquiera se aplica (el arranque avisa "could not be applied"), así que el 400 del validador
    /// es lo único observable aquí.
    ///
    /// El rechazo NO puede añadir una segunda fila: sigue habiendo exactamente la del control.
    /// </summary>
    [Fact]
    public async Task Put_with_a_logo_over_two_megabytes_is_rejected_with_400_while_the_small_one_is_accepted()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-brand-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            using (var control = ImageForm("logo", "logo.jpg"))
            {
                var accepted = await sa.PutAsync(BrandingUrl(store.StoreId), control);
                accepted.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            (await CountSettingsRowsAsync(store.StoreId)).Should().Be(1);

            byte[] oversized = new byte[2 * 1024 * 1024 + 1];
            using var form = ImageForm("logo", "logo.jpg", oversized);
            var rejected = await sa.PutAsync(BrandingUrl(store.StoreId), form);

            rejected.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await CountSettingsRowsAsync(store.StoreId))
                .Should().Be(1, "el rechazo no debe añadir otra fila sobre la del control");
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }

    /// <summary>
    /// Fila 10.2 — el filtro de alcance valida el GUID pero no la existencia de la tienda, así que
    /// el 404 lo produce el handler, que es el único que la consulta.
    /// </summary>
    [Fact]
    public async Task Put_on_a_store_that_does_not_exist_is_rejected_with_404()
    {
        var login = $"sa-brand-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);
            Guid unknownStore = Guid.NewGuid();

            using var form = new MultipartFormDataContent
            {
                { new StringContent("1"), "mobileColumns" },
            };
            var response = await sa.PutAsync(BrandingUrl(unknownStore), form);

            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
            (await CountSettingsRowsAsync(unknownStore)).Should().Be(0);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>
    /// Fila 10.2 — la semántica de PARCHE PARCIAL: quitar el logo no toca el banner. Un PUT que
    /// reemplazara la marca entera habría perdido el banner del dueño.
    /// </summary>
    [Fact]
    public async Task Put_removing_the_logo_keeps_the_banner()
    {
        var store = await WebCatalogSeed.SeedOwnerAsync(_f);
        var login = $"sa-brand-{Guid.NewGuid():N}@test.com";
        Guid saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var sa = DbTestHelpers.AuthedClient(_f, saId, login);

            BrandingDto both;
            using (var form = new MultipartFormDataContent
                   {
                       { Jpeg(), "logo", "logo.jpg" },
                       { Jpeg(), "banner", "banner.jpg" },
                   })
            {
                var uploaded = await sa.PutAsync(BrandingUrl(store.StoreId), form);
                uploaded.StatusCode.Should().Be(HttpStatusCode.OK);
                var body = await uploaded.Content.ReadFromJsonAsync<ApiResponse<BrandingDto>>(ApiResponse.Json);
                both = body!.Data!;
            }

            both.LogoKey.Should().NotBeNullOrWhiteSpace();
            both.BannerKey.Should().NotBeNullOrWhiteSpace();

            using (var removeLogoOnly = new MultipartFormDataContent
                   {
                       { new StringContent("true"), "removeLogo" },
                   })
            {
                var removed = await sa.PutAsync(BrandingUrl(store.StoreId), removeLogoOnly);
                removed.StatusCode.Should().Be(HttpStatusCode.OK);

                var body = await removed.Content.ReadFromJsonAsync<ApiResponse<BrandingDto>>(ApiResponse.Json);
                body!.Data!.LogoKey.Should().BeNull();
                body.Data.BannerKey.Should().Be(both.BannerKey, "el banner no viaja: no se toca");
            }

            var reread = await sa.GetFromJsonAsync<ApiResponse<BrandingDto>>(
                BrandingUrl(store.StoreId), ApiResponse.Json);
            reread!.Data!.LogoKey.Should().BeNull();
            reread.Data.BannerKey.Should().Be(both.BannerKey);
        }
        finally
        {
            await CleanupAsync(store, saId);
        }
    }
}
