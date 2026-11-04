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
/// Unidad 5 — `GET`/`PUT /api/v1/online-ordering/settings`.
///
/// `OrderingSettingsRouteAuthE2ETests` ya fija el gating de la ruta (módulo 19 vs 18) y
/// `StoreCatalogSettingsPartialUpsertE2ETests` la escritura parcial por columnas. Aquí se cierra el
/// CONTRATO de la vista: el alta de la fila, los defaults de una tienda sin configurar, y las dos
/// reglas de negocio del validador que solo existen cuando el interruptor está encendido.
/// </summary>
[Collection("e2e")]
public sealed class OnlineOrderingSettingsE2ETests
{
    private const string SettingsUrl = "/api/v1/online-ordering/settings";

    private readonly AppTestFactory _f;

    public OnlineOrderingSettingsE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientOf(PublicOrderingSeed.OrderingFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    private async Task DeleteSettingsRowAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<StoreCatalogSettings>().IgnoreQueryFilters()
            .Where(settings => settings.StoreId == storeId)
            .ExecuteDeleteAsync();
    }

    [Fact]
    public async Task Get_without_a_row_returns_the_defaults_with_orders_closed()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await DeleteSettingsRowAsync(fixture.StoreId);

            var response = await ClientOf(fixture).GetAsync(SettingsUrl);

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "una tienda sin configurar no es un 404: es una tienda con los pedidos cerrados");
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<StoreCatalogSettingsDto>>(ApiResponse.Json);

            var settings = body!.Data!;
            settings.Enabled.Should().BeFalse("el interruptor lo enciende el dueño");
            settings.PickupEnabled.Should().BeFalse();
            settings.DeliveryEnabled.Should().BeFalse();
            settings.WhatsappNumber.Should().BeNull();
            settings.BusinessHours.Should().BeNull();
            settings.DeliveryZones.Should().BeNull();
            settings.SyncedAt.Should().BeNull();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Put_creates_the_settings_row_and_get_reads_it_back()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await DeleteSettingsRowAsync(fixture.StoreId);

            var client = ClientOf(fixture);
            var response = await client.PutAsJsonAsync(SettingsUrl, new
            {
                enabled = true,
                whatsappNumber = "  +5355551234  ",
                pickupEnabled = true,
                deliveryEnabled = false,
                businessHours = "  Lunes a viernes 9-18  ",
                deliveryZones = "   ",
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<StoreCatalogSettingsDto>>(ApiResponse.Json);

            var saved = body!.Data!;
            saved.Enabled.Should().BeTrue();
            saved.WhatsappNumber.Should().Be("+5355551234",
                "el número se recorta: un espacio rompería el enlace wa.me");
            saved.PickupEnabled.Should().BeTrue();
            saved.DeliveryEnabled.Should().BeFalse();
            saved.BusinessHours.Should().Be("Lunes a viernes 9-18",
                "el texto libre se guarda recortado");
            saved.DeliveryZones.Should().BeNull(
                "un texto en blanco se guarda como null: sin valor, no cadena vacía");
            saved.SyncedAt.Should().NotBeNull("el guardado sella la sincronización");

            // La fila existe UNA vez —el índice único por tienda es el contrato— y no dos: una
            // lectura de "la primera" daría verde con un upsert que hubiera insertado un duplicado.
            (await OrderingQueries.CountSettingsRowsAsync(_f, fixture.StoreId)).Should().Be(1,
                "la configuración es UNA fila por tienda: el índice único sobre StoreId es lo que lo garantiza");

            var row = await OrderingQueries.ReadSettingsRowAsync(_f, fixture.StoreId);
            row.Should().NotBeNull();
            row!.WhatsappNumber.Should().Be("+5355551234");

            var get = await client.GetAsync(SettingsUrl);
            var getBody = await get.Content
                .ReadFromJsonAsync<ApiResponse<StoreCatalogSettingsDto>>(ApiResponse.Json);
            getBody!.Data!.Enabled.Should().BeTrue();
            getBody.Data.PickupEnabled.Should().BeTrue();
            getBody.Data.DeliveryEnabled.Should().BeFalse();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Put_with_orders_enabled_and_no_whatsapp_number_is_rejected()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await DeleteSettingsRowAsync(fixture.StoreId);

            var response = await ClientOf(fixture).PutAsJsonAsync(SettingsUrl, new
            {
                enabled = true,
                whatsappNumber = (string?)null,
                pickupEnabled = true,
                deliveryEnabled = false,
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "todos los pedidos salen por wa.me: sin número no hay a dónde enviarlos");
            (await OrderingQueries.ReadSettingsRowAsync(_f, fixture.StoreId)).Should().BeNull(
                "un guardado rechazado no puede dejar la fila creada");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Put_with_orders_enabled_and_no_delivery_type_is_rejected()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await DeleteSettingsRowAsync(fixture.StoreId);

            var response = await ClientOf(fixture).PutAsJsonAsync(SettingsUrl, new
            {
                enabled = true,
                whatsappNumber = "+5355551234",
                pickupEnabled = false,
                deliveryEnabled = false,
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "un pedido que no se puede recoger ni enviar no lo puede hacer nadie");
            (await OrderingQueries.ReadSettingsRowAsync(_f, fixture.StoreId)).Should().BeNull();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
