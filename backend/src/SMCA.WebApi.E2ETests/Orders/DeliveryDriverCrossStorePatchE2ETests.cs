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
/// S10 — el aislamiento por tienda del PATCH de repartidores, de punta a punta.
///
/// El unitario fija la decisión del handler (`driver.StoreId != storeId` → 404), pero no puede fijar
/// lo que de verdad importa aquí: que la fila AJENA quede intacta en PostgreSQL. Un handler que
/// respondiera 404 después de escribir —o un `GetByIdAsync` sin el filtro de tienda— se vería igual
/// desde el DTO y distinto en la base.
///
/// Las dos tiendas sembradas son del MISMO tenant a propósito: el filtro global de la entidad es por
/// tenant, no por tienda, así que el `FindAsync` del handler sí encuentra la fila ajena y el 404
/// tiene que venir de la comparación de tienda. Con tenants distintos el filtro global ocultaría la
/// fila y el test pasaría por el motivo equivocado, sin probar el aislamiento por tienda.
///
/// El segundo caso es el CONTROL del primero: el mismo cuerpo contra un repartidor PROPIO responde
/// 200 y deja la fila activa. Sin él, un 404 producido por un cuerpo mal formado o por una ruta
/// rota se leería como aislamiento.
///
/// Reutiliza <see cref="PublicOrderingSeed"/> (dueño, tienda, módulos 19/20 — el 20 habilita
/// `OnlineOrdersAdmin`, la feature del catálogo). Los repartidores los siembra este archivo porque el
/// seed compartido no los crea, y se borran en `finally` ANTES de
/// <see cref="PublicOrderingSeed.CleanupAsync"/>: su FK a `Store` es `Restrict` y sobrevivir a la
/// tienda rompería el reset del fixture entero. `Order.DriverId` también es `Restrict`, así que la
/// limpieza suelta primero las asignaciones.
/// </summary>
[Collection("e2e")]
public sealed class DeliveryDriverCrossStorePatchE2ETests
{
    private const string DriversUrl = "/api/v1/delivery-drivers";

    private readonly AppTestFactory _f;

    public DeliveryDriverCrossStorePatchE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>Un repartidor ACTIVO sembrado en la tienda indicada, con nombre y teléfono propios.</summary>
    private async Task<DeliveryDriver> SeedDriverAsync(
        PublicOrderingSeed.OrderingFixture fixture, string name, string phone)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var driver = DeliveryDriver.Create(fixture.StoreId, name, phone, fixture.TenantId);
        db.Set<DeliveryDriver>().Add(driver);
        await db.SaveChangesAsync();

        return driver;
    }

    /// <summary>
    /// La fila REAL, en un scope propio y con `IgnoreQueryFilters`: el contexto del test no lleva
    /// tenant y la entidad tiene filtro global. Sin el bypass la lectura devolvería null y el test
    /// culparía al handler de un problema del filtro.
    /// </summary>
    private async Task<DeliveryDriver?> ReadDriverRowAsync(Guid driverId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<DeliveryDriver>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(driver => driver.Id == driverId);
    }

    /// <summary>
    /// Borra los repartidores de la tienda antes del grafo de la tienda. Primero suelta las
    /// asignaciones de pedidos (`Order.DriverId` es FK `Restrict`): el pedido se conserva y lo borra
    /// <see cref="PublicOrderingSeed.CleanupAsync"/>.
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
    /// PATCH sobre un repartidor de OTRA tienda: 404 y la fila intacta, columna por columna.
    ///
    /// El cuerpo pide el cambio más destructivo posible (nombre, teléfono y baja lógica) para que un
    /// 404 que se hubiera escrito antes de responder se vea en la base.
    /// </summary>
    [Fact]
    public async Task Patch_of_a_driver_from_another_store_is_a_404_and_leaves_the_row_untouched()
    {
        var session = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        DeliveryDriver foreign = await SeedDriverAsync(other, "Repartidor Ajeno", "+5359998888");

        try
        {
            // Precondición: la fila ajena está activa y con sus valores. Sin esto, "quedó igual" no
            // distingue nada de un seed que nunca escribió.
            var before = await ReadDriverRowAsync(foreign.Id);
            before.Should().NotBeNull();
            before!.Name.Should().Be("Repartidor Ajeno");
            before.IsActive.Should().BeTrue();

            var client = DbTestHelpers.AuthedClient(_f, session.UserId, session.Login);

            var patch = await client.PatchAsJsonAsync(
                $"{DriversUrl}/{foreign.Id}",
                new { name = "Secuestrado", phone = "+5350000001", isActive = false });

            patch.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "un repartidor de otra tienda no existe desde esta sesión");

            var after = await ReadDriverRowAsync(foreign.Id);
            after.Should().NotBeNull("el 404 no puede borrar la fila ajena");
            after!.Name.Should().Be("Repartidor Ajeno", "un 404 no puede escribir el nombre");
            after.Phone.Should().Be("+5359998888", "un 404 no puede escribir el teléfono");
            after.IsActive.Should().BeTrue("un 404 no puede dar de baja a un repartidor ajeno");
        }
        finally
        {
            try
            {
                await DeleteDriversAsync(session.StoreId);
                await DeleteDriversAsync(other.StoreId);
            }
            finally
            {
                await PublicOrderingSeed.CleanupAsync(_f, session);
                await PublicOrderingSeed.CleanupAsync(_f, other);
            }
        }
    }

    /// <summary>
    /// Control positivo: el MISMO cuerpo, contra un repartidor de la tienda de la sesión, responde
    /// 200 y escribe. Además fija lo que el PATCH parcial garantiza: sin `isActive` en el cuerpo el
    /// repartidor no se da de baja, así que sigue saliendo en la lista de asignación.
    /// </summary>
    [Fact]
    public async Task Patch_of_an_own_driver_without_isActive_writes_and_keeps_it_active()
    {
        var session = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        DeliveryDriver own = await SeedDriverAsync(session, "Repartidor Propio", "+5351110000");

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, session.UserId, session.Login);

            var patch = await client.PatchAsJsonAsync(
                $"{DriversUrl}/{own.Id}",
                new { name = "Propio Actualizado", phone = "+5351110001" });

            patch.StatusCode.Should().Be(HttpStatusCode.OK,
                "el repartidor es de la tienda de la sesión");

            var body = await patch.Content
                .ReadFromJsonAsync<ApiResponse<DeliveryDriverDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Name.Should().Be("Propio Actualizado");
            body.Data.IsActive.Should().BeTrue();

            var row = await ReadDriverRowAsync(own.Id);
            row.Should().NotBeNull();
            row!.Name.Should().Be("Propio Actualizado");
            row.Phone.Should().Be("+5351110001");
            row.IsActive.Should().BeTrue("omitir isActive no puede dar de baja al repartidor");

            // La tienda de la fila no se mueve: el cuerpo no la lleva y el PATCH parcial no la escribe.
            row.StoreId.Should().Be(session.StoreId);
        }
        finally
        {
            try
            {
                await DeleteDriversAsync(session.StoreId);
                await DeleteDriversAsync(other.StoreId);
            }
            finally
            {
                await PublicOrderingSeed.CleanupAsync(_f, session);
                await PublicOrderingSeed.CleanupAsync(_f, other);
            }
        }
    }
}
