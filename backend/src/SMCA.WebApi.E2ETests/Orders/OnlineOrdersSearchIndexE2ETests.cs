using System.Net;
using System.Net.Http.Json;
using Application.Dtos.OnlineOrdering;
using Domain.Entities.Orders;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Orders;

/// <summary>
/// Unidad T3 — lo que la búsqueda del listado tiene que seguir devolviendo después de que la
/// migración `Add-Order-Search-Indexes` ponga los índices que la sostienen (S14): GIN con
/// `pg_trgm` sobre `Order."Code"`/`Order."CustomerPhone"` y el compuesto `(StoreId, Date)` del
/// orden.
///
/// Un índice NO cambia lo que la consulta devuelve, así que aquí no se introspecciona el plan: se
/// fija el CONTRATO observable —coincidencia por SUBCADENA en el teléfono y en el código público,
/// siempre dentro de la tienda de la sesión— para que cualquier cambio futuro en el predicado
/// (por ejemplo pasar de `Contains` a un prefijo, o perder el `storeId`) rompa un test en vez de
/// dejar los índices sirviendo a una consulta que ya no existe.
///
/// No repite `OnlineOrdersManagementE2ETests`: allí el `search` se contrasta contra el código y el
/// teléfono sembrado es el mismo para toda la tienda; aquí cada pedido lleva un teléfono propio,
/// que es lo único que distingue "filtró por el término" de "devolvió la tienda entera".
/// </summary>
[Collection("e2e")]
public sealed class OnlineOrdersSearchIndexE2ETests
{
    private const string OrdersUrl = "/api/v1/online-orders";

    /// <summary>
    /// Subcadena que comparten el pedido buscado de la tienda de la sesión y el pedido de la OTRA
    /// tienda. Compartirla es deliberado: si la búsqueda dejara de acotar por tienda, el pedido
    /// ajeno aparecería y el test fallaría.
    /// </summary>
    private const string SharedPhoneTerm = "7800";

    private readonly AppTestFactory _f;

    public OnlineOrdersSearchIndexE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// El helper de siembra crea todos los pedidos de una tienda con el mismo teléfono, que es
    /// justo lo que no sirve para probar un filtro por teléfono. Este paso le da a UN pedido su
    /// propio número, con el formato que usa la operación real (espacios incluidos): la búsqueda
    /// tiene que encontrar la subcadena sin normalizar nada.
    /// </summary>
    private async Task SetCustomerPhoneAsync(Guid orderId, string phone)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Set<Order>().IgnoreQueryFilters()
            .Where(order => order.Id == orderId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(order => order.CustomerPhone, phone));
    }

    [Fact]
    public async Task Search_by_a_phone_substring_returns_only_the_matching_order_of_the_session_store()
    {
        var mine = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            Order matching = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, mine, "E2ETRGMA1");
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, mine, "E2ETRGMB2");
            Order foreign = await PublicOrderingSeed.SeedOnlineOrderAsync(_f, other, "E2ETRGMB3");

            await SetCustomerPhoneAsync(matching.Id, "+53 7800 1234");
            await SetCustomerPhoneAsync(foreign.Id, "+53 7800 9999");

            var response = await DbTestHelpers
                .AuthedClient(_f, mine.UserId, mine.Login)
                .GetAsync($"{OrdersUrl}?search={SharedPhoneTerm}");

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);

            body!.Succeeded.Should().BeTrue();
            body.Data!.Total.Should().Be(1,
                "el término es una SUBcadena del teléfono de un solo pedido de la tienda");
            body.Data.Items.Should().ContainSingle();
            body.Data.Items[0].Code.Should().Be("E2ETRGMA1");
            body.Data.Items[0].CustomerPhone.Should().Be("+53 7800 1234");
            body.Data.Items.Should().NotContain(item => item.Code == "E2ETRGMB3",
                "el pedido de la otra tienda comparte la subcadena y aun así no se ve");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, mine);
            await PublicOrderingSeed.CleanupAsync(_f, other);
        }
    }

    [Fact]
    public async Task Search_by_a_code_substring_returns_only_the_matching_order_of_the_session_store()
    {
        var mine = await PublicOrderingSeed.SeedAsync(_f);
        var other = await PublicOrderingSeed.SeedAsync(_f);
        try
        {
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, mine, "E2ETRGMA1");
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, mine, "E2ETRGMB2");
            await PublicOrderingSeed.SeedOnlineOrderAsync(_f, other, "E2ETRGMB3");

            var response = await DbTestHelpers
                .AuthedClient(_f, mine.UserId, mine.Login)
                .GetAsync($"{OrdersUrl}?search=TRGMB");

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<OnlineOrderPageDto>>(ApiResponse.Json);

            body!.Data!.Total.Should().Be(1,
                "`TRGMB` es una subcadena del código de un solo pedido de la tienda");
            body.Data.Items.Should().ContainSingle();
            body.Data.Items[0].Code.Should().Be("E2ETRGMB2");
            body.Data.Items.Should().NotContain(item => item.Code == "E2ETRGMB3",
                "el código de la otra tienda también contiene el término y no puede aparecer");
        }
        finally
        {
            await PublicOrderingSeed.CleanupAsync(_f, mine);
            await PublicOrderingSeed.CleanupAsync(_f, other);
        }
    }
}
