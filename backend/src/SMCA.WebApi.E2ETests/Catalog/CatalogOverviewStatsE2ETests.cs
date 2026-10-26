using System.Net;
using System.Net.Http.Json;
using Application.Dtos.WebCatalog;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Panel GENERAL del catálogo: el endpoint SuperAdmin agrega todas las tiendas y devuelve, para el
/// selector, SOLO las tiendas con visitas en el periodo. Se usa el seed del catálogo público para
/// que las visitas nazcan del mismo beacon que usa producción.
///
/// La base es compartida con el resto de la suite, así que las aserciones sobre el total son cotas
/// (>=) y las exactas se hacen contra la entrada de la tienda sembrada.
/// </summary>
[Collection("e2e")]
public sealed class CatalogOverviewStatsE2ETests
{
    private readonly AppTestFactory _f;

    public CatalogOverviewStatsE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Overview_aggregates_every_store_and_lists_only_stores_with_visits()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        // Segunda tienda con MÁS visitas que la primera: sin dos tiendas no se puede afirmar el
        // orden descendente del selector, y con desgloses distintos la suma total es verificable.
        var second = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            (await ownerClient.PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();

            var secondOwnerClient = DbTestHelpers.AuthedClient(_f, second.UserId, second.Login);
            (await secondOwnerClient.PostAsJsonAsync("/api/v1/catalog/sync", new { }))
                .EnsureSuccessStatusCode();

            var anon = _f.CreateClient();
            anon.DefaultRequestHeaders.UserAgent.ParseAdd(ChromeUserAgent);

            var events = new
            {
                events = new object[]
                {
                    new { name = "page_view", path = $"/catalog/{fixture.Slug}" },
                    new
                    {
                        name = "product_view",
                        path = $"/catalog/{fixture.Slug}",
                        productId = product.Id,
                        utmSource = "whatsapp",
                    },
                },
            };

            // Tienda 1: UNA sesión (los dos eventos van en el mismo lote y con el mismo UA).
            var telemetry = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/events", events);
            telemetry.StatusCode.Should().Be(HttpStatusCode.NoContent);

            // Tienda 2: TRES sesiones, un UA distinto por beacon. El hash de sesión incluye la
            // huella del visitante (UA incluido), así que cada UA es una visita distinta.
            for (int beacon = 0; beacon < 3; beacon++)
            {
                var secondTelemetry = await RecordPageViewAsync(
                    second.Slug, ChromeUserAgent.Replace("120.0.0.0", $"120.0.{beacon}.0"));
                secondTelemetry.Should().Be(HttpStatusCode.NoContent);
            }

            string adminLogin = $"sa-catoverview-{Guid.NewGuid():N}@test.com";
            Guid adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
            var admin = DbTestHelpers.AuthedClient(_f, adminId, adminLogin);

            var response = await admin.GetFromJsonAsync<ApiResponse<CatalogStatsOverviewDto>>(
                "/api/v1/stores/catalog-stats?days=7", ApiResponse.Json);

            response!.Succeeded.Should().BeTrue();
            CatalogStatsOverviewDto overview = response.Data!;

            overview.Totals.Days.Should().Be(7);
            overview.Totals.Daily.Should().HaveCount(7);
            overview.Totals.PageViews.Should().BeGreaterThanOrEqualTo(1);
            overview.Totals.Visits.Should().BeGreaterThanOrEqualTo(1);
            overview.Totals.Visitors.Should().BeGreaterThanOrEqualTo(1);

            // Las DOS tiendas sembradas están en el selector, con su nombre y sus visitas exactas
            // (son tiendas nuevas, así que no arrastran eventos de corridas anteriores).
            CatalogStoreStatsDto ours = overview.Stores.Single(store => store.StoreId == fixture.StoreId);
            ours.Name.Should().Be(fixture.StoreName);
            ours.Visits.Should().Be(1);

            CatalogStoreStatsDto other = overview.Stores.Single(store => store.StoreId == second.StoreId);
            other.Name.Should().Be(second.StoreName);
            other.Visits.Should().Be(3);

            // La invariante del selector: ninguna tienda sin visitas en el periodo.
            overview.Stores.Should().OnlyContain(store => store.Visits > 0);

            // Orden descendente por visitas (y por nombre como desempate); las dos sembradas
            // respetan ese orden entre sí.
            overview.Stores.Should().BeInDescendingOrder(store => store.Visits);
            var ranked = overview.Stores.ToList();
            ranked.FindIndex(store => store.StoreId == second.StoreId)
                .Should().BeLessThan(ranked.FindIndex(store => store.StoreId == fixture.StoreId));

            // "Es una suma": el hash de sesión incluye la tienda, así que el total global es
            // exactamente la suma del desglose por tienda del mismo periodo.
            overview.Totals.Visits.Should().Be(overview.Stores.Sum(store => store.Visits));

            // La serie diaria se cuenta por día en SQL con `[day, day + 1)`; como la sesión dura
            // 30 minutos y nunca cruza la medianoche UTC, la suma de los días es el total exacto.
            overview.Totals.Daily.Sum(day => day.Visits).Should().Be(overview.Totals.Visits);

            // La ventana se clampa igual que en el panel por tienda.
            (await GetOverviewAsync(admin, 0)).Totals.Days.Should().Be(30);
            (await GetOverviewAsync(admin, 500)).Totals.Days.Should().Be(365);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
            await WebCatalogSeed.CleanupAsync(_f, second);
        }
    }

    [Fact]
    public async Task Overview_is_forbidden_for_a_store_owner()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            var owner = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var response = await owner.GetAsync("/api/v1/stores/catalog-stats?days=7");

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    private const string ChromeUserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private async Task<HttpStatusCode> RecordPageViewAsync(string slug, string userAgent)
    {
        var anon = _f.CreateClient();
        anon.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        var response = await anon.PostAsJsonAsync($"/api/v1/public/catalog/{slug}/events",
            new { events = new object[] { new { name = "page_view", path = $"/catalog/{slug}" } } });
        return response.StatusCode;
    }

    private static async Task<CatalogStatsOverviewDto> GetOverviewAsync(HttpClient admin, int days)
    {
        var response = await admin.GetFromJsonAsync<ApiResponse<CatalogStatsOverviewDto>>(
            $"/api/v1/stores/catalog-stats?days={days}", ApiResponse.Json);
        response!.Succeeded.Should().BeTrue();
        return response.Data!;
    }
}
