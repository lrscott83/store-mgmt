using System.Net;
using System.Net.Http.Json;
using System.Text;
using Application.Dtos.WebCatalog;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// RULES del beacon anónimo del catálogo (`POST /api/v1/public/catalog/{storeSlug}/events`).
///
/// El endpoint SIEMPRE responde 204: no hay código de error que observar, así que cada regla se
/// afirma sobre lo que quedó escrito. La lectura se hace con el MISMO panel que consume el
/// SuperAdmin (`GET /api/v1/stores/{id}/catalog-stats`), igual que `CatalogTelemetryE2ETests`: el
/// sujeto de la prueba es el producto (visitas, páginas vistas, top de productos), no la tabla.
///
/// Cada test arranca con su propia tienda (slug con GUID) y limpia en `finally`; los eventos caen
/// por la FK ON DELETE CASCADE al borrar la tienda.
///
/// Caso deliberadamente NO cubierto: el `429` de `PublicCatalogPolicy`. Es un único cubo de
/// 120/min por IP que comparte TODA la suite E2E, así que un test que lo agotara contaminaría a
/// los demás (mismo criterio que `SiteTelemetryE2ETests.cs:22-24`).
/// </summary>
[Collection("e2e")]
public sealed class CatalogTelemetryRulesE2ETests
{
    private const string BrowserUserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

    /// <summary>El marcador `googlebot` es el que mira `CatalogBotDetector.IsBot`.</summary>
    private const string GoogleBotUserAgent =
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

    /// <summary>`RecordCatalogEventsCommandHandler.MaxEventsPerRequest`.</summary>
    private const int MaxEventsPerRequest = 10;

    private readonly AppTestFactory _f;

    public CatalogTelemetryRulesE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    #region Rules

    [Fact]
    public async Task An_unknown_slug_answers_204_and_writes_nothing()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SyncAsync(fixture);
            var anon = BrowserClient();
            var admin = await AdminClientAsync();

            // El slug NO existe: el storefront igual recibe su 204 y la tienda real queda intacta.
            var unknown = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/no-existe-{Guid.NewGuid():N}/events",
                PageViewBatch(fixture.Slug));
            unknown.StatusCode.Should().Be(HttpStatusCode.NoContent);

            CatalogStatsDto afterUnknown = await StatsAsync(admin, fixture.StoreId);
            afterUnknown.Visits.Should().Be(0);
            afterUnknown.Visitors.Should().Be(0);
            afterUnknown.PageViews.Should().Be(0);
            afterUnknown.TopProducts.Should().BeEmpty();

            // Control positivo: el MISMO lote contra el slug real sí escribe. Sin esto, un endpoint
            // que no escribiera nunca pasaría por el motivo equivocado.
            var known = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/events", PageViewBatch(fixture.Slug));
            known.StatusCode.Should().Be(HttpStatusCode.NoContent);

            CatalogStatsDto afterKnown = await StatsAsync(admin, fixture.StoreId);
            afterKnown.Visits.Should().Be(1);
            afterKnown.PageViews.Should().Be(1);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task A_bot_user_agent_answers_204_and_writes_nothing()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SyncAsync(fixture);
            var admin = await AdminClientAsync();

            var bot = ClientWithUserAgent(GoogleBotUserAgent);
            var botResponse = await bot.PostAsJsonAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/events", PageViewBatch(fixture.Slug));
            botResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

            // Control positivo: el mismo slug y el mismo lote con un navegador sí se cuentan.
            var anon = BrowserClient();
            var browserResponse = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/events", PageViewBatch(fixture.Slug));
            browserResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

            CatalogStatsDto stats = await StatsAsync(admin, fixture.StoreId);
            // Un solo visitante/página vista: si el bot hubiera escrito, serían dos de cada uno.
            stats.PageViews.Should().Be(1);
            stats.Visitors.Should().Be(1);
            stats.Visits.Should().Be(1);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task An_event_name_outside_the_allowlist_is_accepted_but_not_counted()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SyncAsync(fixture);
            var anon = BrowserClient();

            var response = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/events",
                new
                {
                    events = new object[]
                    {
                        // Fuera de la lista cerrada (page_view, product_view, add_to_cart,
                        // checkout_open): no se guarda.
                        new { name = "purchase_completed", path = $"/catalog/{fixture.Slug}" },
                        new { name = "page_view", path = $"/catalog/{fixture.Slug}" },
                    },
                });
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            CatalogStatsDto stats = await StatsAsync(admin: await AdminClientAsync(), fixture.StoreId);
            stats.PageViews.Should().Be(1, "solo el page_view del lote es un nombre válido");
            stats.Visits.Should().Be(1);
            stats.TopProducts.Should().BeEmpty();
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task A_product_id_from_another_store_is_stored_without_the_attribution()
    {
        var own = await WebCatalogSeed.SeedOwnerAsync(_f);
        var other = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            // El producto vive en la OTRA tienda y se publica con el sync de esa tienda
            // (`GetPublishedByIdsAsync` exige categoría con slug).
            var category = await WebCatalogSeed.AddCategoryAsync(_f, other, "Ropa");
            var foreign = await WebCatalogSeed.AddProductAsync(_f, other, category.Id, "Camisa", 100m);
            await SyncAsync(other);
            await SyncAsync(own);

            var anon = BrowserClient();
            var response = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/{own.Slug}/events",
                new
                {
                    events = new object[]
                    {
                        new
                        {
                            name = "product_view",
                            path = $"/catalog/{own.Slug}",
                            productId = foreign.Id,
                        },
                    },
                });
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            var admin = await AdminClientAsync();
            CatalogStatsDto ownStats = await StatsAsync(admin, own.StoreId);
            ownStats.TopProducts.Should().BeEmpty("el evento no puede atribuir un producto ajeno");
            ownStats.Visits.Should()
                .Be(1, "el evento se registra de todos modos: solo se descarta el productId");

            CatalogStatsDto otherStats = await StatsAsync(admin, other.StoreId);
            otherStats.Visits.Should().Be(0, "nada se escribió en la tienda dueña del producto");

            // Control positivo: el mismo GUID contra su propia tienda SÍ se atribuye, así que el
            // producto está realmente publicado y la caída anterior es por tienda, no por GUID.
            var control = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/{other.Slug}/events",
                new
                {
                    events = new object[]
                    {
                        new
                        {
                            name = "product_view",
                            path = $"/catalog/{other.Slug}",
                            productId = foreign.Id,
                        },
                    },
                });
            control.StatusCode.Should().Be(HttpStatusCode.NoContent);

            CatalogStatsDto otherAfterControl = await StatsAsync(admin, other.StoreId);
            otherAfterControl.TopProducts.Should().ContainSingle()
                .Which.Should().BeEquivalentTo(new { ProductId = foreign.Id, Name = "Camisa", Views = 1 });
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, own);
            await WebCatalogSeed.CleanupAsync(_f, other);
        }
    }

    [Fact]
    public async Task Only_the_first_ten_events_of_a_batch_are_counted()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SyncAsync(fixture);
            var anon = BrowserClient();

            var response = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/events",
                new
                {
                    events = Enumerable.Range(0, MaxEventsPerRequest + 2)
                        .Select(_ => (object)new { name = "page_view", path = $"/catalog/{fixture.Slug}" })
                        .ToArray(),
                });
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            CatalogStatsDto stats = await StatsAsync(admin: await AdminClientAsync(), fixture.StoreId);
            stats.PageViews.Should().Be(MaxEventsPerRequest, "el lote se corta en diez eventos");
            stats.Visits.Should().Be(1, "los diez eventos guardados son de la misma sesión");
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task A_body_that_cannot_be_bound_answers_400_and_writes_nothing()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SyncAsync(fixture);
            var anon = BrowserClient();

            // JSON truncado: no se puede enlazar al `[FromBody] RecordCatalogEventsRequest`.
            const string malformed = """{"events":[{"name":"page_view","path":""";

            var response = await anon.PostAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/events",
                new StringContent(malformed, Encoding.UTF8, "application/json"));

            // El binding se resuelve ANTES del handler (ApiController + InvalidModelStateResponseFactory),
            // así que este es el único caso con un código distinto de 204.
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            CatalogStatsDto stats = await StatsAsync(admin: await AdminClientAsync(), fixture.StoreId);
            stats.Visits.Should().Be(0);
            stats.PageViews.Should().Be(0);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    #endregion

    #region Helpers

    private HttpClient BrowserClient() => ClientWithUserAgent(BrowserUserAgent);

    private HttpClient ClientWithUserAgent(string userAgent)
    {
        var client = _f.CreateClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        return client;
    }

    /// <summary>Publica el catálogo de la tienda: sin sync no hay `CatalogSlug` ni productos publicados.</summary>
    private async Task SyncAsync(WebCatalogSeed.StoreFixture fixture)
    {
        var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
        (await ownerClient.PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();
    }

    private async Task<HttpClient> AdminClientAsync()
    {
        string adminLogin = $"sa-catrules-{Guid.NewGuid():N}@test.com";
        Guid adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        return DbTestHelpers.AuthedClient(_f, adminId, adminLogin);
    }

    private static async Task<CatalogStatsDto> StatsAsync(HttpClient admin, Guid storeId)
    {
        var response = await admin.GetFromJsonAsync<ApiResponse<CatalogStatsDto>>(
            $"/api/v1/stores/{storeId}/catalog-stats?days=7", ApiResponse.Json);
        response!.Succeeded.Should().BeTrue();
        return response.Data!;
    }

    private static object PageViewBatch(string slug)
        => new { events = new object[] { new { name = "page_view", path = $"/catalog/{slug}" } } };

    #endregion
}
