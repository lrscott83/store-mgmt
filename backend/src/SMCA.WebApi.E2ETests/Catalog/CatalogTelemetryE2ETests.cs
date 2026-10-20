using System.Net;
using System.Net.Http.Json;
using Application.Dtos.WebCatalog;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Telemetría anónima del catálogo: el beacon público escribe eventos y el SuperAdmin los lee
/// agregados por tienda. La escritura y la lectura usan el MISMO storeId, y la limpieza del seed
/// borra la tienda (los eventos caen por la FK ON DELETE CASCADE).
/// </summary>
[Collection("e2e")]
public sealed class CatalogTelemetryE2ETests
{
    private readonly AppTestFactory _f;

    public CatalogTelemetryE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Public_events_are_aggregated_for_the_super_admin()
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

            string adminLogin = $"sa-catstats-{Guid.NewGuid():N}@test.com";
            Guid adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
            var admin = DbTestHelpers.AuthedClient(_f, adminId, adminLogin);

            var response = await admin.GetFromJsonAsync<ApiResponse<CatalogStatsDto>>(
                $"/api/v1/stores/{fixture.StoreId}/catalog-stats?days=7", ApiResponse.Json);

            response!.Succeeded.Should().BeTrue();
            CatalogStatsDto stats = response.Data!;
            stats.Visits.Should().Be(1);
            stats.Visitors.Should().Be(1);
            stats.PageViews.Should().Be(1);
            stats.Orders.Should().Be(0);
            stats.Sources.Single(source => source.Source == CatalogSource.WhatsApp).Visits.Should().Be(1);
            stats.TopProducts.Should().ContainSingle()
                .Which.Should().BeEquivalentTo(new { ProductId = product.Id, Name = "Camisa", Views = 1 });
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }
}
