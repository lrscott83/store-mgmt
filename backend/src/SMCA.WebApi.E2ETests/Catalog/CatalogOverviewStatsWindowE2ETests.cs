using System.Net;
using System.Net.Http.Json;
using Application.Dtos.WebCatalog;
using Domain.Common.Enums;
using Domain.Entities.CatalogEvents;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Catalog;

/// <summary>
/// Ventana del panel GENERAL: la serie diaria se cuenta por día con el rango semicerrado
/// `[day, day + 1)` y el conteo global de pedidos online suma todas las tiendas con el filtro de
/// tenant activo. Los eventos se insertan con `OccurredAt` explícito porque el beacon público
/// siempre escribe "ahora" y aquí hacen falta días distintos.
/// </summary>
[Collection("e2e")]
public sealed class CatalogOverviewStatsWindowE2ETests
{
    private readonly AppTestFactory _f;

    public CatalogOverviewStatsWindowE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Daily_series_buckets_events_by_utc_day_and_the_window_excludes_older_days()
    {
        var fixture = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            DateTime today = DateTime.UtcNow.Date;

            // 2 sesiones hoy (una por evento), 1 ayer y 1 hace 3 días.
            await SeedEventAsync(fixture, today.AddHours(1), "s-hoy-1");
            await SeedEventAsync(fixture, today.AddHours(2), "s-hoy-2");
            await SeedEventAsync(fixture, today.AddDays(-1).AddHours(12), "s-ayer");
            await SeedEventAsync(fixture, today.AddDays(-3).AddHours(12), "s-hace-3");

            var admin = await AdminClientAsync();
            CatalogStatsOverviewDto week = await GetOverviewAsync(admin, 7);

            week.Totals.Daily.Should().HaveCount(7);
            week.Totals.Daily[^1].Day.Should().Be(today);
            week.Totals.Daily[^1].Visits.Should().Be(2);
            week.Totals.Daily[^2].Day.Should().Be(today.AddDays(-1));
            week.Totals.Daily[^2].Visits.Should().Be(1);
            week.Totals.Daily[^4].Day.Should().Be(today.AddDays(-3));
            week.Totals.Daily[^4].Visits.Should().Be(1);
            week.Totals.Daily[^3].Visits.Should().Be(0);
            week.Totals.Daily.Sum(day => day.Visits).Should().Be(4);
            week.Totals.Visits.Should().Be(4);

            // Ventana de un día: solo hoy. Prueba el corte del último día y que los días
            // anteriores quedan fuera del rango.
            CatalogStatsOverviewDto single = await GetOverviewAsync(admin, 1);
            single.Totals.Daily.Should().ContainSingle().Which.Day.Should().Be(today);
            single.Totals.Daily[0].Visits.Should().Be(2);
            single.Totals.Visits.Should().Be(2);
        }
        finally
        {
            await WebCatalogSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Overview_counts_online_orders_from_every_store_and_keeps_the_conversion_consistent()
    {
        var one = await WebCatalogSeed.SeedOwnerAsync(_f);
        var two = await WebCatalogSeed.SeedOwnerAsync(_f);
        try
        {
            await SeedEventAsync(one, DateTime.UtcNow.AddMinutes(-5), "o-visita-1");
            await SeedEventAsync(two, DateTime.UtcNow.AddMinutes(-5), "o-visita-2");

            // Un pedido ONLINE por tienda: el total general tiene que ver los dos.
            await SeedOrderAsync(one, OrderType.WhatsApp);
            await SeedOrderAsync(two, OrderType.WhatsApp);
            // Un pedido del POS: NO es online y no puede sumar en la conversión del catálogo.
            await SeedOrderAsync(one, OrderType.Normal);

            var admin = await AdminClientAsync();
            CatalogStatsOverviewDto overview = await GetOverviewAsync(admin, 7);

            // Las dos tiendas sembradas aparecen (y el POS no cuenta como pedido online).
            overview.Totals.Orders.Should().Be(2);
            // La conversión es SIEMPRE pedidos / visitas de la misma respuesta.
            overview.Totals.ConversionRate.Should()
                .Be(Math.Round((double)overview.Totals.Orders / overview.Totals.Visits, 4));
        }
        finally
        {
            await DeleteOrdersAsync(one.StoreId, two.StoreId);
            await WebCatalogSeed.CleanupAsync(_f, one);
            await WebCatalogSeed.CleanupAsync(_f, two);
        }
    }

    private async Task<HttpClient> AdminClientAsync()
    {
        string adminLogin = $"sa-catwindow-{Guid.NewGuid():N}@test.com";
        Guid adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        return DbTestHelpers.AuthedClient(_f, adminId, adminLogin);
    }

    private static async Task<CatalogStatsOverviewDto> GetOverviewAsync(HttpClient admin, int days)
    {
        var response = await admin.GetFromJsonAsync<ApiResponse<CatalogStatsOverviewDto>>(
            $"/api/v1/stores/catalog-stats?days={days}", ApiResponse.Json);
        response!.Succeeded.Should().BeTrue();
        return response.Data!;
    }

    private async Task SeedEventAsync(WebCatalogSeed.StoreFixture fixture, DateTime occurredAt,
        string sessionHash)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<CatalogEvent>().Add(CatalogEvent.Create(
            fixture.StoreId,
            fixture.TenantId,
            occurredAt,
            CatalogEventType.PageView,
            visitorHash: $"v-{sessionHash}",
            sessionHash,
            path: $"/catalog/{fixture.Slug}",
            productId: null,
            CatalogSource.Direct,
            referrerHost: null,
            utmSource: null,
            utmMedium: null,
            utmCampaign: null,
            CatalogDeviceType.Desktop));
        await db.SaveChangesAsync();
    }

    private async Task SeedOrderAsync(WebCatalogSeed.StoreFixture fixture, OrderType type)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<Order>().Add(Order.Create(
            fixture.StoreId,
            type,
            description: "e2e-catalog-overview",
            total: 50m,
            itemsCount: 1,
            date: DateTime.UtcNow.AddMinutes(-2),
            fixture.TenantId));
        await db.SaveChangesAsync();
    }

    // Los pedidos referencian la tienda: hay que borrarlos ANTES que el grafo de la tienda.
    private async Task DeleteOrdersAsync(params Guid[] storeIds)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Order>().IgnoreQueryFilters()
            .Where(order => storeIds.Contains(order.StoreId))
            .ExecuteDeleteAsync();
    }
}
