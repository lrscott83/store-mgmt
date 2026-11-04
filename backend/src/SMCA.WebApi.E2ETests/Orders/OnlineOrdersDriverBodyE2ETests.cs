using System.Net;
using System.Net.Http.Json;
using System.Text;
using Application.Dtos.OnlineOrdering;
using Domain.Entities.DeliveryDrivers;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Unidad — contrato del cuerpo de `PATCH /api/v1/online-orders/{id}/driver` (S3, hallazgo 6.4) y
/// tope del término de búsqueda (S2, hallazgo 6.3), sobre PostgreSQL real.
///
/// El cuerpo se prueba con JSON CRUDO a propósito: el punto del hallazgo es distinguir "la
/// propiedad NO vino" de "vino con null", y un objeto anónimo de C# con `driverId = null` no puede
/// expresar la diferencia —siempre la nombra—, así que solo `{}` literal reproduce el caso. Con el
/// comando como cuerpo, `{}` desasignaba al repartidor y respondía 200.
/// </summary>
[Collection("e2e")]
public sealed class OnlineOrdersDriverBodyE2ETests
{
    private const string OrdersUrl = "/api/v1/online-orders";

    private readonly AppTestFactory _f;

    public OnlineOrdersDriverBodyE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private HttpClient ClientOf(PublicOrderingSeed.OrderingFixture fixture)
        => DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

    /// <summary>
    /// Suelta las asignaciones y borra los repartidores de la tienda antes del grafo: `Order.DriverId`
    /// y `DeliveryDriver.StoreId` son FK `Restrict`. Es la misma secuencia que usan los E2E de
    /// gestión de pedidos; se repite aquí porque esos archivos no se tocan.
    /// </summary>
    private async Task DeleteDriversAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<Order>().IgnoreQueryFilters()
            .Where(order => order.StoreId == storeId && order.DriverId != null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(order => order.DriverId, (Guid?)null));

        await db.Set<DeliveryDriver>().IgnoreQueryFilters()
            .Where(driver => driver.StoreId == storeId)
            .ExecuteDeleteAsync();
    }

    /// <summary>Alta de un repartidor activo de la tienda sembrada y su id.</summary>
    private async Task<Guid> SeedDriverAsync(PublicOrderingSeed.OrderingFixture fixture)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var driver = DeliveryDriver.Create(
            fixture.StoreId, $"Repartidor E2E {Guid.NewGuid():N}", "+5351110000", fixture.TenantId);
        db.Set<DeliveryDriver>().Add(driver);
        await db.SaveChangesAsync();

        return driver.Id;
    }

    private static StringContent RawJson(string json)
        => new(json, Encoding.UTF8, "application/json");

    /// <summary>
    /// El caso del hallazgo: `{}` —el cuerpo de un cliente que olvidó el campo— es un 400 y NO
    /// desasigna. Antes desasignaba en silencio, borrando una asignación que nadie pidió borrar.
    /// </summary>
    [Fact]
    public async Task Patch_driver_with_an_empty_body_returns_400_and_keeps_the_driver()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Guid driverId = await SeedDriverAsync(fixture);
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EEMPTYBODY");
            var client = ClientOf(fixture);

            (await client.PatchAsJsonAsync($"{OrdersUrl}/{order.Id}/driver", new { driverId }))
                .StatusCode.Should().Be(HttpStatusCode.OK, "la asignación previa tiene que existir");

            var response = await client.PatchAsync($"{OrdersUrl}/{order.Id}/driver", RawJson("{}"));

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "`driverId` es obligatorio en el JSON: `{}` es un olvido, no una desasignación");
            (await OrderingQueries.ReadOrderRowAsync(_f, order.Id))!.DriverId.Should().Be(driverId,
                "el intento rechazado no puede borrar la asignación vigente");
        }
        finally
        {
            await DeleteDriversAsync(fixture.StoreId);
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// Desasignar sigue siendo una operación válida: `{"driverId": null}` es una INTENCIÓN explícita
    /// y responde 200 dejando el pedido sin repartidor.
    /// </summary>
    [Fact]
    public async Task Patch_driver_with_an_explicit_null_unassigns_and_returns_200()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Guid driverId = await SeedDriverAsync(fixture);
            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ENULLBODY");
            var client = ClientOf(fixture);

            (await client.PatchAsJsonAsync($"{OrdersUrl}/{order.Id}/driver", new { driverId }))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            var response = await client.PatchAsync(
                $"{OrdersUrl}/{order.Id}/driver", RawJson("{\"driverId\": null}"));

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "`null` explícito es el contrato documentado de desasignar");
            (await OrderingQueries.ReadOrderRowAsync(_f, order.Id))!.DriverId.Should().BeNull();
        }
        finally
        {
            await DeleteDriversAsync(fixture.StoreId);
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// El término desmedido se rechaza ANTES de llegar a la base (S2): 65 caracteres son 400, y 64
    /// siguen siendo una búsqueda válida. Los dos lados del límite se fijan porque un `>=` en vez de
    /// `>` pasaría un test que solo probara un término enorme.
    /// </summary>
    [Fact]
    public async Task List_with_a_search_term_of_sixty_five_characters_returns_400()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2ELONGTERM");

            var response = await ClientOf(fixture)
                .GetAsync($"{OrdersUrl}?search={new string('a', 65)}");

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "un `LIKE '%…%'` de 65 caracteres sobre el histórico entero es coste sin respuesta");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task List_with_a_search_term_of_sixty_four_characters_returns_200()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EMAXTERM");

            var response = await ClientOf(fixture)
                .GetAsync($"{OrdersUrl}?search={new string('a', 64)}");

            response.StatusCode.Should().Be(HttpStatusCode.OK, "64 es el límite y sigue siendo válido");

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);
            body!.Data!.Total.Should().Be(0, "ningún código ni teléfono de la tienda contiene ese término");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
