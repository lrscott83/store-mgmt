using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Domain.Entities.DeliveryDrivers;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Unidad 7 — `POST /api/v1/delivery-drivers`.
///
/// El `GET` y el `PATCH` ya están cubiertos por
/// <see cref="DeliveryDriverPartialUpdateE2ETests"/>; aquí se cierra el alta, que no tenía E2E.
///
/// Lo que solo se ve de punta a punta: la tienda y el tenant salen del CONTEXTO (el cuerpo no los
/// puede elegir), los valores se recortan antes de persistir, el repartidor nace activo, y la
/// feature `OnlineOrdersAdmin` es la que abre la ruta.
/// </summary>
[Collection("e2e")]
public sealed class DeliveryDriverCreateE2ETests
{
    private const string DriversUrl = "/api/v1/delivery-drivers";

    private readonly AppTestFactory _f;

    public DeliveryDriverCreateE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task<List<DeliveryDriver>> ReadDriversAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<DeliveryDriver>().IgnoreQueryFilters().AsNoTracking()
            .Where(driver => driver.StoreId == storeId)
            .ToListAsync();
    }

    /// <summary>
    /// `DeliveryDriver` tiene FK `Restrict` a `Store`: los repartidores se borran antes del grafo de
    /// la tienda o la limpieza revienta y contamina la corrida siguiente del fixture.
    /// </summary>
    private async Task DeleteDriversAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<DeliveryDriver>().IgnoreQueryFilters()
            .Where(driver => driver.StoreId == storeId)
            .ExecuteDeleteAsync();
    }

    [Fact]
    public async Task Post_creates_an_active_driver_of_the_session_store()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var response = await client.PostAsJsonAsync(DriversUrl, new
            {
                name = "  Ana Repartidora  ",
                phone = "  +5351112222  ",
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<DeliveryDriverDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var driver = body.Data!;
            driver.StoreId.Should().Be(fixture.StoreId,
                "la tienda sale del contexto de la sesión, no del cuerpo");
            driver.Name.Should().Be("Ana Repartidora", "el alta recorta el nombre antes de guardar");
            driver.Phone.Should().Be("+5351112222", "el alta recorta el teléfono antes de guardar");
            driver.IsActive.Should().BeTrue("un repartidor recién dado de alta nace activo");

            var rows = await ReadDriversAsync(fixture.StoreId);
            rows.Should().ContainSingle(row => row.Id == driver.Id);
            rows[0].Name.Should().Be("Ana Repartidora");
            rows[0].Phone.Should().Be("+5351112222");
            rows[0].IsActive.Should().BeTrue();
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

    [Fact]
    public async Task Post_ignores_a_store_id_sent_in_the_body()
    {
        var target = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, target.UserId, target.Login);

            var response = await client.PostAsJsonAsync(DriversUrl, new
            {
                name = "Repartidor Ajeno",
                phone = "+5359998888",
                storeId = other.StoreId,
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<DeliveryDriverDto>>(ApiResponse.Json);

            body!.Data!.StoreId.Should().Be(target.StoreId,
                "aceptar el storeId del cuerpo dejaría crear repartidores en otra tienda");
            (await ReadDriversAsync(other.StoreId)).Should().BeEmpty(
                "la tienda del cuerpo no puede recibir filas");
        }
        finally
        {
            try
            {
                await DeleteDriversAsync(target.StoreId);
            }
            finally
            {
                await PublicOrderingSeed.CleanupAsync(_f, target);
                await PublicOrderingSeed.CleanupAsync(_f, other);
            }
        }
    }

    [Fact]
    public async Task Post_is_rejected_for_an_anonymous_caller()
    {
        var response = await _f.CreateClient().PostAsJsonAsync(DriversUrl, new
        {
            name = "Anónimo",
            phone = "+5350000000",
        });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "el catálogo de repartidores es una capacidad de la tienda, no un recurso público");
    }

    [Fact]
    public async Task Post_with_an_empty_name_is_rejected_without_persisting()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);

            var response = await client.PostAsJsonAsync(DriversUrl, new
            {
                name = "   ",
                phone = "+5351112222",
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await ReadDriversAsync(fixture.StoreId)).Should().BeEmpty(
                "un alta rechazada no puede dejar fila");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    [Fact]
    public async Task Post_with_a_name_longer_than_the_column_is_rejected_with_a_400()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            string tooLong = new string('a', CreateDeliveryDriverCommand.NameMaxLength + 1);

            var response = await client.PostAsJsonAsync(DriversUrl, new
            {
                name = tooLong,
                phone = "+5351112222",
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "el validador convierte el desborde de columna en 400, no en 500");
            (await ReadDriversAsync(fixture.StoreId)).Should().BeEmpty();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }

    /// <summary>
    /// El lado ACEPTADO del límite. Sin este caso, un validador que rechazara exactamente
    /// `NameMaxLength`/`PhoneMaxLength` pasaría toda la suite y rompería entradas que hoy son
    /// válidas. Se afirman las longitudes persistidas, no solo el 200.
    /// </summary>
    [Fact]
    public async Task Post_accepts_values_exactly_at_the_column_limits()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            string nameAtLimit = new string('a', CreateDeliveryDriverCommand.NameMaxLength);
            string phoneAtLimit = "+" + new string('1', CreateDeliveryDriverCommand.PhoneMaxLength - 1);

            var response = await client.PostAsJsonAsync(DriversUrl, new
            {
                name = nameAtLimit,
                phone = phoneAtLimit,
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "el límite es inclusivo: el valor igual al máximo cabe en la columna");

            var rows = await ReadDriversAsync(fixture.StoreId);
            rows.Should().ContainSingle();
            rows[0].Name.Should().HaveLength(CreateDeliveryDriverCommand.NameMaxLength);
            rows[0].Phone.Should().HaveLength(CreateDeliveryDriverCommand.PhoneMaxLength);
        }
        finally
        {
            // El alta SÍ creó fila: hay que borrarla antes del grafo de la tienda (FK `Restrict`).
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

    [Fact]
    public async Task Post_rejects_a_phone_longer_than_the_column()
    {
        var fixture = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, fixture.UserId, fixture.Login);
            string tooLong = "+" + new string('1', CreateDeliveryDriverCommand.PhoneMaxLength);

            var response = await client.PostAsJsonAsync(DriversUrl, new
            {
                name = "Ana Repartidora",
                phone = tooLong,
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "un teléfono más largo que la columna es un 400, no un 500 del INSERT");
            (await ReadDriversAsync(fixture.StoreId)).Should().BeEmpty();
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, fixture);
        }
    }
}
