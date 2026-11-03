using System.Net;
using System.Net.Http.Json;
using Application.Dtos.WebCatalog;
using Domain.Common.Enums;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Unidad 3 — los 4 endpoints de `CatalogShowcaseController` por la ruta de SESIÓN
/// (`/api/v1/catalog/showcase`).
///
/// Hueco real detectado al auditar: los E2E existentes cubren las rutas de SuperAdmin
/// (`/api/v1/stores/{storeId}/catalog/showcase`) y el repositorio
/// (`ShowcaseRepositoryPersistenceTests`), pero GET/POST/DELETE/PUT-order de la ruta que usa la
/// vista del dueño no tenían ninguna prueba HTTP. Es la ruta que resuelve la tienda del CONTEXTO,
/// así que su binding multipart, el tope por conjunto y el reordenado completo solo se fijan aquí.
///
/// Casos: conjuntos vacíos, alta en el conjunto pedido, alta en "del día", borrado (fila + 404 de
/// un id desconocido), reordenado completo y rechazo de un orden que no cubre el conjunto.
/// </summary>
[Collection("e2e")]
public sealed class ShowcaseEndpointsE2ETests
{
    private const string ShowcaseUrl = "/api/v1/catalog/showcase";

    private static readonly byte[] TinyJpeg =
        { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9 };

    private readonly AppTestFactory _f;

    public ShowcaseEndpointsE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientFor(WebCatalogSeed.StoreFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    private static MultipartFormDataContent BuildUpload(
        StoreCatalogImageKind kind, byte[] bytes, string? caption = null, string fileName = "showcase.jpg")
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");

        var content = new MultipartFormDataContent
        {
            { new StringContent(((int)kind).ToString()), "kind" },
            { file, "file", fileName },
        };

        if (caption is not null)
            content.Add(new StringContent(caption), "caption");

        return content;
    }

    private async Task<StoreCatalogImageDto> UploadAsync(
        HttpClient client, StoreCatalogImageKind kind, string? caption = null)
    {
        using var content = BuildUpload(kind, TinyJpeg, caption);
        var response = await client.PostAsync(ShowcaseUrl, content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content
            .ReadFromJsonAsync<ApiResponse<StoreCatalogImageDto>>(ApiResponse.Json);

        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private async Task<StoreCatalogImagesDto> GetImagesAsync(HttpClient client)
    {
        var response = await client.GetAsync(ShowcaseUrl);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content
            .ReadFromJsonAsync<ApiResponse<StoreCatalogImagesDto>>(ApiResponse.Json);

        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    /// <summary>
    /// Las imágenes de showcase tienen FK `Restrict` a `Store`, así que se borran ANTES del grafo
    /// de la tienda; sin este paso el borrado de `Store` revienta y contamina la corrida siguiente.
    /// </summary>
    private async Task CleanupAsync(WebCatalogSeed.StoreFixture fixture)
    {
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Domain.Entities.StoreCatalogImages.StoreCatalogImage>()
                .IgnoreQueryFilters()
                .Where(image => image.StoreId == fixture.StoreId)
                .ExecuteDeleteAsync();
        }

        await WebCatalogSeed.CleanupAsync(_f, fixture);
    }

    private async Task<int> CountRowsAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Domain.Entities.StoreCatalogImages.StoreCatalogImage>()
            .IgnoreQueryFilters()
            .CountAsync(image => image.StoreId == storeId);
    }

    [Fact]
    public async Task Get_without_images_returns_both_sets_empty_but_present()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var images = await GetImagesAsync(ClientFor(fixture));

            images.Carousel.Should().NotBeNull("null y [] no son lo mismo para una vista que pinta dos bloques");
            images.Daily.Should().NotBeNull();
            images.Carousel.Should().BeEmpty();
            images.Daily.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Upload_registers_the_image_in_the_requested_set_with_its_caption()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = ClientFor(fixture);

            var uploaded = await UploadAsync(client, StoreCatalogImageKind.Carousel, "Promo de mayo");

            uploaded.Kind.Should().Be(StoreCatalogImageKind.Carousel);
            uploaded.Key.Should().StartWith($"{fixture.TenantId:N}/{fixture.StoreId:N}/",
                "la clave comparte el prefijo por tienda que el endpoint público valida");
            uploaded.Caption.Should().Be("Promo de mayo");
            uploaded.OrderIndex.Should().Be(0);
            uploaded.IsActive.Should().BeTrue();

            var images = await GetImagesAsync(client);
            images.Carousel.Should().ContainSingle(image => image.Id == uploaded.Id);
            images.Daily.Should().BeEmpty("los conjuntos son independientes");
            (await CountRowsAsync(fixture.StoreId)).Should().Be(1);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Upload_of_the_daily_set_lands_only_in_that_set()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = ClientFor(fixture);

            var uploaded = await UploadAsync(client, StoreCatalogImageKind.Daily);

            uploaded.Kind.Should().Be(StoreCatalogImageKind.Daily);
            var images = await GetImagesAsync(client);
            images.Daily.Should().ContainSingle(image => image.Id == uploaded.Id);
            images.Carousel.Should().BeEmpty();
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Delete_removes_the_row_and_an_unknown_id_is_a_404()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = ClientFor(fixture);
            var uploaded = await UploadAsync(client, StoreCatalogImageKind.Carousel);

            var delete = await client.DeleteAsync($"{ShowcaseUrl}/{uploaded.Id}");
            delete.StatusCode.Should().Be(HttpStatusCode.OK);

            var deleteBody = await delete.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            deleteBody!.Data.Should().BeTrue();

            (await CountRowsAsync(fixture.StoreId)).Should().Be(0);
            (await GetImagesAsync(client)).Carousel.Should().BeEmpty();

            var unknown = await client.DeleteAsync($"{ShowcaseUrl}/{Guid.NewGuid()}");
            unknown.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "un id que no es de la tienda se comporta igual que uno inexistente");
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Reorder_applies_the_full_order_sent_by_the_view()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = ClientFor(fixture);
            var first = await UploadAsync(client, StoreCatalogImageKind.Carousel, "Primera");
            var second = await UploadAsync(client, StoreCatalogImageKind.Carousel, "Segunda");

            second.OrderIndex.Should().Be(1, "el alta calcula la posición siguiente del conjunto");

            var reorder = await client.PutAsJsonAsync($"{ShowcaseUrl}/order", new
            {
                kind = (int)StoreCatalogImageKind.Carousel,
                orderedIds = new[] { second.Id, first.Id },
            });

            reorder.StatusCode.Should().Be(HttpStatusCode.OK);

            var images = await GetImagesAsync(client);
            // El orden final es el que mandó la vista, no un movimiento relativo.
            images.Carousel.Select(image => image.Id)
                .Should().ContainInOrder(second.Id, first.Id);
            images.Carousel[0].OrderIndex.Should().Be(0);
            images.Carousel[1].OrderIndex.Should().Be(1);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Reorder_rejects_a_list_that_does_not_cover_the_set()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var client = ClientFor(fixture);
            var first = await UploadAsync(client, StoreCatalogImageKind.Carousel);
            await UploadAsync(client, StoreCatalogImageKind.Carousel);

            // Falta la segunda imagen: el reordenado es el conjunto COMPLETO.
            var reorder = await client.PutAsJsonAsync($"{ShowcaseUrl}/order", new
            {
                kind = (int)StoreCatalogImageKind.Carousel,
                orderedIds = new[] { first.Id },
            });

            reorder.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    [Fact]
    public async Task Showcase_endpoints_reject_an_anonymous_caller()
    {
        var client = _f.CreateClient();

        (await client.GetAsync(ShowcaseUrl)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
