using System.Net;
using System.Net.Http.Json;
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
/// P0-3 — un `PATCH /api/v1/delivery-drivers/{id}` que NO manda `isActive` no puede dar de baja
/// al repartidor.
///
/// El modo de fallo era de BINDING, y por eso solo se puede fijar de punta a punta: `IsActive`
/// era un `bool` no nulable, así que un campo omitido aterrizaba en el handler como `false` —el
/// valor por defecto— y el handler escribía ese `false` en la fila. Un PATCH parcial que solo
/// corregía el nombre apagaba al repartidor, lo sacaba de la lista de asignación y el 200 decía
/// que todo había ido bien.
///
/// Los unitarios fijan la decisión del handler, pero no el binding real de ASP.NET Core ni la
/// columna: aquí la petición entra por la MISMA ruta que el panel, el cuerpo omite el campo de
/// verdad y se afirma la FILA leída de PostgreSQL (con `IgnoreQueryFilters`, porque el contexto
/// del test no lleva tenant). La segunda mitad del interruptor —`isActive: false` sí da de
/// baja— se prueba para que "omitir no cambia nada" no se pueda implementar como "no escribir
/// nunca".
///
/// Reutiliza <see cref="PublicOrderingSeed"/>: ya crea el `OwnerAdmin`, la tienda seleccionada y
/// los módulos 19 y 20; el 20 (`GestionPedidos`) es el que habilita `OnlineOrdersAdmin`, la
/// feature del catálogo de repartidores. El repartidor lo siembra este archivo porque el seed
/// compartido no lo crea. El borrado va en `finally` y los `DeliveryDriver` se borran ANTES de
/// <see cref="PublicOrderingSeed.CleanupAsync"/>: su FK a `Store` es `Restrict` y, si sobreviven
/// a la tienda, bloquean el reset del fixture entero.
/// </summary>
[Collection("e2e")]
public sealed class DeliveryDriverPartialUpdateE2ETests
{
    private const string DriversUrl = "/api/v1/delivery-drivers";

    private readonly AppTestFactory _f;

    public DeliveryDriverPartialUpdateE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>Sembrado dueño/tienda/módulos + un repartidor ACTIVO propio de esta corrida.</summary>
    private async Task<(PublicOrderingSeed.OrderingFixture Fixture, DeliveryDriver Driver)> SeedDriverAsync()
    {
        PublicOrderingSeed.OrderingFixture fixture = await PublicOrderingSeed.SeedAsync(_f);

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var driver = DeliveryDriver.Create(
            fixture.StoreId, $"Repartidor E2E {Guid.NewGuid():N}", "+5351111111", fixture.TenantId);
        driver.IsActive = true;
        db.Set<DeliveryDriver>().Add(driver);
        await db.SaveChangesAsync();

        return (fixture, driver);
    }

    /// <summary>
    /// La fila REAL, en un scope propio y con `IgnoreQueryFilters`: el contexto del test no lleva
    /// tenant en el contexto y `DeliveryDriver` tiene filtro global. Sin el bypass la lectura
    /// devolvería null y el test culparía al guardado de un problema del filtro.
    /// </summary>
    private async Task<DeliveryDriver?> ReadDriverRowAsync(Guid driverId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<DeliveryDriver>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(driver => driver.Id == driverId);
    }

    /// <summary>La lista tal como la ve la vista, por la ruta real.</summary>
    private async Task<List<DeliveryDriverDto>> ListDriversAsync(HttpClient client, bool activeOnly)
    {
        var response = await client.GetAsync($"{DriversUrl}?activeOnly={activeOnly}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content
            .ReadFromJsonAsync<ApiResponse<List<DeliveryDriverDto>>>(ApiResponse.Json);

        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    /// <summary>
    /// Borra SOLO los repartidores que sembró este test, antes del grafo de la tienda. Primero
    /// suelta la asignación de los pedidos de la tienda: `Order.DriverId` es FK `Restrict`, así que
    /// borrar un repartidor asignado REVIENTA el DELETE —y con él la limpieza de la tienda, que el
    /// fixture de la suite necesita—. El pedido se conserva; lo borra `CleanupAsync`.
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

    /// <summary>
    /// (a) El caso del P0: el cuerpo lleva SOLO nombre y teléfono. El 200 no basta —se afirma la
    /// columna y las dos listas—, porque un handler que guardara `false` también respondería 200.
    /// El repartidor sigue activo, sigue saliendo en la lista por defecto (la de asignación) y
    /// sigue siendo asignable a un pedido por la ruta de F5.
    /// </summary>
    [Fact]
    public async Task Patch_without_isActive_keeps_the_driver_active_and_assignable()
    {
        var (fixture, driver) = await SeedDriverAsync();

        try
        {
            // Precondición: nace activo. Sin esto, "siguió activo" no distinguiría nada.
            (await ReadDriverRowAsync(driver.Id))!.IsActive.Should().BeTrue();

            Order order = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, fixture, "E2EDRIVER1");

            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            // OJO: no hay `isActive` en el cuerpo — es el disparador exacto del bug.
            var patch = await client.PatchAsJsonAsync(
                $"{DriversUrl}/{driver.Id}",
                new { name = "Ana Actualizada", phone = "+5352222333" });

            patch.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await patch.Content
                .ReadFromJsonAsync<ApiResponse<DeliveryDriverDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Name.Should().Be("Ana Actualizada");
            body.Data.Phone.Should().Be("+5352222333");
            body.Data.IsActive.Should().BeTrue(
                "omitir isActive no puede apagar al repartidor: el cuerpo no lo pidió");

            // La columna, no solo el DTO: con un contexto NoTracking un 200 sin escritura sería
            // un falso verde en la otra dirección, y la lectura del DTO sale del mismo objeto.
            var row = await ReadDriverRowAsync(driver.Id);
            row.Should().NotBeNull();
            row!.Name.Should().Be("Ana Actualizada");
            row.Phone.Should().Be("+5352222333");
            row.IsActive.Should().BeTrue("el PATCH parcial no puede dar de baja al repartidor");

            // Visible donde se asigna: la lista por defecto (solo activos) lo tiene que incluir.
            var active = await ListDriversAsync(client, activeOnly: false);
            active.Should().ContainSingle(d => d.Id == driver.Id && d.IsActive,
                "un repartidor activo tiene que seguir en la lista de asignación");

            // Y con `activeOnly=true` sigue saliendo con su estado intacto.
            var withInactive = await ListDriversAsync(client, activeOnly: true);
            withInactive.Should().ContainSingle(d => d.Id == driver.Id && d.IsActive);

            // "Asignable" se prueba en la ruta que de verdad valida la baja lógica: F5 solo acepta
            // repartidores activos de la tienda.
            var assign = await client.PatchAsJsonAsync(
                $"/api/v1/online-orders/{order.Id}/driver", new { driverId = driver.Id });
            assign.StatusCode.Should().Be(HttpStatusCode.OK,
                "el repartidor sigue activo, así que F5 lo puede asignar");

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var assigned = await db.Set<Order>().IgnoreQueryFilters().AsNoTracking()
                    .SingleAsync(o => o.Id == order.Id);
                assigned.DriverId.Should().Be(driver.Id, "la asignación se persistió de verdad");
            }
        }
        finally
        {
            // El `finally` anidado: si borrar los repartidores fallara, la limpieza del grafo de la
            // tienda tiene que correr igual (si no, el reset del fixture de toda la suite revienta
            // por FK en la corrida siguiente).
            try
            {
                await DeleteDriversAsync(fixture.StoreId);
            }
            finally
            {
                await PublicOrderingSeed.CleanupAsync(_f, fixture);
            }
        }
    }

    /// <summary>
    /// (b) El control positivo del interruptor: `isActive: false` SÍ es una baja lógica. Se afirma
    /// la columna y que el repartidor desaparece de la lista por defecto pero sigue consultable
    /// con `activeOnly=true` (la vista lo necesita para reactivarlo).
    /// </summary>
    [Fact]
    public async Task Patch_with_isActive_false_deactivates_the_driver()
    {
        var (fixture, driver) = await SeedDriverAsync();

        try
        {
            (await ReadDriverRowAsync(driver.Id))!.IsActive.Should().BeTrue();

            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var patch = await client.PatchAsJsonAsync(
                $"{DriversUrl}/{driver.Id}",
                new { name = "Ana de Baja", phone = "+5352222444", isActive = false });

            patch.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await patch.Content
                .ReadFromJsonAsync<ApiResponse<DeliveryDriverDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.IsActive.Should().BeFalse("el cuerpo pidió la baja");

            var row = await ReadDriverRowAsync(driver.Id);
            row.Should().NotBeNull("la baja es LÓGICA: la fila sobrevive");
            row!.IsActive.Should().BeFalse();
            row.Name.Should().Be("Ana de Baja");
            row.Phone.Should().Be("+5352222444");

            // Fuera de la lista por defecto (asignación)...
            var active = await ListDriversAsync(client, activeOnly: false);
            active.Should().NotContain(d => d.Id == driver.Id,
                "un repartidor dado de baja no se ofrece para asignar");

            // ...pero consultable con `activeOnly=true`, que es lo que permite reactivarlo.
            var withInactive = await ListDriversAsync(client, activeOnly: true);
            withInactive.Should().ContainSingle(d => d.Id == driver.Id && !d.IsActive,
                "la vista de repartidores necesita ver los dados de baja para reactivarlos");
        }
        finally
        {
            try
            {
                await DeleteDriversAsync(fixture.StoreId);
            }
            finally
            {
                await PublicOrderingSeed.CleanupAsync(_f, fixture);
            }
        }
    }
}
