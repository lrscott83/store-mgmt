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
        try
        {
            var category = await WebCatalogSeed.AddCategoryAsync(_f, fixture, "Ropa");
            var product = await WebCatalogSeed.AddProductAsync(_f, fixture, category.Id, "Camisa", 100m);

            var ownerClient = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            (await ownerClient.PostAsJsonAsync("/api/v1/catalog/sync", new { })).EnsureSuccessStatusCode();

            var anon = _f.CreateClient();
            anon.DefaultRequestHeaders.UserAgent.ParseAdd(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");

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

            var telemetry = await anon.PostAsJsonAsync(
                $"/api/v1/public/catalog/{fixture.Slug}/events", events);
            telemetry.StatusCode.Should().Be(HttpStatusCode.NoContent);

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

            // La tienda sembrada está en el selector, con su nombre y sus visitas.
            CatalogStoreStatsDto ours = overview.Stores.Single(store => store.StoreId == fixture.StoreId);
            ours.Name.Should().Be(fixture.StoreName);
            ours.Visits.Should().BeGreaterThanOrEqualTo(1);

            // La invariante del selector: ninguna tienda sin visitas en el periodo.
            overview.Stores.Should().OnlyContain(store => store.Visits > 0);
            overview.Stores.Should().BeInDescendingOrder(store => store.Visits);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
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
}
