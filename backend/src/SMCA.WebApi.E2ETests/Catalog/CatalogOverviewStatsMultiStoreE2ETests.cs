using System.Net;
using System.Net.Http.Json;
using Application.Dtos.WebCatalog;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Panel general, DOS tiendas con visitas distintas: prueba el orden descendente del selector y que
/// el total global sea exactamente la suma del desglose. Archivo propio para no reescribir el
/// escenario de una sola tienda, que es otro contrato.
/// </summary>
[Collection("e2e")]
public sealed class CatalogOverviewStatsMultiStoreE2ETests
{
    private const string ChromeUserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private readonly AppTestFactory _f;

    public CatalogOverviewStatsMultiStoreE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Overview_ranks_stores_by_visits_and_totals_match_the_breakdown()
    {
        var one = await WebCatalogSeed.SeedOwnerAsync(_f);
        var two = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await PublishAsync(one);
            await PublishAsync(two);

            // Tienda uno: UNA sesión. Tienda dos: TRES, un UA distinto por beacon (el hash de
            // sesión incluye la huella del visitante).
            (await RecordPageViewAsync(one.Slug, ChromeUserAgent)).Should().Be(HttpStatusCode.NoContent);
            for (int beacon = 0; beacon < 3; beacon++)
            {
                (await RecordPageViewAsync(two.Slug, ChromeUserAgent.Replace("120.0.0.0", $"120.0.{beacon}.0")))
                    .Should().Be(HttpStatusCode.NoContent);
            }

            string adminLogin = $"sa-catmulti-{Guid.NewGuid():N}@test.com";
            Guid adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
            var admin = DbTestHelpers.AuthedClient(_f, adminId, adminLogin);

            var response = await admin.GetFromJsonAsync<ApiResponse<CatalogStatsOverviewDto>>(
                "/api/v1/stores/catalog-stats?days=7", ApiResponse.Json);
            response!.Succeeded.Should().BeTrue();
            CatalogStatsOverviewDto overview = response.Data!;

            overview.Stores.Single(store => store.StoreId == one.StoreId).Visits.Should().Be(1);
            overview.Stores.Single(store => store.StoreId == two.StoreId).Visits.Should().Be(3);

            var ranked = overview.Stores.ToList();
            ranked.FindIndex(store => store.StoreId == two.StoreId)
                .Should().BeLessThan(ranked.FindIndex(store => store.StoreId == one.StoreId));

            overview.Totals.Visits.Should().Be(overview.Stores.Sum(store => store.Visits));
            overview.Totals.Daily.Sum(day => day.Visits).Should().Be(overview.Totals.Visits);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, one);
            await WebCatalogSeed.CleanupAsync(_f, two);
        }
    }

    private async Task PublishAsync(WebCatalogSeed.StoreFixture fixture)
    {
        var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
        await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);
        var owner = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
        (await owner.PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();
    }

    private async Task<HttpStatusCode> RecordPageViewAsync(string slug, string userAgent)
    {
        var anon = _f.CreateClient();
        anon.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        var response = await anon.PostAsJsonAsync($"/api/v1/public/catalog/{slug}/events",
            new { events = new object[] { new { name = "page_view", path = $"/catalog/{slug}" } } });
        return response.StatusCode;
    }
}
