using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Domain.Entities.StoreCatalogSettings;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Unidad 8 — `GET /api/v1/public/ordering/{storeSlug}/config` (anónimo).
///
/// El endpoint es la puerta de entrada del carrito, y lo que no se puede probar con mocks es que
/// las lecturas PÚBLICAS salten el filtro global por tenant: una petición anónima no tiene tenant
/// en el contexto, así que con la lectura de sesión los flags saldrían siempre en false y el
/// storefront cerraría el carrito de una tienda que sí lo compró, sin error ni aviso.
///
/// Casos:
///   * Tienda con pedidos abiertos → flags de pedido, flags de módulo 19/20 y WhatsApp reales.
///   * Sin fila de configuración / con la fila apagada → 200 con `Enabled=false`, nunca 404.
///   * Slug inexistente → 404 uniforme.
///   * Slug con mayúsculas → 200 (el handler normaliza).
/// </summary>
[Collection("e2e")]
public sealed class PublicOrderingConfigE2ETests
{
    private readonly AppTestFactory _f;

    public PublicOrderingConfigE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private static string ConfigUrl(string slug) => $"/api/v1/public/ordering/{slug}/config";

    private async Task<(HttpStatusCode Status, ApiResponse<PublicOrderingConfigDto>? Body)> GetConfigAsync(string slug)
    {
        var response = await _f.CreateClient().GetAsync(ConfigUrl(slug));
        ApiResponse<PublicOrderingConfigDto>? body = null;

        if (response.IsSuccessStatusCode)
        {
            body = await response.Content
                .ReadFromJsonAsync<ApiResponse<PublicOrderingConfigDto>>(ApiResponse.Json);
        }

        return (response.StatusCode, body);
    }

    /// <summary>
    /// Apaga SOLO el interruptor maestro. Las modalidades se dejan intactas a propósito: así el
    /// test distingue "el handler devuelve la fila apagada" de "el helper apagó también las
    /// modalidades", que es lo que pasaría si esto escribiera dos columnas.
    /// </summary>
    private async Task CloseOrdersAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .Where(settings => settings.StoreId == storeId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(settings => settings.Enabled, false));
    }

    [Fact]
    public async Task Config_of_a_store_with_orders_open_exposes_the_flags_and_the_whatsapp_number()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var (status, body) = await GetConfigAsync(fixture.Slug);

            status.Should().Be(HttpStatusCode.OK);
            body!.Succeeded.Should().BeTrue();

            var config = body.Data!;
            config.Enabled.Should().BeTrue("la fila sembrada tiene los pedidos abiertos");
            config.PickupEnabled.Should().BeTrue();
            config.DeliveryEnabled.Should().BeTrue();
            config.PedidosWhatsAppEnabled.Should().BeTrue(
                "la tienda tiene la fila del módulo 19: sin este flag el storefront no ofrece carrito");
            config.GestionPedidosEnabled.Should().BeTrue(
                "la tienda tiene la fila del módulo 20");
            config.WhatsappNumber.Should().Be("+5355555555",
                "el número de contacto del negocio viaja aquí para poder armar el wa.me");
            config.TemplateId.Should().Be(StoreCatalogSettings.DefaultTemplateId,
                "sin plantilla elegida el storefront pinta la de siempre");
            config.PaletteId.Should().Be(StoreCatalogSettings.DefaultPaletteId);
            config.MobileColumns.Should().Be(StoreCatalogSettings.DefaultMobileColumns);
            config.LogoUrl.Should().BeNull("la tienda no configuró logo");
            config.BannerUrl.Should().BeNull("la tienda no configuró banner");
            config.CarouselImages.Should().BeEmpty();
            config.DailyImages.Should().BeEmpty();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Config_of_a_store_with_orders_closed_is_still_a_200_with_enabled_false()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await CloseOrdersAsync(fixture.StoreId);

            var (status, body) = await GetConfigAsync(fixture.Slug);

            status.Should().Be(HttpStatusCode.OK,
                "una tienda que apagó los pedidos sigue existiendo: no es un 404");
            body!.Data!.Enabled.Should().BeFalse("el interruptor lo apagó el dueño");
            body.Data.PickupEnabled.Should().BeTrue(
                "apagar el interruptor maestro no cambia las modalidades: el helper solo tocó `Enabled`");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Config_of_an_unknown_slug_returns_the_uniform_404()
    {
        var (status, body) = await GetConfigAsync($"no-existe-{Guid.NewGuid():N}");

        status.Should().Be(HttpStatusCode.NotFound);
        body.Should().BeNull("un 404 no devuelve sobre de éxito");
    }

    [Fact]
    public async Task Config_resolves_the_slug_case_insensitively()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var (status, body) = await GetConfigAsync(fixture.Slug.ToUpperInvariant());

            status.Should().Be(HttpStatusCode.OK,
                "el slug de la ruta se normaliza a minúsculas antes de resolver la tienda");
            body!.Data!.Enabled.Should().BeTrue();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
